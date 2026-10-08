// The obby, stage by stage, from a three-quarter view with the player on the
// stage's checkpoint, plus an overview. For the visual gate.
export default async function (t) {
  await t.sim(20);
  const shots = {
    overview: [[0, 10, 0], [140, 35, 120, [0, 10, 110]]],
    stones: [[0, 10, 2], [205, 22, 30, [0, 10, 22]]],
    beams: [[0, 10, 38], [215, 25, 26, [1, 10, 54]]],
    wedge: [[0, 10, 72], [230, 18, 28, [0, 13, 84]]],
    pillars: [[0, 10, 106], [210, 22, 30, [0, 9, 124]]],
    fades: [[0, 10, 142], [200, 20, 30, [0, 10, 162]]],
    stairs: [[0, 10, 183], [235, 18, 34, [0, 16, 205]]],
  };
  for (const [name, [foot, [yaw, pitch, zoom, focus]]] of Object.entries(shots)) {
    await t.eval(([foot, y, p, z, f]) => {
      const S = window.studio, V = S.player.holder.position.constructor;
      S.player.teleport(new V(...foot), Math.PI);
      const c = S.camera; c.yaw = y * Math.PI / 180; c.pitch = p * Math.PI / 180; c.zoom = c.dist = z; c.focus = f;
    }, [foot, yaw, pitch, zoom, focus]);
    await t.sim(2);
    await t.frames(2);
    await t.shot('obby-' + name);
    if (name === 'overview' || name === 'wedge') await t.golden('obby-' + name);
  }
}
