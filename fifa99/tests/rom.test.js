/**
 * Testes do parser de ROM (js/rom.js).
 * Roda com o test runner nativo do Node: `npm test`.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RomUtils = require('../js/rom.js');

const REAL_ROM = path.join(__dirname, '..', 'roms', 'fifa99.z64');

/** Monta um header N64 sintetico no formato z64. */
function buildHeader(name, cartId, region, version) {
  const buf = new Uint8Array(0x40);
  buf.set([0x80, 0x37, 0x12, 0x40], 0); // magic z64
  buf.set([0x80, 0x00, 0x04, 0x00], 0x08); // entry point 0x80000400
  for (let i = 0; i < name.length && i < 20; i++) {
    buf[0x20 + i] = name.charCodeAt(i);
  }
  buf[0x3c] = cartId.charCodeAt(0);
  buf[0x3d] = cartId.charCodeAt(1);
  buf[0x3e] = region.charCodeAt(0);
  buf[0x3f] = version || 0;
  return buf;
}

test('detectFormat reconhece as tres ordens de bytes classicas', () => {
  assert.equal(RomUtils.detectFormat(new Uint8Array([0x80, 0x37, 0x12, 0x40])).id, 'z64');
  assert.equal(RomUtils.detectFormat(new Uint8Array([0x37, 0x80, 0x40, 0x12])).id, 'v64');
  assert.equal(RomUtils.detectFormat(new Uint8Array([0x40, 0x12, 0x37, 0x80])).id, 'n64');
});

test('detectFormat devolve null para lixo', () => {
  assert.equal(RomUtils.detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null);
  assert.equal(RomUtils.detectFormat(new Uint8Array([1, 2])), null);
  assert.equal(RomUtils.detectFormat(null), null);
});

test('parseHeader le nome interno, cart id e regiao', () => {
  const header = buildHeader('FIFA 99', '9F', 'E', 0);
  const info = RomUtils.parseHeader(header);
  assert.equal(info.format, 'z64');
  assert.equal(info.imageName, 'FIFA 99');
  assert.equal(info.cartId, '9F');
  assert.equal(info.regionCode, 'E');
  assert.equal(info.region, 'EUA / Canada (NTSC)');
  assert.equal(info.entryPoint, 0x80000400);
  assert.equal(info.version, 0);
  assert.equal(info.headerValid, true);
});

test('parseHeader exige pelo menos 64 bytes', () => {
  assert.throws(() => RomUtils.parseHeader(new Uint8Array(10)), RangeError);
});

test('toZ64 converte v64 e n64 de volta para big-endian', () => {
  const z64 = buildHeader('FIFA 99', '9F', 'E', 0);

  // v64: pares de bytes trocados
  const v64 = new Uint8Array(z64.length);
  for (let i = 0; i < z64.length; i += 2) {
    v64[i] = z64[i + 1];
    v64[i + 1] = z64[i];
  }
  assert.equal(RomUtils.detectFormat(v64).id, 'v64');
  assert.deepEqual(RomUtils.toZ64(v64, 'v64'), z64);
  assert.equal(RomUtils.parseHeader(v64).imageName, 'FIFA 99');

  // n64: cada palavra de 32 bits invertida
  const n64 = new Uint8Array(z64.length);
  for (let i = 0; i < z64.length; i += 4) {
    n64[i] = z64[i + 3];
    n64[i + 1] = z64[i + 2];
    n64[i + 2] = z64[i + 1];
    n64[i + 3] = z64[i];
  }
  assert.equal(RomUtils.detectFormat(n64).id, 'n64');
  assert.deepEqual(RomUtils.toZ64(n64, 'n64'), z64);
  assert.equal(RomUtils.parseHeader(n64).imageName, 'FIFA 99');
});

test('toZ64 em z64 devolve os mesmos bytes', () => {
  const z64 = buildHeader('FIFA 99', '9F', 'E', 0);
  const out = RomUtils.toZ64(z64, 'z64');
  assert.equal(out, z64);
});

test('isZip identifica o header PK\\x03\\x04', () => {
  assert.equal(RomUtils.isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(RomUtils.isZip(new Uint8Array([0x80, 0x37, 0x12, 0x40])), false);
});

test('isFifa99 aceita variacoes do nome', () => {
  assert.equal(RomUtils.isFifa99({ imageName: 'FIFA 99' }), true);
  assert.equal(RomUtils.isFifa99({ fileName: 'FIFA 99 (USA).z64' }), true);
  assert.equal(RomUtils.isFifa99({ fileName: 'fifa99.z64' }), true);
  assert.equal(RomUtils.isFifa99({ imageName: 'Super Mario 64' }), false);
});

test('hasRomExtension valida as extensoes aceitas', () => {
  assert.equal(RomUtils.hasRomExtension('FIFA 99 (USA).z64'), true);
  assert.equal(RomUtils.hasRomExtension('game.N64'), true);
  assert.equal(RomUtils.hasRomExtension('game.v64'), true);
  assert.equal(RomUtils.hasRomExtension('game.zip'), true);
  assert.equal(RomUtils.hasRomExtension('foto.jpg'), false);
  assert.equal(RomUtils.hasRomExtension(''), false);
});

test('formatBytes usa virgula decimal em pt-BR', () => {
  assert.equal(RomUtils.formatBytes(16777216), '16,00 MB');
  assert.equal(RomUtils.formatBytes(512), '512 B');
  assert.equal(RomUtils.formatBytes(undefined), '?');
});

test('parseHeader na ROM real (se presente em roms/)', { skip: !fs.existsSync(REAL_ROM) }, () => {
  const fd = fs.openSync(REAL_ROM, 'r');
  const head = Buffer.alloc(0x40);
  fs.readSync(fd, head, 0, 0x40, 0);
  fs.closeSync(fd);

  const info = RomUtils.parseHeader(new Uint8Array(head));
  assert.equal(info.headerValid, true);
  assert.equal(info.format, 'z64');
  assert.equal(info.imageName, 'FIFA 99');
  assert.equal(info.cartId, '9F');
  assert.equal(info.regionCode, 'E');
  assert.equal(RomUtils.isFifa99(info), true);
});
