'use strict';

// ── DB ──────────────────────────────────────────────────────────────
const DB_NAME = 'opi-db', DB_VER = 1;
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('photos')) {
        const ps = d.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('sessionId', 'sessionId');
      }
      if (!d.objectStoreNames.contains('buildings')) d.createObjectStore('buildings', { keyPath: 'name' });
      if (!d.objectStoreNames.contains('rooms'))     d.createObjectStore('rooms',     { keyPath: 'name' });
      if (!d.objectStoreNames.contains('session'))   d.createObjectStore('session',   { keyPath: 'id' });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror   = () => rej(r.error);
  });
}

const idb = {
  getAll: s => tx(s,'readonly', st => st.getAll()),
  get:    (s,k) => tx(s,'readonly', st => st.get(k)),
  put:    (s,d) => tx(s,'readwrite', st => st.put(d)),
  del:    (s,k) => tx(s,'readwrite', st => st.delete(k)),
  byIdx:  (s,idx,v) => tx(s,'readonly', st => st.index(idx).getAll(v)),
  clear:  s => tx(s,'readwrite', st => st.clear()),
};
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

// ── STATE ────────────────────────────────────────────────────────────
const S = {
  session: null,
  photoCount: 0,
  currentDataUrl: null,
  stream: null,
  facing: 'environment',
  editId: null,
  branch: 'Elektryka',
  zoomLevel: 1,
  lightboxPhotos: [],
  lightboxIdx: 0,
};

// ── DEPARTMENT MAP ────────────────────────────────────────────────────
const DEPT_MAP = {
  'Elektryka':   '⚡',
  'HVAC':        '❄️',
  'Hydraulika':  '💧',
  'Mechanika':   '⚙️',
  'BMS':         '📡',
  'Inne':        '🔧',
};

function getDeptIcon(dept) { return DEPT_MAP[dept] || '🔧'; }

function updateDeptHeader(dept) {
  const el = $('dept-header-name');
  const icon = $('dept-header-icon');
  if (el) el.textContent = dept || 'Elektryka';
  if (icon) icon.textContent = getDeptIcon(dept);
}

