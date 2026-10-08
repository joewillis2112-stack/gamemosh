// Character sounds by behaviour (tests can't hear, so they read the play log):
// footsteps at the feet's contacts (rate vs ground speed), jump on takeoff, a
// normal jump lands silently (Roblox: only > 75 studs/s), a high fall lands
// loudly with the wind faded in, and the death sound on Died.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { if (!ok) { console.log('FAIL ' + what); fail.push(what); } };
  const rates = [];
  const log = () => t.eval(() => window.studio.audio.log.slice());
  const clear = () => t.eval(() => { window.studio.audio.log.length = 0; });
  await t.sim(30);
  for (const [label, mv] of [['run (16)', 1], ['walk (6)', 0.37]]) {
    await t.sim(30, { move: [0, mv] }); await clear();
    await t.sim(120, { move: [0, mv] });
    const steps = (await log()).filter(n => n.startsWith('footstep')).length;
    const speed = await t.eval(() => Math.hypot(window.studio.player.velocity.x, window.studio.player.velocity.z));
    console.log(label, 'steps/s', (steps / 2).toFixed(1), 'stride', (speed / (steps / 2)).toFixed(2), 'studs');
    rates.push(steps / 2);
    await t.sim(40);
  }
  await clear();
  await t.sim(1, { jump: true }); await t.sim(70);
  const jumpLog = await log();
  console.log('normal jump:', JSON.stringify(jumpLog));
  check(rates[0] > rates[1] && rates[1] > 0.5, 'footsteps: faster when running than walking');
  check(JSON.stringify(jumpLog) === '["jump"]', 'a normal jump: the jump sound, and a silent landing');
  await clear();
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(0, 60, 40)); s.player.grounded = false; });
  let wind = 0;
  for (let i = 0; i < 60; i++) { await t.sim(1); wind = Math.max(wind, await t.eval(() => window.studio.sounds.wind.volume)); }
  const fallLog = await log();
  console.log('60-stud fall:', JSON.stringify(fallLog), 'peak wind volume', wind.toFixed(3));
  check(JSON.stringify(fallLog) === '["land"]' && wind > 0.05, 'a 60-stud fall: wind fades in, and it lands loudly');
  await clear();
  await t.eval(() => window.studio.dm.set(window.studio.players.humanoid, 'Health', 0));
  await t.sim(5);
  const deathLog = await log();
  console.log('death:', JSON.stringify(deathLog));
  check(JSON.stringify(deathLog) === '["death"]', 'the death sound on Died');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
