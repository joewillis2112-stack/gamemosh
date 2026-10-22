// Claude Studio's editor: a place drawn exactly as the player draws it (same
// renderer, lighting, sky), with physics paused, and Roblox Studio's tools on
// top: Explorer, Properties, select/move/rotate/scale, insert, delete,
// duplicate, group, undo/redo. Its structure follows ArtCraft's scene editor
// (ARTCRAFT.md): one command registry, one undo history, one controller each
// for camera, gizmos and selection.
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import '@babylonjs/core/Culling/ray.js';
import HavokPhysics from '@babylonjs/havok';
import { createRenderer, createSkybox } from './render.js';
import { DataModel, baseplateLighting, isA, V3, C3 } from './datamodel.js';
import { savePlace, loadPlace } from './placefile.js';
import { startLuau } from './luau.js';
import createLuau from './luau.mjs';
import { World } from './runtime/world.js';
import { LocalLights } from './runtime/locallights.js';
import { LightingController } from './runtime/lighting.js';
import { Sky } from './runtime/sky.js';
import { Commands, allParts, centre } from './editor/commands.js';
import { EditorCamera } from './editor/camera.js';
import { Gizmos } from './editor/gizmos.js';
import { Explorer, Properties } from './editor/panels.js';
import { ModalTransform } from './editor/modal.js';
import { EditMode, MESH_OPS } from './editor/editmode.js';
import { AnimateMode } from './editor/animate.js';
import { TerrainTools } from './editor/terrain.js';
import { PaintTools } from './editor/paint.js';
import { Rigs } from './runtime/rigs.js';
import { newMeshPart } from './modeling/editable.js';
import { CF } from './cframe.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const quality = q.get('quality') || 'high';
const R = createRenderer(canvas, { quality, preserveDrawingBuffer: !!q.get('test'), dynamicSky: true });
const { scene, engine } = R;