function openDeptSelector() {
  const current = S.session ? S.session.department : 'Elektryka';
  const overlay = document.createElement('div');
  overlay.className = 'bottom-sheet-overlay';
  overlay.innerHTML = `<div class="bottom-sheet">
    <div class="bottom-sheet-handle"></div>
    <div class="bottom-sheet-title">Wybierz dział</div>
    ${Object.entries(DEPT_MAP).map(([name, icon]) => `
      <button class="bottom-sheet-option${name === current ? ' active' : ''}" data-dept="${escHtml(name)}">
        <span class="opt-icon">${icon}</span> ${escHtml(name)}
        ${name === current ? '<span class="opt-check">✓</span>' : ''}
      </button>`).join('')}
  </div>`;
  overlay.addEventListener('click', e => {
    const opt = e.target.closest('.bottom-sheet-option');
    if (opt) {
      const newDept = opt.dataset.dept;
      if (S.session) S.session.department = newDept;
      updateDeptHeader(newDept);
      // Also update branch chips
      if (newDept in DEPT_MAP) setChipValue('branch-chips', newDept);
      S.branch = newDept;
      overlay.remove();
      toast(`Dział: ${newDept}`);
    } else if (e.target === overlay) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

// ── UTILS ─────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const ts = (d = new Date()) => typeof d === 'string' ? new Date(d) : d;
function fmtDate(d) { d = ts(d); return d.toLocaleDateString('pl-PL'); }
function fmtTime(d) { d = ts(d); return d.toLocaleTimeString('pl-PL', { hour:'2-digit', minute:'2-digit' }); }
function fmtDT(d)   { return fmtDate(d) + ' ' + fmtTime(d); }
function sanitize(s){ return (s||'brak').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').slice(0,20); }
function pad(n)     { return String(n).padStart(2,'0'); }
function pad3(n)    { return String(n).padStart(3,'0'); }
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

let toastTimer;
function toast(msg, type='') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' '+type : '');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

function showLoading(msg='Przetwarzanie...') {
  let o = document.querySelector('.loading-overlay');
  if (!o) {
    o = document.createElement('div');
    o.className = 'loading-overlay';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    const text = document.createElement('div');
    text.className = 'loading-text';
    text.textContent = msg;
    o.append(spinner, text);
    document.body.appendChild(o);
  } else {
    o.querySelector('.loading-text').textContent = msg;
    o.classList.remove('hidden');
  }
}
function hideLoading() {
  const o = document.querySelector('.loading-overlay');
  if (o) o.classList.add('hidden');
}

function updateCounter() {
  const badge = $('photo-count-badge');
  if (badge) badge.textContent = S.photoCount;
  document.title = `OPI – ${S.photoCount} zdjęć | ${S.session?.building || ''}`;
}

// ── BUILDINGS ────────────────────────────────────────────────────────
async function loadBuildings() {
  const inp = $('building-input');
  const sug = $('building-suggestions');

  async function show(q = '') {
    const list = await idb.getAll('buildings');
    const f = q ? list.filter(b => b.name.toLowerCase().includes(q)) : list;
    sug.replaceChildren();
    if (!f.length) { sug.classList.add('hidden'); return; }
    f.forEach(b => {
      const d = document.createElement('div');
      d.className = 'suggestion-item';
      d.textContent = b.name;
      d.addEventListener('click', () => { inp.value = b.name; sug.classList.add('hidden'); });
      sug.appendChild(d);
    });
    sug.classList.remove('hidden');
  }

  inp.addEventListener('input', () => show(inp.value.trim().toLowerCase()));
  inp.addEventListener('focus', () => show(inp.value.trim().toLowerCase()));
  document.addEventListener('click', e => { if (!e.target.closest('.combo-box')) sug.classList.add('hidden'); });
}

async function saveBuilding(name) {
  if (!name.trim()) return;
  await idb.put('buildings', { name: name.trim() });
}

// ── ROOMS AUTOCOMPLETE ───────────────────────────────────────────────
let cachedRooms = [];
async function initRoomAutocomplete() {
  const inp = $('room-input');
  const sug = $('room-suggestions');
  cachedRooms = await idb.getAll('rooms');

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    const f = cachedRooms.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6);
    sug.replaceChildren();
    if (!f.length || !q) { sug.classList.add('hidden'); return; }
    f.forEach(r => {
      const d = document.createElement('div');
      d.className = 'suggestion-item';
      d.textContent = r.name;
      d.addEventListener('click', () => { inp.value = r.name; sug.classList.add('hidden'); });
      sug.appendChild(d);
    });
    sug.classList.remove('hidden');
  });
  document.addEventListener('click', e => { if (!e.target.closest('#room-input, #room-suggestions')) sug.classList.add('hidden'); });
}

async function saveRoom(name) {
  if (name && name.trim()) {
    const n = name.trim();
    await idb.put('rooms', { name: n });
    if (!cachedRooms.some(r => r.name === n)) cachedRooms.push({ name: n });
  }
}

// ── SESSION ──────────────────────────────────────────────────────────
async function startNewSession(building, dept, zone) {
  S.session = { id: 'current', building, department: dept, zone, startTime: new Date().toISOString() };
  S.photoCount = 0;
  await idb.put('session', S.session);
  await idb.clear('photos');
}

async function loadSession() {
  const sess = await idb.get('session', 'current');
  if (!sess) return false;
  S.session = sess;
  const photos = await idb.byIdx('photos', 'sessionId', 'current');
  S.photoCount = photos.length;
  return true;
}

// ── CAMERA ───────────────────────────────────────────────────────────
const video = $('camera-stream');
const camTip = $('camera-tip');
let availableCameras = [];
let currentCameraIdx = 0;

async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(d => d.kind === 'videoinput');
  } catch { availableCameras = []; }
}

