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
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';

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
  scene.useRightHandedSystem = !s.leftHanded; // leftHanded: the Khronos harness's own setup, as a control
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1 / 0.6;
  // toneMap 'standard': no tone curve, as Blender's "Standard" view (the Cycles goldens).
  if (s.toneMap === 'standard') { ip.toneMappingEnabled = false; ip.exposure = 1; }
  scene.clearColor = new Color4(0, 0, 0, 0);

  // model-viewer's orbit puts the camera at (r sinφ sinθ, r cosφ, r sinφ cosθ)
  // in glTF's own right-handed space; in a right-handed Babylon scene that's
  // alpha = 90° − θ with the target as given (the left-handed harness flips x
  // and uses θ + 90°).
  const { orbit, target } = s;
  const cam = s.leftHanded
    ? new ArcRotateCamera('cam', deg(orbit.theta + 90), deg(orbit.phi), orbit.radius, new Vector3(-target.x, target.y, target.z), scene)
    : new ArcRotateCamera('cam', deg(90 - orbit.theta), deg(orbit.phi), orbit.radius, new Vector3(target.x, target.y, target.z), scene);
  cam.fov = deg(s.verticalFoV);
  scene.activeCamera = cam;

  const m = await importGltf(scene, s.model, s.import || {});
  const { min, max } = m.root.getHierarchyBoundingVectors();
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  cam.minZ = 2 * Math.max(size, orbit.radius) / 1000;
  scene.stopAllAnimations();

  const base = s.lighting.split('/').pop().split('.').slice(0, -1).join('');
  const realtime = base === 'spruit_sunrise_1k_HDR' || base === 'spot1Lux';
  const env = new HDRCubeTexture(s.lighting, scene, 256, false, true, false, !realtime);
  scene.environmentTexture = env;
  // envMirror: 'x' or 'z' mirrors the lookup before rotating (handedness experiments).
  const mirror = s.envMirror === 'x' ? Matrix.Scaling(-1, 1, 1) : s.envMirror === 'z' ? Matrix.Scaling(1, 1, -1) : Matrix.Identity();
  env.setReflectionTextureMatrix(mirror.multiply(Matrix.RotationY(deg(s.envRotation ?? 90))));
  if (s.renderSkybox) {
    const sky = scene.createDefaultSkybox(env);
    sky.rotation.y = deg(s.skyRotation ?? 270); sky.infiniteDistance = true;
  }
  if (s.matProps) for (const mat of scene.materials) if (mat.getClassName() === 'PBRMaterial') Object.assign(mat, s.matProps);
  if (s.samplingMode) for (const t of scene.textures) if (!t.isCube && t.name && !t.name.startsWith('data:')) t.updateSamplingMode(s.samplingMode);
  if (s.forceLinearAlbedo) for (const mat of scene.materials) if (mat.albedoTexture) mat.albedoTexture.gammaSpace = false;
  // Experiment hook (tools/fidelity.mjs --brdf k=v,...): BRDF settings on every material.
  if (s.brdf) for (const mat of scene.materials) if (mat.brdf) Object.assign(mat.brdf, s.brdf);
  if (realtime) for (const mat of scene.materials) { mat.realTimeFiltering = true; mat.realTimeFilteringQuality = Constants.TEXTURE_FILTERING_QUALITY_HIGH; }
  // Screen-space ambient occlusion (measuring whether it brings real-time renders closer to path tracing).
  if (s.ssao) { const p = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 1, blurRatio: 1 }, [cam]); Object.assign(p, s.ssao); }
  await new Promise(r => scene.executeWhenReady(r));
  for (let i = 0; i < 3; i++) scene.render();
  const tex = scene.textures.filter(t => t.name && !t.isCube).map(t => ({ name: t.name.slice(-40), gamma: t.gammaSpace, srgbBuf: t._texture && t._texture._useSRGBBuffer, fmt: t._texture && t._texture.format, type: t._texture && t._texture.type }));
  if (s.probeTexture) {
    const t = scene.textures.find(t => t.name && t.name.includes('Base Color'));
    const px = await t.readPixels(0, s.probeLevel || 0); const counts = {};
    for (let i = 0; i < px.length; i += 4) { const k = px[i] + ',' + px[i + 1] + ',' + px[i + 2]; counts[k] = (counts[k] || 0) + 1; }
    window.probe = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }
  const mats = scene.materials.filter(x => x.getClassName() !== 'StandardMaterial').map(x => ({ cls: x.getClassName(), name: x.name, metallic: x.metallic, roughness: x.roughness, alpha: x.alpha, transparencyMode: x.transparencyMode, unlit: x.unlit, twoSided: x.backFaceCulling === false, f0: x.metallicF0Factor, specIntensity: x.specularIntensity, envInt: x.environmentIntensity, albedo: x.albedoColor && x.albedoColor.asArray(), reflectivity: x.reflectivityColor && x.reflectivityColor.asArray(), useRough: x.useRoughnessFromMetallicTextureGreen }));
  return { mats, probe: window.probe, meshes: m.meshes.length, materials: scene.materials.length, animations: m.animations.length, tex };
};
window.fidelityReady = true;
