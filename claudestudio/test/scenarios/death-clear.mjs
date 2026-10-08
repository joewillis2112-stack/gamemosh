// The dead body (places/touch-lab.luau): dying with your back to a wall, the
// lying body must not cut into the wall, and must rest on (not sink into) the
// floor. Measured from the body's mesh boxes once the death clip has played.
export default async function (t) {
  await t.sim(30);
  // Back to the wall (z 9.5..10.5): stand at z 8.3 facing -Z (yaw PI), so it falls toward +Z.
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(0, 0, 8.3), 0); s.camera.yaw = Math.PI; });
  await t.sim(5);
  await t.eval(() => window.studio.dm.set(window.studio.players.humanoid, 'Health', 0));
  await t.sim(90);
  const r = await t.eval(() => {
    const p = window.studio.player;
    let minY = Infinity, intoWall = 0;
    for (const m of p.meshes) {
      if (!m.getTotalVertices()) continue;
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      minY = Math.min(minY, b.minimumWorld.y);
      // Wall: x -5..5, y 0..10, z 9.5..10.5
      const ox = Math.min(b.maximumWorld.x, 5) - Math.max(b.minimumWorld.x, -5), oy = Math.min(b.maximumWorld.y, 10) - Math.max(b.minimumWorld.y, 0), oz = Math.min(b.maximumWorld.z, 10.5) - Math.max(b.minimumWorld.z, 9.5);
      if (ox > 0.02 && oy > 0.02 && oz > 0.02) intoWall++;
    }
    return { dead: p.dead, lowestPoint: +minY.toFixed(3), limbsIntoWall: intoWall, yawDeg: Math.round(p.yaw * 180 / Math.PI), deadBox: [p.deadBox.min.y, p.deadBox.max.y].map(v => +v.toFixed(2)) };
  });
  console.log(JSON.stringify(r));
  await t.eval(() => { const c = window.studio.camera; c.yaw = 0.9; c.pitch = 0.5; c.zoom = c.dist = 14; });
  await t.sim(1); await t.frames(2); await t.shot('death-wall');
  if (!r.dead || r.limbsIntoWall || r.lowestPoint < -0.05) throw new Error('dead body cuts into the wall or floor');
}
