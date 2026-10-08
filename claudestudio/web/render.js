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
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
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
  // Right-handed, like Roblox: place coordinates mean the same thing here
  // (looking down -Z, +X is to the right). Left-handed would mirror every place.
  scene.useRightHandedSystem = true;

  // Image-based light from the sky: soft fill and reflections that match it.
  let ready = Promise.resolve();
  if (skyUrl) {
    const env = new HDRCubeTexture(skyUrl, scene, 256, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.9;
    if (skybox) {
      const sky = scene.createDefaultSkybox(env, true, 4000, 0.0, false);
      if (sky) { sky.applyFog = false; new BelowHorizon(sky.material, scene); }
    }
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

// The HDR's lower half is mirrored, streaky cloud. Below the horizon the sky
// fades into the haze colour, the same colour fog takes distant geometry to,
// so a place with no ground (or the ground's far edge) meets it seamlessly;
// further down it deepens, so a void still has depth.
class BelowHorizon extends MaterialPluginBase {
  constructor(material, scene) {
    super(material, 'BelowHorizon', 200, { BELOW_HORIZON: false });
    this.scene = scene;
    this._enable(true);
  }
  prepareDefines(defines) { defines.BELOW_HORIZON = true; }
  getClassName() { return 'BelowHorizon'; }
  getUniforms() {
    return { ubo: [{ name: 'horizonColor', size: 3, type: 'vec3' }], fragment: 'uniform vec3 horizonColor;' };
  }
  bindForSubMesh(ubo) { ubo.updateColor3('horizonColor', this.scene.fogColor); }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        #ifdef BELOW_HORIZON
          vec3 skyDir = normalize(vPositionW - vEyePosition.xyz);
          float below = smoothstep(0.0, -0.05, skyDir.y);
          // Deeper below, a darker, bluer haze, as an atmosphere looks looking down.
          vec3 deep = horizonColor * vec3(0.55, 0.62, 0.74);
          vec3 haze = mix(horizonColor, deep, smoothstep(-0.02, -0.6, skyDir.y));
          finalColor.rgb = mix(finalColor.rgb, haze, below);
        #endif`,
    };
  }
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
