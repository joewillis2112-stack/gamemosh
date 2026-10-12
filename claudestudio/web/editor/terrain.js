// The Terrain Editor (Roblox Studio's Add, Subtract, Paint, Smooth, Flatten):
// with the Terrain tool on, a left drag (one finger on a phone) paints the
// brush (terrain/brush.js) where the pointer meets the ground or a part; the
// whole stroke is one undo step. Right drag, the wheel and two fingers still
// move the view. Flatten levels to the height the stroke started at.
import { Color3, Vector3 } from '@babylonjs/core/Maths/math.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { dab, restore, BRUSHES } from '../terrain/brush.js';
import { TERRAIN_MATERIALS } from '../terrain/voxels.js';

const TINT = { add: [0.2, 0.8, 0.3], subtract: [0.9, 0.3, 0.2], paint: [0.3, 0.5, 1], smooth: [0.9, 0.8, 0.3], flatten: [0.8, 0.4, 0.9] };
const LABEL = { add: 'Add', subtract: 'Subtract', paint: 'Paint', smooth: 'Smooth', flatten: 'Flatten' };

export class TerrainTools {
  constructor({ scene, dm, commands, camera, layer, canvas, bar, onState = () => {} }) {
    Object.assign(this, { scene, dm, commands, camera, layer, canvas, bar, onState });
    this.active = false; this.tool = 'add'; this.material = 'Grass'; this.radius = 8; this.strength = 0.5;
    this.stroke = null;
    const us = layer.utilityLayerScene;
    this.cursorMat = new StandardMaterial('brush', us); this.cursorMat.disableLighting = true; this.cursorMat.alpha = 0.25;
    this.cursor = MeshBuilder.CreateSphere('brush', { diameter: 2, segments: 16 }, us);
    this.cursor.material = this.cursorMat; this.cursor.isPickable = false; this.cursor.setEnabled(false);
    this.buildBar();
    this.attachInput();
  }
  terrain() { return this.dm.workspace.children.find(c => c.ClassName === 'Terrain'); }
  toggle(on = !this.active) { this.active = on; if (!on) { this.end(); this.cursor.setEnabled(false); } this.bar.hidden = !on; this.state(); }
  setTool(t) { if (BRUSHES.includes(t)) { this.tool = t; this.state(); } }
  state() {
    this.bar.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('on', b.dataset.brush === this.tool));
    const c = TINT[this.tool]; this.cursorMat.emissiveColor = new Color3(...c);
    this.onState({ active: this.active, tool: this.tool, material: this.material, radius: this.radius, strength: this.strength });
  }

  // Where the pointer meets the ground, a part or terrain (CSS px in the canvas), or null.
  hit(x, y) {
    const h = this.scene.pick(x, y, m => !!(m.metadata && m.metadata.instance) && m.isVisible, false, this.camera.cam);
    return h && h.hit ? h.pickedPoint : null;
  }
  // ---- a stroke: dabs along the drag, then one undo step
  begin(p) { this.stroke = { changes: [], last: null, planeY: p.y }; this.dabAt(p); }
  dabAt(p) {
    const s = this.stroke; if (!s) return;
    if (s.last && Vector3.Distance(s.last, p) < Math.max(0.5, this.radius * 0.3)) return; // spacing
    s.last = p.clone();
    const t = this.terrain();
    s.changes.push(...dab(t.voxels, this.tool, { x: p.x, y: p.y, z: p.z }, this.radius, { strength: this.strength, material: this.material, planeY: s.planeY }));
    this.dm.notify(t, 'Voxels');
  }
  end() {
    const s = this.stroke; this.stroke = null;
    if (!s || !s.changes.length) return;
    const t = this.terrain(), changes = s.changes, back = side => { restore(t.voxels, changes, side); this.dm.notify(t, 'Voxels'); };
    this.commands.history.run('Terrain ' + LABEL[this.tool], tx => tx.custom(() => back('before'), () => back('after')));
  }
  get painting() { return !!this.stroke; }

  attachInput() {
    const c = this.canvas, local = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const downs = new Set();
    c.addEventListener('pointerdown', e => {
      if (!this.active) return;
      downs.add(e.pointerId);
      if (downs.size > 1) { this.end(); return; } // a second finger: the view's
      if (e.button !== 0) return;
      const p = this.hit(...local(e));
      if (p) { this.begin(p); c.setPointerCapture && c.setPointerCapture(e.pointerId); }
    }, true);
    c.addEventListener('pointermove', e => {
      if (!this.active) return;
      const p = this.hit(...local(e));
      this.cursor.setEnabled(!!p);
      if (p) { this.cursor.position.copyFrom(p); this.cursor.scaling.setAll(this.radius); }
      if (this.stroke && p) this.dabAt(p);
    });
    const up = e => { downs.delete(e.pointerId); if (this.stroke) this.end(); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }

  buildBar() {
    const B = this.bar;
    B.innerHTML = BRUSHES.map(b => `<button data-brush="${b}">${LABEL[b]}</button>`).join('') +
      `<span class="sep"></span><select data-t="material">${TERRAIN_MATERIALS.slice(1).map(m => `<option${m === this.material ? ' selected' : ''}>${m}</option>`).join('')}</select>` +
      `<label>Size <input type="range" data-t="radius" min="2" max="32" step="1" value="${this.radius}"></label>` +
      `<label>Strength <input type="range" data-t="strength" min="0.1" max="1" step="0.05" value="${this.strength}"></label>` +
      `<span class="sep"></span><button data-done>Done</button>`;
    B.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.brush) this.setTool(b.dataset.brush); else if (b.dataset.done !== undefined) this.toggle(false); });
    B.addEventListener('input', e => { const k = e.target.dataset.t; if (k === 'radius' || k === 'strength') { this[k] = +e.target.value; this.state(); } });
    B.addEventListener('change', e => { if (e.target.dataset.t === 'material') { this.material = e.target.value; this.state(); } });
  }
}
