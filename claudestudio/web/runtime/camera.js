// A Roblox-style follow camera, with the numbers from Roblox's default
// CameraModule (mashup-research/ROBLOX_DEFAULTS_2026-10-08.md §5): it orbits a
// focus 1.5 studs above the root part, pitch ±80° (15° down on spawn), zoom
// 0.5-400 stepped like Roblox's and eased on a 4.5 Hz critically damped
// spring, first person below 1 stud with the character fading out as the
// camera closes in. Occlusion pulls it in and it eases back out. On touch
// it's Follow mode: it swings behind a moving character, except for 2 s after
// the player drags the view.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';

const DEG = Math.PI / 180;
export const CAMERA = {
  Zoom: 12.5, MinZoom: 0.5, MaxZoom: 400, Pitch: 80, SpawnPitch: 15, Fov: 70,
  FirstPerson: 1,         // below this the camera snaps to 0.5 (first person)
  ZoomHz: 4.5,            // zoom spring frequency
  FollowDelay: 2,         // s after a drag before Follow mode turns the camera again
  FocusAboveRoot: 1.5,    // studs above the root part's centre (which is 3 above the feet)
};

export class FollowCamera {
  constructor(scene, character) {
    this.scene = scene;
    this.char = character;
    this.yaw = Math.PI;       // direction from focus to camera; PI = behind a character facing +Z
    this.pitch = CAMERA.SpawnPitch * DEG; // looking down, positive
    this.zoom = CAMERA.Zoom;  // target zoom
    this.z = this.zoom;       // the zoom spring's current value
    this.zv = 0;              // and its velocity
    this.dist = this.zoom;    // after occlusion pull-in
    this.follow = false;      // Follow mode (touch devices)
    this.lastPan = -Infinity; // time of the player's last drag
    this.time = 0;
    this.cam = new ArcRotateCamera('cam', 0, 1, this.zoom, Vector3.Zero(), scene);
    this.cam.inputs.clear();
    this.cam.fov = CAMERA.Fov * DEG;
    this.cam.minZ = 0.1; this.cam.maxZ = 5000;
    this.cam.lowerBetaLimit = this.cam.upperBetaLimit = null;
    this.cam.lowerRadiusLimit = this.cam.upperRadiusLimit = null;
    this.update(0);
  }

  // On spawn: behind the character, 15° down (the zoom is kept, as in Roblox).
  snapBehind() { this.yaw = this.char.yaw + Math.PI; this.pitch = CAMERA.SpawnPitch * DEG; this.dist = this.z; this.lastCamPos = null; }

  // The player turned the view (radians). `pan` marks it as a drag, which holds off Follow mode.
  turn(dYaw, dPitch, pan = true) {
    this.yaw += dYaw;
    const lim = CAMERA.Pitch * DEG;
    this.pitch = Math.min(lim, Math.max(-lim, this.pitch + dPitch));
    if (pan) this.lastPan = this.time;
  }

  // Roblox's zoom step: out by dz*(1 + z/2), in by the inverse, so each wheel
  // click feels the same at any distance. Below 1 stud: first person.
  zoomStep(dz) {
    let z = this.zoom;
    z = dz > 0 ? z + dz * (1 + 0.5 * z) : (z + dz) / (1 - 0.5 * dz);
    if (z < CAMERA.FirstPerson) z = CAMERA.MinZoom;
    this.zoom = Math.min(CAMERA.MaxZoom, Math.max(CAMERA.MinZoom, z));
  }
  zoomBy(factor) { this.zoom = Math.min(CAMERA.MaxZoom, Math.max(CAMERA.MinZoom, this.zoom * factor)); }

  // Flat forward and right vectors of the view, for camera-relative movement.
  basis() {
    const f = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return { forward: f, right: new Vector3(-f.z, 0, f.x) }; // right-handed: forward x up
  }

  focusPoint() {
    if (this.focus) return new Vector3(...this.focus); // a fixed point: tests and cutscenes
    return this.char.holder.position.add(new Vector3(0, 3 + CAMERA.FocusAboveRoot, 0));
  }

  update(dt) {
    this.time += dt;
    const target = this.focusPoint();
    // Zoom spring (critically damped).
    if (dt > 0) {
      const w = 2 * Math.PI * CAMERA.ZoomHz, a = w * w * (this.zoom - this.z) - 2 * w * this.zv;
      this.zv += a * dt; this.z += this.zv * dt;
      if (Math.abs(this.zoom - this.z) < 1e-3 && Math.abs(this.zv) < 1e-3) { this.z = this.zoom; this.zv = 0; }
    } else { this.z = this.zoom; this.zv = 0; }
    const firstPerson = this.z < CAMERA.FirstPerson;

    // Follow mode: keep looking at the subject from where the camera was, so it
    // swings behind a character walking sideways. Not while/just after a drag,
    // not in first person, and only beyond a small dead zone.
    if (this.follow && this.lastCamPos && !this.focus && !firstPerson && this.time - this.lastPan > CAMERA.FollowDelay) {
      const want = Math.atan2(this.lastCamPos.x - target.x, this.lastCamPos.z - target.z);
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      if (Math.abs(d) > 0.4 * dt) this.yaw += d;
    }

    const dir = new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // Pull in when something blocks the view; ease back out. A fixed focus is a scripted view: no pull-in.
    let want = this.z;
    if (!firstPerson && !this.focus) {
      const own = new Set(this.char.meshes);
      const hit = this.scene.pickWithRay(new Ray(target, dir, this.z), m => m.isPickable && m.isVisible && m.visibility > 0.75 && !own.has(m) && m.name !== 'skyBox' && !m.name.startsWith('hdrSkyBox'));
      if (hit && hit.hit) want = Math.max(CAMERA.MinZoom, hit.distance - 0.6);
    }
    this.dist = want < this.dist || dt === 0 ? want : this.dist + (want - this.dist) * (1 - Math.exp(-6 * dt));

    // The character fades as the camera nears its focus (Roblox: 1 - (d - 0.5)/1.5 within 2 studs).
    const d = this.dist;
    this.char.setFade(this.focus ? 0 : d >= 2 ? 0 : d <= 0.5 ? 1 : 1 - (d - 0.5) / 1.5);
    if (firstPerson && !this.focus) this.char.faceYaw(this.yaw + Math.PI);

    this.cam.target.copyFrom(target);
    this.cam.alpha = Math.atan2(dir.z, dir.x); // ArcRotate: position = target + r (cos a sin b, cos b, sin a sin b)
    this.cam.beta = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    this.cam.radius = Math.max(0.01, this.dist);
    this.lastCamPos = target.add(dir.scale(this.dist));
  }
}
