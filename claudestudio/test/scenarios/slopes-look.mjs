// Shots of the character mid-ramp and mid-stairs, from the side, for judging
// feet against the surface.
export default async function (t) {
  await t.sim(30);
  const at = async (name, x, frames, yawDeg) => {
    await t.eval(([x]) => { const S = window.studio, V = S.player.holder.position.constructor; S.player.teleport(new V(x, 0, 12), 0); S.camera.yaw = Math.PI; }, [x]);
    await t.sim(20);
    await t.sim(frames, { move: [0, 1] });
    await t.eval(([y]) => { const c = window.studio.camera; c.yaw = y * Math.PI / 180; c.pitch = 8 * Math.PI / 180; c.zoom = c.dist = 11; }, [yawDeg]);
    await t.frames(2, { move: [0, 1] });
    await t.shot(name);
  };
  await at('slope-30', -60 + 2 * 16, 60, 90);
  await at('slope-60', -60 + 4 * 16, 50, 90);
  await at('stairs-1', 24 + 3 * 14, 50, 90);
  await at('stairs-blocked-1.5', 24 + 5 * 14, 60, 120);
}
