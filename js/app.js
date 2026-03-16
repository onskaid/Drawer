'use strict';

// ═══════════════════════════════════════════════
// COLOR UTILS
// ═══════════════════════════════════════════════
function randomColor(hueBase) {
  const h = (hueBase + (Math.random() - 0.5) * 50 + 360) % 360;
  const s = 30 + Math.random() * 65;
  const l = 20 + Math.random() * 65;
  return hslToHex(h, s, l);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function lighten(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(v => Math.round(v + (255 - v) * amt).toString(16).padStart(2, '0')).join('');
}

function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 210;
}

// 5 hues evenly spaced (72° apart), random start, shuffled
const hueStart = Math.random() * 360;
const hueBases = Array.from({ length: 5 }, (_, i) => (hueStart + i * 72) % 360)
  .sort(() => Math.random() - 0.5);
const rands = hueBases.map(h => randomColor(h));

// グレースケール列: 黒→濃グレー→グレー→薄グレー→白
const grayscale = ['#111111', '#444444', '#888888', '#c0c0c0', '#ffffff'];

const columns = [
  ...rands.map(b => [0, .2, .4, .6, .8].map(a => a === 0 ? b : lighten(b, a))),
  grayscale,
];

// ═══════════════════════════════════════════════
// CANVAS SIZES
// ═══════════════════════════════════════════════
const SIZES = [
  { key: 'S', label: 'S', desc: 'Instagram / X',   w: 600,  h: 600,  aspect: [1, 1] },
  { key: 'M', label: 'M', desc: 'Instagram 4:5',   w: 600,  h: 750,  aspect: [4, 5] },
  { key: 'L', label: 'L', desc: 'Stories / Reels', w: 600,  h: 1067, aspect: [9, 16] },
];
let currentSizeKey = 'S';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let currentColor = '#111111';
let strokeSize = 6;
let isDrawing = false;
let lastX = 0, lastY = 0, lastMidX = 0, lastMidY = 0;

// ピンチズーム
let zoomScale = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
let pinchStartDist = 0;
let pinchStartScale = 1.0;

// ═══════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

function initCanvas(w, h) {
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width || w;
  tmp.height = canvas.height || h;
  tmp.getContext('2d').drawImage(canvas, 0, 0);

  canvas.width = w;
  canvas.height = h;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  if (tmp.width > 0 && tmp.height > 0) {
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, w, h);
  }

  fitCanvas();
  document.getElementById('sizeBadge').textContent = w + ' × ' + h;
}

// 表示スケール（getPos と fitCanvas で共有）
let displayScale = 1.0;

function fitCanvas() {
  const wrap = document.getElementById('canvasWrap');
  // キャンバスが wrap に収まる最大スケール（1.0を上限としない → zoomで拡大可能）
  const baseScale = Math.min(wrap.clientWidth / canvas.width, wrap.clientHeight / canvas.height);
  displayScale = baseScale * zoomScale;
  // transform ではなく width/height で設定（比率崩れを防ぐ）
  canvas.style.width  = Math.round(canvas.width  * displayScale) + 'px';
  canvas.style.height = Math.round(canvas.height * displayScale) + 'px';
  canvas.style.transform = '';
  updateZoomBadge();
}

function updateZoomBadge() {
  const badge = document.getElementById('zoomBadge');
  if (badge) badge.textContent = Math.round(zoomScale * 100) + '%';
}

// ═══════════════════════════════════════════════
// PALETTE
// ═══════════════════════════════════════════════
const allSwatches = [];

function buildPalette(containerId) {
  const container = document.getElementById(containerId);
  columns.forEach((shades, ci) => {
    const col = document.createElement('div');
    col.className = 'color-column';
    shades.forEach((color, si) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch';
      sw.style.background = color;
      if (isLight(color)) sw.classList.add('light');
      if (ci === 5 && si === 0) sw.classList.add('active'); // 黒をデフォルト選択
      sw.addEventListener('click', () => pickColor(color));
      col.appendChild(sw);
      allSwatches.push(sw);
    });
    container.appendChild(col);
  });
}

function pickColor(color) {
  currentColor = color;
  allSwatches.forEach(s => s.classList.remove('active'));
  allSwatches.filter(s => s.style.background === color).forEach(s => s.classList.add('active'));
  const dot = document.getElementById('tabColorDot');
  dot.style.background   = color;
  dot.style.borderColor  = isLight(color) ? 'var(--border2)' : color;
  closePanel();
}

buildPalette('pcPalette');
buildPalette('mobilePalette');
document.getElementById('tabColorDot').style.background = currentColor;

