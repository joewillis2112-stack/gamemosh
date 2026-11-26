// SurfaceGuis in the 3D view (runtime/surfacegui.js; runtime/gui.js lays them out and draws their image): each
// one not AlwaysOnTop is a quad on its face, parented to the part's mesh (so it follows the part), textured with
// the GUI's image and occluded like any surface. LightInfluence blends lit (like the part's own surface) and
// unlit (the GUI's own colours, times Brightness): albedo x LightInfluence + emission x (1 - LightInfluence) x
// Brightness x UNLIT; at 0, unlit (no shading, no reflections). UNLIT (OURS): white at Brightness 1 just under the
// default Bloom's threshold (runtime/lighting.js maps Roblox's Threshold 2 to 0.9), so it doesn't glow, as a GUI's
// white doesn't reach Roblox's threshold 2; a brighter GUI glows. Seen only from in front, as Decals are. ZOffset orders
// GUIs on the same face (higher draws over lower; OURS: also drawn over the face's Decals).
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Color3 } from '@babylonjs/core/Maths/math.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { canvasPoint } from './surfacegui.js';

const UNLIT = 0.85;

export class Surfaces {
  constructor(scene, world, gui) {
    Object.assign(this, { scene, world, gui });
    this.quads = new Map(); // SurfaceGui -> { mesh, mat, tex, version, geo, parent }
  }

  update() {
    const live = new Set();
    for (const d of this.gui.sgDraws || []) {
      const pe = this.world.parts.get(d.part);
      if (!pe || !pe.mesh || pe.mesh.isDisposed()) continue;
      live.add(d.sg);
      let q = this.quads.get(d.sg);
      if (q && q.mesh.isDisposed()) { this.drop(d.sg); q = null; } // (its part's mesh was rebuilt)
      if (!q) q = this.make(d.sg);
      const S = d.part.props.Size, b = d.image.bounds;
      // Its corners in the part mesh's unit space (studs over Size), from the image's box in canvas px.
      const geo = [d.W, d.H, ...b, S.x, S.y, S.z, d.props.Face, d.part.ClassName, d.part.props.Shape].join(',');
      if (geo !== q.geo) { q.geo = geo; this.shape(q, d); }
      if (q.mesh.parent !== pe.mesh) q.mesh.parent = pe.mesh;
      if (q.version !== d.image.version) { q.version = d.image.version; this.paint(q, d.image.canvas); }
      this.light(q, d.props);
      q.mesh.setEnabled(true);
    }
    for (const sg of [...this.quads.keys()]) if (!live.has(sg)) this.drop(sg);
  }

  make(sg) {
    const mesh = new Mesh('SurfaceGui.' + sg.props.Name, this.scene);
    mesh.isPickable = false;
    const mat = new PBRMaterial(mesh.name, this.scene);
    mat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    mat.useAlphaFromAlbedoTexture = true;
    mat.roughness = 0.9; mat.metallic = 0;
    mat.backFaceCulling = true;
    mat.zOffset = -3; // over the face (and its Decals, at -2)
    mesh.material = mat;
    const q = { mesh, mat, tex: null, version: -1, geo: '' };
    this.quads.set(sg, q);
    return q;
  }

  shape(q, d) {
    const S = d.part.props.Size, [bx, by, bw, bh] = d.image.bounds, f = d.frame;
    const unit = p => [p[0] / S.x, p[1] / S.y, p[2] / S.z];
    const tl = unit(canvasPoint(f, d.W, d.H, bx, by)), tr = unit(canvasPoint(f, d.W, d.H, bx + bw, by));
    const bl = unit(canvasPoint(f, d.W, d.H, bx, by + bh)), br = unit(canvasPoint(f, d.W, d.H, bx + bw, by + bh));
    // The face's normal in unit space (its world normal after the mesh's scaling by Size).
    const n = [f.n[0] * S.x, f.n[1] * S.y, f.n[2] * S.z], nl = Math.hypot(...n) || 1;
    const vd = new VertexData();
    vd.positions = [...tl, ...tr, ...bl, ...br];
    vd.normals = [0, 1, 2, 3].flatMap(() => n.map(v => v / nl));
    vd.uvs = [0, 1, 1, 1, 0, 0, 1, 0]; // (the image's top row at v = 1: textures upload flipped)
    vd.indices = [0, 1, 2, 1, 3, 2];
    vd.applyToMesh(q.mesh, true);
    q.mesh.alphaIndex = 1000 + (d.props.ZOffset || 0);
  }

  paint(q, canvas) {
    if (!q.tex || q.tex.getSize().width !== canvas.width || q.tex.getSize().height !== canvas.height) {
      if (q.tex) q.tex.dispose();
      q.tex = new DynamicTexture(q.mesh.name, { width: canvas.width, height: canvas.height }, this.scene, true, Texture.TRILINEAR_SAMPLINGMODE);
      q.tex.hasAlpha = true;
      q.tex.anisotropicFilteringLevel = 8;
      q.tex.wrapU = q.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      q.mat.albedoTexture = q.tex;
      q.light = null; // (the emission reads the new texture too)
    }
    const g = q.tex.getContext();
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(canvas, 0, 0);
    q.tex.update(true);
  }

  light(q, P) {
    const li = Math.min(1, Math.max(0, P.LightInfluence)), br = Math.min(1000, Math.max(0, P.Brightness)) * UNLIT;
    const key = li + ',' + br;
    if (q.light === key) return;
    q.light = key;
    const m = q.mat;
    m.unlit = li === 0;
    if (li === 0) { m.albedoColor = new Color3(br, br, br); m.emissiveTexture = null; m.emissiveColor = Color3.Black(); }
    else { m.albedoColor = new Color3(li, li, li); m.emissiveTexture = br * (1 - li) > 0 ? q.tex : null; m.emissiveColor = new Color3(br * (1 - li), br * (1 - li), br * (1 - li)); }
    q.mesh.receiveShadows = li > 0;
  }

  drop(sg) {
    const q = this.quads.get(sg);
    this.quads.delete(sg);
    if (!q) return;
    if (q.tex) q.tex.dispose();
    q.mat.dispose();
    if (!q.mesh.isDisposed()) q.mesh.dispose();
  }
}
