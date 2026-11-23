// Welded assemblies in play (web/assembly.js, runtime/world.js): an unanchored assembly is one body.
// - Two parts welded in an L, dropped: they land and rest together, their offset exact the whole way;
// - a top-heavy welded tower tips over as one (it moves and turns; the offsets hold);
// - its mass is the sum of its parts' (density x volume) and it has one body, on its root;
// - a loose part welded to an anchored one doesn't fall;
// - destroying a falling pair's weld splits it into two bodies that fall on their own;
// - a Motor6D's Transform turns a door about its hinge, the anchored frame staying put;
// - a script setting a loose assembly's CFrame moves all of it, and it falls from there.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(20);
  await t.eval(() => window.studio.vm.run('setup', `
    local function part(name, size, pos, props)
      local p = Instance.new("Part") p.Name = name p.Size = size p.CFrame = CFrame.new(pos)
      for k, v in pairs(props or {}) do p[k] = v end
      p.Parent = workspace
      return p
    end
    local function weld(a, b) local w = Instance.new("WeldConstraint") w.Part0 = a w.Part1 = b w.Parent = a return w end
    -- An L, dropped.
    local L1 = part("L1", Vector3.new(6, 1, 2), Vector3.new(-40, 12, 30))
    local L2 = part("L2", Vector3.new(1, 4, 2), Vector3.new(-37.5, 14.5, 30))
    weld(L1, L2)
    -- A top-heavy tower: a thin post, a heavy slab on top, offset to one side.
    local T1 = part("T1", Vector3.new(1, 8, 1), Vector3.new(40, 4.5, 30))
    local T2 = part("T2", Vector3.new(6, 1, 6), Vector3.new(42.5, 9, 30), { Material = Enum.Material.Metal })
    weld(T1, T2)
    -- Held by an anchored part.
    local H1 = part("H1", Vector3.new(2, 2, 2), Vector3.new(0, 20, 60), { Anchored = true })
    local H2 = part("H2", Vector3.new(2, 2, 2), Vector3.new(3, 20, 60))
    weld(H1, H2)
    -- A pair that will be cut apart in the air.
    local S1 = part("S1", Vector3.new(2, 2, 2), Vector3.new(-10, 40, 90))
    local S2 = part("S2", Vector3.new(2, 2, 2), Vector3.new(-6, 40, 90))
    _G.cut = weld(S1, S2)
    -- A door on a Motor6D hinge.
    local F = part("Frame", Vector3.new(1, 8, 1), Vector3.new(20, 4.5, 60), { Anchored = true })
    local D = part("Door", Vector3.new(4, 7, 0.5), Vector3.new(0, 0, 0))
    local m = Instance.new("Motor6D") m.Name = "Hinge" m.Part0 = F m.Part1 = D
    m.C0 = CFrame.new(0.5, 0, 0) m.C1 = CFrame.new(-2, 0, 0) m.Parent = F
    _G.hinge = m
    -- To be moved by a script.
    local M1 = part("M1", Vector3.new(2, 2, 2), Vector3.new(60, 1.5, -30))
    local M2 = part("M2", Vector3.new(2, 2, 2), Vector3.new(60, 3.5, -30))
    weld(M1, M2)
  `));
  const W = (fn, arg) => t.eval(fn, arg);
  // The offset between two parts (in the first's frame), and their positions.
  const rel = (a, b) => W(([a, b]) => { const ws = window.studio.dm.workspace, A = ws.children.find(c => c.Name === a), B = ws.children.find(c => c.Name === b); const r = A.props.CFrame.inverse().mul(B.props.CFrame); return { m: r.m, a: [A.props.CFrame.x, A.props.CFrame.y, A.props.CFrame.z], b: [B.props.CFrame.x, B.props.CFrame.y, B.props.CFrame.z], up: A.props.CFrame.m[7] }; }, [a, b]);
  const same = (r, s) => r.m.every((v, i) => Math.abs(v - s.m[i]) < 1e-3);

  await t.sim(1); // bodies are built before the first step
  // The L and the tower at the start.
  const L0 = await rel('L1', 'L2'), T0 = await rel('T1', 'T2');
  const bodies = await W(() => { const s = window.studio, ws = s.dm.workspace, get = n => ws.children.find(c => c.Name === n); const c = s.world.compounds.get(get('T2')) || s.world.compounds.get(get('T1')); return { n: s.world.compounds.size, tAgg: !!s.world.parts.get(get('T1')).agg || !!s.world.parts.get(get('T2')).agg, mass: c && c.body.getMassProperties().mass }; });
  const want = 1 * 8 * 1 * 0.7 + 6 * 1 * 6 * 7.85;
  check(bodies.n >= 4 && !bodies.tAgg, `each loose assembly is one body (${bodies.n} compound bodies; no per-part bodies in the tower)`);
  // One body per node: a body built twice for one part (a rebuild inside a rebuild) once left two
  // fighting on one mesh (a stack popped, slides and shoves were damped).
  const dup = await W(() => { const seen = new Map(); for (const b of window.studio.scene.getPhysicsEngine().getBodies()) seen.set(b.transformNode, (seen.get(b.transformNode) || 0) + 1); return [...seen.values()].filter(n => n > 1).length; });
  check(dup === 0, `no node carries two physics bodies (${dup} do)`);
  check(bodies.mass && Math.abs(bodies.mass - want) / want < 0.01, `its mass is its parts' (density x volume): ${bodies.mass && bodies.mass.toFixed(1)} vs ${want.toFixed(1)}`);

  // Run, checking the offsets every 10 frames.
  let lOK = true, tOK = true;
  for (let k = 0; k < 18; k++) {
    await t.sim(10);
    if (!same(await rel('L1', 'L2'), L0)) lOK = false;
    if (!same(await rel('T1', 'T2'), T0)) tOK = false;
    if (k === 3) await W(() => window.studio.vm.run('cut', '_G.cut:Destroy()'));
  }
  const L = await rel('L1', 'L2'), T = await rel('T1', 'T2');
  check(lOK && L.a[1] < 2 && L.a[1] > 0, `the L fell and rests on the floor (y ${L.a[1].toFixed(2)}), its parts' offset exact all the way`);
  check(tOK && T.up < 0.7, `the tower tipped over as one (its up axis now ${T.up.toFixed(2)} of vertical), the offset exact all the way`);
  const H = await rel('H1', 'H2');
  check(Math.abs(H.b[1] - 20) < 1e-3, `a loose part welded to an anchored one stays (y ${H.b[1].toFixed(3)})`);
  const S = await W(() => { const ws = window.studio.dm.workspace, s1 = ws.children.find(c => c.Name === 'S1'), s2 = ws.children.find(c => c.Name === 'S2'); return { y1: s1.props.CFrame.y, y2: s2.props.CFrame.y, r1: s1.props.AssemblyRootPart === s1, r2: s2.props.AssemblyRootPart === s2, agg: !!window.studio.world.parts.get(s1).agg && !!window.studio.world.parts.get(s2).agg }; });
  check(S.r1 && S.r2 && S.agg && S.y1 < 5 && S.y2 < 5, `a pair cut apart in the air becomes two bodies and both fall (y ${S.y1.toFixed(1)}, ${S.y2.toFixed(1)})`);

  // The door: Transform turns it about the hinge.
  const door = async deg => { await W(d => window.studio.vm.run('door', `_G.hinge.Transform = CFrame.Angles(0, math.rad(${d}), 0)`), deg); await t.sim(2); return W(() => { const ws = window.studio.dm.workspace, D = ws.children.find(c => c.Name === 'Door'), F = ws.children.find(c => c.Name === 'Frame'); return { d: [D.props.CFrame.x, D.props.CFrame.y, D.props.CFrame.z], f: [F.props.CFrame.x, F.props.CFrame.y, F.props.CFrame.z] }; }); };
  const d0 = await door(0), d90 = await door(90);
  check(Math.abs(d0.d[0] - 22.5) < 1e-3 && Math.abs(d0.d[2] - 60) < 1e-3, `the door hangs from its hinge (x ${d0.d[0].toFixed(2)})`);
  check(Math.abs(d90.d[0] - 20.5) < 1e-3 && Math.abs(d90.d[2] - 58) < 1e-3 && Math.abs(d90.f[0] - 20) < 1e-6, `turned 90° about the hinge (x ${d90.d[0].toFixed(2)}, z ${d90.d[2].toFixed(2)}); the frame stays`);

  // A script moves a resting assembly: all of it moves, then falls from there.
  const M0 = await rel('M1', 'M2');
  await W(() => window.studio.vm.run('move', 'workspace.M1.CFrame = CFrame.new(60, 30, -30)'));
  const Mm = await rel('M1', 'M2');
  check(Math.abs(Mm.a[1] - 30) < 1e-3 && same(Mm, M0), 'setting one part\'s CFrame moves the whole assembly');
  await t.sim(90);
  const Mf = await rel('M1', 'M2');
  check(Mf.a[1] < 3 && same(Mf, M0), `and it falls from there as one (y ${Mf.a[1].toFixed(2)})`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
