// The editor's Toolbox (web/editor/toolbox.js): free models from assets/library/catalog.json.
// What it must do for a creator: the button opens it; search and the categories narrow it; a
// tap inserts the model as a MeshPart at its real size, resting on what the camera looks at,
// selected, as one undo step; its file and textures load (from the CDN; here the fixtures in
// test/fixtures/library, routed by tools/play.mjs); a Poly Haven model's textures come at the
// tier's resolution and follow a tier change; deleting one copy leaves another copy whole;
// Escape and × close it. Desktop and phone.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const tap = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const PH = 'polyhaven/WetFloorSign_01', KG = 'kenney/city-builder/building-garage';

  await E(() => window.editor.toolbox.ready);
  const cat = await E(() => { const tb = window.editor.toolbox; return { n: tb.items.length, cats: tb.categories(), error: tb.error || null, ids: tb.items.map(i => i.id) }; });
  check(!cat.error && cat.n > 300, `the catalog loads (${cat.n} models${cat.error ? ', ' + cat.error : ''})`);
  check(cat.ids.includes(PH) && cat.ids.includes(KG), 'it lists the fixture models (a Poly Haven one and a Kenney one)');

  // Open: the panel shows, the button is on.
  check(await E(() => document.getElementById('toolbox').hidden), 'closed at first');
  await tap('#ui [data-act=toolbox]');
  check(await E(() => !document.getElementById('toolbox').hidden && document.querySelector('#ui [data-act=toolbox]').classList.contains('on')), 'the Toolbox button opens it and shows as on');
  const tiles = () => E(() => [...document.querySelectorAll('#toolbox [data-item]')].map(b => b.dataset.item));
  check((await tiles()).length === Math.min(200, cat.n), 'every model has a tile (up to 200)');
  // Thumbnails load (they're ours, in assets/library/thumbs).
  await t.page.waitForTimeout(300);
  const thumbs = await E(() => [...document.querySelectorAll('#toolbox [data-item] img')].slice(0, 6).map(i => i.complete && i.naturalWidth));
  check(thumbs.every(w => w === 160), `the first tiles' thumbnails load at 160 px (${thumbs})`);

  // Search: every word must match; the fixture models are found by name or tag.
  const search = async s => { await t.page.fill('#toolbox input', s); await E(() => window.editor.frames(1)); return tiles(); };
  const wet = await search('wet floor');
  check(wet.includes(PH) && wet.length < 10, `"wet floor" finds the sign (${wet.length} results)`);
  const garage = await search('garage');
  check(garage.includes(KG), '"garage" finds the Kenney garage');
  const none = await search('zzqx');
  check(!none.length && await E(() => !!document.querySelector('#toolbox .tb-none')), 'no match says so');
  await search('');

  // A category: every tile shown is in it; All again shows everything.
  const c0 = cat.cats[0];
  await tap(`#toolbox [data-cat="${c0}"]`);
  const inCat = await E(c => { const tb = window.editor.toolbox; return [...document.querySelectorAll('#toolbox [data-item]')].every(b => tb.items.find(i => i.id === b.dataset.item).categories.includes(c)); }, c0);
  check(inCat && (await tiles()).length > 0, `category "${c0}" shows only its models`);
  await tap('#toolbox [data-cat=""]');
  check((await tiles()).length === Math.min(200, cat.n), 'All shows every model again');

  // Insert: the tile's tap. Waits for the model's file and textures.
  const loaded = name => E(async name => {
    const ed = window.editor, inst = ed.dm.workspace.children.find(c => c.props.Name === name);
    for (let i = 0; i < 300; i++) {
      const e = inst && ed.world.parts.get(inst), mp = e && e.meshPart;
      if (mp && mp.render.length && mp.render.every(m => m.material && m.material.isReady(m))) {
        const tex = [...new Set(mp.render.map(m => m.material))].flatMap(m => m.getActiveTextures());
        if (tex.every(x => x.isReady())) return { ok: true, textures: tex.length, urls: tex.map(x => x.url || x.name) };
      }
      await new Promise(r => setTimeout(r, 50)); ed.frames(1);
    }
    return { ok: false };
  }, name);
  const before = await E(() => window.editor.dm.workspace.children.length);
  await search('wet floor');
  await tap(`#toolbox [data-item="${PH}"]`);
  const ins = await E(id => {
    const ed = window.editor, it = ed.toolbox.items.find(i => i.id === id), sel = ed.commands.selection.items;
    const p = sel[0];
    return p && { cls: p.ClassName, name: p.props.Name, mesh: p.props.MeshId, size: [p.props.Size.x, p.props.Size.y, p.props.Size.z], want: it.size, y: p.props.CFrame.y, n: ed.dm.workspace.children.length, sel: sel.length };
  }, PH);
  check(ins && ins.cls === 'MeshPart' && ins.sel === 1 && ins.n === before + 1, 'a tap inserts one MeshPart, selected');
  check(ins && ins.size.every((v, i) => Math.abs(v - ins.want[i]) < 1e-6), `at its real size in studs (${ins && ins.size.map(v => v.toFixed(2))})`);
  check(ins && /_1k\.gltf$/.test(ins.mesh), 'its MeshId is the model\'s own URL (1k: the World picks the resolution)');
  const l1 = await loaded(ins.name);
  check(l1.ok && l1.textures >= 3, `its file and ${l1.textures} textures load`);
  // Where it rests: its bottom on the baseplate's top, its rendered bounds the part's Size.
  const geo = await E(name => {
    const ed = window.editor, inst = ed.dm.workspace.children.find(c => c.props.Name === name), mp = ed.world.parts.get(inst).meshPart;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const m of mp.render) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; b.minimumWorld.asArray().forEach((v, i) => { lo[i] = Math.min(lo[i], v); }); b.maximumWorld.asArray().forEach((v, i) => { hi[i] = Math.max(hi[i], v); }); }
    // What it stands on: the highest top below it of the (axis-aligned) parts under its centre.
    const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
    const tops = ed.dm.workspace.children.filter(c => c !== inst && c.props.Size && c.props.CFrame && Math.abs(c.props.CFrame.x - cx) <= c.props.Size.x / 2 && Math.abs(c.props.CFrame.z - cz) <= c.props.Size.z / 2)
      .map(c => c.props.CFrame.y + c.props.Size.y / 2).filter(y => y <= lo[1] + 0.05);
    return { size: hi.map((v, i) => v - lo[i]), bottom: lo[1], top: tops.length ? Math.max(...tops) : null, cache: [...ed.world.meshCache.keys()] };
  }, ins.name);
  check(geo.size.every((v, i) => Math.abs(v - ins.size[i]) < 0.02 * ins.size[i] + 0.01), `the drawn model fills its Size (${geo.size.map(v => v.toFixed(2))})`);
  check(geo.top !== null && Math.abs(geo.bottom - geo.top) < 0.05, `it rests on what is under it (bottom ${geo.bottom.toFixed(3)}, top ${geo.top})`);
  // The page's tier picks the resolution: 2k on high (desktop), 1k on phone.
  const tier = await E(() => window.editor.R.quality), res = tier === 'phone' ? '1k' : '2k';
  check(geo.cache.some(u => u.endsWith(`/${res}/WetFloorSign_01/WetFloorSign_01_${res}.gltf`)) && geo.cache.filter(u => /WetFloorSign/.test(u)).length === 1, `on the ${tier} tier its ${res} file is loaded (and no other)`);

  // One undo step; redo brings it back (and it loads again).
  await E(() => window.editor.commands.run('undo'));
  check(await E(n => !window.editor.dm.workspace.children.some(c => c.props.Name === n), ins.name), 'undo removes it');
  await E(() => window.editor.commands.run('redo'));
  check((await loaded(ins.name)).ok, 'redo puts it back, loaded');
  if (!phone) await t.golden('editor-toolbox', { text: true });

  // A second copy; deleting the first leaves the second's textures whole (they're shared).
  await tap(`#toolbox [data-item="${PH}"]`);
  const two = await E(name => { const ed = window.editor, all = ed.dm.workspace.children.filter(c => c.props.Name === name); return all.length; }, ins.name);
  check(two === 2, 'a second tap inserts a second copy');
  await E(name => { const ed = window.editor, first = ed.dm.workspace.children.find(c => c.props.Name === name); ed.commands.run('delete', { items: [first] }); }, ins.name);
  const l2 = await loaded(ins.name);
  check(l2.ok, 'deleting one copy leaves the other\'s materials and textures ready');

  // A tier change: the model reloads at 4k (ultra), and the 2k file is let go.
  await E(() => window.editor.world.setTier('ultra'));
  const l3 = await loaded(ins.name);
  const cache3 = await E(() => [...window.editor.world.meshCache.keys()]);
  check(l3.ok && cache3.some(u => u.endsWith('/4k/WetFloorSign_01/WetFloorSign_01_4k.gltf')) && cache3.filter(u => /WetFloorSign/.test(u)).length === 1, `ultra reloads it at 4k and lets the ${res} file go`);
  await E(t => window.editor.world.setTier(t), tier);
  check((await loaded(ins.name)).ok && (await E(() => [...window.editor.world.meshCache.keys()])).some(u => u.endsWith(`_${res}.gltf`)), `and back to ${res} on ${tier}`);

  // A Kenney model: its file and its kit's shared texture.
  await search('garage');
  await tap(`#toolbox [data-item="${KG}"]`);
  const kname = await E(() => window.editor.commands.selection.items[0].props.Name);
  const lk = await loaded(kname);
  check(lk.ok && lk.textures >= 1, `a Kenney model loads with its kit's texture (${lk.textures})`);

  // A model with a flat base (a road tile) sits its lift above the surface, so its asphalt doesn't
  // z-fight with the floor.
  const ROAD = 'kenney/city-builder/road-straight';
  await search('road straight');
  await tap(`#toolbox [data-item="${ROAD}"]`);
  const road = await E(id => { const ed = window.editor, p = ed.commands.selection.items[0], it = ed.toolbox.items.find(i => i.id === id); return { lift: it.lift, bottom: p.props.CFrame.y - p.props.Size.y / 2, x: p.props.CFrame.x, z: p.props.CFrame.z, name: p.props.Name }; }, ROAD);
  const under = await E(r => Math.max(...window.editor.dm.workspace.children.filter(c => c.props.Name !== r.name && c.props.Size && c.props.CFrame && Math.abs(c.props.CFrame.x - r.x) <= c.props.Size.x / 2 && Math.abs(c.props.CFrame.z - r.z) <= c.props.Size.z / 2).map(c => c.props.CFrame.y + c.props.Size.y / 2).filter(y => y <= r.bottom + 0.05)), road);
  check(road.lift > 0 && Math.abs(road.bottom - under - road.lift) < 1e-6, `a road tile sits its lift (${road.lift}) above what it's on (${(road.bottom - under).toFixed(3)})`);
  check((await loaded(road.name)).ok, 'and loads');

  // Closing: Escape in the search box, the ×.
  await t.page.focus('#toolbox input'); await t.page.keyboard.press('Escape');
  check(await E(() => document.getElementById('toolbox').hidden && !document.querySelector('#ui [data-act=toolbox]').classList.contains('on')), 'Escape in the search closes it (the button goes off)');
  await tap('#ui [data-act=toolbox]');
  await tap('#toolbox [data-tb-close]');
  check(await E(() => document.getElementById('toolbox').hidden), '× closes it');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
