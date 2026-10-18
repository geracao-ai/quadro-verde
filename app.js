'use strict';

const BOARD_COLOR = '#2f5d46';
const CHALK_COLOR = 'rgba(255, 255, 255, 0.85)';
const CHALK_WIDTH = 4;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

// ---------- Estado ----------
// Cada traço: { points: [[x, y], ...] } em coordenadas de MUNDO.
const strokes = [];
let currentStroke = null;

// ---------- Câmera (x, y = canto superior esquerdo em coordenadas de mundo) ----------
const camera = { x: 0, y: 0, scale: 1 };

// ---------- Persistência (localStorage) ----------
const STORAGE_KEY = 'quadro-verde:v1';
const SAVE_DELAY_MS = 300;

// Converte o estado em um objeto JSON-serializável.
function serialize() {
  return {
    strokes: strokes.map((s) => ({ points: s.points.map(([x, y]) => [x, y]) })),
    camera: { x: camera.x, y: camera.y, scale: camera.scale },
  };
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

// Valida o formato; devolve { strokes, camera } ou null se inválido.
function deserialize(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.strokes)) return null;
  const c = data.camera;
  if (!c || !isNum(c.x) || !isNum(c.y) || !isNum(c.scale) || c.scale <= 0) return null;
  const result = [];
  for (const s of data.strokes) {
    if (!s || !Array.isArray(s.points) || s.points.length === 0) return null;
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) return null;
    }
    result.push({ points: s.points.map(([x, y]) => [x, y]) });
  }
  return {
    strokes: result,
    camera: { x: c.x, y: c.y, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale)) },
  };
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  } catch (e) { /* localStorage indisponível ou cheio: segue sem salvar */ }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignora */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = deserialize(JSON.parse(raw));
    if (!state) return;
    strokes.push(...state.strokes);
    Object.assign(camera, state.camera);
  } catch (e) { /* JSON inválido ou localStorage indisponível: começa vazio */ }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToStorage();
  }, SAVE_DELAY_MS);
}

// Grava já o que estiver pendente (a página pode estar sendo fechada).
function flushSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveToStorage();
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

function worldToScreen([x, y]) {
  return [(x - camera.x) * camera.scale, (y - camera.y) * camera.scale];
}

function screenToWorld([x, y]) {
  return [x / camera.scale + camera.x, y / camera.scale + camera.y];
}

// ---------- Render ----------
// Gerador pseudoaleatório com semente por ponto (derivada das coordenadas de mundo):
// a textura do giz fica igual a cada redesenho e não muda quando um traço é cortado
// ou quando outros traços são apagados.
let randState = 1;
function random() {
  randState = (Math.imul(randState, 1664525) + 1013904223) >>> 0;
  return randState / 4294967296;
}
function seedFromPoint(x, y) {
  return (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(y * 10), 19349663)) >>> 0;
}

function drawStroke(stroke) {
  const pts = stroke.points.map(worldToScreen);
  const width = CHALK_WIDTH * camera.scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = CHALK_COLOR;
  ctx.fillStyle = CHALK_COLOR;

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Suavização: curvas quadráticas usando os pontos reais como controle
    // e os pontos médios entre eles como destino.
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }

  // Aspereza: falhas (cor do quadro) e grãos de giz espalhados ao longo do traço.
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = pts[k];
    randState = seedFromPoint(stroke.points[k][0], stroke.points[k][1]);
    for (let i = 0; i < 8; i++) {
      const dx = (random() - 0.5) * width * 1.3;
      const dy = (random() - 0.5) * width * 1.3;
      const r = random() * 1.4 + 0.6;
      ctx.fillStyle = random() < 0.7 ? BOARD_COLOR : CHALK_COLOR;
      ctx.globalAlpha = random() < 0.6 ? 0.55 : 0.9;
      ctx.fillRect(x + dx, y + dy, r, r);
    }
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(stroke);
}

// ---------- Redimensionamento (com devicePixelRatio) ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  // Daqui em diante desenhamos em pixels CSS; o transform cuida da densidade.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

