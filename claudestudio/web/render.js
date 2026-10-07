// The look every Claude Studio game shares: one place to get lighting,
// shadows, materials and post-processing right, so assets are judged under
// the same conditions everywhere (turntable, editor, game).
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';

// 1 stud = 0.28 m; Babylon units are studs. A character is 5 studs tall.
export const STUD = 0.28;

/**
 * opts.quality: 'high' (desktop) or 'phone'.
 * Returns { engine, scene, sun, shadows, pipeline, ready }.
 */
export function createRenderer(canvas, { skyUrl, quality = 'high', preserveDrawingBuffer = false, post = true, skybox = true } = {}) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer, stencil: true, antialias: true, adaptToDeviceRatio: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.53, 0.71, 0.92, 1);
  scene.useRightHandedSystem = false;

  // Image-based light from the sky: soft fill and reflections that match it.
  let ready = Promise.resolve();
  if (skyUrl) {
    const env = new HDRCubeTexture(skyUrl, scene, 256, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.9;
    if (skybox) { const sky = scene.createDefaultSkybox(env, true, 4000, 0.0, false); if (sky) sky.applyFog = false; }
    ready = new Promise(res => env.onLoadObservable.addOnce(() => res()));
  } else {
    const hemi = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new Color3(0.35, 0.33, 0.3);
  }

  // Atmosphere: distant geometry fades into the horizon colour, so the edge of
  // the world meets the sky instead of cutting across it.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 120;
  scene.fogEnd = 520;
  scene.fogColor = new Color3(0.72, 0.77, 0.84);

  // The sun: warm, high in the sky, from front-left (so models read in 3D).
  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.55).normalize(), scene);
  sun.position = sun.direction.scale(-200);
  sun.intensity = 3.2;
  sun.diffuse = new Color3(1.0, 0.96, 0.9);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 600;

  const shadows = new CascadedShadowGenerator(quality === 'phone' ? 1024 : 2048, sun);
  shadows.numCascades = quality === 'phone' ? 2 : 4;
  shadows.lambda = 0.85;
  shadows.stabilizeCascades = true;
  shadows.bias = 0.004;
  shadows.normalBias = 0.02;
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = quality === 'phone' ? CascadedShadowGenerator.QUALITY_LOW : CascadedShadowGenerator.QUALITY_HIGH;
  shadows.autoCalcDepthBounds = true;
  shadows.shadowMaxZ = 400;

  if (!post) return { engine, scene, sun, shadows, pipeline: null, ready, attachCamera() {} };
  // Post: ACES tone mapping, slight contrast, gentle bloom on bright bits, FXAA.
  const pipeline = new DefaultRenderingPipeline('post', true, scene, []);
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.contrast = 1.15;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.9;
  pipeline.bloomWeight = 0.25;
  pipeline.bloomKernel = 48;
  pipeline.fxaaEnabled = true;
  pipeline.samples = quality === 'phone' ? 1 : 4;

  return { engine, scene, sun, shadows, pipeline, ready, attachCamera(cam) { pipeline.addCamera(cam); } };
}

/** A plain studio plastic: albedo colour, mid roughness, no metal. */
export function plastic(scene, name, color, roughness = 0.55) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.metallic = 0;
  m.roughness = roughness;
  return m;
}

/** A neutral ground disc for judging assets: mid grey, receives shadows. */
export function groundDisc(scene, shadows, radius = 30) {
  const g = MeshBuilder.CreateDisc('ground', { radius, tessellation: 96 }, scene);
  g.rotation.x = Math.PI / 2;
  g.material = plastic(scene, 'groundMat', new Color3(0.42, 0.42, 0.42), 0.85);
  g.receiveShadows = true;
  return g;
}
