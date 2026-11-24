// Rigs: a Model in the Workspace with a Humanoid and a HumanoidRootPart (an
// NPC, or the dummy Roblox's Rig Builder inserts) draws as the blocky
// character, standing on the root part as a player's character does (feet 3
// studs below its centre), in its rest pose, moved by its Animator's tracks.
// An R15 rig whose Humanoid holds a HumanoidDescription (applied, or made by
// Players:CreateHumanoidModelFromDescriptionAsync) draws as that generated body
// (runtime/bodygen.js: its BodyShape, scales and colours, at the tier's detail),
// its feet its own root height below, rebuilt when the description changes.
// The player's own character is drawn by character.js, not here.
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Animator } from './character.js';
import { describedBody, makeBody, bodyFile } from './bodygen.js';
import { r15Rig, overlayR15 } from './r15clips.js';
import { animatedJoints } from '../animation.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

export const RIG_HEIGHT = 5; // studs, as the player's character
const ROOT_ABOVE_FEET = 3;

/** The Humanoid and HumanoidRootPart that make `model` a rig, or null. */
export function rigParts(model) {
  if (!model || model.ClassName !== 'Model' || model.isCharacter) return null;
  const hum = model.children.find(c => c.ClassName === 'Humanoid'), root = model.children.find(c => c.props.Name === 'HumanoidRootPart' && c.props.CFrame);
  return hum && root ? { hum, root } : null;
}

export class Rigs {
  constructor(scene, dm, shadows, { quality = 'high', url = '../assets/characters/character-a.glb' } = {}) {
    Object.assign(this, { scene, dm, shadows, url, tier: quality });
    this.views = new Map(); // model -> view
    this.container = null;
    this.loading = null;
    this.preview = null; // (model) -> joints Map or null: the editor's pose, in place of the tracks
  }
  async load() {
    if (!this.loading) {
      const cut = this.url.lastIndexOf('/') + 1;
      this.loading = SceneLoader.LoadAssetContainerAsync(this.url.slice(0, cut), this.url.slice(cut), this.scene).then(c => { this.container = c; });
    }
    return this.loading;
  }

  /** Every rig in the Workspace, found now. */
  models() {
    const out = [];
    const walk = i => { for (const c of i.children) { if (rigParts(c)) out.push(c); else if (c.ClassName === 'Model' || c.ClassName === 'Folder') walk(c); } };
    walk(this.dm.workspace);
    return out;
  }

  /** A rig's generated body, from its Humanoid's HumanoidDescription (and that one's BodyShape), or null. */
  described(model) {
    const { hum } = rigParts(model);
    if (hum.props.RigType !== 'R15') return null;
    const d = hum.children.find(c => c.ClassName === 'HumanoidDescription');
    if (!d) return null;
    const sh = d.children.find(c => c.ClassName === 'BodyShape');
    return describedBody(d.props, sh && sh.props);
  }

  // A drawn view for the model, or null while its body loads. A generated body is (re)built when what it
  // is made from changes (the old one stays drawn until the new one is there).
  view(model) {
    const params = this.described(model), sig = params ? JSON.stringify(params) : '';
    let v = this.views.get(model);
    if (v && v.sig === sig) return v.holder ? v : null;
    if (params) {
      if (v && v.building === sig) return v.holder ? v : null;
      if (v) v.building = sig; else this.views.set(model, v = { sig: null, building: sig });
      SceneLoader.ImportMeshAsync('', '', bodyFile(params, this.tier), this.scene, null, '.glb').then(res => {
        const cur = this.views.get(model);
        if (cur !== v || v.building !== sig) { res.meshes.slice().forEach(m => m.dispose(false, true)); res.transformNodes.forEach(n => n.dispose()); return; } // gone, or a newer one coming
        const holder = new TransformNode('rig', this.scene), top = res.meshes[0];
        top.parent = holder;
        for (const m of res.meshes) if (m.getTotalVertices() > 0) { this.shadows && this.shadows.addShadowCaster(m); m.receiveShadows = true; }
        if (v.holder) v.holder.dispose(false, true);
        Object.assign(v, { holder, top, meshes: res.meshes, anim: new Animator(res), rig: r15Rig(res), scale: 1, above: makeBody(params).hrpHeight, model, sig, building: null });
      });
      return v.holder ? v : null;
    }
    if (v) { if (v.holder) v.holder.dispose(false, true); this.views.delete(model); v = null; } // (was generated)
    if (!this.container) return null;
    const inst = this.container.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    const top = inst.rootNodes[0];
    const holder = new TransformNode('rig', this.scene);
    top.parent = holder;
    const meshes = (top.getTotalVertices ? [top] : []).concat(top.getChildMeshes(false));
    const res = { meshes, transformNodes: top.getChildTransformNodes(false), animationGroups: inst.animationGroups };
    top.computeWorldMatrix(true);
    const { min, max } = top.getHierarchyBoundingVectors(true);
    const scale = RIG_HEIGHT / (max.y - min.y);
    top.scaling.scaleInPlace(scale);
    top.position.y -= min.y * scale;
    const anim = new Animator(res);
    for (const m of meshes) if (m.getTotalVertices() > 0) { this.shadows && this.shadows.addShadowCaster(m); m.receiveShadows = true; }
    v = { holder, top, meshes, anim, scale, model, sig: '', above: ROOT_ABOVE_FEET };
    this.views.set(model, v);
    return v;
  }

  /** Each frame: add and drop views, place them, pose them. */
  update(dt) {
    if (!this.container) { this.load(); return; }
    const live = new Set(this.models());
    for (const [m, v] of this.views) if (!live.has(m)) { if (v.holder) v.holder.dispose(false, true); v.building = null; this.views.delete(m); }
    for (const model of live) {
      const v = this.view(model); if (!v) continue;
      const { hum, root } = rigParts(model), cf = root.props.CFrame;
      for (const m of v.meshes) m.metadata = { ...m.metadata, instance: root };
      // The root faces -Z (Roblox); the model faces +Z: a half turn about Y.
      const [qx, qy, qz, qw] = cf.toQuat();
      const q = new Quaternion(qx, qy, qz, qw).multiply(Quaternion.RotationAxis(Vector3.Up(), Math.PI));
      const down = new Vector3(0, -v.above, 0).rotateByQuaternionToRef(q, new Vector3());
      v.holder.position.set(cf.x + down.x, cf.y + down.y, cf.z + down.z);
      v.holder.rotationQuaternion = q;
      v.anim.update(dt);
      const preview = this.preview && this.preview(model);
      const animator = hum.children.find(c => c.ClassName === 'Animator');
      const joints = preview || (animator ? animatedJoints(animator) : null);
      if (joints && joints.size) { if (v.rig) overlayR15(v.rig, joints); else v.anim.overlay(joints, v.scale); }
    }
  }

  /** A tier change: generated bodies rebuilt at its detail. */
  setTier(t) { this.tier = t; for (const v of this.views.values()) if (v.sig) v.sig = 'stale'; }

  dispose() { for (const v of this.views.values()) if (v.holder) v.holder.dispose(false, true); this.views.clear(); }
}
