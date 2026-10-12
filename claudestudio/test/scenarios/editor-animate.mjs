// Animate mode (web/editor/animate.js), driven with real clicks, keys and
// touches: Rig inserts a dummy standing on the floor; Animate opens the
// timeline; a click on the right arm picks that joint and puts a ring on it;
// dragging the ring turns the arm and keys it at the playhead (one undo step,
// Roblox's data: ServerStorage.RBX_ANIMSAVES.Rig.Animation > Keyframe >
// Pose "Right Arm"); a second key at 1 s; the playhead between them shows
// the arm between the two; dragging a key on the strip retimes it; easing
// and delete; undo and redo follow; Play in the editor's player runs it by
// script (KeyframeSequenceProvider) on the rig.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const tap = async (x, y) => { if (phone) await t.page.touchscreen.tap(x, y); else await t.page.mouse.click(x, y); await E(() => window.editor.frames(1)); };
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  // The strip counts two presses within 400 ms at one spot as a double click; a person's next gesture comes later.
  const settle = () => t.page.waitForTimeout(450);
  const cdp = phone ? await t.page.context().newCDPSession(t.page) : null;
  const drag = async (a, b, steps = 12) => {
    if (phone) {
      const tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
      await tp('touchStart', a); for (let i = 1; i <= steps; i++) await tp('touchMove', [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]); await tp('touchEnd');
    } else {
      await t.page.mouse.move(...a); await t.page.mouse.down(); for (let i = 1; i <= steps; i++) await t.page.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); await t.page.mouse.up();
    }
    await E(() => window.editor.frames(1));
  };
  // Camera: over open floor, looking along +Z, so the rig (which faces -Z) faces it.
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(24, 6, -12); ed.camera.lookAt(new V(24, 3, 0)); ed.camera.apply(); ed.frames(1); });
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  // The right arm's turn from rest (degrees) and its hand's world position.
  const arm = () => E(() => {
    const ed = window.editor, v = [...ed.rigs.views.values()][0]; if (!v) return null;
    const n = v.anim.byName('arm-right'), r = v.anim.rest.get(n).q, q = n.rotationQuaternion, d = Math.abs(r.x * q.x + r.y * q.y + r.z * q.z + r.w * q.w);
    const m = n.getClassName() === 'Mesh' ? n : n.getChildMeshes()[0]; m.computeWorldMatrix(true); const c = m.getBoundingInfo().boundingBox.centerWorld;
    return { deg: 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI, hand: [c.x, c.y, c.z] };
  });
  const st = () => E(() => {
    const ed = window.editor, a = ed.anim, ks = a.seq && a.seq.parent ? a.seq : null;
    const keys = a.keys().map(k => k.joint + '@' + +k.t.toFixed(3)).sort();
    return { active: a.active, joint: a.joint, time: +a.time.toFixed(3), keys, path: ks ? ks.parent.parent.parent.props.Name + '.' + ks.parent.parent.props.Name + '.' + ks.parent.props.Name + '.' + ks.props.Name : null, steps: ed.commands.history.past.length, kfs: ks ? ks.children.filter(c => c.ClassName === 'Keyframe').length : 0, ring: !!a.ring.attachedNode, panel: !document.getElementById('animpanel').hidden };
  });

  // Insert a Rig: it stands on the floor, selected.
  await btn('#ui [data-act=rig]');
  const rig = await E(() => { const ed = window.editor, m = ed.commands.selection.primary, v = m && ed.rigs.views.get(m); return { name: m && m.props.Name, cls: m && m.ClassName, hum: !!(m && m.children.find(c => c.ClassName === 'Humanoid')), feet: v && +v.holder.position.y.toFixed(3), root: m && m.children.find(c => c.props.Name === 'HumanoidRootPart').props.CFrame.y }; });
  check(rig.cls === 'Model' && rig.name === 'Rig' && rig.hum && rig.feet === 0 && rig.root === 3, `Rig inserts a Model with a Humanoid, drawn standing on the baseplate (feet y ${rig.feet}, root ${rig.root}), selected`);
  if (fail.length) throw new Error('no rig');

  // Animate: the panel opens; a click on the right arm picks it.
  await btn('#ui [data-act=animate]');
  const hand0 = (await arm()).hand;
  await tap(...await screen(hand0));
  let s = await st();
  check(s.active && s.panel && s.joint === 'Right Arm' && s.ring, `Animate opens the timeline; a ${phone ? 'tap' : 'click'} on the right arm picks it and rings it (${JSON.stringify({ joint: s.joint, ring: s.ring })})`);

  // Turn the arm with the ring: the ring that faces the camera, dragged along it from its top.
  const steps0 = s.steps;
  const findRing = () => E(() => {
    const ed = window.editor, a = ed.anim, r = document.getElementById('c').getBoundingClientRect(), us = ed.gizmos.layer.utilityLayerScene, f = ed.camera.forward();
    // The ring whose axis points most along the view.
    const V = f.constructor, axes = [['xGizmo', new V(1, 0, 0)], ['yGizmo', new V(0, 1, 0)], ['zGizmo', new V(0, 0, 1)]].map(([k, v]) => { const ax = v.applyRotationQuaternion(a.proxy.rotationQuaternion); return { k, d: Math.abs(ax.x * f.x + ax.y * f.y + ax.z * f.z) }; }).sort((p, q) => q.d - p.d);
    const mine = new Set(a.ring[axes[0].k]._rootMesh.getChildMeshes());
    for (let y = 0; y < r.height; y += 2) for (let x = 0; x < r.width; x += 2) { const h = us.pick(x, y, m => mine.has(m) && m.isPickable && m.isEnabled() && m.isVisible); if (h && h.hit) return { at: [r.left + x, r.top + y], ring: axes[0].k, mesh: h.pickedMesh.name }; }
    return null;
  });
  // Where the ring was turned to when let go (the proxy is re-placed from the arm after).
  await E(() => { const a = window.editor.anim, e = a.endDrag.bind(a); a.endDrag = () => { const q = a.proxy.rotationQuaternion; window.ringAtEnd = [q.x, q.y, q.z, q.w]; e(); }; });
  const grab = await findRing();
  if (grab) await drag(grab.at, [grab.at[0] + 60, grab.at[1] + 8]);
  const follows = await E(() => { const ed = window.editor, v = [...ed.rigs.views.values()][0], n = v.anim.byName('arm-right'); n.computeWorldMatrix(true); const q = new (n.rotationQuaternion.constructor)(); n.getWorldMatrix().decompose(undefined, q, undefined); const r = window.ringAtEnd; return r ? Math.abs(q.x * r[0] + q.y * r[1] + q.z * r[2] + q.w * r[3]) : 0; });
  check(follows > 0.9999, `the keyed arm ends turned exactly as the ring was left (|q·q'| ${follows.toFixed(6)})`);
  s = await st();
  const a1 = await arm();
  check(!!grab && a1.deg > 10 && s.keys.join() === 'Right Arm@0' && s.steps === steps0 + 1 && s.path === 'ServerStorage.RBX_ANIMSAVES.Rig.Animation', `dragging the ring turns the arm (${a1.deg.toFixed(1)}°) and keys it at 0 s, one undo step, saved where Roblox's editor saves (${s.path}; ${s.keys})`);

  // The strip: x of a time on the ruler or a key, y of the ruler or a joint's row (page px).
  const stripAt = (ms, joint) => E(([ms, joint]) => {
    const a = window.editor.anim, tl = a.timeline, el = a.panel.querySelector('.astrip canvas') || a.panel.querySelector('.astrip'), r = el.getBoundingClientRect();
    const row = joint ? ['Torso', 'Head', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg'].indexOf(joint) : -1;
    return [r.left + tl._toScreenPx(ms), r.top + (row < 0 ? 15 : 30 + row * 24 + 12) - (row < 0 ? 0 : tl.scrollTop)];
  }, [ms, joint]);

  // Playhead to 1 s (a click on the ruler), then turn the arm back the other way: a second key.
  await tap(...await stripAt(1000));
  s = await st();
  const g2 = await findRing();
  if (g2) await drag(g2.at, [g2.at[0] - 40, g2.at[1] + 4]);
  s = await st();
  const a2 = await arm();
  check(s.time === 1 && s.keys.join() === 'Right Arm@0,Right Arm@1', `a ${phone ? 'tap' : 'click'} on the ruler moves the playhead to 1 s; turning the arm there adds a key at 1 s (${s.keys}; arm ${a2.deg.toFixed(1)}°)`);

  // Scrub to 0.5 s: the arm is between its two keys (linear: the half-way turn).
  const half = await E(() => { const ed = window.editor, A = ed.anim; const k = A.keys().filter(k => k.joint === 'Right Arm').sort((p, q) => p.t - q.t); const a = k[0].pose.props.CFrame, b = k[1].pose.props.CFrame; return { want: a.lerp(b, 0.5).toQuat() }; });
  await tap(...await stripAt(500));
  const mid = await E(() => { const ed = window.editor, v = [...ed.rigs.views.values()][0], n = v.anim.byName('arm-right'), r = v.anim.rest.get(n).q, q = n.rotationQuaternion; const d = r.conjugate().multiply(q); return [d.x, d.y, d.z, d.w]; });
  // The node frame is the character frame turned half about Y: (x, y, z, w) -> (-x, y, -z, w).
  const w = half.want, m = mid, dot = Math.abs(-w[0] * m[0] + w[1] * m[1] - w[2] * m[2] + w[3] * m[3]);
  check(dot > 0.9999, `scrubbed to 0.5 s, the arm is exactly half way between its keys (|q·q'| ${dot.toFixed(6)})`);

  // Easing: pick the key at 0 s on the strip, Constant: at 0.5 s the arm holds the first key.
  await tap(...await stripAt(0, 'Right Arm'));
  await E(() => { const sel = document.querySelector('#animpanel [data-a=style]'); sel.value = 'Constant'; sel.dispatchEvent(new Event('change', { bubbles: true })); window.editor.frames(1); });
  const held = await arm();
  const easing = await E(() => window.editor.anim.keys().map(k => k.joint + '@' + k.t + ':' + k.pose.props.EasingStyle).sort().join());
  check(Math.abs(held.deg - a1.deg) < 0.5 && easing === 'Right Arm@0:Constant,Right Arm@1:Linear', `a ${phone ? 'tap' : 'click'} selects the 0 s key; Constant makes it hold until the next (${held.deg.toFixed(1)}° vs ${a1.deg.toFixed(1)}°; ${easing})`);

  // Retime: drag the 1 s key to 1.5 s.
  await tap(...await stripAt(1000, 'Right Arm'));
  await settle();
  await drag(await stripAt(1000, 'Right Arm'), await stripAt(1500, 'Right Arm'), 8);
  s = await st();
  check(s.keys.join() === 'Right Arm@0,Right Arm@1.5', `dragging a key along its row retimes it (${s.keys})`);

  // Delete it, then undo and redo.
  await settle();
  await tap(...await stripAt(1500, 'Right Arm'));
  if (phone) await btn('#animpanel [data-a=delete]'); else { await t.page.keyboard.press('Delete'); await E(() => window.editor.frames(1)); }
  const ds = await st(), del = ds.keys.join();
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  const und = (await st()).keys.join();
  if (phone) await btn('#ui [data-act=redo]'); else { await t.page.keyboard.press('Control+y'); await E(() => window.editor.frames(1)); }
  const red = (await st()).keys.join();
  check(del === 'Right Arm@0' && ds.kfs === 1 && und === 'Right Arm@0,Right Arm@1.5' && red === 'Right Arm@0', `Delete removes the selected key (and its now empty Keyframe: ${ds.kfs} left); undo brings it back, redo removes it again (${del} / ${und} / ${red})`);
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  await tap(...await stripAt(1500));
  await E(() => window.editor.frames(2));
  await t.golden('editor-animate');

  // Play: the place goes to the player; a script plays the saved sequence on the rig (Roblox's API).
  if (!phone) {
    const editorDeg = (await arm()).deg;
    await btn('#animpanel [data-a=done]');
    await t.page.click('#ui [data-act=play]');
    await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
    await E(() => window.studio.vm.run('p', `
      local ks = game:GetService("ServerStorage").RBX_ANIMSAVES.Rig.Animation
      local a = Instance.new("Animation") a.AnimationId = game:GetService("KeyframeSequenceProvider"):RegisterKeyframeSequence(ks)
      local tr = workspace.Rig.Humanoid.Animator:LoadAnimation(a)
      tr:Play(0) tr:AdjustSpeed(0) tr.TimePosition = 1.5 _G.tr = tr
    `));
    await E(() => window.studio.sim(3));
    const played = await E(() => { const v = [...window.studio.rigs.views.values()][0]; if (!v) return null; const n = v.anim.byName('arm-right'), r = v.anim.rest.get(n).q, q = n.rotationQuaternion, d = Math.abs(r.x * q.x + r.y * q.y + r.z * q.z + r.w * q.w); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; });
    check(played !== null && Math.abs(played - editorDeg) < 0.5, `in play, the saved sequence played by script poses the rig as the editor showed it at 1.5 s (${played && played.toFixed(1)}° vs ${editorDeg.toFixed(1)}°)`);
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
