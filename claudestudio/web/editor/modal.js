// Blender's modal transforms (ArtCraft ports its grab as ModalTransformController;
// this adds rotate and scale): with parts selected, press
//   G to grab (move), R to rotate, S to scale,
// then move the mouse. X, Y or Z constrains to that world axis (Shift+X/Y/Z: to
// the plane without it); typing a number sets the amount exactly (studs, degrees
// or a factor; - flips it); Enter or a left click confirms, Esc or a right click
// cancels and puts everything back. Snapped to the grid like the gizmos; hold
// Shift for free movement. One undoable step when confirmed.
import { Vector3, Plane, Matrix, Quaternion } from '@babylonjs/core/Maths/math.js';
import { CF } from '../cframe.js';
import { V3 } from '../datamodel.js';
import { SNAP, allParts, centre } from './commands.js';

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
const KEYS = { KeyG: 'grab', KeyR: 'rotate', KeyS: 'scale' };
const MIN_SIZE = 0.001;

export class ModalTransform {
  constructor(dm, commands, camera, canvas, onState = () => {}) {
    this.dm = dm; this.commands = commands; this.camera = camera; this.canvas = canvas; this.onState = onState;
    this.mode = null; this.mouse = [0, 0];
    canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); this.mouse = [e.clientX - r.left, e.clientY - r.top]; this.free = e.shiftKey; if (this.mode) this.update(); }); // Shift held while moving: no snapping
    canvas.addEventListener('pointerdown', e => { if (!this.mode) return; e.stopImmediatePropagation(); e.button === 2 ? this.cancel() : this.confirm(); this.swallowUp = true; }, true);
    canvas.addEventListener('pointerup', e => { if (this.swallowUp) { this.swallowUp = false; e.stopImmediatePropagation(); } }, true);
    addEventListener('keydown', e => this.key(e), true);
  }
  get active() { return !!this.mode; }

  key(e) {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.blocked && this.blocked()) return; // e.g. Edit Mode has the keys
    if (!this.mode) {
      if (KEYS[e.code] && !this.camera.flying()) { if (this.start(KEYS[e.code])) { e.preventDefault(); e.stopImmediatePropagation(); } }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === 'Escape') return this.cancel();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') return this.confirm();
    const a = { KeyX: 'x', KeyY: 'y', KeyZ: 'z' }[e.code];
    if (a) { this.axis = this.axis === a && this.exclude === e.shiftKey ? null : a; this.exclude = e.shiftKey && !!this.axis; return this.update(); }
    if (/^[0-9.]$/.test(e.key)) { this.typed += e.key; return this.update(); }
    if (e.key === '-') { this.negate = !this.negate; return this.update(); }
    if (e.code === 'Backspace') { this.typed = this.typed.slice(0, -1); return this.update(); }
  }

  // Keyboard-driven tests and the toolbar call these directly.
  start(mode, at = null) {
    const parts = allParts(this.commands.selection.items).filter(p => p.props.CFrame);
    if (!parts.length) return false;
    if (at) this.mouse = at;
    this.mode = mode; this.axis = null; this.exclude = false; this.typed = ''; this.negate = false; this.free = false;
    this.parts = parts.map(p => ({ inst: p, cf: p.props.CFrame, size: p.props.Size }));
    const c = centre(parts); this.c = new Vector3(c.x, c.y, c.z);
    this.m0 = [...this.mouse];
    this.p0 = this.planePoint(this.m0);
    this.update();
    return true;
  }
  setMouse(x, y) { this.mouse = [x, y]; if (this.mode) this.update(); }
  setAxis(a, exclude = false) { this.axis = a; this.exclude = exclude && !!a; if (this.mode) this.update(); }
  type(s) { this.typed = s.replace('-', ''); this.negate = s.startsWith('-'); if (this.mode) this.update(); }

  // The point under the mouse on the drag surface: the plane through the centre facing the
  // camera, or (constrained) the plane without the axis / the axis line itself.
  planePoint([x, y]) {
    const ray = this.camera.ray(x, y), o = ray.origin, d = ray.dir;
    let n = this.camera.forward().scale(-1);
    if (this.axis && this.exclude) n = AXES[this.axis];
    else if (this.axis) { const a = AXES[this.axis], side = Vector3.Cross(a, Vector3.Cross(d, a)); if (side.lengthSquared() > 1e-8) n = side.normalize(); }
    const pl = Plane.FromPositionAndNormal(this.c, n), t = -(Vector3.Dot(pl.normal, o) + pl.d) / Vector3.Dot(pl.normal, d);
    return isFinite(t) && t > 0 ? o.add(d.scale(t)) : this.c.clone();
  }
  screenOf(p) { const s = this.camera.scale(), sc = this.camera.scene, c = this.canvas, q = Vector3.Project(p, Matrix.Identity(), sc.getTransformMatrix(), this.camera.cam.viewport.toGlobal(c.width, c.height)); return [q.x / s, q.y / s]; }

  update() {
    const typed = this.typed !== '' ? parseFloat(this.typed) * (this.negate ? -1 : 1) : null, snap = !this.free;
    const changes = [];
    if (this.mode === 'grab') {
      let d;
      if (typed !== null && isFinite(typed)) d = AXES[this.axis || 'x'].scale(typed);
      else {
        this.p0 = this.p0 && this.lastAxis === `${this.axis}${this.exclude}` ? this.p0 : this.planePoint(this.m0);
        this.lastAxis = `${this.axis}${this.exclude}`;
        d = this.planePoint(this.mouse).subtract(this.p0);
        if (this.axis && !this.exclude) d = AXES[this.axis].scale(Vector3.Dot(d, AXES[this.axis]));
        if (this.axis && this.exclude) d = d.subtract(AXES[this.axis].scale(Vector3.Dot(d, AXES[this.axis])));
        if (snap) d = new Vector3(...[d.x, d.y, d.z].map(v => Math.round(v / SNAP.move) * SNAP.move));
      }
      for (const p of this.parts) changes.push([p, p.cf.withPosition(p.cf.x + d.x, p.cf.y + d.y, p.cf.z + d.z), p.size]);
      this.amount = `${fmt(d.x)}, ${fmt(d.y)}, ${fmt(d.z)}`;
    } else if (this.mode === 'rotate') {
      let deg;
      if (typed !== null && isFinite(typed)) deg = typed;
      else {
        const cs = this.screenOf(this.c), a0 = Math.atan2(this.m0[1] - cs[1], this.m0[0] - cs[0]), a1 = Math.atan2(this.mouse[1] - cs[1], this.mouse[0] - cs[0]);
        deg = -(a1 - a0) * 180 / Math.PI; // screen y is down: dragging clockwise turns clockwise as seen
        if (snap) deg = Math.round(deg / SNAP.rotate) * SNAP.rotate;
      }
      // About the axis, or the view axis; seen from the camera, a positive turn is anticlockwise.
      let axis = this.axis ? AXES[this.axis].clone() : this.camera.forward().scale(-1);
      if (this.axis && Vector3.Dot(axis, this.camera.forward()) > 0) axis = axis.scale(-1);
      const q = Quaternion.RotationAxis(axis, deg * Math.PI / 180), R = new Matrix(); q.toRotationMatrix(R);
      for (const p of this.parts) {
        const off = p.cf, rel = new Vector3(off.x - this.c.x, off.y - this.c.y, off.z - this.c.z), np = Vector3.TransformCoordinates(rel, R).add(this.c);
        const qp = new Quaternion(...off.toQuat()), nq = q.multiply(qp);
        changes.push([p, CF.fromQuat(np.x, np.y, np.z, nq.x, nq.y, nq.z, nq.w), p.size]);
      }
      this.amount = `${fmt(deg)}°`;
    } else if (this.mode === 'scale') {
      let f;
      if (typed !== null && isFinite(typed)) f = typed;
      else { const cs = this.screenOf(this.c), r0 = Math.hypot(this.m0[0] - cs[0], this.m0[1] - cs[1]) || 1; f = Math.hypot(this.mouse[0] - cs[0], this.mouse[1] - cs[1]) / r0; if (snap) f = Math.max(0.1, Math.round(f * 10) / 10); }
      const k = { x: this.axis === 'x' || !this.axis || (this.exclude && this.axis !== 'x'), y: this.axis === 'y' || !this.axis || (this.exclude && this.axis !== 'y'), z: this.axis === 'z' || !this.axis || (this.exclude && this.axis !== 'z') };
      if (this.exclude) k[this.axis] = false;
      for (const p of this.parts) {
        const m = p.cf.m, rel = [p.cf.x - this.c.x, p.cf.y - this.c.y, p.cf.z - this.c.z];
        const np = rel.map((v, i) => this.c.asArray()[i] + v * ([k.x, k.y, k.z][i] ? f : 1));
        // A part's size scales along its own axes by how much each lines up with a scaled world axis.
        const s = [p.size.x, p.size.y, p.size.z].map((v, j) => { const col = [m[3 + j], m[6 + j], m[9 + j]], w = col[0] ** 2 * (k.x ? 1 : 0) + col[1] ** 2 * (k.y ? 1 : 0) + col[2] ** 2 * (k.z ? 1 : 0); return Math.max(MIN_SIZE, v * (1 + (f - 1) * w)); });
        changes.push([p, p.cf.withPosition(...np), new V3(...s)]);
      }
      this.amount = `×${fmt(f)}`;
    }
    for (const [p, cf, size] of changes) { this.dm.set(p.inst, 'Size', size); this.dm.set(p.inst, 'CFrame', cf); }
    this.onState(this.describe());
  }
  describe() { return this.mode ? `${{ grab: 'Grab', rotate: 'Rotate', scale: 'Scale' }[this.mode]}${this.axis ? ` along ${this.exclude ? 'not ' : ''}${this.axis.toUpperCase()}` : ''}: ${this.typed ? (this.negate ? '-' : '') + this.typed : this.amount}` : ''; }

  confirm() {
    if (!this.mode) return;
    const label = { grab: 'Move', rotate: 'Rotate', scale: 'Resize' }[this.mode];
    const changes = this.parts.flatMap(p => [{ inst: p.inst, key: 'Size', before: p.size, after: p.inst.props.Size }, { inst: p.inst, key: 'CFrame', before: p.cf, after: p.inst.props.CFrame }]);
    this.mode = null;
    this.commands.run('commitDrag', { label, changes });
    this.onState('');
  }
  cancel() {
    if (!this.mode) return;
    for (const p of this.parts) { this.dm.set(p.inst, 'Size', p.size); this.dm.set(p.inst, 'CFrame', p.cf); }
    this.mode = null;
    this.onState('');
  }
}
const fmt = v => String(Math.round(v * 100) / 100);