// ---------- Zoom / pan ----------
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const BUTTON_ZOOM = 1.25;

// Muda a escala mantendo o ponto de mundo sob (sx, sy) fixo na tela.
function zoomAt(sx, sy, factor) {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale * factor));
  const [wx, wy] = screenToWorld([sx, sy]);
  camera.scale = next;
  camera.x = wx - sx / next;
  camera.y = wy - sy / next;
}

function panBy(dxScreen, dyScreen) {
  camera.x -= dxScreen / camera.scale;
  camera.y -= dyScreen / camera.scale;
}

function setScaleAtCenter(factor) {
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor);
  render();
  scheduleSave();
}

document.getElementById('zoom-in').addEventListener('click', () => setScaleAtCenter(BUTTON_ZOOM));
document.getElementById('zoom-out').addEventListener('click', () => setScaleAtCenter(1 / BUTTON_ZOOM));
document.getElementById('zoom-reset').addEventListener('click', () => setScaleAtCenter(1 / camera.scale));

// ---------- Ferramentas ----------
const TOOLS = ['chalk', 'hand', 'eraser'];
const ERASER_RADIUS = 16; // px de tela; convertido para mundo pela escala atual
let tool = 'chalk';
let spaceDown = false;
const toolButtons = {};
for (const name of TOOLS) toolButtons[name] = document.getElementById('tool-' + name);
const eraserCursor = document.getElementById('eraser-cursor');

// Espaço pressionado vira mão temporariamente, sem trocar `tool`.
function effectiveTool() {
  return spaceDown ? 'hand' : tool;
}

function setTool(name) {
  if (!TOOLS.includes(name) || name === tool) return;
  if (pointers.size > 0) return; // não troca de ferramenta no meio de um gesto
  tool = name;
  for (const n of TOOLS) toolButtons[n].setAttribute('aria-pressed', String(n === tool));
  updateCursor();
}
for (const name of TOOLS) toolButtons[name].addEventListener('click', () => setTool(name));

const CURSORS = { chalk: 'crosshair', hand: 'grab', eraser: 'none' }; // o apagador usa o círculo

function updateCursor() {
  canvas.style.cursor = panPointerId !== null ? 'grabbing' : CURSORS[effectiveTool()];
  if (effectiveTool() !== 'eraser' || panPointerId !== null) eraserCursor.hidden = true;
}

// Círculo do apagador seguindo o ponteiro (tamanho em px de tela).
eraserCursor.style.width = eraserCursor.style.height = ERASER_RADIUS * 2 + 'px';
function moveEraserCursor(event) {
  const show = effectiveTool() === 'eraser' && panPointerId === null && pointers.size < 2;
  eraserCursor.hidden = !show;
  if (show) {
    eraserCursor.style.transform =
      `translate(${event.clientX - ERASER_RADIUS}px, ${event.clientY - ERASER_RADIUS}px)`;
  }
}
canvas.addEventListener('pointerleave', () => { if (pointers.size === 0) eraserCursor.hidden = true; });

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    if (event.target.closest && event.target.closest('#link-prompt')) return; // espaço aciona o botão focado
    spaceDown = true;
    event.preventDefault(); // evita "clicar" no botão focado
    updateCursor();
  }
});
const SHORTCUTS = { b: 'chalk', g: 'chalk', e: 'eraser', h: 'hand' };
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const t = event.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const name = SHORTCUTS[event.key.toLowerCase()];
  if (name) setTool(name);
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    spaceDown = false;
    updateCursor();
  }
});

// Se a janela perde o foco com espaço pressionado, o keyup nunca chega.
function releaseSpace() {
  if (!spaceDown) return;
  spaceDown = false;
  updateCursor();
}
window.addEventListener('blur', releaseSpace);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') releaseSpace();
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  // ctrl+roda (inclui pinça do trackpad) usa delta menor por evento.
  const unit = event.deltaMode === 1 ? 33 : 1;
  const k = event.ctrlKey ? 0.01 : 0.0015;
  zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * unit * k));
  render();
  scheduleSave();
}, { passive: false });

