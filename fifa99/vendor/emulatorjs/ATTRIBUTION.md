# Atribuição do runtime vendorizado

Esta pasta contém binários e código de terceiros, baixados de
`https://cdn.emulatorjs.org/stable/data/` (EmulatorJS **4.2.3**, build de
2025-06-14). Nada aqui foi escrito por este projeto; a única modificação foi
*servir os arquivos localmente* em vez de usar o CDN.

| Caminho | Origem | Licença |
|---|---|---|
| `data/loader.js`, `data/emulator.min.js`, `data/emulator.min.css` | EmulatorJS 4.2.3 | GPL-3.0 |
| `data/compression/*` (extract7z, extractzip, libunrar) | EmulatorJS / libarchive.js / libunrar | GPL-3.0 / LGPL-2.1 |
| `data/localization/*.json` | EmulatorJS | GPL-3.0 |
| `data/cores/parallel_n64*-wasm.data` | libretro core `parallel-n64` | GPL-2.0 |
| `data/cores/mupen64plus_next*-wasm.data` | libretro core `mupen64plus_next` | GPL-2.0 |
| `data/cores/reports/*.json` | EmulatorJS (metadados de build do core) | GPL-3.0 |

## Por que GPL importa aqui

O projeto combina código MIT (próprio) com binários GPL-2.0/GPL-3.0. Para
distribuição pública, o conjunto distribuído precisa respeitar a GPL: mantenha
esta atribuição, os arquivos de licença e o acesso ao código-fonte dos
componentes GPL (links abaixo).

* EmulatorJS — https://github.com/EmulatorJS/EmulatorJS (GPL-3.0)
* Cores EmulatorJS (build dos libretro cores) — https://github.com/EmulatorJS/build
* parallel-n64 — https://github.com/libretro/parallel-n64 (GPL-2.0)
* mupen64plus-libretro-nx — https://github.com/libretro/mupen64plus-libretro-nx (GPL-2.0)
* libretro-common — https://github.com/libretro/libretro-common

## Atualizando o runtime

```bash
cd vendor/emulatorjs/data
curl -O https://cdn.emulatorjs.org/stable/data/emulator.min.zip && unzip -o emulator.min.zip
curl -O https://cdn.emulatorjs.org/stable/data/loader.js
curl -O https://cdn.emulatorjs.org/stable/data/version.json
for c in parallel_n64 mupen64plus_next; do
  for v in "" "-thread" "-legacy" "-thread-legacy"; do
    curl -O "https://cdn.emulatorjs.org/stable/data/cores/$c$v-wasm.data"
  done
done
```

Ao trocar de versão, a lista de arquivos em `cores/` pode mudar — o EmulatorJS
escolhe o arquivo por `core + thread? + legacy? + "-wasm.data"`.
