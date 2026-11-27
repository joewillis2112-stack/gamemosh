// Play a place: the shared look, Havok physics, the DataModel drawn by World,
// the place's scripts in Luau, and the player: character, camera, controls.
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import HavokPhysics from '@babylonjs/havok';
import { createRenderer, createSkybox } from './render.js';
import { DataModel, baseplateLighting, C3, V3, endWalk, checkPaths } from './datamodel.js';
import { walkStep } from './runtime/walk.js';
import { Npcs } from './runtime/npcs.js';
import { loadPlace } from './placefile.js';
import { startLuau } from './luau.js';
import { Output } from './runtime/output.js';
import createLuau from './luau.mjs';
import { World } from './runtime/world.js';
import { LocalLights } from './runtime/locallights.js';
import { Particles } from './runtime/particles.js';
import { Highlights } from './runtime/highlights.js';
import { Styles } from './runtime/styles.js';
import { Character } from './runtime/character.js';
import { FollowCamera, CameraSync } from './runtime/camera.js';
import { Controls } from './runtime/controls.js';
import { Players } from './runtime/players.js';
import { BODY_PRESETS, describedBody, bodyColors, bodyFile as makeBodyFile } from './runtime/bodygen.js';
import { Rigs } from './runtime/rigs.js';
import { animatedJoints } from './animation.js';
import { Gui } from './runtime/gui.js';
import { Surfaces } from './runtime/surfaces.js';
import { LightingController } from './runtime/lighting.js';
import { Graphics } from './runtime/graphics.js';
import { Menu } from './runtime/menu.js';
import { Sky } from './runtime/sky.js';
import { Audio } from './runtime/audio.js';
import { CharacterSounds } from './runtime/charsounds.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
// The tier: the page's ?quality= if given (tests), else the player's graphics setting (runtime/graphics.js).
const R = createRenderer(canvas, { quality: q.get('quality') || 'high', preserveDrawingBuffer: !!q.get('test'), dynamicSky: true });
const { scene, engine } = R;

const GRAVITY = 196.2; // studs/s², Roblox's default

