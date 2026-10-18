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
// Gerador pseudoaleatório com semente: a textura do giz fica igual a cada redesenho.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawStroke(stroke, index) {
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
  const random = seededRandom(index + 1);
  for (const [x, y] of pts) {
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
  strokes.forEach(drawStroke);
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

let handMode = false;
let spaceDown = false;
const handButton = document.getElementById('hand');
handButton.addEventListener('click', () => {
  handMode = !handMode;
  handButton.setAttribute('aria-pressed', String(handMode));
  updateCursor();
});

function updateCursor() {
  canvas.style.cursor = panPointerId !== null ? 'grabbing' : (handMode || spaceDown) ? 'grab' : 'crosshair';
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    if (event.target.closest && event.target.closest('#link-prompt')) return; // espaço aciona o botão focado
    spaceDown = true;
    event.preventDefault(); // evita "clicar" no botão focado
    updateCursor();
  }
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

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
  if (event.button === 1) event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    // Segundo dedo: vira pinça/pan e o traço de 1 dedo é descartado sem deixar rabisco.
    discardCurrentStroke();
    panPointerId = null;
    gesture = gestureState();
    updateCursor();
    render();
    return;
  }

  if (event.button === 1 || handMode || spaceDown) {
    panPointerId = event.pointerId;
    updateCursor();
    return;
  }

  strokePointerId = event.pointerId;
  currentStroke = { points: [pointerPosition(event)] };
  strokes.push(currentStroke);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  const p = pointers.get(event.pointerId);
  if (!p) return;
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
  } else if (event.pointerId === strokePointerId && currentStroke) {
    // getCoalescedEvents devolve os pontos intermediários, deixando o traço mais fiel.
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    for (const e of events.length ? events : [event]) {
      currentStroke.points.push(pointerPosition(e));
    }
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
resize();
loadFromHash();
