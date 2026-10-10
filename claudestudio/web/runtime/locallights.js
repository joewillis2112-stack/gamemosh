// Draws PointLight, SpotLight and SurfaceLight (datamodel.js) per pixel.
// Semantics from mashup-research/ROBLOX_LIGHTING_2026-10-09.md section 7:
// - a light is a direct child of a BasePart and follows it;
// - PointLight shines from the part's position, in all directions;
// - SpotLight shines from the part along its Face, in a cone Angle degrees wide
//   (180 = a half sphere);
// - SurfaceLight shines from the whole face: Angle 0 is a beam the face's size
//   straight out, 180 spreads to the face's plane;
// - light reaches exactly zero at Range (clamped to 120); Brightness scales it
//   without changing its reach;
// - LightingStyle Realistic: per-pixel specular, and shadows where Shadows is
//   set (spot cheapest, point dearest). Soft: no specular, no shadows.
// Roblox's falloff curve isn't published; ours is linear to zero at Range (the
// visible edge players describe), and the intensity scale is ours.
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math.js';
import { isA } from '../datamodel.js';

const INTENSITY_PER_BRIGHTNESS = 2;   // ours: a Brightness-1 light at night lights a wall clearly
const SHADOW_LIGHTS = { high: 4, phone: 2 }; // shadow-casting local lights at once
const SHADOW_SIZE = { high: 1024, phone: 512 };
// How many lights one material shades: the sun and sky light plus local lights.
export const MAX_LIGHTS = { high: 10, phone: 6 };
const lin = c => new Color3(c.r, c.g, c.b).toLinearSpace();
// NormalId -> the part's local axis (columns of its rotation: right, up, back).
const FACE = { Right: [0, 1], Left: [0, -1], Top: [1, 1], Bottom: [1, -1], Back: [2, 1], Front: [2, -1] };

export class LocalLights {
  constructor(scene, dm, world, { quality = 'high', sunShadows } = {}) {
    Object.assign(this, { scene, dm, world, quality, sunShadows });
    this.lights = new Map(); // Light instance -> { light, kind, shadow, key, meshKey }
    this.frame = 0;
    // Every material shades enough lights for the sun, the sky and the local lights near it.
    const max = MAX_LIGHTS[quality] || MAX_LIGHTS.high;
    const raise = m => { if ('maxSimultaneousLights' in m) m.maxSimultaneousLights = max; };
    scene.materials.forEach(raise);
    scene.onNewMaterialAddedObservable.add(raise);
    dm.watch((inst, key) => {
      if (isA(inst.ClassName, 'Light')) this.dirty = true;
      else if (key === 'Parent' || key === 'Size' || key === 'Transparency') this.dirty = true; // a lit part may have come, gone or changed
    });
    this.dirty = true;
  }

  // The lights that should exist: Light instances directly under a part in the Workspace.
  collect() {
    const out = [];
    const walk = inst => { for (const c of inst.children) { if (isA(c.ClassName, 'Light') && inst !== this.dm.workspace && isA(inst.ClassName, 'BasePart')) out.push(c); walk(c); } };
    walk(this.dm.workspace);
    return out;
  }

  update() {
    this.frame++;
    if (this.dirty) { this.sync(); this.dirty = false; }
    const realistic = this.dm.service('Lighting').props.LightingStyle === 'Realistic';
    let shadowsLeft = realistic ? (SHADOW_LIGHTS[this.quality] || 2) : 0;
    for (const [inst, e] of this.lights) {
      const P = inst.props, part = inst.parent, cf = part.props.CFrame, size = part.props.Size;
      const on = P.Enabled && P.Brightness > 0 && P.Range > 0;
      if (on !== e.on) { e.on = on; this.reassign = true; } // a light turned on or off: choose again now
      if (!on) { e.light.setEnabled(false); this.dropShadow(e); continue; }
      e.light.diffuse = lin(P.Color);
      e.light.specular = realistic ? e.light.diffuse : Color3.Black();
      e.light.intensity = P.Brightness * INTENSITY_PER_BRIGHTNESS;
      const m = cf.m, col = k => new Vector3(m[3 + k], m[6 + k], m[9 + k]); // rotation column k, world space
      const centre = new Vector3(cf.x, cf.y, cf.z);
      if (e.kind === 'PointLight') {
        e.light.position.copyFrom(centre);
        e.light.range = P.Range;
      } else {
        const [axis, sign] = FACE[P.Face && P.Face.name || P.Face] || FACE.Front;
        const n = col(axis).scale(sign).normalize();
        const half = [size.x, size.y, size.z][axis] / 2;
        const surface = centre.add(n.scale(half + 0.01));
        if (e.kind === 'SpotLight') {
          e.light.position.copyFrom(surface);
          e.light.angle = Math.max(1e-3, P.Angle * Math.PI / 180);
          e.light.range = P.Range;
        } else {
          // SurfaceLight: from the whole face. A spot set back behind the face so its
          // cone just spans the face at the surface, then widens by Angle: Angle 0 is
          // a beam the face's size, 180 opens to the face's plane.
          const dims = [size.x, size.y, size.z].filter((_, k) => k !== axis), r = Math.hypot(dims[0], dims[1]) / 2;
          const halfAngle = Math.max(2, Math.min(89, P.Angle / 2)) * Math.PI / 180;
          const back = r / Math.tan(halfAngle);
          e.light.position.copyFrom(surface.subtract(n.scale(back)));
          e.light.angle = 2 * halfAngle;
          e.light.range = P.Range + back;
        }
        e.light.direction.copyFrom(n);
      }
      // Shadows: Realistic only, a few lights at a time.
      if (P.Shadows && shadowsLeft > 0) { shadowsLeft--; this.ensureShadow(e, part); } else this.dropShadow(e);
      if (e.fresh) { e.fresh = false; this.reassign = true; }
    }
    // Which lights shade which meshes: chosen every 10 frames (things move), and
    // at once when a light comes, goes, or turns on or off.
    if (this.reassign || this.frame % 10 === 1) { this.reassign = false; this.assign(); }
  }

