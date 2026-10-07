// Phone controls through real touch events (CDP): the thumbstick appears
// under the left thumb and moves the player, the jump button jumps, a drag on
// the right turns the camera. Run with --phone.
export default async function (t) {
  const cdp = await t.page.context().newCDPSession(t.page);
  // Dispatch, then wait until the page has handled it (Chrome may hold touch
  // events behind a busy frame) — checked by what Controls says is held.
  const held = () => t.eval(() => [...window.studio.controls.touches.values()].map(v => v.kind).sort().join(','));
  const touch = async (type, pts, expect) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    for (let i = 0; i < 200 && expect !== undefined && (await held()) !== expect; i++) await t.page.waitForTimeout(25);
    if (expect !== undefined && (await held()) !== expect) throw new Error(`after ${type}: held "${await held()}", expected "${expect}"`);
  };
  const P = () => t.eval(() => { const p = window.studio.player; return { z: p.footPosition.z, x: p.footPosition.x, vy: p.vy, yaw: window.studio.camera.yaw }; });
  await t.sim(30);
  const a = await P();
  // Thumb down at (95, 690), pushed straight up 45 px: full forward.
  await touch('touchStart', [[95, 690, 1]], 'stick');
  await touch('touchMove', [[95, 645, 1]], 'stick');
  await t.sim(60, 'live');
  const b = await P();
  console.log('stick forward 1 s: moved', (b.z - a.z).toFixed(2), 'studs along +Z, sideways', (b.x - a.x).toFixed(2));
  await t.frames(2, 'live'); await t.shot('touch-stick');
  // Jump with the right thumb while still holding the stick.
  const box = await t.page.locator('.cs-jump').boundingBox();
  const jx = box.x + box.width / 2, jy = box.y + box.height / 2;
  await touch('touchStart', [[95, 645, 1], [jx, jy, 2]], 'jump,stick');
  await t.sim(3, 'live');
  const c = await P();
  console.log('jump button: vertical speed', c.vy.toFixed(1));
  await t.frames(1, 'live'); await t.shot('touch-jump'); await t.golden('touch-jump');
  await touch('touchEnd', [[jx, jy, 2]], 'stick'); // CDP: touchEnd lists the points lifted
  await t.sim(60, 'live');
  // Release everything; drag on the right half to turn the camera.
  await touch('touchEnd', [[95, 645, 1]], '');
  const y0 = (await P()).yaw;
  await touch('touchStart', [[300, 400, 3]], 'look');
  await touch('touchMove', [[220, 400, 3]], 'look');
  await t.page.waitForTimeout(100);
  await touch('touchEnd', [[220, 400, 3]], '');
  const y1 = (await P()).yaw;
  console.log('drag 80 px left: camera yaw change', ((y1 - y0) * 180 / Math.PI).toFixed(1), 'deg');
  await t.sim(5, 'live');
  const st = await t.eval(() => { const p = window.studio.player; const f = p.footPosition; return { foot: [f.x, f.y, f.z].map(v => +v.toFixed(2)), state: p.state, grounded: p.grounded, support: p.lastSupport, vy: +p.vy.toFixed(2) }; });
  console.log('after landing', JSON.stringify(st));
  await t.frames(2, 'live'); await t.shot('touch-idle');
}
