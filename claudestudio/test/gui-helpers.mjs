// Shared by the GUI scenarios (test/scenarios/gui-*.mjs): finding GUI objects in the local player's
// PlayerGui, reading screen pixels, touch gestures through CDP, and Luau logs.
import { PNG } from 'pngjs';

export const INSET = 58; // Roblox's top bar: AbsolutePosition's origin is its bottom-left

export function helpers(t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const done = () => { if (fail.length) throw new Error(fail.length + ' check(s) failed: ' + fail.join('; ')); };
  // A GUI object's props by Name (the first found under PlayerGui), as plain numbers and strings.
  const get = name => t.eval(n => {
    const pg = window.studio.players.player.children.find(c => c.ClassName === 'PlayerGui');
    const find = i => { for (const c of i.children) { if (c.props.Name === n) return c; const r = find(c); if (r) return r; } return null; };
    const i = find(pg); if (!i) return null;
    const out = { ClassName: i.ClassName };
    for (const [k, v] of Object.entries(i.props)) {
      if (v && typeof v === 'object' && 'x' in v && 'y' in v && !('z' in v)) out[k] = { x: v.x, y: v.y };
      else if (v && typeof v === 'object' && 'r' in v) out[k] = { r: v.r, g: v.g, b: v.b };
      else if (v && typeof v === 'object' && 'xs' in v) out[k] = { xs: v.xs, xo: v.xo, ys: v.ys, yo: v.yo };
      else if (v && typeof v === 'object' && 'family' in v) out[k] = { family: v.family, weight: v.weight, style: v.style };
      else if (typeof v !== 'object' || v === null) out[k] = v;
      else if (v.name) out[k] = v.name;
    }
    return out;
  }, name);
  // Its box on screen (CSS px): AbsolutePosition is under the inset.
  const box = async name => { const p = await get(name); return p && { x: p.AbsolutePosition.x, y: p.AbsolutePosition.y + INSET, w: p.AbsoluteSize.x, h: p.AbsoluteSize.y }; };
  // Run Luau in the place's VM (as a LocalScript would), then let a frame pass.
  const luau = async (src, frames = 1) => { await t.eval(s => window.studio.vm.run('test', s), src); await t.sim(frames); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  // Screen pixels (CSS px; the screenshot is at the device's scale).
  const shotPx = async () => {
    const png = PNG.sync.read(await t.page.screenshot());
    const k = png.width / await t.eval(() => innerWidth);
    return (x, y) => { const i = (Math.round(y * k) * png.width + Math.round(x * k)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  };
  const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  let cdp = null;
  const touch = async (type, pts) => { cdp = cdp || await t.page.context().newCDPSession(t.page); await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }); };
  // A finger from (x, y) moving by (dx, dy) in n steps, `hold` ms still before it lifts (no fling).
  const drag = async (x, y, dx, dy, { n = 6, id = 1, hold = 150, step = 20 } = {}) => {
    await touch('touchStart', [{ x, y, id }]);
    for (let i = 1; i <= n; i++) { await touch('touchMove', [{ x: x + dx * i / n, y: y + dy * i / n, id }]); await t.page.waitForTimeout(step); }
    if (hold) await t.page.waitForTimeout(hold);
    await touch('touchEnd', []);
    await t.page.waitForTimeout(60);
  };
  const tap = async (x, y, id = 9) => { await touch('touchStart', [{ x, y, id }]); await t.page.waitForTimeout(40); await touch('touchEnd', []); await t.page.waitForTimeout(60); };
  return { fail, check, done, get, box, luau, logs, shotPx, near, touch, drag, tap };
}
