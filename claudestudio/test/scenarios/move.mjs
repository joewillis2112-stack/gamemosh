// The player's movement, measured: idle on spawn, walk speed, jump height,
// feet on the ground, and shots of each state. Measurements use sim (no
// drawing); shots render a couple of frames first.
export default async function (t) {
  const S = () => t.eval(() => { const p = window.studio.player; const f = p.footPosition; return { x: f.x, y: f.y, z: f.z, vy: p.velocity.y, state: p.state, grounded: p.grounded, yaw: p.yaw }; });
  const out = {};
  await t.sim(60);
  out.settled = await S();
  await t.frames(2); await t.shot('move-idle');

  // Walk forward (away from the camera) 2 s; speed over the last second.
  await t.sim(60, { move: [0, 1] });
  const a = await S();
  await t.sim(60, { move: [0, 1] });
  const b = await S();
  out.walkSpeed = Math.hypot(b.x - a.x, b.z - a.z);
  out.walkState = b.state; out.walkY = b.y;
  await t.frames(2, { move: [0, 1] }); await t.shot('move-walk');

  // Stop: how far it slides.
  const c = await S();
  await t.sim(60);
  const d = await S();
  out.stopSlide = Math.hypot(d.x - c.x, d.z - c.z); out.stopState = d.state;

  // Jump from standing: peak height above the ground and time in the air.
  const g = await S();
  let peak = g.y, air = 0;
  const states = [];
  await t.sim(1, { jump: true });
  for (let i = 0; i < 90; i++) {
    const s = await S();
    peak = Math.max(peak, s.y);
    if (!s.grounded) air++;
    if (states[states.length - 1] !== s.state) states.push(s.state);
    await t.sim(1);
  }
  const e = await S();
  Object.assign(out, { jumpHeight: peak - g.y, airTime: air / 60, jumpStates: states.join('>'), landedY: e.y, landedState: e.state });

  // Turn: walk right for 1 s; the body should face +X (yaw 90°).
  await t.sim(60, { move: [1, 0] });
  out.turnYawDeg = (await S()).yaw * 180 / Math.PI;
  for (const [k, v] of Object.entries(out)) console.log(k, typeof v === 'number' ? v.toFixed(3) : JSON.stringify(v));

  // Shots from a three-quarter camera (to judge the poses), then the default view.
  const view = (yawDeg, pitchDeg, zoom) => t.eval(([y, p, z]) => { const c = window.studio.camera; c.yaw = y * Math.PI / 180; c.pitch = p * Math.PI / 180; c.zoom = z; c.dist = z; }, [yawDeg, pitchDeg, zoom]);
  await t.sim(60);
  const face = await t.eval(() => window.studio.player.yaw * 180 / Math.PI);
  await view(face + 135, 12, 14);
  await t.frames(2); await t.shot('move-3q-idle'); await t.golden('idle-3q');
  await t.sim(40, { move: [0, 0] });
  // Walk across the view: the camera stays put while the body turns to the move direction.
  await t.sim(30, { move: [1, 0] }); await t.frames(2, { move: [1, 0] }); await t.shot('move-3q-run'); await t.golden('run-3q');
  await t.sim(30, { move: [0.35, 0] }); await t.frames(2, { move: [0.35, 0] }); await t.shot('move-3q-walk');
  await t.sim(30);
  await t.sim(1, { jump: true }); await t.sim(9);
  await t.frames(2); await t.shot('move-3q-jump'); await t.golden('jump-3q');
  await t.sim(16);
  await t.frames(2); await t.shot('move-3q-fall'); await t.golden('fall-3q');
  await t.sim(60);
  await view(face + 180, 20, 12.5);
  await t.sim(1);
  await t.frames(2); await t.shot('move-default');
}
