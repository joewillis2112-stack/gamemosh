export default async function (t) {
  await t.sim(5);
  const r = await t.eval(() => {
    const p = window.studio.player, A = p.anim, Q = p.holder.rotationQuaternion.constructor, V = p.holder.position.constructor;
    const mesh = n => p.meshes.find(m => m.name === n), clip = A.clips.sprint, len = A.duration('sprint');
    const arms = ['arm-left', 'arm-right'].map(n => clip.channels.find(c => c.target.name === n && c.path === 'rotationQuaternion'));
    const base = arms.map(ch => ch.at);
    const others = ['leg-left', 'leg-right'].map(mesh);
    const depth = (deg, sgn) => {
      arms.forEach((ch, k) => { const s = (k === 0 ? 1 : -1) * sgn, c = Q.RotationAxis(new V(0, 0, 1), s * deg * Math.PI / 180); ch.at = tt => ch.anim.evaluate(clip.from + tt * clip.fps).multiply(c); });
      let worst = 0, inside = 0, flush = 0;
      for (let i = 0; i < 48; i++) {
        A.layers = [{ clip: 'sprint', time: i * len / 48, weight: 1, target: 1, speed: 0 }]; A.update(0);
        for (const o of others) {
          o.computeWorldMatrix(true); const inv = o.getWorldMatrix().clone().invert(), bb = o.getBoundingInfo().boundingBox;
          for (const an of ['arm-left', 'arm-right']) {
            const am = mesh(an); am.computeWorldMatrix(true); const pos = am.getVerticesData('position'), W = am.getWorldMatrix();
            for (let j = 0; j < pos.length; j += 3) {
              const l = V.TransformCoordinates(V.TransformCoordinates(new V(pos[j], pos[j + 1], pos[j + 2]), W), inv);
              const d = Math.min(l.x - bb.minimum.x, bb.maximum.x - l.x, l.y - bb.minimum.y, bb.maximum.y - l.y, l.z - bb.minimum.z, bb.maximum.z - l.z);
              if (Math.abs(d) < 0.002 && d > -0.002) flush++; if (d > 0.002) { inside++; worst = Math.max(worst, d); }
            }
          }
        }
      }
      return [+worst.toFixed(3), inside, flush];
    };
    const out = {};
    for (const deg of [0, 2, 4, 6, 8]) for (const sgn of deg ? [1, -1] : [1]) out[`${sgn * deg}`] = depth(deg, sgn);
    arms.forEach((ch, k) => { ch.at = base[k]; }); A.layers = [];
    return out;
  });
  console.log('roll deg -> [worst depth, inside, flush]', JSON.stringify(r));
}
