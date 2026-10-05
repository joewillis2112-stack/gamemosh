// Pokémon's screens by touch, with no Game Boy pad.
//
// Pokémon Red's menus are cursor menus: you move a ▶ and press A. The page
// doesn't need to know any menu's layout. It finds the ▶ in the game's own
// frame (by its shape), and when you tap an option it presses
// up/down/left/right, checking after each press where the ▶ went, until the
// ▶ sits on the row you tapped, then presses A. A tap with no ▶ on screen
// presses A (more text). Swipes scroll; a long press is SELECT; the BACK
// button is B.

// The menu cursor as this runner draws it: a filled ▶ five pixels tall,
// rows 4, 5, 6, 5 and 4 pixels long, with clear pixels around it.
const ROWS = [4, 5, 6, 5, 4];
const W = 160, H = 144;
const WAIT = 10; // frames for a menu to react to a press
const ROW = 6; // pixels from a ▶'s middle that still count as its line

/// Every ▶ in a 160×144 RGBA frame: top-left pixel of each.
export function findCursors(px) {
  const dark = (x, y) => {
    const i = (y * W + x) * 4;
    return px[i + 3] > 0 && px[i] + px[i + 1] + px[i + 2] < 240;
  };
  const out = [];
  for (let y = 1; y < H - 5; y++) {
    for (let x = 1; x < W - 7; x++) {
      if (!dark(x, y) || dark(x - 1, y + 2)) continue;
      let ok = true;
      for (let r = 0; r < 5 && ok; r++) {
        for (let i = 0; i < ROWS[r]; i++) if (!dark(x + i, y + r)) { ok = false; break; }
        if (ok && dark(x + ROWS[r], y + r)) ok = false;
      }
      for (let i = 0; i < 6 && ok; i++) if (dark(x + i, y - 1) || dark(x + i, y + 5)) ok = false;
      if (ok) out.push({ x, y });
    }
  }
  return out;
}

export class TouchGB {
  constructor(press) {
    this.press = press; // press(button): one Game Boy button for one frame
    this.goal = null;
  }

  /// A tap at Game Boy pixel (gx, gy); null when outside Pokémon's screen.
  tap(gx, gy) {
    this.goal = gx === null ? { a: true } : { gx, gy, axis: 'v', wait: 0, presses: 0 };
  }

  /// Once per game frame, with the last frame Pokémon drew.
  step(px) {
    const g = this.goal;
    if (!g) return;
    if (g.wait > 0) { g.wait--; return; }
    if (g.a) { this.press('a'); this.goal = null; return; }
    const cur = px && pick(findCursors(px), g);
    // No cursor: a text box or a cutscene; a tap means "go on".
    if (!cur) { this.press('a'); this.goal = null; return; }
    if (++g.presses > 24) { this.goal = null; return; }
    const mid = cur.y + 2;
    const push = (b) => { this.press(b); g.wait = WAIT; };
    if (g.axis === 'v') {
      // Up or down until the ▶ is on the tapped line.
      const d = g.gy - mid;
      const p = g.vPrev;
      const there = Math.abs(d) <= ROW;
      if (p) {
        if (cur.y === p.y) { g.axis = 'h'; return this.step(px); } // can't move this way
        if (Math.abs(d) > Math.abs(p.d) + ROW) { push(p.d > 0 ? 'up' : 'down'); g.axis = 'h'; return; } // wrapped round: undo
        if (there || Math.sign(d) !== Math.sign(p.d)) { g.axis = 'h'; return this.step(px); } // there, or just past
      } else if (there) { g.axis = 'h'; return this.step(px); }
      g.vPrev = { y: cur.y, d };
      return push(d > 0 ? 'down' : 'up');
    }
    if (g.axis === 'h') {
      // Left or right (grids like FIGHT/PKMN/ITEM/RUN). An option's text runs
      // to the right of its ▶, so try the next option right and step back if
      // it starts past the tap.
      const p = g.hPrev;
      if (p) {
        if (cur.x === p.x) { g.axis = 'a'; return this.step(px); } // can't move this way
        if (p.dir === 'right' && cur.x > g.gx) { push('left'); g.axis = 'a'; return; }
        if (p.dir === 'left' && g.gx >= cur.x) { g.axis = 'a'; return this.step(px); }
      }
      const dir = g.gx < cur.x ? 'left' : 'right';
      g.hPrev = { x: cur.x, dir };
      return push(dir);
    }
    // Choose it, if the ▶ ended up on the tapped line.
    if (Math.abs(g.gy - mid) <= ROW + 4) this.press('a');
    this.goal = null;
  }
}

/// The ▶ the tap is about: the one nearest to it.
function pick(list, g) {
  if (!list.length) return null;
  let best = list[0], bd = Infinity;
  for (const c of list) {
    const d = Math.abs(c.y + 2 - g.gy) * 2 + Math.abs(c.x - g.gx);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
