// Desktop controls through real input: WASD moves relative to the camera,
// Space jumps, mouse drag turns the camera, the wheel zooms, and a wall
// behind the player pulls the camera in (then it eases back out).
// Checks: W and D move at about WalkSpeed along the camera's axes, Space
// jumps at JumpPower 50, a 100 px drag turns 50° (Roblox: 0.5°/px) toward the
// drag, one wheel click zooms 12.5 -> 19.75 (Roblox's step), a wall pulls the
// camera in short of it and it eases back out when clear.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { if (!ok) { console.log('FAIL ' + what); fail.push(what); } };
  const P = () => t.eval(() => { const s = window.studio, p = s.player, c = s.camera; return { x: p.footPosition.x, y: p.footPosition.y, z: p.footPosition.z, vy: p.vy, yaw: c.yaw, zoom: c.zoom, dist: c.dist }; });
  const kb = t.page.keyboard, mouse = t.page.mouse;
  await t.sim(30);
  let a = await P();
  await kb.down('KeyW'); await t.sim(36, 'live'); await kb.up('KeyW'); // 0.6 s: stays short of the blocks at z 14
  let b = await P();
  console.log('W 0.6 s:', (b.z - a.z).toFixed(2), 'studs forward (+Z), sideways', (b.x - a.x).toFixed(2));
  check(b.z - a.z > 8.5 && b.z - a.z < 9.7 && Math.abs(b.x - a.x) < 0.05, 'W moves forward at about WalkSpeed');
  a = b;
  await kb.down('KeyD');
  await t.sim(30, 'live'); await kb.up('KeyD');
  b = await P();
  // Along the camera's right (right-handed: forward x up).
  const right = (b.x - a.x) * Math.cos(b.yaw) - (b.z - a.z) * Math.sin(b.yaw), side = (b.x - a.x) * Math.sin(b.yaw) + (b.z - a.z) * Math.cos(b.yaw);
  console.log('D 0.5 s:', right.toFixed(2), 'studs to the camera\'s right, off-axis', side.toFixed(2));
  check(right > 6.5 && right < 8.1 && Math.abs(side) < 0.6, 'D moves to the camera\'s right');
  await t.sim(20, 'live');
  await kb.down('Space'); await t.sim(2, 'live'); await kb.up('Space');
  const vy = (await P()).vy;
  console.log('Space: vy', vy.toFixed(1));
  check(vy > 40 && vy <= 50, 'Space jumps (JumpPower 50, less a frame or two of gravity)');
  await t.sim(60, 'live');
  // Mouse: drag 100 px to the right.
  a = await P();
  await mouse.move(640, 360); await mouse.down({ button: 'right' }); await mouse.move(740, 360, { steps: 5 }); await mouse.up({ button: 'right' });
  b = await P();
  // "Looks right": the new view direction leans toward the old view's right.
  const lean = await t.eval(([y0]) => {
    const c = window.studio.camera, fwd = y => [-Math.sin(y), -Math.cos(y)];
    const f0 = fwd(y0), right0 = [-f0[1], f0[0]], f1 = fwd(c.yaw);
    return f1[0] * right0[0] + f1[1] * right0[1];
  }, [a.yaw]);
  const turned = Math.abs((b.yaw - a.yaw) * 180 / Math.PI);
  console.log('right-drag 100 px: turned', turned.toFixed(1), 'deg', lean > 0 ? 'to the right' : 'to the LEFT (wrong)');
  check(Math.abs(turned - 50) < 0.5 && lean > 0, 'a 100 px right-drag turns 50° to the right');
  await mouse.wheel(0, 300); await t.page.waitForTimeout(50);
  const zoomed = (await P()).zoom;
  console.log('wheel out: zoom', a.zoom.toFixed(2), '->', zoomed.toFixed(2));
  check(Math.abs(a.zoom - 12.5) < 1e-6 && Math.abs(zoomed - 19.75) < 1e-6, 'one wheel click: 12.5 -> 19.75');
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
  check(occ.dist > 2.5 && occ.dist < 4, 'the wall 4 studs behind pulls the camera in short of it');
  await t.frames(2, 'live'); await t.shot('desktop-occluded');
  // Turn away from the wall: the camera eases back out.
  await t.eval(() => { window.studio.camera.yaw = Math.PI; });
  const ease = [];
  for (let i = 0; i < 4; i++) { await t.sim(10, 'live'); ease.push((await P()).dist.toFixed(2)); }
  console.log('turned away, distance every 1/6 s:', ease.join(' '));
  check(ease.every((d, i) => i === 0 || +d > +ease[i - 1]) && +ease[3] > 12, 'turned away, it eases back out toward 12.5');
  await t.frames(2, 'live'); await t.shot('desktop-open');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
