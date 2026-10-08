// Draws the DataModel's parts with Babylon and gives them Havok bodies, and
// keeps both in sync as scripts change properties. Units are studs.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
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
  Plastic: { roughness: 0.75, metallic: 0 }, // matte, as Roblox's Plastic reads
  SmoothPlastic: { roughness: 0.38, metallic: 0 },
  Metal: { roughness: 0.32, metallic: 0.9 },
  Neon: { roughness: 0.5, metallic: 0, emissive: 1.6 },
};
// Unlisted Roblox materials render as Plastic until they pass the gate.

// Decal faces: where each NormalId face sits on the unit box, and how to turn
// a plane (which faces -Z) to lie on it. [position, rotation (x, y, z)].
const FACES = {
  Top: [[0, 0.5, 0], [Math.PI / 2, 0, 0]], Bottom: [[0, -0.5, 0], [-Math.PI / 2, 0, 0]],
  Front: [[0, 0, -0.5], [0, 0, 0]], Back: [[0, 0, 0.5], [0, Math.PI, 0]],
  Right: [[0.5, 0, 0], [0, -Math.PI / 2, 0]], Left: [[-0.5, 0, 0], [0, Math.PI / 2, 0]],
};
// Face size in studs for tiling: [u axis, v axis] of the part's Size.
const FACE_UV = { Top: ['x', 'z'], Bottom: ['x', 'z'], Front: ['x', 'y'], Back: ['x', 'y'], Right: ['z', 'y'], Left: ['z', 'y'] };

export class World {
  constructor(scene, dm, shadows) {
    this.scene = scene;
    this.dm = dm;
    this.shadows = shadows;
    this.parts = new Map(); // Instance -> { mesh, agg }
    this.matCache = new Map();
    dm.watch((inst, key) => this.changed(inst, key));
    for (const d of dm.workspace.children) this.added(d);
  }

