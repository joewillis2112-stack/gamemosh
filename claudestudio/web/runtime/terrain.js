// workspace.Terrain drawn and solid: each 64-stud chunk of terrain/voxels.js
// meshed by terrain/mesher.js into ground (vertex colours from the material
// colours, a static Havok mesh collider) and water (see-through, WaterColor
// and WaterTransparency, no collider). Chunks a change touched are remeshed
// before the next physics step or frame, whichever comes first, so a script's
// fill is solid on the next step and a burst of fills remeshes once.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { meshChunk } from '../terrain/mesher.js';

const FRICTION = 0.4; // UNSURE: one value for all terrain materials (Roblox's differ per material)

export class TerrainView {
  constructor(scene, dm, shadows) {
    Object.assign(this, { scene, dm, shadows });
    this.chunks = new Map(); // "cx,cy,cz" -> { solid, water, agg }
    this.solidMat = new PBRMaterial('terrain', scene);
    this.solidMat.albedoColor = Color3.White(); this.solidMat.roughness = 0.92; this.solidMat.metallic = 0;
    this.waterMat = new PBRMaterial('terrainWater', scene);
    this.waterMat.metallic = 0; this.waterMat.roughness = 0.08; this.waterMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND; this.waterMat.backFaceCulling = false;
    dm.watch((inst, key) => { if (inst === this.terrain() && /^Water/.test(key)) this.waterLook(); });
    const step = () => this.update();
    scene.onBeforePhysicsObservable.add(step);
    scene.onBeforeRenderObservable.add(step);
    this.waterLook();
    this.update();
  }
  terrain() { return this.dm.workspace.children.find(c => c.ClassName === 'Terrain') || null; }
  waterLook() {
    const t = this.terrain(); if (!t) return;
    const P = t.props, c = P.WaterColor;
    this.waterMat.albedoColor = new Color3(c.r, c.g, c.b).toLinearSpace();
    this.waterMat.alpha = 1 - P.WaterTransparency;
  }
  /** Remesh the chunks changed since last time. */
  update() {
    const t = this.terrain(); if (!t) return;
    for (const [cx, cy, cz] of t.voxels.take()) this.rebuild(t, cx, cy, cz);
  }
  rebuild(t, cx, cy, cz) {
    const k = cx + ',' + cy + ',' + cz, old = this.chunks.get(k);
    if (old) { old.agg && old.agg.dispose(); old.solid && old.solid.dispose(); old.water && old.water.dispose(); this.chunks.delete(k); }
    const m = meshChunk(t.voxels, cx, cy, cz), e = {};
    if (m.solid) {
      e.solid = this.mesh('terrain ' + k, m.solid, this.solidMat, t);
      e.solid.receiveShadows = true; this.shadows && this.shadows.addShadowCaster(e.solid);
      e.agg = new PhysicsAggregate(e.solid, PhysicsShapeType.MESH, { mass: 0, friction: FRICTION, restitution: 0 }, this.scene);
    }
    if (m.water) { e.water = this.mesh('water ' + k, m.water, this.waterMat, t); e.water.receiveShadows = true; }
    if (e.solid || e.water) this.chunks.set(k, e);
  }
  mesh(name, a, mat, t) {
    const mesh = new Mesh(name, this.scene), vd = new VertexData();
    // The material colours are sRGB; the PBR shader multiplies vertex colours in linear space.
    const lin = new Float32Array(a.colors.length);
    for (let i = 0; i < lin.length; i++) lin[i] = i % 4 === 3 ? a.colors[i] : Math.pow(a.colors[i], 2.2);
    vd.positions = a.positions; vd.normals = a.normals; vd.colors = lin; vd.indices = a.indices;
    vd.applyToMesh(mesh);
    mesh.material = mat; mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
    mesh.metadata = { instance: t };
    return mesh;
  }
  /** Triangles drawn, for tests: { solid, water }. */
  stats() { let solid = 0, water = 0; for (const e of this.chunks.values()) { if (e.solid) solid += e.solid.getTotalIndices() / 3; if (e.water) water += e.water.getTotalIndices() / 3; } return { solid, water, chunks: this.chunks.size }; }
}
