// The glTF fidelity harness: one Khronos Render Fidelity scenario, imported
// through the studio's own path (runtime/gltf.js) into a right-handed scene
// like the studio's, viewed exactly as Khronos's Babylon harness views it
// (babylon-viewer.ts in glTF-Render-Fidelity-Generator). Driven by
// tools/fidelity.mjs, which diffs the canvas against the goldens.
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3, Matrix, Color4 } from '@babylonjs/core/Maths/math.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';
import { importGltf } from './runtime/gltf.js';

const deg = d => d * Math.PI / 180;

// s: a resolved scenario ({ model, lighting, dimensions, target, orbit, verticalFoV, renderSkybox }),
// with model/lighting as URLs.
window.renderScenario = async function (s) {
  const canvas = document.getElementById('c');
  const dpr = s.dpr || 1; // the goldens are 768 css px at device pixel ratio 2
  canvas.width = s.dimensions.width * dpr; canvas.height = s.dimensions.height * dpr;
  canvas.style.width = s.dimensions.width + 'px'; canvas.style.height = s.dimensions.height + 'px';
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, premultipliedAlpha: false });
  engine.setHardwareScalingLevel(1 / dpr); engine.resize();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1 / 0.6;
  scene.clearColor = new Color4(0, 0, 0, 0);

  // model-viewer's orbit puts the camera at (r sinφ sinθ, r cosφ, r sinφ cosθ)
  // in glTF's own right-handed space; in a right-handed Babylon scene that's
  // alpha = 90° − θ with the target as given (the left-handed harness flips x
  // and uses θ + 90°).
  const { orbit, target } = s;
  const cam = new ArcRotateCamera('cam', deg(90 - orbit.theta), deg(orbit.phi), orbit.radius, new Vector3(target.x, target.y, target.z), scene);
  cam.fov = deg(s.verticalFoV);
  scene.activeCamera = cam;

  const m = await importGltf(scene, s.model);
  const { min, max } = m.root.getHierarchyBoundingVectors();
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  cam.minZ = 2 * Math.max(size, orbit.radius) / 1000;
  scene.stopAllAnimations();

  const base = s.lighting.split('/').pop().split('.').slice(0, -1).join('');
  const realtime = base === 'spruit_sunrise_1k_HDR' || base === 'spot1Lux';
  const env = new HDRCubeTexture(s.lighting, scene, 256, false, true, false, !realtime);
  scene.environmentTexture = env;
  env.setReflectionTextureMatrix(Matrix.RotationY(deg(s.envRotation ?? 90)));
  if (s.renderSkybox) {
    const sky = scene.createDefaultSkybox(env);
    sky.rotation.y = deg(s.skyRotation ?? 270); sky.infiniteDistance = true;
  }
  if (realtime) for (const mat of scene.materials) { mat.realTimeFiltering = true; mat.realTimeFilteringQuality = Constants.TEXTURE_FILTERING_QUALITY_HIGH; }
  await new Promise(r => scene.executeWhenReady(r));
  for (let i = 0; i < 3; i++) scene.render();
  return { meshes: m.meshes.length, materials: scene.materials.length, animations: m.animations.length };
};
window.fidelityReady = true;
