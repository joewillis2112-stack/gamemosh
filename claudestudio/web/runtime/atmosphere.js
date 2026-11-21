// Roblox's Atmosphere on geometry: aerial perspective. With an Atmosphere in Lighting, every PBR
// surface (parts, terrain, water) fades with distance into the sky behind it: the fog colour is the
// sky's own cube map in the view direction, as Roblox's surface shaders do (mashup-research/
// ROBLOX_LIGHTING_2026-10-09.md §4b: `vis = 2^(z·d + x)`, colour = the prefiltered sky at mip
// `max(y, vis) · 5`). Its haze, glare and colours are graded into that same sky (runtime/sky.js),
// so distant things take the hazy, sun-tinted sky's colour with no extra work here.
// - Density: visibility exp(-d / L) with L = 8.3 · Density^-4.2 studs (OURS: a power-law fit to the
//   community's Studio measurements, §4d: L about 7900 at 0.2, 512 at 0.375, 77 at 0.6). Density 0
//   is clear.
// - Offset: the blur floor of the sky the fog takes. 0: distant things take exactly the sky behind
//   them and vanish into it (Roblox's "ghosting"); higher: a blurred sky, so they stand out as
//   silhouettes against the sharp one.
// Every tier renders it: one cube sample per pixel.
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { RegisterClass } from '@babylonjs/core/Misc/typeStore.js';

// Shared by every material's plugin, and read by particles (runtime/particles.js).
export const atmo = { on: false, invL: 0, offset: 0, lod: 5, cap: 1e9, tex: null, zSign: 1, horizon: null };

/** Visibility distance scale (studs) for an Atmosphere's Density (OURS, see above). */
export const densityLength = d => d > 0 ? 8.3 * Math.pow(d, -4.2) : Infinity;

class AtmospherePlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'StudioAtmosphere', 310, { STUDIO_AFOG: false });
    this._enable(true);
  }
  getClassName() { return 'StudioAtmospherePlugin'; }
  prepareDefines(defines, scene, mesh) { defines.STUDIO_AFOG = atmo.on && !!atmo.tex && (!mesh || mesh.applyFog !== false); }
  isReadyForSubMesh() { return !atmo.on || !atmo.tex || atmo.tex.isReady(); }
  getSamplers(samplers) { samplers.push('afogSky'); }
  getUniforms() {
    return {
      ubo: [{ name: 'afogParams', size: 4, type: 'vec4' }, { name: 'afogMore', size: 4, type: 'vec4' }, { name: 'afogMatrix', size: 16, type: 'mat4' }],
      fragment: '#ifdef STUDIO_AFOG\nuniform vec4 afogParams;\nuniform vec4 afogMore;\nuniform mat4 afogMatrix;\n#endif\n',
    };
  }
  bindForSubMesh(ubo, scene, engine, subMesh) {
    if (!atmo.on || !atmo.tex) return;
    ubo.updateFloat4('afogParams', atmo.invL, atmo.offset, atmo.lod, atmo.zSign);
    ubo.updateFloat4('afogMore', atmo.cap, 0, 0, 0);
    ubo.updateMatrix('afogMatrix', atmo.tex.getReflectionTextureMatrix());
    if (subMesh && subMesh.effect) subMesh.effect.setTexture('afogSky', atmo.tex);
  }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: '#ifdef STUDIO_AFOG\nuniform samplerCube afogSky;\n#endif\n',
      // After Babylon's own fog (off while an Atmosphere is on), before image processing: plugin code
      // goes in after includes are expanded, so the anchor is the first line of pbrBlockImageProcessing
      // (once in the PBR shader), put back after ours as $1.
      '!(#if defined\\(IMAGEPROCESSINGPOSTPROCESS\\) \\|\\| defined\\(SS_SCATTERING\\))': `
#ifdef STUDIO_AFOG
  {
    vec3 fv = vPositionW - vEyePosition.xyz;
    float fd = length(fv);
    float fvis = exp(-fd * afogParams.x);
    vec3 fdir = (afogMatrix * vec4(fv / max(fd, 1e-4), 0.0)).xyz;
    fdir.z *= afogParams.w;
    vec3 fc = textureCubeLodEXT(afogSky, fdir, max(afogParams.y, fvis) * afogParams.z).rgb;
    float fm = max(max(fc.r, fc.g), fc.b);
    fc *= min(1.0, afogMore.x / max(fm, 1e-4)); // the sun's disc smeared into the blur doesn't blind the fog
    finalColor.rgb = mix(fc, finalColor.rgb, fvis);
  }
#endif
$1`,
    };
  }
}

// A cloned material re-creates its plugins by class name (see runtime/styles.js).
RegisterClass('BABYLON.StudioAtmospherePlugin', AtmospherePlugin);

export class AtmosphereFog {
  constructor(scene) {
    this.scene = scene;
    const attach = m => { if (m instanceof PBRMaterial && !(m.pluginManager && m.pluginManager.getPlugin('StudioAtmosphere'))) new AtmospherePlugin(m); };
    scene.materials.forEach(attach);
    scene.onNewMaterialAddedObservable.add(attach);
  }

  /** For tests: on, and the visibility length in studs. */
  get state() { return { on: atmo.on, length: atmo.on ? 1 / atmo.invL : Infinity, offset: atmo.offset }; }

  /** props: the Atmosphere's (or null for none); tex: the sky cube; cap: the brightest the fog may be. */
  set(props, tex, cap) {
    const on = !!(props && props.Density > 0 && tex);
    atmo.tex = tex || null;
    atmo.cap = cap || 1e9; // also the skybox's below-horizon colour's (render.js)
    if (on) {
      atmo.invL = 1 / densityLength(props.Density);
      atmo.offset = Math.min(1, Math.max(0, props.Offset));
      const size = tex.getSize ? tex.getSize().width || 256 : 256;
      atmo.lod = Math.max(0, 5 + Math.log2(size / 256)); // Roblox's mip 5, as the same blur angle on every tier's sky size
      atmo.zSign = this.scene.useRightHandedSystem && !tex.invertZ ? -1 : 1;
    }
    if (on !== atmo.on) { atmo.on = on; for (const m of this.scene.materials) if (m.pluginManager && m.pluginManager.getPlugin('StudioAtmosphere')) m.markAsDirty(Material.AllDirtyFlag); }
  }
}
