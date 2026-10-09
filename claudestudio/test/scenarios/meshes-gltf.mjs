// glTF MeshParts in a place (places/mesh-lab.luau):
// - CreateMeshPartAsync yields until the file loads, and returns the part at its
//   MeshSize (glTF metres / 0.28);
// - the drawn model fills exactly the part's box (centred, any Size, stretched);
// - Instance.new + MeshId set by a script loads too, and keeps the script's Size;
// - colliders follow CollisionFidelity: exact mesh when anchored, hull when loose,
//   and the loose crate falls and rests on the floor; mass from the mesh's volume;
// - Transparency reaches the file's meshes.
// Golden: the lab, realistic and blocky side by side.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  // Loading is asynchronous: step until the script says it's done.
  for (let i = 0; i < 60; i++) {
    await t.sim(10);
    if (t.logs.some(l => l.includes('meshes ready'))) break;
    await t.page.waitForTimeout(100);
  }
  await t.sim(180); // the crate falls and settles (3 s)
  const logs = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  console.log(logs.join(' | '));
  const r = await t.eval(() => {
    const S = window.studio, out = {};
    for (const [inst, e] of S.world.parts) {
      if (inst.ClassName !== 'MeshPart') continue;
      const P = inst.props, mp = e.meshPart;
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const m of mp.render) {
        m.computeWorldMatrix(true); m.refreshBoundingInfo();
        const b = m.getBoundingInfo().boundingBox;
        // the model's extent along the part's own axes (rotate world corners into part space)
        const q = e.mesh.rotationQuaternion, inv = q.clone().conjugate(), c = e.mesh.position;
        for (const v of b.vectorsWorld) { const d = v.subtract(c).applyRotationQuaternion(inv); ['x', 'y', 'z'].forEach((k, i) => { lo[i] = Math.min(lo[i], d[k]); hi[i] = Math.max(hi[i], d[k]); }); }
      }
      out[P.Name] = {
        size: [P.Size.x, P.Size.y, P.Size.z], meshSize: [P.MeshSize.x, P.MeshSize.y, P.MeshSize.z], pos: [P.CFrame.x, P.CFrame.y, P.CFrame.z],
        drawn: hi.map((h, i) => h - lo[i]), offset: hi.map((h, i) => (h + lo[i]) / 2),
        shape: e.agg && e.agg.shape.type, mass: e.agg && e.agg.body.getMassProperties().mass, render: mp.render.length,
      };
    }
    return out;
  });
  console.log(JSON.stringify(r));
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])));
  const H = r.Helmet, Sl = r.Slab, C = r.Crate, B = r.Ball;
  check(H && logs.some(l => /^helmet [\d.]+ true$/.test(l)) && H.meshSize[0] > 3 && near(H.size, H.meshSize, 1e-6), `CreateMeshPartAsync yields, then returns the part at its MeshSize (${H && H.meshSize.map(v => v.toFixed(2))})`);
  check(H && near(H.drawn, H.size, 0.01) && near(H.offset, [0, 0, 0], 0.01), 'the drawn helmet fills its part box exactly (any rotation)');
  check(Sl && near(Sl.size, [8, 2, 4], 1e-6) && near(Sl.drawn, [8, 2, 4], 0.01) && Math.abs(Sl.meshSize[0] - 1 / 0.28) < 0.01, `Instance.new + MeshId loads, keeps the script's Size and stretches to it (MeshSize ${Sl && Sl.meshSize[0].toFixed(3)} = 1 m)`);
  check(H && H.shape === 6 && C && C.shape === 4, `colliders: anchored Default = exact mesh (${H && H.shape}), loose Hull = convex hull (${C && C.shape})`);
  check(C && Math.abs(C.pos[1] - 1.5) < 0.1 && Math.abs(C.pos[0] - 10) < 0.6, `the loose crate fell and rests on the floor (y ${C && C.pos[1].toFixed(3)})`);
  check(C && Math.abs(C.mass - 0.7 * 27) < 0.3, `mass = Plastic density x the mesh's volume (${C && C.mass.toFixed(2)}, 18.9 expected)`);
  // tools/make-test-sphere.py: the sphere's polyhedron is 0.515243 of its box.
  check(B && Math.abs(B.mass - 0.7 * 0.515243 * 8) < 0.02, `a ball's mass uses the mesh's own volume (${B && B.mass.toFixed(3)}, ${(0.7 * 0.515243 * 8).toFixed(3)} expected; its box would give 5.6)`);
  const tr = await t.eval(() => { const S = window.studio, h = [...S.world.parts.keys()].find(i => i.props.Name === 'Helmet'); S.dm.set(h, 'Transparency', 0.5); const v = S.world.parts.get(h).meshPart.render.map(m => m.visibility); S.dm.set(h, 'Transparency', 0); return v; });
  check(tr.length && tr.every(v => v === 0.5), 'Transparency reaches every mesh of the file');
  await t.frames(3);
  await t.shot('mesh-lab'); await t.golden('mesh-lab');
  // Close up on the helmet (the asset gate looks at materials up close).
  await t.eval(() => { const S = window.studio, p = S.player, V = p.holder.position.constructor; p.teleport(new V(-4, 0, 1), Math.PI); S.camera.snapBehind(); S.camera.zoom = S.camera.dist = 0.5; S.camera.pitch = 0.05; S.sim(30); });
  await t.frames(3);
  await t.shot('mesh-lab-helmet'); await t.golden('mesh-lab-helmet');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
