// Solid modelling in play, by script (Roblox's BasePart:UnionAsync, SubtractAsync, IntersectAsync):
// the results come back with no Parent, the calling part's look, Roblox's class and name; drawn
// as their mesh with each part's colour; collided as their mesh: a ball dropped over the hole a
// SubtractAsync cut falls through it to the baseplate, one dropped beside the hole rests on the
// slab; an empty subtraction and a MeshPart are errors.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const out = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  const line = p => out().filter(l => l.startsWith(p)).pop() || '';
  await t.sim(5);
  await E(() => window.studio.vm.run('unions', `
    local function block(name, size, pos, color)
      local p = Instance.new("Part") p.Name = name p.Size = size p.Position = pos p.Anchored = true p.Color = color p.Parent = workspace
      return p
    end
    -- A slab with a square hole through it.
    local slab = block("Slab", Vector3.new(12, 4, 12), Vector3.new(0, 2, -30), Color3.fromRGB(200, 200, 200))
    local hole = block("Hole", Vector3.new(4, 8, 4), Vector3.new(0, 2, -30), Color3.new(1, 0, 0))
    local cut = slab:SubtractAsync({hole})
    print("cut", cut.ClassName, cut.Name, cut.Parent == nil, cut.Anchored, cut.Color == slab.Color)
    cut.Parent = workspace slab:Destroy() hole:Destroy()
    -- Two blocks joined, red and blue.
    local a = block("A", Vector3.new(4, 4, 4), Vector3.new(20, 2, -30), Color3.new(1, 0, 0))
    local b = block("B", Vector3.new(4, 4, 4), Vector3.new(22, 4, -30), Color3.new(0, 0, 1))
    local u = a:UnionAsync({b}, Enum.CollisionFidelity.Default, Enum.RenderFidelity.Automatic)
    print("union", u.ClassName, u.Name, u.Size.X, u.Size.Y, u.UsePartColor)
    local i = a:IntersectAsync({b})
    print("intersect", i.ClassName, i.Size.X, i.Size.Y)
    u.Parent = workspace a:Destroy() b:Destroy()
    local tiny = block("Tiny", Vector3.new(1, 1, 1), Vector3.new(-20, 10, -30), Color3.new(1, 1, 1))
    local big = block("Big", Vector3.new(4, 4, 4), Vector3.new(-20, 10, -30), Color3.new(1, 1, 1))
    print("empty", pcall(function() return tiny:SubtractAsync({big}) end))
    local mp = Instance.new("MeshPart")
    print("meshpart", (pcall(function() return big:UnionAsync({mp}) end)))
    tiny:Destroy() big:Destroy()
    -- Two loose balls: one over the hole, one over the slab beside it.
    for n, x in {Through = 0, Rest = 4} do
      local p = Instance.new("Part") p.Name = n p.Shape = Enum.PartType.Ball p.Size = Vector3.new(2, 2, 2) p.Position = Vector3.new(x, 14, -30) p.Parent = workspace
    end
  `));
  // Each Async call yields and resumes once the page's tasks run: step with real pauses until the
  // script is through (t.sim alone runs frames back to back).
  for (let i = 0; i < 40 && !line('meshpart'); i++) { await t.sim(2); await t.page.waitForTimeout(20); }
  await t.sim(150);
  check(line('cut') === 'cut UnionOperation Union true true true', `SubtractAsync: a UnionOperation named Union, no Parent, the slab's Anchored and Color (${line('cut')})`);
  check(line('union') === 'union UnionOperation Union 6 6 false', `UnionAsync: the two blocks' extent, 6 x 6 (${line('union')})`);
  check(line('intersect') === 'intersect IntersectOperation 2 2', `IntersectAsync: an IntersectOperation of the 2 x 2 overlap (${line('intersect')})`);
  check(/^empty false .*empty/.test(line('empty')), `an empty subtraction is an error (${line('empty')})`);
  check(line('meshpart') === 'meshpart false', `a MeshPart can't take part (${line('meshpart')})`);
  const st = await E(() => { const s = window.studio, w = s.dm.workspace, f = n => w.children.find(c => c.props.Name === n);
    const e = s.world.parts.get(f('Union')), c = s.world.parts.get(w.children.find(c => c.ClassName === 'UnionOperation' && c.props.Name === 'Union' && c.props.Size.x === 12));
    return { through: f('Through').props.CFrame.y, rest: f('Rest').props.CFrame.y, drawn: !!(e && e.meshPart && e.meshPart.render.length === 1 && e.meshPart.colored), cutDrawn: !!(c && c.meshPart && c.meshPart.render.length === 1), tris: f('Union').props.TriangleCount };
  });
  check(st.drawn && st.cutDrawn && st.tris >= 12, `both results drawn as their mesh, the union in its parts' colours (${st.tris} triangles)`);
  check(Math.abs(st.through - 1) < 0.3, `a ball dropped over the hole falls through it to the baseplate (y ${st.through.toFixed(2)})`);
  check(Math.abs(st.rest - 5) < 0.3, `a ball dropped beside the hole rests on the slab (y ${st.rest.toFixed(2)}; its top is 4)`);
  await E(() => window.studio.vm.run('cam', 'local c = workspace.CurrentCamera c.CameraType = Enum.CameraType.Scriptable c.CFrame = CFrame.lookAt(Vector3.new(10, 22, -6), Vector3.new(10, 2, -30))'));
  await t.frames(2);
  await t.golden('unions');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
