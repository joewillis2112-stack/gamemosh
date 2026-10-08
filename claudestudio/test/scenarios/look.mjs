// Fixed camera views of the default place, for judging the look: the follow
// camera's yaw, pitch and zoom around the player standing on the spawn.
export default async function (t) {
  await t.sim(30);
  const views = { close: [200, 18, 16], low: [180, 6, 22], high: [150, 45, 60] };
  for (const [name, [yaw, pitch, zoom]] of Object.entries(views)) {
    await t.eval(([y, p, z]) => { const c = window.studio.camera; c.yaw = y * Math.PI / 180; c.pitch = p * Math.PI / 180; c.zoom = c.dist = z; }, [yaw, pitch, zoom]);
    await t.sim(1);
    await t.frames(2);
    await t.shot('look-' + name);
  }
}
