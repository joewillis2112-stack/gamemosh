// Keyframe animation in play, by script, Roblox's API: a Rig (a Model with a
// Humanoid and a HumanoidRootPart) is drawn as the character standing on the
// floor; a KeyframeSequence registered with KeyframeSequenceProvider plays
// through Animator:LoadAnimation on it and on the player's own character
// (over its walk and idle clips). The arm turns as keyed (half way at half
// time, forward as Roblox's +X rotation raises it), the track's events fire
// (KeyframeReached, DidLoop, Stopped, Ended), Stop(0) puts the arm back.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  await t.sim(10);
  await E(() => window.studio.vm.run('anim', `
    local KSP = game:GetService("KeyframeSequenceProvider")
    local function wave(name, loop)
      local ks = Instance.new("KeyframeSequence")
      ks.Name = name ks.Loop = loop ks.Priority = Enum.AnimationPriority.Action
      for i, k in ipairs({ { 0, 0, "Keyframe" }, { 1, 90, "Up" } }) do
        local kf = Instance.new("Keyframe") kf.Time = k[1] kf.Name = k[3]
        local root = Instance.new("Pose") root.Name = "HumanoidRootPart" root.Weight = 0 root.Parent = kf
        local torso = Instance.new("Pose") torso.Name = "Torso" torso.Weight = 0 torso.Parent = root
        local arm = Instance.new("Pose") arm.Name = "Right Arm" arm.CFrame = CFrame.Angles(math.rad(k[2]), 0, 0) arm.Parent = torso
        ks:AddKeyframe(kf)
      end
      ks.Parent = game:GetService("ServerStorage")
      local a = Instance.new("Animation") a.AnimationId = KSP:RegisterKeyframeSequence(ks)
      return a
    end
    local rig = Instance.new("Model") rig.Name = "Dummy"
    Instance.new("Humanoid").Parent = rig
    local root = Instance.new("Part") root.Name = "HumanoidRootPart" root.Size = Vector3.new(2, 2, 1) root.Transparency = 1 root.Anchored = true
    root.CFrame = CFrame.new(6, 3, -8) root.Parent = rig
    rig.PrimaryPart = root rig.Parent = workspace
    _G.ev = {}
    local track = rig.Humanoid:LoadAnimation(wave("Wave", false))
    for _, e in ipairs({ "KeyframeReached", "Stopped", "Ended", "DidLoop" }) do
      track[e]:Connect(function(a) table.insert(_G.ev, e .. (a and ":" .. a or "")) end)
    end
    _G.track = track
    print("loaded", track.Length, track.Looped, track.Priority.Name, rig.Humanoid:FindFirstChildOfClass("Animator") ~= nil)
    _G.playerWave = wave("Wave2", true)
  `));
  const out = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  const line = p => out().filter(l => l.startsWith(p)).pop() || '';
  check(line('loaded') === 'loaded 1 false Action true', `LoadAnimation on a Humanoid makes its Animator; Length, Looped, Priority come from the sequence (${line('loaded')})`);

  // The arm's turn from rest, in degrees, and where it reaches (world box of its mesh).
  const arm = which => E(which => {
    const s = window.studio, v = which === 'rig' ? [...s.rigs.views.values()][0] : null;
    const anim = v ? v.anim : s.player.anim, n = anim.byName('arm-right'), r = anim.rest.get(n).q, q = n.rotationQuaternion;
    const d = Math.abs(r.x * q.x + r.y * q.y + r.z * q.z + r.w * q.w);
    const m = n.getClassName() === 'Mesh' ? n : n.getChildMeshes()[0];
    m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox;
    return { deg: 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI, minZ: bb.minimumWorld.z, maxZ: bb.maximumWorld.z, holderY: v && v.holder.position.y, n: s.rigs.views.size };
  }, which);
  await t.sim(2);
  let a = await arm('rig');
  check(a.n === 1 && Math.abs(a.holderY) < 1e-3 && a.deg < 0.5, `the Rig is drawn standing on the floor (feet y ${a.holderY && a.holderY.toFixed(3)}), arms at rest (${a.deg.toFixed(2)}°)`);

  await E(() => window.studio.vm.run('p', '_G.track:Play(0)'));
  await t.sim(30);
  a = await arm('rig');
  const tp = await E(() => window.studio.vm.run('tp', 'print("tp", _G.track.TimePosition, _G.track.IsPlaying)'));
  check(Math.abs(a.deg - 45) < 1, `half way through a linear 0 -> 90° key, the arm is at 45° (${a.deg.toFixed(2)}°; ${line('tp')})`);
  await t.sim(42); // past the end (1 s) and the 0.1 s fade
  await E(() => window.studio.vm.run('r', 'print("events", table.concat(_G.ev, ","), _G.track.IsPlaying)'));
  check(line('events') === 'events KeyframeReached:Up,Stopped,Ended false', `a non-looped track fires KeyframeReached at its named keyframe, then Stopped and Ended, once each (${line('events')})`);

  // Hold the end pose on a looping copy to see where the arm points.
  await E(() => window.studio.vm.run('hold', `
    local tr = workspace.Dummy.Humanoid.Animator:LoadAnimation(_G.playerWave)
    tr:Play(0) tr:AdjustSpeed(0) tr.TimePosition = 0.999 _G.hold = tr -- (at 1 a looped track wraps to 0)
  `));
  await t.sim(2);
  a = await arm('rig');
  check(Math.abs(a.deg - 90) < 1 && a.minZ < -8 - 1.5, `CFrame.Angles(rad(90), 0, 0) on Right Arm raises it forward (toward -Z, the way the rig faces): ${a.deg.toFixed(1)}°, reaches z ${a.minZ.toFixed(2)}`);
  // Facing the rig (it faces -Z), a little to its right.
  await E(([e, a]) => window.studio.vm.run('cam', `local c = workspace.CurrentCamera c.CameraType = Enum.CameraType.Scriptable c.CFrame = CFrame.lookAt(Vector3.new(${e}), Vector3.new(${a}))`), ['2, 6, -17', '6, 2.5, -8']); await t.frames(2); await t.golden('anim-rig');
  await E(() => window.studio.vm.run('s', '_G.hold:Stop(0)'));
  await t.sim(1);
  a = await arm('rig');
  check(a.deg < 0.5, `Stop(0) puts the arm straight back at rest (${a.deg.toFixed(2)}°)`);

  // The player's character: a looped track over its idle clip.
  const idle = await arm('player');
  await E(() => window.studio.vm.run('pl', `
    local hum = game:GetService("Players").LocalPlayer.Character.Humanoid
    local tr = hum:FindFirstChildOfClass("Animator"):LoadAnimation(_G.playerWave)
    _G.loops = 0 tr.DidLoop:Connect(function() _G.loops += 1 end)
    tr:Play(0) _G.ptrack = tr
  `));
  await t.sim(45);
  const p = await arm('player');
  await E(() => window.studio.vm.run('pr', 'print("player", _G.ptrack.TimePosition, #game:GetService("Players").LocalPlayer.Character.Humanoid.Animator:GetPlayingAnimationTracks())'));
  check(Math.abs(p.deg - 67.5) < 1.5, `on the player's character the track takes the arm from its idle clip (${idle.deg.toFixed(1)}° -> ${p.deg.toFixed(1)}° at 0.75 s of a 0 -> 90° key; ${line('player')})`);
  await t.sim(40);
  await E(() => window.studio.vm.run('lp', 'print("loops", _G.loops, _G.ptrack.IsPlaying)'));
  check(line('loops') === 'loops 1 true', `a looped track wraps and fires DidLoop (${line('loops')})`);
  await E(([e, a]) => window.studio.vm.run('cam', `local c = workspace.CurrentCamera c.CameraType = Enum.CameraType.Scriptable c.CFrame = CFrame.lookAt(Vector3.new(${e}), Vector3.new(${a}))`), ['-9, 4, 2', '0, 2.5, 0']); await t.frames(2); await t.golden('anim-player');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
