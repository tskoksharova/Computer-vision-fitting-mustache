const CASCADE_PATH = './assets/cascades/haarcascade_frontalface_default.xml';
const MUSTACHE_DIR = './assets/mustaches/';

let faceClassifier = null;

let baseImg = null;        // HTMLImageElement
let offCanvas = null;      // Offscreen canvas (full-res)
let offCtx = null;

let displayScale = 1;      // масштаб вывода на canvasOut
let faceRect = null;       // {x,y,width,height} в full-res координатах

let mustaches = [];        // [{name, src, img}]
let selectedMustacheIdx = -1;

const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');

const btnDetect = document.getElementById('btnDetect');
const btnDownload = document.getElementById('btnDownload');

const mustacheGrid = document.getElementById('mustacheGrid');

const scaleRange = document.getElementById('scaleRange');
const xRange = document.getElementById('xRange');
const yRange = document.getElementById('yRange');

const scaleVal = document.getElementById('scaleVal');
const xVal = document.getElementById('xVal');
const yVal = document.getElementById('yVal');

const canvasOut = document.getElementById('canvasOut');
const outCtx = canvasOut.getContext('2d');

window.addEventListener('opencv-ready', async () => {
  statusEl.textContent = 'OpenCV готов. Загружаю каскад…';
  statusEl.style.borderColor = '#bde5bd';

  try {
    await initCascade();
    statusEl.textContent = 'Готово. Загрузите фото.';
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Ошибка загрузки каскада. Проверь путь к XML.';
    statusEl.style.borderColor = '#f3b3b3';
    return;
  }

  initApp();
});

if (window.__opencvReady) {
  window.dispatchEvent(new Event('opencv-ready'));
}

async function initCascade() {
  const xmlName = 'face.xml';

  const res = await fetch(CASCADE_PATH);
  if (!res.ok) throw new Error(`Не удалось загрузить каскад: ${CASCADE_PATH}`);
  const data = new Uint8Array(await res.arrayBuffer());

  try {
    cv.FS_createDataFile('/', xmlName, data, true, false, false);
  } catch (_) {}

  faceClassifier = new cv.CascadeClassifier();
  const loaded = faceClassifier.load(xmlName);
  if (!loaded) throw new Error('CascadeClassifier.load вернул false');
}

function initApp() {
  fileInput.disabled = false;

  fileInput.addEventListener('change', onFile);

  btnDetect.addEventListener('click', () => {
    if (!offCanvas) return;
    detectFace();
    redraw();
  });

  btnDownload.addEventListener('click', downloadPNG);

  [scaleRange, xRange, yRange].forEach((el) => {
    el.addEventListener('input', () => {
      scaleVal.textContent = Number(scaleRange.value).toFixed(2);
      xVal.textContent = Number(xRange.value).toFixed(2);
      yVal.textContent = Number(yRange.value).toFixed(2);
      redraw();
    });
  });

  loadMustaches();
}

async function onFile(e) {
  if (!e.target.files || e.target.files.length === 0) return;

  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      baseImg = img;

      offCanvas = document.createElement('canvas');
      offCanvas.width = img.width;
      offCanvas.height = img.height;
      offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(img, 0, 0);

      const maxW = 900;
      displayScale = Math.min(1, maxW / img.width);

      canvasOut.width = Math.round(img.width * displayScale);
      canvasOut.height = Math.round(img.height * displayScale);

      faceRect = null;

      btnDetect.disabled = false;
      btnDownload.disabled = false;

      scaleRange.disabled = false;
      xRange.disabled = false;
      yRange.disabled = false;

      detectFace();
      redraw();

      statusEl.textContent = faceRect ? 'Лицо найдено. Выберите усы.' : 'Лицо не найдено. Попробуйте другое фото.';
    };
    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function detectFace() {
  if (!offCanvas || !faceClassifier) return;

  let src = cv.imread(offCanvas);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.equalizeHist(gray, gray);

  let faces = new cv.RectVector();
  let msize = new cv.Size(0, 0);

  faceClassifier.detectMultiScale(
    gray,
    faces,
    1.1,
    3,
    0,
    new cv.Size(80, 80),
    msize
  );

  faceRect = null;
  if (faces.size() > 0) {
    let best = faces.get(0);
    let bestArea = best.width * best.height;

    for (let i = 1; i < faces.size(); i++) {
      const r = faces.get(i);
      const area = r.width * r.height;
      if (area > bestArea) {
        best = r;
        bestArea = area;
      }
    }
    faceRect = { x: best.x, y: best.y, width: best.width, height: best.height };
  }

  src.delete();
  gray.delete();
  faces.delete();
  msize.delete();
}

