// The end of a camera's post-process chain, shared: Babylon's pipeline (bloom, tonemap) comes first,
// then ours in a fixed order by rank, whoever asked first. Each owner says which passes it has now;
// the chain is re-attached only when the order is wrong (Babylon's pipeline re-attaches its own
// passes when it rebuilds, which would put them after ours).
// Ranks: 10 Lighting's post effects (depth of field, sun rays, blur, colour correction),
// 20 outlines (OutlineEffect), 30 Highlights, 40 PixelEffect (it pixelates everything above).
const owners = new WeakMap(); // camera -> Map(owner -> { rank, passes })

export function keepLast(camera, owner, rank, passes) {
  if (!owners.has(camera)) owners.set(camera, new Map());
  const m = owners.get(camera);
  if (passes.length) m.set(owner, { rank, passes: passes.slice() }); else m.delete(owner);
  const want = [...m.values()].sort((a, b) => a.rank - b.rank).flatMap(o => o.passes);
  const list = (camera._postProcesses || []).filter(Boolean);
  if (!want.length || want.every((pp, i) => list[list.length - want.length + i] === pp)) return;
  for (const pp of want) camera.detachPostProcess(pp);
  for (const pp of want) camera.attachPostProcess(pp);
}