async function startCamera(deviceId) {
  stopCamera();
  try {
    const constraints = { audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 } } };
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else {
      constraints.video.facingMode = S.facing;
    }
    S.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = S.stream;
    video.classList.remove('hidden');
    $('no-photo-msg').classList.add('hidden');
    $('photo-preview').classList.add('hidden');
    camTip.textContent = 'Dotknij 📸 aby zrobić zdjęcie';
    $('btn-capture').classList.remove('recording');
    S.cameraActive = true;
    S.zoomLevel = 1;

    // Enumerate cameras after first access (needs permission)
    if (!availableCameras.length) await enumerateCameras();
    updateLensBar();
    initZoom();
  } catch {
    useFallback();
  }
}

function updateLensBar() {
  const bar = $('lens-bar');
  if (availableCameras.length > 1) {
    bar.replaceChildren();
    // Filter to back-facing cameras (labels usually contain 'back', 'rear', 'environment', or camera index)
    const backCams = availableCameras.filter(c =>
      !c.label || !c.label.toLowerCase().match(/front|user|selfie/)
    );
    const camsToShow = backCams.length > 1 ? backCams : availableCameras;
    camsToShow.forEach((cam, i) => {
      const btn = document.createElement('button');
      btn.className = 'lens-btn';
      // Try to detect lens type from label
      let label = `${i + 1}`;
      const lbl = (cam.label || '').toLowerCase();
      if (lbl.includes('wide') || lbl.includes('ultra') || lbl.includes('0.5')) label = '0.5×';
      else if (lbl.includes('tele') || lbl.includes('2x') || lbl.includes('zoom')) label = '2×';
      else if (i === 0 && camsToShow.length > 1) label = '1×';
      else if (i === 1 && camsToShow.length > 2) label = '2×';
      else label = `${i + 1}×`;

      btn.textContent = label;
      btn.dataset.deviceId = cam.deviceId;
      // Mark current as active
      const currentTrack = S.stream && S.stream.getVideoTracks()[0];
      if (currentTrack && currentTrack.getSettings().deviceId === cam.deviceId) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => switchLens(cam.deviceId, btn));
      bar.appendChild(btn);
    });
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function switchLens(deviceId, btn) {
  $('lens-bar').querySelectorAll('.lens-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  await startCamera(deviceId);
}

function initZoom() {
  const track = S.stream && S.stream.getVideoTracks()[0];
  if (!track) { $('zoom-controls').classList.add('hidden'); return; }
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (caps.zoom) {
    const slider = $('zoom-slider');
    slider.min = caps.zoom.min;
    slider.max = Math.min(caps.zoom.max, 10);
    slider.step = caps.zoom.step || 0.1;
    slider.value = caps.zoom.min;
    $('zoom-label').textContent = '1.0×';
    $('zoom-controls').classList.remove('hidden');
  } else {
    $('zoom-controls').classList.add('hidden');
  }
}

function applyZoom(val) {
  const track = S.stream && S.stream.getVideoTracks()[0];
  if (!track) return;
  try { track.applyConstraints({ advanced: [{ zoom: val }] }); } catch {}
  S.zoomLevel = val;
  $('zoom-label').textContent = Number(val).toFixed(1) + '×';
  $('zoom-slider').value = val;
}

function stopCamera() {
  if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
  video.classList.add('hidden');
  video.srcObject = null;
  S.cameraActive = false;
  $('zoom-controls').classList.add('hidden');
  $('lens-bar').classList.add('hidden');
}

function useFallback() {
  stopCamera();
  camTip.textContent = 'Brak kamery – wybierz zdjęcie z pliku 🖼';
  $('file-input').click();
}

let isFlipping = false;
async function flipCamera() {
  if (isFlipping) return;
  isFlipping = true;
  try {
    S.facing = S.facing === 'environment' ? 'user' : 'environment';
    availableCameras = []; // re-enumerate for new facing
    await startCamera();
  } finally {
    isFlipping = false;
  }
}

function captureFromStream() {
  if (!S.stream) return;
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  S.currentDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  stopCamera();
  showPreview(S.currentDataUrl);
  showForm();
}

function handleFile(file) {
  if (!file) return;
  const allowed = ['image/jpeg','image/png','image/webp'];
  if (!allowed.includes(file.type)) { toast('Nieobsługiwany format pliku','error'); return; }
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  if (file.size > MAX_SIZE) { toast('Plik za duży (max 20MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    S.currentDataUrl = e.target.result;
    showPreview(S.currentDataUrl);
    showForm();
  };
  reader.readAsDataURL(file);
}

function showPreview(dataUrl) {
  const img = $('photo-preview');
  img.src = dataUrl;
  img.classList.remove('hidden');
  $('no-photo-msg').classList.add('hidden');
}

function showForm() {
  $('photo-form').classList.remove('hidden');
  camTip.textContent = 'Wypełnij dane i naciśnij ✅';
  setTimeout(() => $('room-input').focus(), 100);
}

function resetForm(keepFloor) {
  $('room-input').value = '';
  $('short-desc').value = '';
  $('long-desc').value  = '';
  $('category-select').value = 'Usterka';
  if (!keepFloor) $('floor-input').value = '';
  $('photo-form').classList.add('hidden');
  $('photo-preview').classList.add('hidden');
  $('room-suggestions').classList.add('hidden');
  $('no-photo-msg').classList.remove('hidden');
  camTip.textContent = 'Dotknij 📸 aby zrobić zdjęcie';
  S.currentDataUrl = null;
  // keep branch selection
}

// ── CHIP SELECTOR ─────────────────────────────────────────────────────
function initChips(containerId, onChange) {
  const container = $(containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    if (onChange) onChange(chip.dataset.value);
  });
}

function getChipValue(containerId) {
  const el = document.querySelector('#' + containerId + ' .chip.active');
  return el ? el.dataset.value : 'Elektryka';
}

function setChipValue(containerId, val) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.value === val);
  });
}

