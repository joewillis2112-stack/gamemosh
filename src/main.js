// Gloamreach: boot, game loop, and the rules that tie every system together.
import './colorsetup.js';
import * as THREE from 'three';
import { initPhysics, Physics, R, GROUPS, G, groups } from './physics.js';
import { WORLD, QUALITY, DAY_LENGTH, PLAYER } from './config.js';
import { WorldGen } from './world/gen.js';
import { ChunkManager } from './world/chunks.js';
import { LocationManager, makeFireMesh, animateFire } from './world/locations.js';
import { makeProtos } from './world/meshkit.js';
import { Sky } from './world/sky.js';
import { renderMapRows, MAP_N } from './world/mapgen.js';
import { loreText } from './world/names.js';
import { Input } from './input.js';
import { Player } from './entities/player.js';
import { EnemyManager } from './entities/enemies.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { ITEMS, RECIPES, rollLoot, upgradeCost, itemName } from './items.js';
import { newState, saveGame, loadGame, peekSave, loadSettings, saveSettings, FOG_N } from './state.js';
import { RNG, hashInts, randomSeedString } from './core/rng.js';
import { clamp, dist2, lerp, damp } from './core/util.js';

const TYPE_LABEL = {
  keep: 'Keep', cathedral: 'Cathedral', necropolis: 'Necropolis', hamlet: 'Hamlet', shrine: 'Shrine', watchtower: 'Watchtower',
  stones: 'Standing stones', camp: 'Camp', gallows: 'Gallows', wreck: 'Wreck', cairn: 'Cairn', crypt: 'Crypt',
};

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.settings = loadSettings();
    this.autoQuality = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'low' : 'medium';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.qualityPreset.antialias, powerPreference: 'high-performance' });
    // Colours are authored as they should appear on screen, so skip linear conversion.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.cameraYaw = 0;
    this.cameraPitch = 0.28;
    this.camDist = 5.5;
    this.camTarget = new THREE.Vector3();
    this.shakeAmt = 0;
    this.hitstopT = 0;
    this.hurtPulse = 0;
    this.mode = 'boot';
    this.input = new Input(document.getElementById('app'), this.canvas);
    this.audio = new Audio();
    this.ui = new UI(this);
    this.corpses = [];
    this.bombs = [];
    this.projectiles = [];
    this.treeHits = new Map();
    this.activeBoss = null;
    this.saveTimer = 45;
    this.fogTimer = 0;
    this.frames = 0;
    this.fpsT = 0;
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') { this.save(); this.openMenu('gear'); } });
    window.addEventListener('pagehide', () => { if (this.state && (this.mode === 'play' || this.mode === 'paused')) this.save(); });
    const startAudio = () => this.audio.start();
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
    this.resize();
  }

  get qualityPreset() {
    return QUALITY[this.settings.quality || this.autoQuality] || QUALITY.medium;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.qualityPreset.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 62;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    const s = this.settings;
    saveSettings(s);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.audio.setMusic(s.music);
    document.getElementById('fps').hidden = !s.showFps;
    const q = this.qualityPreset;
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.sky) {
      this.sky.fogFar = q.fogFar;
      this.sky.sun.castShadow = q.shadows;
    }
    if (this.chunks) {
      this.chunks.viewChunks = q.viewChunks;
      this.chunks.vegDensity = q.veg;
    }
    this.resize();
  }

  async boot() {
    await initPhysics();
    this.physics = new Physics();
    this.protos = makeProtos(12345);
    this.sky = new Sky(this.scene, this.renderer);
    this.fx = new FX(this);
    this.enemies = new EnemyManager(this);
    this.applySettings();
    // Title backdrop: the saved world if any, otherwise a random one
    const peek = peekSave();
    const seed = peek ? peek.seed : randomSeedString();
    this.state = peek ? (loadGame() || newState(seed)) : newState(seed);
    await this.buildWorld(this.state, true);
    this.mode = 'title';
    this.ui.refreshTitle();
    document.getElementById('title').hidden = false;
    this.ui.stack = ['title'];
    this.sky.time = 0.735;
    this.sky.setWeather('mist', true);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- world lifecycle ----------
  async buildWorld(state, quiet = false) {
    if (this.chunks) this.teardown();
    this.state = state;
    this.gen = new WorldGen(state.seed);
    this.chunks = new ChunkManager(this.scene, this.physics, this.gen, this.protos);
    this.chunks.harvested = new Set(state.harvested || []);
    this.applySettings();
    this.locations = new LocationManager(this);
    this.player = new Player(this);
    this.player.root.visible = !quiet;
    // Map image
    const img = new ImageData(MAP_N, MAP_N);
    let last = performance.now();
    for (const p of renderMapRows(this.gen, img.data)) {
      if (!quiet) this.ui.loading(p * 0.6, state.seed);
      if (performance.now() - last > 30) { await nextFrame(); last = performance.now(); }
    }
    this.ui.setMapImage(img);
    this.ui.fogDirty = true;
    // Terrain near the start point
    const sp = this.startPosition();
    let pending = 1;
    while (pending > 0) {
      pending = this.chunks.update(sp.x, sp.z, 40);
      const total = Math.PI * (this.chunks.viewChunks + 0.5) ** 2;
      if (!quiet) this.ui.loading(0.6 + 0.4 * (1 - pending / total), state.seed);
      await nextFrame();
    }
    this.locations.update(sp.x, sp.z, 0, 0, this.chunks.viewChunks * WORLD.CHUNK);
    this.player.teleport(sp.x, sp.y, sp.z);
    this.player.facing = sp.facing || 0;
    this.cameraYaw = this.player.facing;
    this.camTarget.set(sp.x, sp.y + 1.4, sp.z);
    this.sky.time = state.time;
    this.sky.setWeather('overcast', true);
  }

  teardown() {
    this.enemies.clear();
    this.locations.clear();
    this.chunks.clear();
    for (const c of this.corpses) { this.scene.remove(c.mesh); this.physics.removeBody(c.body); this.physics.dynamic.delete(c); }
    this.corpses = [];
    for (const b of this.bombs) { this.scene.remove(b.mesh); this.physics.removeBody(b.body); }
    this.bombs = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    if (this.player) {
      this.scene.remove(this.player.root);
      this.scene.remove(this.player.torchLight);
      this.physics.removeBody(this.player.body);
    }
    this.activeBoss = null;
    this.treeHits.clear();
  }

  startPosition() {
    const s = this.state.player;
    if (s.y !== 0 || s.x !== 0 || s.z !== 0) return { x: s.x, y: s.y + 0.5, z: s.z, facing: s.facing };
    const sp = this.gen.spawn;
    const a = sp.rot;
    const x = sp.x + Math.sin(a) * 3.5, z = sp.z + Math.cos(a) * 3.5;
    return { x, y: this.gen.height(x, z) + 1.3, z, facing: a + Math.PI };
  }

  async startNew(seed) {
    this.mode = 'loading';
    this.ui.open('loading');
    this.ui.loading(0, seed);
    await nextFrame();
    const st = newState(seed);
    await this.buildWorld(st);
    st.shrine = this.gen.spawn.id;
    st.discovered.add(this.gen.spawn.id);
    this.revealFog(this.player.pos.x, this.player.pos.z, 90);
    st.player.hp = this.player.maxHp;
    st.player.stamina = this.player.maxStamina;
    this.sky.time = 0.3;
    this.save();
    this.enterPlay();
    this.ui.banner('Gloamreach', 'The beacons are cold', true);
    setTimeout(() => this.mode === 'play' && this.ui.toast('Six guardians hold the ruins marked on your map. Fell them and relight their beacons.', 6), 3500);
  }

  async continueGame() {
    const st = loadGame();
    if (!st) { this.startNew(randomSeedString()); return; }
    this.mode = 'loading';
    this.ui.open('loading');
    await nextFrame();
    await this.buildWorld(st);
    this.player.root.visible = true;
    if (st.player.torchOn) { st.player.torchOn = false; this.player.toggleTorch(true); }
    this.enterPlay();
    const loc = this.gen.locations.find((l) => l.id === st.shrine);
    this.ui.banner('Journey resumed', loc ? loc.name : this.gen.seedString);
  }

  enterPlay() {
    this.ui.closeAll();
    this.mode = 'play';
    this.player.root.visible = true;
    this.ui.hud.hidden = false;
    this.input.enabled = true;
    this.last = performance.now();
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      document.getElementById('fps').textContent = `${Math.round(this.frames / this.fpsT)} fps`;
      this.frames = 0; this.fpsT = 0;
    }
    this.input.poll(dt);
    const t = now / 1000;

    if (this.mode === 'title' || this.mode === 'loading') {
      this._titleCamera(dt, t);
      this.sky.update(dt * 0.2, this.camera.position, this.camTarget, 'moor', DAY_LENGTH, null);
      if (this.locations) this.locations.update(this.camTarget.x, this.camTarget.z, dt, t, this.chunks.viewChunks * WORLD.CHUNK);
      if (this.mode === 'title') this.ui.navigate(this.input);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      this.input.pressed.clear();
      return;
    }

    if (this.mode === 'play') {
      // Hit-stop: briefly slow the simulation on impact
      let simDt = dt;
      if (this.hitstopT > 0) { this.hitstopT -= dt; simDt = dt * 0.15; }
      this._menuKeys();
      const steps = this.physics.step(simDt, (h) => this.fixedUpdate(h));
      if (steps > 0) { this.input.pressed.clear(); this.input.released.clear(); }
      if (this.mode === 'play' || this.mode === 'dead') this.frameUpdate(dt, t);
    } else {
      // paused / dead / menus: keep the world drawn, animate atmosphere
      this.ui.navigate(this.input);
      this._menuKeys();
      this.fx.update(dt, this.camera);
      if (this.mode === 'dead') this._camera(dt);
      this.input.pressed.clear();
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  _menuKeys() {
    const inp = this.input;
    if (this.mode === 'play') {
      if (inp.consume('menu')) this.openMenu('gear');
      if (inp.consume('inventory')) this.openMenu('gear');
      if (inp.consume('map')) this.openMenu('map');
      if (inp.consume('journal')) this.openMenu('journal');
    } else if (this.mode === 'paused') {
      if (inp.consume('inventory') || inp.consume('map') || inp.consume('journal')) this.back();
      for (const [k, d] of [['up', 'up_d'], ['down', 'down_d'], ['left', 'left_d'], ['right', 'right_d']]) if (inp.consume(k)) inp.press(d), inp.release(d);
    }
  }

  fixedUpdate(h) {
    const st = this.state;
    st.stats.playTime += h;
    this.player.update(h, this.input, this.cameraYaw);
    this.enemies.update(h);
    this._updateBombs(h);
    this._updateProjectiles(h);
    this._updateDread(h);
  }

  frameUpdate(dt, t) {
    const p = this.player;
    const st = this.state;
    this.chunks.update(p.pos.x, p.pos.z, 5);
    this.locations.update(p.pos.x, p.pos.z, dt, t, this.chunks.viewChunks * WORLD.CHUNK);
    const biome = this.gen.biomeAt(p.pos.x, p.pos.z);
    const skyOut = this.sky.update(dt, this.camera.position, p.pos, biome, st.ended ? DAY_LENGTH * 4 : DAY_LENGTH, () => this.audio.play('thunder'));
    st.time = this.sky.time;
    this._camera(dt);
    this.fx.update(dt, this.camera);
    this._updateCorpses(dt);
    if (this.torchFlame) animateFire(this.torchFlame, t);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.8);
    this.audio.listener = { x: p.pos.x, z: p.pos.z };
    this.audio.ambient(t, {
      wind: this.sky.w.cloud + (biome === 'frost' || biome === 'crags' ? 0.6 : 0),
      rain: this.sky.w.rain,
      night: skyOut.nightF,
      dread: st.player.dread,
      lowHp: clamp(1 - st.player.hp / p.maxHp - 0.5, 0, 0.5) * 2,
      boss: !!this.activeBoss,
    });
    this._discovery();
    this._nearInteract();
    this._remnant();
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.fogTimer = 0.5; this.revealFog(p.pos.x, p.pos.z, 70); }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0 && !p.dead && !this.activeBoss) { this.saveTimer = 45; this.save(); }
    this.ui.updateHUD(dt);
  }

  _titleCamera(dt, t) {
    const sp = this.gen.spawn;
    const a = t * 0.04;
    const r = 26;
    const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
    const y = Math.max(this.gen.height(x, z), 0) + 9;
    this.camera.position.set(x, y, z);
    this.camTarget.set(sp.x, sp.y + 2, sp.z);
    this.camera.lookAt(this.camTarget);
    if (this.chunks) this.chunks.update(sp.x, sp.z, 4);
  }

  _camera(dt) {
    const p = this.player;
    const inp = this.input;
    if (this.mode === 'play') {
      this.cameraYaw -= inp.look.x;
      this.cameraPitch = clamp(this.cameraPitch + inp.look.y, -0.55, 1.2);
    }
    // Gentle auto-follow behind the player when moving on touch without looking
    if (inp.touchMode && !inp.lookTouch && p.speedNow > 1 && Math.abs(inp.move.x) > 0.2) {
      const behind = p.facing;
      const d = Math.atan2(Math.sin(behind - this.cameraYaw), Math.cos(behind - this.cameraYaw));
      this.cameraYaw += d * Math.min(1, dt * 0.8);
    }
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 0.9, p.pos.z);
    this.camTarget.x = damp(this.camTarget.x, target.x, 14, dt);
    this.camTarget.y = damp(this.camTarget.y, target.y, 9, dt);
    this.camTarget.z = damp(this.camTarget.z, target.z, 14, dt);
    const dist = this.activeBoss ? 7.2 : this.camDist;
    const cp = Math.cos(this.cameraPitch), sp = Math.sin(this.cameraPitch);
    const dir = new THREE.Vector3(-Math.sin(this.cameraYaw) * cp, sp, -Math.cos(this.cameraYaw) * cp);
    let d = dist;
    const hit = this.physics.raycast({ x: this.camTarget.x, y: this.camTarget.y, z: this.camTarget.z }, { x: dir.x, y: dir.y, z: dir.z }, dist, GROUPS.worldOnly);
    if (hit !== null) d = Math.max(0.6, hit - 0.3);
    const cam = this.camera.position;
    cam.copy(this.camTarget).addScaledVector(dir, d);
    const gh = this.gen.height(cam.x, cam.z) + 0.4;
    if (cam.y < gh) cam.y = gh;
    if (this.shakeAmt > 0) {
      cam.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.y += (Math.random() - 0.5) * this.shakeAmt;
      cam.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
    }
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.3, this.camTarget.z);
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  vibrate(ms) {
    if (this.settings.vibration && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not allowed */ } }
  }

  // ---------- dread ----------
  _updateDread(h) {
    const s = this.state.player;
    const p = this.player;
    if (p.dead) return;
    const night = this.sky.isNight;
    const biome = this.gen.biomeAt(p.pos.x, p.pos.z);
    let gain = 0;
    if (night) gain += 1.5;
    if (biome === 'blight') gain += 1.4;
    if (this.sky.w.storm > 0.5) gain += 0.4;
    gain += this.enemies.dreadAura(p.pos);
    if (s.torchOn) gain *= 0.25;
    gain *= 1 - (s.stats.resolve - 1) * 0.06;
    if (p.charm === 'pale_ring') gain *= 0.6;
    const fireD = this.locations.nearestFireDist(p.pos.x, p.pos.z);
    let decay = 0;
    if (fireD < 12) decay += 10;
    if (!night && biome !== 'blight') decay += 1.2;
    if (s.torchOn && night) decay += 0.5;
    if (this.state.ended) { gain *= 0.2; decay += 1; }
    s.dread = clamp(s.dread + (gain - decay) * h, 0, 100);
    if (s.dread >= 100) p.hurt(3 * h, null, 'dread', true);
    // Terror draws wraiths
    this.wraithTimer = (this.wraithTimer || 20) - h;
    if (s.dread > 80 && night && this.wraithTimer <= 0) {
      this.wraithTimer = 25;
      const a = Math.random() * Math.PI * 2;
      const x = p.pos.x + Math.cos(a) * 18, z = p.pos.z + Math.sin(a) * 18;
      if (this.gen.height(x, z) > 0.5) {
        const e = this.enemies.spawn('wraith', x, z, { level: this.gen.dangerAt(x, z), wild: true, nightOnly: true });
        e.aggro = true;
        this.ui.toast('Something answers your fear.');
      }
    }
  }

  // ---------- discovery ----------
  _discovery() {
    const p = this.player.pos;
    const st = this.state;
    for (const loc of this.gen.locations) {
      if (st.discovered.has(loc.id)) continue;
      if (dist2(p.x, p.z, loc.x, loc.z) < loc.reveal * 0.6) {
        st.discovered.add(loc.id);
        const embers = loc.kind === 'major' ? 150 : 30;
        st.player.embers += embers;
        if (loc.kind === 'major' || loc.type === 'shrine') {
          this.ui.banner(TYPE_LABEL[loc.type], loc.name);
          this.audio.play('discover');
        } else this.ui.toast(`Discovered: ${loc.name}  (+${embers} embers)`);
      }
    }
  }

  revealFog(x, z, r) {
    const cell = (WORLD.HALF * 2) / FOG_N;
    const cx = Math.floor((x + WORLD.HALF) / cell), cz = Math.floor((z + WORLD.HALF) / cell);
    const cr = Math.ceil(r / cell);
    const f = this.state.fog;
    let changed = false;
    for (let j = cz - cr; j <= cz + cr; j++) {
      for (let i = cx - cr; i <= cx + cr; i++) {
        if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) continue;
        if ((i - cx) ** 2 + (j - cz) ** 2 > cr * cr) continue;
        if (!f[j * FOG_N + i]) { f[j * FOG_N + i] = 1; changed = true; }
      }
    }
    if (changed) this.ui.fogDirty = true;
  }

  // ---------- interaction ----------
  _nearInteract() {
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const it of this.locations.interactables) {
      if (it.action === 'chest' && this.state.opened.has(it.id)) continue;
      if (it.action === 'loot' && this.state.opened.has(it.id)) continue;
      if (it.action === 'beacon' && this.state.beacons.has(it.loc.id)) continue;
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d < it.r && Math.abs(p.y - it.y) < 3.5 && d < bd) { bd = d; best = it; }
    }
    this.nearInteract = best;
  }

  interactLabel(it) {
    if (it.action === 'beacon' && !this.state.bosses.has(it.loc.id)) return 'The beacon is cold. Its guardian still lives.';
    if (it.action === 'note' && this.state.notes.has(it.id)) return 'Read note again';
    return it.label;
  }

  tryInteract() {
    const it = this.nearInteract;
    if (!it || this.player.busy()) return;
    const st = this.state;
    switch (it.action) {
      case 'rest': this.rest(it.loc); break;
      case 'craft':
        this.pause();
        this.openMenu('craft', true);
        break;
      case 'chest':
      case 'loot': {
        st.opened.add(it.id);
        this.audio.play('chest');
        const lvl = this.gen.dangerAt(it.x, it.z);
        const loot = rollLoot(hashInts(this.gen.seed, it.id.length, it.loc.id, st.opened.size), lvl, it.quality || 0.3);
        for (const l of loot) this.giveItem(l.id, l.qty);
        const embers = 15 * lvl;
        st.player.embers += embers;
        this.fx.burst(it.x, it.y + 0.4, it.z, 0xe0b060, 14, 2);
        break;
      }
      case 'note': {
        const rng = new RNG(hashInts(this.gen.seed, it.loc.id, 9));
        const text = loreText(rng, it.loc.name);
        if (!st.notes.has(it.id)) {
          st.notes.add(it.id);
          st.noteTexts[it.id] = { text, place: it.loc.name };
          st.player.embers += 20;
        }
        this.pause();
        this.ui.read(`A note at ${it.loc.name}`, text);
        break;
      }
      case 'beacon': {
        if (!st.bosses.has(it.loc.id)) { this.ui.toast(`${it.loc.bossName} must fall before this fire will take.`); return; }
        this.lightBeacon(it);
        break;
      }
      case 'climb': {
        this.ui.fade(true);
        setTimeout(() => {
          this.player.teleport(it.top.x, it.top.y + 0.6, it.top.z);
          this.ui.fade(false);
          this.survey(it.loc);
        }, 450);
        break;
      }
      default: break;
    }
  }

  survey(loc) {
    this.revealFog(loc.x, loc.z, 300);
    let n = 0;
    for (const l of this.gen.locations) {
      if (dist2(l.x, l.z, loc.x, loc.z) < 300 && !this.state.seen.has(l.id) && !this.state.discovered.has(l.id)) {
        this.state.seen.add(l.id);
        n++;
      }
    }
    this.ui.banner('Surveyed from the tower', n ? `${n} places charted` : 'Nothing new in sight');
    this.audio.play('discover');
  }

  lightBeacon(it) {
    const st = this.state;
    st.beacons.add(it.loc.id);
    it.fire.lit = true;
    this.audio.play('beacon');
    this.fx.burst(it.fire.x, it.fire.y, it.fire.z, 0xffa040, 60, 5);
    this.fx.ring(it.x, it.y, it.z, 12, 0xffa040);
    this.shake(0.4);
    const n = st.beacons.size;
    st.player.embers += 500;
    if (n % 2 === 0) { st.player.flaskMax++; }
    st.player.flaskLvl = n;
    st.player.hp = this.player.maxHp;
    st.player.dread = 0;
    st.shrine = this.nearestShrineId(it.x, it.z) ?? st.shrine;
    this.ui.banner(`Beacon ${n} of ${WORLD.MAJOR_COUNT}`, 'Beacon kindled', true);
    this.save();
    if (n >= WORLD.MAJOR_COUNT && !st.ended) {
      st.ended = true;
      setTimeout(() => this.ending(), 3500);
    }
  }

  ending() {
    const st = this.state;
    this.sky.time = 0.27;
    this.sky.setWeather('clear');
    this.pause();
    const hrs = Math.floor(st.stats.playTime / 3600), mins = Math.floor((st.stats.playTime % 3600) / 60);
    document.getElementById('ending-text').textContent = `All six beacons burn. For the first time in a generation the sun clears the hills of ${this.gen.seedString}. You felled ${st.stats.kills} foes and died ${st.stats.deaths} times in ${hrs}h ${mins}m. The land is quieter now, though not empty. You may keep wandering, or begin a new journey from the title screen.`;
    this.ui.open('ending');
    this.save();
  }

  // Nearest guardian ruin whose beacon is still cold
  objectiveTarget() {
    const st = this.state;
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const l of this.gen.locations) {
      if (l.kind !== 'major' || st.beacons.has(l.id)) continue;
      const d = dist2(p.x, p.z, l.x, l.z);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return null;
    const known = st.discovered.has(best.id) || st.seen.has(best.id);
    return { x: best.x, z: best.z, name: known ? best.name : `an unknown ${TYPE_LABEL[best.type].toLowerCase()}`, bossDead: st.bosses.has(best.id) };
  }

  nearestShrineId(x, z) {
    let best = null, bd = Infinity;
    for (const l of this.gen.locations) {
      if (l.type !== 'shrine' || !this.state.discovered.has(l.id)) continue;
      const d = dist2(x, z, l.x, l.z);
      if (d < bd) { bd = d; best = l.id; }
    }
    return best;
  }

  rest(loc) {
    const st = this.state;
    const s = st.player;
    s.hp = this.player.maxHp;
    s.stamina = this.player.maxStamina;
    s.flasks = s.flaskMax;
    s.dread = 0;
    st.shrine = loc.id;
    this.audio.play('rest');
    this.fx.burst(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, 0xffa040, 30, 2);
    this.respawnEnemies();
    this.save();
    this.pause();
    this.ui.openShrine(loc);
  }

  respawnEnemies() {
    for (const e of [...this.enemies.list]) if (!e.isBoss || !e.aggro) this.enemies.remove(e);
    for (const rt of this.locations.rt.values()) {
      if (rt.active) { this.locations._deactivate(rt); this.locations._activate(rt); }
    }
  }

  leaveShrine() {
    this.ui.close('shrine');
    this.resume();
  }

  travelTo(locId) {
    const loc = this.gen.locations.find((l) => l.id === locId);
    if (!loc) return;
    this.ui.close('shrine');
    this.ui.fade(true);
    setTimeout(async () => {
      const a = loc.rot;
      const x = loc.x + Math.sin(a) * 3.5, z = loc.z + Math.cos(a) * 3.5;
      this.player.teleport(x, this.gen.height(x, z) + 1.5, z);
      let pending = 1;
      while (pending > 0) { pending = this.chunks.update(x, z, 40); await nextFrame(); }
      this.locations.update(x, z, 0, 0, this.chunks.viewChunks * WORLD.CHUNK);
      this.player.teleport(x, this.gen.height(x, z) + 1.3, z);
      this.player.facing = a + Math.PI;
      this.cameraYaw = this.player.facing;
      this.camTarget.set(x, this.player.pos.y + 1, z);
      this.state.shrine = loc.id;
      this.ui.fade(false);
      this.resume();
      this.ui.banner('Shrine', loc.name);
      this.save();
    }, 650);
  }

  // ---------- items ----------
  hasItem(id, n = 1) { return (this.state.inv[id] || 0) >= n; }
  takeItem(id, n = 1) {
    this.state.inv[id] = Math.max(0, (this.state.inv[id] || 0) - n);
    if (this.state.inv[id] === 0) delete this.state.inv[id];
  }
  giveItem(id, n = 1, quiet = false) {
    if (!ITEMS[id]) return;
    const d = ITEMS[id];
    const isGear = d.type === 'weapon' || d.type === 'armor' || d.type === 'charm';
    if (isGear && this.state.inv[id]) {
      // Duplicate gear becomes materials
      this.giveItem(d.type === 'weapon' ? 'iron_scrap' : 'cloth', 3, quiet);
      return;
    }
    this.state.inv[id] = (this.state.inv[id] || 0) + n;
    this.ui.pickup(id, n);
    if (!quiet) this.audio.play('pickup');
  }

  equip(id, slot) {
    const eq = this.state.equip;
    if (!id) { eq[slot] = null; return; }
    const d = ITEMS[id];
    if (d.type === 'weapon') { eq.weapon = id; this.player.rig.setWeapon(d.model); }
    else if (d.type === 'armor') eq.armor = id;
    else if (d.type === 'charm') eq.charm = id;
    this.ui.toast(`Equipped ${itemName(id)}`);
  }

  useItem(id) {
    if (!this.hasItem(id)) return;
    const s = this.state.player;
    if (id === 'dried_meat') { this.player.regen += 35; this.takeItem(id); this.ui.toast('You eat. Warmth returns slowly.'); }
    else if (id === 'pale_herb') { s.dread = Math.max(0, s.dread - 40); this.takeItem(id); this.ui.toast('The whispers quiet.'); }
    else if (id === 'torch') { this.takeItem(id); s.torchFuel += 240; this.ui.toast('Torch fuel added.'); }
  }

  craft(recipe) {
    const inv = this.state.inv;
    for (const [id, n] of Object.entries(recipe.needs)) if ((inv[id] || 0) < n) return;
    for (const [id, n] of Object.entries(recipe.needs)) this.takeItem(id, n);
    this.giveItem(recipe.out, recipe.qty);
    if (recipe.once) this.state.crafted.add(recipe.out);
  }

  upgradeWeapon(id) {
    const st = this.state;
    const lvl = st.weaponLvl[id] || 0;
    const cost = upgradeCost(lvl);
    for (const [k, n] of Object.entries(cost)) if ((st.inv[k] || 0) < n) return;
    for (const [k, n] of Object.entries(cost)) this.takeItem(k, n);
    st.weaponLvl[id] = lvl + 1;
    this.audio.play('levelup');
    this.ui.toast(`${itemName(id, lvl + 1)} tempered.`);
  }

  levelCost() {
    return Math.round(90 * Math.pow(1.13, this.state.player.level - 1));
  }

  levelUp(stat) {
    const s = this.state.player;
    const cost = this.levelCost();
    if (s.embers < cost) return;
    s.embers -= cost;
    s.level++;
    s.stats[stat]++;
    s.hp = this.player.maxHp;
    s.stamina = this.player.maxStamina;
    this.audio.play('levelup');
  }

  nearFire() {
    return this.locations.nearestFireDist(this.player.pos.x, this.player.pos.z, ['camp', 'shrine', 'beacon']) < 5;
  }

  setTorchFlame(on) {
    if (on && !this.torchFlame && this.player.rig.torch) {
      this.torchFlame = makeFireMesh(0.35);
      this.torchFlame.position.set(0, -0.55, 0);
      this.player.rig.torch.add(this.torchFlame);
    } else if (!on && this.torchFlame) {
      this.torchFlame.parent && this.torchFlame.parent.remove(this.torchFlame);
      this.torchFlame = null;
    }
  }

  // ---------- harvesting ----------
  harvestTree(info, axe) {
    const key = `${info.chunk.cx},${info.chunk.cz},${info.idx}`;
    const hits = (this.treeHits.get(key) || 0) + 1;
    this.treeHits.set(key, hits);
    this.audio.play('chop', this.player.pos);
    this.fx.debris(info.x, info.h + 1.2, info.z, 0x3a2e24, 3);
    if (hits >= (axe ? 2 : 4)) {
      this.chunks.fellTree(info);
      this.state.harvested.push(key);
      this.fx.debris(info.x, info.h + 1.5, info.z, 0x2f2620, 10);
      this.giveItem('wood', axe ? 3 : 2);
      if (Math.random() < 0.35) this.giveItem('resin', 1);
    }
  }

  harvestRock(info) {
    this.audio.play('hit', this.player.pos);
    this.fx.burst(info.x, info.h + 0.5, info.z, 0xffd090, 6, 3);
    if (Math.random() < 0.22) this.giveItem('iron_scrap', 1);
  }

  // ---------- combat events ----------
  onPlayerHurt(dmg, kind) {
    this.hurtPulse = Math.min(1, 0.4 + dmg / 40);
    if (kind === 'hit' || kind === 'fall') {
      this.shake(Math.min(0.5, 0.1 + dmg / 60));
      this.vibrate(Math.min(200, 40 + dmg * 3));
      this.audio.play('hurt');
      this.fx.burst(this.player.pos.x, this.player.pos.y + 0.4, this.player.pos.z, 0x6a1a14, 8, 2);
    }
  }

  onPlayerDeath() {
    const st = this.state;
    const p = this.player;
    st.stats.deaths++;
    // Embers are left where you fell; an older remnant is lost
    st.remnant = st.player.embers > 0 ? { x: p.pos.x, y: p.pos.y, z: p.pos.z, embers: st.player.embers } : null;
    st.player.embers = 0;
    this.audio.play('death');
    this.vibrate(400);
    this.mode = 'dead';
    this.activeBoss = null;
    const reasons = st.player.dread >= 99 ? 'Dread took you.' : 'The Gloam claims another.';
    document.getElementById('death-sub').textContent = `${reasons} ${st.remnant ? `Your ${st.remnant.embers} embers lie where you fell.` : ''}`;
    setTimeout(() => this.ui.open('death'), 1400);
  }

  respawn() {
    const st = this.state;
    this.ui.close('death');
    this.ui.fade(true);
    setTimeout(async () => {
      const loc = this.gen.locations.find((l) => l.id === st.shrine) || this.gen.spawn;
      const a = loc.rot;
      const x = loc.x + Math.sin(a) * 3.5, z = loc.z + Math.cos(a) * 3.5;
      this.player.teleport(x, this.gen.height(x, z) + 2, z);
      let pending = 1;
      while (pending > 0) { pending = this.chunks.update(x, z, 40); await nextFrame(); }
      this.locations.update(x, z, 0, 0, this.chunks.viewChunks * WORLD.CHUNK);
      this.player.teleport(x, this.gen.height(x, z) + 1.3, z);
      const p = this.player;
      p.dead = false;
      p.action = 'none';
      p.facing = a + Math.PI;
      this.cameraYaw = p.facing;
      const s = st.player;
      s.hp = p.maxHp; s.stamina = p.maxStamina; s.flasks = s.flaskMax; s.dread = 0;
      this.respawnEnemies();
      this.ui.fade(false);
      this.enterPlay();
      this.save();
    }, 700);
  }

  _remnant() {
    const r = this.state.remnant;
    if (!r) { if (this.remnantMesh) { this.scene.remove(this.remnantMesh); this.remnantMesh = null; } return; }
    if (!this.remnantMesh) {
      this.remnantMesh = makeFireMesh(0.5);
      this.remnantMesh.traverse((o) => { if (o.material && o.material.color) { o.material = o.material.clone(); o.material.color.set(0xd05050); } });
      this.scene.add(this.remnantMesh);
    }
    this.remnantMesh.position.set(r.x, this.gen.height(r.x, r.z) + 0.2, r.z);
    animateFire(this.remnantMesh, performance.now() / 1000);
    if (dist2(this.player.pos.x, this.player.pos.z, r.x, r.z) < 2.2 && !this.player.dead) {
      this.state.player.embers += r.embers;
      this.ui.toast(`You reclaim ${r.embers} embers.`);
      this.audio.play('ember');
      this.state.remnant = null;
    }
  }

  onEnemyKilled(e) {
    const st = this.state;
    st.stats.kills++;
    const embers = Math.round(e.embers * (this.player.charm === 'miser_coin' ? 1.25 : 1));
    st.player.embers += embers;
    this.fx.burst(e.pos.x, e.pos.y, e.pos.z, 0xe0803c, 12, 2);
    this.audio.play('ember', e.pos);
    for (const [id, p] of e.def.drops || []) if (Math.random() < p) this.giveItem(id, 1, true);
    if (e.isBoss) {
      st.bosses.add(e.locId);
      st.stats.bossKills++;
      this.activeBoss = null;
      const drops = this.enemies.bossDrops(e.bossDef.name);
      const give = drops.find((d) => !this.hasItem(d)) || drops[0];
      if (give) this.giveItem(give, 1);
      this.giveItem('ember_shard', 2);
      this.ui.banner('Guardian felled', e.name.split(',')[0], true);
      this.audio.play('beacon');
      this.save();
      setTimeout(() => this.mode === 'play' && this.ui.toast('Its beacon can be lit now.'), 4500);
    }
  }

  onBossAggro(e) {
    if (this.activeBoss !== e) {
      this.activeBoss = e;
      this.ui.toast(e.name, 2.5);
    }
  }
  onBossReset(e) {
    if (this.activeBoss === e) this.activeBoss = null;
  }

  addCorpse(c) {
    this.corpses.push(c);
    this.physics.dynamic.add(c);
    if (this.corpses.length > 14) {
      const old = this.corpses.shift();
      this._removeCorpse(old);
    }
  }
  _removeCorpse(c) {
    this.scene.remove(c.mesh);
    this.physics.dynamic.delete(c);
    this.physics.removeBody(c.body);
  }
  _updateCorpses(dt) {
    for (const c of [...this.corpses]) {
      c.t += dt;
      if (c.t > c.life - 1.5) c.mesh.scale.setScalar(Math.max(0.01, (c.life - c.t) / 1.5));
      if (c.t > c.life) {
        this._removeCorpse(c);
        this.corpses.splice(this.corpses.indexOf(c), 1);
      }
    }
  }

  // ---------- explosions & projectiles ----------
  explode(x, y, z, r, dmg, source) {
    this.fx.burst(x, y + 0.5, z, 0xff7a26, 50, 7);
    this.fx.burst(x, y + 0.5, z, 0x3a302a, 20, 4);
    this.fx.ring(x, y, z, r, 0xff7a26);
    this.audio.play('explode', { x, z });
    const pd = dist2(x, z, this.player.pos.x, this.player.pos.z);
    this.shake(clamp(1.2 - pd / 20, 0.1, 0.8));
    if (pd < r) this.player.hurt(dmg * 0.5 * (1 - pd / r), { x, z }, 'hit');
    for (const e of [...this.enemies.list]) {
      const d = dist2(x, z, e.pos.x, e.pos.z);
      if (d < r + e.radius) {
        const k = 1 - d / (r + e.radius);
        const dx = (e.pos.x - x) / (d || 1), dz = (e.pos.z - z) / (d || 1);
        e.damage(dmg * (0.4 + 0.6 * k), dx, dz, 3, 'burn');
      }
    }
    this.explodeImpulse(x, y, z, r * 1.4, 14, source);
  }

  explodeImpulse(x, y, z, r, strength) {
    const filter = groups(0xffff, G.PROP | G.DEBRIS);
    const found = [];
    // Collect first: mutating bodies inside a Rapier query callback is not allowed
    this.physics.overlapSphere({ x, y, z }, r, filter, (col) => { found.push(col); return true; });
    const hitProps = [];
    for (const col of found) {
      const b = col.parent();
      if (!b || !b.isDynamic()) continue;
      const t = b.translation();
      const dx = t.x - x, dy = t.y - y + 0.5, dz = t.z - z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const k = (1 - Math.min(1, d / r)) * strength * b.mass();
      b.applyImpulse({ x: (dx / d) * k, y: (dy / d) * k + k * 0.4, z: (dz / d) * k }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * k * 0.2, y: 0, z: (Math.random() - 0.5) * k * 0.2 }, true);
      const info = this.physics.info.get(col.handle);
      if (info && info.kind === 'prop' && info.prop.kind === 'pitch') hitProps.push(info.prop);
    }
    // Chain reaction on pitch barrels
    for (const p of hitProps) setTimeout(() => this.locations.damageProp(p, 99, { x: 0, z: 0 }, 'chain'), 120 + Math.random() * 200);
  }

  throwFirebomb(pos, yaw, pitch) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sx = pos.x + fx * 0.6, sy = pos.y + 1.1, sz = pos.z + fz * 0.6;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(sx, sy, sz).setCcdEnabled(true));
    this.physics.world.createCollider(R.ColliderDesc.ball(0.15).setDensity(2).setRestitution(0.3).setCollisionGroups(GROUPS.projectile), body);
    const up = 5 + clamp(-pitch + 0.3, -0.3, 0.8) * 6;
    body.setLinvel({ x: fx * 15, y: up, z: fz * 15 }, true);
    body.setAngvel({ x: 8, y: 0, z: 3 }, true);
    const mesh = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
    const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    fuse.position.y = 0.15;
    mesh.add(ball, fuse);
    this.scene.add(mesh);
    const b = { body, mesh, t: 0 };
    this.bombs.push(b);
    this.physics.dynamic.add(b);
    this.audio.play('swing');
  }

  _updateBombs(h) {
    for (const b of [...this.bombs]) {
      b.t += h;
      const t = b.body.translation();
      const v = b.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      let boom = b.t > 3;
      if (b.t > 0.12 && (speed < b.lastSpeed * 0.6 || t.y < this.gen.height(t.x, t.z) + 0.25)) boom = true;
      for (const e of this.enemies.list) if (dist2(t.x, t.z, e.pos.x, e.pos.z) < e.radius + 0.5 && Math.abs(t.y - e.pos.y) < 1.5) boom = true;
      b.lastSpeed = speed;
      if (Math.random() < 0.5) this.fx.burst(t.x, t.y + 0.15, t.z, 0xffa040, 1, 0.5);
      if (boom) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        this.physics.dynamic.delete(b);
        this.scene.remove(b.mesh);
        this.physics.removeBody(b.body);
        this.explode(t.x, t.y, t.z, 4.2, 60, 'player');
      }
    }
  }

  enemyProjectile(pos, angle, dmg) {
    const mesh = makeFireMesh(0.5);
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.projectiles.push({ x: pos.x, y: pos.y + 1.2, z: pos.z, vx: Math.sin(angle) * 11, vz: Math.cos(angle) * 11, life: 3, dmg, mesh });
  }

  _updateProjectiles(h) {
    const p = this.player.pos;
    for (const pr of [...this.projectiles]) {
      pr.life -= h;
      // light homing
      const dx = p.x - pr.x, dz = p.z - pr.z;
      const d = Math.hypot(dx, dz) || 1;
      pr.vx += (dx / d) * 6 * h; pr.vz += (dz / d) * 6 * h;
      const sp = Math.hypot(pr.vx, pr.vz);
      pr.vx *= 11 / sp; pr.vz *= 11 / sp;
      pr.x += pr.vx * h; pr.z += pr.vz * h;
      pr.y += (p.y + 0.3 - pr.y) * h * 2;
      pr.mesh.position.set(pr.x, pr.y, pr.z);
      animateFire(pr.mesh, performance.now() / 1000);
      let done = pr.life <= 0 || pr.y < this.gen.height(pr.x, pr.z);
      if (Math.hypot(p.x - pr.x, p.z - pr.z) < 0.9 && Math.abs(p.y - pr.y) < 1.6) {
        this.player.hurt(pr.dmg, { x: pr.x, z: pr.z });
        done = true;
      }
      if (done) {
        this.fx.burst(pr.x, pr.y, pr.z, 0xff7a26, 12, 3);
        this.scene.remove(pr.mesh);
        this.projectiles.splice(this.projectiles.indexOf(pr), 1);
      }
    }
  }

  // ---------- menus ----------
  pause() {
    if (this.mode === 'play') this.mode = 'paused';
    this.input.clearAll();
  }
  resume() {
    if (this.ui.stack.length) return;
    this.mode = 'play';
    this.input.clearAll();
    this.last = performance.now();
  }
  openMenu(tab, craftOnly = false) {
    if (this.mode !== 'play' && this.mode !== 'paused') return;
    this.pause();
    this.ui.open('menu');
    this.ui.menuTab(tab);
    void craftOnly;
  }
  closeMenu() {
    this.ui.close('menu');
    this.resume();
  }
  back() {
    const top = this.ui.top();
    if (!top || top === 'title') return;
    if (top === 'shrine') { this.leaveShrine(); return; }
    if (top === 'death' || top === 'loading') return;
    this.ui.close(top);
    if (this.mode === 'paused') this.resume();
  }

  save() {
    if (!this.state || !this.player) return;
    const s = this.state.player;
    const p = this.player;
    if (!p.dead) {
      s.x = p.pos.x; s.y = p.pos.y; s.z = p.pos.z; s.facing = p.facing;
    }
    this.state.harvested = [...this.chunks.harvested];
    this.state.time = this.sky.time;
    saveGame(this.state);
  }

  saveAndQuit() {
    this.save();
    this.ui.closeAll();
    this.ui.hud.hidden = true;
    this.mode = 'title';
    this.player.root.visible = false;
    this.enemies.clear();
    this.activeBoss = null;
    this.ui.refreshTitle();
    document.getElementById('title').hidden = false;
    this.ui.stack = ['title'];
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot-error');
  el.hidden = false;
  el.textContent = `Gloamreach could not start: ${err && err.message ? err.message : err}. Your browser may not support WebGL or WebAssembly.`;
});
window.__game = game;
