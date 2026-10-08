// Roblox's defaults (mashup-research/ROBLOX_DEFAULTS_2026-10-08.md), checked
// by behaviour: camera spawn pitch, wheel zoom step and its spring, arrow keys
// turning the view, Follow mode on touch (the camera swings behind a
// character walking sideways, but not within 2 s of a drag), health regen of
// 1%/s, and the character fading as the camera closes in. Run with and
// without --phone (touch turns Follow mode on).
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { if (!ok) { console.log('FAIL ' + what); fail.push(what); } };
  const C = () => t.eval(() => { const c = window.studio.camera, p = window.studio.player; return { yaw: c.yaw, pitch: c.pitch * 180 / Math.PI, zoom: c.zoom, z: c.z, follow: c.follow, charYaw: p.yaw, fade: p.fade || 0 }; });
  const deg = r => +(r * 180 / Math.PI).toFixed(1);
  await t.sim(30);
  const c0 = await C();
  const behind0 = Math.abs(Math.cos(c0.yaw - c0.charYaw - Math.PI) - 1) < 1e-6;
  console.log('spawn pitch', c0.pitch.toFixed(1), 'zoom', c0.zoom, 'follow mode', c0.follow, 'camera behind', behind0);
  check(Math.abs(c0.pitch - 15) < 0.01 && c0.zoom === 12.5 && behind0, 'spawn: 15° down, zoom 12.5, behind the character');

  // Strafe right for 2 s: Follow mode swings the camera behind; Classic doesn't.
  await t.sim(120, { move: [1, 0], touch: c0.follow });
  const c1 = await C();
  const behind = d => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  const moved = deg(behind(c1.yaw - c0.yaw));
  console.log('after strafing 2 s: camera off behind by', deg(behind(c1.yaw - c1.charYaw - Math.PI)), 'deg (yaw moved', moved, 'deg)');
  // Classic (desktop) never turns the camera by itself; Follow (touch) does, so strafing orbits.
  check(c0.follow ? moved > 30 : moved < 0.5, c0.follow ? 'Follow mode turns the camera while strafing' : 'Classic mode leaves the camera alone');
  await t.sim(30);

  // Health: 50 -> after 5 s should be 55 (1% of 100 per second, in 1 s steps).
  await t.eval(() => { const h = window.studio.players.humanoid; window.studio.dm.set(h, 'Health', 50); });
  await t.sim(5 * 60 + 2);
  const hp = await t.eval(() => window.studio.players.humanoid.props.Health);
  console.log('health 50 -> after 5 s:', hp);
  check(Math.abs(hp - 55) < 1e-6, 'health regenerates 1%/s (50 -> 55 in 5 s)');
  await t.eval(() => { const h = window.studio.players.humanoid; window.studio.dm.set(h, 'Health', 100); });

  if (!c0.follow) {
    // Wheel: one click out from 12.5 is 12.5 + 1*(1 + 6.25) = 19.75; the spring reaches it.
    await t.page.mouse.move(640, 360);
    await t.page.mouse.wheel(0, 100); await t.page.waitForTimeout(50);
    const z0 = await C(); await t.sim(6); const z1 = await C(); await t.sim(60); const z2 = await C();
    console.log('wheel out: target', z0.zoom.toFixed(2), 'spring after 0.1 s', z1.z.toFixed(2), 'after 1.1 s', z2.z.toFixed(2));
    check(Math.abs(z0.zoom - 19.75) < 1e-6 && z1.z > 12.5 && z1.z < 19.75 && Math.abs(z2.z - 19.75) < 0.01, 'wheel: target 19.75, eased in by the spring');
    // Left arrow for 0.5 s: 60 degrees.
    const y0 = (await C()).yaw;
    await t.page.keyboard.down('ArrowLeft'); await t.sim(30, 'live'); await t.page.keyboard.up('ArrowLeft');
    const arrow = deg(behind((await C()).yaw - y0));
    console.log('left arrow 0.5 s turned', arrow, 'deg');
    check(Math.abs(arrow - 60) < 1.5, 'left arrow turns 120°/s');
    // Zoom in close: the character fades.
    for (const z of [1.8, 1.2, 0.5]) {
      await t.eval(z => { const c = window.studio.camera; c.zoom = z; }, z);
      await t.sim(60);
      const fade = (await C()).fade;
      console.log('zoom', z, '-> fade', fade.toFixed(2));
      const want = z >= 2 ? 0 : z <= 0.5 ? 1 : 1 - (z - 0.5) / 1.5; // Roblox's fade within 2 studs
      check(Math.abs(fade - want) < 0.02, `fade at zoom ${z} is ${want.toFixed(2)}`);
    }
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
