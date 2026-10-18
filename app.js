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
  } else if (event.pointerId === panPointerId) {
    panBy(p.x - prevX, p.y - prevY);
    render();
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
  }
  if (event.pointerId === panPointerId) panPointerId = null;
  gesture = pointers.size === 2 ? gestureState() : null;
  // Dedo que sobra depois de uma pinça não desenha nem faz pan até levantar todos.
  updateCursor();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

document.getElementById('clear').addEventListener('click', () => {
  strokes.length = 0;
  currentStroke = null;
  strokePointerId = null;
  render();
});

window.addEventListener('resize', resize);
resize();
