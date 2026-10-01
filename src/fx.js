// Cheap pooled effects: sparks/embers, debris chunks, shock rings, floating damage numbers.
import * as THREE from 'three';

export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    // Sparks as points
    this.N = 500;
    this.p = new Float32Array(this.N * 3);
    this.v = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.c = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    // Debris cubes
    this.D = 80;
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.12, 0.3), new THREE.MeshLambertMaterial(), this.D);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;
    this.dp = new Float32Array(this.D * 3);
    this.dv = new Float32Array(this.D * 3);
    this.dr = new Float32Array(this.D * 3);
    this.dl = new Float32Array(this.D);
    this.dcur = 0;
    const col = new THREE.Color(0x333333);
    for (let i = 0; i < this.D; i++) this.debrisMesh.setColorAt(i, col);
    scene.add(this.debrisMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Vector3(0, 0, 0);
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.numbers = [];
    this.numLayer = document.getElementById('numbers');
    this._v = new THREE.Vector3();
  }

  burst(x, y, z, hex, count = 8, speed = 2) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.N;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = (Math.random() - 0.5) * speed * 2;
      this.v[i * 3 + 1] = Math.random() * speed * 1.5;
      this.v[i * 3 + 2] = (Math.random() - 0.5) * speed * 2;
      this.c[i * 3] = c.r; this.c[i * 3 + 1] = c.g; this.c[i * 3 + 2] = c.b;
      this.life[i] = 0.5 + Math.random() * 0.6;
    }
  }

  debris(x, y, z, hex, count = 6) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < count; k++) {
      const i = this.dcur;
      this.dcur = (this.dcur + 1) % this.D;
      this.dp[i * 3] = x + (Math.random() - 0.5) * 0.6;
      this.dp[i * 3 + 1] = y + Math.random() * 0.5;
      this.dp[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.dv[i * 3] = (Math.random() - 0.5) * 7;
      this.dv[i * 3 + 1] = 2 + Math.random() * 5;
      this.dv[i * 3 + 2] = (Math.random() - 0.5) * 7;
      this.dr[i * 3] = Math.random() * 6; this.dr[i * 3 + 1] = Math.random() * 6; this.dr[i * 3 + 2] = Math.random() * 6;
      this.dl[i] = 3 + Math.random();
      this.debrisMesh.setColorAt(i, c);
    }
    this.debrisMesh.instanceColor.needsUpdate = true;
  }

  ring(x, y, z, radius, hex) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, y + 0.15, z);
    this.game.scene.add(m);
    this.rings.push({ m, t: 0, r: radius });
  }

  number(x, y, z, n, kind = 'dmg') {
    if (!this.numLayer) return;
    if (this.numbers.length > 24) {
      const old = this.numbers.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `num ${kind}`;
    el.textContent = n;
    this.numLayer.appendChild(el);
    this.numbers.push({ el, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0 });
  }

  update(dt, camera) {
    const g = this.game;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.p[i * 3 + 1] = -9999; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 4 * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const f = Math.min(1, this.life[i] * 2);
      this.c[i * 3] *= 0.995; this.c[i * 3 + 1] *= 0.99; this.c[i * 3 + 2] *= 0.99;
      if (f < 0.05) this.life[i] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (let i = 0; i < this.D; i++) {
      if (this.dl[i] <= 0) {
        this._m.compose(this._zero, this._q.identity(), this._s.set(0, 0, 0));
        this.debrisMesh.setMatrixAt(i, this._m);
        continue;
      }
      this.dl[i] -= dt;
      this.dv[i * 3 + 1] -= 18 * dt;
      let x = this.dp[i * 3] + this.dv[i * 3] * dt;
      let y = this.dp[i * 3 + 1] + this.dv[i * 3 + 1] * dt;
      let z = this.dp[i * 3 + 2] + this.dv[i * 3 + 2] * dt;
      const gh = g.gen.height(x, z) + 0.06;
      if (y < gh) {
        y = gh;
        this.dv[i * 3 + 1] *= -0.3;
        this.dv[i * 3] *= 0.6; this.dv[i * 3 + 2] *= 0.6;
      } else {
        this.dr[i * 3] += dt * 8; this.dr[i * 3 + 2] += dt * 6;
      }
      this.dp[i * 3] = x; this.dp[i * 3 + 1] = y; this.dp[i * 3 + 2] = z;
      const s = Math.min(1, this.dl[i]);
      this._e.set(this.dr[i * 3], this.dr[i * 3 + 1], this.dr[i * 3 + 2]);
      this._q.setFromEuler(this._e);
      this._v.set(x, y, z);
      this._m.compose(this._v, this._q, this._s.set(s, s, s));
      this.debrisMesh.setMatrixAt(i, this._m);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    for (const r of [...this.rings]) {
      r.t += dt;
      const k = r.t / 0.5;
      r.m.scale.setScalar(0.2 + k * r.r);
      r.m.material.opacity = 0.8 * (1 - k);
      if (k >= 1) {
        g.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(this.rings.indexOf(r), 1);
      }
    }

    const w = window.innerWidth, h = window.innerHeight;
    for (const n of [...this.numbers]) {
      n.t += dt;
      this._v.set(n.x, n.y + n.t * 1.2, n.z).project(camera);
      if (n.t > 0.9 || this._v.z > 1) {
        n.el.remove();
        this.numbers.splice(this.numbers.indexOf(n), 1);
        continue;
      }
      n.el.style.transform = `translate(${(this._v.x * 0.5 + 0.5) * w}px, ${(-this._v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      n.el.style.opacity = String(1 - Math.max(0, n.t - 0.5) * 2.5);
    }
  }
}
