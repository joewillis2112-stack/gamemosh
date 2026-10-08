// The asset gate's turntable: load one asset, normalise it to studs, render
// it from five fixed views under the shared look, measure it, and compose a
// contact sheet. Driven by tools/turntable.mjs (Playwright).
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import '@babylonjs/loaders/glTF/2.0/index.js';
import { createRenderer, groundDisc } from './render.js';
import { poseRotations } from './runtime/poses.js';

const q = new URLSearchParams(location.search);
const url = q.get('asset');
const targetHeight = parseFloat(q.get('height') || '5'); // studs
const animName = q.get('anim') || '';
const animT = parseFloat(q.get('t') || '0'); // 0..1 through the clip
const W = 512, H = 512;

const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const R = createRenderer(canvas, { skyUrl: q.get('nosky') ? null : (q.get('sky') || '../assets/sky/sky_1k.hdr'), preserveDrawingBuffer: true, post: !q.get('nopost'), skybox: !q.get('noskybox') });
const { scene, engine, shadows } = R;
const ground = groundDisc(scene, shadows, 20);

const cam = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2.15, 12, new Vector3(0, 2.5, 0), scene);
cam.fov = 0.6; cam.minZ = 0.05; cam.maxZ = 3000;
scene.activeCamera = cam;
R.attachCamera(cam);

