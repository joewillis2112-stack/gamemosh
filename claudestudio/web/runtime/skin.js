// Swap a loaded character's skin texture (the character maker's output) for
// another, keeping the original's sampling, orientation and mipmap settings,
// so only the colours change.
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

export function applySkin(scene, meshes, url) {
  const done = new Map(), loads = [];
  for (const m of meshes) {
    const mat = m.material;
    if (!mat || done.has(mat)) continue;
    const key = mat.albedoTexture ? 'albedoTexture' : mat.diffuseTexture ? 'diffuseTexture' : null;
    if (!key) continue;
    const old = mat[key];
    const t = new Texture(url, scene, old.noMipmap, old.invertY, old.samplingMode);
    t.wrapU = old.wrapU; t.wrapV = old.wrapV; t.coordinatesIndex = old.coordinatesIndex;
    t.uScale = old.uScale; t.vScale = old.vScale; t.uOffset = old.uOffset; t.vOffset = old.vOffset;
    mat[key] = t; done.set(mat, t);
    loads.push(new Promise(res => t.isReady() ? res() : t.onLoadObservable.addOnce(() => res())));
  }
  return Promise.all(loads);
}
