// Auto-jump (Roblox's AutoJumpEnabled, touch only): walking into a 2-stud step
// on the thumbstick jumps up it; on the keyboard it stays blocked; a 10-stud
// wall never triggers it. Place: places/movement-lab.luau.
export default async function (t) {
  await t.sim(30);
  const go = (x, touch) => t.eval(([x, touch]) => {
    const S = window.studio, p = S.player, V = p.holder.position.constructor;
    p.teleport(new V(x, 0, 14), 0); S.camera.yaw = Math.PI; S.sim(10);
    let jumps = 0, prevVy = 0, maxY = 0;
    for (let i = 0; i < 150; i++) {
      S.sim(1, { move: [0, 1], touch });
      if (p.vy > 40 && prevVy < 40) jumps++; // a takeoff (the ground between hops can last under a frame)
      prevVy = p.vy; maxY = Math.max(maxY, p.footPosition.y);
    }
    return { jumps, maxY: +maxY.toFixed(2), endY: +p.footPosition.y.toFixed(2) };
  }, [x, touch]);
  const touch = await go(24 + 6 * 14, true), keys = await go(24 + 6 * 14, false), wall = await go(130, true);
  console.log('2-stud stairs, touch   ', JSON.stringify(touch));
  console.log('2-stud stairs, keyboard', JSON.stringify(keys));
  console.log('10-stud wall, touch    ', JSON.stringify(wall));
  const fail = [];
  if (!(touch.jumps >= 3 && touch.maxY >= 16)) fail.push('touch hops to the top of the 16-stud flight');
  if (!(keys.jumps === 0 && keys.maxY < 0.2)) fail.push('keyboard stays blocked');
  if (!(wall.jumps === 0 && wall.maxY < 0.2)) fail.push('a 10-stud wall never triggers it');
  if (fail.length) throw new Error('FAIL: ' + fail.join('; '));
}