// ── CANVAS PROCESSING ────────────────────────────────────────────────
function processImage(dataUrl, overlayData) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1920;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      drawOverlay(ctx, w, h, overlayData);
      canvas.toBlob(blob => res(blob), 'image/jpeg', 0.85);
    };
    img.onerror = () => rej(new Error('Nie udało się załadować obrazu'));
    img.src = dataUrl;
  });
}

function processImageNoOverlay(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1920;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => res(b), 'image/jpeg', 0.85);
    };
    img.onerror = () => rej(new Error('Nie udało się załadować obrazu'));
    img.src = dataUrl;
  });
}

function drawOverlay(ctx, w, h, d) {
  const { number, building, floor, room, shortDesc, category, branch, timestamp } = d;
  const lines = [
    `#${number} | ${building}`,
    `Piętro: ${floor || '—'} | Pom.: ${room || '—'}`,
    `[${branch || ''}] [${category || 'Usterka'}]`,
    shortDesc || '—',
    fmtDT(timestamp),
  ];
  const fs = Math.max(18, Math.min(28, Math.floor(w / 40)));
  ctx.font = `bold ${fs}px 'Inter', Arial, sans-serif`;
  const pd = 14, lh = fs * 1.55;
  const bw = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0) + pd * 2;
  const bh = lines.length * lh + pd * 2;
  const bx = w - bw - pd;
  const by = h - bh - pd;
  // Darker background for better contrast
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  const r = 10;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bx, by, bw, bh, r);
  } else {
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
  }
  ctx.fill();
  // Category color bar
  const catColors = {'Awaria':'#ef4444','Usterka':'#f97316','Uwaga':'#eab308','Do kontroli':'#3b82f6','OK':'#22c55e','Inne':'#94a3b8'};
  ctx.fillStyle = catColors[category] || '#6366f1';
  ctx.fillRect(bx, by, bw, 5);
  // Text with shadow for readability
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${fs}px 'Inter', Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, bx + pd, by + pd + (i + 1) * lh - (lh - fs) * 0.5));
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// ── SAVE PHOTO ────────────────────────────────────────────────────────
let isSaving = false;
async function savePhoto() {
  if (isSaving) return;
  if (!S.currentDataUrl) { toast('Brak zdjęcia!', 'error'); return; }
  const shortDesc = $('short-desc').value.trim().slice(0, 200);
  if (!shortDesc) { toast('Podaj krótki opis!', 'error'); $('short-desc').focus(); return; }

  isSaving = true;
  $('btn-save-photo').disabled = true;

  try {
    const floor    = $('floor-input').value.trim();
    const room     = $('room-input').value.trim();
    const longDesc = $('long-desc').value.trim();
    const category = $('category-select').value;
    const branch   = getChipValue('branch-chips');
    const now      = new Date().toISOString();
    const num      = S.photoCount + 1;

    showLoading('Przetwarzanie zdjęcia...');

    const overlayData = { number: num, building: S.session.building, floor, room, shortDesc, category, branch, timestamp: now };
    const [processedBlob, originalBlob] = await Promise.all([
      processImage(S.currentDataUrl, overlayData),
      processImageNoOverlay(S.currentDataUrl),
    ]);

    const filename = `OPI_${pad3(num)}_${sanitize(S.session.building)}_p${sanitize(floor)}_${sanitize(room)}.jpg`;

    await idb.put('photos', {
      sessionId: 'current',
      number: num,
      building: S.session.building,
      department: S.session.department,
      zone: S.session.zone,
      floor, room, shortDesc, longDesc, category, branch,
      timestamp: now,
      filename,
      processedBlob,
      originalBlob,
    });

    await saveRoom(room);
    S.photoCount = num;
    updateCounter();
    toast(`Zapisano zdjęcie ${num} ✅`, 'success');
    resetForm(true);
    await startCamera();
  } catch (err) {
    toast('Błąd zapisu: ' + err.message, 'error');
    console.error(err);
  } finally {
    hideLoading();
    isSaving = false;
    $('btn-save-photo').disabled = false;
  }
}

