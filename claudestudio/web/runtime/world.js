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
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody.js';
import { PhysicsShapeContainer, PhysicsShapeBox, PhysicsShapeSphere, PhysicsShapeConvexHull } from '@babylonjs/core/Physics/v2/physicsShape.js';
import { PhysicsShapeType, PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { partShape } from './shapes.js';
import { PHYSICAL } from './physprops.js';
import { PhysicsMaterialCombineMode } from '@babylonjs/core/Physics/v2/physicsMaterial.js';
import { isA, CF, V3 } from '../datamodel.js';
import { loadGltfContainer } from './gltf.js';
import { loadMesh, renderArrays, extent } from '../modeling/editable.js';
import { TerrainView } from './terrain.js';
import { cubeProjectUVs } from './cubeuv.js';
import { operate, faceColors } from '../modeling/csg.js';

const STUD = 0.28; // metres (Roblox's conversion); glTF files are in metres
// Poly Haven's models come at several texture resolutions, each its own file (/gltf/1k/ID/ID_1k.gltf).
// A MeshPart naming one loads it at the fidelity tier's: 1k on low and phone, 2k on high, 4k on ultra.
const POLYHAVEN = /^(https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Models\/gltf\/)(\d+k)\/([^/]+)\/\3_\2\.gltf$/;
export const TEXTURE_RES = { low: '1k', phone: '1k', high: '2k', ultra: '4k' };
export function tierUrl(url, res) { const m = POLYHAVEN.exec(url || ''); return m ? `${m[1]}${res}/${m[3]}/${m[3]}_${res}.gltf` : url; }

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
const AXIS_FACES = [['Left', 'Right'], ['Bottom', 'Top'], ['Front', 'Back']]; // by axis: [the negative side, the positive side]
const isWedge = inst => inst.ClassName === 'WedgePart' || inst.props.Shape === 'Wedge';

/** The NormalId face triangle `t` of a part's unit mesh belongs to: its outward normal's largest axis
 *  in studs (Blender's Cube Projection, on the part's Size), and on a wedge the slope is its Front.
 *  `pos`/`idx`: the mesh's positions and indices (unit space). */
//  A solid-modelling result (not convex) is a mesh in studs (MeshSize, stretched to Size): its
//  outward side is the one its own vertex normals `nrm` point to.
export function triangleFace(inst, pos, idx, t, nrm = null) {
  const S = inst.props.Size, v = k => [pos[idx[t * 3 + k] * 3], pos[idx[t * 3 + k] * 3 + 1], pos[idx[t * 3 + k] * 3 + 2]];
  const a = v(0), b = v(1), c = v(2), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], g;
  if (nrm) g = [0, 1, 2].map(j => nrm[idx[t * 3] * 3 + j] + nrm[idx[t * 3 + 1] * 3 + j] + nrm[idx[t * 3 + 2] * 3 + j]);
  else { // the part's shapes are convex: outward points away from a point inside (the mean of the mesh's vertices; not the box's centre, which lies on a wedge's slope)
    const o = innerPoint(pos); g = [(a[0] + b[0] + c[0]) / 3 - o[0], (a[1] + b[1] + c[1]) / 3 - o[1], (a[2] + b[2] + c[2]) / 3 - o[2]];
  }
  if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0) n = n.map(x => -x);
  // In studs: a part's mesh is the unit shape (stretched by Size); a mesh in studs is stretched by Size/MeshSize.
  const M = nrm && inst.props.MeshSize && inst.props.MeshSize.x > 0 ? inst.props.MeshSize : new V3(1, 1, 1);
  const s = [n[0] * M.x / S.x, n[1] * M.y / S.y, n[2] * M.z / S.z], m = s.map(Math.abs), k = m.indexOf(Math.max(...m));
  const face = AXIS_FACES[k][s[k] > 0 ? 1 : 0];
  return isWedge(inst) && face === 'Top' ? 'Front' : face;
}
const inner = new WeakMap();
function innerPoint(pos) {
  if (!inner.has(pos)) { const m = [0, 0, 0]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) m[k] += pos[i + k] * 3 / pos.length; inner.set(pos, m); }
  return inner.get(pos);
}
/** The face of the part mesh's triangle `faceId` (a pick's), as triangleFace. */
export function faceOfTriangle(inst, mesh, faceId) { return triangleFace(inst, mesh.getVerticesData('position'), mesh.getIndices(), faceId, isA(inst.ClassName, 'PartOperation') ? mesh.getVerticesData('normal') : null); }