  sync() {
    const want = new Set(this.collect());
    for (const [inst, e] of this.lights) if (!want.has(inst) || e.kind !== inst.ClassName) { this.dropShadow(e); e.light.dispose(); this.lights.delete(inst); }
    for (const inst of want) {
      if (this.lights.has(inst)) { this.lights.get(inst).fresh = true; continue; }
      const kind = inst.ClassName;
      const light = kind === 'PointLight' ? new PointLight('pointlight', Vector3.Zero(), this.scene) : new SpotLight(kind.toLowerCase(), Vector3.Zero(), new Vector3(0, 0, -1), 1, 1, this.scene);
      light.falloffType = Light.FALLOFF_STANDARD; // linear, zero at range
      if (kind !== 'PointLight') { light.exponent = 1; }
      this.lights.set(inst, { light, kind, fresh: true, on: undefined });
    }
  }

  // Each mesh shades at most MAX_LIGHTS - 2 local lights (the sun and sky take
  // two). Babylon would shade the first ones in its own list and drop the rest,
  // and turning a light off and on shuffles which (a big floor under many lamps
  // flickered). So: for each mesh, the lights in reach (bounding sphere against
  // Range), nearest the camera first, up to the budget; each light then shades
  // exactly the meshes that chose it.
  assign() {
    const budget = (MAX_LIGHTS[this.quality] || MAX_LIGHTS.high) - 2;
    const cam = this.scene.activeCamera, eye = cam ? cam.globalPosition : Vector3.Zero();
    const live = [...this.lights.values()].filter(e => e.on);
    live.forEach(e => { e.next = []; e.camDist = Vector3.Distance(e.light.position, eye); });
    live.sort((x, y) => x.camDist - y.camDist);
    for (const mesh of this.scene.meshes) {
      if (!mesh.material || !mesh.isEnabled() || !mesh.getTotalVertices() || mesh.infiniteDistance) continue;
      const b = mesh.getBoundingInfo().boundingSphere;
      let n = 0;
      for (const e of live) {
        if (n >= budget) break;
        if (Vector3.Distance(b.centerWorld, e.light.position) <= e.light.range + b.radiusWorld) { e.next.push(mesh); n++; }
      }
    }
    for (const e of live) {
      const key = e.next.map(m => m.uniqueId).join(',');
      e.light.setEnabled(e.next.length > 0); // nothing chose it: off (an empty list would mean "every mesh")
      if (key !== e.meshKey) { e.meshKey = key; if (e.next.length) e.light.includedOnlyMeshes = e.next; }
    }
  }

  ensureShadow(e, part) {
    const own = this.world && this.world.parts.get(part);
    if (!e.shadow) {
      e.shadow = new ShadowGenerator(SHADOW_SIZE[this.quality] || 1024, e.light);
      e.shadow.usePercentageCloserFiltering = true;
      e.shadow.bias = 0.0005; e.shadow.normalBias = 0.02;
    }
    // Casters: what casts the sun's shadow, minus the light's own part (a lamp's light
    // isn't blocked by the lamp).
    const list = this.sunShadows ? this.sunShadows.getShadowMap().renderList : [];
    const map = e.shadow.getShadowMap();
    if (e.casters !== list.length || e.ownMesh !== (own && own.mesh)) {
      map.renderList = list.filter(m => !own || m !== own.mesh);
      e.casters = list.length; e.ownMesh = own && own.mesh;
    }
  }
  dropShadow(e) { if (e.shadow) { e.shadow.dispose(); e.shadow = null; e.casters = -1; } }
}