async function main() {
  const havok = await HavokPhysics({ locateFile: () => '../build/web/HavokPhysics.wasm' });
  scene.enablePhysics(new Vector3(0, -GRAVITY, 0), new HavokPlugin(true, havok));
  // Havok caps speed at 200 per second (a part falling from 100 studs reached it, and the cap shrank its sideways speed
  // too); Roblox has no such cap. Ours: high enough that nothing in a place meets it.
  scene.getPhysicsEngine().getPhysicsPlugin().setVelocityLimits(10000, 1000);

  const dm = new DataModel();
  const graphics = new Graphics(R, dm, q.get('quality'));
  const quality = graphics.tier;
  // Played from the editor: Studio's Output window shows every print, warn and error.
  const output = q.get('from') === 'editor' ? new Output() : null;
  const log = (s, lvl) => { (lvl === 2 ? console.error : console.log)('[luau] ' + s); if (output) output.add(s, lvl); };
  const vm = await startLuau(createLuau, dm, log);
  const world = new World(scene, dm, R.shadows, { quality });
  // The place: a Luau script that builds it, or a place file (.json, or 'session':
  // the one the editor just handed over for Play).
  const placeSrc = q.get('place') || '../places/baseplate.luau';
  if (placeSrc === 'session' || placeSrc.endsWith('.json')) {
    const file = placeSrc === 'session' ? JSON.parse(sessionStorage.getItem('studio.place') || 'null') : await (await fetch(placeSrc)).json();
    for (const w of loadPlace(dm, file)) console.warn(w); // its Lighting children are in the file
  } else {
    baseplateLighting(dm); // a new place's Lighting children, before the place's scripts can change them
    vm.run('place', await (await fetch(placeSrc)).text());
  }

  // The player joins after the place's scripts (as in Roblox) and spawns on a SpawnLocation.
  // The character: the blocky default, or another rigged to its nodes (character maker stage 2).
  // 'session': the one the maker just handed over (a data URL in sessionStorage).
  let charSrc = q.get('character') || '../assets/characters/character-a.glb';
  if (charSrc === 'session') {
    const d = sessionStorage.getItem('studio.character');
    if (!d) throw new Error('no character was handed over');
    charSrc = new File([await (await fetch(d)).blob()], 'character.glb', { type: 'model/gltf-binary' });
  }
  // ?body=<preset> or ?body=<JSON of parameters>: an R15 body generated here (runtime/bodygen.js), its
  // shape adjustable, playing Roblox's R15 clips.
  let params = null;
  if (q.get('body')) {
    // (session: the parameters the character maker's body panel handed over.)
    const b = q.get('body') === 'session' ? sessionStorage.getItem('studio.body') || '{}' : q.get('body');
    params = b.trim().startsWith('{') ? JSON.parse(b) : (BODY_PRESETS[b] || BODY_PRESETS.studio);
  }
  // The place's body: a HumanoidDescription in StarterPlayer (datamodel.js, Bodies). Its BodyShape child
  // is the shape (else the player's ?body=, else our studio body); its scales and colours apply over it.
  const desc = dm.service('StarterPlayer').children.find(c => c.ClassName === 'HumanoidDescription');
  if (desc) { const shape = desc.children.find(c => c.ClassName === 'BodyShape'); params = describedBody(desc.props, shape && shape.props, params || BODY_PRESETS.studio); }
  // A generated body's file: its mesh detail from the fidelity tier (rounder, smoother parts on higher
  // tiers); on high and ultra one smooth skinned mesh (it bends at the joints), below a rigid mesh per part.
  let bodyTier = quality; // (the tier the body was last built for: Graphics' systems are told each change)
  const bodyFile = p => makeBodyFile(p, bodyTier);
  if (params) charSrc = bodyFile(params);
  const player = await Character.load(scene, charSrc, R.shadows, Vector3.Zero());
  if (params) { player.bodyParams = params; player.colors = bodyColors(params); }
  // A skin from the character maker: a URL, or 'session' for the one it just handed over.
  let skin = q.get('skin');
  if (skin === 'session') { try { skin = sessionStorage.getItem('studio.skin'); } catch (e) { skin = null; } }
  if (skin) await player.setSkin(skin);
  const players = new Players(dm, world, player, GRAVITY);
  // A generated body rebuilt where it stands (one at a time): its R15 parts and joints resized
  // (charbody.js reshape), its colours kept.
  let rebuilding = Promise.resolve();
  const rebody = p => (rebuilding = rebuilding.then(async () => {
    const r = await Character.loadRes(scene, bodyFile(p));
    player.setBody(r.res, r);
    player.bodyParams = p;
    if (players.body) players.body.reshape();
  }));
  // Humanoid:ApplyDescriptionAsync on the player's generated body: the description's BodyShape (else the
  // body's own shape), scales and colours. Only colours changed: recoloured in place (through BodyColors).
  dm.hooks.applyDescription = async (hum, desc) => {
    if (hum !== players.humanoid || !player.bodyParams) return; // (other bodies keep theirs: OURS)
    const shape = desc.children.find(c => c.ClassName === 'BodyShape');
    const next = describedBody(desc.props, shape && shape.props, player.bodyParams), { colors, ...form } = next, { colors: was, ...old } = player.bodyParams;
    if (JSON.stringify(form) !== JSON.stringify(old)) await rebody(next);
    if (hum !== players.humanoid || hum.destroyed) return; // respawned meanwhile
    const bc = players.body.bodyColors;
    for (const [g, c] of Object.entries(bodyColors(next))) if (bc && !bc.destroyed) dm.set(bc, g + 'Color3', new C3(...c)); else player.setColors({ [g]: c }); // (BodyColors recolours the body: players.js)
  };
  // A respawned character is the place's body again (Roblox loads it afresh; what was applied is gone).
  const spawnBody = params;
  players.beforeSpawn = () => {
    if (!spawnBody || player.bodyParams === spawnBody) return;
    const { colors: a, ...now } = player.bodyParams, { colors: b, ...was } = spawnBody;
    player.setColors(bodyColors(spawnBody)); // (before the new character's BodyColors are made from them)
    if (JSON.stringify(now) !== JSON.stringify(was)) rebody(spawnBody); else player.bodyParams = spawnBody;
  };
  // A tier change rebuilds a generated body at the new tier's detail.
  graphics.add({ setTier: t => { bodyTier = t; if (player.bodyParams) rebody(player.bodyParams); } });
  // How much Terrain water a point is in (runtime/character.js swims in it), for the player and NPCs.
  const waterAt = (x, y, z) => { const T = dm.workspace.children.find(c => c.ClassName === 'Terrain'); return T && T.voxels ? T.voxels.waterAt(x, y, z) : 0; };
  player.water = waterAt;
  // The camera's look vector (the player swims where it looks).
  player.look = () => { const c = dm.workspace.props.CurrentCamera, f = c && c.props.CFrame; return f ? [-f.m[5], -f.m[8], -f.m[11]] : null; };
  // The character's AnimationTracks (its Humanoid's Animator) pose it over its own clips.
  player.joints = () => { const h = players.humanoid, a = h && !h.destroyed && h.children.find(c => c.ClassName === 'Animator'); return a ? animatedJoints(a) : new Map(); };
  const rigs = new Rigs(scene, dm, R.shadows, { quality });
  graphics.add(rigs);
  const npcs = new Npcs({ scene, dm, world, shadows: R.shadows, gravity: GRAVITY, quality }); // rigs with unanchored roots walk
  npcs.water = waterAt;
  graphics.add(npcs);
  // Characters touch characters: the player's body and the NPCs' (runtime/humevents.js).
  players.others = () => npcs.bodies();
  npcs.player = () => players.hasCharacter && !players.dead ? [{ root: players.root, char: player }] : [];
  await rigs.load();
  players.join();
  const gui = new Gui(dm, players);
  // BillboardGuis' view of the world (runtime/gui.js): where a point draws on the page, how many page pixels a stud
  // is at a distance, and whether something stands between the camera and a point.
  gui.view = {
    project(p) {
      const cam = scene.activeCamera, W = engine.getRenderWidth(), H = engine.getRenderHeight(), r = canvas.getBoundingClientRect();
      const T = cam.getViewMatrix(true).multiply(cam.getProjectionMatrix(true)); // (this frame's camera: the scene's matrix is last frame's until it renders)
      const v = Vector3.Project(new Vector3(p[0], p[1], p[2]), Matrix.IdentityReadOnly, T, cam.viewport.toGlobal(W, H));
      return v.z > 0 && v.z < 1 ? { x: r.left + v.x * r.width / W, y: r.top + v.y * r.height / H } : null;
    },
    perStud(d) { const r = canvas.getBoundingClientRect(); return (r.height / 2) / (Math.max(d, 1e-3) * Math.tan(scene.activeCamera.fov / 2)); },
    // A homogeneous world point [x, y, z, w]'s page position as [X, Y, W] (page px = X/W, Y/W; W > 0 in front of
    // the camera), linear in the point: SurfaceGuis' CSS 3D transform.
    homog(p) {
      const cam = scene.activeCamera, r = canvas.getBoundingClientRect(), T = cam.getViewMatrix(true).multiply(cam.getProjectionMatrix(true)).m;
      const c = [0, 1, 2, 3].map(j => p[0] * T[j] + p[1] * T[4 + j] + p[2] * T[8 + j] + p[3] * T[12 + j]);
      return [r.left * c[3] + (c[0] + c[3]) / 2 * r.width, r.top * c[3] + (c[3] - c[1]) / 2 * r.height, c[3]];
    },
    occluded(from, to, ignore) {
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], len = Math.hypot(...d);
      const hit = dm.raycast(new V3(...from), new V3(...d), { filter: ignore });
      return hit.length > 0 && hit[4] < len - 0.05;
    },
  };
  gui.setTier(quality); graphics.add(gui);
  const surfaces = new Surfaces(scene, world, gui); // SurfaceGuis on their faces
  const camera = new FollowCamera(scene, player);
  scene.activeCamera = camera.cam;
  R.attachCamera(camera.cam);
  const camSync = new CameraSync(dm, camera, canvas, world);
  const sky = new Sky(scene, '../assets/sky/sky_1k_nosun.hdr', { quality });
  sky.attach(createSkybox(scene, sky.env)); // the same cube you see is the one that lights the scene
  const lighting = new LightingController(R, scene, dm, camera.cam, sky, quality);
  lighting.update();
  const localLights = new LocalLights(scene, dm, world, { quality, sunShadows: R.shadows });
  localLights.update();
  const particles = new Particles(scene, dm, world, { quality, localLights });
  graphics.add(lighting, localLights, particles, world);
  const styles = new Styles(scene, dm, camera.cam, { sun: R.sun });
  const highlights = new Highlights(scene, dm, world, { rigs, localCharacter: () => { const h = players.humanoid; return h && !h.destroyed && h.parent ? { model: h.parent, meshes: player.meshes } : null; } });
  await lighting.settled(); // the sky drawn into the environment for the starting time
  const controls = new Controls(canvas, camera);
  const menu = new Menu(gui.root, graphics); // Esc or the top-left button: Graphics Mode and Quality
  menu.onOpen = () => controls.keys.clear();
  gui.onFocus = () => controls.keys.clear(); // a TextBox took the keyboard: held movement keys let go
  gui.small = controls.isTouch;
  players.onSpawn = () => camera.snapBehind();
  camSync.pre(); camera.update(0); camSync.write(); // the Camera's properties before the first frame
  const audio = new Audio();
  await audio.load();
  const sounds = new CharacterSounds(audio, player, camera);
  players.onDied = () => sounds.died();

  // One clock for scripts, physics, the player and animation. Tests step it at a fixed 1/60 s.
  // A frame, in Roblox's order (RunService's docs): PreAnimation and
  // PreSimulation/Stepped, then physics (Havok, then the character), then
  // PostSimulation/Heartbeat, then waiting threads resume (task.wait), then
  // the camera (Roblox's camera scripts, bound at render priority Camera),
  // PreRender/RenderStepped, and the frame is drawn.
  let t = 0;
  const fixed = !!q.get('test');
  const frameDt = () => fixed ? 1 / 60 : Math.min(engine.getDeltaTime() / 1000, 1 / 20);
  const run = dm.service('RunService');
  const fire = (ev, args) => { dm.fire(run, ev, args); vm.flush(); };
  const beforePhysics = dt => {
    fire('PreAnimation', [dt]);
    dm.stepAnimations(dt); // AnimationTracks advance (their events queue for the scripts)
    fire('PreSimulation', [dt]); fire('Stepped', [t, dt]);
    dm.stepTweens(dt); vm.flush(); // tweens move parts before physics sees them
    world.trackMotion(dt); // how anchored parts moved this frame, so moving floors carry
    world.prePhysics(); // the joint graph current, welded assemblies' bodies built
  };
  const tick = dt => {
    t += dt;
    framePhysics = false;
    const c = controls.read(dt);
    const scriptJump = players.preStep();
    // No character (not spawned yet, or a script removed it): nothing to drive.
    if (players.hasCharacter) {
      // The player's input is Roblox's control script calling Humanoid:Move every frame: input ends a MoveTo,
      // and overwrites a script's Move; with none, a MoveTo walks the character (runtime/walk.js).
      const hum = players.humanoid;
      if (hum.walk && (hum.walk.kind === 'dir' || Math.hypot(c.dx, c.dz) > 1e-3)) { endWalk(hum, false); hum.walk = null; }
      const w = hum.walk ? walkStep(hum, player.holder.position, t) : null;
      if (w) { c.dx = w[0]; c.dz = w[1]; }
      player.setInput(c.dx, c.dz, c.jump || scriptJump, c.touch);
      player.step(dt, GRAVITY);
    }
    npcs.update(t, dt);
    checkPaths(dm, t); // Path.Blocked / Unblocked for paths scripts listen to
    players.postStep(t);
    world.syncFromPhysics();
    fire('PostSimulation', [dt]); fire('Heartbeat', [dt]);
    dm.flushDeferred(); // yields whose values were ready (dm.defer) resume now
    vm.step(t);
    if (!camSync.scriptable()) { camSync.pre(); camera.update(dt); camSync.write(); } else camSync.size();
    fire('PreRender', [dt]); fire('RenderStepped', [dt]);
    camSync.apply();
    rigs.update(dt);
    gui.update(dt);
    surfaces.update();
    lighting.update();
    localLights.update();
    particles.update(dt);
    styles.update();
    highlights.update();
    sounds.update(dt);
  };
  if (fixed) scene.getPhysicsEngine().setTimeStep(1 / 60);
  let simulating = false;
  // Physics steps at 240 Hz, Roblox's solver rate. At one 60 Hz step, Havok
  // (tuned for metres under 9.8 m/s²) let a stack of parts under 196.2
  // studs/s² sink 0.17 studs and wobble at 1-2 studs/s; at 240 Hz it rests.
  // The frame's events still fire once, before the first substep.
  scene.getPhysicsEngine().setSubTimeStep(1000 / 240);
  let framePhysics = false;
  scene.onBeforePhysicsObservable.add(() => { if (!framePhysics) { framePhysics = true; beforePhysics(frameDt()); } });
  // Constraints act every substep (runtime/constraints.js), after the frame's bodies are built.
  scene.onBeforePhysicsObservable.add(() => world.constraints.substep(scene.getPhysicsEngine().getSubTimeStep() / 1000 || 1 / 60));
  scene.onAfterPhysicsObservable.add(() => world.constraints.after());
  scene.onBeforeRenderObservable.add(() => { if (!simulating) tick(frameDt()); if (!fixed) graphics.frame(); });
  await scene.whenReadyAsync();
  // Played from the editor: Stop goes back to it with the place as it was before Play (Studio's Stop).
  if (q.get('from') === 'editor') {
    const stop = document.createElement('button');
    stop.textContent = 'Stop'; stop.id = 'stop';
    stop.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10;height:36px;padding:0 18px;border:0;border-radius:8px;background:#d9363e;color:#fff;font:600 14px system-ui,sans-serif';
    // Stop: back to the editor (open, line: which script to open there and where, from an Output link).
    const back = (open, line) => { const p = new URLSearchParams(q); p.set('place', 'session'); p.delete('from'); p.delete('open'); p.delete('line'); if (open) { p.set('open', open); p.set('line', line); } location.href = 'editor.html?' + p; };
    stop.addEventListener('click', () => back());
    output.onOpen = back;
    document.body.appendChild(stop);
    output.mount();
  }
  window.studio = {
    dm, vm, world, scene, output, cam: camera.cam, camera, camSync, graphics, menu, player, players, rigs, npcs, controls, audio, sounds, gui, lighting, localLights, particles, highlights, styles, sky, R, surfaces, ready: true,
    // Test hook: render n frames, each one fixed step, holding `input` ({ move: [x, y], jump, touch }).
    frames(n, input) { controls.override = input === 'live' ? null : input || { move: [0, 0] }; for (let i = 0; i < n; i++) scene.render(); controls.override = null; },
    // Same steps without drawing (physics, then the tick, as scene.render orders them), for measuring.
    sim(n, input) {
      controls.override = input === 'live' ? null : input || { move: [0, 0] };
      simulating = true;
      for (let i = 0; i < n; i++) { scene._advancePhysicsEngineStep(1000 / 60); tick(1 / 60); }
      simulating = false; controls.override = null;
    },
  };
  if (!q.get('test')) engine.runRenderLoop(() => scene.render());
}
main().catch(e => { console.error(e); window.studio = { error: String(e && e.stack || e) }; });