// ═══════════════════════════════════════════════
// STROKE
// ═══════════════════════════════════════════════
const STROKES  = [1, 3, 6, 12, 24];
const AVAIL_W  = 110;
const ROW_H    = 36;
const MOB_ROW_H = 42;

function barW(px) { return Math.round(8 + ((px - 1) / 23) * (AVAIL_W - 8)); }
function barH(px, rowH) { return Math.min(px, rowH - 14); }

const strokeTrigger = document.getElementById('strokeTrigger');
const strokePanel   = document.getElementById('strokePanel');
const triggerBar    = document.getElementById('triggerBar');
const triggerPx     = document.getElementById('triggerPx');

// PC dropdown rows
STROKES.forEach(px => {
  const row = document.createElement('div');
  row.className = 'stroke-row' + (px === 6 ? ' selected' : '');
  row.dataset.px = px;

  const bw = document.createElement('div'); bw.className = 'row-bar-wrap';
  const bar = document.createElement('div'); bar.className = 'stroke-bar';
  bar.style.width  = barW(px) + 'px';
  bar.style.height = barH(px, ROW_H) + 'px';
  bw.appendChild(bar);

  const lbl = document.createElement('span'); lbl.className = 'row-px'; lbl.textContent = px + 'px';
  row.appendChild(bw); row.appendChild(lbl);
  row.addEventListener('click', () => pickStroke(px));
  strokePanel.appendChild(row);
});

// Mobile rows
STROKES.forEach(px => {
  const row = document.createElement('div');
  row.className = 'mobile-stroke-row' + (px === 6 ? ' selected' : '');
  row.dataset.px = px;

  const bw = document.createElement('div'); bw.className = 'mobile-row-bar-wrap';
  const bar = document.createElement('div'); bar.className = 'stroke-bar';
  bar.style.width  = barW(px) + 'px';
  bar.style.height = barH(px, MOB_ROW_H) + 'px';
  bw.appendChild(bar);

  const lbl = document.createElement('span'); lbl.className = 'mobile-row-px'; lbl.textContent = px + 'px';
  row.appendChild(bw); row.appendChild(lbl);
  row.addEventListener('click', () => { pickStroke(px); closePanel(); });
  document.getElementById('mobileStrokeList').appendChild(row);
});

function pickStroke(px) {
  strokeSize = px;
  triggerBar.style.width  = barW(px) + 'px';
  triggerBar.style.height = barH(px, ROW_H) + 'px';
  triggerPx.textContent   = px + 'px';
  document.querySelectorAll('.stroke-row, .mobile-stroke-row').forEach(r =>
    r.classList.toggle('selected', parseInt(r.dataset.px) === px)
  );
  closeDD();
}

function openDD()  { strokeTrigger.classList.add('open');    strokePanel.classList.add('open'); }
function closeDD() { strokeTrigger.classList.remove('open'); strokePanel.classList.remove('open'); }

strokeTrigger.addEventListener('click', e => {
  e.stopPropagation();
  strokePanel.classList.contains('open') ? closeDD() : openDD();
});
document.addEventListener('click', closeDD);
strokePanel.addEventListener('click', e => e.stopPropagation());
pickStroke(6);

// ═══════════════════════════════════════════════
// SIZE SELECTOR
// ═══════════════════════════════════════════════
function buildSizeOptions(containerId, rowClass) {
  const container = document.getElementById(containerId);
  const isPC = rowClass === 'size-opt';

  SIZES.forEach(s => {
    const el = document.createElement('div');
    el.className = rowClass + (s.key === currentSizeKey ? ' active' : '');
    el.dataset.key = s.key;

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = isPC ? 'size-opt-label' : 'mobile-size-name';
    name.textContent = s.label + ' — ' + s.desc;
    const meta = document.createElement('div');
    meta.className = isPC ? 'size-opt-sub' : 'mobile-size-meta';
    meta.textContent = s.w + '×' + s.h;
    info.appendChild(name); info.appendChild(meta);

    const asp = document.createElement('div'); asp.className = 'mobile-size-aspect';
    const rect = document.createElement('div'); rect.className = 'aspect-rect';
    const maxD = 28;
    const [aw, ah] = s.aspect;
    if (aw >= ah) {
      rect.style.width  = maxD + 'px';
      rect.style.height = Math.round(maxD * ah / aw) + 'px';
    } else {
      rect.style.height = maxD + 'px';
      rect.style.width  = Math.round(maxD * aw / ah) + 'px';
    }
    asp.appendChild(rect);

    el.appendChild(info);
    el.appendChild(asp);
    el.addEventListener('click', () => pickSize(s.key));
    container.appendChild(el);
  });
}

buildSizeOptions('pcSizeOptions', 'size-opt');
buildSizeOptions('mobileSizeList', 'mobile-size-row');