// ── GALLERY ───────────────────────────────────────────────────────────
let galleryUrls = [];
let editPreviewUrl = null;

function clearGalleryUrls() {
  galleryUrls.forEach(u => URL.revokeObjectURL(u));
  galleryUrls = [];
}

async function loadGallery() {
  clearGalleryUrls();
  const photos = await idb.byIdx('photos', 'sessionId', 'current');
  photos.sort((a, b) => a.number - b.number);
  const grid  = $('gallery-grid');
  const empty = $('gallery-empty');
  $('gallery-count').textContent = `${photos.length} zdjęć`;
  grid.replaceChildren();

  if (!photos.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  S.lightboxPhotos = photos;

  photos.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const url = URL.createObjectURL(p.processedBlob || p.originalBlob);
    galleryUrls.push(url);
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Zdjęcie ${p.number}`;
    img.loading = 'lazy';
    
    const num = document.createElement('span');
    num.className = 'gallery-item-num';
    num.textContent = p.number;
    
    const label = document.createElement('span');
    label.className = 'gallery-item-label';
    label.textContent = p.shortDesc || '';

    const cat = document.createElement('span');
    cat.className = 'gallery-item-cat';
    cat.textContent = p.branch || '';
    
    item.append(img, num, cat, label);
    item.addEventListener('click', () => openLightbox(idx));
    grid.appendChild(item);
  });
}

// ── LIGHTBOX ──────────────────────────────────────────────────────────
function openLightbox(idx) {
  S.lightboxIdx = idx;
  renderLightbox();
  $('lightbox').classList.remove('hidden');
}

function renderLightbox() {
  const photos = S.lightboxPhotos;
  if (!photos.length) return;
  const p = photos[S.lightboxIdx];
  const url = URL.createObjectURL(p.processedBlob || p.originalBlob);
  const prev = $('lightbox-img').dataset.blobUrl;
  if (prev) URL.revokeObjectURL(prev);
  $('lightbox-img').src = url;
  $('lightbox-img').dataset.blobUrl = url;
  $('lightbox-title').textContent = `#${p.number} – ${p.shortDesc || ''}`;
  $('lightbox-counter').textContent = `${S.lightboxIdx + 1} / ${photos.length}`;
  $('lightbox-prev').style.visibility = S.lightboxIdx > 0 ? 'visible' : 'hidden';
  $('lightbox-next').style.visibility = S.lightboxIdx < photos.length - 1 ? 'visible' : 'hidden';
}

function closeLightbox() {
  $('lightbox').classList.add('hidden');
  const prev = $('lightbox-img').dataset.blobUrl;
  if (prev) { URL.revokeObjectURL(prev); delete $('lightbox-img').dataset.blobUrl; }
}

async function openEditModal(id) {
  S.editId = id;
  const p = await idb.get('photos', id);
  if (!p) return;
  
  if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
  editPreviewUrl = URL.createObjectURL(p.originalBlob);
  
  $('modal-title').textContent    = `Zdjęcie ${p.number}`;
  $('modal-preview').src          = editPreviewUrl;
  $('edit-room').value            = p.room || '';
  $('edit-floor').value           = p.floor || '';
  $('edit-category').value        = p.category || 'Usterka';
  $('edit-short-desc').value      = p.shortDesc || '';
  $('edit-long-desc').value       = p.longDesc || '';
  setChipValue('edit-branch-chips', p.branch || 'Elektryka');
  $('edit-modal').classList.remove('hidden');
}

let isEditing = false;
async function saveEdit() {
  if (isEditing) return;
  const p = await idb.get('photos', S.editId);
  if (!p) return;
  
  isEditing = true;
  showLoading('Aktualizowanie...');
  try {
    p.room      = $('edit-room').value.trim();
    p.floor     = $('edit-floor').value.trim();
    p.category  = $('edit-category').value;
    p.shortDesc = $('edit-short-desc').value.trim();
    p.longDesc  = $('edit-long-desc').value.trim();
    p.branch    = getChipValue('edit-branch-chips');

    const orig = editPreviewUrl;
    const overlayData = { number: p.number, building: p.building, floor: p.floor, room: p.room, shortDesc: p.shortDesc, category: p.category, branch: p.branch, timestamp: p.timestamp };
    p.processedBlob = await processImage(orig, overlayData);
    await idb.put('photos', p);
    $('edit-modal').classList.add('hidden');
    toast('Zapisano zmiany ✅', 'success');
    await loadGallery();
  } catch (err) {
    toast('Błąd aktualizacji: ' + err.message, 'error');
    console.error(err);
  } finally {
    hideLoading();
    isEditing = false;
  }
}

async function deletePhoto(id) {
  if (!confirm('Usunąć to zdjęcie?')) return;
  await idb.del('photos', id);
  S.photoCount = Math.max(0, S.photoCount - 1);
  updateCounter();
  $('edit-modal').classList.add('hidden');
  toast('Zdjęcie usunięte');
  await loadGallery();
}

// ── EXPORT ────────────────────────────────────────────────────────────
let isExporting = false;
async function exportZIP() {
  if (isExporting) return;
  const photos = await idb.byIdx('photos', 'sessionId', 'current');
  if (!photos.length) { toast('Brak zdjęć do eksportu', 'error'); return; }
  photos.sort((a, b) => a.number - b.number);

  isExporting = true;
  showLoading('Generowanie ZIP...');
  try {
    const zip = new JSZip();
    const folder = zip.folder('zdjecia');

    photos.forEach(p => folder.file(p.filename, p.processedBlob));
    zip.file('raport.txt',  genTxt(photos));
    zip.file('raport.html', genHtml(photos));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = fmtDate(new Date()).replace(/\./g, '-');
    a.href     = url;
    a.download = `OPI_${sanitize(S.session.building)}_${date}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Remove the download URL immediately

    toast('ZIP pobrany! 📦', 'success');

    if (confirm('Czy zakończyć sesję i wyczyścić dane?')) {
      await idb.clear('photos');
      await idb.del('session', 'current');
      S.session = null; S.photoCount = 0;
      clearGalleryUrls();
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
      showScreen('screen-start');
      toast('Sesja zakończona');
    }
  } catch (err) {
    toast('Błąd eksportu: ' + err.message, 'error');
    console.error(err);
  } finally {
    hideLoading();
    isExporting = false;
  }
}

function genTxt(photos) {
  const s = S.session;
  let r = `----------------------------------\nOBCHÓD TECHNICZNY\nData: ${fmtDate(new Date())}\nBudynek: ${s.building}\nDział: ${s.department}`;
  if (s.zone) r += `\nStrefa: ${s.zone}`;
  r += '\n----------------------------------\n\n';
  photos.forEach(p => {
    r += `Zdjęcie ${p.number}\n`;
    r += `Branża: ${p.branch || '—'}\n`;
    r += `Pomieszczenie: ${p.room || '—'}\n`;
    r += `Piętro: ${p.floor || '—'}\n`;
    r += `Kategoria: ${p.category || 'Usterka'}\n`;
    r += `Krótki opis: ${p.shortDesc}\n`;
    if (p.longDesc) r += `Szczegółowy opis: ${p.longDesc}\n`;
    r += `Data: ${fmtDT(p.timestamp)}\n\n`;
  });
  return r;
}

function genHtml(photos) {
  const s = S.session;
  let rows = photos.map(p => `
    <div class="photo-entry">
      <h2>Zdjęcie ${p.number} – ${escHtml(p.shortDesc)}</h2>
      <table>
        <tr><td>Branża</td><td>${escHtml(p.branch) || '—'}</td></tr>
        <tr><td>Pomieszczenie</td><td>${escHtml(p.room) || '—'}</td></tr>
        <tr><td>Piętro</td><td>${escHtml(p.floor) || '—'}</td></tr>
        <tr><td>Kategoria</td><td>${escHtml(p.category) || 'Usterka'}</td></tr>
        <tr><td>Krótki opis</td><td>${escHtml(p.shortDesc)}</td></tr>
        ${p.longDesc ? `<tr><td>Szczegółowy opis</td><td>${escHtml(p.longDesc)}</td></tr>` : ''}
        <tr><td>Data</td><td>${fmtDT(p.timestamp)}</td></tr>
        <tr><td>Plik</td><td>${escHtml(p.filename)}</td></tr>
      </table>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Raport OPI</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#222}
    h1{color:#1e40af;border-bottom:3px solid #1e40af;padding-bottom:8px}
    .meta{background:#f0f4ff;padding:12px;border-radius:6px;margin-bottom:24px}
    .photo-entry{border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:16px;page-break-inside:avoid}
    .photo-entry h2{color:#1e40af;font-size:16px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse}
    td{padding:6px 10px;border-bottom:1px solid #eee;font-size:14px}
    td:first-child{font-weight:600;color:#555;width:160px}
    @media print{body{max-width:none}.photo-entry{break-inside:avoid}}
  </style></head><body>
  <h1>Raport Obchodu Technicznego</h1>
  <div class="meta">
    <strong>Data:</strong> ${fmtDate(new Date())}<br>
    <strong>Budynek:</strong> ${escHtml(s.building)}<br>
    <strong>Dział:</strong> ${escHtml(s.department)}
    ${s.zone ? `<br><strong>Strefa:</strong> ${escHtml(s.zone)}` : ''}
  </div>
  ${rows}
  </body></html>`;
}

async function copyMailReport() {
  const photos = await idb.byIdx('photos', 'sessionId', 'current');
  if (!photos.length) { toast('Brak zdjęć', 'error'); return; }
  photos.sort((a, b) => a.number - b.number);

  const text = photos.map(p => {
    let line = `Zdjęcie ${p.number} – [${p.category || 'Usterka'}] ${p.shortDesc} (${p.room || '—'}, piętro ${p.floor || '—'})`;
    if (p.longDesc) line += `\nSzczegóły: ${p.longDesc}`;
    return line;
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(text);
    toast('Skopiowano do schowka 📋', 'success');
  } catch {
    prompt('Skopiuj ręcznie:', text);
  }
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────
function bindEvents() {
  // Onboarding expandable cards
  document.querySelectorAll('.onboarding-card-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.onboarding-card').classList.toggle('expanded');
    });
  });

  // Start screen
  $('btn-start').addEventListener('click', async () => {
    const building = $('building-input').value.trim().slice(0, 100);
    const dept     = $('department-select').value;
    const zone     = $('zone-input').value.trim().slice(0, 100);
    if (!building) { toast('Podaj nazwę budynku!', 'error'); $('building-input').focus(); return; }
    await saveBuilding(building);
    await startNewSession(building, dept, zone);
    updateDeptHeader(dept);
    updateCounter();
    // Show camera hint
    const hint = $('camera-hint-bubble');
    if (hint) { hint.classList.remove('hidden'); setTimeout(() => hint.classList.add('hidden'), 5000); }
    showScreen('screen-camera');
    await startCamera();
  });

  $('btn-resume').addEventListener('click', async () => {
    if (!S.session) return;
    updateDeptHeader(S.session.department);
    updateCounter();
    $('saved-session-banner').classList.add('hidden');
    showScreen('screen-camera');
    await startCamera();
  });

  $('btn-discard').addEventListener('click', async () => {
    await idb.clear('photos');
    await idb.del('session', 'current');
    S.session = null; S.photoCount = 0;
    clearGalleryUrls();
    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    $('saved-session-banner').classList.add('hidden');
    toast('Sesja usunięta');
  });

  // Camera screen - clickable department header
  $('dept-header').addEventListener('click', openDeptSelector);

  // Back to start button
  $('btn-back-start').addEventListener('click', () => {
    if (S.photoCount > 0 && !confirm('Masz niezapisane zdjęcia. Czy na pewno chcesz wrócić?')) return;
    stopCamera();
    showScreen('screen-start');
  });

  $('btn-capture').addEventListener('click', () => {
    if (S.stream) captureFromStream();
    else useFallback();
  });
  $('btn-file-fallback').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', e => handleFile(e.target.files[0]));
  $('btn-save-photo').addEventListener('click', savePhoto);
  $('btn-delete-photo').addEventListener('click', () => {
    S.currentDataUrl = null;
    resetForm(true);
    startCamera();
  });

  // Zoom
  $('zoom-slider').addEventListener('input', e => applyZoom(parseFloat(e.target.value)));

  // Chips
  initChips('branch-chips', v => { S.branch = v; });
  initChips('edit-branch-chips');

  $('btn-to-gallery').addEventListener('click', async () => {
    stopCamera();
    await loadGallery();
    showScreen('screen-gallery');
  });

  $('btn-end-session').addEventListener('click', async () => {
    stopCamera();
    await loadGallery();
    showScreen('screen-gallery');
  });

  // Gallery screen
  $('btn-back-to-camera').addEventListener('click', async () => {
    showScreen('screen-camera');
    await startCamera();
  });
  $('btn-export-zip').addEventListener('click', exportZIP);
  $('btn-copy-mail').addEventListener('click', copyMailReport);

  // Edit modal
  $('btn-close-modal').addEventListener('click', () => $('edit-modal').classList.add('hidden'));
  $('btn-modal-save').addEventListener('click', saveEdit);
  $('btn-modal-delete').addEventListener('click', () => deletePhoto(S.editId));
  $('edit-modal').addEventListener('click', e => { if (e.target === $('edit-modal')) $('edit-modal').classList.add('hidden'); });
  $('modal-preview').addEventListener('click', () => {
    if (S.editId != null) {
      const idx = S.lightboxPhotos.findIndex(p => p.id === S.editId);
      if (idx >= 0) openLightbox(idx);
    }
  });

  // Lightbox
  $('btn-close-lightbox').addEventListener('click', closeLightbox);
  $('lightbox-prev').addEventListener('click', () => { if (S.lightboxIdx > 0) { S.lightboxIdx--; renderLightbox(); } });
  $('lightbox-next').addEventListener('click', () => { if (S.lightboxIdx < S.lightboxPhotos.length - 1) { S.lightboxIdx++; renderLightbox(); } });
  $('lightbox-edit').addEventListener('click', () => { closeLightbox(); const p = S.lightboxPhotos[S.lightboxIdx]; if (p) openEditModal(p.id); });
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox') || e.target.classList.contains('lightbox-body')) closeLightbox(); });
}

// ── INIT ──────────────────────────────────────────────────────────────
async function init() {
  await openDB();
  bindEvents();
  await loadBuildings();
  await initRoomAutocomplete();

  const hasSaved = await loadSession();
  if (hasSaved && S.session) {
    $('building-input').value = S.session.building;
    $('department-select').value = S.session.department || 'Elektryka';
    $('zone-input').value = S.session.zone || '';
    $('saved-session-banner').classList.remove('hidden');
    updateCounter();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
