/**
 * rom.js - Utilitarios de ROM de Nintendo 64.
 *
 * Nao depende de DOM: roda no navegador (window.RomUtils) e no Node
 * (module.exports) para poder ser testado de forma isolada.
 *
 * Referencia do header N64 (Cartridge Header):
 *   0x00 - 0x03  PI BSD Domain 1 register (magic / formato)
 *   0x08 - 0x0B  Endereco de entrada (boot code)
 *   0x20 - 0x33  Nome interno da imagem (20 bytes, ASCII, padding com 0x20)
 *   0x3C - 0x3D  ID do cartucho (ex: "9F")
 *   0x3E         Codigo de regiao (ex: 'E' = USA/NTSC)
 *   0x3F         Versao do cartucho
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RomUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Assinaturas de magic bytes aceitas, na ordem em que sao testadas. */
  var FORMATS = [
    { id: 'z64', label: 'z64 (big-endian, nativo)', magic: [0x80, 0x37, 0x12, 0x40], swap: 0 },
    { id: 'v64', label: 'v64 (byteswapped 16-bit)', magic: [0x37, 0x80, 0x40, 0x12], swap: 2 },
    { id: 'n64', label: 'n64 (little-endian)', magic: [0x40, 0x12, 0x37, 0x80], swap: 4 },
    { id: 'v64w', label: 'v64 (wordswapped)', magic: [0x12, 0x40, 0x80, 0x37], swap: 32 }
  ];

  /** Codigos de regiao do header N64 -> descricao. */
  var REGIONS = {
    A: 'Asia / PAL',
    B: 'Brasil (PAL-M)',
    C: 'China',
    D: 'Alemanha (PAL)',
    E: 'EUA / Canada (NTSC)',
    F: 'Franca (PAL)',
    G: 'Gateway (sem regiao)',
    H: 'Holanda (PAL)',
    I: 'Italia (PAL)',
    J: 'Japao (NTSC)',
    K: 'Coreia (NTSC)',
    L: 'Canada (NTSC)',
    N: 'Canada (NTSC)',
    P: 'Europa (PAL)',
    S: 'Espanha (PAL)',
    U: 'Australia (PAL)',
    W: 'Escandinavia (PAL)',
    X: 'Europa (PAL)',
    Y: 'Europa (PAL)',
    Z: 'Europa (PAL)'
  };

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return out;
  }

  function asBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && typeof input.length === 'number') return new Uint8Array(input);
    return null;
  }

  /**
   * Detecta o formato (ordem de bytes) de uma ROM a partir dos 4 primeiros bytes.
   * @param {Uint8Array|ArrayBuffer} input
   * @returns {{id:string,label:string,swap:number}|null}
   */
  function detectFormat(input) {
    var bytes = asBytes(input);
    if (!bytes || bytes.length < 4) return null;
    for (var i = 0; i < FORMATS.length; i++) {
      var f = FORMATS[i];
      if (
        bytes[0] === f.magic[0] &&
        bytes[1] === f.magic[1] &&
        bytes[2] === f.magic[2] &&
        bytes[3] === f.magic[3]
      ) {
        return f;
      }
    }
    return null;
  }

  /** ZIP local file header ("PK\x03\x04") - alguns packs vem compactados. */
  function isZip(input) {
    var bytes = asBytes(input);
    if (!bytes || bytes.length < 4) return false;
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  function readAscii(bytes, start, end) {
    var out = '';
    for (var i = start; i < end && i < bytes.length; i++) {
      var c = bytes[i];
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out.replace(/\s+$/, '');
  }


  /**
   * Le o header de uma ROM N64.
   * @param {Uint8Array|ArrayBuffer} input precisa ter ao menos 0x40 bytes
   * @returns {{format:string,formatLabel:string,swap:number,magic:string,
   *            imageName:string,cartId:string,regionCode:string,region:string,
   *            version:number,entryPoint:number,headerValid:boolean}}
   */
  function parseHeader(input) {
    var bytes = asBytes(input);
    if (!bytes) throw new TypeError('parseHeader: esperava Uint8Array ou ArrayBuffer');
    if (bytes.length < 0x40) throw new RangeError('parseHeader: precisa de ao menos 64 bytes');
    var format = detectFormat(bytes);
    // Se o formato nao for reconhecido, ainda tentamos ler como z64 para exibir algo.
    var view = !format || format.swap === 0 ? bytes : toZ64(bytes, format.id);
    var regionCode = String.fromCharCode(view[0x3e] || 0);
    return {
      format: format ? format.id : 'desconhecido',
      formatLabel: format ? format.label : 'desconhecido',
      magic: toHex(bytes.subarray(0, 4)),
      imageName: readAscii(view, 0x20, 0x34),
      cartId: readAscii(view, 0x3c, 0x3e),
      regionCode: regionCode,
      region: REGIONS[regionCode] || 'desconhecida',
      version: view[0x3f],
      entryPoint:
        ((view[0x08] << 24) >>> 0) + (view[0x09] << 16) + (view[0x0a] << 8) + view[0x0b],
      headerValid: !!format
    };
  }

  /**
   * Converte qualquer ordem de bytes para z64 (big-endian), que e o formato
   * mais seguro entre os cores libretro/EmulatorJS.
   * @param {Uint8Array|ArrayBuffer} input
   * @param {string} formatId 'z64' | 'v64' | 'n64' | 'v64w'
   * @returns {Uint8Array}
   */
  function toZ64(input, formatId) {
    var bytes = asBytes(input);
    if (!bytes) throw new TypeError('toZ64: esperava Uint8Array ou ArrayBuffer');
    var fmt = null;
    for (var i = 0; i < FORMATS.length; i++) {
      if (FORMATS[i].id === formatId) fmt = FORMATS[i];
    }
    if (!fmt || fmt.swap === 0) return bytes;

    var out = new Uint8Array(bytes.length);
    var len = bytes.length - (bytes.length % 4);
    var i2;
    switch (fmt.swap) {
      case 2: // troca pares de bytes
        for (i2 = 0; i2 + 1 < bytes.length; i2 += 2) {
          out[i2] = bytes[i2 + 1];
          out[i2 + 1] = bytes[i2];
        }
        break;
      case 4: // inverte cada palavra de 32 bits
        for (i2 = 0; i2 < len; i2 += 4) {
          out[i2] = bytes[i2 + 3];
          out[i2 + 1] = bytes[i2 + 2];
          out[i2 + 2] = bytes[i2 + 1];
          out[i2 + 3] = bytes[i2];
        }
        break;
      case 32: // troca as metades de 16 bits de cada palavra
        for (i2 = 0; i2 < len; i2 += 4) {
          out[i2] = bytes[i2 + 2];
          out[i2 + 1] = bytes[i2 + 3];
          out[i2 + 2] = bytes[i2];
          out[i2 + 3] = bytes[i2 + 1];
        }
        break;
    }
    // Preserva eventual resto nao multiplo de 4.
    for (i2 = len; i2 < bytes.length; i2++) out[i2] = bytes[i2];
    return out;
  }

  /** Heuristica: o nome interno ou o nome do arquivo cita "FIFA 99"? */
  function isFifa99(info) {
    var haystack = ((info && info.imageName) || '') + ' ' + ((info && info.fileName) || '');
    return /fifa\s*0?99|fifa99/i.test(haystack);
  }

  /** Extensoes de ROM aceitas pelo seletor de arquivos. */
  var ROM_EXTENSIONS = ['.z64', '.n64', '.v64', '.rom', '.bin', '.zip', '.7z'];

  function hasRomExtension(fileName) {
    var lower = String(fileName || '').toLowerCase();
    for (var i = 0; i < ROM_EXTENSIONS.length; i++) {
      if (lower.slice(-ROM_EXTENSIONS[i].length) === ROM_EXTENSIONS[i]) return true;
    }
    return false;
  }

  /** Formata bytes em unidade legivel (pt-BR, base 1024). */
  function formatBytes(n) {
    if (!n && n !== 0) return '?';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (i === 0 ? String(v) : v.toFixed(2).replace('.', ',')) + ' ' + units[i];
  }

  /**
   * Le os primeiros bytes de um File/Blob sem carregar o arquivo inteiro.
   * @param {File|Blob} file
   * @param {number} [length=64]
   * @returns {Promise<Uint8Array>}
   */
  function readHead(file, length) {
    var size = length || 0x40;
    var slice = file.slice(0, size);
    if (typeof slice.arrayBuffer === 'function') {
      return slice.arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    // Fallback antigo (FileReader)
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Falha ao ler o arquivo'));
      };
      reader.readAsArrayBuffer(slice);
    });
  }

  return {
    FORMATS: FORMATS,
    REGIONS: REGIONS,
    ROM_EXTENSIONS: ROM_EXTENSIONS,
    toHex: toHex,
    detectFormat: detectFormat,
    isZip: isZip,
    parseHeader: parseHeader,
    toZ64: toZ64,
    isFifa99: isFifa99,
    hasRomExtension: hasRomExtension,
    formatBytes: formatBytes,
    readHead: readHead
  };
});
