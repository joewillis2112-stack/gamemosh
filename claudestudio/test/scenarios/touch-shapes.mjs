// Touched against real shapes (places/touch-lab.luau): walking into a wall
// touches it; standing under a ceiling 0.1 above the head touches it (the
// skin); standing in the empty space above a wedge's slope doesn't; standing
// at a cylinder pillar's square "corner" doesn't, but against its round side does.
export default async function (t) {
  await t.sim(30);
  const touched = () => t.logs.filter(l => l.includes('[luau] touched')).map(l => l.split('touched ')[1]);
  const at = async (x, z, yaw, frames = 10, move = [0, 0], y = 0) => {
    await t.eval(([x, y, z, yaw]) => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(x, y, z), yaw); s.camera.yaw = yaw + Math.PI; }, [x, y, z, yaw]);
    await t.sim(frames, { move });
  };
  const check = async (label, fn, expect) => { const before = touched().length; await fn(); await t.sim(2); const got = touched().slice(before); const ok = expect ? got.length > 0 : got.length === 0; console.log(label.padEnd(44), JSON.stringify(got), ok ? 'ok' : 'WRONG'); return ok; };
  const results = [
    await check('walk into the wall', () => at(0, 4, 0, 40, [0, 1]), true),
    await check('stand under the ceiling (0.1 above the head)', () => at(20, 0, 0, 10), true),
    // Wedge at x=-20, z -6..6, slope rises toward +z; at z=-4 the slope is 1 stud up; stand beside it, 2.5 studs out, in the empty space in front of the slope.
    // Inside the wedge's bounding box but above its slope: at z=-4 the slope is 1 stud up;
    // feet at 3 (one frame, before falling) leave 1.65 studs clear of the slope surface.
    await check('above the wedge\'s slope, inside its box', () => at(-20, -4, 0, 1, [0, 0], 3), false),
    await check('standing on the wedge\'s slope', () => at(-20, -4, 0, 1, [0, 0], 1), true),
    // Cylinder at x=40, radius 3: the bounding box's corner is at (43, 3) diagonal; stand at 45 deg, 3 + 1.15*... outside the circle but inside the square.
    await check('at the pillar\'s square corner (outside the circle)', () => at(40 + 3.2, 3.2, 0, 10), false),
    await check('against the pillar\'s round side', () => at(40 + 4.05, 0, 0, 10), true),
  ];
  if (results.includes(false)) throw new Error('touch shapes wrong');
}
