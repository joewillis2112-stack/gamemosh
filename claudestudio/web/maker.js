// The character maker page: a 2D reference becomes the blocky character's
// skin (runtime/charmaker.js), previewed on the real character, playable.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/index.js';
import { createRenderer, groundDisc } from './render.js';
import { silhouette, findParts, rigFromGlb, makeSkin } from './runtime/charmaker.js';
import { parseGlb } from './runtime/glb.js';
import { applySkin } from './runtime/skin.js';

const MODEL = '../assets/characters/character-a.glb', TEXTURE = '../assets/characters/Textures/texture-a.png';
const SAMPLES = ['male-adventurer', 'female-person', 'robot', 'zombie', 'soldier'].map(n => `../test/fixtures/characters/${n}.png`);
const PARTS = { head: '#ff5d5d', torso: '#5fd18b', armLeft: '#5aa9ff', armRight: '#f0b35a', legLeft: '#c77dff', legRight: '#3dd6d0' };
const MAX_SIDE = 512; // references are scaled down to this for speed
const state = { img: null, parts: null, headPx: 16, skinUrl: null, busy: false };
window.maker = state;

const $ = id => document.getElementById(id);
const refCanvas = $('ref'), status = $('status');

// ---------------------------------------------------------------- 3D preview
const view = $('view');
const R = createRenderer(view, { skyUrl: '../assets/sky/sky_1k_nosun.hdr', preserveDrawingBuffer: true });
const { scene, engine, shadows } = R;
groundDisc(scene, shadows, 12);
const cam = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2.2, 14, new Vector3(0, 2.4, 0), scene);
cam.lowerRadiusLimit = 4; cam.upperRadiusLimit = 20; cam.wheelPrecision = 30; cam.minZ = 0.05;
cam.attachControl(view, true);
scene.activeCamera = cam; R.attachCamera(cam);
let character = null, rig = null, base = null, spin = true;
view.addEventListener('pointerdown', () => { spin = false; });
scene.onBeforeRenderObservable.add(() => { if (spin) cam.alpha += engine.getDeltaTime() * 0.0004; });

async function loadModel() {
  const [glbBuf, res, tex] = await Promise.all([
    fetch(MODEL).then(r => r.arrayBuffer()),
    SceneLoader.ImportMeshAsync('', MODEL.slice(0, MODEL.lastIndexOf('/') + 1), MODEL.slice(MODEL.lastIndexOf('/') + 1), scene),
    imageData(TEXTURE),
  ]);
  const glb = parseGlb(glbBuf);
  base = tex.data;
  // Feet on the ground, 5 studs tall, like the player.
  const root = res.meshes[0]; root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(true), s = 5 / (max.y - min.y);
  root.scaling.scaleInPlace(s); root.position.y -= min.y * s;
  res.animationGroups.forEach(g => g.stop());
  const idle = res.animationGroups.find(g => g.name === 'idle'); if (idle) idle.start(true);
  res.meshes.forEach(m => { if (m.getTotalVertices() > 0) shadows.addShadowCaster(m); });
  character = res; rig = glb;
}

// ---------------------------------------------------------------- reference
function imageData(src) {
  return new Promise((ok, bad) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = k < 1; g.drawImage(im, 0, 0, w, h);
      ok(g.getImageData(0, 0, w, h));
    };
    im.onerror = () => bad(new Error('could not read that image'));
    im.src = src;
  });
}

// Reference drawn to fit the canvas; boxes over it. fit maps image px <-> canvas px.
let fit = { k: 1, ox: 0, oy: 0 };
function drawRef() {
  const dpr = window.devicePixelRatio || 1, W = refCanvas.clientWidth * dpr, H = refCanvas.clientHeight * dpr;
  refCanvas.width = W; refCanvas.height = H;
  const g = refCanvas.getContext('2d'); g.clearRect(0, 0, W, H);
  if (!state.img) return;
  const { width: iw, height: ih } = state.img, k = Math.min(W / iw, H / ih) * 0.94;
  fit = { k, ox: (W - iw * k) / 2, oy: (H - ih * k) / 2, dpr };
  const c = document.createElement('canvas'); c.width = iw; c.height = ih; c.getContext('2d').putImageData(state.img, 0, 0);
  g.imageSmoothingEnabled = false; g.drawImage(c, fit.ox, fit.oy, iw * k, ih * k);
  g.lineWidth = 2 * dpr; g.font = `${11 * dpr}px system-ui`;
  for (const [name, col] of Object.entries(PARTS)) {
    const r = state.parts[name]; g.strokeStyle = col; g.fillStyle = col;
    g.strokeRect(fit.ox + r.x0 * k, fit.oy + r.y0 * k, (r.x1 - r.x0) * k, (r.y1 - r.y0) * k);
  }
}

