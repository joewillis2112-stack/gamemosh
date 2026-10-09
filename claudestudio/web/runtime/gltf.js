// glTF 2.0 import: one path for everything that brings a model in (MeshParts in
// a place, the fidelity harness). Babylon's loader implements the spec and the
// KHR material extensions; this sets it up the way Khronos's Render Fidelity
// harness does (mashup-research/GLTF_FIDELITY_2026-10-09.md) so what we import
// can be checked against their goldens.
import { ImportMeshAsync, LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

// Loader options travel with each load (concurrent loads can't mix them up).
// transparencyAsCoverage: an alpha-blended surface's alpha is coverage (it
// scales the specular too), as glTF defines it; Babylon's default treats it as glass.
const loaderOptions = opts => ({ pluginOptions: { gltf: { transparencyAsCoverage: true, ...('useSRGBBuffers' in opts ? { useSRGBBuffers: opts.useSRGBBuffers } : {}) } } });

// Babylon 9 mixes environment radiance into the diffuse irradiance of rough
// surfaces by default. Measured against Khronos's ground truth (the glTF
// Sample Viewer) over 13 fidelity scenarios, turning it off is closer
// (mean error 7.07 vs 9.20 /255) and matches Babylon's own fidelity goldens
// to 1.1 /255. Hardware sRGB textures (the default) measured best too.
export function fixMaterials(mats, opts = {}) {
  for (const m of mats) if (m.brdf && !('mixIblRadianceWithIrradiance' in (opts.brdf || {}))) m.brdf.mixIblRadianceWithIrradiance = false;
}

// For instancing (MeshParts): the file loads once into a container that each
// part instantiates from.
export async function loadGltfContainer(scene, url, opts = {}) {
  const c = await LoadAssetContainerAsync(url, scene, loaderOptions(opts));
  fixMaterials(c.materials, opts);
  return c;
}

export async function importGltf(scene, url, opts = {}) {
  const res = await ImportMeshAsync(url, scene, loaderOptions(opts));
  const mats = new Set();
  for (const m of res.meshes) if (m.material) (m.material.subMaterials || [m.material]).forEach(x => x && mats.add(x));
  fixMaterials(mats, opts);
  return {
    root: res.meshes[0],                 // __root__: converts glTF's right-handed Y-up into the scene
    meshes: res.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0),
    nodes: res.transformNodes,
    skeletons: res.skeletons,
    animations: res.animationGroups,
    lights: res.lights,
  };
}
