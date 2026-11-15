// One depth renderer per camera, shared: post effects (depth of field, sun rays)
// and soft particles each ask for it, and it goes only when nobody needs it.
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Materials/standardMaterial.js'; // the depth renderer needs its side effect

const users = new WeakMap(); // camera -> Set of users

/** The camera's depth renderer (linear depth: (z + minZ) / (minZ + maxZ)), held for `who`. */
export function useDepth(scene, camera, who) {
  if (!users.has(camera)) users.set(camera, new Set());
  users.get(camera).add(who);
  return scene.enableDepthRenderer(camera, false);
}
/** `who` no longer needs it; the last one out turns it off. */
export function releaseDepth(scene, camera, who) {
  const set = users.get(camera);
  if (!set || !set.delete(who)) return;
  if (!set.size) scene.disableDepthRenderer(camera);
}
