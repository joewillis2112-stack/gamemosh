// Play a place: the shared look, Havok physics, the DataModel drawn by World,
// the place's scripts in Luau, and the player: character, camera, controls.
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import HavokPhysics from '@babylonjs/havok';
import { createRenderer } from './render.js';
import { DataModel } from './datamodel.js';
import { startLuau } from './luau.js';
import createLuau from './luau.mjs';
import { World } from './runtime/world.js';
import { Character } from './runtime/character.js';
import { FollowCamera } from './runtime/camera.js';
import { Controls } from './runtime/controls.js';
import { Players } from './runtime/players.js';
import { Gui } from './runtime/gui.js';
import { Audio } from './runtime/audio.js';
import { CharacterSounds } from './runtime/charsounds.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const R = createRenderer(canvas, { skyUrl: '../assets/sky/sky_1k.hdr', quality: q.get('quality') || 'high', preserveDrawingBuffer: !!q.get('test') });
const { scene, engine } = R;

const GRAVITY = 196.2; // studs/s², Roblox's default

async function main() {
  const havok = await HavokPhysics({ locateFile: () => '../build/web/HavokPhysics.wasm' });
  scene.enablePhysics(new Vector3(0, -GRAVITY, 0), new HavokPlugin(true, havok));

  const dm = new DataModel();
  const log = (s, lvl) => (lvl === 2 ? console.error : console.log)('[luau] ' + s);
  const vm = await startLuau(createLuau, dm, log);
  const world = new World(scene, dm, R.shadows);

  const place = await (await fetch(q.get('place') || '../places/baseplate.luau')).text();
  vm.run('place', place);

  // The player joins after the place's scripts (as in Roblox) and spawns on a SpawnLocation.
  const player = await Character.load(scene, '../assets/characters/character-a.glb', R.shadows, Vector3.Zero());
  const players = new Players(dm, world, player, GRAVITY);
  players.join();
  const gui = new Gui(dm, players);
  const camera = new FollowCamera(scene, player);
  scene.activeCamera = camera.cam;
  R.attachCamera(camera.cam);
  const controls = new Controls(canvas, camera);
  gui.small = controls.isTouch;
  players.onSpawn = () => camera.snapBehind();
  const audio = new Audio();
  await audio.load();
  const sounds = new CharacterSounds(audio, player, camera);
  players.onDied = () => sounds.died();

  // One clock for scripts, physics, the player and animation. Tests step it at a fixed 1/60 s.
  // A frame, in Roblox's order (RunService's docs): PreAnimation and
  // PreSimulation/Stepped, then physics (Havok, then the character), then
  // PostSimulation/Heartbeat, then waiting threads resume (task.wait), then
  // PreRender/RenderStepped, the camera, and the frame is drawn.
  let t = 0;
  const fixed = !!q.get('test');
  const frameDt = () => fixed ? 1 / 60 : Math.min(engine.getDeltaTime() / 1000, 1 / 20);
  const run = dm.service('RunService');
  const fire = (ev, args) => { dm.fire(run, ev, args); vm.flush(); };
  const beforePhysics = dt => {
    fire('PreAnimation', [dt]);
    fire('PreSimulation', [dt]); fire('Stepped', [t, dt]);
    dm.stepTweens(dt); vm.flush(); // tweens move parts before physics sees them
    world.trackMotion(dt); // how anchored parts moved this frame, so moving floors carry
  };
  const tick = dt => {
    t += dt;
    framePhysics = false;
    const c = controls.read(dt);
    const scriptJump = players.preStep();
    // No character (not spawned yet, or a script removed it): nothing to drive.
    if (players.hasCharacter) {
      player.setInput(c.dx, c.dz, c.jump || scriptJump, c.touch);
      player.step(dt, GRAVITY);
    }
    players.postStep(t);
    world.syncFromPhysics();
    fire('PostSimulation', [dt]); fire('Heartbeat', [dt]);
    vm.step(t);
    fire('PreRender', [dt]); fire('RenderStepped', [dt]);
    gui.update();
    camera.update(dt);
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
  scene.onBeforeRenderObservable.add(() => { if (!simulating) tick(frameDt()); });
  await scene.whenReadyAsync();
  window.studio = {
    dm, vm, world, scene, cam: camera.cam, camera, player, players, controls, audio, sounds, gui, ready: true,
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
