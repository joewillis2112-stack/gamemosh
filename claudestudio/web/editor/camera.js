// The editor's camera, Roblox Studio's controls (ArtCraft's CameraController
// has the same split of look, pan, dolly and fly):
// - mouse: right-drag looks around, middle-drag pans, the wheel moves toward
//   the cursor, W/A/S/D/Q/E fly while the right button is held (Shift slower;
//   so G, R and S stay free for the modal transforms), F frames the selection;
// - touch: one finger drags to orbit around the point it started on, two
//   fingers pan and pinch to move in and out. A tap is left for selection.
// The camera is a position plus yaw and pitch; it never rolls.
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';

export const EDIT_CAMERA = { fov: 70, fly: 40, slow: 0.25, look: 0.005, wheel: 0.12, minStep: 0.5 }; // ours: studs/s, rad/px

export class EditorCamera {
  constructor(scene, canvas, { position = new Vector3(0, 12, 24), target = new Vector3(0, 0, 0) } = {}) {
    this.scene = scene; this.canvas = canvas;
    this.cam = new TargetCamera('editor', position.clone(), scene);
    this.cam.fov = EDIT_CAMERA.fov * Math.PI / 180;
    this.cam.minZ = 0.1; this.cam.maxZ = 5000;
    this.pos = position.clone();
    this.lookAt(target);
    this.keys = new Set();
    this.pointers = new Map(); // id -> {x, y, button}
    this.pick = null;          // (x, y) -> Vector3 | null, a world point under the screen point (for orbit and wheel)
    this.frame = null;         // () -> {centre, radius} | null, the selection (for F)
    this.busy = () => false;   // true while a gizmo is being dragged
    this.attach();
    this.apply();
  }

  forward() { return new Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  right() { return new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); } // forward x up, flattened
  up() { return Vector3.Cross(this.right(), this.forward()); }
  lookAt(t) { const d = t.subtract(this.pos); this.yaw = Math.atan2(-d.x, -d.z); this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); this.clampPitch(); }
  clampPitch() { const lim = Math.PI / 2 - 0.01; this.pitch = Math.min(lim, Math.max(-lim, this.pitch)); }
  apply() { this.cam.position.copyFrom(this.pos); this.cam.setTarget(this.pos.add(this.forward())); }

  // Turn by (dx, dy) radians about the camera itself, or about a pivot (orbit).
  turn(dYaw, dPitch, pivot = null) {
    if (pivot) {
      const off = this.pos.subtract(pivot), r = off.length();
      const yaw = Math.atan2(off.x, off.z) - dYaw, el = Math.asin(Math.max(-1, Math.min(1, off.y / (r || 1)))) - dPitch;
      const e = Math.max(-1.55, Math.min(1.55, el));
      this.pos = pivot.add(new Vector3(Math.sin(yaw) * Math.cos(e), Math.sin(e), Math.cos(yaw) * Math.cos(e)).scale(r));
      this.lookAt(pivot);
    } else { this.yaw -= dYaw; this.pitch -= dPitch; this.clampPitch(); }
    this.apply();
  }
  pan(dx, dy, scale) { this.pos.addInPlace(this.right().scale(-dx * scale)).addInPlace(this.up().scale(dy * scale)); this.apply(); }
  // Move along a ray (the cursor's, or straight ahead) by a step proportional to the distance to what it hits.
  dolly(amount, ray = null) {
    const dir = ray ? ray.dir : this.forward(), hitDist = ray && ray.dist != null ? ray.dist : 20;
    const step = Math.sign(amount) * Math.max(EDIT_CAMERA.minStep, hitDist * EDIT_CAMERA.wheel * Math.abs(amount));
    this.pos.addInPlace(dir.scale(step > 0 ? Math.min(step, Math.max(0, hitDist - 0.5)) : step)); // never through what's under the cursor
    this.apply();
  }
  // F: keep the view direction, step back so the selection fills about half the view.
  focus() {
    const f = this.frame && this.frame(); if (!f) return false;
    const dist = Math.max(2, f.radius / Math.tan(this.cam.fov / 2)) * 1.4;
    this.pos = f.centre.subtract(this.forward().scale(dist)); this.apply();
    return true;
  }
  flying() { for (const p of this.pointers.values()) if (p.button === 2 && p.type !== 'touch') return true; return false; }
  update(dt) {
    if (!this.keys.size || !this.flying()) return;
    const k = c => this.keys.has(c), speed = EDIT_CAMERA.fly * (k('ShiftLeft') || k('ShiftRight') ? EDIT_CAMERA.slow : 1) * dt;
    const f = this.forward(), r = this.right(), v = new Vector3(0, 0, 0);
    if (k('KeyW')) v.addInPlace(f); if (k('KeyS')) v.subtractInPlace(f);
    if (k('KeyD')) v.addInPlace(r); if (k('KeyA')) v.subtractInPlace(r);
    if (k('KeyE')) v.y += 1; if (k('KeyQ')) v.y -= 1;
    if (v.lengthSquared() > 0) { this.pos.addInPlace(v.normalize().scale(speed)); this.apply(); }
  }

  // A screen point's ray (CSS px from the top-left).
  ray(x, y) {
    const r = this.scene.createPickingRay(x, y, null, this.cam); // CSS px: Babylon applies the hardware scaling
    return { origin: r.origin, dir: r.direction };
  }
  scale() { return this.canvas.width / (this.canvas.clientWidth || 1); }

  attach() {
    const c = this.canvas, typing = e => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      if (this.busy()) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, moved: 0 });
      if (e.pointerType === 'touch' && this.pointers.size === 1) { const r = c.getBoundingClientRect(); this.pivot = (this.pick && this.pick(e.clientX - r.left, e.clientY - r.top)) || this.pos.add(this.forward().scale(20)); }
      if (e.button === 1 || e.button === 2) c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p || this.busy()) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.type === 'touch') {
        if (this.pointers.size === 1) { if (p.moved > 6) this.turn(dx * EDIT_CAMERA.look, dy * EDIT_CAMERA.look, this.pivot); }
        else if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()], other = a === p ? b : a;
          const before = Math.hypot(p.x - other.x, p.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          this.pan(dx / 2, dy / 2, 0.05);
          if (before > 0) this.dolly((after - before) / 60);
        }
      } else if (p.button === 2) this.turn(dx * EDIT_CAMERA.look, dy * EDIT_CAMERA.look);
      else if (p.button === 1) this.pan(dx, dy, 0.05);
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = e => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ray = this.ray(x, y), hit = this.pick && this.pick(x, y);
      this.dolly(-Math.sign(e.deltaY), { dir: ray.dir, dist: hit ? Vector3.Distance(hit, this.pos) : null });
    }, { passive: false });
    addEventListener('keydown', e => { if (typing(e) || e.ctrlKey || e.metaKey) return; this.keys.add(e.code); if (e.code === 'KeyF') this.focus(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
}
