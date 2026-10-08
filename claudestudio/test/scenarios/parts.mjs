// Every part shape from the front (looking -Z... i.e. at their Front faces),
// the side and behind, for the gate. The player stands aside.
export default async function (t) {
  await t.sim(20);
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(0, 1, 6), 0); });
  const views = { front: [180, 12, 34, [0, 2, -12]], side: [90, 15, 34, [0, 2, -12]], back: [0, 15, 34, [0, 2, -12]], above: [150, 50, 30, [0, 2, -12]] };
  for (const [name, [yaw, pitch, zoom, target]] of Object.entries(views)) {
    await t.eval(([y, p, z, tg]) => {
      const s = window.studio, c = s.camera;
      c.yaw = y * Math.PI / 180; c.pitch = p * Math.PI / 180; c.zoom = c.dist = z;
      c.focus = tg; // look at the row of parts instead of the player
    }, [yaw, pitch, zoom, target]);
    await t.sim(1);
    await t.frames(2);
    await t.shot('parts-' + name);
    if (name === 'front' || name === 'above') await t.golden('parts-' + name);
  }
}
