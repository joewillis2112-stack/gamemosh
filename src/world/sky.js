// Day/night cycle, sky dome, fog, lighting and weather particles.
import * as THREE from 'three';
import { lerp, smoothstep } from '../core/util.js';

const col = (h) => new THREE.Color(h);
const PAL = {
  night: { top: col(0x0b0f1a), hor: col(0x1d2536), fog: col(0x1a2130), sun: col(0x9aaed6), sunI: 0.55, hemi: 0.75, hemiSky: col(0x5d6f96), hemiGround: col(0x22201c) },
  twilight: { top: col(0x2f3346), hor: col(0x8a5c48), fog: col(0x5a4a48), sun: col(0xffa070), sunI: 0.85, hemi: 0.75, hemiSky: col(0x9a8a90), hemiGround: col(0x3a3028) },
  day: { top: col(0x56657a), hor: col(0xa3a7a1), fog: col(0x8a908b), sun: col(0xf2eadb), sunI: 1.0, hemi: 0.85, hemiSky: col(0xc4c8cc), hemiGround: col(0x5a5040) },
};

const WEATHERS = {
  clear: { cloud: 0, fog: 1, rain: 0, ash: 0, snow: 0, storm: 0, label: 'Clear' },
  overcast: { cloud: 0.7, fog: 0.85, rain: 0, ash: 0, snow: 0, storm: 0, label: 'Overcast' },
  mist: { cloud: 0.5, fog: 0.42, rain: 0, ash: 0, snow: 0, storm: 0, label: 'Mist' },
  rain: { cloud: 0.9, fog: 0.62, rain: 1, ash: 0, snow: 0, storm: 0, label: 'Rain' },
  storm: { cloud: 1, fog: 0.55, rain: 1, ash: 0, snow: 0, storm: 1, label: 'Storm' },
  ashfall: { cloud: 0.8, fog: 0.5, rain: 0, ash: 1, snow: 0, storm: 0, label: 'Ashfall' },
  snow: { cloud: 0.8, fog: 0.55, rain: 0, ash: 0, snow: 1, storm: 0, label: 'Snow' },
};

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.time = 0.3; // 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk
    this.fogFar = 250;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0x000000, 20, 250);

    this.uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
      sunCol: { value: new THREE.Color() },
      night: { value: 0 },
      cloud: { value: 0 },
      time: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform float cloud; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
          c = mix(c, hor*0.6, clamp(-h*4.0,0.0,1.0));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 400.0)*1.5 + pow(s, 8.0)*0.18) * (1.0-cloud*0.8);
          vec3 md = -sunDir;
          float m = max(dot(d, md), 0.0);
          c += vec3(0.75,0.8,0.9) * (smoothstep(0.9993,0.9996,m)*0.9 + pow(m,60.0)*0.08) * night * (1.0-cloud*0.7);
          vec3 sp = floor(d*380.0);
          float st = step(0.9975, hash(sp)) * smoothstep(0.0,0.3,h);
          float tw = 0.6+0.4*sin(time*3.0+hash(sp+1.0)*40.0);
          c += vec3(st*tw) * night * (1.0-cloud);
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12), skyMat);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Weather
    this.weather = 'overcast';
    this.next = 'overcast';
    this.w = { ...WEATHERS.overcast };
    this.weatherTimer = 200;
    this.flash = 0;
    this._buildParticles();
    this.tmp = new THREE.Color();
  }

  _buildParticles() {
    const N = 1400;
    this.rainN = N;
    const pos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainSeed[i * 3] = Math.random() * 50 - 25;
      this.rainSeed[i * 3 + 1] = Math.random() * 30;
      this.rainSeed[i * 3 + 2] = Math.random() * 50 - 25;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a95a3, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    const M = 900;
    this.flakeN = M;
    const fp = new Float32Array(M * 3);
    this.flakeSeed = new Float32Array(M * 4);
    for (let i = 0; i < M; i++) {
      this.flakeSeed[i * 4] = Math.random() * 40 - 20;
      this.flakeSeed[i * 4 + 1] = Math.random() * 20;
      this.flakeSeed[i * 4 + 2] = Math.random() * 40 - 20;
      this.flakeSeed[i * 4 + 3] = Math.random() * 10;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.flakeMat = new THREE.PointsMaterial({ color: 0x9a918a, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false });
    this.flakes = new THREE.Points(fg, this.flakeMat);
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  get isNight() {
    return this.sunElevation() < -0.05;
  }
  sunElevation() {
    return Math.sin((this.time - 0.25) * Math.PI * 2);
  }
  clockString() {
    const h = (this.time * 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  get weatherLabel() {
    return WEATHERS[this.weather].label;
  }

  pickWeather(biome, rng = Math.random) {
    const table = biome === 'blight'
      ? [['ashfall', 5], ['overcast', 2], ['mist', 2]]
      : biome === 'frost'
        ? [['snow', 5], ['overcast', 2], ['clear', 1]]
        : [['clear', 2], ['overcast', 4], ['mist', 2.5], ['rain', 3], ['storm', 1.2], ['ashfall', 0.6]];
    let tot = 0;
    for (const e of table) tot += e[1];
    let r = rng() * tot;
    for (const e of table) { r -= e[1]; if (r <= 0) return e[0]; }
    return 'overcast';
  }

  setWeather(name, instant = false) {
    this.weather = name;
    if (instant) this.w = { ...WEATHERS[name] };
  }

  update(dt, camPos, playerPos, biome, dayLength, onThunder) {
    this.time = (this.time + dt / dayLength) % 1;
    this.uniforms.time.value += dt;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 150 + Math.random() * 180;
      this.setWeather(this.pickWeather(biome));
    }
    // Snow replaces rain in high cold areas
    let target = WEATHERS[this.weather];
    if (biome === 'frost' && target.rain) target = WEATHERS.snow;
    for (const k of ['cloud', 'fog', 'rain', 'ash', 'snow', 'storm']) this.w[k] = lerp(this.w[k], target[k], 1 - Math.exp(-dt * 0.15));

    const e = this.sunElevation();
    const nightF = smoothstep(0.02, -0.18, e);
    const dayF = smoothstep(0.05, 0.35, e);
    const pick = (key) => {
      const c = this.tmp.copy(PAL.twilight[key]);
      c.lerp(PAL.day[key], dayF);
      c.lerp(PAL.night[key], nightF);
      return c.clone();
    };
    const pickN = (key) => lerp(lerp(PAL.twilight[key], PAL.day[key], dayF), PAL.night[key], nightF);
    const grey = new THREE.Color(0x4a4e55);
    const cloud = this.w.cloud;
    const top = pick('top').lerp(grey.clone().multiplyScalar(1 - nightF * 0.85), cloud * 0.55);
    const hor = pick('hor').lerp(grey.clone().multiplyScalar(1.3 - nightF), cloud * 0.5);
    const fog = pick('fog').lerp(hor, 0.35);
    if (this.w.ash > 0.01) {
      const ashC = new THREE.Color(0x4a3531).multiplyScalar(1 - nightF * 0.7);
      top.lerp(ashC, this.w.ash * 0.5); hor.lerp(ashC, this.w.ash * 0.6); fog.lerp(ashC, this.w.ash * 0.6);
    }
    // Lightning
    if (this.w.storm > 0.5 && Math.random() < dt * 0.08) {
      this.flash = 1;
      if (onThunder) onThunder();
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    const fl = this.flash > 0 ? (Math.sin(this.flash * 40) > 0 ? this.flash : this.flash * 0.3) : 0;

    this.uniforms.top.value.copy(top).addScalar(fl * 0.3);
    this.uniforms.hor.value.copy(hor).addScalar(fl * 0.4);
    this.uniforms.night.value = nightF;
    this.uniforms.cloud.value = cloud;

    const ang = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.35).normalize();
    this.uniforms.sunDir.value.copy(sunDir);
    this.uniforms.sunCol.value.copy(pick('sun'));

    this.scene.fog.color.copy(fog).addScalar(fl * 0.2);
    const fogMul = this.w.fog;
    this.scene.fog.far = this.fogFar * fogMul * (1 - nightF * 0.3);
    this.scene.fog.near = Math.min(12, this.scene.fog.far * 0.1);

    // Lights: at night the "sun" light is moonlight from the opposite side
    const lightDir = e > 0 ? sunDir : sunDir.clone().negate();
    this.sun.position.copy(playerPos).addScaledVector(lightDir, 120);
    this.sun.target.position.copy(playerPos);
    this.sun.color.copy(e > 0 ? pick('sun') : PAL.night.sun);
    this.sun.intensity = (e > 0 ? pickN('sunI') * smoothstep(-0.02, 0.15, e) : PAL.night.sunI * smoothstep(0, -0.2, e)) * (1 - cloud * 0.45) + fl * 2;
    // three.js Lambert divides by PI; scale so intensity 1 means "albedo as authored"
    this.sun.intensity *= Math.PI;
    this.hemi.color.copy(pick('hemiSky'));
    this.hemi.groundColor.copy(pick('hemiGround'));
    this.hemi.intensity = (pickN('hemi') * (1 - cloud * 0.15) + fl * 1.5) * Math.PI;
    this.dome.position.copy(camPos);

    this._updateParticles(dt, camPos);
    return { nightF, fog };
  }

  _updateParticles(dt, cam) {
    const rainA = this.w.rain;
    this.rain.visible = rainA > 0.03;
    if (this.rain.visible) {
      const n = Math.floor(this.rainN * rainA);
      const p = this.rain.geometry.attributes.position.array;
      const s = this.rainSeed;
      for (let i = 0; i < this.rainN; i++) {
        let y = s[i * 3 + 1] - dt * 26;
        if (y < 0) y += 30;
        s[i * 3 + 1] = y;
        const x = cam.x + s[i * 3], z = cam.z + s[i * 3 + 2], yy = cam.y - 10 + y;
        const vis = i < n ? 1 : 0;
        p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + 0.08; p[i * 6 + 4] = yy - 0.9 * vis; p[i * 6 + 5] = z + 0.05;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.45 * rainA;
    }
    const flakeA = Math.max(this.w.ash, this.w.snow);
    this.flakes.visible = flakeA > 0.03;
    if (this.flakes.visible) {
      const snow = this.w.snow > this.w.ash;
      this.flakeMat.color.set(snow ? 0xdfe3ea : 0x8a817b);
      this.flakeMat.size = snow ? 0.14 : 0.1;
      this.flakeMat.opacity = 0.85 * flakeA;
      const p = this.flakes.geometry.attributes.position.array;
      const s = this.flakeSeed;
      const t = this.uniforms.time.value;
      for (let i = 0; i < this.flakeN; i++) {
        let y = s[i * 4 + 1] - dt * (snow ? 1.6 : 0.9);
        if (y < 0) y += 20;
        s[i * 4 + 1] = y;
        const ph = s[i * 4 + 3];
        p[i * 3] = cam.x + s[i * 4] + Math.sin(t * 0.7 + ph) * 1.2;
        p[i * 3 + 1] = cam.y - 6 + y;
        p[i * 3 + 2] = cam.z + s[i * 4 + 2] + Math.cos(t * 0.5 + ph) * 1.2;
      }
      this.flakes.geometry.attributes.position.needsUpdate = true;
    }
  }
}

export { WEATHERS };
