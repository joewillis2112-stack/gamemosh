// Ramps and stairs (places/movement-lab.luau): walk up and back down each,
// measuring height gained, speed along the ground, time grounded and the
// animation states seen (a "fall" mid-ramp is a bug).
// Checks are PLAN.md's targets: ramps 15-75° walked up and down fully grounded
// at walk speed with no fall state; steps up to 0.8 seamless, 1.0 a slight
// slowdown, 1.2 slower, 1.5 and up blocked.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { if (!ok) { console.log('FAIL ' + what); fail.push(what); } };
  await t.sim(30);
  const geo = await t.eval(() => [...window.studio.world.parts].filter(([i]) => /^Ramp/.test(i.Name)).map(([i, e]) => {
    e.mesh.computeWorldMatrix(true); const b = e.mesh.getBoundingInfo().boundingBox;
    return [i.Name, +b.minimumWorld.y.toFixed(2), +b.maximumWorld.y.toFixed(2), +b.minimumWorld.z.toFixed(2), +b.maximumWorld.z.toFixed(2)];
  }));
  console.log('ramp boxes [name, minY, maxY, minZ, maxZ]', JSON.stringify(geo));

  const run = async (x, upFrames, downFrames) => t.eval(([x, upF, downF]) => {
    const S = window.studio, p = S.player, V = p.holder.position.constructor;
    p.teleport(new V(x, 0, 12), 0);
    S.camera.yaw = Math.PI;
    S.sim(20);
    const leg = (frames, mv) => {
      let ground = 0, states = [], maxY = -1e9, y0 = p.footPosition.y, z0 = p.footPosition.z, path = 0, prev = p.footPosition.clone();
      for (let i = 0; i < frames; i++) {
        S.sim(1, { move: mv });
        const f = p.footPosition;
        path += f.subtract(prev).length(); prev = f.clone();
        if (p.grounded) ground++;
        if (states[states.length - 1] !== p.state) states.push(p.state);
        maxY = Math.max(maxY, f.y);
      }
      return { rise: +(p.footPosition.y - y0).toFixed(2), maxY: +maxY.toFixed(2), dz: +(p.footPosition.z - z0).toFixed(2), speed: +(path / (frames / 60)).toFixed(2), grounded: +(ground / frames).toFixed(2), states: states.join('>') };
    };
    const up = leg(upF, [0, 1]);
    const down = leg(downF, [0, -1]);
    return { up, down };
  }, [x, upFrames, downFrames]);

  for (const [i, angle] of [15, 30, 45, 60, 75].entries()) {
    // Stop 3 studs short of the ramp's top end (it's 40 long), then walk back down.
    const frames = Math.round(((40 * Math.cos(angle * Math.PI / 180) + 8 - 3) / 16) * 60);
    const r = await run(-60 + (i + 1) * 16, frames, frames);
    console.log(`ramp ${angle}°  up ${JSON.stringify(r.up)}\n           down ${JSON.stringify(r.down)}`);
    for (const [leg, v] of Object.entries(r)) {
      check(v.grounded === 1 && v.states === 'walk', `ramp ${angle}° ${leg}: always grounded and walking (${v.grounded}, ${v.states})`);
      check(Math.abs(v.dz) / (frames / 60) > 15, `ramp ${angle}° ${leg}: horizontal speed near WalkSpeed (${(Math.abs(v.dz) / (frames / 60)).toFixed(2)})`);
    }
    check(Math.abs(r.up.rise + r.down.rise) < 0.05, `ramp ${angle}°: back down to where it started`);
  }
  for (const [i, rise] of [0.5, 0.8, 1, 1.2, 1.5, 2].entries()) {
    const r = await run(24 + (i + 1) * 14, 90, 90);
    console.log(`stairs rise ${rise}  up ${JSON.stringify(r.up)} (top ${rise * 8})\n                  down ${JSON.stringify(r.down)}`);
    const speed = r.up.speed / 16;
    if (rise <= 0.8) check(Math.abs(r.up.rise - rise * 8) < 0.05 && r.up.states === 'walk' && speed > 0.98, `stairs ${rise}: seamless to the top (${r.up.rise}, ${r.up.states}, ${speed.toFixed(2)})`);
    else if (rise === 1) check(r.up.rise > 4 && speed > 0.85 && speed < 0.98, `stairs 1: climbs with a slight slowdown (${r.up.rise}, ${speed.toFixed(2)})`);
    else if (rise === 1.2) check(r.up.rise > 2 && speed > 0.4 && speed < 0.85, `stairs 1.2: climbs, clearly slower (${r.up.rise}, ${speed.toFixed(2)})`);
    else check(r.up.rise < 0.2, `stairs ${rise}: blocked (${r.up.rise})`);
    check(Math.abs(r.up.rise + r.down.rise) < 0.05 && r.down.grounded === 1, `stairs ${rise}: back down, grounded`);
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
