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

// ---------- Câmera (por enquanto identidade; zoom/pan virão depois) ----------
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

// ---------- Handlers de pointer ----------
function pointerPosition(event) {
  return screenToWorld([event.clientX, event.clientY]);
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  currentStroke = { points: [pointerPosition(event)] };
  strokes.push(currentStroke);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (!currentStroke) return;
  // getCoalescedEvents devolve os pontos intermediários, deixando o traço mais fiel.
  const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  for (const e of events.length ? events : [event]) {
    currentStroke.points.push(pointerPosition(e));
  }
  render();
});

function endStroke() {
  currentStroke = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

document.getElementById('clear').addEventListener('click', () => {
  strokes.length = 0;
  currentStroke = null;
  render();
});

window.addEventListener('resize', resize);
resize();