// ---------- Handlers de pointer (rastreados por pointerId) ----------
const pointers = new Map(); // pointerId -> { x, y } em coordenadas de tela
let strokePointerId = null; // ponteiro que desenha o traço atual
let panPointerId = null;    // ponteiro que faz pan de 1 dedo/mouse
let eraserPointerId = null; // ponteiro que está apagando
let eraserLast = null;      // última posição do apagador (mundo)
let eraserSnapshot = null;  // cópia de `strokes` no início do apagar (para desfazer na pinça)
let gesture = null;         // { cx, cy, dist } durante pinça/pan com 2 ponteiros

function pointerPosition(event) {
  return screenToWorld([event.clientX, event.clientY]);
}

function discardCurrentStroke() {
  if (!currentStroke) return;
  const i = strokes.lastIndexOf(currentStroke);
  if (i >= 0) strokes.splice(i, 1);
  currentStroke = null;
  strokePointerId = null;
  scheduleSave(); // o autosave pode ter salvo o traço parcial antes do descarte
}

function gestureState() {
  const [a, b] = [...pointers.values()];
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
  };
}

// ---------- Apagador ----------
// Corta `pts` removendo o que fica dentro do círculo (cx, cy, r), considerando também
// o trecho entre pontos: interpola a entrada/saída em cada segmento. Devolve a lista de pedaços.
function cutPoints(pts, cx, cy, r) {
  const r2 = r * r;
  const pieces = [];
  const p0 = pts[0];
  let cur = (p0[0] - cx) ** 2 + (p0[1] - cy) ** 2 <= r2 ? null : [p0];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const fx = p[0] - cx;
    const fy = p[1] - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r2;
    let lo = 1;
    let hi = 0; // intervalo [lo, hi] do segmento dentro do círculo; vazio se lo >= hi
    if (a === 0) {
      if (c <= 0) { lo = 0; hi = 1; }
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        lo = Math.max(0, (-b - sq) / (2 * a));
        hi = Math.min(1, (-b + sq) / (2 * a));
      }
    }
    if (!(lo < hi)) {
      if (cur) cur.push(q); else cur = [q];
      continue;
    }
    if (cur) {
      if (lo > 0) cur.push([p[0] + dx * lo, p[1] + dy * lo]);
      pieces.push(cur);
      cur = null;
    }
    if (hi < 1) cur = [[p[0] + dx * hi, p[1] + dy * hi], q];
  }
  if (cur) pieces.push(cur);
  return pieces;
}

// Algum ponto ou segmento do traço toca o círculo? (sem alocar)
function touchesCircle(pts, cx, cy, r2) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let ex = p[0] - cx;
    let ey = p[1] - cy;
    if (ex * ex + ey * ey <= r2) return true;
    if (i === pts.length - 1) break;
    const q = pts[i + 1];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    const t = Math.max(0, Math.min(1, -(ex * dx + ey * dy) / a));
    ex += t * dx;
    ey += t * dy;
    if (ex * ex + ey * ey <= r2) return true;
  }
  return false;
}

// Caixa delimitadora do traço, em cache (invalidada quando o giz acrescenta pontos).
function strokeBounds(stroke) {
  if (!stroke.bbox) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of stroke.points) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    stroke.bbox = [x0, y0, x1, y1];
  }
  return stroke.bbox;
}

function eraseCircle(cx, cy, r) {
  let changed = false;
  const r2 = r * r;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    const [x0, y0, x1, y1] = strokeBounds(stroke);
    if (cx + r < x0 || cx - r > x1 || cy + r < y0 || cy - r > y1) continue;
    const pts = stroke.points;
    if (!touchesCircle(pts, cx, cy, r2)) continue;
    const pieces = cutPoints(pts, cx, cy, r);
    // Caso tangente: toca o círculo mas nada é removido; mantém o traço como está.
    if (pieces.length === 1 && pieces[0].length === pts.length &&
        pieces[0][0] === pts[0] && pieces[0][pts.length - 1] === pts[pts.length - 1]) continue;
    strokes.splice(i, 1, ...pieces.map((points) => ({ points })));
    changed = true;
  }
  return changed;
}

