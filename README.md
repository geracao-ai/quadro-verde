# Quadro Verde

https://geracao-ai.github.io/quadro-verde

Um quadro verde para desenhar a giz, feito só com HTML, CSS e JavaScript puro (sem build e sem dependências). Funciona com mouse, toque e caneta, e o desenho pode ser compartilhado por link.

## Como usar

- **Desenhar:** clique/toque e arraste sobre o quadro.
- **Zoom:** roda do mouse, pinça no celular/trackpad, ou os botões `−`, `100%` e `+` no canto inferior direito.
- **Mover o quadro:** botão da mão (✋) e arrastar, ou segurar `espaço` (ou o botão do meio do mouse) e arrastar. Com dois dedos, arraste e faça pinça ao mesmo tempo.
- **Limpar:** botão "Limpar" (pede confirmação). Apaga também o que está salvo.
- **Salvar:** automático no `localStorage` do navegador; ao reabrir a página o desenho volta.
- **Compartilhar:** botão "Compartilhar" copia um link com o desenho dentro. Se a área de transferência não estiver disponível, o link aparece numa caixa para você copiar. Se o link passar de ~8000 caracteres, o app avisa que ele pode não funcionar em alguns apps ou navegadores.
- **Abrir um link compartilhado:** o quadro é carregado a partir do link (tem prioridade sobre o salvo localmente). Se o quadro local estiver vazio ou for idêntico ao do link, nada é perguntado. Se já existir um desenho local diferente, aparece um aviso na própria página (sem `confirm()`, que alguns navegadores embutidos bloqueiam) com os botões "Abrir quadro do link" e "Manter o meu" (Esc também mantém). O link fica na barra de endereço até você decidir; ao manter o seu quadro, um aviso informa que o do link foi ignorado. Links inválidos ou truncados são ignorados com um aviso.

## Como rodar

Abra `index.html` no navegador. Para que a área de transferência e a compressão funcionem de forma completa, prefira servir por `localhost` (ou HTTPS) com qualquer servidor estático, por exemplo:

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

## Formato do hash

O link tem a forma `origem + caminho + #d=<dados>`, e `<dados>` é:

```
<flag><base64url>
```

- `flag`: `z` quando o JSON está comprimido com `CompressionStream('deflate-raw')`; `r` quando está em JSON puro (navegadores sem `CompressionStream`). Ambos são lidos, mas `z` só abre em navegadores com `DecompressionStream`.
- `base64url`: bytes codificados em base64 URL-safe (`-` e `_`, sem `=`).
- O conteúdo (após descomprimir) é um JSON:

```json
{ "v": 1, "c": [camX, camY, escala], "s": [ [x0, y0, dx1, dy1, dx2, dy2, ...], ... ] }
```

  - `v`: versão do formato (1).
  - `c`: câmera como inteiros: `x` e `y` em décimos de unidade de mundo, `escala` em milésimos.
  - `s`: lista de traços. Cada traço é uma lista plana `x0, y0, dx1, dy1, ...`: o primeiro ponto é absoluto e os seguintes são diferenças em relação ao ponto anterior. Todos os valores são inteiros em décimos de unidade de mundo (precisão de 0,1).

Limites ao abrir um link (acima disso o link é rejeitado como inválido): JSON descomprimido de até 2 MB, 200 mil pontos, 20 mil traços e coordenadas de até 10 milhões de unidades de mundo.

Depois de carregar, o app remove o `#d=...` da barra de endereço.

## Arquivos

- `index.html`, `style.css`, `app.js`: todo o app.
