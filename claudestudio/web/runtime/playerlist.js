// The player list: Roblox's CoreGui PlayerList showing each player's leaderstats.
// Layout, colours, fonts, column order, row order and number formatting follow
// Roblox's own CoreScripts (the legacy desktop path at v0.719, before the code
// moved into a closed package): mashup-research/ROBLOX_GUI_2026-10-09.md §7.
// Ours where Roblox is unknown or doesn't apply: the abbreviation format
// (NumberLocalization isn't published), no status icons or player dropdown, and
// the phone layout (the desktop panel with one stat column, Roblox's small-screen cap).

// LayoutValues (CreateLayoutValues.lua, desktop).
const L = {
  pad: 4, topBar: 58, rowH: 40, titleH: 20, capH: 4, statW: 66, extra: 16,
  entryBase: 150, entryPerStat: 11, maxStats: 4, maxStatsSmall: 1,
  iconPad: 12, icon: 16, headerPad: 15, statPad: 4, dropDown: 304,
};
// UIBlox's Builder Sans sizes: BaseSize 16 × 1.26, Footer = CaptionSmall (10/16),
// CaptionHeader/CaptionBody = 12/16. Builder Sans isn't open; Nunito stands in.
const BASE = 16 * 1.26, HEADER_PX = BASE * 10 / 16, NAME_PX = BASE * 12 / 16;
const FAMILY = "'Nunito', Arimo, sans-serif";
// Theme (UIBlox dark): panel BackgroundUIContrast black at 0.3 transparency;
// TextEmphasis white (local player), TextDefault Pumice, TextMuted white at 0.3.
const PANEL = 'rgba(0,0,0,0.7)', EMPHASIS = '#ffffff', DEFAULT = 'rgb(189,190,190)', MUTED = 'rgba(255,255,255,0.7)'; // row hover: .cs-pl-row in gui.js
const STAT_CLASSES = new Set(['StringValue', 'IntValue', 'BoolValue', 'NumberValue', 'DoubleConstrainedValue', 'IntConstrainedValue']);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Luau's tostring for numbers ("%.14g"), which decides when a stat is abbreviated.
const luauNum = n => String(+n.toPrecision(14));

// FormatStatString.lua: nil is "-", a number of 7+ characters is abbreviated
// (truncating), other numbers get thousands separators, anything else tostring.
export function formatStat(v) {
  if (v === undefined || v === null) return '-';
  if (typeof v === 'number') {
    if (luauNum(v).length >= 7 && Math.abs(v) >= 1000) return abbreviate(v);
    return v.toLocaleString('en-US', { maximumFractionDigits: 14 });
  }
  return String(v);
}
// Ours: three significant digits, truncated, with K/M/B/T.
function abbreviate(v) {
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [u, s] = units.find(([u]) => Math.abs(v) >= u);
  const q = Math.abs(v) / u, dp = Math.max(0, 3 - String(Math.floor(q)).length), f = 10 ** dp;
  return (v < 0 ? '-' : '') + String(Math.floor(q * f + 1e-9) / f) + s;
}

// PlayerSorting.keyCmp: rows by the first column, highest first; ties and
// equal stats by upper-cased display name; players without the stat last;
// mixed types compare as strings.
export function keyCmp(a, b) {
  let l = a.stat, r = b.stat;
  if (l === r) return a.name < b.name;
  if (l === undefined) return false;
  if (r === undefined) return true;
  if (typeof l !== typeof r) { l = String(l); r = String(r); }
  if (l === r) return a.name < b.name;
  return l > r;
}

export class PlayerList {
  constructor(dm, players, root, onChange) {
    this.dm = dm; this.players = players;
    this.addIds = new Map(); this.nextId = 0; // stat name -> first-seen order (Roblox's addId)
    this.setVisible = true;                   // the Tab toggle (desktop)
    this.el = document.createElement('div');
    Object.assign(this.el.style, { position: 'absolute', top: L.pad + L.topBar + 'px', right: L.pad + 'px', zIndex: '1000', pointerEvents: 'auto', fontFamily: FAMILY, display: 'none', userSelect: 'none' });
    // Input on the panel stays on the panel, as CoreGui sinks it.
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel']) this.el.addEventListener(t, ev => ev.stopPropagation(), { passive: true });
    root.appendChild(this.el);
    addEventListener('keydown', e => { if (e.code === 'Tab' && !e.repeat) { e.preventDefault(); this.setVisible = !this.setVisible; onChange(); } });
  }

