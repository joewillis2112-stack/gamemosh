// A Roblox-style follow camera, with the numbers from Roblox's default
// CameraModule (mashup-research/ROBLOX_DEFAULTS_2026-10-08.md §5): it orbits a
// focus 1.5 studs above the root part, pitch ±80° (15° down on spawn), zoom
// 0.5-400 stepped like Roblox's and eased on a 4.5 Hz critically damped
// spring, first person below 1 stud with the character fading out as the
// camera closes in. Occlusion pulls it in and it eases back out. On touch
// it's Follow mode: it swings behind a moving character, except for 2 s after
// the player drags the view.
//
// workspace.CurrentCamera (CameraSync below) is the scripts' view of it: with
// CameraType Custom the engine writes its CFrame, Focus and ViewportSize each
// frame before RenderStepped, and a script that moves it in RenderStepped
// (camera shake) is drawn that frame, as in Roblox, whose camera scripts run
// at render priority Camera, before RenderStepped. Scriptable: the engine
// leaves it, and its CFrame is what's drawn. FieldOfView applies in both.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { CF } from '../cframe.js';
import { V2 } from '../datamodel.js';

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
    if (this.subject) return this.subject.clone();     // CameraSubject a part (CameraSync)
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
      const own = this.own || (this.own = new Set(this.char.meshes));
      const skip = this.subjectMesh; // a part followed: it doesn't block its own view (Roblox's Poppercam ignores the subject)
      const hit = this.scene.pickWithRay(new Ray(target, dir, this.z), m => m.isPickable && m.isVisible && m.visibility > 0.75 && !own.has(m) && m !== skip && m.name !== 'skyBox' && !m.name.startsWith('hdrSkyBox'));
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

// workspace.CurrentCamera <-> the drawn camera.
export class CameraSync {
  constructor(dm, follow, canvas, world) { this.dm = dm; this.follow = follow; this.canvas = canvas; this.world = world; this.written = null; }
  current() { const c = this.dm.workspace.props.CurrentCamera; return c && !c.destroyed && c.ClassName === 'Camera' ? c : null; }
  scriptable() { const c = this.current(); const k = c && c.props.CameraType; return (k && k.name || k) === 'Scriptable'; } // enum props hold an EnumItem or its name

  // Before the follow camera updates: what it follows (CameraSubject: a part, or the character).
  pre() {
    const c = this.current(), s = c && c.props.CameraSubject;
    const part = s && !s.destroyed && s.props.CFrame && s.props.Size && s.ClassName !== 'Humanoid' ? s : null;
    this.follow.subject = part ? new Vector3(part.props.CFrame.x, part.props.CFrame.y, part.props.CFrame.z) : null;
    const e = part && this.world.parts.get(part);
    this.follow.subjectMesh = e ? e.mesh : null;
  }

  // After it updates (Custom only): the engine's view into the Camera's properties.
  write() {
    const c = this.current(); if (!c) return;
    const f = this.follow, target = f.cam.target, pos = f.lastCamPos;
    const look = target.subtract(pos); if (look.lengthSquared() < 1e-12) return;
    look.normalize();
    const right = Vector3.Cross(look, Vector3.Up()); // right-handed: look x up
    if (right.lengthSquared() < 1e-12) right.set(1, 0, 0); else right.normalize();
    const up = Vector3.Cross(right, look);
    // Rows of [right, up, back]: R[i] = (right_i, up_i, -look_i).
    const cf = new CF([pos.x, pos.y, pos.z, right.x, up.x, -look.x, right.y, up.y, -look.y, right.z, up.z, -look.z]);
    c.props.CFrame = cf; this.written = cf; // engine-driven: no Changed per frame (as with physics)
    c.props.Focus = new CF([target.x, target.y, target.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.size();
  }
  size() {
    const c = this.current(); if (!c) return;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1, v = c.props.ViewportSize;
    if (!v || v.x !== Math.fround(w) || v.y !== Math.fround(h)) this.dm.set(c, 'ViewportSize', new V2(w, h));
  }

  // After RenderStepped: the Camera's CFrame (if a script set it, or it's Scriptable) and FieldOfView into the drawn camera.
  apply() {
    const c = this.current(), cam = this.follow.cam; if (!c) return;
    cam.fov = c.props.FieldOfView * Math.PI / 180;
    const cf = c.props.CFrame;
    if (!cf || cf === this.written) { if (this.rolled) { cam.upVector = Vector3.Up(); this.rolled = false; } return; }
    const m = cf.m, pos = new Vector3(m[0], m[1], m[2]), up = new Vector3(m[4], m[7], m[10]), back = new Vector3(m[5], m[8], m[11]);
    // ArcRotateCamera: orbit 1 stud out from a target ahead, its up the CFrame's (so roll is kept).
    cam.upVector = up; this.rolled = true;
    cam.setTarget(pos.subtract(back), false, true);
    cam.setPosition(pos);
    if (this.scriptable()) this.follow.char.setFade(0);
  }
}