// Varre o círculo de `a` até `b` (mundo) em passos de meio raio, para que um movimento
// rápido não "pule" traços entre dois eventos. Devolve true se algo mudou.
function eraseSweep(a, b) {
  const r = ERASER_RADIUS / camera.scale;
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.min(2000, Math.max(1, Math.ceil(dist / (r / 2))));
  let changed = false;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (eraseCircle(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r)) changed = true;
  }
  return changed;
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
  if (event.button === 1) event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    // Segundo dedo: vira pinça/pan e o traço de 1 dedo é descartado sem deixar rabisco.
    // Como o traço parcial do giz, o apagar em andamento é desfeito: os traços são sempre
    // substituídos (nunca mutados), então basta restaurar a cópia feita no pointerdown.
    // Daqui em diante nenhum dedo apaga até todos serem levantados.
    discardCurrentStroke();
    if (eraserPointerId !== null && eraserSnapshot) {
      strokes.length = 0;
      strokes.push(...eraserSnapshot);
      scheduleSave();
    }
    eraserSnapshot = null;
    eraserPointerId = null;
    eraserLast = null;
    panPointerId = null;
    eraserCursor.hidden = true;
    gesture = gestureState();
    updateCursor();
    render();
    return;
  }

  const active = event.button === 1 ? 'hand' : effectiveTool();
  if (active === 'hand') {
    panPointerId = event.pointerId;
    updateCursor();
    return;
  }

  if (active === 'eraser') {
    eraserPointerId = event.pointerId;
    eraserLast = pointerPosition(event);
    eraserSnapshot = strokes.slice();
    moveEraserCursor(event);
    if (eraseSweep(eraserLast, eraserLast)) {
      render();
      scheduleSave();
    }
    return;
  }

  strokePointerId = event.pointerId;
  currentStroke = { points: [pointerPosition(event)] };
  strokes.push(currentStroke);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  const p = pointers.get(event.pointerId);
  if (!p) {
    if (pointers.size === 0) moveEraserCursor(event); // passando o mouse/caneta sem pressionar
    return;
  }
  const prevX = p.x;
  const prevY = p.y;
  p.x = event.clientX;
  p.y = event.clientY;

  if (gesture && pointers.size >= 2) {
    const g = gestureState();
    panBy(g.cx - gesture.cx, g.cy - gesture.cy);
    zoomAt(g.cx, g.cy, g.dist / gesture.dist);
    gesture = g;
    render();
    scheduleSave();
  } else if (event.pointerId === panPointerId) {
    panBy(p.x - prevX, p.y - prevY);
    render();
    scheduleSave();
  } else if (event.pointerId === eraserPointerId) {
    moveEraserCursor(event);
    let changed = false;
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    for (const e of events.length ? events : [event]) {
      const pos = pointerPosition(e);
      if (eraseSweep(eraserLast, pos)) changed = true;
      eraserLast = pos;
    }
    if (changed) {
      render();
      scheduleSave();
    }
  } else if (event.pointerId === strokePointerId && currentStroke) {
    // getCoalescedEvents devolve os pontos intermediários, deixando o traço mais fiel.
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    for (const e of events.length ? events : [event]) {
      currentStroke.points.push(pointerPosition(e));
    }
    delete currentStroke.bbox;
    render();
  }
});

function endPointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (event.pointerId === strokePointerId) {
    currentStroke = null;
    strokePointerId = null;
    scheduleSave(); // traços descartados pela pinça já saíram de `strokes`
  }
  if (event.pointerId === panPointerId) panPointerId = null;
  if (event.pointerId === eraserPointerId) {
    eraserPointerId = null;
    eraserLast = null;
    eraserSnapshot = null; // apagar concluído: não há mais o que desfazer
  }
  if (event.pointerType !== 'mouse' || pointers.size > 0) eraserCursor.hidden = true;
  gesture = pointers.size === 2 ? gestureState() : null;
  // Dedo que sobra depois de uma pinça não desenha nem faz pan até levantar todos.
  updateCursor();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

