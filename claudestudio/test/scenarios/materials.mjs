// Textured materials (places/materials-lab.luau): every listed material draws
// with its texture set, tinted by the part's Color, tiled in studs (a slab
// twice as wide shows twice the repeats), and switching a part back to
// Plastic drops the textures. Goldens: the lab and a brick corner (the
// courses meet at the edge and the mortar reads recessed on both faces).
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(10);
  const r = await t.eval(() => {
    const s = window.studio, out = {};
    for (const [inst, e] of s.world.parts) {
      if (!/Slab$/.test(inst.Name)) continue;
      const m = e.mesh.material, uv = e.mesh.getVerticesData('uv');
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < uv.length; i += 2) { lo = Math.min(lo, uv[i]); hi = Math.max(hi, uv[i]); }
      out[inst.Name.replace('Slab', '')] = { tex: !!(m.albedoTexture && m.bumpTexture && m.metallicTexture), url: m.albedoTexture && m.albedoTexture.url, uSpan: hi - lo };
    }
    return out;
  });
  const names = Object.keys(r);
  check(names.length === 14 && names.every(n => r[n].tex && r[n].url.includes(`/materials/${n}/albedo.jpg`)), `14 materials draw with their own albedo, normal and ORM maps (${names.length})`);
  // A 12-stud slab: Wood tiles every 8 studs (1.5 repeats), Brick every 12 (1), Fabric every 4 (3).
  check(Math.abs(r.Wood.uSpan - 1.5) < 1e-3 && Math.abs(r.Brick.uSpan - 1) < 1e-3 && Math.abs(r.Fabric.uSpan - 3) < 1e-3, 'textures tile in studs, not per part');
  const back = await t.eval(() => {
    const s = window.studio, i = s.dm.workspace.children.find(c => c.Name === 'Brick');
    s.dm.set(i, 'Size', new i.props.Size.constructor(12, 6, 6));
    const uv = s.world.parts.get(i).mesh.getVerticesData('uv'); let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < uv.length; k += 2) { lo = Math.min(lo, uv[k]); hi = Math.max(hi, uv[k]); }
    s.vm.run('plastic', 'workspace.Wood.Material = Enum.Material.Plastic');
    const w = s.world.parts.get(s.dm.workspace.children.find(c => c.Name === 'Wood')).mesh.material;
    const out = { span: hi - lo, plastic: !w.albedoTexture && !w.bumpTexture };
    s.dm.set(i, 'Size', new i.props.Size.constructor(6, 6, 6));
    s.vm.run('wood', 'workspace.Wood.Material = Enum.Material.Wood');
    return out;
  });
  check(Math.abs(back.span - 1) < 1e-3, 'resizing a part re-tiles it (a 12-stud brick face: one repeat)');
  check(back.plastic, 'back to Plastic: the textures go');
  const view = async (name, focus, yaw, pitch, zoom) => {
    await t.eval(([f, y, p, z]) => { const c = window.studio.camera; c.focus = f; c.yaw = y * Math.PI / 180; c.pitch = p * Math.PI / 180; c.zoom = c.z = c.dist = z; }, [focus, yaw, pitch, zoom]);
    await t.frames(3); await t.shot(name); await t.golden(name);
  };
  await view('materials-lab', [0, 3, 30], 200, 30, 50);
  await view('materials-brick', [-14, 5, 20], 225, 8, 7);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