export class World {
  constructor(scene, dm, shadows, { quality = 'high' } = {}) {
    this.scene = scene;
    this.texRes = TEXTURE_RES[quality] || '1k';
    this.dm = dm;
    this.shadows = shadows;
    this.parts = new Map(); // Instance -> { mesh, mat, agg, shape, decals, meshPart }
    this.meshCache = new Map(); // URL -> Promise of { container, size, center } (metres)
    dm.hooks.loadMesh = url => this.meshAsset(tierUrl(url, this.texRes)).then(a => ({ size: a.size.map(v => v / STUD) }));
    dm.hooks.csg = (op, part, parts, opts) => operate(dm, op, part, parts, opts); // BasePart:UnionAsync and the rest (modeling/csg.js)
    dm.watch((inst, key) => this.changed(inst, key));
    for (const d of dm.workspace.children) this.added(d);
    this.terrain = new TerrainView(scene, dm, shadows); // workspace.Terrain (runtime/terrain.js)
    // Assemblies (web/assembly.js): an unanchored one of several parts is one Havok body (a compound
    // of its parts' shapes) on its root; the other parts follow the root. Parts of an anchored one
    // don't move (e.fixed).
    this.compounds = new Map(); // root part -> { node, body, shape, children }
    this.pendingCompounds = new Set(); // roots whose compound is to be (re)built before the next step
    this.syncing = false; // while physics writes placements (they move meshes only)
    dm.assemblies.onRebuild = () => this.reassemble();
    this.reassemble();
  }

