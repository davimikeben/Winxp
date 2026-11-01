/**
 * app.js - Front-end do player WASM de FIFA 99 (Nintendo 64).
 *
 * Estrategia: o nucleo do emulador (EmulatorJS + core mupen64plus_next
 * compilado para WebAssembly) fica vendorizado em vendor/emulatorjs/data.
 * Este arquivo apenas:
 *   1. descobre as capacidades do navegador (WASM, WebGL2, SharedArrayBuffer);
 *   2. valida a ROM N64 escolhida pelo usuario (header, formato, nome interno);
 *   3. configura e inicializa o emulador passando a ROM como File (sem upload).
 */
(function () {
  'use strict';

  var RomUtils = window.RomUtils;

  var CONFIG = {
    // Runtime WASM (EmulatorJS 4.2.3) servido localmente.
    dataPath: 'vendor/emulatorjs/data/',
    // parallel_n64 e o core padrao: foi o que rodou FIFA 99 de forma estavel.
    // mupen64plus_next fica disponivel como alternativa (?core=mupen64plus_next).
    core: 'parallel_n64',
    gameId: 99,
    gameName: 'FIFA 99',
    language: 'pt-BR',
    // Controller Pak (memory pak) no slot 1: o jogo usa para salvar ajustes e
    // temporada. Sem isso ele exibe "No Controller Pak found - data cannot be saved".
    coreOptions: {
      'parallel-n64-pak1': 'memory',
      'mupen64plus-pak1': 'memory'
    },
    // Ordem de busca em roms/ quando o projeto roda via server.js
    autoLoadCandidates: [
      'roms/fifa99.z64',
      'roms/FIFA 99 (USA) (En,Fr,De,Es,It,Nl,Pt,Sv).z64',
      'roms/fifa99.n64',
      'roms/fifa99.v64',
      'roms/fifa99.zip'
    ]
  };

  var state = {
    romFile: null,
    info: null,
    booted: false,
    starting: false,
    autoLoadTried: false
  };

  var caps = {
    wasm: false,
    webgl2: false,
    sharedArrayBuffer: false,
    crossOriginIsolated: false
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message, kind) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.className = 'status' + (kind ? ' status--' + kind : '');
    if (kind === 'error' && window.console) console.error('[fifa99] ' + message);
  }

  /* ------------------------------------------------------------------ *
   * Capacidades do navegador
   * ------------------------------------------------------------------ */

  function detectCapabilities() {
    caps.wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
    caps.sharedArrayBuffer = typeof SharedArrayBuffer === 'function';
    caps.crossOriginIsolated = window.crossOriginIsolated === true;
    try {
      var canvas = document.createElement('canvas');
      caps.webgl2 = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      canvas.width = canvas.height = 0;
    } catch (e) {
      caps.webgl2 = false;
    }
    return caps;
  }

  function chip(el, ok, textOk, textFail) {
    if (!el) return;
    el.textContent = ok ? '\u2714 ' + textOk : '\u26a0 ' + textFail;
    el.className = 'chip ' + (ok ? 'chip--ok' : 'chip--warn');
  }

  function renderCapabilities() {
    chip(els.capWasm, caps.wasm, 'WebAssembly', 'sem WebAssembly');
    chip(els.capGl, caps.webgl2, 'WebGL', 'sem WebGL');
    chip(
      els.capThreads,
      caps.sharedArrayBuffer,
      'threads (multi-core)',
      'single-thread (sem SharedArrayBuffer)'
    );

    if (!caps.sharedArrayBuffer && els.hintThreads) {
      els.hintThreads.hidden = false;
    }

    if (els.footThreads) {
      els.footThreads.textContent =
        'Threads: ' + (caps.sharedArrayBuffer ? 'habilitado' : 'desabilitado');
    }

    if (!caps.wasm || !caps.webgl2) {
      setStatus(
        'Requisitos minimos ausentes (WebAssembly + WebGL). Atualize ou use Chrome/Firefox/Edge recente.',
        'error'
      );
      if (els.btnStart) els.btnStart.disabled = true;
    }
  }

  /* ------------------------------------------------------------------ *
   * Selecao e validacao da ROM
   * ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function romRow(key, value) {
    return (
      '<div class="rom-row"><span class="rom-key">' +
      key +
      '</span><span class="rom-val">' +
      escapeHtml(value) +
      '</span></div>'
    );
  }

  function renderRomInfo(info, file) {
    if (!els.romInfo) return;
    if (!info) {
      els.romInfo.hidden = true;
      return;
    }
    els.romInfo.innerHTML =
      romRow('Arquivo', file.name) +
      romRow('Tamanho', RomUtils.formatBytes(file.size)) +
      romRow('Nome interno', info.imageName || '(vazio)') +
      romRow('Formato', info.formatLabel) +
      romRow('Cart ID', info.cartId || '--') +
      romRow('Regiao', info.region + ' (' + info.regionCode + ')') +
      romRow('Magic', '0x' + info.magic);
    els.romInfo.hidden = false;
  }

  function renderZipInfo(file) {
    if (!els.romInfo) return;
    els.romInfo.innerHTML =
      romRow('Arquivo', file.name) +
      romRow('Tamanho', RomUtils.formatBytes(file.size)) +
      romRow('Pacote', 'ZIP - a ROM sera extraida pelo emulador');
    els.romInfo.hidden = false;
  }

  /**
   * Valida e seleciona um arquivo como ROM (nao inicia o emulador).
   * @param {File} file
   * @returns {Promise<boolean>}
   */
  function selectRom(file) {
    if (!file) return Promise.resolve(false);

    if (!RomUtils.hasRomExtension(file.name)) {
      setStatus(
        'Formato nao suportado: "' + file.name + '". Use .z64, .n64, .v64, .rom ou .zip.',
        'error'
      );
      return Promise.resolve(false);
    }

    state.romFile = file;
    state.info = null;

    return RomUtils.readHead(file, 0x40)
      .then(function (head) {
        if (RomUtils.isZip(head)) {
          // O proprio EmulatorJS extrai .zip/.7z usando data/compression.
          renderZipInfo(file);
          if (els.btnStart) els.btnStart.disabled = false;
          setStatus('Pacote ZIP reconhecido. Clique em Iniciar.', 'ok');
          return true;
        }

        var info = RomUtils.parseHeader(head);
        info.fileName = file.name;

        if (!info.headerValid) {
          setStatus(
            'Isso nao parece uma ROM de Nintendo 64 (magic 0x' +
              info.magic +
              '). Verifique se o download esta completo.',
            'error'
          );
          if (els.romInfo) els.romInfo.hidden = true;
          if (els.btnStart) els.btnStart.disabled = true;
          return false;
        }

        state.info = info;
        renderRomInfo(info, file);
        if (els.btnStart) els.btnStart.disabled = false;

        if (RomUtils.isFifa99(info)) {
          setStatus('ROM FIFA 99 validada. Clique em Iniciar.', 'ok');
        } else {
          setStatus(
            'ROM N64 valida ("' +
              info.imageName +
              '"), mas nao parece ser FIFA 99. Vai rodar mesmo assim.',
            'warn'
          );
        }
        return true;
      })
      .catch(function (err) {
        setStatus('Falha ao ler o arquivo: ' + (err && err.message ? err.message : err), 'error');
        return false;
      });
  }

  /* ------------------------------------------------------------------ *
   * Inicializacao do emulador (EmulatorJS / mupen64plus_next)
   * ------------------------------------------------------------------ */

  /**
   * Decide o modo de execucao do core:
   *   ?threads=1  forca multi-thread (precisa de SharedArrayBuffer)
   *   ?threads=0  forca single-thread (mais lento, porem compativel)
   *   sem parametro: usa threads quando o navegador permite.
   */
  function resolveThreads() {
    var forced = null;
    try {
      forced = new URLSearchParams(window.location.search).get('threads');
    } catch (e) {
      forced = null;
    }
    if (forced === '0') return false;
    if (forced === '1') return caps.sharedArrayBuffer;
    return caps.sharedArrayBuffer;
  }

  /**
   * Nucleo de emulacao. O `mupen64plus_next` e o padrao; o `parallel_n64` e a
   * alternativa para jogos/maquinas em que o primeiro falha com
   * "RuntimeError: memory access out of bounds". Tambem aceita ?core=parallel_n64.
   */
  function resolveCore() {
    var allowed = ['mupen64plus_next', 'parallel_n64'];
    var fromQuery = null;
    try {
      fromQuery = new URLSearchParams(window.location.search).get('core');
    } catch (e) {
      fromQuery = null;
    }
    var chosen = fromQuery || (els.coreSelect && els.coreSelect.value) || CONFIG.core;
    return allowed.indexOf(chosen) === -1 ? CONFIG.core : chosen;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Falha ao carregar ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function enterPlayerMode() {
    document.body.classList.add('is-playing');
    if (els.player) els.player.hidden = false;
    if (els.launcher) els.launcher.hidden = true;
  }

  function exitPlayerMode() {
    document.body.classList.remove('is-playing');
    if (els.launcher) els.launcher.hidden = false;
    if (els.btnSwap) els.btnSwap.hidden = true;
  }

  function startEmulator() {
    if (state.starting) return;
    if (!state.romFile) {
      setStatus('Escolha a ROM antes de iniciar.', 'error');
      return;
    }
    if (!caps.wasm || !caps.webgl2) {
      setStatus('Navegador sem suporte a WebAssembly/WebGL.', 'error');
      return;
    }

    state.starting = true;
    state.booted = true;
    setStatus('Carregando o core mupen64plus_next (WASM)...', 'info');
    enterPlayerMode();

    var threads = resolveThreads();
    var core = resolveCore();
    window.EJS_player = '#game';
    window.EJS_core = core;
    window.EJS_gameUrl = state.romFile; // File object: nada e enviado para servidor
    window.EJS_gameName = CONFIG.gameName;
    window.EJS_gameID = CONFIG.gameId;
    window.EJS_pathtodata = CONFIG.dataPath;
    window.EJS_language = CONFIG.language;
    window.EJS_startOnLoaded = true;
    window.EJS_fullscreenOnLoaded = !!(els.chkFullscreen && els.chkFullscreen.checked);
    window.EJS_threads = threads;
    window.EJS_defaultOptions = CONFIG.coreOptions;
    window.EJS_color = '#0b6b3a';
    window.EJS_backgroundColor = '#05080a';
    window.EJS_alignStartButton = 'center';
    window.EJS_volume = 0.7;
    window.EJS_onGameStart = function () {
      state.starting = false;
      document.body.classList.remove('is-booting');
      if (els.btnSwap) els.btnSwap.hidden = false;
      if (els.btnShot) els.btnShot.hidden = false;
      setStatus('FIFA 99 rodando em WebAssembly.', 'ok');
    };

    loadScript(CONFIG.dataPath + 'loader.js').catch(function (err) {
      state.starting = false;
      exitPlayerMode();
      setStatus(err.message + ' - confira a pasta ' + CONFIG.dataPath, 'error');
    });

    // Se o core demorar muito, avisa o usuario em vez de travar a tela.
    window.setTimeout(function () {
      if (state.starting) {
        setStatus(
          'Ainda carregando o core... (descompactando o WASM local, ~1,5 MB)',
          'info'
        );
      }
    }, 12000);
  }

  /* ------------------------------------------------------------------ *
   * Carregamento automatico a partir de roms/
   * ------------------------------------------------------------------ */

  function probe(url) {
    return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      var type = res.headers.get('content-type') || '';
      // Servidores estaticos costumam devolver 200 + index.html para 404.
      if (!res.ok || type.indexOf('text/html') === 0) return null;
      return url;
    });
  }

  /**
   * Procura uma ROM em roms/ (quando o projeto roda com server.js ou similar)
   * e, se achar, valida e ja inicia o jogo.
   */
  function autoLoadFromServer() {
    if (state.autoLoadTried) return Promise.resolve(false);
    state.autoLoadTried = true;
    var candidates = CONFIG.autoLoadCandidates.slice();

    function next() {
      if (!candidates.length) return Promise.resolve(false);
      var url = candidates.shift();
      return probe(url)
        .catch(function () {
          return null;
        })
        .then(function (found) {
          if (!found) return next();
          setStatus('ROM encontrada em ' + found + '. Carregando...', 'info');
          return fetch(found)
            .then(function (res) {
              return res.blob();
            })
            .then(function (blob) {
              var name = found.split('/').pop();
              var file = new File([blob], name, { type: 'application/octet-stream' });
              return selectRom(file).then(function (ok) {
                if (ok) startEmulator();
                return ok;
              });
            });
        });
    }
    return next();
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */

  function takeScreenshot() {
    var emu = window.EJS_emulator;
    if (!emu || typeof emu.screenshot !== 'function') {
      setStatus('O print fica disponivel depois que o jogo inicia.', 'warn');
      return;
    }
    emu.screenshot(function (blob, ext) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = 'fifa99-' + stamp + '.' + (ext || 'png');
      a.click();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 5000);
    });
  }

  function requestFullscreen() {
    var target = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    if (target.requestFullscreen) {
      target.requestFullscreen().catch(function () {});
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  }

  function wireEvents() {
    if (els.romInput) {
      els.romInput.addEventListener('change', function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (file) selectRom(file);
      });
    }

    if (els.dropzone) {
      var openPicker = function (ev) {
        if (ev) ev.preventDefault();
        if (els.romInput) els.romInput.click();
      };
      els.dropzone.addEventListener('click', openPicker);
      els.dropzone.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') openPicker(ev);
      });
      ['dragenter', 'dragover'].forEach(function (name) {
        els.dropzone.addEventListener(name, function (ev) {
          ev.preventDefault();
          els.dropzone.classList.add('is-over');
        });
      });
      ['dragleave', 'dragend'].forEach(function (name) {
        els.dropzone.addEventListener(name, function () {
          els.dropzone.classList.remove('is-over');
        });
      });
      els.dropzone.addEventListener('drop', function (ev) {
        ev.preventDefault();
        els.dropzone.classList.remove('is-over');
        var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (file) selectRom(file);
      });
    }

    // Soltar o arquivo em qualquer lugar da pagina tambem funciona.
    document.addEventListener('dragover', function (ev) {
      ev.preventDefault();
    });
    document.addEventListener('drop', function (ev) {
      if (document.body.classList.contains('is-playing')) return;
      ev.preventDefault();
      var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) selectRom(file);
    });

    if (els.btnStart) els.btnStart.addEventListener('click', startEmulator);
    if (els.btnFullscreen) els.btnFullscreen.addEventListener('click', requestFullscreen);
    if (els.btnShot) els.btnShot.addEventListener('click', takeScreenshot);
    if (els.btnSwap) {
      els.btnSwap.addEventListener('click', function () {
        if (window.confirm('Recarregar a pagina para escolher outra ROM?')) {
          window.location.reload();
        }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Bootstrap
   * ------------------------------------------------------------------ */

  function init() {
    els = {
      dropzone: $('dropzone'),
      romInput: $('rom-input'),
      romInfo: $('rom-info'),
      status: $('status'),
      btnStart: $('btn-start'),
      btnFullscreen: $('btn-fullscreen'),
      btnShot: $('btn-shot'),
      btnSwap: $('btn-swap'),
      chkFullscreen: $('chk-fullscreen'),
      coreSelect: $('core-select'),
      launcher: $('launcher'),
      player: $('player'),
      capWasm: $('cap-wasm'),
      capGl: $('cap-gl'),
      capThreads: $('cap-threads'),
      hintThreads: $('hint-threads'),
      footThreads: $('foot-threads')
    };

    detectCapabilities();
    renderCapabilities();
    wireEvents();

    if (els.btnStart) els.btnStart.disabled = true;
    if (caps.wasm && caps.webgl2) {
      setStatus('Escolha a ROM (z64/n64/v64) para comecar.', 'info');
      autoLoadFromServer();
    }

    // API para debug e para os testes automatizados.
    window.FIFA99 = {
      config: CONFIG,
      caps: caps,
      state: state,
      selectRom: selectRom,
      start: startEmulator,
      autoLoad: autoLoadFromServer
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
