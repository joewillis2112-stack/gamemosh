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
import { RegisterClass } from '@babylonjs/core/Misc/typeStore.js';
import { atmo } from './runtime/atmosphere.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';
import { tier } from './runtime/quality.js';

// 1 stud = 0.28 m; Babylon units are studs. A character is 5 studs tall.
export const STUD = 0.28;

/**
 * opts.quality: a fidelity tier from runtime/quality.js ('low', 'phone', 'high', 'ultra').
 * Returns { engine, scene, sun, shadows, pipeline, ready }.
 */
// dynamicSky: the caller draws the sky and environment (runtime/sky.js, which
// follows the time of day); otherwise the static HDR sky is both.
export function createRenderer(canvas, { skyUrl, quality = 'high', preserveDrawingBuffer = false, post = true, skybox = true, dynamicSky = false } = {}) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer, stencil: true, antialias: true, adaptToDeviceRatio: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.53, 0.71, 0.92, 1);
  // Right-handed, like Roblox: place coordinates mean the same thing here
  // (looking down -Z, +X is to the right). Left-handed would mirror every place.
  scene.useRightHandedSystem = true;

  // Image-based light from the sky: soft fill and reflections that match it.
  let ready = Promise.resolve();
  if (skyUrl && !dynamicSky) {
    const env = new HDRCubeTexture(skyUrl, scene, 256, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.9;
    if (skybox) {
      const sky = scene.createDefaultSkybox(env, true, 4000, 0.0, false);
      if (sky) { sky.applyFog = false; new BelowHorizon(sky.material, scene, env); }
    }
    ready = new Promise(res => env.onLoadObservable.addOnce(() => res()));
  } else if (!dynamicSky) {
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

  const Q = tier(quality);
  const shadows = new CascadedShadowGenerator(Q.sunShadowSize, sun);
  shadows.numCascades = Q.sunCascades;
  shadows.lambda = 0.85;
  shadows.stabilizeCascades = true;
  [shadows.bias, shadows.normalBias] = Q.sunShadowBias;
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = Q.sunShadowFilter === 'low' ? CascadedShadowGenerator.QUALITY_LOW : CascadedShadowGenerator.QUALITY_HIGH;
  shadows.autoCalcDepthBounds = true;
  shadows.shadowMaxZ = Q.sunShadowDistance; // studs from the camera that get sun shadows

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
  pipeline.samples = Q.msaa;

  return { engine, scene, sun, shadows, pipeline, ready, attachCamera(cam) { pipeline.addCamera(cam); } };
}

// A skybox showing `env` (fog off, haze below the horizon). The time-of-day sky
// (runtime/sky.js) uses it for the same cube that lights the scene.
export function createSkybox(scene, env) {
  const sky = scene.createDefaultSkybox(env, true, 4000, 0.0, false);
  if (sky) { sky.applyFog = false; new BelowHorizon(sky.material, scene, env); }
  return sky;
}

// The HDR's lower half is mirrored, streaky cloud. Below the horizon the sky fades into its own
// colour at the horizon in the same direction (a little blurred), which is also what an Atmosphere
// fogs distant ground to (runtime/atmosphere.js), so the ground's far edge, or a place with no
// ground, meets it seamlessly at every heading, hazy or not; further down it deepens, so a void
// still has depth. Linear, as the sky itself (the image processing comes after, in the pipeline).
class BelowHorizon extends MaterialPluginBase {
  constructor(material, scene, env) {
    super(material, 'BelowHorizon', 200, { BELOW_HORIZON: false });
    Object.assign(this, { scene, env });
    this._enable(true);
  }
  prepareDefines(defines) { defines.BELOW_HORIZON = !!this.env; }
  isReadyForSubMesh() { return !this.env || this.env.isReady(); }
  getClassName() { return 'BelowHorizon'; }
  getSamplers(samplers) { samplers.push('horizonSky'); }
  getUniforms() {
    return {
      ubo: [{ name: 'horizonMatrix', size: 16, type: 'mat4' }, { name: 'horizonInfo', size: 4, type: 'vec4' }],
      fragment: '#ifdef BELOW_HORIZON\nuniform mat4 horizonMatrix;\nuniform vec4 horizonInfo;\n#endif\n',
    };
  }
  bindForSubMesh(ubo, scene, engine, subMesh) {
    if (!this.env) return;
    ubo.updateMatrix('horizonMatrix', this.env.getReflectionTextureMatrix());
    // The blur as an angle on every tier: mip 2 of the default 256-texel sky, the same angle on smaller or larger ones.
    const size = this.env.getSize ? this.env.getSize().width || 256 : 256;
    ubo.updateFloat4('horizonInfo', this.scene.useRightHandedSystem && !this.env.invertZ ? -1 : 1, Math.min(atmo.cap, 1e9), Math.max(0, 2 + Math.log2(size / 256)), 0);
    if (subMesh && subMesh.effect) subMesh.effect.setTexture('horizonSky', this.env);
  }
  getCustomCode(shaderType) {
    // The sky at the far plane (just inside it): the box is 4000 studs across, so without this
    // anything past its faces (about 2000 studs) would be hidden behind the sky.
    if (shaderType === 'vertex') return { CUSTOM_VERTEX_MAIN_END: 'gl_Position.z = gl_Position.w * 0.9999995;' };
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: '#ifdef BELOW_HORIZON\nuniform samplerCube horizonSky;\n#endif\n',
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        #ifdef BELOW_HORIZON
          vec3 skyDir = normalize(vPositionW - vEyePosition.xyz);
          float below = smoothstep(0.0, -0.05, skyDir.y);
          if (below > 0.0) {
            vec3 hd = (horizonMatrix * vec4(normalize(vec3(skyDir.x, -0.01, skyDir.z)), 0.0)).xyz;
            hd.z *= horizonInfo.x;
            vec3 hc = textureCubeLodEXT(horizonSky, hd, horizonInfo.z).rgb;
            hc *= min(1.0, horizonInfo.y / max(max(hc.r, hc.g), max(hc.b, 1e-4)));
            vec3 deep = hc * vec3(0.55, 0.62, 0.74);
            vec3 haze = mix(hc, deep, smoothstep(-0.02, -0.6, skyDir.y));
            finalColor.rgb = mix(finalColor.rgb, haze, below);
          }
        #endif`,
    };
  }
}
// A cloned material re-creates its plugins by class name (see runtime/styles.js).
RegisterClass('BABYLON.BelowHorizon', BelowHorizon);

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
