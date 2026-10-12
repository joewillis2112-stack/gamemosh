// Rigs: a Model in the Workspace with a Humanoid and a HumanoidRootPart (an
// NPC, or the dummy Roblox's Rig Builder inserts) draws as the blocky
// character, standing on the root part as a player's character does (feet 3
// studs below its centre), in its rest pose, moved by its Animator's tracks.
// The player's own character is drawn by character.js, not here.
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Animator } from './character.js';
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
  constructor(scene, dm, shadows, url = '../assets/characters/character-a.glb') {
    Object.assign(this, { scene, dm, shadows, url });
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

  view(model) {
    let v = this.views.get(model);
    if (v || !this.container) return v;
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
    v = { holder, top, meshes, anim, scale, model };
    this.views.set(model, v);
    return v;
  }

  /** Each frame: add and drop views, place them, pose them. */
  update(dt) {
    if (!this.container) { this.load(); return; }
    const live = new Set(this.models());
    for (const [m, v] of this.views) if (!live.has(m)) { v.holder.dispose(false, true); this.views.delete(m); }
    for (const model of live) {
      const v = this.view(model), { hum, root } = rigParts(model), cf = root.props.CFrame;
      for (const m of v.meshes) m.metadata = { instance: root };
      // The root faces -Z (Roblox); the model faces +Z: a half turn about Y.
      const [qx, qy, qz, qw] = cf.toQuat();
      const q = new Quaternion(qx, qy, qz, qw).multiply(Quaternion.RotationAxis(Vector3.Up(), Math.PI));
      const down = new Vector3(0, -ROOT_ABOVE_FEET, 0).rotateByQuaternionToRef(q, new Vector3());
      v.holder.position.set(cf.x + down.x, cf.y + down.y, cf.z + down.z);
      v.holder.rotationQuaternion = q;
      v.anim.update(dt);
      const preview = this.preview && this.preview(model);
      const animator = hum.children.find(c => c.ClassName === 'Animator');
      const joints = preview || (animator ? animatedJoints(animator) : null);
      if (joints && joints.size) v.anim.overlay(joints, v.scale);
    }
  }

  dispose() { for (const v of this.views.values()) v.holder.dispose(false, true); this.views.clear(); }
}