document.getElementById('clear').addEventListener('click', () => {
  if (strokes.length > 0 && !confirm('Limpar o quadro? Isso apaga o que está desenhado e salvo.')) return;
  strokes.length = 0;
  currentStroke = null;
  strokePointerId = null;
  eraserPointerId = null;
  eraserSnapshot = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  clearStorage();
  render();
});

// ---------- Compartilhar via URL (#d=...) ----------
// Formato: "#d=" + flag + base64url. Flag "z" = JSON comprimido com deflate-raw;
// flag "r" = JSON puro. JSON: {"v":1,"c":[x*10,y*10,escala*1000],"s":[[x0,y0,dx,dy,...],...]}
// com pontos em décimos de unidade de mundo (inteiros) e deltas após o primeiro ponto.
const HASH_PREFIX = '#d=';
const MAX_URL_LENGTH = 8000;
const MAX_DECODED_BYTES = 2 * 1024 * 1024; // teto do JSON descomprimido
const MAX_POINTS = 200000;
const MAX_STROKES = 20000;
const MAX_COORD = 1e7 * 10; // |x|, |y| <= 1e7 unidades de mundo (em décimos)
const Q = 10;

const isInt = (n) => Number.isInteger(n) && Math.abs(n) < 1e9;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('base64url inválido');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new Error('dados grandes demais');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// Estado -> texto do hash (sem o "#d="). Pontos quantizados e codificados por deltas.
async function encodeBoard(state = { strokes, camera }) {
  const s = state.strokes.map((stroke) => {
    const out = [];
    let px = 0;
    let py = 0;
    for (const [x, y] of stroke.points) {
      const qx = Math.round(x * Q);
      const qy = Math.round(y * Q);
      out.push(qx - px, qy - py);
      px = qx;
      py = qy;
    }
    return out;
  });
  const cam = state.camera;
  const json = JSON.stringify({
    v: 1,
    c: [Math.round(cam.x * Q), Math.round(cam.y * Q), Math.round(cam.scale * 1000)],
    s,
  });
  let bytes = new TextEncoder().encode(json);
  let flag = 'r';
  if (typeof CompressionStream === 'function') {
    try {
      bytes = await pipeBytes(bytes, new CompressionStream('deflate-raw'));
      flag = 'z';
    } catch (e) { /* segue sem compressão */ }
  }
  return flag + toBase64Url(bytes);
}

// Texto do hash -> { strokes, camera }, ou null se inválido (nunca lança).
async function decodeBoard(text) {
  try {
    if (typeof text !== 'string' || text.length < 1) return null;
    if (text.length > MAX_DECODED_BYTES * 2) return null; // base64 de algo maior que o teto
    let bytes = fromBase64Url(text.slice(1));
    if (text[0] === 'z') {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    } else if (text[0] !== 'r' || bytes.length > MAX_DECODED_BYTES) {
      return null;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.v !== 1 || !Array.isArray(data.s) || !Array.isArray(data.c)) return null;
    const [cx, cy, cs] = data.c;
    if (![cx, cy, cs].every(isInt) || cs <= 0) return null;
    if (data.s.length > MAX_STROKES || Math.abs(cx) > MAX_COORD || Math.abs(cy) > MAX_COORD) return null;
    const result = [];
    let totalPoints = 0;
    for (const flat of data.s) {
      if (!Array.isArray(flat) || flat.length === 0 || flat.length % 2 !== 0) return null;
      totalPoints += flat.length / 2;
      if (totalPoints > MAX_POINTS) return null;
      const points = [];
      let x = 0;
      let y = 0;
      for (let i = 0; i < flat.length; i += 2) {
        if (!isInt(flat[i]) || !isInt(flat[i + 1])) return null;
        x += flat[i];
        y += flat[i + 1];
        if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return null;
        points.push([x / Q, y / Q]);
      }
      result.push({ points });
    }
    return deserialize({
      strokes: result,
      camera: { x: cx / Q, y: cy / Q, scale: cs / 1000 },
    });
  } catch (e) {
    return null;
  }
}

