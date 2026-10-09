// The sky, following the time of day, and the environment light taken from it.
// Like Roblox's sky (one skybox mixed with scattered light by sun elevation:
// mashup-research/ROBLOX_LIGHTING_2026-10-09.md), one photo of a cloudy sky
// (its baked sun removed: tools/make-sky.py) is graded by where the sun is:
// full daylight, warm scattering around a low sun, twilight, night with stars;
// the sun and moon discs are drawn at their computed positions.
//
// One cube texture is both what you see and what lights the scene, built the
// way Babylon builds a loaded HDR (envCubeTexture): the photo's cube faces
// from Babylon's own panorama conversion, graded per texel on the CPU, then
// uploaded, GGX-prefiltered and given harmonics from the same data. So the
// sky and the light can't disagree, and with no grading it is exactly the
// static HDR environment (checked by tools/fidelity.mjs). The grading
// constants are ours.
import { GetCubeMapTextureData } from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import { PanoramaToCubeMapTools } from '@babylonjs/core/Misc/HighDynamicRange/panoramaToCubemap.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { HDRFiltering } from '@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { Color3, Matrix, Vector3 } from '@babylonjs/core/Maths/math.js';

const FACES = ['right', 'left', 'up', 'down', 'front', 'back']; // Babylon's order (envCubeTexture._FacesMapping)
const FACE_CORNERS = [PanoramaToCubeMapTools.FACE_RIGHT, PanoramaToCubeMapTools.FACE_LEFT, PanoramaToCubeMapTools.FACE_UP, PanoramaToCubeMapTools.FACE_DOWN, PanoramaToCubeMapTools.FACE_FRONT, PanoramaToCubeMapTools.FACE_BACK];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The day sky photo's horizon haze colour (the fog colour at noon); at night, a dark blue.
const DAY_HORIZON = new Color3(0.72, 0.77, 0.84), NIGHT_HORIZON = new Color3(0.035, 0.05, 0.09), SUNSET_HORIZON = new Color3(0.85, 0.6, 0.45);
// Where the removed sun sat in the photo, as atan2(z, x) in the cube's own space
// (tools/make-sky.py: u = 0.5952 -> (u - 0.5) * 2 pi): the photo is turned so the
// clouds' lit side faces the real sun.
const PHOTO_SUN_THETA = (0.5952 - 0.5) * 2 * Math.PI;
const SUN_COS = Math.cos(1.1 * Math.PI / 180), MOON_COS = Math.cos(1.6 * Math.PI / 180);
// A world direction w, as this scene samples the cube: the shader turns it by the
// reflection matrix, then flips Z (REFLECTIONMAP_OPPOSITEZ: right-handed scene)
// to get the GPU cube direction g. Babylon's panorama conversion fills each face
// from its own directions p (FACE_UP has y = -1, FACE_RIGHT z = +1, FACE_FRONT
// x = +1), so g = (p.z, -p.y, p.x). Grading works in p, the space of this.dirs.
// Checked by test/scenarios/lighting.mjs, which looks for the sun disc where the sun is.
export function texFromWorld(w, R) {
  const v = Vector3.TransformNormal(new Vector3(w[0], w[1], w[2]), R); // g = (v.x, v.y, -v.z)
  return new Vector3(-v.z, -v.y, v.x).normalize();
}
// The turn about Y that brings the sun's azimuth in p to the photo's sun.
function photoTurn(sun) {
  const az = r => { const p = texFromWorld(sun, Matrix.RotationY(r)); return Math.atan2(p.z, p.x); };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const a0 = az(0), s = Math.sign(wrap(az(Math.PI / 2) - a0)) || 1;
  return wrap(PHOTO_SUN_THETA - a0) * s;
}

