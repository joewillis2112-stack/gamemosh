// A Roblox-style follow camera: orbits the character's head, drag to turn,
// wheel or pinch to zoom, pulls in when something is between it and the head
// and eases back out. Close in, it becomes first person.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Culling/ray.js';

export const CAMERA = { Zoom: 12.5, MinZoom: 0.5, MaxZoom: 128, MinPitch: -80, MaxPitch: 80, FirstPerson: 1.5, Fov: 70 };

export class FollowCamera {
  constructor(scene, character) {
    this.scene = scene;
    this.char = character;
    this.yaw = Math.PI;       // radians; the camera sits behind a character facing +Z
    this.pitch = 20 * Math.PI / 180; // looking down, positive
    this.zoom = CAMERA.Zoom;
    this.dist = this.zoom;    // after collision pull-in
    this.cam = new ArcRotateCamera('cam', 0, 1, this.zoom, Vector3.Zero(), scene);
    this.cam.inputs.clear();
    this.cam.fov = CAMERA.Fov * Math.PI / 180;
    this.cam.minZ = 0.1; this.cam.maxZ = 5000;
    this.cam.lowerBetaLimit = this.cam.upperBetaLimit = null;
    this.cam.lowerRadiusLimit = this.cam.upperRadiusLimit = null;
    this.update(0);
  }

  // Behind the character, as Roblox places the camera on spawn.
  snapBehind() { this.yaw = this.char.yaw + Math.PI; this.dist = this.zoom; }

  turn(dYaw, dPitch) {
    this.yaw += dYaw;
    const lim = d => d * Math.PI / 180;
    this.pitch = Math.min(lim(CAMERA.MaxPitch), Math.max(lim(CAMERA.MinPitch), this.pitch + dPitch));
  }
  zoomBy(factor) { this.zoom = Math.min(CAMERA.MaxZoom, Math.max(CAMERA.MinZoom, this.zoom * factor)); }

  // Flat forward and right vectors of the view, for camera-relative movement.
  basis() {
    const f = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return { forward: f, right: new Vector3(-f.z, 0, f.x) }; // right-handed: forward x up
  }

  update(dt) {
    // focus: a fixed point to orbit instead of the head (tests and cutscenes).
    const target = this.focus ? new Vector3(...this.focus) : this.char.headPosition;
    // Direction from head to camera.
    const dir = new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // Pull in when something blocks the view; ease back out.
    let want = this.zoom;
    if (this.zoom > CAMERA.FirstPerson && !this.focus) { // a fixed focus is a scripted view: no pull-in
      const own = new Set(this.char.meshes);
      const hit = this.scene.pickWithRay(new Ray(target, dir, this.zoom), m => m.isPickable && m.isVisible && !own.has(m) && m.name !== 'skyBox' && !m.name.startsWith('hdrSkyBox'));
      if (hit && hit.hit) want = Math.max(CAMERA.MinZoom, hit.distance - 0.6);
    }
    this.dist = want < this.dist || dt === 0 ? want : this.dist + (want - this.dist) * (1 - Math.exp(-6 * dt));
    const first = this.dist <= CAMERA.FirstPerson;
    this.char.setVisible(!first);
    if (first) this.char.faceYaw(this.yaw + Math.PI);
    // ArcRotate: position = target + r (cos a sin b, cos b, sin a sin b).
    this.cam.target.copyFrom(target);
    this.cam.alpha = Math.atan2(dir.z, dir.x);
    this.cam.beta = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    this.cam.radius = Math.max(0.01, this.dist);
  }
}
