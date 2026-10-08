// Character sounds by behaviour (tests can't hear, so they read the play log):
// footsteps at the feet's contacts (rate vs ground speed), jump on takeoff, a
// normal jump lands silently (Roblox: only > 75 studs/s), a high fall lands
// loudly with the wind faded in, and the death sound on Died.
export default async function (t) {
  const log = () => t.eval(() => window.studio.audio.log.slice());
  const clear = () => t.eval(() => { window.studio.audio.log.length = 0; });
  await t.sim(30);
  for (const [label, mv] of [['run (16)', 1], ['walk (6)', 0.37]]) {
    await t.sim(30, { move: [0, mv] }); await clear();
    await t.sim(120, { move: [0, mv] });
    const steps = (await log()).filter(n => n.startsWith('footstep')).length;
    const speed = await t.eval(() => Math.hypot(window.studio.player.velocity.x, window.studio.player.velocity.z));
    console.log(label, 'steps/s', (steps / 2).toFixed(1), 'stride', (speed / (steps / 2)).toFixed(2), 'studs');
    await t.sim(40);
  }
  await clear();
  await t.sim(1, { jump: true }); await t.sim(70);
  console.log('normal jump:', JSON.stringify(await log()));
  await clear();
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(0, 60, 40)); s.player.grounded = false; });
  let wind = 0;
  for (let i = 0; i < 60; i++) { await t.sim(1); wind = Math.max(wind, await t.eval(() => window.studio.sounds.wind.volume)); }
  console.log('60-stud fall:', JSON.stringify(await log()), 'peak wind volume', wind.toFixed(3));
  await clear();
  await t.eval(() => window.studio.dm.set(window.studio.players.humanoid, 'Health', 0));
  await t.sim(5);
  console.log('death:', JSON.stringify(await log()));
}
