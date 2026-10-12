// Animate mode: Roblox's Animation Editor in the studio's editor, built the
// way ArtCraft builds its posing and timeline (FKHelper: a handle on each
// joint and a rotate gizmo in the joint's own axes; TimelineController: keys
// per object on a timeline, playback writing poses only while it plays or
// seeks). The keyframe strip is animation-timeline-control (MIT, vendored).
// The animation is Roblox's own data, in the place: a KeyframeSequence in
// ServerStorage.RBX_ANIMSAVES.<rig> (as Roblox's editor saves it), Keyframes
// at times, Poses nested by joint. Every edit is one undoable step.
// - With a rig selected (a Model with a Humanoid and a HumanoidRootPart),
//   Animate enters. A click or tap on a limb (or its handle) picks that joint;
//   turning the ring keys it at the playhead (auto-key, as Roblox's does).
// - The timeline: a row per joint, a diamond per key. Click the ruler to move
//   the playhead; drag keys to retime them; Delete removes the selected ones;
//   the easing menus set the selected keys' EasingStyle and EasingDirection.
// - Space plays and pauses (looping if the sequence loops); Esc or Done leaves.
import { Vector3, Quaternion, Color3 } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo.js';
import timelineModule from '../vendor/animation-timeline/animation-timeline.cjs';
import { compileSequence, sampleSequence, nodeToOffset, R6, R6_TREE } from '../animation.js';
import { rigParts } from '../runtime/rigs.js';
import { CF } from '../cframe.js';

