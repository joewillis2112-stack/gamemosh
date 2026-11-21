// BrickColor, Roblox's named colours, for the DataModel (the VM's twin is luau/more_types.h).
// The table is web/brickcolors.json, generated from creator-docs by tools/gen-brickcolors.mjs; the
// VM's table is written from the same file. One object per colour, so values compare with ===.
// (datamodel.js imports this module, so C3 is only used once modules are loaded: `color` is lazy.)
import TABLE from './brickcolors.json' with { type: 'json' };
import { C3 } from './datamodel.js';

export class BrickColor {
  constructor(number, name, r, g, b, palette) {
    Object.assign(this, { number, name, palette, r: r / 255, g: g / 255, b: b / 255 });
  }
  /** Its Color3. */
  get color() { return this._color || (this._color = new C3(this.r, this.g, this.b)); }
  get Number() { return this.number; }
  get Name() { return this.name; }
  toString() { return this.name; }
  /** By Number; an unknown one is "Medium stone grey", as Roblox's BrickColor.new does. */
  static byNumber(n) { return BY_NUMBER.get(n) || BY_NUMBER.get(194); }
  /** By Name (the first of a repeated name, as in the VM); unknown: "Medium stone grey". */
  static byName(s) { return ALL.find(c => c.name === s) || BY_NUMBER.get(194); }
  static palette(i) { return PALETTE[i] || null; }
  /** The nearest colour to (r, g, b) in 0..1: the smallest sum of per-channel differences (creator-docs), the first on a tie. */
  static nearest(r, g, b) {
    let best = ALL[0], bd = Infinity;
    for (const c of ALL) { const d = Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  static get all() { return ALL; }
}
const ALL = TABLE.colors.map(e => new BrickColor(...e));
const BY_NUMBER = new Map(ALL.map(c => [c.number, c]));
const PALETTE = []; for (const c of ALL) if (c.palette >= 0) PALETTE[c.palette] = c;

// A part's BrickColor is a view of its Color (as in Roblox): reading gives the nearest BrickColor to
// Color, writing sets Color to that BrickColor's colour. Kept in the part's props as an accessor, so
// everything that reads props (the Properties panel, the script host, saving) sees it current.
// A plain write that names the BrickColor the Color is already nearest changes nothing: copying a
// part's props one by one (Clone, an edit's restore) keeps a custom Color exact.
let memo = null;
export function brickColorOf(c) {
  if (!c) return BY_NUMBER.get(194);
  if (memo && memo.r === c.r && memo.g === c.g && memo.b === c.b) return memo.bc; // the same colour as last time
  memo = { r: c.r, g: c.g, b: c.b, bc: BrickColor.nearest(c.r, c.g, c.b) };
  return memo.bc;
}
export function defineBrickColor(props) {
  Object.defineProperty(props, 'BrickColor', {
    enumerable: true, configurable: true,
    get() { return brickColorOf(this.Color); },
    set(v) { if (v instanceof BrickColor && v !== brickColorOf(this.Color)) this.Color = v.color; },
  });
}
