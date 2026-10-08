// Roblox's defaults (mashup-research/ROBLOX_DEFAULTS_2026-10-08.md), checked
// by behaviour: camera spawn pitch, wheel zoom step and its spring, arrow keys
// turning the view, Follow mode on touch (the camera swings behind a
// character walking sideways, but not within 2 s of a drag), health regen of
// 1%/s, and the character fading as the camera closes in. Run with and
// without --phone (touch turns Follow mode on).
export default async function (t) {
  const C = () => t.eval(() => { const c = window.studio.camera, p = window.studio.player; return { yaw: c.yaw, pitch: c.pitch * 180 / Math.PI, zoom: c.zoom, z: c.z, follow: c.follow, charYaw: p.yaw, fade: p.fade || 0 }; });
  const deg = r => +(r * 180 / Math.PI).toFixed(1);
  await t.sim(30);
  const c0 = await C();
  console.log('spawn pitch', c0.pitch.toFixed(1), 'zoom', c0.zoom, 'follow mode', c0.follow, 'camera behind', Math.abs(Math.cos(c0.yaw - c0.charYaw - Math.PI) - 1) < 1e-6);

  // Strafe right for 2 s: Follow mode swings the camera behind; Classic doesn't.
  await t.sim(120, { move: [1, 0], touch: c0.follow });
  const c1 = await C();
  const behind = d => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  console.log('after strafing 2 s: camera off behind by', deg(behind(c1.yaw - c1.charYaw - Math.PI)), 'deg (yaw moved', deg(behind(c1.yaw - c0.yaw)), 'deg)');
  await t.sim(30);

  // Health: 50 -> after 5 s should be 55 (1% of 100 per second, in 1 s steps).
  await t.eval(() => { const h = window.studio.players.humanoid; window.studio.dm.set(h, 'Health', 50); });
  await t.sim(5 * 60 + 2);
  console.log('health 50 -> after 5 s:', await t.eval(() => window.studio.players.humanoid.props.Health));
  await t.eval(() => { const h = window.studio.players.humanoid; window.studio.dm.set(h, 'Health', 100); });

  if (!c0.follow) {
    // Wheel: one click out from 12.5 is 12.5 + 1*(1 + 6.25) = 19.75; the spring reaches it.
    await t.page.mouse.move(640, 360);
    await t.page.mouse.wheel(0, 100); await t.page.waitForTimeout(50);
    const z0 = await C(); await t.sim(6); const z1 = await C(); await t.sim(60); const z2 = await C();
    console.log('wheel out: target', z0.zoom.toFixed(2), 'spring after 0.1 s', z1.z.toFixed(2), 'after 1.1 s', z2.z.toFixed(2));
    // Left arrow for 0.5 s: 60 degrees.
    const y0 = (await C()).yaw;
    await t.page.keyboard.down('ArrowLeft'); await t.sim(30, 'live'); await t.page.keyboard.up('ArrowLeft');
    console.log('left arrow 0.5 s turned', deg(behind((await C()).yaw - y0)), 'deg');
    // Zoom in close: the character fades.
    for (const z of [1.8, 1.2, 0.5]) {
      await t.eval(z => { const c = window.studio.camera; c.zoom = z; }, z);
      await t.sim(60);
      console.log('zoom', z, '-> fade', (await C()).fade.toFixed(2));
    }
  }
}
