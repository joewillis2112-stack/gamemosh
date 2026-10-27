// The editor's Paint tool: brushes (web/paint/brush.js, PhotoCraft's engine)
// painted onto the model in the 3D view.
//   - On a MeshPart: through the mesh's own UVs into its TextureID.
//   - On a Part: onto the face under the pointer, into a Decal on that face (as
//     Roblox puts images on parts). The first stroke on a bare face adds the Decal.
// A stroke's image is kept as a PNG in the property, so it saves with the place,
// and a stroke (with the Decal it added) is one undo step. Left drag (one finger
// on a phone) paints; right drag, the wheel and two fingers still move the view.
// A stroke that crosses a UV seam (a jump in the texture) carries on as a new
// stroke from the far side, still within the same undo step.
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.js';
import { Stroke, image } from '../paint/brush.js';

const DECAL_SIZE = 512, MESH_SIZE = 1024;
const SEAM = 0.15; // a jump of this much of the texture between two samples is a UV seam
// A part's mesh is a unit box: the face a local normal points out of.
const FACE_OF = n => { const a = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)], k = a.indexOf(Math.max(...a)); return [n.x > 0 ? 'Right' : 'Left', n.y > 0 ? 'Top' : 'Bottom', n.z > 0 ? 'Back' : 'Front'][k]; };
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export class PaintTools {
  constructor({ scene, dm, world, commands, camera, canvas, bar, onState = () => {} }) {
    Object.assign(this, { scene, dm, world, commands, camera, canvas, bar, onState });
    this.active = false;
    this.settings = { size: 24, hardness: 0.8, opacity: 1, flow: 1, spacing: 0.1, color: [0.85, 0.15, 0.1, 1], erase: false, aliased: false };
    this.stroke = null;
    this.images = new WeakMap(); // instance -> Map of "prop|url" -> Promise of { img }
    this.buildBar();
    this.attachInput();
  }
  toggle(on = !this.active) { this.active = on; if (!on) this.end(); this.bar.hidden = !on; this.state(); }
  state() {
    this.bar.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', (b.dataset.p === 'erase' && this.settings.erase) || (b.dataset.p === 'pencil' && this.settings.aliased) || (b.dataset.p === 'brush' && !this.settings.erase && !this.settings.aliased)));
    this.onState({ active: this.active, ...this.settings });
  }
  get painting() { return !!this.stroke; }

  // ---- what the pointer is over: { inst, prop, mesh, uv, face? } or null (CSS px in the canvas)
  pick(x, y, only = null) {
    const cam = this.camera.cam;
    if (only) { // during a stroke: the same surface only
      const h = this.scene.pick(x, y, m => m === only.mesh, false, cam);
      return h && h.hit ? { ...only, uv: h.getTextureCoordinates() } : null;
    }
    const h = this.scene.pick(x, y, m => !!(m.metadata && m.metadata.instance) && m.isVisible, false, cam);
    if (!h || !h.hit) return null;
    const inst = h.pickedMesh.metadata.instance;
    if (inst.ClassName === 'MeshPart') return { inst, prop: 'TextureID', mesh: h.pickedMesh, uv: h.getTextureCoordinates(), flipV: false };
    if (inst.ClassName !== 'Part' || (inst.props.Shape && inst.props.Shape !== 'Block')) return null; // blocks only: their faces are flat
    const n = h.getNormal(true, true), inv = Matrix.Invert(h.pickedMesh.getWorldMatrix().getRotationMatrix());
    const face = FACE_OF(Vector3.TransformNormal(n, inv));
    return { inst, face, point: h.pickedPoint };
  }
  // A Part face's Decal and its plane (made when the stroke starts, if the face has none).
  decalFor(hit) {
    let decal = hit.inst.children.find(c => c.ClassName === 'Decal' && c.props.Face === hit.face), added = false;
    if (!decal) {
      decal = this.dm.create('Decal');
      this.dm.set(decal, 'Face', hit.face); this.dm.set(decal, 'Texture', blankPng(DECAL_SIZE)); this.dm.set(decal, 'Name', 'Paint');
      this.dm.setParent(decal, hit.inst); added = true;
    }
    const e = this.world.parts.get(hit.inst), mesh = e && (e.decals || []).find(p => p.metadata && p.metadata.decal === decal);
    return mesh ? { decal, added, mesh } : null;
  }

  // ---- the image being painted, loaded from the property (or a blank / the mesh's own texture)
  loadImage(target) {
    const url = target.owner.props[target.prop] || '', key = target.prop + '|' + url, cache = this.cacheOf(target.owner);
    if (!cache.has(key)) cache.set(key, (async () => {
      if (url) return imageFromUrl(this.world.resolveUrl(url));
      // An editable mesh is drawn in its part's Color until it has a texture: start from that.
      const e = this.world.parts.get(target.owner);
      if (e && e.meshPart && e.meshPart.editable) { const C = target.owner.props.Color; return { img: image(MESH_SIZE, MESH_SIZE, [C.r, C.g, C.b, 1]) }; }
      const base = target.mesh.material && (target.mesh.material.albedoTexture || (target.mesh.material.subMaterials || [])[0]?.albedoTexture);
      if (base && base.readPixels) { const s = base.getSize(), px = await base.readPixels(); if (px) return fromBytes(px, s.width, s.height); }
      return { img: image(MESH_SIZE, MESH_SIZE, [1, 1, 1, 1]) };
    })());
    return cache.get(key);
  }
  cacheOf(inst) {
    if (!this.images.has(inst)) this.images.set(inst, new Map());
    return this.images.get(inst);
  }

  // ---- a stroke
  async begin(x, y, pressure) {
    const hit = this.pick(x, y); if (!hit) return;
    let target;
    if (hit.prop) target = { owner: hit.inst, prop: hit.prop, mesh: hit.mesh, flipV: false, added: false };
    else { const d = this.decalFor(hit); if (!d) return; target = { owner: d.decal, prop: 'Texture', mesh: d.mesh, flipV: true, added: d.added, part: hit.inst }; }
    const s = this.stroke = { target, pending: [[x, y, pressure]], segments: [], img: null, last: null };
    const img = (await this.loadImage(target)).img;
    if (this.stroke !== s) return; // ended while loading
    s.img = { width: img.width, height: img.height, data: img.data.slice() }; // painted on a copy: the cached original stays for undo
    s.preview = RawTexture.CreateRGBATexture(new Uint8Array(img.width * img.height * 4), img.width, img.height, this.scene, false, target.flipV);
    s.preview.hasAlpha = true;
    const tex = materialsOf(target.mesh).map(m => m.albedoTexture).find(Boolean);
    s.wrapU = tex ? tex.wrapU : 1; s.wrapV = tex ? tex.wrapV : 1; // Texture.WRAP_ADDRESSMODE = 1, CLAMP = 0, MIRROR = 2
    s.preview.wrapU = s.wrapU; s.preview.wrapV = s.wrapV; // the preview tiles as the texture it stands in for
    for (const m of materialsOf(target.mesh)) { m._paintOrig = m._paintOrig ?? m.albedoTexture; m.albedoTexture = s.preview; }
    const q = s.pending; s.pending = null;
    for (const p of q) this.move(...p);
  }
  move(x, y, pressure) {
    const s = this.stroke; if (!s) return;
    if (s.pending) { s.pending.push([x, y, pressure]); return; }
    const h = this.pick(x, y, { mesh: s.target.mesh });
    if (!h || !h.uv) return;
    // UVs beyond 0..1 (a model tiling its texture, one tile per face) wrap as the texture does.
    const W = s.img.width, H = s.img.height, u = wrap(h.uv.x, s.wrapU), v0 = wrap(h.uv.y, s.wrapV), v = s.target.flipV ? 1 - v0 : v0;
    // Across a UV seam: finish this piece and start a new one from the far side.
    if (!s.cur || (s.last && Math.hypot(u - s.last[0], v - s.last[1]) > SEAM)) { if (s.cur) s.cur.finish(); s.cur = new Stroke(s.img, { ...this.settings, pressureSize: pressure !== null, seed: s.segments.length + 1 }); s.segments.push(s.cur); }
    s.last = [u, v];
    s.cur.push([[u * W, v * H, pressure ?? 1]]);
    s.cur.composite();
    upload(s.preview, s.img);
  }
  async end() {
    const s = this.stroke; this.stroke = null;
    if (!s) return;
    if (s.cur) { s.cur.finish(); upload(s.preview, s.img); }
    const t = s.target, painted = s.segments.some(g => g.dabCount > 0);
    if (!painted || !s.img) { // nothing painted: put things back as they were
      restoreMaterials(t.mesh); s.preview && s.preview.dispose();
      if (t.added) this.dm.setParent(t.owner, null);
      return;
    }
    const url = toPng(s.img);
    this.cacheOf(t.owner).set(t.prop + '|' + url, Promise.resolve({ img: s.img }));
    this.commands.history.run('Paint', tx => {
      if (t.added) { this.dm.set(t.owner, t.prop, ''); tx.ops.push({ op: 'parent', inst: t.owner, before: null, after: t.part }); }
      tx.set(t.owner, t.prop, url);
    });
    restoreMaterials(t.mesh); // the renderer has the new texture now (meshes may have been rebuilt)
    s.preview.dispose();
  }

  attachInput() {
    const c = this.canvas, local = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pres = e => e.pointerType === 'pen' ? Math.max(0.01, e.pressure) : null;
    const downs = new Set();
    c.addEventListener('pointerdown', e => {
      if (!this.active) return;
      downs.add(e.pointerId);
      if (downs.size > 1) { this.end(); return; } // a second finger: the view's
      if (e.button !== 0) return;
      this.begin(...local(e), pres(e));
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    }, true);
    c.addEventListener('pointermove', e => { if (this.active && this.stroke) this.move(...local(e), pres(e)); });
    const up = e => { downs.delete(e.pointerId); if (this.stroke) this.end(); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }

  buildBar() {
    const B = this.bar, S = this.settings;
    B.innerHTML = `<button data-p="brush">Brush</button><button data-p="pencil">Pencil</button><button data-p="erase">Eraser</button><span class="sep"></span>` +
      `<input type="color" data-k="color" value="${hex(S.color)}" title="Colour">` +
      [['size', 'Size', 1, 128, 1], ['hardness', 'Hardness', 0, 1, 0.05], ['opacity', 'Opacity', 0.05, 1, 0.05], ['flow', 'Flow', 0.05, 1, 0.05]]
        .map(([k, l, a, b, st]) => `<label>${l} <input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${S[k]}"></label>`).join('') +
      `<span class="sep"></span><button data-image title="Edit the selected Decal's, ImageLabel's or MeshPart's image flat, in layers">Image…</button><button data-done>Done</button>`;
    B.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.done !== undefined) return this.toggle(false);
      if (b.dataset.image !== undefined) return this.onImage && this.onImage();
      const p = b.dataset.p; if (!p) return;
      S.erase = p === 'erase'; S.aliased = p === 'pencil';
      if (p === 'pencil') { S.size = Math.min(S.size, 4); B.querySelector('[data-k=size]').value = S.size; }
      this.state();
    });
    B.addEventListener('input', e => {
      const k = e.target.dataset.k; if (!k) return;
      if (k === 'color') S.color = [...unhex(e.target.value), 1]; else S[k] = +e.target.value;
      this.state();
    });
  }
}