async function main() {
  const havok = await HavokPhysics({ locateFile: () => '../build/web/HavokPhysics.wasm' });
  scene.enablePhysics(new Vector3(0, -196.2, 0), new HavokPlugin(true, havok));
  scene.physicsEnabled = false; // edit mode: nothing falls until Play

  const dm = new DataModel();
  const vm = await startLuau(createLuau, dm, (s, lvl) => (lvl === 2 ? console.error : console.log)('[luau] ' + s), { runScripts: false }); // edit mode: Scripts don't run
  const world = new World(scene, dm, R.shadows);
  // The place: a Luau script that builds it (run once, as its starting content), or a
  // place file (.json, or 'session': the one handed over by Open or by Play's Stop).
  const placeSrc = q.get('place') || '../places/baseplate.luau';
  if (placeSrc === 'session' || placeSrc.endsWith('.json')) {
    const file = placeSrc === 'session' ? JSON.parse(sessionStorage.getItem('studio.place') || 'null') : await (await fetch(placeSrc)).json();
    for (const w of loadPlace(dm, file)) console.warn(w);
  } else {
    baseplateLighting(dm);
    vm.run('place', await (await fetch(placeSrc)).text());
  }

  const rigs = new Rigs(scene, dm, R.shadows); // Models with a Humanoid draw as characters
  await rigs.load();
  const camera = new EditorCamera(scene, canvas);
  scene.activeCamera = camera.cam;
  R.attachCamera(camera.cam);
  const sky = new Sky(scene, '../assets/sky/sky_1k_nosun.hdr', { quality });
  sky.attach(createSkybox(scene, sky.env));
  const lighting = new LightingController(R, scene, dm, camera.cam, sky, quality);
  lighting.update();
  const localLights = new LocalLights(scene, dm, world, { quality, sunShadows: R.shadows });
  localLights.update();
  await lighting.settled();

  const commands = new Commands(dm, { view: () => { const f = camera.forward(); return { origin: camera.pos, dir: f }; } });
  const gizmos = new Gizmos(scene, dm, commands, camera);
  const hint = document.getElementById('hint');
  const modal = new ModalTransform(dm, commands, camera, canvas, text => { hint.textContent = text; hint.hidden = !text; });
  // Edit Mode (Tab): the modeling kernel's mesh editing on a MeshPart.
  const editBar = document.getElementById('editbar'), lastOp = document.getElementById('lastop');
  const edit = new EditMode({ scene, dm, commands, camera, world, layer: gizmos.layer, canvas, onState: s => {
    document.body.classList.toggle('editing', s.active);
    gizmos.hidden = s.active; gizmos.refresh();
    if (s.hint !== undefined) { hint.textContent = s.hint; hint.hidden = !s.hint; } else if (!s.active || !edit.modal) hint.hidden = true;
    editBar.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
    // The last operation's amounts, adjustable (Blender's "adjust last operation").
    const L = s.active && edit.last;
    lastOp.hidden = !L || !Object.keys(L.params).filter(k => typeof L.params[k] === 'number').length;
    if (L) lastOp.innerHTML = `<b>${L.name}</b> ` + Object.entries(L.params).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<label>${k} <input type="number" step="${k === 'segments' || k === 'cuts' ? 1 : 0.1}" data-p="${k}" value="${v}"></label>`).join(' ') + `<span class="st">${L.status}</span>`;
  } });
  modal.blocked = () => edit.active;
  editBar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) edit.setMode(b.dataset.mode); else if (b.dataset.op) edit.op(b.dataset.op); else if (b.dataset.done !== undefined) edit.exit();
  });
  lastOp.addEventListener('change', e => { const k = e.target.dataset.p, v = parseFloat(e.target.value); if (k && isFinite(v)) edit.adjust({ [k]: v }); });
  commands.register('editMesh', function () { return edit.enter(); });
  commands.register('insertMesh', function ({ kind = 'cube' } = {}) {
    const f = camera.forward(), at = camera.pos.add(f.scale(12));
    const mp = this.history.run('Insert ' + kind, tx => newMeshPart(tx, dm.workspace, kind, new CF([Math.round(at.x), Math.max(1, Math.round(at.y)), Math.round(at.z), 1, 0, 0, 0, 1, 0, 0, 0, 1]), { size: 4, radius: 2, height: 4, radius2: 0.6 }));
    this.selection.set([mp]);
    return mp;
  });
  // Animate: Roblox's Animation Editor on a rig (web/editor/animate.js).
  const anim = new AnimateMode({ scene, dm, commands, camera, rigs, layer: gizmos.layer, canvas, panel: document.getElementById('animpanel'), onState: s => {
    if (document.body.classList.contains('animating') !== s.active) { document.body.classList.toggle('animating', s.active); engine.resize(); } // the view ends above the timeline
    gizmos.hidden = s.active || edit.active; gizmos.refresh();
    document.querySelector('#ui [data-act=animate]').classList.toggle('on', s.active);
  } });
  commands.register('insertRig', function () {
    // A dummy as Roblox's Rig Builder makes one: a Model with a Humanoid (and its
    // Animator) and an invisible HumanoidRootPart 3 studs above the floor.
    const f = camera.forward(), at = camera.pos.add(f.scale(12));
    const hit = dm.raycast(new V3(at.x, at.y + 50, at.z), new V3(0, -1000, 0));
    const floor = hit.length ? hit[1].y : 0;
    const rig = this.history.run('Insert Rig', tx => {
      const m = tx.create('Model', null, { Name: 'Rig' });
      const hum = tx.create('Humanoid', m); tx.create('Animator', hum);
      const root = tx.create('Part', m, { Name: 'HumanoidRootPart', Size: new V3(2, 2, 1), Transparency: 1, Anchored: true, CanCollide: false });
      tx.set(root, 'CFrame', new CF([Math.round(at.x), floor + 3, Math.round(at.z), 1, 0, 0, 0, 1, 0, 0, 0, 1]));
      tx.set(m, 'PrimaryPart', root);
      tx.parent(m, dm.workspace);
      return m;
    });
    this.selection.set([rig]);
    return rig;
  });
  // Terrain: Studio's Terrain Editor brushes (web/editor/terrain.js).
  const terrainTools = new TerrainTools({ scene, dm, commands, camera, layer: gizmos.layer, canvas, bar: document.getElementById('terrainbar'), onState: s => {
    document.body.classList.toggle('terraining', s.active);
    document.querySelector('#ui [data-act=terrain]').classList.toggle('on', s.active);
  } });
  // Paint: brushes on the model, into a MeshPart's texture or a Decal on a part's face (web/editor/paint.js).
  const paintTools = new PaintTools({ scene, dm, world, commands, camera, canvas, bar: document.getElementById('paintbar'), onState: s => {
    document.body.classList.toggle('painting', s.active);
    document.querySelector('#ui [data-act=paint]').classList.toggle('on', s.active);
  } });
  camera.busy = () => gizmos.dragging || modal.active || !!edit.modal || !!edit.dragging || !!anim.drag || terrainTools.painting || paintTools.painting;
  // The point under a screen position (for orbiting and the wheel).
  const pickPoint = (x, y) => { const h = scene.pick(x, y, m => !!(m.metadata && m.metadata.instance) && m.isVisible, false, camera.cam); return h && h.hit ? h.pickedPoint : null; };
  camera.pick = pickPoint;
  camera.frame = () => { const ps = allParts(commands.selection.items); if (!ps.length) return null; const c = centre(ps); let r = 1; for (const p of ps) r = Math.max(r, Math.hypot(p.props.CFrame.x - c.x, p.props.CFrame.y - c.y, p.props.CFrame.z - c.z) + Math.hypot(p.props.Size.x, p.props.Size.y, p.props.Size.z) / 2); return { centre: new Vector3(c.x, c.y, c.z), radius: r }; };

  // Clicking selects what's under the pointer: its Model (the topmost under
  // Workspace) as in Studio, or the part itself with Alt. Locked parts can't be clicked.
  const instanceAt = (x, y, alt) => {
    // Babylon's pick takes CSS pixels (it applies the hardware scaling itself).
    if (gizmos.layer.utilityLayerScene.pick(x, y, null, false, camera.cam)?.hit) return undefined; // on a handle: not a selection click
    const h = scene.pick(x, y, m => !!(m.metadata && m.metadata.instance) && m.isVisible && !m.metadata.instance.props.Locked, false, camera.cam);
    let inst = h && h.hit ? h.pickedMesh.metadata.instance : null;
    if (inst && inst.ClassName === 'Terrain') inst = null; // as in Studio, a click on terrain selects nothing
    if (inst && !alt) { let top = null; for (let a = inst.parent; a && a !== dm.workspace; a = a.parent) if (a.ClassName === 'Model') top = a; if (top) inst = top; }
    return inst;
  };
  const downs = new Map();
  canvas.addEventListener('pointerdown', e => downs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, n: downs.size + 1 }));
  canvas.addEventListener('pointerup', e => {
    const d = downs.get(e.pointerId); downs.delete(e.pointerId);
    if (!d || d.button !== 0 || d.n > 1 || gizmos.dragging || edit.dragging || anim.drag || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (anim.active) { const r = canvas.getBoundingClientRect(); anim.click(e.clientX - r.left, e.clientY - r.top); return; }
    if (terrainTools.active || paintTools.active) return; // a click paints, it doesn't select
    if (edit.active) { const r = canvas.getBoundingClientRect(); if (!gizmos.layer.utilityLayerScene.pick(e.clientX - r.left, e.clientY - r.top, m => edit.arrows && m.isPickable, false, camera.cam)?.hit) edit.click(e.clientX - r.left, e.clientY - r.top, e.shiftKey); return; }
    const r = canvas.getBoundingClientRect(), inst = instanceAt(e.clientX - r.left, e.clientY - r.top, e.altKey);
    if (inst === undefined) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (inst) commands.run('select', { items: [inst], add: true }); }
    else commands.run('select', { items: inst ? [inst] : [] });
  });

  // Toolbar and shortcuts (Studio's: Ctrl+1-4 tools, Ctrl+D, Ctrl+G, Ctrl+U, Delete, Ctrl+Z/Y, Ctrl+R/T).
  const ui = document.getElementById('ui');
  const setTool = t => { gizmos.setTool(t); ui.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); };
  const actions = {
    select: () => setTool('select'), move: () => setTool('move'), scale: () => setTool('scale'), rotate: () => setTool('rotate'),
    part: () => commands.run('insert', { className: 'Part' }), delete: () => commands.run('delete'), duplicate: () => commands.run('duplicate'),
    group: () => commands.run('group'), ungroup: () => commands.run('ungroup'), undo: () => commands.run('undo'), redo: () => commands.run('redo'),
    turn: () => commands.run('rotate', { axis: 'y', degrees: 90 }), tilt: () => commands.run('rotate', { axis: 'x', degrees: 90 }),
    focus: () => camera.focus(), panels: () => document.body.classList.toggle('panels'),
    editmesh: () => edit.active ? edit.exit() : edit.enter(),
    rig: () => commands.run('insertRig'), terrain: () => terrainTools.toggle(), paint: () => paintTools.toggle(), animate: () => anim.active ? anim.exit() : anim.enter(), mesh: () => { const k = document.getElementById('meshKind').value; commands.run('insertMesh', { kind: k }); },
    // Play: the place as it is now goes to the player; its Stop comes back to this (Studio's Play/Stop).
    play: () => { sessionStorage.setItem('studio.place', JSON.stringify(savePlace(dm))); const p = new URLSearchParams(q); p.set('place', 'session'); p.set('from', 'editor'); location.href = 'play.html?' + p; },
    save: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(savePlace(dm), null, 1)], { type: 'application/json' })); a.download = 'place.json'; a.click(); URL.revokeObjectURL(a.href); },
    open: () => document.getElementById('openFile').click(),
  };
  document.getElementById('openFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const file = JSON.parse(await f.text());
    loadPlace(new DataModel(), file); // refuses a file that isn't a place before anything changes
    sessionStorage.setItem('studio.place', JSON.stringify(file));
    const p = new URLSearchParams(q); p.set('place', 'session'); location.href = 'editor.html?' + p;
  });
  ui.addEventListener('click', e => { const b = e.target.closest('[data-act],[data-tool]'); if (b) actions[b.dataset.act || b.dataset.tool](); });
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const map = c ? { '1': 'select', '2': 'move', '3': 'scale', '4': 'rotate', d: 'duplicate', g: 'group', u: 'ungroup', z: e.shiftKey ? 'redo' : 'undo', y: 'redo', r: 'turn', t: 'tilt' } : { delete: 'delete', backspace: 'delete' };
    if (map[k]) { e.preventDefault(); actions[map[k]](); }
  });
  const histUi = s => { ui.querySelector('[data-act=undo]').disabled = !s.canUndo; ui.querySelector('[data-act=redo]').disabled = !s.canRedo; };
  commands.history.onChange = histUi; histUi({ canUndo: false, canRedo: false });

  const explorer = new Explorer(document.getElementById('explorer'), dm, commands);
  const properties = new Properties(document.getElementById('properties'), dm, commands);
  const fixed = !!q.get('test');
  const step = dt => { camera.update(dt); anim.update(dt); rigs.update(dt); anim.afterPose(); lighting.update(); localLights.update(); explorer.update(); properties.update(); };
  scene.onBeforeRenderObservable.add(() => step(fixed ? 1 / 60 : Math.min(engine.getDeltaTime() / 1000, 0.05)));
  await scene.whenReadyAsync();
  setTool('select');
  window.editor = {
    dm, vm, world, scene, R, camera, commands, gizmos, explorer, properties, lighting, setTool, instanceAt, actions, modal, edit, anim, rigs, terrainTools, paintTools, V3, C3, CF, ready: true,
    frames(n) { for (let i = 0; i < n; i++) scene.render(); },
  };
  if (!fixed) engine.runRenderLoop(() => scene.render());
  addEventListener('resize', () => engine.resize());
}
main().catch(e => { console.error(e); window.editor = { error: String(e && e.stack || e) }; });
