// glTF 2.0 import: one path for everything that brings a model in (MeshParts in
// a place, the fidelity harness). Babylon's loader implements the spec and the
// KHR material extensions; this sets it up the way Khronos's Render Fidelity
// harness does (mashup-research/GLTF_FIDELITY_2026-10-09.md) so what we import
// can be checked against their goldens.
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

// One import in flight per loader plugin activation, so the option applies to
// exactly the load it was set for.
export async function importGltf(scene, url) {
  SceneLoader.OnPluginActivatedObservable.addOnce(plugin => {
    // Spec conformance: an alpha-blended surface's alpha is coverage (it scales
    // the specular too), as glTF defines it. Babylon's default treats it as glass.
    if (plugin.name === 'gltf') plugin.transparencyAsCoverage = true;
  });
  const cut = url.lastIndexOf('/') + 1;
  const res = await SceneLoader.ImportMeshAsync('', url.slice(0, cut), url.slice(cut), scene);
  return {
    root: res.meshes[0],                 // __root__: converts glTF's right-handed Y-up into the scene
    meshes: res.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0),
    nodes: res.transformNodes,
    skeletons: res.skeletons,
    animations: res.animationGroups,
    lights: res.lights,
  };
}