  // The columns: every stat any player has, IsPrimary first, then Priority
  // (higher first), then the order they first appeared, at most 4 (1 on phones).
  gameStats(list, small) {
    const stats = new Map();
    for (const p of list) for (const v of this.leaderstats(p)) {
      const name = v.props.Name;
      if (!this.addIds.has(name)) this.addIds.set(name, this.nextId++);
      if (stats.has(name)) continue;
      const prim = v.children.find(c => c.props.Name === 'IsPrimary' && c.ClassName === 'BoolValue');
      const pri = v.children.find(c => c.props.Name === 'Priority' && isNumberValue(c));
      stats.set(name, { name, isPrimary: !!(prim && prim.props.Value), priority: pri ? +pri.props.Value || 0 : 0, addId: this.addIds.get(name) });
    }
    const sorted = [...stats.values()].sort((a, b) => a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : a.priority !== b.priority ? b.priority - a.priority : a.addId - b.addId);
    return sorted.slice(0, small ? L.maxStatsSmall : L.maxStats);
  }
  leaderstats(p) {
    const f = p.children.find(c => c.props.Name === 'leaderstats');
    return f ? f.children.filter(c => STAT_CLASSES.has(c.ClassName)) : [];
  }
  statOf(p, name) { const v = this.leaderstats(p).find(c => c.props.Name === name); return v ? v.props.Value : undefined; }

  update(W, H, small, enabled) {
    const svc = this.players.service;
    const list = svc ? svc.children.filter(c => c.ClassName === 'Player') : [];
    if (!enabled || !this.setVisible || !list.length) { this.el.style.display = 'none'; this.state = null; return; }
    const cols = this.gameStats(list, small), n = cols.length;
    // Rows: PlayerKeys (name upper-cased, stat as a number where it reads as one).
    const key = p => {
      let stat = n ? this.statOf(p, cols[0].name) : undefined;
      if (typeof stat === 'boolean') stat = String(stat);
      if (typeof stat === 'string' && stat.trim() !== '' && !isNaN(+stat)) stat = +stat;
      return { name: (p.props.DisplayName || p.props.Name).toUpperCase(), stat };
    };
    const keys = new Map(list.map(p => [p, key(p)]));
    const rows = [...list].sort((a, b) => keyCmp(keys.get(a), keys.get(b)) ? -1 : keyCmp(keys.get(b), keys.get(a)) ? 1 : 0);
    // Width (PlayerListApp): stat columns + 16, plus the name column, which
    // shrinks if the screen can't fit it beside the (desktop) dropdown space.
    let entry = L.entryBase + Math.min(4, n) * L.entryPerStat;
    const used = n * L.statW + L.extra + L.pad * 2 + (small ? 0 : L.dropDown);
    if (W - used < entry) entry = Math.max(0, W - used);
    const width = n * L.statW + L.extra + entry;
    const local = this.players.player;
    const cell = (w, txt, align, color, weight, px, pad) => `<div style="flex:none;width:${w}px;box-sizing:border-box;${pad ? `padding-left:${pad}px;` : ''}text-align:${align};color:${color};font-weight:${weight};font-size:${px}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(txt)}</div>`;
    let h = `<div style="height:${L.capH}px;background:${PANEL};border-radius:${L.capH}px ${L.capH}px 0 0"></div>`;
    if (n) {
      // The title bar: its contents sit 2 px up, into the rounded cap.
      h += `<div data-pl="title" style="height:${L.titleH}px;background:${PANEL}"><div style="position:relative;top:-2px;height:100%;display:flex;align-items:center">` +
        cell(entry, 'Players', 'left', MUTED, 500, HEADER_PX, L.headerPad) + cols.map(c => cell(L.statW, c.name, 'center', MUTED, 500, HEADER_PX)).join('') + '</div></div>';
    }
    h += `<div style="background:${PANEL};max-height:${Math.max(0, Math.floor(H / 2) - 2 * L.capH - (n ? L.titleH : 0))}px;overflow-y:auto;scrollbar-width:thin">`;
    for (const p of rows) {
      const me = p === local, color = me ? EMPHASIS : DEFAULT, weight = me ? 500 : 400;
      const nameW = Math.max(0, entry - L.iconPad * 2 - L.icon);
      h += `<div data-pl="row" data-name="${esc(p.props.Name)}" class="cs-pl-row" style="height:${L.rowH}px;display:flex;align-items:center">` +
        `<div style="flex:none;width:${entry}px;display:flex;align-items:center;padding-left:${L.iconPad}px;box-sizing:border-box"><div style="flex:none;width:${L.icon}px;height:${L.icon}px;margin-right:${L.iconPad}px"></div>` +
        cell(nameW, p.props.DisplayName || p.props.Name, 'left', color, weight, NAME_PX) + '</div>' +
        cols.map(c => cell(L.statW, formatStat(this.statOf(p, c.name)), 'center', color, 500, NAME_PX, L.statPad)).join('') +
        `<div style="flex:none;width:${L.extra}px"></div></div>`;
    }
    h += `</div><div style="height:${L.capH}px;background:${PANEL};border-radius:0 0 ${L.capH}px ${L.capH}px"></div>`;
    if (h !== this.html) { this.el.innerHTML = h; this.html = h; }
    Object.assign(this.el.style, { display: 'block', width: width + 'px' });
    this.state = { width, entry, columns: cols.map(c => c.name), rows: rows.map(p => [p.props.Name, ...cols.map(c => formatStat(this.statOf(p, c.name)))]) };
  }
}
const isNumberValue = c => c.ClassName === 'NumberValue' || c.ClassName === 'IntValue';
