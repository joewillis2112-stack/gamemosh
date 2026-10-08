// Desktop controls through real input: WASD moves relative to the camera,
// Space jumps, mouse drag turns the camera, the wheel zooms, and a wall
// behind the player pulls the camera in (then it eases back out).
export default async function (t) {
  const P = () => t.eval(() => { const s = window.studio, p = s.player, c = s.camera; return { x: p.footPosition.x, y: p.footPosition.y, z: p.footPosition.z, vy: p.vy, yaw: c.yaw, zoom: c.zoom, dist: c.dist }; });
  const kb = t.page.keyboard, mouse = t.page.mouse;
  await t.sim(30);
  let a = await P();
  await kb.down('KeyW'); await t.sim(36, 'live'); await kb.up('KeyW'); // 0.6 s: stays short of the blocks at z 14
  let b = await P();
  console.log('W 0.6 s:', (b.z - a.z).toFixed(2), 'studs forward (+Z), sideways', (b.x - a.x).toFixed(2));
  a = b;
  await kb.down('KeyD');
  await t.sim(30, 'live'); await kb.up('KeyD');
  b = await P();
  console.log('D 0.5 s:', (b.x - a.x).toFixed(2), 'studs right (+X)');
  await t.sim(20, 'live');
  await kb.down('Space'); await t.sim(2, 'live'); await kb.up('Space');
  console.log('Space: vy', (await P()).vy.toFixed(1));
  await t.sim(60, 'live');
  // Mouse: drag 100 px to the right.
  a = await P();
  await mouse.move(640, 360); await mouse.down({ button: 'right' }); await mouse.move(740, 360, { steps: 5 }); await mouse.up({ button: 'right' });
  b = await P();
  console.log('right-drag 100 px: yaw', ((b.yaw - a.yaw) * 180 / Math.PI).toFixed(1), 'deg');
  await mouse.wheel(0, 300); await t.page.waitForTimeout(50);
  console.log('wheel out: zoom', a.zoom.toFixed(2), '->', (await P()).zoom.toFixed(2));
  // Occlusion: a wall 4 studs behind the player, camera looking through it.
  await t.eval(() => {
    const s = window.studio;
    s.vm.run('wall', 'local w = Instance.new("Part") w.Name = "Wall" w.Size = Vector3.new(30, 14, 2) w.Position = Vector3.new(0, 7, 21) w.Anchored = true w.Color = Color3.new(0.8, 0.75, 0.6) w.Parent = workspace');
    s.vm.flush && s.vm.flush();
    s.player.teleport(s.player.holder.position.constructor.FromArray([0, 0, 16]), Math.PI);
    s.camera.yaw = 0; s.camera.pitch = 10 * Math.PI / 180; s.camera.zoom = 12.5;
  });
  await t.sim(5, 'live');
  const occ = await P();
  console.log('wall behind: camera distance', occ.dist.toFixed(2), 'of zoom', occ.zoom.toFixed(2));
  await t.frames(2, 'live'); await t.shot('desktop-occluded');
  // Turn away from the wall: the camera eases back out.
  await t.eval(() => { window.studio.camera.yaw = Math.PI; });
  const ease = [];
  for (let i = 0; i < 4; i++) { await t.sim(10, 'live'); ease.push((await P()).dist.toFixed(2)); }
  console.log('turned away, distance every 1/6 s:', ease.join(' '));
  await t.frames(2, 'live'); await t.shot('desktop-open');
}
