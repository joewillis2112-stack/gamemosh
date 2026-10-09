// Draws the Lighting service: sun and moon from the time of day, ambient,
// environment light, exposure, fog/atmosphere, post effects, and the lighting
// style. Semantics from mashup-research/ROBLOX_LIGHTING_2026-10-09.md; where
// Roblox's mapping from a property to its shader is unknown, the constants here
// are ours, calibrated so a new Baseplate's values give the studio's judged look.
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { createSSAO } from './ssao.js';
import { sunDirection } from '../datamodel.js';

// Ours (calibrated to the look judged on 2026-10-08 at a Baseplate's Brightness 3):
const SUN_PER_BRIGHTNESS = 3.2 / 3;   // directional light intensity per unit of Brightness
const MOON_PER_BRIGHTNESS = 0.06;     // the moon, much dimmer, bluish
const SUN_COLOR = new Color3(1.0, 0.96, 0.9), LOW_SUN_COLOR = new Color3(1.0, 0.58, 0.32), MOON_COLOR = new Color3(0.62, 0.7, 0.9);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const BASE_CONTRAST = 1.15;           // the studio's look before ColorCorrection
const FOG_PER_DENSITY = 156;          // Atmosphere.Density 0.3 -> fog fully opaque at 520 studs
const HORIZON = new Color3(0.72, 0.77, 0.84); // the sky's horizon colour (fog takes distant things to it)
// Bloom: Roblox's threshold is in its HDR range (0..4 in a gamma-2 buffer); these
// map a Baseplate's Bloom (Intensity 1, Size 24, Threshold 2) to the judged look.
const BLOOM_THRESHOLD = 0.45, BLOOM_WEIGHT = 0.25, BLOOM_KERNEL = 2;
// SSAO for LightingStyle Realistic: tuned against Blender Cycles (path-traced)
// fidelity goldens; radius given in metres there, so converted to studs here.
// Deterministic sweeps (2026-10-09), mean distance to Cycles, tuning scenes
// (FlightHelmet, AntiqueCamera, Lantern) / held-out (DamagedHelmet, ABeautifulGame):
// none 20.57 / 15.85; strength 2 radius 1 m 18.79 / 15.28; radius 0.5 m 19.58 / 15.27;
// 0.3 m 19.83 / 15.25. Radius 1 m left halos in a world scene (a smear beside the
// character, ghost outlines over blocks: places/lighting-lab.luau), so 0.5 m.
const SSAO = { totalStrength: 2, radiusMetres: 0.5, base: 0 };

const lin = c => new Color3(c.r, c.g, c.b).toLinearSpace(); // Roblox colours are sRGB-ish (gamma 2 in its shaders)

export class LightingController {
  constructor(R, scene, dm, camera, sky, quality = 'high') {
    Object.assign(this, { R, scene, dm, camera, sky, quality });
    this.L = dm.service('Lighting');
    this.ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    this.ambient.specular = Color3.Black();
    // The environment is the sky rendered into a cubemap (runtime/sky.js); its
    // own irradiance (spherical harmonics) is kept so the diffuse part can be
    // scaled apart from the specular part, and recaptured whenever the sky changes.
    this.env = sky ? sky.env : scene.environmentTexture;
    if (sky) { scene.environmentTexture = sky.env; sky.onEnvironment = () => { this.baseSH = null; this.dirty = true; this.update(); }; }
    this.pending = Promise.resolve();
    this.dirty = true;
    dm.watch(inst => { if (inst === this.L || (inst && inst.parent === this.L)) this.dirty = true; });
  }

  // Resolves once the sky for the current time is in the environment.
  settled() { return this.pending; }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const P = this.L.props, { scene, R } = this;
    const kids = this.L.children, find = cls => kids.find(c => c.ClassName === cls && (c.props.Enabled !== false));

    // Sun by day, moon by night (the moon mirrors the sun in X and Y).
    const [sx, sy, sz] = sunDirection(P.ClockTime, P.GeographicLatitude);
    const day = sy > -0.05;
    const to = day ? [sx, sy, sz] : [-sx, -sy, sz];
    const fade = day ? Math.min(1, Math.max(0, (sy + 0.05) / 0.15)) : Math.min(1, Math.max(0, (-sy - 0.05) / 0.15));
    R.sun.direction.set(-to[0], -to[1], -to[2]);
    R.sun.position = R.sun.direction.scale(-200);
    R.sun.intensity = P.Brightness * (day ? SUN_PER_BRIGHTNESS : MOON_PER_BRIGHTNESS) * fade;
    // A low sun is reddened by the long path through the air (ours: a blend by elevation).
    R.sun.diffuse = day ? Color3.Lerp(LOW_SUN_COLOR, SUN_COLOR, smooth(0.0, 0.35, sy)) : MOON_COLOR;
    R.sun.shadowEnabled = P.GlobalShadows;
    // The sky follows the same sun and moon (re-rendered only when they move).
    const key = sx + ',' + sy + ',' + sz;
    if (this.sky && key !== this.skyKey) { this.skyKey = key; this.pending = this.sky.set([sx, sy, sz], [-sx, -sy, sz]); }

