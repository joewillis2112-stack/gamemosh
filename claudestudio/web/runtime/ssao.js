// Screen-space ambient occlusion, deterministic. Babylon's SSAO2 builds its
// sample kernel and noise texture from unseeded Math.random, so two renders of
// the same frame differed (goldens flaked, measurements were noisy). This
// builds it under a seeded generator.
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createSSAO(scene, cameras, settings = {}, ratio = 1) {
  const random = Math.random;
  Math.random = mulberry32(0x5eed);
  try {
    const p = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: ratio, blurRatio: ratio }, cameras);
    Object.assign(p, settings); // samples (and its kernel) are regenerated here, still seeded
    return p;
  } finally { Math.random = random; }
}