function redraw() {
  if (!baseImg) return;

  outCtx.clearRect(0, 0, canvasOut.width, canvasOut.height);
  outCtx.drawImage(baseImg, 0, 0, canvasOut.width, canvasOut.height);

  if (!faceRect) return;

  if (selectedMustacheIdx < 0 || !mustaches[selectedMustacheIdx]) return;
  const mImg = mustaches[selectedMustacheIdx].img;
  if (!mImg || !mImg.complete) return;

  const scale = Number(scaleRange.value);  // доля ширины лица
  const dx = Number(xRange.value);         // доля ширины лица
  const yPos = Number(yRange.value);       // доля высоты лица

  const fw = faceRect.width;
  const fh = faceRect.height;

  const mustW = fw * scale;
  const mustH = mustW * (mImg.height / mImg.width);

  const centerX = faceRect.x + fw * 0.5 + fw * dx;
  const centerY = faceRect.y + fh * yPos;

  const x = centerX - mustW / 2;
  const y = centerY - mustH / 2;

  const xC = x * displayScale;
  const yC = y * displayScale;
  const wC = mustW * displayScale;
  const hC = mustH * displayScale;

  outCtx.drawImage(mImg, xC, yC, wC, hC);
}

function drawFaceBox() {
  const x = faceRect.x * displayScale;
  const y = faceRect.y * displayScale;
  const w = faceRect.width * displayScale;
  const h = faceRect.height * displayScale;

  outCtx.save();
  outCtx.strokeStyle = 'lime';
  outCtx.lineWidth = 2;
  outCtx.strokeRect(x, y, w, h);
  outCtx.restore();
}

async function loadMustaches() {
  mustaches = [];
  mustacheGrid.innerHTML = '';

  const candidates = [];
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(2, '0');
    candidates.push({ name: `m${num}`, src: `${MUSTACHE_DIR}m${num}.png` });
  }

  for (const item of candidates) {
    const img = await tryLoadImage(item.src);
    if (!img) continue;

    mustaches.push({ ...item, img });
  }

  if (mustaches.length === 0) {
    mustacheGrid.innerHTML = `<div class="hint small">Не нашла PNG усов в ${MUSTACHE_DIR}. Проверь имена файлов.</div>`;
    return;
  }

    mustaches.forEach((m, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mustache-item';
    btn.title = m.name;

    const thumb = document.createElement('img');
    thumb.src = m.src;
    thumb.alt = m.name;

    btn.appendChild(thumb);

    btn.addEventListener('click', () => {
      selectedMustacheIdx = idx;
      setActiveMustacheButton(idx);
      redraw();
    });

    mustacheGrid.appendChild(btn);
  });

  selectedMustacheIdx = 0;
  setActiveMustacheButton(0);
  redraw();
}

function setActiveMustacheButton(activeIdx) {
  const buttons = mustacheGrid.querySelectorAll('.mustache-item');
  buttons.forEach((b, i) => {
    if (i === activeIdx) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function tryLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function downloadPNG() {
  if (!baseImg) return;
  const a = document.createElement('a');
  a.download = 'mustache.png';
  a.href = canvasOut.toDataURL('image/png');
  a.click();
}