    // Ambient: outdoors gets OutdoorAmbient (never less than Ambient); with
    // GlobalShadows off there's no indoors/outdoors and Ambient applies (docs).
    // We have no sky-visibility term yet, so everything counts as outdoors.
    const a = P.Ambient, o = P.OutdoorAmbient;
    const amb = P.GlobalShadows ? { r: Math.max(a.r, o.r), g: Math.max(a.g, o.g), b: Math.max(a.b, o.b) } : a;
    this.ambient.diffuse = this.ambient.groundColor = lin(amb);
    this.ambient.intensity = 1;

    // Environment light: specular through environmentIntensity, diffuse through
    // the irradiance harmonics scaled by diffuse/specular.
    if (this.env) {
      const D = Math.max(0, P.EnvironmentDiffuseScale), S = Math.max(0, P.EnvironmentSpecularScale), Se = Math.max(S, 1e-4);
      scene.environmentIntensity = Se;
      // The visible sky doesn't dim with the specular scale (materials multiply theirs by the scene's).
      if (this.sky && this.sky.mesh && this.sky.mesh.material) this.sky.mesh.material.environmentIntensity = 1 / Se;
      const sp = this.env.sphericalPolynomial;
      if (sp && sp.x) {
        // Restore the file's own coefficients, scale, and drop the cached
        // pre-scaled harmonics the shader reads, so they're rebuilt.
        const keys = ['x', 'y', 'z', 'xx', 'yy', 'zz', 'xy', 'yz', 'zx'];
        if (!this.baseSH) this.baseSH = keys.map(k => sp[k].clone());
        keys.forEach((k, i) => sp[k].copyFrom(this.baseSH[i]));
        sp.scaleInPlace(D / Se);
        sp._harmonics = null;
      }
    }

    // Exposure (stops) before the tonemap.
    const pipe = R.pipeline;
    if (pipe) {
      pipe.imageProcessing.exposure = Math.pow(2, P.ExposureCompensation);
      const bloom = find('BloomEffect');
      pipe.bloomEnabled = !!bloom;
      if (bloom) { pipe.bloomThreshold = bloom.props.Threshold * BLOOM_THRESHOLD; pipe.bloomWeight = bloom.props.Intensity * BLOOM_WEIGHT; pipe.bloomKernel = Math.max(1, bloom.props.Size * BLOOM_KERNEL); }
      // ColorCorrection: Contrast and Saturation so far (Brightness and TintColor: not yet).
      const cc = kids.filter(c => c.ClassName === 'ColorCorrectionEffect' && c.props.Enabled);
      const contrast = cc.reduce((k, c) => k * (1 + c.props.Contrast), 1), sat = cc.reduce((k, c) => k + c.props.Saturation, 0);
      pipe.imageProcessing.contrast = BASE_CONTRAST * contrast;
      if (sat !== 0) {
        pipe.imageProcessing.colorCurvesEnabled = true;
        const curves = pipe.imageProcessing.colorCurves || (pipe.imageProcessing.colorCurves = new ColorCurves());
        curves.globalSaturation = Math.max(-100, Math.min(100, sat * 100));
      } else pipe.imageProcessing.colorCurvesEnabled = false;
    }

    // Fog: an Atmosphere replaces FogStart/FogEnd (Roblox hides them); its
    // colour is the sky's horizon (Roblox fogs to the blurred sky).
    const atmo = kids.find(c => c.ClassName === 'Atmosphere');
    if (atmo && atmo.props.Density > 0) {
      scene.fogMode = 3; // linear
      scene.fogEnd = FOG_PER_DENSITY / atmo.props.Density;
      scene.fogStart = 0.23 * scene.fogEnd;
      scene.fogColor = this.sky ? this.sky.horizon.clone() : HORIZON.clone();
    } else if (!atmo && P.FogEnd < 1e5) {
      scene.fogMode = 3;
      scene.fogStart = P.FogStart; scene.fogEnd = Math.max(P.FogEnd, P.FogStart + 0.01);
      scene.fogColor = lin(P.FogColor);
    } else scene.fogMode = 0;

    // LightingStyle: Realistic adds ambient occlusion; Soft doesn't.
    const realistic = P.LightingStyle === 'Realistic';
    if (realistic && !this.ssao && this.camera) {
      this.ssao = createSSAO(scene, [this.camera], { totalStrength: SSAO.totalStrength, radius: SSAO.radiusMetres / 0.28, base: SSAO.base }, this.quality === 'phone' ? 0.5 : 1);
    } else if (!realistic && this.ssao) {
      scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', this.camera);
      this.ssao.dispose(); this.ssao = null;
    }
  }
}