// Drag the nearest box edge (within 14 css px).
let drag = null;
refCanvas.addEventListener('pointerdown', e => {
  if (!state.parts) return;
  const p = toImage(e), tol = 14 * fit.dpr / fit.k;
  let best = null;
  for (const name of Object.keys(PARTS)) {
    const r = state.parts[name];
    for (const edge of ['x0', 'x1', 'y0', 'y1']) {
      const horiz = edge[0] === 'y', along = horiz ? p.x >= r.x0 - tol && p.x <= r.x1 + tol : p.y >= r.y0 - tol && p.y <= r.y1 + tol;
      const d = Math.abs((horiz ? p.y : p.x) - r[edge]);
      if (along && d <= tol && (!best || d < best.d)) best = { name, edge, d };
    }
  }
  if (best) { drag = best; refCanvas.setPointerCapture(e.pointerId); }
});
refCanvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toImage(e), r = state.parts[drag.name], v = Math.round(drag.edge[0] === 'x' ? p.x : p.y);
  r[drag.edge] = Math.max(0, Math.min(drag.edge[0] === 'x' ? state.img.width : state.img.height, v));
  drawRef();
});
refCanvas.addEventListener('pointerup', () => { if (drag) { drag = null; rebuild(); } });
function toImage(e) {
  const b = refCanvas.getBoundingClientRect(), x = (e.clientX - b.left) * fit.dpr, y = (e.clientY - b.top) * fit.dpr;
  return { x: (x - fit.ox) / fit.k, y: (y - fit.oy) / fit.k };
}

// ---------------------------------------------------------------- making the skin
async function useReference(src) {
  try {
    state.img = await imageData(src);
    const found = findParts(state.img, silhouette(state.img));
    state.parts = found; state.found = found.found;
    drawRef();
    await rebuild();
  } catch (e) { status.textContent = e.message; }
}
async function rebuild() {
  if (!state.img || !rig) return;
  const t0 = performance.now();
  const { skin } = makeSkin(state.img, state.parts, rigFromGlb(rig, state.headPx), { base });
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(skin.buffer), 1024, 1024), 0, 0);
  state.skinUrl = c.toDataURL('image/png');
  await applySkin(scene, character.meshes, state.skinUrl);
  const f = state.found, tag = (k, label) => `<span class="${f[k] ? 'found' : 'assumed'}">${label} ${f[k] ? 'found' : 'assumed'}</span>`;
  status.innerHTML = `${tag('neck', 'neck')} · ${tag('arms', 'arms')} · ${tag('legs', 'legs')} · ${Math.round(performance.now() - t0)} ms`;
  state.ready = (state.ready || 0) + 1;
}

// ---------------------------------------------------------------- controls
const samples = $('samples');
SAMPLES.forEach((src, i) => {
  const im = document.createElement('img'); im.src = src; im.alt = 'sample ' + (i + 1);
  im.onclick = () => { samples.querySelectorAll('img').forEach(x => x.classList.toggle('on', x === im)); useReference(src); };
  samples.appendChild(im);
});
$('file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  samples.querySelectorAll('img').forEach(x => x.classList.remove('on'));
  useReference(URL.createObjectURL(f));
});
const detail = $('detail');
for (const [px, label] of [[8, 'Minecraft · 8'], [16, '16'], [32, 'Fine · 32']]) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.px = px; b.classList.toggle('on', px === state.headPx);
  b.onclick = () => { state.headPx = px; detail.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); rebuild(); };
  detail.appendChild(b);
}
$('download').onclick = () => { if (!state.skinUrl) return; const a = document.createElement('a'); a.href = state.skinUrl; a.download = 'character-skin.png'; a.click(); };
$('play').onclick = () => {
  if (!state.skinUrl) return;
  try { sessionStorage.setItem('studio.skin', state.skinUrl); } catch (e) { status.textContent = 'could not hand the skin to the game: ' + e.message; return; }
  location.href = 'play.html?skin=session';
};
window.addEventListener('resize', () => { engine.resize(); drawRef(); });

(async () => {
  await R.ready;
  await loadModel();
  engine.runRenderLoop(() => scene.render());
  samples.firstChild.click();
})().catch(e => { status.textContent = e.message; });
