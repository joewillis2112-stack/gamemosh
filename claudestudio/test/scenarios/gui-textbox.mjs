// TextBox (places/textbox-lab.luau), desktop and phone:
// - Roblox's defaults (Instance.new): Text "TextBox", ClearTextOnFocus, TextEditable, not MultiLine,
//   grey placeholder, Active; IsFocused false;
// - an empty box shows its PlaceholderText in PlaceholderColor3;
// - a click (desktop) or tap (phone) focuses it: Focused fires, IsFocused is true, and a real text
//   field has the keyboard (on a phone that is what brings up the on-screen keyboard: the field is
//   focused inside the tap, editable, a text input);
// - typing sets Text as it goes (Text's change fires per keystroke);
// - desktop: while a box has focus, W doesn't move the character (the same W after it lets go does),
//   Enter submits (FocusLost true), Escape lets go without submitting and doesn't open the menu,
//   a click on the 3D view lets go (FocusLost false);
// - ClearTextOnFocus empties the box when it gains focus; TextEditable off keeps the text as it is;
//   MultiLine takes Enter as a new line and keeps the focus; CaptureFocus from a button's script
//   focuses the code box; ReleaseFocus(true) from a script submits.
// Golden: the form with typed text, nothing focused, desktop and phone.
import { helpers } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, get, box, luau, logs, tap, touch } = helpers(t);
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(2); await t.frames(2);
  const phone = await t.eval(() => window.studio.controls.isTouch);
  const kb = t.page.keyboard;
  const text = async n => (await get(n)).Text;
  const focusedName = () => t.eval(() => { const f = window.studio.dm.focusedTextBox; return f ? f.props.Name : null; });
  // The DOM's focus: is the focused element a text field inside that box's element?
  const fieldOf = n => t.eval(n => {
    const s = window.studio, inst = [...s.gui.els.keys()].find(i => i.props.Name === n), e = inst && s.gui.els.get(inst), a = document.activeElement;
    return { has: !!(e && a && e.el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)), tag: a && a.tagName, type: a && a.type, readOnly: a && a.readOnly, inputMode: a && a.inputMode };
  }, n);
  const lost = () => logs().filter(l => l.startsWith('lost'));
  const pos = () => t.eval(() => { const p = window.studio.player.footPosition; return [p.x, p.z]; });

  await luau('local b = Instance.new("TextBox") print("defaults", b.Text, b.ClearTextOnFocus, b.TextEditable, b.MultiLine, b.PlaceholderText == "", b.PlaceholderColor3, b.Active, b:IsFocused())');
  const dl = logs().find(l => l.startsWith('defaults'));
  check(dl === 'defaults TextBox true true false true 0.5, 0.5, 0.5 true false', `Instance.new defaults (${dl})`);

  // The placeholder.
  const ph = await t.eval(() => { const s = window.studio, inst = [...s.gui.els.keys()].find(i => i.props.Name === 'Name'), e = s.gui.els.get(inst); return { text: e.span.textContent, color: getComputedStyle(e.el).color }; });
  check(ph.text === 'Your name' && ph.color === 'rgb(150, 150, 165)', `an empty box shows its PlaceholderText in PlaceholderColor3 (${ph.text}, ${ph.color})`);

  // UIPadding (10 px left) insets the box's own text, and the text field while it's focused.
  const inset = which => t.eval(w => { const s = window.studio, inst = [...s.gui.els.keys()].find(i => i.props.Name === 'Name'), e = s.gui.els.get(inst), n = w === 'field' ? e.field.el : e.span; return n.getBoundingClientRect().left - e.el.getBoundingClientRect().left; }, which);
  const i0 = await inset('span');
  check(Math.abs(i0 - 10) < 0.5, `UIPadding insets the box's text 10 px (${i0})`);
  const nb = await box('Name');
  if (phone) await tap(nb.x + 60, nb.y + 22); else await t.page.mouse.click(nb.x + 60, nb.y + 22);
  await t.page.waitForTimeout(60); await t.sim(2);
  const f1 = await fieldOf('Name');
  const i1 = await inset('field');
  check(Math.abs(i1 - 10) < 0.5, `and the focused text field the same (${i1})`);
  check(logs().includes('focused Name') && await focusedName() === 'Name', `${phone ? 'a tap' : 'a click'} focuses it: Focused fires`);
  check(f1.has && f1.tag === 'INPUT' && f1.type === 'text' && !f1.readOnly && f1.inputMode !== 'none', `a text field inside the box has the keyboard (${JSON.stringify(f1)})`);
  await luau('print("isfocused", game.Players.LocalPlayer.PlayerGui.Form.Panel:FindFirstChild("Name"):IsFocused())');
  check(logs().includes('isfocused true'), 'IsFocused() is true');
  // Typing: a phone's keyboard inserts text (CDP insertText, as an IME does); a desktop's sends keys.
  if (phone) { const cdp = await t.page.context().newCDPSession(t.page); for (const ch of 'Ada') { await cdp.send('Input.insertText', { text: ch }); await t.page.waitForTimeout(20); } }
  else await kb.type('Ada', { delay: 20 });
  await t.sim(2);
  await luau('_G.report()');
  check(await text('Name') === 'Ada' && logs().includes('report Ada 3 true false'), `typing sets Text as it goes, one change per keystroke (${logs().filter(l => l.startsWith('report')).pop()})`);

  if (!phone) {
    // The game's keys stay out while typing.
    const a = await pos();
    await kb.down('KeyW'); await t.sim(30, 'live'); await kb.up('KeyW'); await t.sim(2, 'live');
    const b = await pos();
    check(Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01 && await text('Name') === 'Adaw', `W while typing types a w and doesn't move the character (moved ${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(3)})`);
    await kb.press('Enter'); await t.sim(2);
    check(lost().includes('lost Name true Adaw') && await focusedName() === null && !(await fieldOf('Name')).has, `Enter submits: FocusLost(true) and the field lets go (${lost()})`);
    const c = await pos();
    await kb.down('KeyW'); await t.sim(30, 'live'); await kb.up('KeyW'); await t.sim(2, 'live');
    const d = await pos();
    check(Math.hypot(d[0] - c[0], d[1] - c[1]) > 5 && await text('Name') === 'Adaw', `once it lets go, the same W moves the character (${Math.hypot(d[0] - c[0], d[1] - c[1]).toFixed(2)} studs)`);
    // ClearTextOnFocus; Escape lets go without submitting and leaves the menu closed.
    const cb = await box('Code');
    await t.page.mouse.click(cb.x + 100, cb.y + 22); await t.page.waitForTimeout(60); await t.sim(2);
    check(await text('Code') === '' && await focusedName() === 'Code', `ClearTextOnFocus empties the code box when it gains focus ("${await text('Code')}")`);
    await kb.type('42'); await kb.press('Escape'); await t.sim(2);
    check(lost().includes('lost Code false 42') && !(await t.eval(() => window.studio.menu.open)), `Escape lets go without submitting (FocusLost false) and doesn't open the menu (${lost()})`);
    // A click on the 3D view lets go.
    await t.page.mouse.click(nb.x + 60, nb.y + 22); await t.page.waitForTimeout(60); await t.sim(2);
    await t.page.mouse.click(900, 500); await t.page.waitForTimeout(60); await t.sim(2);
    check(lost().filter(l => l === 'lost Name false Adaw').length === 1 && await focusedName() === null, `a click on the 3D view lets go (FocusLost false)`);
    // MultiLine: Enter is a new line and the box keeps the focus.
    const mb = await box('Notes');
    await t.page.mouse.click(mb.x + 60, mb.y + 30); await t.page.waitForTimeout(60); await t.sim(2);
    await kb.type('one'); await kb.press('Enter'); await kb.type('two'); await t.sim(2);
    check(await text('Notes') === 'one\ntwo' && await focusedName() === 'Notes' && (await fieldOf('Notes')).tag === 'TEXTAREA', `MultiLine: Enter starts a new line and keeps the focus (${JSON.stringify(await text('Notes'))})`);
    // TextEditable off: focusable, but typing changes nothing.
    const lb = await box('Locked');
    await t.page.mouse.click(lb.x + 60, lb.y + 22); await t.page.waitForTimeout(60); await t.sim(2);
    await kb.type('xyz'); await t.sim(2);
    check(await focusedName() === 'Locked' && await text('Locked') === 'Read only', `TextEditable false: it takes focus but typing changes nothing ("${await text('Locked')}")`);
    check(lost().includes('lost Notes false one\ntwo') || lost().some(l => l.startsWith('lost Notes false one')), 'focusing another box lets go of the first (FocusLost false)');
  }
  // CaptureFocus from a button's script, then ReleaseFocus(true) from a script.
  const gb = await box('Go');
  if (phone) await tap(gb.x + 100, gb.y + 18); else await t.page.mouse.click(gb.x + 100, gb.y + 18);
  await t.page.waitForTimeout(60); await t.sim(3);
  check(await focusedName() === 'Code' && (await fieldOf('Code')).has, 'a button\'s script calls CaptureFocus: the code box has the keyboard');
  if (phone) { const cdp = await t.page.context().newCDPSession(t.page); await cdp.send('Input.insertText', { text: '77' }); } else await kb.type('77');
  await t.sim(2);
  await luau('game.Players.LocalPlayer.PlayerGui.Form.Panel.Code:ReleaseFocus(true)', 3);
  check(lost().includes('lost Code true 77') && await focusedName() === null, `ReleaseFocus(true) from a script submits (${lost().filter(l => l.includes('Code'))})`);
  if (phone) {
    // A tap on the 3D view lets go too.
    await tap(nb.x + 60, nb.y + 22); await t.sim(2);
    const vb = await t.eval(() => [innerWidth * 0.85, innerHeight * 0.6]); // right of the form
    await tap(vb[0], vb[1]); await t.sim(2);
    check(lost().includes('lost Name false Ada') && await focusedName() === null, `a tap on the 3D view lets go (FocusLost false) (${lost()})`);
  }
  await t.page.mouse.move(phone ? 380 : 1200, phone ? 830 : 700);
  await t.sim(2); await t.frames(2);
  await t.shot('gui-textbox'); await t.golden('gui-textbox', { text: true });
  done();
}