  // Each part owns its material, updated in place when Color or Material
  // changes (a colour-cycling part used to leak a material per colour).
  updateMaterial(inst, e) {
    if (inst.ClassName === 'MeshPart' && !(e.meshPart && e.meshPart.editable)) return this.meshLook(inst, e); // the file's own materials
    const target = e.meshPart && e.meshPart.editable ? e.meshPart.render[0] : e.mesh; // an editable mesh wears the part's look
    const P = inst.props, r = MATERIALS[P.Material] || MATERIALS.Plastic, T = TEXTURED[P.Material];
    const m = e.mat || (e.mat = new PBRMaterial(inst.Name + '#' + inst.handle, this.scene));
    // Part colours are sRGB, like Color3.fromRGB in Roblox.
    const color = new Color3(P.Color.r, P.Color.g, P.Color.b).toLinearSpace();
    if (T && target === e.mesh) {
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
    // A union showing its parts' own colours: they're in the vertex colours, the material stays white.
    if (target !== e.mesh && e.meshPart.colored) { m.albedoColor = Color3.White(); if (r.emissive) m.emissiveColor = Color3.White().scale(r.emissive * 0.5); }
    // A negated part shows as Studio shows it: pink and see-through.
    if (inst.ClassName === 'NegateOperation') { m.albedoColor = new Color3(1, 0.4, 0.75).toLinearSpace(); m.alpha = 0.5; m.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND; }
    else if (m.alpha !== 1) { m.alpha = 1; m.transparencyMode = null; }
    // An editable mesh can have bent (non-planar) faces whose triangles face either way: draw both sides, lit as such.
    if (target !== e.mesh) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    // An editable mesh with a TextureID (painted in the editor) shows the image as it is.
    if (target !== e.mesh && P.TextureID) {
      const mp = e.meshPart;
      if (mp.textureFor !== P.TextureID) { mp.textures = [new Texture(this.resolveUrl(P.TextureID), this.scene, false, false)]; mp.textureFor = P.TextureID; }
      m.albedoTexture = mp.textures[0]; m.albedoColor = Color3.White(); m.emissiveColor = Color3.Black();
    }
    target.material = m;
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
  // grid (transparent with a dark edge), for baseplates; "studio://white". Drawn once.
  builtinUrl(id) {
    this._builtin = this._builtin || {};
    if (this._builtin[id]) return this._builtin[id];
    if (id === 'studio://white') { // plain white, for effects that colour it themselves
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
      return (this._builtin[id] = c.toDataURL('image/png'));
    }
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
    const opMesh = e.meshPart && e.meshPart.editable && isA(inst.ClassName, 'PartOperation'); // a union's faces: its triangles, projected
    if (e.meshPart && !opMesh) return; // faces of a box; a MeshPart's mesh has none (it is painted through its UVs)
    for (const c of inst.children) {
      if (c.ClassName !== 'Decal' && c.ClassName !== 'Texture') continue;
      // A built-in image, or an image by URL (a painted one is a PNG data URL); asset ids aren't loaded yet.
      const D = c.props, url = this.builtinUrl(D.Texture) || (/^(data:image\/|blob:|https?:)/.test(D.Texture) || (!/^rbx/i.test(D.Texture) && /\.(png|jpe?g|webp)$/i.test(D.Texture)) ? this.resolveUrl(D.Texture) : null); // Roblox's own asset URLs (rbxasset://, rbxassetid://) aren't fetchable here
      if (!url || D.Transparency >= 1) continue;
      const wedgeFront = D.Face === 'Front' && isWedge(inst);
      const [pos, rot] = wedgeFront ? [[0, 0, 0], [Math.PI / 4, 0, 0]] : FACES[D.Face] || FACES.Front;
      // A curved face (a Ball's, a Cylinder's) or a wedge's triangular side: the part's own triangles
      // on that face, with the flat plane's UVs projected onto them, so the image lies on the surface
      // and stops at its edges (Roblox projects decals onto the part too). Flat square faces: a plane.
      const shape = inst.props.Shape, curved = opMesh || (inst.ClassName === 'Part' && (shape === 'Ball' || shape === 'Cylinder')) || (isWedge(inst) && (D.Face === 'Left' || D.Face === 'Right'));
      const plane = curved ? this.projectedFace(inst, e, D.Face, pos, rot) : MeshBuilder.CreatePlane(inst.Name + '.' + c.Name, { size: 1 }, this.scene);
      if (!plane) continue; // no triangles face that way
      plane.parent = e.mesh;
      if (!curved) plane.position.set(...pos), plane.rotation.set(...rot);
      // A wedge's front face is its slope: in the unit box it runs corner to corner, sqrt(2) long.
      if (wedgeFront) plane.scaling.y = Math.SQRT2;
      plane.isPickable = false;
      plane.metadata = { decal: c, projected: curved }; // which Decal this plane draws (the Paint tool paints into it)
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

  // The part mesh's triangles on `face` (triangleFace), as a mesh in the part's unit space, UV'd as
  // the face's plane (at `pos`, turned by `rot`; CreatePlane's UV = its local x, y + 0.5) would be.
  projectedFace(inst, e, face, pos, rot) {
    // A solid-modelling result: its drawn mesh, in studs about its centre, brought into the part's unit space.
    const op = e.meshPart && e.meshPart.editable, src = op ? e.meshPart.render[0] : e.mesh, P = src.getVerticesData('position'), N = src.getVerticesData('normal'), idx = src.getIndices();
    const fit = op ? [e.meshPart.centre, [0, 1, 2].map(k => 1 / [inst.props.MeshSize.x, inst.props.MeshSize.y, inst.props.MeshSize.z][k])] : null;
    const unit = (i, k) => fit ? (P[i * 3 + k] - fit[0][k]) * fit[1][k] : P[i * 3 + k];
    const inv = Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(rot[1], rot[0], rot[2]), new Vector3(...pos)).invert();
    const vd = new VertexData(), p = [], n = [], uv = [], q = new Vector3();
    for (let t = 0; t < idx.length / 3; t++) {
      if (triangleFace(inst, P, idx, t, op ? N : null) !== face) continue;
      for (let k = 0; k < 3; k++) {
        const i = idx[t * 3 + k], x = unit(i, 0), y = unit(i, 1), z = unit(i, 2);
        p.push(x, y, z); n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, inv, q);
        uv.push(q.x + 0.5, q.y + 0.5);
      }
    }
    if (!p.length) return null;
    Object.assign(vd, { positions: p, normals: n, uvs: uv, indices: p.map((_, i) => i).slice(0, p.length / 3) });
    const m = new Mesh(inst.Name + '.' + face, this.scene);
    vd.applyToMesh(m);
    return m;
  }

  added(inst) {
    if (isA(inst.ClassName, 'BasePart') && !inst.isCharacter && inst.ClassName !== 'Terrain') this.build(inst); // the controller moves character parts; Terrain is runtime/terrain.js's
    for (const c of inst.children) this.added(c);
  }
  removed(inst) {
    const p = this.parts.get(inst);
    if (p && p.meshPart) {
      const mp = p.meshPart; mp.token = null;
      // A glTF MeshPart's own copies of the file's materials (and their textures: cloned with them)
      // go with it; the instantiated entries' dispose leaves them. An editable mesh wears p.mat.
      const own = mp.editable ? [] : [...new Set(mp.render.map(m => m.material).filter(Boolean))];
      for (const m of own) for (const sm of m.subMaterials || [m]) if (sm && 'origAlbedo' in sm) sm.albedoTexture = sm.origAlbedo;
      mp.inst && mp.inst.dispose(); mp.fit && mp.fit.dispose(); (mp.textures || []).forEach(t => t.dispose());
      for (const m of own) m.dispose(false, true, true);
    }
    if (p) { p.agg && p.agg.dispose(); (p.decals || []).forEach(d => { d.material && d.material.dispose(true, true); d.dispose(); }); p.mat && p.mat.dispose(); p.mesh.dispose(); this.parts.delete(inst); }
    if (this.compounds.has(inst)) this.compound(inst); // a loose assembly's root left: its body goes
    for (const c of inst.children) this.removed(c);
  }
  inWorkspace(inst) { for (let p = inst; p; p = p.parent) if (p === this.dm.workspace) return true; return false; }

  build(inst) {
    if (isA(inst.ClassName, 'TriangleMeshPart')) return this.buildMeshPart(inst); // MeshParts and solid-modelling results
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
    if (/^rbx/i.test(url)) return Promise.reject(new Error("Roblox's own asset ids (rbxassetid://) can't be loaded here")); // not fetched: it would only 404
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
  /** A new fidelity tier: MeshParts of a multi-resolution model reload at its texture resolution
   *  (and the other resolutions' files are let go). */
  setTier(name) {
    const res = TEXTURE_RES[name] || '1k';
    if (res === this.texRes) return;
    this.texRes = res;
    for (const inst of [...this.parts.keys()]) if (POLYHAVEN.test(inst.props.MeshId || '') && !inst.props.MeshData) this.build(inst);
    for (const [url, p] of this.meshCache) {
      const m = POLYHAVEN.exec(url);
      if (m && m[2] !== res) { this.meshCache.delete(url); p.then(a => a.container.dispose(), () => {}); }
    }
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
    if (inst.props.MeshData) return this.attachEditable(inst, e);
    const url = tierUrl(inst.props.MeshId, this.texRes), token = e.meshPart.token;
    if (!url) return;
    this.meshAsset(url).then(a => { if (this.parts.get(inst) === e && e.meshPart.token === token) this.attachMesh(inst, e, a); })
      .catch(err => console.warn(`MeshPart ${inst.Name}: can't load ${url}: ${err && err.message || err}`));
  }
  // An editable mesh (MeshData, the modeling kernel's): drawn from its own
  // triangles with the part's Color and Material, like a Part. MeshSize is its
  // extent; Size is the part's (saved), so a resized mesh stays resized.
  attachEditable(inst, e) {
    let mesh;
    try { mesh = loadMesh(inst.props.MeshData); } catch (err) { console.warn(`MeshPart ${inst.Name}: bad MeshData: ${err.message}`); return; }
    const a = renderArrays(mesh), ex = extent(mesh), s = ex.size, c = ex.centre;
    const r = new Mesh(inst.Name + '/mesh', this.scene), vd = new VertexData();
    vd.positions = a.positions; vd.normals = a.normals; vd.indices = a.indices;
    vd.uvs = a.uvs.some(v => v !== 0) ? a.uvs : cubeProjectUVs(a.positions, a.normals); // no UVs: Cube Projection, so it can be painted
    // A union's parts' own colours, per triangle (unless UsePartColor), as vertex colours (linear).
    const fc = faceColors(inst, mesh, Array.from(a.faceIds));
    if (fc) { const col = new Float32Array(a.positions.length / 3 * 4); fc.forEach((c3, t) => { const l = new Color3(c3.r, c3.g, c3.b).toLinearSpace(); for (let k = 0; k < 3; k++) col.set([l.r, l.g, l.b, 1], (t * 3 + k) * 4); }); vd.colors = col; }
    vd.applyToMesh(r);
    const mp = e.meshPart;
    mp.editable = true; mp.faceIds = a.faceIds; mp.centre = c; mp.colored = !!fc;
    if (isA(inst.ClassName, 'PartOperation')) inst.props.TriangleCount = a.positions.length / 9;
    mp.fit = new TransformNode(inst.Name + '/fit', this.scene);
    mp.fit.parent = e.mesh;
    mp.fit.scaling.set(1 / s[0], 1 / s[1], 1 / s[2]);
    mp.fit.position.set(-c[0] / s[0], -c[1] / s[1], -c[2] / s[2]);
    r.parent = mp.fit;
    mp.inst = { dispose: () => r.dispose() };
    mp.render = [r];
    r.receiveShadows = true; this.shadows.addShadowCaster(r); r.metadata = { instance: inst };
    this.colliderGeometry(e);
    inst.props.MeshSize = new V3(s[0], s[1], s[2]);
    this.updateMaterial(inst, e);
    this.visibility(inst, e);
    this.body(inst, e);
    if (isA(inst.ClassName, 'PartOperation')) this.decals(inst, e); // a union takes Decals (projected onto its triangles), as in Roblox
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
    // Joined to other parts: an assembly with an anchored part doesn't move (all its parts are fixed);
    // an unanchored one is one body, built on its root (compound()).
    // (Read without flushing: a flush rebuilds bodies, this one included. A stale graph is put right
    // by the next flush, which rebuilds the parts whose assembly changed.)
    const A = this.dm.assemblies, a = A.stale ? null : A.of.get(inst), joined = !!a && a.parts.length > 1;
    e.asmSig = this.asmSig(a); e.asmRoot = joined ? a.root : null; e.asm = joined ? a : null;
    e.fixed = !!P.Anchored || (joined && a.anchored);
    if (joined && !a.anchored) { this.pendingCompounds.add(a.root); return; }
    // An anchored part that doesn't collide has nothing to simulate. An
    // unanchored one still falls (Roblox), it just collides with nothing:
    // a body with empty collision masks, which rays skip too.
    if (!P.CanCollide && e.fixed) return;
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
    const mass = e.fixed ? 0 : density * volume;
    e.agg = new PhysicsAggregate(e.mesh, type, { mass, friction, restitution: elasticity }, this.scene);
    e.agg.shape.material = { friction, restitution: elasticity, frictionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN, restitutionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN };
    if (!P.CanCollide) { e.agg.shape.filterMembershipMask = 0; e.agg.shape.filterCollideMask = 0; }
  }

  changed(inst, key) {
    if (inst.ClassName === 'Terrain') return; // runtime/terrain.js draws it
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
        if (this.syncing) return; // physics (or an assembly following it) moved it: the mesh only
        if (e.asm && !e.fixed) { this.pendingCompounds.add(e.asm.root); return; } // a script moved a loose assembly: rebuilt where it is now (keeping its velocity)
        if (e.agg && e.fixed) {
          // A script moving an anchored part: its body follows the mesh (kinematic), no rebuild.
          if (!e.moving) { e.agg.body.setMotionType(PhysicsMotionType.ANIMATED); e.agg.body.disablePreStep = false; e.moving = true; }
          return;
        }
        return this.body(inst, e); // teleporting an unanchored part
      case 'MeshId': case 'MeshData': case 'UsePartColor': case 'PartColors': return this.build(inst);
      case 'DoubleSided': case 'TextureID': return e.meshPart && e.meshPart.editable ? this.updateMaterial(inst, e) : this.meshLook(inst, e);
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
      if (!e.fixed) { inst.kin = null; e.prevCF = null; continue; }
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

  // The assembly graph changed: parts whose assembly changed get their bodies again; loose
  // assemblies whose root or parts changed get their compound again.
  reassemble() {
    for (const [inst, e] of this.parts) {
      const a = this.dm.assemblies.of.get(inst), joined = !!a && a.parts.length > 1;
      if (e.asmSig === this.asmSig(a) && e.asmRoot === (joined ? a.root : null)) { e.asm = joined ? a : null; continue; }
      this.body(inst, e); // records the assembly it was built for
    }
    for (const root of [...this.compounds.keys()]) { const a = this.dm.assemblies.of.get(root); if (!a || a.root !== root || a.parts.length < 2 || a.anchored) this.pendingCompounds.add(root); }
  }
  asmSig(a) { return a && a.parts.length > 1 ? `${a.anchored ? 'A' : 'D'}${a.parts.length}` : ''; }
  /** Before each physics step: the joint graph current, every pending compound built. */
  prePhysics() {
    this.dm.assemblies.flush();
    for (const root of this.pendingCompounds) this.compound(root);
    this.pendingCompounds.clear();
  }
  // One part's collision shape for a compound, in its own frame, at its size: a box, a ball, or the
  // hull of its mesh (a wedge, a cylinder, a MeshPart; Havok bakes the mesh's scale in), with its
  // material's density (Havok sums them: mass = density x volume, as for a lone part), friction and
  // elasticity. A Massless part adds (almost) nothing.
  shapeOf(inst, e) {
    const P = inst.props, S = P.Size, wedge = inst.ClassName === 'WedgePart' || P.Shape === 'Wedge';
    const [density, elasticity, , friction] = PHYSICAL[P.Material] || PHYSICAL.Plastic;
    let s;
    if (P.Shape === 'Ball') s = new PhysicsShapeSphere(Vector3.Zero(), Math.min(S.x, S.y, S.z) / 2, this.scene);
    else if (wedge || P.Shape === 'Cylinder' || (e.meshPart && e.meshPart.render.length && P.CollisionFidelity !== 'Box')) { e.mesh.computeWorldMatrix(true); s = new PhysicsShapeConvexHull(e.mesh, this.scene); }
    else s = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(S.x, S.y, S.z), this.scene);
    s.density = P.Massless ? 1e-6 : density;
    s.material = { friction, restitution: elasticity, frictionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN, restitutionCombine: PhysicsMaterialCombineMode.ARITHMETIC_MEAN };
    if (!P.CanCollide) { s.filterMembershipMask = 0; s.filterCollideMask = 0; }
    return s;
  }
  // A loose assembly's body: an unscaled node at the root's CFrame, a container of every part's shape
  // at its offset from the root. A rebuilt one keeps the old one's velocity.
  compound(root) {
    const old = this.compounds.get(root);
    let lv = null, av = null;
    if (old) { lv = old.body.getLinearVelocity(); av = old.body.getAngularVelocity(); old.body.dispose(); for (const c of old.children) c.dispose(); old.shape.dispose(); old.node.dispose(); this.compounds.delete(root); }
    const a = this.dm.assemblies.assemblyOf(root);
    if (!a || a.root !== root || a.parts.length < 2 || a.anchored || root.destroyed || !this.inWorkspace(root) || !this.scene.getPhysicsEngine()) return;
    const rc = root.props.CFrame, [rx, ry, rz, rw] = rc.toQuat(), inv = rc.inverse();
    const node = new TransformNode(root.Name + '/assembly', this.scene);
    node.position.set(rc.x, rc.y, rc.z); node.rotationQuaternion = new Quaternion(rx, ry, rz, rw);
    const shape = new PhysicsShapeContainer(this.scene), children = [];
    for (const p of a.parts) {
      const pe = this.parts.get(p);
      if (!pe) continue;
      if (pe.agg) { pe.agg.dispose(); pe.agg = null; }
      const s = this.shapeOf(p, pe), r = inv.mul(p.props.CFrame), [x, y, z, w] = r.toQuat();
      shape.addChild(s, new Vector3(r.x, r.y, r.z), new Quaternion(x, y, z, w));
      children.push(s);
    }
    const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, this.scene);
    body.shape = shape;
    if (lv) { body.setLinearVelocity(lv); body.setAngularVelocity(av); }
    this.compounds.set(root, { node, body, shape, children });
  }

  syncFromPhysics() {
    const floor = this.dm.workspace.props.FallenPartsDestroyHeight;
    const fallen = [];
    // Loose assemblies: the root from its body, the rest placed from it through their joints.
    this.syncing = true;
    try {
      for (const [root, c] of this.compounds) {
        const a = this.dm.assemblies.of.get(root);
        if (!a || a.root !== root) continue;
        const n = c.node, p = n.position, q = n.rotationQuaternion;
        if (p.y < floor) { fallen.push(...a.parts); continue; }
        const cf = CF.fromQuat(p.x, p.y, p.z, q.x, q.y, q.z, q.w), [ox, oy, oz] = cf.toOrientation();
        Object.assign(root.props, { CFrame: cf, Position: new V3(cf.x, cf.y, cf.z), Orientation: new V3(ox, oy, oz) });
        this.dm.notify(root, 'CFrame');
        this.dm.assemblies.place(a);
        const lv = c.body.getLinearVelocity(), av = c.body.getAngularVelocity(), LV = new V3(lv.x, lv.y, lv.z), AV = new V3(av.x, av.y, av.z);
        for (const m of a.parts) { m.props.AssemblyLinearVelocity = LV; m.props.AssemblyAngularVelocity = AV; const me = this.parts.get(m); if (me) partShape(m, me.mesh.rotationQuaternion, me.shape); }
      }
    } finally { this.syncing = false; }
    for (const [inst, e] of this.parts) {
      if (e.fixed || !e.agg) continue;
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