const { Timeline } = timelineModule;
// The joints the editor poses, top to bottom as the rows show them. (The root
// is left out: our rig's root pivots at the feet, Roblox's at the hips.)
export const JOINTS = ['Torso', 'Head', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg'];
const JOINT_OF_NODE = Object.fromEntries(Object.entries(R6).map(([j, n]) => [n, j]));
const FPS = 30; // keys snap to 1/30 s
const SAME_TIME = 1e-4;
export const ROW_H = 24, HEADER_H = 30;

export class AnimateMode {
  constructor({ scene, dm, commands, camera, rigs, layer, canvas, panel, onState = () => {} }) {
    Object.assign(this, { scene, dm, commands, camera, rigs, layer, canvas, panel, onState });
    this.rig = null; this.joint = null; this.time = 0; this.playing = false; this.drag = null;
    const us = layer.utilityLayerScene;
    this.handleMat = new StandardMaterial('jointHandle', us); this.handleMat.emissiveColor = new Color3(1, 0.85, 0.2); this.handleMat.disableLighting = true;
    this.handleSel = new StandardMaterial('jointHandleSel', us); this.handleSel.emissiveColor = new Color3(0.1, 0.6, 1); this.handleSel.disableLighting = true;
    this.handles = new Map(); // joint -> sphere
    for (const j of JOINTS) { const s = MeshBuilder.CreateSphere('joint:' + j, { diameter: 0.45, segments: 8 }, us); s.material = this.handleMat; s.setEnabled(false); this.handles.set(j, s); }
    // The ring sits on a stand-in node at the joint, turned as the joint is (its local axes).
    this.proxy = new TransformNode('jointProxy', scene); this.proxy.rotationQuaternion = Quaternion.Identity();
    this.ring = new RotationGizmo(layer); this.ring.updateGizmoRotationToMatchAttachedMesh = true; this.ring.scaleRatio = 1.2;
    this.ring.snapDistance = 0; this.ring.attachedNode = null;
    this.ring.onDragStartObservable.add(() => { this.drag = { joint: this.joint }; });
    for (const a of ['xGizmo', 'yGizmo', 'zGizmo']) this.ring[a].dragBehavior.onDragObservable.add(() => this.follow());
    this.ring.onDragEndObservable.add(() => this.endDrag());
    rigs.preview = model => (model === this.rig ? this.pose() : null);
    // Undo and redo (or a script) changing the sequence: the strip follows.
    dm.watch(inst => { if (this.rig && this.seq && (inst === this.seq || isUnder(inst, this.seq)) && !this.building) this.rebuildSoon(); });
    this.buildPanel();
    this.attachInput();
  }
  get active() { return !!this.rig; }

  // ---- entering and leaving
  enter(target = this.commands.selection.primary) {
    const model = target && (rigParts(target) ? target : rigParts(target.parent) ? target.parent : null);
    if (!model) return false;
    this.rig = model; this.joint = null; this.time = 0; this.playing = false;
    this.seq = this.findSequence();
    this.panel.hidden = false;
    this.timeline.rescale(); this.rebuild();
    this.state();
    return true;
  }
  exit() {
    if (!this.rig) return;
    this.rig = null; this.joint = null; this.playing = false; this.ring.attachedNode = null;
    for (const h of this.handles.values()) h.setEnabled(false);
    this.panel.hidden = true;
    this.state();
  }
  state(extra = {}) { this.onState({ active: this.active, joint: this.joint, time: this.time, playing: this.playing, length: this.seq ? compileSequence(this.seq).length : 0, ...extra }); }

  // ---- the animation's place in the DataModel
  saves() { const ss = this.dm.service('ServerStorage'); return ss.children.find(c => c.props.Name === 'RBX_ANIMSAVES'); }
  findSequence() {
    const s = this.saves(), f = s && s.children.find(c => c.props.Name === this.rig.props.Name);
    return f ? f.children.find(c => c.ClassName === 'KeyframeSequence') || null : null;
  }
  // The sequence, made (inside the caller's transaction) the first time a key is set.
  ensureSequence(tx) {
    if (this.seq && this.seq.parent) return this.seq;
    const ss = this.dm.service('ServerStorage');
    const saves = this.saves() || tx.create('Folder', ss, { Name: 'RBX_ANIMSAVES' });
    const folder = saves.children.find(c => c.props.Name === this.rig.props.Name) || tx.create('Folder', saves, { Name: this.rig.props.Name });
    this.seq = tx.create('KeyframeSequence', folder, { Name: 'Animation', Loop: true });
    return this.seq;
  }

  // ---- what the rig shows: the sequence at the playhead, and a drag in progress
  pose() {
    const joints = this.seq && this.seq.parent ? sampleSequence(compileSequence(this.seq), this.time) : new Map();
    if (this.drag && this.drag.cf) joints.set(this.drag.joint, { cf: this.drag.cf, w: 1 });
    return joints;
  }
  view() { return this.rig && this.rigs.views.get(this.rig); }
  node(joint) { const v = this.view(); return v && v.anim.byName(R6[joint]); }

  // Each frame: playback, handles on the joints, the ring on the picked one.
  update(dt) {
    if (!this.rig) return;
    if (!this.rig.parent) return this.exit();
    if (this.playing) {
      const len = this.seq ? compileSequence(this.seq).length : 0;
      this.time += dt;
      if (len <= 0) this.time = 0;
      else if (this.time > len) { if (this.seq.props.Loop) this.time %= len; else { this.time = len; this.playing = false; this.state(); } }
      this.timeline.setTime(this.time * 1000);
      this.showTime();
    }
  }
  // After the rigs are posed (so handles sit on this frame's joints).
  afterPose() {
    if (!this.rig) return;
    for (const [j, h] of this.handles) {
      const n = this.node(j);
      h.setEnabled(!!n && !this.playing);
      if (n) { n.computeWorldMatrix(true); h.position.copyFrom(n.getAbsolutePosition()); h.material = j === this.joint ? this.handleSel : this.handleMat; }
    }
    if (this.joint && !this.drag && !this.playing) this.placeProxy();
    const want = this.joint && !this.playing ? this.proxy : null;
    if (this.ring.attachedNode !== want) this.ring.attachedNode = want;
  }
  placeProxy() {
    const n = this.node(this.joint); if (!n) return;
    n.computeWorldMatrix(true);
    const q = new Quaternion(), p = new Vector3();
    n.getWorldMatrix().decompose(undefined, q, p);
    this.proxy.position.copyFrom(p); this.proxy.rotationQuaternion.copyFrom(q);
    this.proxy.computeWorldMatrix(true);
  }

  // ---- picking a joint: its handle, or the limb itself (CSS px in the canvas)
  click(x, y) {
    const us = this.layer.utilityLayerScene, cam = this.camera.cam;
    if (us.pick(x, y, m => this.ring.attachedNode && m.isPickable && !m.name.startsWith('joint:'), false, cam)?.hit) return this.joint; // on the ring
    let h = us.pick(x, y, m => m.name.startsWith('joint:') && m.isEnabled(), false, cam);
    let joint = h && h.hit ? h.pickedMesh.name.slice(6) : null;
    if (!joint) {
      const v = this.view(), meshes = new Set(v ? v.meshes : []);
      h = this.scene.pick(x, y, m => meshes.has(m), false, cam);
      if (h && h.hit) for (let n = h.pickedMesh; n && !joint; n = n.parent) joint = JOINTS.includes(JOINT_OF_NODE[n.name]) ? JOINT_OF_NODE[n.name] : null;
    }
    this.select(joint);
    return joint;
  }
  select(joint) {
    this.joint = joint;
    if (joint) this.placeProxy();
    this.markRow(); this.state();
  }

  // ---- posing: the ring turns the joint; letting go keys it at the playhead
  follow() {
    if (!this.drag) return;
    const n = this.node(this.drag.joint), v = this.view();
    if (!n || !v) return;
    const parent = n.parent; parent.computeWorldMatrix(true);
    const pq = new Quaternion(); parent.getWorldMatrix().decompose(undefined, pq, undefined);
    const local = Quaternion.Inverse(pq).multiply(this.proxy.rotationQuaternion); // world = parent * local
    const rest = v.anim.rest.get(n).q, delta = Quaternion.Inverse(rest).multiply(local).normalize();
    this.drag.cf = nodeToOffset([0, 0, 0], [delta.x, delta.y, delta.z, delta.w]);
  }
  endDrag() {
    const d = this.drag; this.drag = null;
    if (d && d.cf) this.setKey(d.joint, this.time, d.cf);
  }

  /** Key `joint` at time t (s) to `cf` (one undoable step). */
  setKey(joint, t, cf) {
    t = snap(t);
    return this.edit('Pose ' + joint, tx => {
      const seq = this.ensureSequence(tx);
      const kf = keyframeAt(seq, t) || tx.create('Keyframe', seq, { Time: t });
      const pose = this.ensurePose(tx, kf, joint);
      tx.set(pose, 'CFrame', cf);
      if (pose.props.Weight === 0) tx.set(pose, 'Weight', 1);
    });
  }
  // The Pose for `joint` under a keyframe, with its parents' poses (weight 0 when not keyed), as Roblox nests them.
  ensurePose(tx, kf, joint) {
    const chain = []; for (let j = joint; j; j = R6_TREE[j]) chain.unshift(j);
    let at = kf;
    for (const j of chain) {
      let p = at.children.find(c => c.ClassName === 'Pose' && c.props.Name === j);
      if (!p) p = tx.create('Pose', at, { Name: j, Weight: j === joint ? 1 : 0 });
      at = p;
    }
    return at;
  }
  edit(label, fn) {
    this.building = true;
    try { return this.commands.history.run(label, fn); }
    finally { this.building = false; this.rebuild(); this.state(); }
  }

  // ---- keys as the timeline holds them
  keys() {
    const out = [];
    if (!this.seq || !this.seq.parent) return out;
    for (const kf of this.seq.children) if (kf.ClassName === 'Keyframe') {
      const walk = p => { for (const c of p.children) if (c.ClassName === 'Pose') { if (c.props.Weight > 0 && JOINTS.includes(c.props.Name)) out.push({ joint: c.props.Name, t: kf.props.Time, pose: c, kf }); walk(c); } };
      walk(kf);
    }
    return out;
  }
  /** Delete keys ({ pose } items; default the timeline's selection). Empty keyframes go too. */
  deleteKeys(list = this.selectedKeys()) {
    if (!list.length) return false;
    this.edit(list.length === 1 ? 'Delete key' : `Delete ${list.length} keys`, tx => this.removePoses(tx, list.map(k => k.pose)));
    return true;
  }
  removePoses(tx, poses) {
    // A pose with keyed poses under it stays, unkeyed (weight 0); others go.
    for (const pose of poses) { if (pose.children.some(c => c.ClassName === 'Pose')) tx.set(pose, 'Weight', 0); else tx.parent(pose, null); }
    // Then unkeyed poses with nothing under them, and keyframes with no keyed pose left.
    const prune = i => { for (const c of [...i.children]) if (c.ClassName === 'Pose') { prune(c); if (c.props.Weight === 0 && !c.children.some(d => d.ClassName === 'Pose')) tx.parent(c, null); } };
    for (const kf of [...this.seq.children]) if (kf.ClassName === 'Keyframe') { prune(kf); if (!hasKeyedPose(kf)) tx.parent(kf, null); }
  }
  /** Move keys to new times (s): [{ pose, t }]. */
  moveKeys(moves) {
    const real = moves.filter(m => Math.abs(snap(m.t) - keyTime(m.pose)) > SAME_TIME);
    if (!real.length) return false;
    this.edit(real.length === 1 ? 'Move key' : `Move ${real.length} keys`, tx => {
      const data = real.map(m => ({ joint: m.pose.props.Name, t: snap(Math.max(0, m.t)), cf: m.pose.props.CFrame, style: m.pose.props.EasingStyle, dir: m.pose.props.EasingDirection }));
      this.removePoses(tx, real.map(m => m.pose));
      for (const d of data) {
        const kf = keyframeAt(this.seq, d.t) || tx.create('Keyframe', this.seq, { Time: d.t });
        const pose = this.ensurePose(tx, kf, d.joint);
        tx.set(pose, 'CFrame', d.cf); tx.set(pose, 'Weight', 1); tx.set(pose, 'EasingStyle', d.style); tx.set(pose, 'EasingDirection', d.dir);
      }
    });
    return true;
  }
  setEasing(style, dir, list = this.selectedKeys()) {
    if (!list.length) return false;
    this.edit('Easing', tx => { for (const k of list) { if (style) tx.set(k.pose, 'EasingStyle', style); if (dir) tx.set(k.pose, 'EasingDirection', dir); } });
    return true;
  }
  setLoop(on) { if (this.seq && this.seq.parent) this.edit(on ? 'Loop' : 'No loop', tx => tx.set(this.seq, 'Loop', !!on)); }

  // ---- playback and the playhead
  seek(t) { this.time = Math.max(0, t); this.timeline.setTime(this.time * 1000); this.showTime(); this.state(); }
  play(on = !this.playing) { this.playing = on; if (on && this.seq) { const len = compileSequence(this.seq).length; if (this.time >= len) this.time = 0; } this.state(); }

  // ---- the panel: joint names beside the timeline control
  buildPanel() {
    const P = this.panel;
    P.innerHTML = `<div class="abar"><button data-a="play">Play</button><span class="atime">0.00 s</span><label><input type="checkbox" data-a="loop" checked> Loop</label><select data-a="style">${['Linear', 'Constant', 'CubicV2', 'Cubic', 'Elastic', 'Bounce'].map(s => `<option>${s}</option>`).join('')}</select><select data-a="dir">${['In', 'Out', 'InOut'].map(s => `<option>${s}</option>`).join('')}</select><button data-a="delete">Delete key</button><button data-a="done">Done</button></div><div class="abody"><div class="anames" style="padding-top:${HEADER_H}px">${JOINTS.map(j => `<div class="aname" data-j="${j}" style="height:${ROW_H}px">${j}</div>`).join('')}</div><div class="astrip"></div></div>`;
    this.timeEl = P.querySelector('.atime');
    const strip = P.querySelector('.astrip');
    this.timeline = new Timeline({ id: strip, headerHeight: HEADER_H, rowsStyle: { height: ROW_H, marginBottom: 0, fillColor: '#2b2d31' }, snapEnabled: true, snapStep: 1000 / FPS, stepVal: 500, stepPx: 80, leftMargin: 12, fillColor: '#1f2125', headerFillColor: '#2b2d31', labelsColor: '#9aa0a6', tickColor: '#5c6068', selectionColor: '#4aa3ff', timelineStyle: { strokeColor: '#4aa3ff', fillColor: '#4aa3ff', capStyle: { fillColor: '#4aa3ff' } } }, { rows: [] });
    // The control reads touches itself; the mouse events a browser makes up after
    // a tap would then count as a second click (a double click) and undo the tap's selection.
    strip.querySelector('canvas').addEventListener('touchend', e => e.cancelable && e.preventDefault(), { passive: false });
    this.timeline._formatUnitsText = v => (v / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
    this.timeline.onTimeChanged(e => { if (e.source === 'user') { this.time = Math.max(0, e.val / 1000); this.showTime(); this.state(); } });
    this.timeline.onDragFinished(() => this.applyDrag());
    this.timeline.onSelected(() => this.state());
    P.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'), n = e.target.closest('[data-j]');
      if (n) return this.select(n.dataset.j);
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'play') this.play(); else if (a === 'delete') this.deleteKeys(); else if (a === 'done') this.exit();
    });
    P.addEventListener('change', e => {
      const a = e.target.dataset.a;
      if (a === 'loop') this.setLoop(e.target.checked);
      if (a === 'style' || a === 'dir') this.setEasing(a === 'style' ? e.target.value : null, a === 'dir' ? e.target.value : null);
    });
  }
  showTime() { this.timeEl.textContent = this.time.toFixed(2) + ' s'; }
  markRow() { this.panel.querySelectorAll('[data-j]').forEach(n => n.classList.toggle('on', n.dataset.j === this.joint)); }
  rebuildSoon() { if (!this.pending) { this.pending = true; queueMicrotask(() => { this.pending = false; this.rebuild(); }); } }
  rebuild() {
    if (!this.rig) return;
    if (this.seq && !this.seq.parent) this.seq = this.findSequence(); // undone away
    const keys = this.keys(), selected = new Set((this.timeline.getModel()?.rows || []).flatMap(r => r.keyframes || []).filter(k => k.selected).map(k => k.pose));
    const rows = JOINTS.map(j => ({ joint: j, keyframes: keys.filter(k => k.joint === j).map(k => ({ val: Math.round(k.t * 1000), pose: k.pose, selected: selected.has(k.pose) })) }));
    this.timeline.setModel({ rows });
    this.timeline.setTime(this.time * 1000);
    const loop = this.panel.querySelector('[data-a=loop]'); loop.checked = this.seq ? this.seq.props.Loop : true;
    this.markRow(); this.showTime();
  }
  selectedKeys() {
    const ks = (this.timeline.getModel()?.rows || []).flatMap(r => r.keyframes || []).filter(k => k.selected && k.pose && k.pose.parent);
    return ks.map(k => ({ pose: k.pose, t: k.val / 1000 }));
  }
  applyDrag() {
    const moves = (this.timeline.getModel()?.rows || []).flatMap(r => r.keyframes || []).filter(k => k.pose && k.pose.parent && Math.abs(k.val / 1000 - keyTime(k.pose)) > SAME_TIME).map(k => ({ pose: k.pose, t: k.val / 1000 }));
    if (!this.moveKeys(moves)) this.rebuild();
  }

  attachInput() {
    addEventListener('keydown', e => {
      if (!this.active || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || this.camera.flying()) return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.code === 'Space') { stop(); return this.play(); }
      if (e.code === 'Escape') { stop(); return this.exit(); }
      if ((e.code === 'Delete' || e.code === 'Backspace' || e.code === 'KeyX') && !e.ctrlKey) { stop(); return this.deleteKeys(); }
    }, true);
  }
}

const snap = t => Math.round(t * FPS) / FPS;
const keyTime = pose => { let k = pose; while (k && k.ClassName !== 'Keyframe') k = k.parent; return k ? k.props.Time : NaN; };
function keyframeAt(seq, t) { return seq.children.find(c => c.ClassName === 'Keyframe' && Math.abs(c.props.Time - t) < SAME_TIME) || null; }
function hasKeyedPose(i) { return i.children.some(c => c.ClassName === 'Pose' && (c.props.Weight > 0 || hasKeyedPose(c))); }
function isUnder(i, root) { for (let p = i.parent; p; p = p.parent) if (p === root) return true; return false; }