// Texel directions for each face, exactly as Babylon's panorama conversion samples them.
function faceDirections(n) {
  return FACE_CORNERS.map(F => {
    const d = new Float32Array(n * n * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / n, fy = y / n, i = (y * n + x) * 3;
      for (let k = 0; k < 3; k++) {
        const c = ['x', 'y', 'z'][k];
        const a = F[0][c] + (F[1][c] - F[0][c]) * fx, b = F[2][c] + (F[3][c] - F[2][c]) * fx;
        d[i + k] = a + (b - a) * fy;
      }
      const l = Math.hypot(d[i], d[i + 1], d[i + 2]); d[i] /= l; d[i + 1] /= l; d[i + 2] /= l;
    }
    return d;
  });
}
function hash3(x, y, z) { // a fixed pseudo-random value per star cell
  let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Sky {
  constructor(scene, url, { quality = 'high', size } = {}) {
    this.scene = scene;
    this.n = size || (quality === 'phone' ? 128 : 256);
    this.filtering = new HDRFiltering(scene.getEngine());
    this.horizon = DAY_HORIZON.clone();
    this.version = 0;
    const n = this.n, zero = () => new Float32Array(n * n * 3);
    this.env = new RawCubeTexture(scene, [zero(), zero(), zero(), zero(), zero(), zero()], n, 4 /* RGB */, 1 /* FLOAT */, true, false, 3);
    this.env.gammaSpace = false;
    this.ready = (async () => {
      const buf = await (await fetch(url)).arrayBuffer();
      const cube = GetCubeMapTextureData(buf, n);
      this.base = FACES.map(f => cube[f]);
      this.dirs = faceDirections(n);
    })();
  }

  // The visible sky: Babylon's default skybox shows a clone of its texture, and a
  // RawCubeTexture's clone copies the data at clone time (here: empty), so the
  // skybox would stay black. Point the clone at our texture's GPU texture instead
  // (prefiltering swaps new contents into that same object, so it stays current).
  attach(mesh) {
    this.mesh = mesh;
    const t = mesh && mesh.material && mesh.material.reflectionTexture;
    if (!t || t === this.env) return;
    if (t._texture) t._texture.dispose();
    t._texture = this.env._texture; this.env._texture.incrementReferences();
    this.view = t;
  }

  // sun / moon: unit directions towards them (world). opts.plain: the photo as it
  // is (no grading, no discs), turned by opts.rot (radians), for checking against
  // the static path. Returns a promise that settles when the environment is updated.
  set(sun, moon, opts = {}) {
    this.request = { sun, moon, opts };
    const sy = sun[1];
    const dayK = smooth(-0.12, 0.1, sy), sunsetK = smooth(-0.16, 0.0, sy) * (1 - smooth(0.04, 0.4, sy));
    this.horizon = opts.plain ? DAY_HORIZON.clone() : Color3.Lerp(Color3.Lerp(NIGHT_HORIZON, DAY_HORIZON, dayK), SUNSET_HORIZON, sunsetK * 0.6);
    this.factors = { dayK, sunsetK };
    return this.refresh();
  }

  async refresh() {
    const v = ++this.version;
    await this.ready;
    if (v !== this.version) return;
    const { sun, moon, opts } = this.request, n = this.n;
    // The photo turns about Y so its (removed) sun's side faces the sun: a reflection
    // matrix, so the visible sky and the lighting turn together.
    const rot = opts.plain ? (opts.rot || 0) : photoTurn(sun);
    this.env.setReflectionTextureMatrix(Matrix.RotationY(rot));
    if (this.view) this.view.setReflectionTextureMatrix(Matrix.RotationY(rot));
    // Grading works in the faces' own space: bring the sun, moon and up there.
    const R = Matrix.RotationY(rot), toTex = d => texFromWorld(d, R);
    const S = toTex(sun), M = toTex(moon), up = toTex([0, 1, 0]);
    const sy = sun[1];
    const dayK = smooth(-0.12, 0.1, sy), sunsetK = smooth(-0.16, 0.0, sy) * (1 - smooth(0.04, 0.4, sy));
    const sunK = smooth(-0.03, 0.02, sy), moonK = smooth(-0.02, 0.03, moon[1]) * (1 - dayK), starsK = 1 - smooth(-0.2, -0.05, sy);
    const faces = this.base.map((src, f) => {
      if (opts.plain) return Float32Array.from(src);
      const dst = new Float32Array(src.length), dir = this.dirs[f];
      for (let i = 0; i < n * n; i++) {
        const j = i * 3, dx = dir[j], dy = dir[j + 1], dz = dir[j + 2];
        const height = dx * up.x + dy * up.y + dz * up.z; // the direction's elevation (sine), in the world
        let r = src[j], g = src[j + 1], b = src[j + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Night: the clouds' shapes, much darker and bluer.
        const nk = 0.35 + 0.65 * lum / (lum + 1);
        r = 0.10 * nk + (r - 0.10 * nk) * dayK; g = 0.14 * nk + (g - 0.14 * nk) * dayK; b = 0.26 * nk + (b - 0.26 * nk) * dayK;
        // A low sun: the sky near the horizon tinted warm, and light scattered around the sun.
        const toward = Math.max(dx * S.x + dy * S.y + dz * S.z, 0), band = Math.exp(-Math.max(height, 0) * 5);
        const w = sunsetK * band;
        r *= 1 + 0.2 * w; g *= 1 - 0.18 * w; b *= 1 - 0.38 * w;
        const glow = sunsetK * (0.9 * Math.pow(toward, 8) + 0.35 * band * (0.4 + 0.6 * toward));
        r += glow; g += 0.42 * glow; b += 0.13 * glow;
        // Discs (bright enough for bloom to make the glow).
        if (sunK > 0 && toward > SUN_COS) { r += 60 * sunK; g += 56 * sunK; b += 49 * sunK; }
        if (moonK > 0 && dx * M.x + dy * M.y + dz * M.z > MOON_COS) { r += 2 * moonK; g += 2.2 * moonK; b += 2.4 * moonK; }
        // Stars above the horizon.
        if (starsK > 0 && height > 0) {
          const h = hash3(Math.floor(dx * 300), Math.floor(dy * 300), Math.floor(dz * 300));
          if (h > 0.9975) { const s = starsK * (h - 0.9975) * 360 * smooth(0, 0.25, height); r += s; g += s; b += s; } // up to 0.9: under bloom's threshold
        }
        dst[j] = r; dst[j + 1] = g; dst[j + 2] = b;
      }
      return dst;
    });
    if (v !== this.version) return;
    const sp = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({ size: n, right: faces[0], left: faces[1], up: faces[2], down: faces[3], front: faces[4], back: faces[5], format: 4, type: 1, gammaSpace: false });
    this.env.update(faces, 4, 1, false);
    this.env.gammaSpace = false;
    try { await this.filtering.prefilter(this.env); } catch (e) { console.warn('sky prefilter:', e.message); }
    if (v !== this.version) return;
    this.env.lodGenerationScale = 0.8; this.env.lodGenerationOffset = 0; // as for a loaded HDR
    this.env.sphericalPolynomial = sp;
    this.onEnvironment && this.onEnvironment();
  }
}
