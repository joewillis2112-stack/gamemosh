// UIGridLayout (places/grid-lab.luau), desktop and phone. Expected numbers are worked out from the
// rules in classes/UIGridLayout.yaml (comments give the arithmetic):
// - Roblox's defaults (Instance.new): 100 px cells, 5 px padding, Horizontal, Left, Top, Name, TopLeft;
// - an inventory of 24 slots in a ScrollingFrame: 4 per row fit its 292 px content box, newest
//   first by LayoutOrder, each child's own Size replaced by the cell; AbsoluteContentSize,
//   AbsoluteCellCount and AbsoluteCellSize (current when the building script reads them); the
//   frame's AutomaticCanvasSize grows to the grid and its padding;
// - Vertical with FillDirectionMaxCells 3, sorted by Name: columns of three;
// - StartCorner BottomRight, cells and padding in scale, the block centred; a cell child with a
//   UIAspectRatioConstraint is sized by it inside its cell;
// - a panel a script sizes to its grid's AbsoluteContentSize (the Changed signal reaches it);
// - a slot added later joins the grid in order.
// Golden: the bag, desktop and phone.
import { helpers } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, get, luau, logs } = helpers(t);
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(2); await t.frames(2);
  const at = async n => { const p = await get(n); return p && [p.AbsolutePosition.x, p.AbsolutePosition.y, p.AbsoluteSize.x, p.AbsoluteSize.y]; };
  const eq = (a, b, tol = 0.01) => !!a && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

  await luau('local g = Instance.new("UIGridLayout") print("defaults", g.CellSize, g.CellPadding, g.FillDirection.Name, g.HorizontalAlignment.Name, g.VerticalAlignment.Name, g.SortOrder.Name, g.StartCorner.Name, g.FillDirectionMaxCells)');
  const dl = logs().find(l => l.startsWith('defaults'));
  check(dl === 'defaults {0, 100}, {0, 100} {0, 5}, {0, 5} Horizontal Left Top Name TopLeft 0', `Instance.new defaults (${dl})`);

  // The inventory: content box 316 - 8 (inset bar) - 2 x 8 (padding) = 292; floor((292 + 8) / 72) = 4
  // per row; 24 slots = 6 rows: 4 x 64 + 3 x 8 = 280 wide, 6 x 64 + 5 x 8 = 424 tall.
  check(logs().includes('grid 280 424 4 6'), `the building script reads AbsoluteContentSize 280 x 424 and AbsoluteCellCount 4 x 6 (${logs().find(l => l.startsWith('grid'))})`);
  const inv = await get('Inventory');
  check(inv.AbsoluteCanvasSize.y === 440 && inv.AbsoluteCanvasSize.x === 308, `the ScrollingFrame's AutomaticCanvasSize grows to the grid plus padding: 8 + 424 + 8 = 440 (${inv.AbsoluteCanvasSize.x} x ${inv.AbsoluteCanvasSize.y})`);
  const gl = await t.eval(() => { const s = window.studio, l = [...s.dm.byHandle].find(i => i && i.ClassName === 'UIGridLayout' && i.parent && i.parent.props.Name === 'Inventory'); return [l.props.AbsoluteCellSize.x, l.props.AbsoluteCellSize.y]; });
  check(eq(gl, [64, 64]), `AbsoluteCellSize 64 x 64 (${gl})`);
  // Newest first: Slot24 (LayoutOrder 76) at the first cell, Slot21 at the fourth, Slot20 starts row 2,
  // Slot01 (LayoutOrder 99) last: row 6, column 4. Every slot is 64 x 64 (its own Size was 10 x 10).
  check(eq(await at('Slot24'), [24, 24, 64, 64]) && eq(await at('Slot21'), [24 + 3 * 72, 24, 64, 64]) && eq(await at('Slot20'), [24, 24 + 72, 64, 64]) && eq(await at('Slot01'), [24 + 3 * 72, 24 + 5 * 72, 64, 64]),
    'slots fill rows left to right in LayoutOrder, each the cell\'s size');

  // Columns of at most three, by Name: C1 C2 C3 down the first column, C4 tops the second, C7 the third.
  const c = n => at(n);
  check(eq(await c('C1'), [16, 290, 30, 30]) && eq(await c('C3'), [16, 290 + 68, 30, 30]) && eq(await c('C4'), [16 + 34, 290, 30, 30]) && eq(await c('C7'), [16 + 68, 290, 30, 30]),
    'Vertical with FillDirectionMaxCells 3: columns of three, sorted by Name');
  const g2 = await t.eval(() => { const s = window.studio, l = [...s.dm.byHandle].find(i => i && i.ClassName === 'UIGridLayout' && i.parent && i.parent.props.Name === 'Columns'); return [l.props.AbsoluteContentSize.x, l.props.AbsoluteContentSize.y, l.props.AbsoluteCellCount.x, l.props.AbsoluteCellCount.y]; });
  check(eq(g2, [98, 98, 3, 3]), `its content 98 x 98 in 3 x 3 cells (${g2})`);

  // BottomRight, centred: cells 0.3 x (150, 120) = 45 x 36, padding 3 x 2.4; floor((150 + 3) / 48) = 3 per
  // row; five cells = 2 rows; the block 141 x 74.4 sits at (4.5, 22.8). K1 is bottom right, K4 top right,
  // K5 left of it, 45 x 22.5 (its 2:1 constraint inside the cell).
  check(eq(await c('K1'), [180 + 4.5 + 96, 290 + 22.8 + 38.4, 45, 36], 0.02) && eq(await c('K3'), [180 + 4.5, 290 + 22.8 + 38.4, 45, 36], 0.02) && eq(await c('K4'), [180 + 4.5 + 96, 290 + 22.8, 45, 36], 0.02),
    'StartCorner BottomRight fills from the bottom right, right to left then up, the block centred');
  check(eq(await c('K5'), [180 + 4.5 + 48, 290 + 22.8, 45, 22.5], 0.02), `a cell child's UIAspectRatioConstraint sizes it inside its cell (${await c('K5')})`);

  // The panel: floor((130 + 5) / 45) = 3 per row; five cells = 2 rows = 85 px; a script sizes the panel.
  const panel = await get('Panel');
  check(panel.AbsoluteSize.y === 85 && logs().includes('panel 85'), `a script sizes a panel to its grid's AbsoluteContentSize (85: ${panel.AbsoluteSize.y})`);

  // A slot added later goes in order: LayoutOrder 0 sorts before every other slot.
  await luau(`local bag = game.Players.LocalPlayer.PlayerGui.Bag.Inventory
    local c = Instance.new("TextLabel") c.Name = "Slot00" c.LayoutOrder = 0 c.Text = "new" c.BackgroundColor3 = Color3.new(1, 1, 1) c.Parent = bag`, 2);
  check(eq(await at('Slot00'), [24, 24, 64, 64]) && eq(await at('Slot24'), [24 + 72, 24, 64, 64]), 'a slot added later takes its place in order and the rest move along');
  const inv2 = await get('Inventory');
  check(inv2.AbsoluteCanvasSize.y === 440 + 72, `seven rows now: the canvas grows by a row (${inv2.AbsoluteCanvasSize.y})`);
  await luau('game.Players.LocalPlayer.PlayerGui.Bag.Inventory.Slot00:Destroy()', 2);

  await t.frames(2);
  await t.shot('gui-grid'); await t.golden('gui-grid', { text: true });
  done();
}
