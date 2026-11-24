// The character maker's body panel (web/maker.html): an R15 body's shape (runtime/bodygen.js) from
// presets and sliders, previewed walking with Roblox's own R15 clips, and handed to the game (play.html
// ?body=session reads the parameters from sessionStorage 'studio.body'). The shape is ours to set: the
// presets are starting points, not a look to keep (the user, 2026-11-24).
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/index.js';
import { createRenderer, groundDisc } from '../render.js';
import { bodyGlb, makeBody, BODY_PRESETS } from './bodygen.js';
import { r15Rig, loadR15Clips, addR15Clips } from './r15clips.js';
import { Animator } from './character.js';

// The sliders: parameter, label, min, max, step.
export const SLIDERS = [
  ['legLength', 'Legs', 0.8, 4, 0.05], ['torsoLength', 'Torso', 0.9, 3, 0.05], ['armLength', 'Arms', 0.9, 3.2, 0.05],
  ['shoulderWidth', 'Shoulders', 1.0, 3, 0.05], ['hipWidth', 'Hips', 0.7, 2, 0.05], ['headHeight', 'Head height', 0.6, 2.4, 0.05],
  ['headWidth', 'Head width', 0.6, 2.4, 0.05], ['armThickness', 'Arm thickness', 0.3, 1.2, 0.05], ['legThickness', 'Leg thickness', 0.3, 1.2, 0.05],
  ['roundness', 'Roundness', 0, 1, 0.05], ['taper', 'Taper', 0, 0.4, 0.02],
];

export class BodyPanel {
  /** root: the panel element (it fills it); canvas: the preview's. */
  constructor(root, canvas) {
    Object.assign(this, { root, canvas });
    this.params = { ...BODY_PRESETS.studio };
    this.preset = 'studio';
    this.ready = 0; // bumped each time a body is shown (tests wait on it)
    root.insertAdjacentHTML('beforeend', `<div class="row" data-presets>${Object.keys(BODY_PRESETS).map(n => `<button data-preset="${n}">${n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>
      <div class="sliders">${SLIDERS.map(([k, label, min, max, step]) => `<label>${label}<input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}"><span data-v="${k}"></span></label>`).join('')}</div>
      <div class="row"><button class="primary" data-act="play">Play as this body</button><span data-info class="note"></span></div>`);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-preset]');
      if (b) { this.preset = b.dataset.preset; this.params = { ...BODY_PRESETS[this.preset] }; this.sync(); this.show(); }
      if (e.target.closest('[data-act=play]')) this.play();
    });
    root.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.p; if (!k) return;
      this.params[k] = +e.target.value; this.preset = null; this.sync(); this.queue();
    });
    // The preview: its own renderer, a turning camera, the ground.
    this.R = createRenderer(canvas, { skyUrl: '../assets/sky/sky_1k_nosun.hdr', preserveDrawingBuffer: true });
    const { scene, engine } = this.R;
    this.cam = new ArcRotateCamera('bodycam', -Math.PI / 2.4, Math.PI / 2.3, 11, new Vector3(0, 2.6, 0), scene);
    this.cam.attachControl(canvas, true); this.R.attachCamera(this.cam);
    groundDisc(scene, this.R.shadows, 6);
    this.clips = loadR15Clips();
    engine.runRenderLoop(() => { const dt = Math.min(engine.getDeltaTime() / 1000, 0.05); if (this.anim) this.anim.update(dt); scene.render(); });
    this.sync();
    this.show();
  }

  // The sliders and readouts from the parameters; the preset buttons' state.
  sync() {
    for (const i of this.root.querySelectorAll('[data-p]')) i.value = this.params[i.dataset.p];
    for (const s of this.root.querySelectorAll('[data-v]')) s.textContent = (+this.params[s.dataset.v]).toFixed(2);
    for (const b of this.root.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === this.preset);
    const b = makeBody(this.params);
    this.root.querySelector('[data-info]').textContent = `${b.height.toFixed(2)} studs tall`;
  }

  // Rebuild at most every 100 ms while a slider moves.
  queue() { clearTimeout(this.timer); this.timer = setTimeout(() => this.show(), 100); }

  /** Show the current body, walking. */
  async show() {
    const token = (this.token = {}), clips = await this.clips;
    const res = await SceneLoader.ImportMeshAsync('', '', new File([bodyGlb(this.params)], 'body.glb', { type: 'model/gltf-binary' }), this.R.scene, null, '.glb');
    if (token !== this.token) { res.meshes.slice().forEach(m => m.dispose(false, true)); res.transformNodes.forEach(n => n.dispose()); return; } // a newer one is on its way
    if (this.res) { this.res.meshes.slice().forEach(m => m.dispose(false, true)); this.res.transformNodes.forEach(n => n.dispose()); }
    this.res = res;
    res.meshes.forEach(m => { if (m.getTotalVertices() > 0) { this.R.shadows.addShadowCaster(m); m.receiveShadows = true; } });
    this.rig = r15Rig(res);
    this.anim = new Animator(res);
    addR15Clips(this.anim, this.rig, clips);
    this.anim.play('walk', 0);
    this.height = makeBody(this.params).height;
    this.cam.target.y = this.height / 2; this.cam.radius = Math.max(8, this.height * 2);
    this.ready++;
  }

  /** Into the game as this body. */
  play() {
    try { sessionStorage.setItem('studio.body', JSON.stringify(this.params)); } catch (e) { this.root.querySelector('[data-info]').textContent = 'could not hand the body to the game: ' + e.message; return; }
    location.href = 'play.html?body=session';
  }
}
