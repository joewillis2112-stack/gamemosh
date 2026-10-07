// Fixed camera views of the default place, for judging the look.
export default async function (t) {
  const views = { close: [-1.2, 1.2, 22, [0, 2, 12]], low: [-1.0, 1.42, 30, [0, 2, 10]], high: [-1.57, 0.5, 60, [0, 0, 8]] };
  for (const [name, [a, b, r, tg]] of Object.entries(views)) {
    await t.eval(([a, b, r, tg]) => { const c = window.studio.cam; c.alpha = a; c.beta = b; c.radius = r; c.target.set(...tg); }, [a, b, r, tg]);
    await t.frames(8);
    await t.shot('look-' + name);
  }
}
