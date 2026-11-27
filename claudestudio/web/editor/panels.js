// The Explorer (the instance tree) and Properties (the selection's properties,
// editable), as in Roblox Studio. Plain DOM, rebuilt from the DataModel when it
// changes (at most once a frame). Every edit is a command, so it can be undone.
// Each Explorer row has Studio's + (Insert Object, under that row: onAdd); double-clicking a row
// opens it (a script in the script editor: onOpen); a script's Properties offer Edit Script.
import { ENUMS, V3, V2, C3, UDim, UDim2, NumberRange, NumberSequence, ColorSequence, BrickColor, Font, propertiesOf } from '../datamodel.js';

// Studio shows these services in the Explorer, in this order (others it hides).
const SHOWN = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService'];
// Properties the panel doesn't offer (engine-written, or shown another way).
const HIDDEN = new Set(['CFrame', 'WorldCFrame','AssemblyLinearVelocity', 'AssemblyAngularVelocity', 'Focus', 'MeshData']); // MeshData: edited in Edit Mode, not as text

export class Explorer {
  constructor(el, dm, commands) {
    this.el = el; this.dm = dm; this.commands = commands;
    this.open = new Set([dm.workspace]);
    this.dirty = true;
    dm.watch((inst, key) => { if (key === 'Parent' || key === 'Name') this.dirty = true; });
    commands.selection.onChange(items => { for (const i of items) for (let a = i.parent; a; a = a.parent) this.open.add(a); this.dirty = true; });
    this.onAdd = null; this.onOpen = null;
    el.addEventListener('dblclick', e => { const row = e.target.closest('[data-h]'); if (row && !e.target.closest('.add') && this.onOpen) this.onOpen(this.dm.byHandle[+row.dataset.h]); });
    el.addEventListener('click', e => {
      const row = e.target.closest('[data-h]'); if (!row) return;
      const inst = this.dm.byHandle[+row.dataset.h];
      if (e.target.closest('.add')) { if (this.onAdd) this.onAdd(inst, e.target.closest('.add')); return; }
      if (e.target.classList.contains('tw')) { this.open.has(inst) ? this.open.delete(inst) : this.open.add(inst); this.dirty = true; return; }
      this.commands.run('select', { items: [inst], add: e.shiftKey || e.ctrlKey || e.metaKey });
    });
  }
  update() {
    if (!this.dirty) return; this.dirty = false;
    const sel = new Set(this.commands.selection.items), rows = [];
    const row = (inst, depth) => {
      const kids = inst.children;
      const open = this.open.has(inst);
      rows.push(`<div class="row${sel.has(inst) ? ' sel' : ''}" data-h="${inst.handle}" style="padding-left:${depth * 14 + 4}px">` +
        `<span class="tw">${kids.length ? (open ? '▾' : '▸') : ''}</span><span class="cls">${esc(inst.ClassName)}</span> ${esc(inst.props.Name)}<button class="add" title="Insert Object">+</button></div>`);
      if (open) for (const c of kids) row(c, depth + 1);
    };
    for (const name of SHOWN) { const s = this.dm.services[name]; if (s) row(s, 0); }
    this.el.innerHTML = rows.join('');
  }
}

