// The player API end to end (places/players-lab.luau): PlayerAdded and
// CharacterAdded with a Humanoid, Touched from walking onto parts, a speed pad
// changing WalkSpeed live, a checkpoint setting RespawnLocation, a kill brick
// (Died, the death clip, respawn after Players.RespawnTime at the
// checkpoint), and a teleporter moving HumanoidRootPart.
export default async function (t) {
  const S = () => t.eval(() => { const s = window.studio, p = s.player, f = p.footPosition; return { pos: [f.x, f.y, f.z].map(v => +v.toFixed(2)), state: p.state, dead: !!p.dead, ws: s.players.humanoid.props.WalkSpeed, root: s.players.root.props.Position.y.toFixed(2), char: s.players.model.handle }; });
  const luau = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  await t.sim(30);
  const s0 = await S();
  console.log('start', JSON.stringify(s0));
  // Walk onto the speed pad (z 10..18) and on: speed after.
  await t.sim(48, { move: [0, 1] });
  const a = await S(); await t.sim(30, { move: [0, 1] }); const b = await S();
  console.log('after pad: WalkSpeed', b.ws, 'measured', ((b.pos[2] - a.pos[2]) / 0.5).toFixed(1), 'studs/s');
  // On to the checkpoint (z 30..38) and the kill brick (z 46..54).
  for (let i = 0; i < 90 && !(await S()).dead; i++) await t.sim(2, { move: [0, 1] });
  const d = await S();
  console.log('dead', d.dead, 'at', JSON.stringify(d.pos), 'state', d.state);
  await t.sim(30); await t.frames(2); await t.shot('players-dead'); await t.golden('death');
  await t.sim(5 * 60);
  const r = await S();
  console.log('respawned', !r.dead, 'at', JSON.stringify(r.pos), 'new character', r.char !== d.char, 'WalkSpeed', r.ws);
  // Teleporter at (30, 0, 0).
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.players.root.props.Position; s.player.teleport(new V(24, 0, 0), Math.PI / 2); });
  await t.sim(40, { move: [1, 0] });
  const tp = await S();
  console.log('after teleporter', JSON.stringify(tp.pos));
  await t.sim(10);
  console.log('luau:\n  ' + luau().join('\n  '));
}
