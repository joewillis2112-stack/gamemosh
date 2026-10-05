// The 3D view: Minecraft's chunks as meshes, the sky and fog, day and night,
// and flat "paper" sprites that always face you (Pokémon, people, a thrown ball).
import * as THREE from 'three';

THREE.ColorManagement.enabled = false; // colours are baked as-is into vertices

function texture(img) {
  const t = new THREE.Texture(img);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const NIGHT_SKY = new THREE.Color(0x0b1026);

/// Minecraft-style light in the block shaders: each vertex brings its sky
/// light and block light; the sky part follows the time of day, the block
/// part (torches, lava) stays, a little warm.
/// `uHand` is a light you carry (a Fire-type lead): xyz and strength 0..1.
/// `uFloor` is the darkest anything gets (an Electric-type lead's FLASH).
const LIGHT = { uDay: { value: 1 }, uMoon: { value: new THREE.Color(1, 1, 1) }, uHand: { value: new THREE.Vector4(0, -999, 0, 0) }, uFloor: { value: 0.035 } };
function lit(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDay = LIGHT.uDay;
    sh.uniforms.uMoon = LIGHT.uMoon;
    sh.uniforms.uHand = LIGHT.uHand;
    sh.uniforms.uFloor = LIGHT.uFloor;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec2 lit;\nvarying vec2 vLit;\nvarying vec3 vPcWorld;\nvoid main() {\n  vLit = lit;\n  vPcWorld = (modelMatrix * vec4(position, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uDay;\nuniform vec3 uMoon;\nuniform vec4 uHand;\nuniform float uFloor;\nvarying vec2 vLit;\nvarying vec3 vPcWorld;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pcSky = vLit.x * uDay;
        float pcHand = uHand.w * clamp(1.0 - distance(vPcWorld, uHand.xyz) / 10.0, 0.0, 1.0);
        float pcBlock = max(vLit.y * vLit.y, pcHand * pcHand);
        vec3 pcLight = max(vec3(pcSky) * uMoon, vec3(pcBlock) * vec3(1.0, 0.88, 0.66));
        diffuseColor.rgb *= max(pcLight, vec3(uFloor));`);
  };
  return material;
}

export class View {
  constructor(canvas, atlasImg, monsImg, world) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 400);
    this.camera.rotation.order = 'YXZ';
    this.fog = new THREE.Fog(0x9cc4ff, 30, 60);
    this.scene.fog = this.fog;
    this.sky = new THREE.Color(0x9cc4ff);
    this.scene.background = this.sky;

    const atlas = texture(atlasImg);
    this.atlas = atlas;
    this.mats = {
      opaque: lit(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true })),
      cutout: lit(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })),
      water: lit(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide })),
    };
    this.monsTex = texture(monsImg);
    this.spriteMat = new THREE.MeshBasicMaterial({ map: this.monsTex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.shadowGeo = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2);
    this.world = world;
    this.chunks = new Map();

    // The block the crosshair is on.
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.outline.visible = false;
    this.scene.add(this.outline);

    // Minecraft's crack overlay on the block being mined.
    const crackGeo = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    this.crack = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.crack.visible = false;
    this.crackStage = -1;
    this.scene.add(this.crack);

    // Particles: block bits, grass, smoke, sparks.
    const MAX = 400;
    this.parts = { n: MAX, pos: new Float32Array(MAX * 3), col: new Float32Array(MAX * 3), vel: new Float32Array(MAX * 3), life: new Float32Array(MAX), next: 0 };
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.parts.pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.parts.col, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.resize();
  }

  /// Sun and moon pictures from the client jar.
  setSky(sunImg, moonImg) {
    const mk = (img, size) => {
      const t = texture(img);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(size);
      m.renderOrder = -1;
      this.scene.add(m);
      return m;
    };
    this.sun = mk(sunImg, 42);
    this.moon = mk(moonImg, 34);
  }

  /// Place sun and moon for Minecraft time `t` (0 = morning).
  skyTime(t) {
    if (!this.sun) return;
    const a = ((t / 24000) * Math.PI * 2) + Math.PI * 0.02;
    const c = this.camera.position;
    const r = 260;
    this.sun.position.set(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z + 40);
    this.moon.position.set(c.x - Math.cos(a) * r, c.y - Math.sin(a) * r, c.z + 40);
    this.sun.visible = Math.sin(a) > -0.15;
    this.moon.visible = Math.sin(a) < 0.15;
  }

  /// Show crack `stage` (0-9) on block (x, y, z), or hide with -1.
  setCrack(x, y, z, stage, tiles, cols) {
    if (stage < 0) { this.crack.visible = false; this.crackStage = -1; return; }
    this.crack.visible = true;
    this.crack.position.set(x + 0.5, y + 0.5, z + 0.5);
    if (stage === this.crackStage) return;
    this.crackStage = stage;
    const tile = tiles[stage];
    const W = this.atlas.image.width, H = this.atlas.image.height;
    const u0 = ((tile % cols) * 16) / W, u1 = ((tile % cols) * 16 + 16) / W;
    const v0 = (Math.floor(tile / cols) * 16) / H, v1 = (Math.floor(tile / cols) * 16 + 16) / H;
    const uv = this.crack.geometry.attributes.uv;
    for (let f = 0; f < 6; f++) {
      uv.setXY(f * 4 + 0, u0, v0); uv.setXY(f * 4 + 1, u1, v0);
      uv.setXY(f * 4 + 2, u0, v1); uv.setXY(f * 4 + 3, u1, v1);
    }
    uv.needsUpdate = true;
  }

  /// Spray `n` particles of colour `rgb` (0..1 each) from (x, y, z).
  burst(x, y, z, rgb, n = 12, speed = 2.5, up = 2) {
    const P = this.parts;
    for (let i = 0; i < n; i++) {
      const k = P.next; P.next = (P.next + 1) % P.n;
      P.pos[k * 3] = x + (Math.random() - 0.5) * 0.6; P.pos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.6; P.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      P.vel[k * 3] = (Math.random() - 0.5) * speed; P.vel[k * 3 + 1] = Math.random() * up + 0.5; P.vel[k * 3 + 2] = (Math.random() - 0.5) * speed;
      const v = 0.8 + Math.random() * 0.3;
      P.col[k * 3] = rgb[0] * v; P.col[k * 3 + 1] = rgb[1] * v; P.col[k * 3 + 2] = rgb[2] * v;
      P.life[k] = 0.6 + Math.random() * 0.5;
    }
  }

  stepParticles(dt) {
    const P = this.parts;
    for (let k = 0; k < P.n; k++) {
      if (P.life[k] <= 0) { P.pos[k * 3 + 1] = -1e4; continue; }
      P.life[k] -= dt;
      P.vel[k * 3 + 1] -= 12 * dt;
      P.pos[k * 3] += P.vel[k * 3] * dt; P.pos[k * 3 + 1] += P.vel[k * 3 + 1] * dt; P.pos[k * 3 + 2] += P.vel[k * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  resize() {
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setRadius(chunks) {
    const far = chunks * 16;
    this.fog.near = far * 0.55;
    this.fog.far = far * 0.95;
  }

  addChunk(m) {
    const k = m.cx + ',' + m.cz;
    this.removeChunk(k);
    const group = new THREE.Group();
    group.position.set(m.cx * 16, 0, m.cz * 16);
    for (const layer of ['opaque', 'cutout', 'water']) {
      const b = m.mesh[layer];
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(b.col, 3, true));
      geo.setAttribute('lit', new THREE.BufferAttribute(b.lit, 2, true));
      geo.setIndex(new THREE.BufferAttribute(b.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats[layer]);
      if (layer === 'water') mesh.renderOrder = 1;
      group.add(mesh);
    }
    this.scene.add(group);
    this.chunks.set(k, group);
  }

  removeChunk(k) {
    const g = this.chunks.get(k);
    if (!g) return;
    for (const m of g.children) m.geometry.dispose();
    this.scene.remove(g);
    this.chunks.delete(k);
  }

  /// During a battle leaves and plants turn see-through, so a tree between
  /// you and the Pokémon doesn't hide the fight.
  seeThrough(on) {
    const m = this.mats.cutout;
    if (m.transparent === on) return;
    m.transparent = on;
    m.opacity = on ? 0.35 : 1;
    m.depthWrite = !on;
    m.needsUpdate = true;
  }

  /// A light carried at (x, y, z), strength 0..1 (0: none); and the darkest
  /// the world may get.
  setHandLight(x, y, z, k) { LIGHT.uHand.value.set(x, y, z, k); }
  setLightFloor(f) { LIGHT.uFloor.value = f; }

  /// `light` 0..1; `skyHex` the biome's daytime sky.
  setDaylight(light, skyHex) {
    LIGHT.uDay.value = light;
    // Moonlight is a little blue.
    LIGHT.uMoon.value.setRGB(0.85 + 0.15 * light, 0.9 + 0.1 * light, 1);
    // Sprites and mobs have no light of their own: a softer day/night.
    const l = 0.3 + 0.7 * light;
    this.spriteMat.color.setRGB(l + 0.1 * (1 - light), l + 0.1 * (1 - light), l + 0.2 * (1 - light));
    this.mobLight = l;
    this.sky.set(skyHex).lerp(NIGHT_SKY, 1 - light);
    this.fog.color.copy(this.sky);
  }

  /// A flat sprite for picture cell `cell` ([x, y, w, h] in mons.png), `height`
  /// blocks tall, standing on its own feet.
  sprite(cell, height) {
    const [x, y, w, h] = cell;
    const W = this.monsTex.image.width, H = this.monsTex.image.height;
    const hgt = height, wid = height * (w / h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-wid / 2, 0, 0, wid / 2, 0, 0, wid / 2, hgt, 0, -wid / 2, hgt, 0], 3));
    const u0 = x / W, u1 = (x + w) / W, v0 = y / H, v1 = (y + h) / H;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u1, v0, u0, v0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geo, this.spriteMat);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(Math.min(2.5, Math.max(0.6, wid)));
    shadow.position.y = 0.03;
    const root = new THREE.Group();
    root.add(mesh);
    root.add(shadow);
    root.userData = { mesh, width: wid, height: hgt, cell };
    this.scene.add(root);
    return root;
  }

  /// Point a sprite's picture at the camera (turning about the vertical only).
  face(root, mirror = false) {
    const m = root.userData.mesh;
    m.rotation.y = Math.atan2(this.camera.position.x - root.position.x, this.camera.position.z - root.position.z);
    m.scale.x = mirror ? -1 : 1;
  }

  /// Swap a sprite's picture in place.
  repaint(root, cell, height) {
    const fresh = this.sprite(cell, height);
    root.userData.mesh.geometry.dispose();
    root.remove(root.userData.mesh);
    root.add(fresh.userData.mesh);
    root.userData = fresh.userData;
    this.scene.remove(fresh);
  }

  /// A small always-facing picture from a canvas (a thrown ball, a "!").
  sprite3(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.NoColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.5, fog: false }));
    this.scene.add(s);
    return s;
  }

  drop(root) {
    root.userData.mesh.geometry.dispose();
    this.scene.remove(root);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
