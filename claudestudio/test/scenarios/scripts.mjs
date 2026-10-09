// Script instances in the running game (places/scripts-lab.luau): a Script in
// ServerScriptService runs and requires a ModuleScript; a LocalScript in
// StarterPlayerScripts runs once from PlayerScripts; StarterCharacterScripts
// and StarterGui contents are copied in, and run, on every spawn.
export default async function (t) {
  await t.sim(30);
  await t.eval(() => window.studio.dm.set(window.studio.players.humanoid, 'Health', 0));
  await t.sim(120); // RespawnTime 1
  const out = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  console.log(out.join('\n'));
  const count = s => out.filter(l => l === s).length;
  const fail = [];
  if (count('hello from a module') !== 1) fail.push('server script requires a module once');
  if (count('player script in PlayerScripts') !== 1) fail.push('StarterPlayerScripts runs once, from PlayerScripts');
  if (count('character script in Player1 true') !== 2) fail.push('StarterCharacterScripts runs in each new character (2 spawns)');
  if (count('gui script in PlayerGui') !== 2) fail.push('StarterGui contents copied into PlayerGui and run on each spawn');
  const guis = await t.eval(() => window.studio.players.player.children.find(c => c.ClassName === 'PlayerGui').children.map(c => c.props.Name));
  if (JSON.stringify(guis) !== '["Hud"]') fail.push('PlayerGui is reset on spawn, not duplicated: ' + JSON.stringify(guis));
  if (fail.length) throw new Error('FAIL: ' + fail.join('; '));
  console.log('ok   scripts run where and when Roblox runs them');
}
