// Draws the DataModel's parts with Babylon and gives them Havok bodies, and
// keeps both in sync as scripts change properties. Units are studs.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector3, Color3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { PhysicsShapeType, PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { partShape } from './shapes.js';
import { PHYSICAL } from './physprops.js';
import { PhysicsMaterialCombineMode } from '@babylonjs/core/Physics/v2/physicsMaterial.js';
import { isA, CF, V3 } from '../datamodel.js';
import { loadGltfContainer } from './gltf.js';

const STUD = 0.28; // metres (Roblox's conversion); glTF files are in metres

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
// Textured materials (assets/materials, CC0 from ambientCG): greyscale albedo
// tinted by the part's Color, as Roblox tints its materials; a normal map; AO,
// roughness and metalness packed in one map. `tile` is studs per repeat; UVs
// are box-projected in studs, so a texture keeps its scale on any size of part.
const TEXTURED = {
  Wood: { tile: 8 }, WoodPlanks: { tile: 8 }, Brick: { tile: 12 }, Cobblestone: { tile: 16 }, Concrete: { tile: 12 },
  Grass: { tile: 8 }, Sand: { tile: 12 }, Granite: { tile: 8 }, Marble: { tile: 12 }, DiamondPlate: { tile: 4 },
  CorrodedMetal: { tile: 8 }, Fabric: { tile: 4 }, Pebble: { tile: 10 }, Ice: { tile: 12 },
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
    this.parts = new Map(); // Instance -> { mesh, mat, agg, shape, decals, meshPart }
    this.meshCache = new Map(); // URL -> Promise of { container, size, center } (metres)
    dm.hooks.loadMesh = url => this.meshAsset(url).then(a => ({ size: a.size.map(v => v / STUD) }));
    dm.watch((inst, key) => this.changed(inst, key));
    for (const d of dm.workspace.children) this.added(d);
  }

  // Each part owns its material, updated in place when Color or Material
  // changes (a colour-cycling part used to leak a material per colour).
  updateMaterial(inst, e) {
    if (inst.ClassName === 'MeshPart') return this.meshLook(inst, e); // the file's own materials
    const P = inst.props, r = MATERIALS[P.Material] || MATERIALS.Plastic, T = TEXTURED[P.Material];
    const m = e.mat || (e.mat = new PBRMaterial(inst.Name + '#' + inst.handle, this.scene));
    // Part colours are sRGB, like Color3.fromRGB in Roblox.
    const color = new Color3(P.Color.r, P.Color.g, P.Color.b).toLinearSpace();
    if (T) {
      const tx = this.materialTextures(P.Material);
      m.albedoTexture = tx.albedo; m.bumpTexture = tx.normal; m.metallicTexture = tx.orm;
      m.albedoColor = color.scale(2); // the albedo map stores the part's colour at 0.5
      m.useAmbientOcclusionFromMetallicTextureRed = m.useRoughnessFromMetallicTextureGreen = m.useMetallnessFromMetallicTextureBlue = true;
      m.metallic = m.roughness = 1; // the map's values as they are
      m.emissiveColor = Color3.Black();
      this.studUVs(e.mesh, P.Size, T.tile);
    } else {
      m.albedoTexture = m.bumpTexture = m.metallicTexture = null;
      m.albedoColor = color;
      m.roughness = r.roughness;
      m.metallic = r.metallic;
      m.emissiveColor = r.emissive ? color.scale(r.emissive) : Color3.Black();
    }
    e.mesh.material = m;
  }
  // One set of textures per material, shared by every part that uses it.
  materialTextures(name) {
    const cache = this.matTex || (this.matTex = {});
    if (!cache[name]) {
      const url = f => `../assets/materials/${name}/${f}.jpg`, tex = f => new Texture(url(f), this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      cache[name] = { albedo: tex('albedo'), normal: tex('normal'), orm: tex('orm') };
      cache[name].albedo.anisotropicFilteringLevel = 8;
    }
    return cache[name];
  }
  // Box-projected UVs in studs: each vertex takes the two local axes across its
  // normal, scaled by the part's size. The across-axis is flipped on the
  // negative faces so no face shows its texture mirrored.
  studUVs(mesh, size, tile) {
    const pos = mesh.getVerticesData('position'), nrm = mesh.getVerticesData('normal');
    if (!pos || !nrm) return;
    const uv = new Float32Array(pos.length / 3 * 2);
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      const x = pos[i] * size.x, y = pos[i + 1] * size.y, z = pos[i + 2] * size.z;
      const ax = Math.abs(nrm[i]), ay = Math.abs(nrm[i + 1]), az = Math.abs(nrm[i + 2]);
      let u, v;
      if (ax >= ay && ax >= az) { u = nrm[i] > 0 ? -z : z; v = y; }
      else if (ay >= az) { u = x; v = nrm[i + 1] > 0 ? z : -z; }
      else { u = nrm[i + 2] > 0 ? x : -x; v = y; }
      uv[j] = u / tile; uv[j + 1] = v / tile;
    }
    mesh.setVerticesData('uv', uv, true);
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
    if (e.meshPart) return; // faces of a box; a mesh has none (not yet supported on MeshParts)
    for (const c of inst.children) {
      if (c.ClassName !== 'Decal' && c.ClassName !== 'Texture') continue;
      const D = c.props, url = this.builtinUrl(D.Texture);
      if (!url || D.Transparency >= 1) continue;
      const wedgeFront = D.Face === 'Front' && (inst.ClassName === 'WedgePart' || inst.props.Shape === 'Wedge');
      const [pos, rot] = wedgeFront ? [[0, 0, 0], [Math.PI / 4, 0, 0]] : FACES[D.Face] || FACES.Front;
      const plane = MeshBuilder.CreatePlane(inst.Name + '.' + c.Name, { size: 1 }, this.scene);
      plane.parent = e.mesh;
      plane.position.set(...pos); plane.rotation.set(...rot);
      // A wedge's front face is its slope: in the unit box it runs corner to corner, sqrt(2) long.
      if (wedgeFront) plane.scaling.y = Math.SQRT2;
      plane.isPickable = false;
      plane.receiveShadows = true;
      const m = new PBRMaterial(plane.name, this.scene);
      const t = new Texture(url, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
      t.hasAlpha = true;
      if (c.ClassName === 'Texture') {
        const [u, v] = FACE_UV[D.Face] || FACE_UV.Front;
        const vLen = wedgeFront ? Math.hypot(inst.props.Size.y, inst.props.Size.z) : inst.props.Size[v];
        t.uScale = inst.props.Size[u] / D.StudsPerTileU; t.vScale = vLen / D.StudsPerTileV;
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
    if (p && p.meshPart) { p.meshPart.token = null; p.meshPart.inst && p.meshPart.inst.dispose(); p.meshPart.fit && p.meshPart.fit.dispose(); (p.meshPart.textures || []).forEach(t => t.dispose()); }
    if (p) { p.agg && p.agg.dispose(); (p.decals || []).forEach(d => { d.material && d.material.dispose(true, true); d.dispose(); }); p.mat && p.mat.dispose(); p.mesh.dispose(); this.parts.delete(inst); }
    for (const c of inst.children) this.removed(c);
  }
  inWorkspace(inst) { for (let p = inst; p; p = p.parent) if (p === this.dm.workspace) return true; return false; }

  build(inst) {
    if (inst.ClassName === 'MeshPart') return this.buildMeshPart(inst);
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
    const entry = { mesh, mat: null, agg: null, shape: {} };
    this.parts.set(inst, entry);
    this.apply(inst, entry);
  }

  // ---- MeshParts (glTF files). The part's mesh is an invisible holder that
  // carries the collider geometry in unit space (so Size scales it, exactly as
  // for a Part); the file's meshes hang under it from a node that fits them
  // into the unit box. Until the file arrives the collider is a unit box.
  resolveUrl(id) { return /^(https?:|data:|blob:|\/)/.test(id) ? id : '../' + id; } // the page is web/play.html
  meshAsset(url) {
    if (!this.meshCache.has(url)) this.meshCache.set(url, (async () => {
      const container = await loadGltfContainer(this.scene, this.resolveUrl(url));
      // Measure once, from a throwaway instance (the container itself isn't in the scene).
      const probe = container.instantiateModelsToScene(n => n, false);
      let min = new Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
      for (const r of probe.rootNodes) { const b = r.getHierarchyBoundingVectors(true); min = Vector3.Minimize(min, b.min); max = Vector3.Maximize(max, b.max); }
      probe.dispose();
      const size = [max.x - min.x, max.y - min.y, max.z - min.z].map(v => Math.max(v, 1e-4));
      return { container, size, center: [(max.x + min.x) / 2, (max.y + min.y) / 2, (max.z + min.z) / 2] };
    })());
    return this.meshCache.get(url);
  }
  buildMeshPart(inst) {
    this.removed(inst);
    const holder = new Mesh(inst.Name, this.scene);
    VertexData.CreateBox({ size: 1 }).applyToMesh(holder);
    holder.isVisible = false;
    holder.metadata = { instance: inst };
    const e = { mesh: holder, mat: null, agg: null, shape: {}, meshPart: { token: {}, render: [], volume: 1 } };
    this.parts.set(inst, e);
    this.apply(inst, e);
    const url = inst.props.MeshId, token = e.meshPart.token;
    if (!url) return;
    this.meshAsset(url).then(a => { if (this.parts.get(inst) === e && e.meshPart.token === token) this.attachMesh(inst, e, a); })
      .catch(err => console.warn(`MeshPart ${inst.Name}: can't load ${url}: ${err && err.message || err}`));
  }
  attachMesh(inst, e, a) {
    const mp = e.meshPart, s = a.size, c = a.center;
    // Materials are cloned per part (DoubleSided and TextureID are per part); textures stay shared.
    mp.inst = a.container.instantiateModelsToScene(n => inst.Name + '/' + n, true);
    mp.inst.animationGroups.forEach(g => g.stop());
    mp.fit = new TransformNode(inst.Name + '/fit', this.scene);
    mp.fit.parent = e.mesh;
    mp.fit.scaling.set(1 / s[0], 1 / s[1], 1 / s[2]);
    mp.fit.position.set(-c[0] / s[0], -c[1] / s[1], -c[2] / s[2]);
    for (const r of mp.inst.rootNodes) r.parent = mp.fit;
    mp.render = [];
    for (const r of mp.inst.rootNodes) for (const m of [r, ...r.getChildMeshes(false)]) if (m.getTotalVertices && m.getTotalVertices() > 0) mp.render.push(m);
    for (const m of mp.render) { m.receiveShadows = true; this.shadows.addShadowCaster(m); m.metadata = { instance: inst }; }
    this.colliderGeometry(e);
    const size = new V3(s[0] / STUD, s[1] / STUD, s[2] / STUD), prev = inst.props.MeshSize;
    // A MeshPart takes its mesh's size the first time it gets one (MeshSize still
    // zero), unless a script sized it. CreateMeshPartAsync's parts and clones
    // already carry a MeshSize, so they keep their Size.
    const first = !prev || (prev.x === 0 && prev.y === 0 && prev.z === 0);
    inst.props.MeshSize = size; this.dm.fire(inst, 'Changed', ['MeshSize']);
    this.meshLook(inst, e);
    this.visibility(inst, e);
    if (first && !inst.userSized) this.dm.set(inst, 'Size', size);
    else this.body(inst, e);
  }
  // The file's triangles in the holder's unit space become the collider's
  // geometry; their enclosed volume (divergence theorem) gives the mass.
  colliderGeometry(e) {
    const holderInv = e.mesh.computeWorldMatrix(true).clone().invert();
    const pos = [], idx = [], v = Vector3.Zero();
    let vol = 0;
    for (const m of e.meshPart.render) {
      const rel = m.computeWorldMatrix(true).multiply(holderInv), P = m.getVerticesData('position'), I = m.getIndices(), base = pos.length / 3;
      if (!P) continue;
      for (let i = 0; i < P.length; i += 3) { Vector3.TransformCoordinatesFromFloatsToRef(P[i], P[i + 1], P[i + 2], rel, v); pos.push(v.x, v.y, v.z); }
      const tri = I || [...Array(P.length / 3).keys()];
      for (let i = 0; i < tri.length; i += 3) {
        const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]].map(k => (base + k) * 3);
        idx.push(base + tri[i], base + tri[i + 1], base + tri[i + 2]);
        vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
      }
    }
    if (!idx.length) return;
    const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(e.mesh, true);
    // An open mesh (no inside) has no meaningful volume: weigh it as its box.
    e.meshPart.volume = Math.abs(vol) > 0.02 ? Math.min(Math.abs(vol), 1) : 1;
  }
  // DoubleSided and TextureID, on this part's own copies of the file's materials.
  meshLook(inst, e) {
    const mp = e.meshPart, P = inst.props;
    if (!mp || !mp.render.length) return;
    const mats = new Set(mp.render.map(m => m.material).filter(Boolean).flatMap(m => m.subMaterials || [m]));
    if (P.TextureID && mp.textureFor !== P.TextureID) { mp.textures = [new Texture(this.resolveUrl(P.TextureID), this.scene, false, false)]; mp.textureFor = P.TextureID; }
    for (const m of mats) {
      m.backFaceCulling = !P.DoubleSided;
      if (m.albedoTexture !== undefined) {
        if (!('origAlbedo' in m)) m.origAlbedo = m.albedoTexture;
        m.albedoTexture = P.TextureID ? mp.textures[0] : m.origAlbedo;
      }
    }
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
    // Wind every face like Babylon's own CreateBox: (b-a)x(c-a) points INTO
    // the solid (Babylon's front faces, and ComputeNormals' outward normals,
    // follow that convention). Wound the other way, the wedge rendered
    // inside-out and passed my eye in small shots (RESEARCH.md §4e).
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map(k => pos.slice(k * 3, k * 3 + 3));
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 + 1 / 6, (a[2] + b[2] + c[2]) / 3 - 1 / 6]; // from the prism's centroid
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    nrm.length = 0;
    VertexData.ComputeNormals(pos, idx, nrm);
    const mesh = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
    vd.applyToMesh(mesh);
    return mesh;
  }

  // Everything, for a new part. Later changes do only what they need (changed()).
  apply(inst, e) {
    this.transform(inst, e);
    this.updateMaterial(inst, e);
    this.decals(inst, e);
    this.visibility(inst, e);
    this.body(inst, e);
  }
  transform(inst, e) {
    const P = inst.props, s = P.Size, cf = P.CFrame;
    e.mesh.scaling.set(s.x, s.y, s.z);
    e.mesh.position.set(cf.x, cf.y, cf.z);
    e.mesh.rotationQuaternion = new Quaternion(...cf.toQuat());
    partShape(inst, e.mesh.rotationQuaternion, e.shape);
  }
  visibility(inst, e) {
    const P = inst.props;
    if (e.meshPart) {
      e.mesh.isVisible = false;
      for (const m of e.meshPart.render) { m.visibility = 1 - P.Transparency; m.isVisible = P.Transparency < 1 && this.inWorkspace(inst); }
      return;
    }
    e.mesh.visibility = 1 - P.Transparency;
    e.mesh.isVisible = P.Transparency < 1 && this.inWorkspace(inst);
  }

  body(inst, e) {
    if (e.agg) { e.agg.dispose(); e.agg = null; }
    const P = inst.props;
    if (!this.inWorkspace(inst) || !this.scene.getPhysicsEngine()) return;
    // An anchored part that doesn't collide has nothing to simulate. An
    // unanchored one still falls (Roblox), it just collides with nothing:
    // a body with empty collision masks, which rays skip too.
    if (!P.CanCollide && P.Anchored) return;
    const wedge = inst.ClassName === 'WedgePart' || P.Shape === 'Wedge';
    // Wedges and cylinders collide as their own convex hulls (a cylinder as a box let players stand on its corners).
    let type = P.Shape === 'Ball' ? PhysicsShapeType.SPHERE : wedge || P.Shape === 'Cylinder' ? PhysicsShapeType.CONVEX_HULL : PhysicsShapeType.BOX;
    // MeshParts (CollisionFidelity): Box, Hull, or for Default and
    // PreciseConvexDecomposition the exact triangles when anchored (better than
    // Roblox's decomposition) and the hull when loose (Havok can't move a mesh shape).
    if (e.meshPart) type = !e.meshPart.render.length || P.CollisionFidelity === 'Box' ? PhysicsShapeType.BOX : P.CollisionFidelity === 'Hull' || !P.Anchored ? PhysicsShapeType.CONVEX_HULL : PhysicsShapeType.MESH;
    // Roblox's material physics: mass = density x the shape's own volume;
    // friction and elasticity per material. Roblox combines two parts' values
    // by their weights; Havok can't weight, so this uses the plain mean, which
    // is exact when both weights are 1 (most materials) and not for Ice, Sand,
    // Rubber and a few others.
    const [density, elasticity, , friction] = PHYSICAL[P.Material] || PHYSICAL.Plastic, S = P.Size;
    const volume = e.meshPart ? e.meshPart.volume * S.x * S.y * S.z : P.Shape === 'Ball' ? Math.PI / 6 * Math.min(S.x, S.y, S.z) ** 3 : P.Shape === 'Cylinder' ? Math.PI / 4 * Math.min(S.y, S.z) ** 2 * S.x : wedge ? S.x * S.y * S.z / 2 : S.x * S.y * S.z;
    const mass = P.Anchored ? 0 : density * volume;
    e.agg = new PhysicsAggregate(e.mesh, type, { mass, friction, restitution: elasticity }, this.scene);
    e.agg.shape.material = { friction, restitution: elasticity, frictionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN, restitutionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN };
    if (!P.CanCollide) { e.agg.shape.filterMembershipMask = 0; e.agg.shape.filterCollideMask = 0; }
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
    // Only what the property affects: a colour change must not rebuild the
    // physics body (or stop an unanchored part dead), nor reload decals.
    switch (key) {
      case 'Color': return this.updateMaterial(inst, e);
      case 'Material': this.updateMaterial(inst, e); return this.body(inst, e); // looks and physics both change
      case 'Transparency': return this.visibility(inst, e);
      case 'CFrame':
        this.transform(inst, e);
        if (e.agg && inst.props.Anchored) {
          // A script moving an anchored part: its body follows the mesh (kinematic), no rebuild.
          if (!e.moving) { e.agg.body.setMotionType(PhysicsMotionType.ANIMATED); e.agg.body.disablePreStep = false; e.moving = true; }
          return;
        }
        return this.body(inst, e); // teleporting an unanchored part
      case 'MeshId': return this.build(inst);
      case 'DoubleSided': case 'TextureID': return this.meshLook(inst, e);
      case 'CollisionFidelity': return this.body(inst, e);
      case 'Size':
        if (e.meshPart) { this.transform(inst, e); return this.body(inst, e); }
        if (inst.ClassName === 'WedgePart' || inst.props.Shape === 'Wedge' || inst.props.Shape === 'Cylinder') return this.build(inst); // hull from the mesh
        this.transform(inst, e); this.decals(inst, e); if (TEXTURED[inst.props.Material]) this.studUVs(e.mesh, inst.props.Size, TEXTURED[inst.props.Material].tile); return this.body(inst, e);
      case 'Shape': return this.build(inst);
      case 'CanCollide': case 'Anchored': e.moving = false; return this.body(inst, e);
      // On an unanchored part, setting a velocity sets it for this frame and physics takes over (Roblox).
      // On an anchored part it's only read: by whatever stands on it.
      case 'AssemblyLinearVelocity': case 'AssemblyAngularVelocity': {
        if (inst.props.Anchored || !e.agg) return;
        const v = inst.props[key], b = e.agg.body;
        if (key === 'AssemblyLinearVelocity') b.setLinearVelocity(new Vector3(v.x, v.y, v.z)); else b.setAngularVelocity(new Vector3(v.x, v.y, v.z));
        return;
      }
      default: return; // Name, CanTouch, Reflectance...: nothing to redraw
    }
  }

  // Unanchored parts are moved by physics: copy their pose back into the DataModel.
  // How each anchored part moved since last frame (a tween, a script setting
  // its CFrame, a spinner), as velocities: inst.kin = { v, w } (studs/s,
  // rad/s), or null if it didn't move or jumped (a teleport). Roblox gives such
  // parts no velocity, so they don't carry what stands on them; here they do.
  trackMotion(dt) {
    for (const [inst, e] of this.parts) {
      if (!inst.props.Anchored) { inst.kin = null; e.prevCF = null; continue; }
      const cf = inst.props.CFrame, prev = e.prevCF;
      e.prevCF = cf;
      if (!prev || prev === cf || dt <= 0) { inst.kin = null; continue; }
      const v = [(cf.x - prev.x) / dt, (cf.y - prev.y) / dt, (cf.z - prev.z) / dt];
      // Rotation since last frame: q = now * conj(before), as an axis-angle rate.
      const [ax, ay, az, aw] = cf.toQuat(), [bx, by, bz, bw] = prev.toQuat();
      let qx = aw * -bx + ax * bw + ay * -bz - az * -by, qy = aw * -by - ax * -bz + ay * bw + az * -bx,
          qz = aw * -bz + ax * -by - ay * -bx + az * bw, qw = aw * bw - ax * -bx - ay * -by - az * -bz;
      if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
      const s = Math.hypot(qx, qy, qz), angle = 2 * Math.atan2(s, qw);
      const w = s > 1e-9 ? [qx / s * angle / dt, qy / s * angle / dt, qz / s * angle / dt] : [0, 0, 0];
      inst.kin = Math.hypot(...v) > 300 || angle > 1 ? null : { v, w };
    }
  }

  syncFromPhysics() {
    const floor = this.dm.workspace.props.FallenPartsDestroyHeight;
    const fallen = [];
    for (const [inst, e] of this.parts) {
      if (inst.props.Anchored || !e.agg) continue;
      const m = e.mesh;
      if (m.position.y < floor) { fallen.push(inst); continue; } // Roblox destroys parts that fall this far
      // Physics-driven: written straight to the props (no Changed per frame, as in Roblox).
      const p = m.position, q = m.rotationQuaternion || Quaternion.Identity();
      const cf = CF.fromQuat(p.x, p.y, p.z, q.x, q.y, q.z, q.w), [ox, oy, oz] = cf.toOrientation();
      inst.props.CFrame = cf; inst.props.Position = new V3(cf.x, cf.y, cf.z); inst.props.Orientation = new V3(ox, oy, oz);
      const b = e.agg.body, lv = b.getLinearVelocity(), av = b.getAngularVelocity();
      inst.props.AssemblyLinearVelocity = new V3(lv.x, lv.y, lv.z); inst.props.AssemblyAngularVelocity = new V3(av.x, av.y, av.z);
      partShape(inst, m.rotationQuaternion, e.shape);
    }
    for (const inst of fallen) this.dm.destroy(inst);
  }
}

export { Vector3 };
