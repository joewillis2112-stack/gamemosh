// The Explorer (the instance tree) and Properties (the selection's properties,
// editable), as in Roblox Studio. Plain DOM, rebuilt from the DataModel when it
// changes (at most once a frame). Every edit is a command, so it can be undone.
import { ENUMS, V3, C3, propertiesOf } from '../datamodel.js';

// Studio shows these services in the Explorer, in this order (others it hides).
const SHOWN = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService'];
// Properties the panel doesn't offer (engine-written, or shown another way).
const HIDDEN = new Set(['CFrame', 'AssemblyLinearVelocity', 'AssemblyAngularVelocity', 'Focus', 'MeshData']); // MeshData: edited in Edit Mode, not as text

export class Explorer {
  constructor(el, dm, commands) {
    this.el = el; this.dm = dm; this.commands = commands;
    this.open = new Set([dm.workspace]);
    this.dirty = true;
    dm.watch((inst, key) => { if (key === 'Parent' || key === 'Name') this.dirty = true; });
    commands.selection.onChange(items => { for (const i of items) for (let a = i.parent; a; a = a.parent) this.open.add(a); this.dirty = true; });
    el.addEventListener('click', e => {
      const row = e.target.closest('[data-h]'); if (!row) return;
      const inst = this.dm.byHandle[+row.dataset.h];
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
        `<span class="tw">${kids.length ? (open ? '▾' : '▸') : ''}</span><span class="cls">${esc(inst.ClassName)}</span> ${esc(inst.props.Name)}</div>`);
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
    el.addEventListener('change', e => this.edit(e.target));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  }
  update() {
    if (!this.dirty || this.el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    this.dirty = false;
    const items = this.commands.selection.items;
    if (!items.length) { this.el.innerHTML = '<div class="empty">Nothing selected</div>'; return; }
    const first = items[0], cls = items.every(i => i.ClassName === first.ClassName) ? first.ClassName : null;
    const props = cls ? propertiesOf(cls) : propertiesOf('Instance');
    const groups = new Map();
    for (const p of props) { if (HIDDEN.has(p.name) || !(p.name in first.props)) continue; if (!groups.has(p.owner)) groups.set(p.owner, []); groups.get(p.owner).push(p); }
    const html = [`<div class="head">${esc(cls || 'Instances')} (${items.length})</div>`];
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
    if (p.type.startsWith('Enum.')) {
      const E = ENUMS[p.type.slice(5)] || {}, cur = v && v.name || v;
      return `<select ${k}${ro}>${Object.keys(E).map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
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
    else if (ty === 'Color3') { const n = parseInt(t.value.slice(1), 16); value = new C3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
    else if (ty === 'Vector3') {
      // One field: change that component on each item, keeping its others.
      const a = t.dataset.a, n = parseFloat(t.value); if (!isFinite(n)) return this.dirty = true;
      this.commands.history.run('Set ' + key, tx => this.commands.selection.items.forEach(i => { const o = i.props[key]; if (o) tx.set(i, key, new V3(a === 'x' ? n : o.x, a === 'y' ? n : o.y, a === 'z' ? n : o.z)); }));
      this.dirty = true; return;
    } else if (ty.startsWith('Enum.')) value = t.value;
    else return;
    this.commands.run('setProperty', { key, value });
    this.dirty = true;
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = n => typeof n === 'number' ? String(Math.round(n * 1000) / 1000) : '';
const hex = c => '#' + [c.r, c.g, c.b].map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
function same(a, b) { if (a === b) return true; if (a && b && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b); return false; }