// ---- helpers

// A texture coordinate into 0..1 by the texture's address mode (Babylon's: 0 clamp, 1 wrap, 2 mirror).
function wrap(t, mode) {
  if (mode === 0) return Math.min(Math.max(t, 0), 1);
  const f = t - Math.floor(t);
  return mode === 2 && Math.floor(t) % 2 !== 0 ? 1 - f : f;
}
function materialsOf(mesh) { const m = mesh.material; return !m ? [] : m.subMaterials ? m.subMaterials.filter(Boolean) : [m]; }
function restoreMaterials(mesh) { for (const m of materialsOf(mesh)) if ('_paintOrig' in m) { if (m.albedoTexture && m.albedoTexture.getClassName && m.albedoTexture.getClassName() === 'RawTexture') m.albedoTexture = m._paintOrig; delete m._paintOrig; } }
export function toBytes(img) { const b = new Uint8Array(img.width * img.height * 4); for (let i = 0; i < b.length; i++) b[i] = Math.round(Math.min(Math.max(img.data[i], 0), 1) * 255); return b; }
function fromBytes(px, w, h) { const d = new Float32Array(w * h * 4); for (let i = 0; i < d.length; i++) d[i] = px[i] / 255; return { img: { width: w, height: h, data: d } }; }
function upload(tex, img) { tex.update(toBytes(img)); }
export function toPng(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'), id = g.createImageData(img.width, img.height); id.data.set(toBytes(img)); g.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}
const blanks = new Map();
function blankPng(n) { if (!blanks.has(n)) blanks.set(n, toPng(image(n, n))); return blanks.get(n); }
export function imageFromUrl(url) {
  return new Promise((ok, bad) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); ok(fromBytes(g.getImageData(0, 0, im.width, im.height).data, im.width, im.height)); };
    im.onerror = () => bad(new Error('could not load ' + url.slice(0, 64)));
    im.src = url;
  });
}
