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
    this.mats = {
      opaque: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }),
      cutout: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      water: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
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
    this.resize();
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

  /// `light` 0..1; `skyHex` the biome's daytime sky.
  setDaylight(light, skyHex) {
    const l = 0.25 + 0.75 * light;
    for (const m of Object.values(this.mats)) m.color.setRGB(l, l, l * (0.85 + 0.15 * light) + (1 - light) * 0.08);
    this.spriteMat.color.setRGB(l + 0.1 * (1 - light), l + 0.1 * (1 - light), l + 0.15 * (1 - light));
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
