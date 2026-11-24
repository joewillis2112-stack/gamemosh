// Animate mode on an R15 rig (web/editor/animate.js), with real taps and drags: R15 Rig inserts a
// generated body; Animate lists R15's fifteen joints (the names scroll with the strip); a tap on the
// left knee's handle picks it and rings it at the knee itself; dragging the ring turns the shin about
// the knee (the knee stays put) and keys it at 0 s, nested as Roblox nests poses
// (HumanoidRootPart > LowerTorso > LeftUpperLeg > LeftLowerLeg), and the drawn shin is exactly
// C0 * Pose.CFrame * C1:Inverse() from the thigh.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const tap = async (x, y) => { if (phone) await t.page.touchscreen.tap(x, y); else await t.page.mouse.click(x, y); await E(() => window.editor.frames(1)); };
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
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
  // Camera: over open floor, looking along +Z at about knee height, so the rig (which faces -Z) faces it.
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(24, 3, -9); ed.camera.lookAt(new V(24, 1.6, 0)); ed.camera.apply(); ed.frames(1); });
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  await t.page.selectOption('#rigKind', 'R15');
  await btn('#ui [data-act=rig]');
  for (let i = 0; i < 40; i++) { const ok = await E(() => { const ed = window.editor, v = ed.rigs.views.get(ed.commands.selection.primary); ed.frames(1); return !!(v && v.rig); }); if (ok) break; await t.page.waitForTimeout(50); }
  await btn('#ui [data-act=animate]');
  const st = () => E(() => {
    const ed = window.editor, a = ed.anim, ks = a.seq && a.seq.parent ? a.seq : null;
    const chain = []; if (ks) { const walk = (p, path) => { for (const c of p.children) if (c.ClassName === 'Pose') { if (c.props.Weight > 0) chain.push([...path, c.props.Name].join(' > ')); walk(c, [...path, c.props.Name]); } }; for (const kf of ks.children) walk(kf, []); }
    return { active: a.active, joint: a.joint, rows: [...a.panel.querySelectorAll('.aname')].map(n => n.dataset.j), keys: a.keys().map(k => k.joint + '@' + +k.t.toFixed(3)).sort(), chain, ring: !!a.ring.attachedNode, steps: ed.commands.history.past.length };
  });
  let s = await st();
  check(s.active && s.rows.length === 15 && s.rows[0] === 'LowerTorso' && s.rows.includes('LeftLowerLeg') && s.rows.includes('RightHand'), `Animate on an R15 rig lists R15's fifteen joints (${s.rows.length}: ${s.rows.slice(0, 4).join(', ')}...)`);
  // The knee: its handle, at the joint (C1 in the shin's frame), and where it is now.
  const knee = () => E(() => { const ed = window.editor, a = ed.anim, n = a.node('LeftLowerLeg'), p = a.jointPoint('LeftLowerLeg', n), h = a.handles.get('LeftLowerLeg'); return { at: [p.x, p.y, p.z], handle: [h.position.x, h.position.y, h.position.z] }; });
  const k0 = await knee();
  await tap(...await screen(k0.handle));
  s = await st();
  const ringAt = await E(() => { const p = window.editor.anim.proxy.position; return [p.x, p.y, p.z]; });
  check(s.joint === 'LeftLowerLeg' && s.ring && Math.hypot(...ringAt.map((v, i) => v - k0.at[i])) < 1e-4, `a ${phone ? 'tap' : 'click'} on the knee's handle picks the left knee and rings it at the knee (${s.joint})`);
  // Turn it with the ring that faces the camera.
  const findRing = () => E(() => {
    const ed = window.editor, a = ed.anim, r = document.getElementById('c').getBoundingClientRect(), us = ed.gizmos.layer.utilityLayerScene, f = ed.camera.forward();
    const V = f.constructor, axes = [['xGizmo', new V(1, 0, 0)], ['yGizmo', new V(0, 1, 0)], ['zGizmo', new V(0, 0, 1)]].map(([k, v]) => { const ax = v.applyRotationQuaternion(a.proxy.rotationQuaternion); return { k, d: Math.abs(ax.x * f.x + ax.y * f.y + ax.z * f.z) }; }).sort((p, q) => q.d - p.d);
    const mine = new Set(a.ring[axes[0].k]._rootMesh.getChildMeshes());
    for (let y = 0; y < r.height; y += 2) for (let x = 0; x < r.width; x += 2) { const h = us.pick(x, y, m => mine.has(m) && m.isPickable && m.isEnabled() && m.isVisible); if (h && h.hit) return { at: [r.left + x, r.top + y], ring: axes[0].k }; }
    return null;
  });
  const steps0 = s.steps, grab = await findRing();
  if (grab) await drag(grab.at, [grab.at[0] + 50, grab.at[1] + 6]);
  s = await st();
  const k1 = await knee();
  const turned = await E(() => { const a = window.editor.anim, v = a.view(), n = a.node('LeftLowerLeg'), r = v.anim.rest.get(n).q, q = n.rotationQuaternion; return 2 * Math.acos(Math.min(1, Math.abs(r.x * q.x + r.y * q.y + r.z * q.z + r.w * q.w))) * 180 / Math.PI; });
  check(!!grab && turned > 10 && Math.hypot(...k1.at.map((v, i) => v - k0.at[i])) < 1e-3, `dragging the ring turns the shin about the knee (${turned.toFixed(1)} degrees; the knee moved ${Math.hypot(...k1.at.map((v, i) => v - k0.at[i])).toExponential(1)} studs)`);
  check(s.keys.join() === 'LeftLowerLeg@0' && s.steps === steps0 + 1 && s.chain.join() === 'HumanoidRootPart > LowerTorso > LeftUpperLeg > LeftLowerLeg', `and keys it at 0 s, one undo step, nested as Roblox nests poses (${s.chain.join(' | ')})`);
  // The drawn shin is C0 * Pose.CFrame * C1:Inverse() from the thigh.
  const exact = await E(() => {
    const ed = window.editor, a = ed.anim, part = a.view().rig.get('LeftLowerLeg'), pose = a.keys().find(k => k.joint === 'LeftLowerLeg').pose.props.CFrame;
    const want = part.c0.mul(pose).mul(part.c1.inverse()), n = part.node, [x, y, z, w] = want.toQuat(), q = n.rotationQuaternion;
    return { dq: Math.abs(q.x * x + q.y * y + q.z * z + q.w * w), dp: Math.hypot(n.position.x - want.x, n.position.y - want.y, n.position.z - want.z), posePos: Math.hypot(pose.x, pose.y, pose.z) };
  });
  check(exact.dq > 0.99999 && exact.dp < 1e-4 && exact.posePos < 1e-9, `the drawn shin is exactly C0 * Pose.CFrame * C1:Inverse() (|q.q'| ${exact.dq.toFixed(6)}, ${exact.dp.toExponential(1)} studs; the pose a pure turn)`);
  // The names scroll with the strip.
  const sc = await E(() => { const a = window.editor.anim; a.timeline.scrollTop = 120; return new Promise(r => setTimeout(() => r({ strip: a.timeline.scrollTop, names: a.panel.querySelector('.anames').scrollTop }), 100)); });
  check(sc.strip > 0 && Math.abs(sc.names - sc.strip) < 1, `the joint names scroll with the strip (${sc.strip} / ${sc.names})`);
  await t.shot('editor-animate-r15');
  if (fail.length) throw new Error(fail.length + ' failed');
}
