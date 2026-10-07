// Foot slip. The blocky legs swing like scissors: a sole touches the ground
// only as its leg passes under the hip. At that moment the leg sweeping
// backward is the planted one, and its world speed should be ~0 (positive =
// skating forward, negative = moonwalking). Reported per stick deflection.
export default async function (t) {
  await t.sim(30);
  const results = [];
  for (const mv of [1, 0.75, 0.5, 0.25]) {
    await t.sim(60, { move: [0, mv] });
    const r = await t.eval(([mv]) => {
      const S = window.studio, p = S.player, V = p.holder.position.constructor;
      const legs = p.meshes.filter(m => /^leg-(left|right)$/.test(m.name));
      const sole = m => { const b = m.getBoundingInfo().boundingBox; m.computeWorldMatrix(true); return V.TransformCoordinates(new V((b.minimum.x + b.maximum.x) / 2, b.minimum.y, (b.minimum.z + b.maximum.z) / 2), m.getWorldMatrix()); };
      const fr = [];
      for (let i = 0; i < 180; i++) { S.sim(1, { move: [0, mv] }); fr.push({ soles: legs.map(sole), body: p.holder.position.clone() }); }
      const slips = [];
      for (let i = 1; i < fr.length - 1; i++) {
        for (let k = 0; k < legs.length; k++) {
          const y = j => fr[j].soles[k].y;
          if (!(y(i) <= y(i - 1) && y(i) < y(i + 1))) continue; // lowest point of this sole's arc
          const vz = (fr[i + 1].soles[k].z - fr[i - 1].soles[k].z) * 30;  // world, studs/s (direction of travel is +Z)
          const rel = vz - (fr[i + 1].body.z - fr[i - 1].body.z) * 30;
          if (rel < 0) slips.push(vz); // the backward-sweeping (planted) leg
        }
      }
      const body = (fr[fr.length - 1].body.z - fr[0].body.z) / ((fr.length - 1) / 60);
      return { stick: mv, body, clip: p.anim.current, rate: p.anim.layers.find(l => l.clip === p.anim.current).speed, crossings: slips.length, slipMean: slips.reduce((a, b) => a + b, 0) / (slips.length || 1) };
    }, [mv]);
    results.push(r);
    console.log(JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
  }
  const nat = await t.eval(() => [window.studio.player.walkNatural, window.studio.player.sprintNatural, window.studio.player.legLength]);
  console.log('walkNatural, sprintNatural, hip height', nat.map(v => v.toFixed(2)).join(', '));
}