async function main() {
  await R.ready;
  const cut = url.lastIndexOf('/') + 1;
  const res = await SceneLoader.ImportMeshAsync('', url.slice(0, cut), url.slice(cut), scene);
  const root = res.meshes[0];
  // Rest pose, recorded once: clips only key some channels, so every pose
  // change starts from rest (a clip must never inherit the last clip's pose).
  res.animationGroups.forEach(g => g.stop());
  const posed = res.transformNodes.concat(res.meshes);
  const rest = posed.map(n => [n.position.clone(), n.rotationQuaternion ? n.rotationQuaternion.clone() : null, n.rotation.clone(), n.scaling.clone()]);
  const toRest = () => {
    res.animationGroups.forEach(g => g.stop());
    posed.forEach((n, i) => { const [p, qq, e, sc] = rest[i]; n.position.copyFrom(p); if (qq) n.rotationQuaternion = qq.clone(); else n.rotation.copyFrom(e); n.scaling.copyFrom(sc); });
  };
  const pose = (g, t) => { toRest(); g.start(false, 1, g.from, g.to); g.goToFrame(g.from + (g.to - g.from) * t); g.pause(); };
  const clip = res.animationGroups.find(g => g.name === animName);
  // A held pose from runtime/poses.js (?pose=jump), applied over rest.
  const heldPose = q.get('pose');
  const applyHeld = () => {
    if (!heldPose) return;
    const restOf = name => { const i = posed.findIndex(n => n.name === name); return i < 0 ? null : (rest[i][1] || Quaternion.FromEulerVector(rest[i][2])); };
    for (const [name, rq] of Object.entries(poseRotations(heldPose, restOf))) posed.find(n => n.name === name).rotationQuaternion = rq;
  };
  if (clip) pose(clip, animT);
  applyHeld();
  scene.render();

  // Normalise: base on the ground, centred, height = targetHeight studs.
  root.computeWorldMatrix(true);
  let { min, max } = root.getHierarchyBoundingVectors(true);
  const rawSize = max.subtract(min);
  const s = targetHeight / rawSize.y;
  root.scaling.scaleInPlace(s);
  root.computeWorldMatrix(true);
  ({ min, max } = root.getHierarchyBoundingVectors(true));
  root.position.subtractInPlace(new Vector3((min.x + max.x) / 2, min.y, (min.z + max.z) / 2));
  root.computeWorldMatrix(true);
  ({ min, max } = root.getHierarchyBoundingVectors(true));
  const meshes = res.meshes.filter(m => m.getTotalVertices() > 0);
  meshes.forEach(m => { shadows.addShadowCaster(m); m.receiveShadows = true; });

  // Checks in code.
  const metrics = { asset: url, anim: animName || '(bind pose)', t: animT, rawSize: rawSize.asArray().map(r), scale: r(s),
    bbox: { min: min.asArray().map(r), max: max.asArray().map(r) }, heightStuds: r(max.y - min.y),
    groundGap: r(min.y), meshes: meshes.length, triangles: 0, inwardFaces: [], animations: res.animationGroups.map(g => g.name) };
  for (const m of meshes) {
    const pos = m.getVerticesData(VertexBuffer.PositionKind), idx = m.getIndices();
    if (!pos || !idx) continue;
    metrics.triangles += idx.length / 3;
    // Faces whose normal points at the mesh centre: inside-out geometry (works for boxy parts).
    let cx = 0, cy = 0, cz = 0; const n = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
    cx /= n; cy /= n; cz /= n;
    let inward = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const fx = (pos[a] + pos[b] + pos[c]) / 3 - cx, fy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy, fz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
      // glTF winding is counter-clockwise; Babylon flips handedness on import, so test against both and report.
      if (nx * fx + ny * fy + nz * fz < 0) inward++;
    }
    metrics.inwardFaces.push([m.name, inward, idx.length / 3]);
  }

  // Loops: a looping clip's last frame must equal its first (no pop).
  const loopPop = {};
  for (const gclip of res.animationGroups) {
    const snap = () => res.transformNodes.concat(res.meshes).map(n => [n.position.clone(), (n.rotationQuaternion || n.rotation).clone()]);
    pose(gclip, 0); scene.render();
    const a = snap();
    gclip.goToFrame(gclip.to); scene.render();
    const b = snap();
    let d = 0;
    a.forEach(([p, q], i) => { d = Math.max(d, p.subtract(b[i][0]).length(), Math.abs(q.x - b[i][1].x), Math.abs(q.y - b[i][1].y), Math.abs(q.z - b[i][1].z)); });
    loopPop[gclip.name] = r(d);
  }
  metrics.loopPop = loopPop;
  toRest();
  if (clip) pose(clip, animT);
  applyHeld();

  // Five views. glTF characters face +Z.
  const h = max.y - min.y, w = Math.max(max.x - min.x, max.z - min.z, h * 0.6);
  const radius = Math.max(h, w) * 1.9;
  cam.radius = radius;
  cam.target = new Vector3(0, h / 2, 0);
  const views = [
    ['front', Math.PI / 2, Math.PI / 2.15],
    ['side (its left, from +X)', 0, Math.PI / 2.15],
    ['back', -Math.PI / 2, Math.PI / 2.15],
    ['top', Math.PI / 2, 0.08],
    ['below', Math.PI / 2, Math.PI - 0.08],
  ];
  const strip = q.get('strip'); // e.g. strip=walk: 6 frames of one clip from three-quarter
  if (strip) {
    const sc = res.animationGroups.find(g => g.name === strip);
    views.length = 0;
    for (let i = 0; i < 6; i++) views.push([`${strip} ${i}/6`, Math.PI / 3, Math.PI / 2.3, sc, i / 6]);
  }
  if (q.get('extra')) views.push(['below-angled', Math.PI / 2 + 0.5, Math.PI * 0.72], ['three-quarter', Math.PI / 4, Math.PI / 2.6]);
  const shots = [];
  for (const [name, alpha, beta, sclip, st] of views) {
    cam.alpha = alpha; cam.beta = beta;
    if (sclip) pose(sclip, st);
    ground.isVisible = name !== 'below';
    await scene.whenReadyAsync();
    for (let i = 0; i < 4; i++) scene.render(); // let shadows and post settle
    await scene.whenReadyAsync();
    scene.render();
    shots.push([name, canvas.toDataURL('image/png')]);
  }
  // Contact sheet: 3 x 2 with labels and the metrics.
  const sheet = document.createElement('canvas');
  sheet.width = W * 3; sheet.height = H * (shots.length > 5 ? 3 : 2);
  const g = sheet.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < shots.length; i++) {
    const img = new Image(); img.src = shots[i][1]; await img.decode();
    const x = (i % 3) * W, y = Math.floor(i / 3) * H;
    g.drawImage(img, x, y);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, W, 30);
    g.fillStyle = '#fff'; g.font = '20px sans-serif'; g.fillText(shots[i][0], x + 10, y + 22);
  }
  g.fillStyle = '#ddd'; g.font = '15px monospace';
  const lines = [`asset ${url.split('/').pop()}  pose ${heldPose || metrics.anim} @${animT}`, `height ${metrics.heightStuds} studs  ground gap ${metrics.groundGap}`,
    `raw ${metrics.rawSize.join(' x ')}  scale ${metrics.scale}`, `meshes ${metrics.meshes}  tris ${metrics.triangles}`,
    ...metrics.inwardFaces.map(([n, a, t]) => `  ${n}: ${a}/${t} faces point inward`), 'loop pop (0 = seamless): ' + Object.entries(loopPop).filter(([k]) => /idle|walk|sprint/.test(k)).map(([k, v]) => k + ' ' + v).join(', ')];
  let y = H + 30; const tx = shots.length > 5 ? 0 : W * 2; if (shots.length > 5) y = H * 2 + 30;
  for (const l of lines) { for (const part of wrap(l, 58)) { g.fillText(part, (shots.length > 5 ? W * 2 : W * 2) + 12, y); y += 20; } }
  window.result = { metrics, sheet: sheet.toDataURL('image/png'), views: shots };
}
function r(x) { return Math.round(x * 1000) / 1000; }
function wrap(s, n) { const o = []; while (s.length > n) { o.push(s.slice(0, n)); s = '  ' + s.slice(n); } o.push(s); return o; }
main().catch(e => { window.result = { error: String(e && e.stack || e) }; });
