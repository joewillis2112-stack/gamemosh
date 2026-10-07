// Draws the DataModel's parts with Babylon and gives them Havok bodies, and
// keeps both in sync as scripts change properties. Units are studs.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3, Color3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { isA } from '../datamodel.js';

const DEG = Math.PI / 180;

// Materials: how each Roblox-style Material name looks. Each entry is a
// recipe applied on top of the part's Color. Only materials that have passed
// the asset gate belong here.
const MATERIALS = {
  Plastic: { roughness: 0.62, metallic: 0, grid: false },
  SmoothPlastic: { roughness: 0.38, metallic: 0 },
  Metal: { roughness: 0.32, metallic: 0.9 },
  Neon: { roughness: 0.5, metallic: 0, emissive: 1.6 },
  Baseplate: { roughness: 0.75, metallic: 0, grid: true },
};

export class World {
  constructor(scene, dm, shadows) {
    this.scene = scene;
    this.dm = dm;
    this.shadows = shadows;
    this.parts = new Map(); // Instance -> { mesh, agg }
    this.matCache = new Map();
    dm.onChange = (inst, key) => this.changed(inst, key);
    for (const d of dm.workspace.children) this.added(d);
  }

  material(name, color) {
    const key = `${name}|${color.x.toFixed(3)},${color.y.toFixed(3)},${color.z.toFixed(3)}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const r = MATERIALS[name] || MATERIALS.Plastic;
    const m = new PBRMaterial(key, this.scene);
    // Part colours are sRGB, like Color3.fromRGB in Roblox.
    m.albedoColor = new Color3(color.x, color.y, color.z).toLinearSpace();
    m.roughness = r.roughness;
    m.metallic = r.metallic;
    if (r.emissive) { m.emissiveColor = m.albedoColor.scale(r.emissive); m.disableLighting = false; }
    this.matCache.set(key, m);
    return m;
  }

  // A light 4-stud grid, the baseplate's only texture: it gives scale and
  // motion cues without noise. Drawn once into a PNG; each part gets its own
  // Texture (same URL, so the engine shares the upload) with its own tiling.
  gridUrl() {
    if (this._gridUrl) return this._gridUrl;
    const N = 256, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, N, 3); g.fillRect(0, 0, 3, N);
    return (this._gridUrl = c.toDataURL('image/png'));
  }
  gridTexture(uScale, vScale) {
    const t = new Texture(this.gridUrl(), this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    t.name = 'grid';
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    t.uScale = uScale; t.vScale = vScale;
    return t;
  }

  added(inst) {
    if (isA(inst.ClassName, 'BasePart')) this.build(inst);
    for (const c of inst.children) this.added(c);
  }
  removed(inst) {
    const p = this.parts.get(inst);
    if (p) { p.agg && p.agg.dispose(); p.mesh.dispose(); this.parts.delete(inst); }
    for (const c of inst.children) this.removed(c);
  }
  inWorkspace(inst) { for (let p = inst; p; p = p.parent) if (p === this.dm.workspace) return true; return false; }

  build(inst) {
    this.removed(inst);
    const P = inst.props;
    const shape = P.Shape || 'Block';
    let mesh;
    if (shape === 'Ball') mesh = MeshBuilder.CreateSphere(inst.Name, { diameter: 1, segments: 24 }, this.scene);
    else if (shape === 'Cylinder') { mesh = MeshBuilder.CreateCylinder(inst.Name, { diameter: 1, height: 1, tessellation: 32 }, this.scene); mesh.rotation.z = Math.PI / 2; mesh.bakeCurrentTransformIntoVertices(); }
    else mesh = MeshBuilder.CreateBox(inst.Name, { size: 1 }, this.scene);
    mesh.metadata = { instance: inst };
    mesh.receiveShadows = true;
    this.shadows.addShadowCaster(mesh);
    const entry = { mesh, agg: null };
    this.parts.set(inst, entry);
    this.apply(inst, entry);
  }

  apply(inst, e) {
    const P = inst.props;
    const s = P.Size, p = P.Position, o = P.Orientation;
    e.mesh.scaling.set(s.x, s.y, s.z);
    e.mesh.position.set(p.x, p.y, p.z);
    // Roblox Orientation is degrees, applied Y then X then Z.
    e.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(o.y * DEG, o.x * DEG, o.z * DEG);
    const mat = this.material(P.Material, P.Color);
    e.mesh.material = mat;
    if ((MATERIALS[P.Material] || {}).grid) {
      // Grid cells stay 4 studs whatever the part's size: its own material and tiling.
      if (e.ownMat) e.ownMat.dispose(false, true);
      const own = mat.clone(mat.name + '#' + inst.handle);
      own.albedoTexture = this.gridTexture(s.x / 4, s.z / 4);
      e.mesh.material = e.ownMat = own;
    }
    e.mesh.visibility = 1 - P.Transparency;
    e.mesh.isVisible = P.Transparency < 1 && this.inWorkspace(inst);
    this.body(inst, e);
  }

  body(inst, e) {
    if (e.agg) { e.agg.dispose(); e.agg = null; }
    const P = inst.props;
    if (!P.CanCollide || !this.inWorkspace(inst) || !this.scene.getPhysicsEngine()) return;
    const type = P.Shape === 'Ball' ? PhysicsShapeType.SPHERE : PhysicsShapeType.BOX;
    // Roblox part density ~0.7 g/cm³ for plastic; mass in arbitrary units scaled by volume.
    const mass = P.Anchored ? 0 : 0.7 * P.Size.x * P.Size.y * P.Size.z;
    e.agg = new PhysicsAggregate(e.mesh, type, { mass, friction: 0.5, restitution: 0 }, this.scene);
  }

  changed(inst, key) {
    if (key === 'Parent') {
      if (this.inWorkspace(inst)) this.added(inst); else this.removed(inst);
      return;
    }
    const e = this.parts.get(inst);
    if (!e) return;
    if (key === 'Shape') return this.build(inst);
    this.apply(inst, e);
  }

  // Unanchored parts are moved by physics: copy their pose back into the DataModel.
  syncFromPhysics() {
    for (const [inst, e] of this.parts) {
      if (inst.props.Anchored || !e.agg) continue;
      const m = e.mesh;
      inst.props.Position.x = m.position.x; inst.props.Position.y = m.position.y; inst.props.Position.z = m.position.z;
      if (m.rotationQuaternion) {
        const r = m.rotationQuaternion.toEulerAngles();
        inst.props.Orientation.x = r.x / DEG; inst.props.Orientation.y = r.y / DEG; inst.props.Orientation.z = r.z / DEG;
      }
    }
  }
}

export { Vector3 };