let toastTimer = null;
const toastEl = document.getElementById('toast');
function showToast(message, ms = 4000) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

async function shareBoard() {
  const url = location.origin + location.pathname + HASH_PREFIX + await encodeBoard();
  const warning = url.length > MAX_URL_LENGTH
    ? `Atenção: o link tem ${url.length} caracteres e pode não funcionar em alguns apps/navegadores. `
    : '';
  try {
    await navigator.clipboard.writeText(url);
    showToast(warning + 'Link copiado!', warning ? 8000 : 4000);
  } catch (e) {
    prompt(warning + 'Copie o link abaixo:', url);
  }
}
document.getElementById('share').addEventListener('click', shareBoard);

// Aplica um quadro decodificado, substituindo o atual, e salva já.
function applyBoard(state) {
  discardCurrentStroke();
  // Um apagar em andamento pertencia ao quadro antigo: não pode ser desfeito sobre o novo.
  eraserSnapshot = null;
  eraserPointerId = null;
  eraserLast = null;
  strokes.length = 0;
  strokes.push(...state.strokes);
  Object.assign(camera, state.camera);
  render();
  flushSave();
  saveToStorage();
}

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

// Aviso não bloqueante (confirm() é suprimido em muitos navegadores embutidos).
// Enquanto a pessoa não decide, o hash continua na URL e o quadro do link fica em memória.
const promptEl = document.getElementById('link-prompt');
const promptOpenBtn = document.getElementById('link-open');
const promptKeepBtn = document.getElementById('link-keep');
let pendingBoard = null;

function showLinkPrompt(state) {
  pendingBoard = state;
  promptEl.hidden = false;
  promptOpenBtn.focus();
}

function hideLinkPrompt() {
  pendingBoard = null;
  promptEl.hidden = true;
}

promptOpenBtn.addEventListener('click', () => {
  if (!pendingBoard) return;
  const state = pendingBoard;
  hideLinkPrompt();
  clearHash();
  applyBoard(state);
  showToast('Quadro do link aberto.');
});

function keepLocalBoard() {
  if (!pendingBoard) return;
  hideLinkPrompt();
  clearHash();
  showToast('Mantive o seu quadro. O quadro do link foi ignorado; abra o link de novo para vê-lo.', 7000);
}
promptKeepBtn.addEventListener('click', keepLocalBoard);
promptEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') keepLocalBoard();
});

// Carrega o quadro do hash (se houver). Tem prioridade sobre o localStorage.
let hashLoadId = 0;
async function loadFromHash() {
  if (!location.hash.startsWith(HASH_PREFIX)) return;
  const id = ++hashLoadId;
  const payload = location.hash.slice(HASH_PREFIX.length);
  const state = await decodeBoard(payload);
  if (id !== hashLoadId) return; // um link mais novo chegou enquanto decodificava
  if (!state) {
    clearHash();
    hideLinkPrompt();
    if (payload[0] === 'z' && typeof DecompressionStream !== 'function') {
      showToast('Este navegador não consegue abrir links comprimidos (falta DecompressionStream). Use um navegador mais recente.', 8000);
    } else {
      showToast('O link do quadro é inválido ou está incompleto.');
    }
    return;
  }
  if (strokes.length > 0) {
    const same = await encodeBoard({ strokes, camera: state.camera }) ===
      await encodeBoard({ strokes: state.strokes, camera: state.camera });
    if (id !== hashLoadId) return;
    if (same) {
      hideLinkPrompt();
      clearHash();
      return;
    }
    showLinkPrompt(state);
    return;
  }
  hideLinkPrompt();
  clearHash();
  applyBoard(state);
}
window.addEventListener('hashchange', loadFromHash);

window.addEventListener('resize', resize);
loadFromStorage();
updateCursor();
resize();
loadFromHash();
