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
  const camera = new FollowCamera(scene, player);
  scene.activeCamera = camera.cam;
  R.attachCamera(camera.cam);
  const controls = new Controls(canvas, camera);
  players.onSpawn = () => camera.snapBehind();

  // One clock for scripts, physics, the player and animation. Tests step it at a fixed 1/60 s.
  let t = 0;
  const fixed = !!q.get('test');
  const tick = dt => {
    t += dt;
    vm.step(t);
    const c = controls.read();
    const scriptJump = players.preStep();
    player.setInput(c.dx, c.dz, c.jump || scriptJump, c.touch);
    player.step(dt, GRAVITY);
    players.postStep(t);
    camera.update(dt);
    world.syncFromPhysics();
  };
  if (fixed) scene.getPhysicsEngine().setTimeStep(1 / 60);
  let simulating = false;
  scene.onBeforeRenderObservable.add(() => { if (!simulating) tick(fixed ? 1 / 60 : Math.min(engine.getDeltaTime() / 1000, 1 / 20)); });
  await scene.whenReadyAsync();
  window.studio = {
    dm, vm, world, scene, cam: camera.cam, camera, player, players, controls, ready: true,
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
