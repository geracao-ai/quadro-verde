# Quadro Verde

https://geracao-ai.github.io/quadro-verde

Um quadro verde para desenhar a giz, feito só com HTML, CSS e JavaScript puro (sem build e sem dependências). Funciona com mouse, toque e caneta, e o desenho pode ser compartilhado por link.

## Como usar

- **Ferramentas:** barra à esquerda com quatro botões: giz (escrever, padrão), mão (mover o quadro), apagador e tamanho. A ferramenta ativa fica destacada e o cursor muda conforme a ferramenta. Atalhos: `B` ou `G` giz, `H` mão, `E` apagador (não funcionam com foco em campo de texto).
- **Tamanho:** o botão de tamanho (bolinha, 4º da barra) abre um seletor com 5 bolinhas de tamanhos crescentes; ele fecha ao escolher, com `Esc` ou clicando fora (setas movem entre as opções). O tamanho vale para a ferramenta ativa: giz e apagador lembram cada um o seu, e com a mão o botão fica desabilitado. A bolinha do botão mostra o tamanho atual e o círculo do apagador no quadro tem o tamanho do apagador. Os tamanhos escolhidos ficam salvos no `localStorage` (`quadro-verde:sizes`).
  - **Giz:** espessuras de 2, 4 (padrão), 7, 11 e 16 unidades de mundo. Cada traço guarda a sua própria espessura (`width`), então mudar o tamanho não altera o que já foi desenhado, e a espessura escala com o zoom como o resto do desenho.
  - **Apagador:** raios de 8, 16 (padrão), 28, 44 e 64 px **de tela** (constante em relação ao zoom, convertido para mundo pela escala atual). Um traço é atingido quando o círculo chega à sua borda, isto é, a distância até a linha é no máximo o raio do apagador mais metade da espessura do traço; o corte também usa esse raio efetivo.
- **Desenhar:** com o giz, clique/toque e arraste sobre o quadro.
- **Apagar:** com o apagador, arraste; um círculo (raio conforme o tamanho escolhido, 16 px de tela por padrão) mostra a área apagada. Os traços são cortados onde o círculo passa (um traço pode virar dois) e o que fica totalmente coberto some. Se um gesto de pinça (2 dedos) começa durante o apagar, ele é cancelado e o que foi apagado desde que o dedo encostou é desfeito; nenhum dedo apaga até todos serem levantados. Depois que o dedo é levantado, o apagamento é definitivo.
- **Zoom:** roda do mouse, pinça no celular/trackpad, ou os botões `−`, `100%` e `+` no canto inferior direito.
- **Mover o quadro:** ferramenta mão e arrastar, ou segurar `espaço` (ou o botão do meio do mouse) e arrastar; ao soltar, volta à ferramenta anterior. Com dois dedos, arraste e faça pinça ao mesmo tempo.
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
  - `w` (opcional): lista com a espessura de cada traço, na mesma ordem de `s`, em décimos de unidade de mundo (inteiros; o padrão 4 vale `40`). Só é incluída quando algum traço tem espessura diferente do padrão. Se ausente (links antigos), todos os traços usam a espessura padrão; se presente, precisa ter um valor por traço, entre `5` e `1000` (0,5 a 100 unidades), senão o link é rejeitado como inválido. O formato continua `"v": 1`: links antigos abrem normalmente.
  - `s`: lista de traços. Cada traço é uma lista plana `x0, y0, dx1, dy1, ...`: o primeiro ponto é absoluto e os seguintes são diferenças em relação ao ponto anterior. Todos os valores são inteiros em décimos de unidade de mundo (precisão de 0,1).

No `localStorage` (`quadro-verde:v1`), cada traço é `{ "points": [[x, y], ...], "width": n }`; dados antigos sem `width` carregam com a espessura padrão e valores fora de 0,5 a 100 são limitados.

Limites ao abrir um link (acima disso o link é rejeitado como inválido): JSON descomprimido de até 2 MB, 200 mil pontos, 20 mil traços e coordenadas de até 10 milhões de unidades de mundo.

Depois de carregar, o app remove o `#d=...` da barra de endereço.

## Arquivos

- `index.html`, `style.css`, `app.js`: todo o app.