  material(name, color) {
    const key = `${name}|${color.r.toFixed(3)},${color.g.toFixed(3)},${color.b.toFixed(3)}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const r = MATERIALS[name] || MATERIALS.Plastic;
    const m = new PBRMaterial(key, this.scene);
    // Part colours are sRGB, like Color3.fromRGB in Roblox.
    m.albedoColor = new Color3(color.r, color.g, color.b).toLinearSpace();
    m.roughness = r.roughness;
    m.metallic = r.metallic;
    if (r.emissive) { m.emissiveColor = m.albedoColor.scale(r.emissive); m.disableLighting = false; }
    this.matCache.set(key, m);
    return m;
  }

  // Built-in images for Decal/Texture. "studio://grid": one cell of a light
  // grid (transparent with a dark edge), for baseplates. Drawn once.
  builtinUrl(id) {
    this._builtin = this._builtin || {};
    if (this._builtin[id]) return this._builtin[id];
    if (id !== 'studio://grid') return null;
    const N = 256, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.21)'; // blended in linear light: matches the old 10% sRGB darkening
    g.fillRect(0, 0, N, 3); g.fillRect(0, 0, 3, N);
    return (this._builtin[id] = c.toDataURL('image/png'));
  }

  // Decals and Textures under a part: a plane on the face, parented to the
  // part's mesh (so it follows its size and pose), drawn over it with a depth
  // offset, tiled in studs for Texture.
  decals(inst, e) {
    for (const d of e.decals || []) { d.material && d.material.dispose(true, true); d.dispose(); }
    e.decals = [];
    for (const c of inst.children) {
      if (c.ClassName !== 'Decal' && c.ClassName !== 'Texture') continue;
      const D = c.props, url = this.builtinUrl(D.Texture);
      if (!url || D.Transparency >= 1) continue;
      const [pos, rot] = FACES[D.Face] || FACES.Front;
      const plane = MeshBuilder.CreatePlane(inst.Name + '.' + c.Name, { size: 1 }, this.scene);
      plane.parent = e.mesh;
      plane.position.set(...pos); plane.rotation.set(...rot);
      plane.isPickable = false;
      plane.receiveShadows = true;
      const m = new PBRMaterial(plane.name, this.scene);
      const t = new Texture(url, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
      t.hasAlpha = true;
      if (c.ClassName === 'Texture') {
        const [u, v] = FACE_UV[D.Face] || FACE_UV.Front;
        t.uScale = inst.props.Size[u] / D.StudsPerTileU; t.vScale = inst.props.Size[v] / D.StudsPerTileV;
        t.uOffset = D.OffsetStudsU / D.StudsPerTileU; t.vOffset = D.OffsetStudsV / D.StudsPerTileV;
      }
      m.albedoTexture = t;
      m.useAlphaFromAlbedoTexture = true;
      m.albedoColor = new Color3(D.Color3.r, D.Color3.g, D.Color3.b).toLinearSpace();
      m.alpha = 1 - D.Transparency;
      m.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
      m.roughness = 0.9; m.metallic = 0;
      m.zOffset = -2; // drawn over the face it lies on
      plane.material = m;
      e.decals.push(plane);
    }
  }

  added(inst) {
    if (isA(inst.ClassName, 'BasePart') && !inst.isCharacter) this.build(inst); // the controller moves character parts
    for (const c of inst.children) this.added(c);
  }
  removed(inst) {
    const p = this.parts.get(inst);
    if (p) { p.agg && p.agg.dispose(); (p.decals || []).forEach(d => { d.material && d.material.dispose(true, true); d.dispose(); }); p.mesh.dispose(); this.parts.delete(inst); }
    for (const c of inst.children) this.removed(c);
  }
  inWorkspace(inst) { for (let p = inst; p; p = p.parent) if (p === this.dm.workspace) return true; return false; }

  build(inst) {
    this.removed(inst);
    const P = inst.props;
    const shape = inst.ClassName === 'WedgePart' ? 'Wedge' : (P.Shape || 'Block');
    let mesh;
    if (shape === 'Wedge') mesh = this.wedgeMesh(inst.Name);
    else if (shape === 'Ball') mesh = MeshBuilder.CreateSphere(inst.Name, { diameter: 1, segments: 24 }, this.scene);
    else if (shape === 'Cylinder') { mesh = MeshBuilder.CreateCylinder(inst.Name, { diameter: 1, height: 1, tessellation: 32 }, this.scene); mesh.rotation.z = Math.PI / 2; mesh.bakeCurrentTransformIntoVertices(); }
    else mesh = MeshBuilder.CreateBox(inst.Name, { size: 1 }, this.scene);
    mesh.metadata = { instance: inst };
    mesh.receiveShadows = true;
    this.shadows.addShadowCaster(mesh);
    const entry = { mesh, agg: null };
    this.parts.set(inst, entry);
    this.apply(inst, entry);
  }

  // A unit wedge (Roblox's): bottom, back (+Z) and the two side triangles are
  // flat; the slope runs from the bottom-front edge up to the top-back edge,
  // facing front (-Z) and up. Flat-shaded: each face has its own vertices.
  wedgeMesh(name) {
    const h = 0.5;
    const A = [-h, -h, -h], B = [h, -h, -h], C = [h, -h, h], D = [-h, -h, h]; // bottom: front-left, front-right, back-right, back-left
    const E = [h, h, h], F = [-h, h, h];                                          // top back edge: right, left
    const quads = [[D, C, B, A], [D, F, E, C], [A, B, E, F]];                    // bottom, back, slope
    const tris = [[B, C, E], [A, F, D]];                                         // right side, left side
    const pos = [], idx = [], uv = [];
    const add = (pts, uvs) => { const b = pos.length / 3; pts.forEach(p => pos.push(...p)); uv.push(...uvs.flat()); return b; };
    for (const q of quads) { const b = add(q, [[0, 0], [1, 0], [1, 1], [0, 1]]); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    for (const t of tris) { const b = add(t, [[0, 0], [1, 0], [1, 1]]); idx.push(b, b + 1, b + 2); }
    const nrm = [];
    VertexData.ComputeNormals(pos, idx, nrm);
    // Wind every face so its normal points out of the wedge (centre at 0).
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map(k => pos.slice(k * 3, k * 3 + 3));
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 + 1 / 6, (a[2] + b[2] + c[2]) / 3 - 1 / 6]; // from the prism's centroid
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    nrm.length = 0;
    VertexData.ComputeNormals(pos, idx, nrm);
    const mesh = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
    vd.applyToMesh(mesh);
    return mesh;
  }

  apply(inst, e) {
    const P = inst.props;
    const s = P.Size, p = P.Position, o = P.Orientation;
    e.mesh.scaling.set(s.x, s.y, s.z);
    e.mesh.position.set(p.x, p.y, p.z);
    // Roblox Orientation is degrees, applied Y then X then Z.
    e.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(o.y * DEG, o.x * DEG, o.z * DEG);
    e.mesh.material = this.material(P.Material, P.Color);
    this.decals(inst, e);
    e.mesh.visibility = 1 - P.Transparency;
    e.mesh.isVisible = P.Transparency < 1 && this.inWorkspace(inst);
    this.body(inst, e);
  }

  body(inst, e) {
    if (e.agg) { e.agg.dispose(); e.agg = null; }
    const P = inst.props;
    if (!P.CanCollide || !this.inWorkspace(inst) || !this.scene.getPhysicsEngine()) return;
    const wedge = inst.ClassName === 'WedgePart' || P.Shape === 'Wedge';
    const type = P.Shape === 'Ball' ? PhysicsShapeType.SPHERE : wedge ? PhysicsShapeType.CONVEX_HULL : PhysicsShapeType.BOX;
    // Roblox part density ~0.7 g/cm³ for plastic; mass in arbitrary units scaled by volume.
    const mass = P.Anchored ? 0 : 0.7 * P.Size.x * P.Size.y * P.Size.z;
    e.agg = new PhysicsAggregate(e.mesh, type, { mass, friction: 0.5, restitution: 0 }, this.scene);
  }

  changed(inst, key) {
    // A decal changed (or moved): redo its part's decals.
    if (inst.ClassName === 'Decal' || inst.ClassName === 'Texture') {
      for (const p of [inst.parent, inst.lastParent]) { const e = p && this.parts.get(p); if (e) this.decals(p, e); }
      inst.lastParent = inst.parent;
      return;
    }
    if (key === 'Parent') {
      if (this.inWorkspace(inst)) this.added(inst); else this.removed(inst);
      return;
    }
    const e = this.parts.get(inst);
    if (!e) return;
    if (key === 'Shape' || key === 'Size' && (inst.ClassName === 'WedgePart' || inst.props.Shape === 'Wedge')) return this.build(inst);
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
