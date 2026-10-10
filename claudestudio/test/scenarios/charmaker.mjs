// Character maker, stage 1, in play: a made skin changes how the character
// looks and nothing about how it moves.
// - Mechanics: the same input trace (walk, stop, jump, turn) run with the
//   default skin twice, then with a made skin; the last two match frame for
//   frame (feet, velocity, state, facing, the animated pose). Running the
//   default twice first keeps physics-engine history out of the comparison.
// - Look: the test card's skin seen from the front puts the character's left
//   arm (red) on the screen's right and its right arm (blue) on the left.
// - Golden: a made skin (the CC0 male adventurer) from three-quarters.
import { PNG } from 'pngjs';
import { loadPNG, makeSkin } from '../../tools/charmaker.mjs';
import { findParts } from '../../web/runtime/charmaker.js';
import { testCard } from '../fixtures/testcard.mjs';

const dataUrl = rgba => { const p = new PNG({ width: 1024, height: 1024 }); p.data = Buffer.from(rgba); return 'data:image/png;base64,' + PNG.sync.write(p).toString('base64'); };
const skinOf = img => dataUrl(makeSkin(img, findParts(img), { headPx: 16 }).skin);

export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  const spawn = await t.eval(() => { const f = window.studio.player.footPosition; return [f.x, f.y, f.z]; });
  const reset = () => t.eval(s => { const S = window.studio, p = S.player; p.teleport(new p.footPosition.constructor(...s), 0); p.anim.play('idle', 0); }, spawn);
  const frame = () => t.eval(() => {
    const p = window.studio.player, f = p.footPosition, leg = p.anim.nodes.find(n => n.name === 'leg-left'), q = leg.rotationQuaternion;
    return [f.x, f.y, f.z, p.velocity.x, p.velocity.y, p.velocity.z, p.yaw, p.state, q.x, q.y, q.z, q.w].map(v => typeof v === 'number' ? +v.toPrecision(12) : v).join(',');
  });
  const trace = async () => {
    await reset(); await t.sim(20);
    const out = [];
    const step = async (n, input) => { for (let i = 0; i < n; i++) { await t.sim(1, input); out.push(await frame()); } };
    await step(70, { move: [0, 1] }); await step(30); await step(1, { jump: true }); await step(50); await step(40, { move: [1, 0] });
    return out;
  };
  const A = await trace(), B = await trace();
  await t.eval(u => window.studio.player.setSkin(u), skinOf(testCard()));
  const Cs = await trace();
  const diff = (x, y) => x.findIndex((v, i) => v !== y[i]);
  console.log('default vs default: first difference at frame', diff(A, B));
  check(diff(B, Cs) === -1 && Cs.length === 191, `a made skin moves exactly like the default (191 frames of feet, velocity, state, facing and leg pose; first difference ${diff(B, Cs)})`);
  check(new Set(Cs.map(f => f.split(',')[7])).size >= 3, `the trace covers several states (${[...new Set(Cs.map(f => f.split(',')[7]))].join(', ')})`);

  // Look: face the character from the front, read the arms' colours on screen.
  await reset(); await t.sim(20);
  await t.eval(() => { const c = window.studio.camera; c.yaw = 0; c.pitch = 0.1; c.zoom = c.z = c.dist = 9; c.update(0); });
  await t.frames(3);
  await t.shot('charmaker-card-front');
  const arms = await t.eval(() => {
    const S = window.studio, c = document.getElementById('c'), g = S.scene.getEngine()._gl, cam = S.cam, V = cam.position.constructor;
    const read = name => {
      const m = S.player.meshes.find(m => m.name === name); m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox.centerWorld;
      const p = V.Project(b, S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height));
      const px = new Uint8Array(4); g.readPixels(Math.round(p.x), Math.round(c.height - 1 - p.y), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      return { x: p.x / c.width, rgb: [...px.slice(0, 3)] };
    };
    return { left: read('arm-left'), right: read('arm-right') };
  });
  const red = p => p.rgb[0] > p.rgb[2] + 60, blue = p => p.rgb[2] > p.rgb[0] + 60;
  check(arms.left.x > arms.right.x && red(arms.left) && blue(arms.right), `seen from the front, its left arm is red on the screen's right (${arms.left.rgb} at ${arms.left.x.toFixed(2)}), its right arm blue on the left (${arms.right.rgb} at ${arms.right.x.toFixed(2)})`);

  // Golden: a made skin from three-quarters.
  await t.eval(u => window.studio.player.setSkin(u), skinOf(loadPNG('test/fixtures/characters/male-adventurer.png')));
  await t.eval(() => { const c = window.studio.camera; c.yaw = Math.PI * 0.8; c.pitch = 0.15; c.zoom = c.z = c.dist = 10; c.update(0); });
  await t.frames(3);
  await t.shot('charmaker-male'); await t.golden('charmaker-male');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