export class Properties {
  constructor(el, dm, commands) {
    this.el = el; this.dm = dm; this.commands = commands; this.dirty = true;
    dm.watch(inst => { if (this.commands.selection.has(inst)) this.dirty = true; });
    commands.selection.onChange(() => { this.dirty = true; });
    this.onEdit = null;
    el.addEventListener('change', e => this.edit(e.target));
    el.addEventListener('click', e => { if (e.target.closest('[data-edit]') && this.onEdit) this.onEdit(this.commands.selection.items[0]); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  }
  update() {
    if (!this.dirty || this.el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    this.dirty = false;
    const items = this.commands.selection.items;
    if (!items.length) { this.el.innerHTML = '<div class="empty">Nothing selected</div>'; return; }
    const first = items[0], cls = items.every(i => i.ClassName === first.ClassName) ? first.ClassName : null;
    const props = cls ? propertiesOf(cls) : propertiesOf('Instance');
    for (const i of items) for (const p of props) if (p.name in i.props) this.dm.readout(i, p.name); // (AssemblyMass and the like: worked out when read)
    const groups = new Map();
    for (const p of props) { if (HIDDEN.has(p.name) || !(p.name in first.props)) continue; if (!groups.has(p.owner)) groups.set(p.owner, []); groups.get(p.owner).push(p); }
    const html = [`<div class="head">${esc(cls || 'Instances')} (${items.length})</div>`];
    if (items.length === 1 && ['Script', 'LocalScript', 'ModuleScript'].includes(cls)) html.push(`<button class="editscript" data-edit>Edit Script</button>`);
    for (const [owner, list] of [...groups].reverse()) {
      html.push(`<div class="grp">${esc(owner)}</div>`);
      for (const p of list) html.push(`<label class="prop"><span>${esc(p.name)}</span>${this.input(p, first.props[p.name], items.every(i => same(i.props[p.name], first.props[p.name])))}</label>`);
    }
    this.el.innerHTML = html.join('');
  }
  input(p, v, agree) {
    const ro = p.readOnly || p.name === 'ClassName' ? ' disabled' : '', k = `data-k="${p.name}" data-t="${p.type}"`;
    if (p.type === 'bool') return `<input type="checkbox" ${k}${v && agree ? ' checked' : ''}${ro}>`;
    if (p.type === 'number') return `<input type="number" step="any" ${k} value="${agree ? fmt(v) : ''}"${ro}>`;
    if (p.type === 'string') return `<input type="text" ${k} value="${agree ? esc(v) : ''}"${ro}>`;
    if (p.type === 'Vector3') return `<span class="v3">${['x', 'y', 'z'].map(a => `<input type="number" step="any" ${k} data-a="${a}" value="${agree && v ? fmt(v[a]) : ''}"${ro}>`).join('')}</span>`;
    if (p.type === 'Color3') return `<input type="color" ${k} value="${v ? hex(v) : '#000000'}"${ro}>`;
    if (p.type === 'BrickColor') { // Roblox's named colours, by name (the palette's 128 first, then the rest), each with its swatch colour
      const list = [...BrickColor.all].sort((a, b) => (a.palette < 0) - (b.palette < 0) || (a.palette - b.palette) || a.number - b.number);
      return `<select ${k}${ro}>${agree ? '' : '<option selected></option>'}${list.map(c => `<option value="${c.number}" style="background:${hex(c.color)}"${agree && v === c ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
    }
    if (p.type.startsWith('Enum.')) {
      const E = ENUMS[p.type.slice(5)] || {}, cur = v && v.name || v;
      return `<select ${k}${ro}>${Object.keys(E).map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    }
    if (p.type === 'Vector2') return `<span class="v3">${['x', 'y'].map(a => `<input type="number" step="any" ${k} data-a="${a}" value="${agree && v ? fmt(v[a]) : ''}"${ro}>`).join('')}</span>`;
    // UDim, UDim2, NumberRange and NumberSequence are typed as text, in Studio's own forms.
    if (TEXT_TYPES[p.type]) return `<input type="text" ${k} value="${agree && v ? esc(TEXT_TYPES[p.type].show(v)) : ''}"${ro}>`;
    if (p.type === 'ColorSequence') {
      // The gradient, with its first and last colours editable (inner keypoints are kept).
      const ks = v ? v.k : [], grad = ks.map(([t, c]) => `${hex(c)} ${(t * 100).toFixed(1)}%`).join(', ');
      return `<span class="cseq"><input type="color" ${k} data-a="first" value="${ks.length ? hex(ks[0][1]) : '#ffffff'}"${ro}><span class="grad" style="background:linear-gradient(90deg, ${agree && grad ? grad : '#0000, #0000'})"></span><input type="color" ${k} data-a="last" value="${ks.length ? hex(ks[ks.length - 1][1]) : '#ffffff'}"${ro}></span>`;
    }
    if (p.type === 'Instance') return `<span class="ref">${v ? esc(v.props.Name) : ''}</span>`;
    return `<span class="ref">${esc(String(v ?? ''))}</span>`;
  }
  edit(t) {
    const key = t.dataset.k, ty = t.dataset.t; if (!key) return;
    let value;
    if (ty === 'bool') value = t.checked;
    else if (ty === 'number') { value = parseFloat(t.value); if (!isFinite(value)) return this.dirty = true; }
    else if (ty === 'string') value = t.value;
    else if (ty === 'BrickColor') { if (!t.value) return this.dirty = true; value = BrickColor.byNumber(+t.value); }
    else if (ty === 'Color3') { const n = parseInt(t.value.slice(1), 16); value = new C3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
    else if (ty === 'Vector3') {
      // One field: change that component on each item, keeping its others.
      const a = t.dataset.a, n = parseFloat(t.value); if (!isFinite(n)) return this.dirty = true;
      this.commands.history.run('Set ' + key, tx => this.commands.selection.items.forEach(i => { const o = i.props[key]; if (o) tx.set(i, key, new V3(a === 'x' ? n : o.x, a === 'y' ? n : o.y, a === 'z' ? n : o.z)); }));
      this.dirty = true; return;
    } else if (ty === 'Vector2') {
      const a = t.dataset.a, n = parseFloat(t.value); if (!isFinite(n)) return this.dirty = true;
      this.commands.history.run('Set ' + key, tx => this.commands.selection.items.forEach(i => { const o = i.props[key]; if (o) tx.set(i, key, new V2(a === 'x' ? n : o.x, a === 'y' ? n : o.y)); }));
      this.dirty = true; return;
    } else if (ty === 'ColorSequence') {
      const n = parseInt(t.value.slice(1), 16), c = new C3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255), first = t.dataset.a === 'first';
      this.commands.history.run('Set ' + key, tx => this.commands.selection.items.forEach(i => {
        const ks = i.props[key].k.map(([kt, kc]) => [kt, kc]); ks[first ? 0 : ks.length - 1] = [ks[first ? 0 : ks.length - 1][0], c]; tx.set(i, key, new ColorSequence(ks));
      }));
      this.dirty = true; return;
    } else if (TEXT_TYPES[ty]) { try { value = TEXT_TYPES[ty].parse(t.value); } catch { value = null; } if (value == null) return this.dirty = true; } // not valid: shown again as it was
    else if (ty.startsWith('Enum.')) value = t.value;
    else return;
    this.commands.run('setProperty', { key, value });
    this.dirty = true;
  }
}

// Text forms: what the field shows, and what it accepts (null: not valid, nothing changes).
// UDim "{scale, offset}", UDim2 "{xs, xo},{ys, yo}" (Studio's), NumberRange "min max" (one number
// sets both), NumberSequence one number (constant), "start end", or Roblox's serialised form
// ("time value envelope" per keypoint, checked with Roblox's rules).
const nums = s => { const m = String(s).match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi); return m ? m.map(Number) : []; };
const TEXT_TYPES = {
  // A Font as 'Family, Weight, Style' with the family's short name (Oswald, Bold, Italic); a full rbxasset or
  // rbxassetid id is kept as typed. Weight and Style may be left out (Regular, Normal).
  Font: {
    show: f => `${(/^rbxasset:\/\/fonts\/families\/(.+)\.json$/.exec(f.family) || [0, f.family])[1]}, ${f.weight}, ${f.style}`,
    parse: s => { const [fam, w = 'Regular', st = 'Normal'] = String(s).split(',').map(x => x.trim()); if (!fam || !(w in ENUMS.FontWeight) || !(st in ENUMS.FontStyle)) return null; return new Font(/^rbxasset(id)?:\/\//.test(fam) ? fam : `rbxasset://fonts/families/${fam}.json`, w, st); },
  },
  UDim: { show: u => `{${fmt(u.s)}, ${u.o}}`, parse: s => { const n = nums(s); return n.length === 2 ? new UDim(n[0], n[1]) : null; } },
  UDim2: { show: u => `{${fmt(u.xs)}, ${u.xo}},{${fmt(u.ys)}, ${u.yo}}`, parse: s => { const n = nums(s); return n.length === 4 ? new UDim2(...n) : null; } },
  NumberRange: {
    show: r => r.min === r.max ? fmt(r.min) : `${fmt(r.min)} ${fmt(r.max)}`,
    parse: s => { const n = nums(s); if (n.length === 1) return new NumberRange(n[0]); return n.length === 2 && n[0] <= n[1] ? new NumberRange(n[0], n[1]) : null; },
  },
  NumberSequence: {
    show: q => q.k.every(k => k[1] === q.k[0][1] && !k[2]) ? fmt(q.k[0][1]) : q.k.length === 2 && !q.k[0][2] && !q.k[1][2] ? `${fmt(q.k[0][1])} ${fmt(q.k[1][1])}` : q.toString().trim(),
    parse: s => {
      const n = nums(s);
      if (n.length === 1) return NumberSequence.of(n[0]);
      if (n.length === 2) return NumberSequence.of(n[0], n[1]);
      if (n.length < 6 || n.length % 3 || n.length / 3 > 20) return null;
      const k = []; for (let i = 0; i < n.length; i += 3) k.push([n[i], n[i + 1], n[i + 2]]);
      const ok = k[0][0] === 0 && k[k.length - 1][0] === 1 && k.every((x, i) => x[2] >= 0 && (!i || x[0] >= k[i - 1][0]));
      return ok ? new NumberSequence(k) : null;
    },
  },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = n => typeof n === 'number' ? String(Math.round(n * 1000) / 1000) : '';
const hex = c => '#' + [c.r, c.g, c.b].map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
function same(a, b) { if (a === b) return true; if (a && b && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b); return false; }
