# Pasta de ROMs

Coloque aqui a **sua** copia de `FIFA 99 (USA) (...).z64` (16 MiB) e rode
`npm start`. O app procura, nesta ordem:

1. `roms/fifa99.z64`
2. `roms/FIFA 99 (USA) (En,Fr,De,Es,It,Nl,Pt,Sv).z64`
3. `roms/fifa99.n64`
4. `roms/fifa99.v64`
5. `roms/fifa99.zip`

Se encontrar, valida o header e inicia o jogo automaticamente.
Se nao encontrar, a tela inicial pede o arquivo (seletor ou arrastar/soltar).

> Esta pasta e ignorada pelo git (`.gitignore`): conteudo de jogo nunca vai
> para o repositorio. Use somente um dump feito por voce, do seu proprio cartucho.
