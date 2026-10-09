// The character's parts never share a visible face plane (which z-fights in
// stripes): through idle, walk and sprint, no vertex of a leg lies on the
// torso's side or front/back planes inside its extent, and none of an arm on a
// leg's or the torso's. (A leg's top meeting the torso's bottom is back to
// back and never visible, so the up axis isn't counted.) The model's legs
// lay in the torso's side planes until character.js narrowed them 2%.
export default async function (t) {
  await t.sim(5);
  const r = await t.eval(() => {
    const p = window.studio.player, A = p.anim, V = p.holder.position.constructor, mesh = n => p.meshes.find(m => m.name === n), out = {}, e = 2e-3;
    const pairs = [['leg-left', 'torso'], ['leg-right', 'torso'], ['arm-left', 'leg-left'], ['arm-right', 'leg-right'], ['arm-left', 'torso'], ['arm-right', 'torso']];
    for (const clip of ['idle', 'walk', 'sprint']) {
      const len = A.duration(clip);
      for (const [a, b] of pairs) {
        let flush = 0;
        for (let i = 0; i < 24; i++) {
          A.layers = [{ clip, time: i * len / 24, weight: 1, target: 1, speed: 0 }]; A.update(0);
          const am = mesh(a), bm = mesh(b); am.computeWorldMatrix(true); bm.computeWorldMatrix(true);
          const inv = bm.getWorldMatrix().clone().invert(), { minimum: mn, maximum: mx } = bm.getBoundingInfo().boundingBox, pos = am.getVerticesData('position'), W = am.getWorldMatrix();
          for (let j = 0; j < pos.length; j += 3) {
            const l = V.TransformCoordinates(V.TransformCoordinates(new V(pos[j], pos[j + 1], pos[j + 2]), W), inv);
            const inside = l.x > mn.x - e && l.x < mx.x + e && l.y > mn.y - e && l.y < mx.y + e && l.z > mn.z - e && l.z < mx.z + e;
            const onSide = Math.min(Math.abs(l.x - mn.x), Math.abs(l.x - mx.x)) < e || Math.min(Math.abs(l.z - mn.z), Math.abs(l.z - mx.z)) < e;
            if (inside && onSide) flush++;
          }
        }
        if (flush) out[clip + ' ' + a + '/' + b] = flush;
      }
    }
    A.layers = [];
    return out;
  });
  console.log('flush vertices by clip and pair:', JSON.stringify(r));
  if (Object.keys(r).length) throw new Error('FAIL: body parts share a visible face plane: ' + JSON.stringify(r));
  console.log('ok   no two body parts share a visible face plane in idle, walk or sprint');
}
