// Loose parts behave like Roblox's (physical properties from the creator docs'
// materials table; 240 Hz solver):
// - a stack of 5 plastic boxes comes to rest without sinking or drifting;
// - parts bounce by their elasticity: plastic (0.5) clearly, wood (0.2) less;
// - mass is density x volume (plastic 0.7 per cubic stud);
// - a box slides further on Ice (friction 0.02) than on Plastic (0.3), by v²/2µg;
// - walking into a loose plastic crate shoves it; a metal block of the same size doesn't move.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(20);
  await t.eval(() => window.studio.vm.run('setup', `
    local function part(name, size, pos, props)
      local p = Instance.new("Part") p.Name = name p.Size = size p.Position = pos
      for k, v in pairs(props or {}) do p[k] = v end
      p.Parent = workspace
      return p
    end
    for i = 1, 5 do part("Stack" .. i, Vector3.new(4, 2, 4), Vector3.new(40, i * 2 - 1, -40)) end
    part("DropPlastic", Vector3.new(2, 2, 2), Vector3.new(-40, 20, -40))
    part("DropWood", Vector3.new(2, 2, 2), Vector3.new(-30, 20, -40), { Material = Enum.Material.Wood })
    part("IceFloor", Vector3.new(60, 1, 8), Vector3.new(0, 0.5, -60), { Anchored = true, Material = Enum.Material.Ice })
    part("PlasticFloor", Vector3.new(60, 1, 8), Vector3.new(0, 0.5, -75), { Anchored = true })
    part("OnIce", Vector3.new(2, 2, 2), Vector3.new(-25, 2, -60))
    part("OnPlastic", Vector3.new(2, 2, 2), Vector3.new(-25, 2, -75))
    part("Crate", Vector3.new(4, 4, 4), Vector3.new(40, 2, 40))
    part("Block", Vector3.new(4, 4, 4), Vector3.new(60, 2, 40), { Material = Enum.Material.Metal })
  `));
  const P = n => t.eval(n => {
    const s = window.studio, i = s.dm.workspace.children.find(c => c.Name === n), e = s.world.parts.get(i), v = i.props.AssemblyLinearVelocity;
    return { x: i.props.Position.x, y: i.props.Position.y, z: i.props.Position.z, speed: Math.hypot(v.x, v.y, v.z), mass: e.agg.body.getMassProperties().mass };
  }, n);

  // Bounces: the highest point after the first landing.
  // (Landing is when the fall stops: at 85 studs/s no frame catches the box near the floor.)
  const peak = await t.eval(() => {
    const s = window.studio, out = {};
    const parts = ['DropPlastic', 'DropWood'].map(n => s.dm.workspace.children.find(c => c.Name === n));
    const st = parts.map(() => ({ landed: false, peak: 0, vy: 0 }));
    for (let k = 0; k < 150; k++) {
      s.sim(1);
      parts.forEach((p, i) => {
        const vy = p.props.AssemblyLinearVelocity.y, S = st[i];
        if (!S.landed && S.vy < -10 && vy > -10) S.landed = true;
        if (S.landed) S.peak = Math.max(S.peak, p.props.Position.y - 1);
        S.vy = vy;
      });
    }
    parts.forEach((p, i) => { out[p.Name] = st[i].peak; });
    return out;
  });
  console.log('bounce heights after a 19-stud fall: plastic', peak.DropPlastic.toFixed(2), 'wood', peak.DropWood.toFixed(2));
  // Plastic on plastic: e = 0.5, so ~e² x 19 = 4.75; wood on plastic: mean e = 0.35, ~2.3.
  check(peak.DropPlastic > 3 && peak.DropPlastic < 6.5, 'plastic bounces back about a quarter of its fall');
  check(peak.DropWood > 0.8 && peak.DropWood < peak.DropPlastic * 0.75, 'wood bounces less than plastic');
  const m = await P('DropPlastic');
  check(Math.abs(m.mass - 0.7 * 8) < 0.01, `mass = density x volume (plastic 2x2x2: ${m.mass.toFixed(2)})`);

  // The stack, 2.5 s after it was built.
  const s1 = await P('Stack1'), s5 = await P('Stack5');
  console.log('stack: bottom y', s1.y.toFixed(3), 'top y', s5.y.toFixed(3), 'top drift', Math.hypot(s5.x - 40, s5.z + 40).toFixed(3), 'top speed', s5.speed.toFixed(3));
  check(Math.abs(s5.y - 9) < 0.03 && Math.hypot(s5.x - 40, s5.z + 40) < 0.03 && s5.speed < 0.05, 'a stack of 5 boxes rests: no sinking, drift or wobble');

  // Slide: the same shove on ice and on plastic.
  await t.eval(() => window.studio.vm.run('shove', `workspace.OnIce.AssemblyLinearVelocity = Vector3.new(30, 0, 0) workspace.OnPlastic.AssemblyLinearVelocity = Vector3.new(30, 0, 0)`));
  await t.sim(120);
  const ice = await P('OnIce'), pl = await P('OnPlastic');
  console.log('slid 2 s from 30 studs/s: on ice', (ice.x + 25).toFixed(2), 'on plastic', (pl.x + 25).toFixed(2));
  // Slide distance is v²/(2µg). Plastic on plastic: µ 0.3, 7.65 studs. Ice under plastic:
  // the plain mean (Havok can't weight) gives µ 0.16, 14.3 studs; Roblox weights Ice x3 (µ 0.09, ~25 studs).
  check(Math.abs(pl.x + 25 - 7.65) < 0.5 && Math.abs(ice.x + 25 - 14.3) < 1, 'a box slides further on Ice than on Plastic, as its friction says (plain-mean combine)');

  // Pushing (on open ground, clear of the place's own blocks).
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(40, 0, 30), 0); });
  await t.sim(10);
  const c0 = await P('Crate');
  await t.sim(90, { move: [0, 1] });
  const c1 = await P('Crate');
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(60, 0, 30), 0); });
  await t.sim(10);
  const b0 = await P('Block');
  await t.sim(90, { move: [0, 1] });
  const b1 = await P('Block'), foot = await t.eval(() => window.studio.player.footPosition.z);
  console.log('walking into them 1.5 s: crate moved', (c1.z - c0.z).toFixed(2), '(mass', c0.mass.toFixed(1) + '), metal block moved', (b1.z - b0.z).toFixed(2), '(mass', b0.mass.toFixed(1) + '), player stopped at z', foot.toFixed(2));
  check(c1.z - c0.z > 3, 'walking into a loose plastic crate shoves it');
  check(Math.abs(b1.z - b0.z) < 0.1 && foot < 38, 'a metal block of the same size holds, and stops the character');
  await t.frames(2); await t.shot('physics');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