function pickSize(key) {
  if (key === currentSizeKey) { closePanel(); return; }
  currentSizeKey = key;
  const s = SIZES.find(x => x.key === key);
  document.querySelectorAll('.size-opt, .mobile-size-row').forEach(el =>
    el.classList.toggle('active', el.dataset.key === key)
  );
  initCanvas(s.w, s.h);
  closePanel();
}

// ═══════════════════════════════════════════════
// MOBILE PANEL MANAGEMENT
// ═══════════════════════════════════════════════
let openPanelId = null;

function openPanel(panelId) {
  if (openPanelId && openPanelId !== panelId) {
    document.getElementById(openPanelId).classList.remove('visible');
  }
  if (openPanelId === panelId) { closePanel(); return; }

  openPanelId = panelId;
  document.getElementById(panelId).classList.add('visible');
  document.getElementById('panelOverlay').classList.add('visible');
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.panel === panelId)
  );
}

function closePanel() {
  if (openPanelId) {
    document.getElementById(openPanelId).classList.remove('visible');
    openPanelId = null;
  }
  document.getElementById('panelOverlay').classList.remove('visible');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
}

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => openPanel(btn.dataset.panel))
);
document.getElementById('panelOverlay').addEventListener('click', closePanel);

// ═══════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════
function getPos(e) {
  const r  = canvas.getBoundingClientRect();
  // getBoundingClientRect の実サイズ → canvas のピクセル座標に変換
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  const src = e.touches ? e.touches[0] : e;
  return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy];
}

function startDraw(e) {
  if (openPanelId) { closePanel(); return; }
  e.preventDefault();
  isDrawing = true;
  const [x, y] = getPos(e);
  lastX = x; lastY = y; lastMidX = x; lastMidY = y;
  ctx.beginPath();
  ctx.arc(x, y, strokeSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = currentColor;
  ctx.fill();
}

function doDraw(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const [x, y] = getPos(e);
  const mx = (lastX + x) / 2, my = (lastY + y) / 2;
  ctx.beginPath();
  ctx.moveTo(lastMidX, lastMidY);
  ctx.quadraticCurveTo(lastX, lastY, mx, my);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = strokeSize;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.stroke();
  lastMidX = mx; lastMidY = my; lastX = x; lastY = y;
}

function endDraw() { isDrawing = false; }

canvas.addEventListener('mousedown',  startDraw);
canvas.addEventListener('mousemove',  doDraw);
canvas.addEventListener('mouseup',    endDraw);
canvas.addEventListener('mouseleave', endDraw);

// タッチ：1本指=描画、2本指=ピンチズーム
canvas.addEventListener('touchstart', e => {
  if (openPanelId) { closePanel(); return; }
  if (e.touches.length === 2) {
    // ピンチ開始
    isDrawing = false;
    pinchStartDist = getPinchDist(e);
    pinchStartScale = zoomScale;
    e.preventDefault();
  } else if (e.touches.length === 1) {
    startDraw(e);
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    // ピンチ中
    e.preventDefault();
    const dist = getPinchDist(e);
    const ratio = dist / pinchStartDist;
    zoomScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartScale * ratio));
    fitCanvas();
  } else if (e.touches.length === 1) {
    doDraw(e);
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length < 2) {
    endDraw();
  }
});

function getPinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ═══════════════════════════════════════════════
// CLEAR & SAVE
// ═══════════════════════════════════════════════
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('キャンバスをクリアしますか？')) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = 'canvas_' + Date.now() + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// ═══════════════════════════════════════════════
// HANDEDNESS
// ═══════════════════════════════════════════════
function setHand(hand) {
  const isLeft = hand === 'left';
  document.getElementById('appBody').classList.toggle('left-handed', isLeft);
  ['pc', 'm'].forEach(pfx => {
    document.getElementById(pfx + 'BtnRight').classList.toggle('active', !isLeft);
    document.getElementById(pfx + 'BtnLeft').classList.toggle('active', isLeft);
  });
}

document.getElementById('pcBtnRight').addEventListener('click', () => setHand('right'));
document.getElementById('pcBtnLeft').addEventListener('click',  () => setHand('left'));
document.getElementById('mBtnRight').addEventListener('click',  () => setHand('right'));
document.getElementById('mBtnLeft').addEventListener('click',   () => setHand('left'));

// ═══════════════════════════════════════════════
// RESIZE & INIT
// ═══════════════════════════════════════════════
window.addEventListener('resize', fitCanvas);
initCanvas(SIZES.find(s => s.key === currentSizeKey).w, SIZES.find(s => s.key === currentSizeKey).h);
