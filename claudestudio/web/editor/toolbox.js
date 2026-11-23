// Studio's Toolbox: free models to put in the place. The library is assets/library/catalog.json
// (tools/library.mjs: Poly Haven's CC0 models and Kenney's kits, each through the asset gate). A
// search box (names, tags, categories), the categories, a grid of thumbnails; a tap inserts the
// model as a MeshPart at its real size where the camera looks (Commands.insert: one undo step),
// selected. Poly Haven's textures come at the fidelity tier's resolution (runtime/world.js).
import { V3 } from '../datamodel.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Toolbox {
  constructor({ panel, commands, base = '../assets/library/' }) {
    Object.assign(this, { panel, commands, base });
    this.onState = null; // (open) => void: the toolbar button's state
    this.items = []; this.query = ''; this.category = '';
    this.ready = fetch(base + 'catalog.json').then(r => r.json()).then(c => { this.items = c.items; this.build(); }).catch(e => { this.error = String(e); });
  }

  /** The categories, by how many items each has. */
  categories() {
    const n = new Map();
    for (const it of this.items) for (const c of it.categories) n.set(c, (n.get(c) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }

  /** Items matching a query (every word in the name, a tag, a category or the source) and a category. */
  search(query = this.query, category = this.category) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.items.filter(it => (!category || it.categories.includes(category)) &&
      words.every(w => it.name.toLowerCase().includes(w) || it.tags.some(t => t.toLowerCase().startsWith(w)) || it.categories.some(c => c.toLowerCase().includes(w)) || it.source.toLowerCase().includes(w)));
  }

  build() {
    const P = this.panel;
    P.innerHTML = `<div class="tb-head"><input type="search" placeholder="Search models" aria-label="Search models"><button data-tb-close title="Close">×</button></div>` +
      `<div class="tb-cats"><button data-cat="" class="on">All</button>${this.categories().slice(0, 24).map(c => `<button data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>` +
      `<div class="tb-grid"></div><div class="tb-foot">Poly Haven (CC0) and Kenney (MIT)</div>`;
    const input = P.querySelector('input');
    input.addEventListener('input', () => { this.query = input.value; this.render(); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.blur(); this.close(); } });
    P.addEventListener('click', e => {
      if (e.target.closest('[data-tb-close]')) return this.close();
      const cat = e.target.closest('[data-cat]');
      if (cat) { this.category = cat.dataset.cat; P.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b === cat)); return this.render(); }
      const tile = e.target.closest('[data-item]');
      if (tile) this.insert(tile.dataset.item);
    });
    this.render();
  }

  render() {
    const grid = this.panel.querySelector('.tb-grid'); if (!grid) return;
    const list = this.search();
    grid.innerHTML = list.slice(0, 200).map(it => `<button data-item="${esc(it.id)}" title="${esc(it.name)}: ${it.size.map(v => v.toFixed(1)).join(' x ')} studs, ${it.tris} triangles, ${esc(it.source)}"><img loading="lazy" src="${this.base}${esc(it.thumb)}" alt=""><span>${esc(it.name)}</span></button>`).join('') ||
      `<p class="tb-none">No models match</p>`;
  }

  open() { this.panel.hidden = false; this.onState && this.onState(true); this.ready.then(() => { const i = this.panel.querySelector('input'); if (i && !this.panel.hidden && matchMedia('(pointer: fine)').matches) i.focus(); }); }
  close() { this.panel.hidden = true; this.onState && this.onState(false); }
  toggle() { if (this.panel.hidden) this.open(); else this.close(); }

  /** Insert an item (by id): a MeshPart of its model at its size, where the camera looks; selected. */
  insert(id) {
    const it = this.items.find(i => i.id === id); if (!it) return null;
    // Its URL: Poly Haven's at 1k (runtime/world.js loads the tier's resolution).
    return this.commands.run('insert', { className: 'MeshPart', props: { Name: it.name.replace(/[^\w ]/g, '').replace(/\s+/g, ' ').trim() || 'Model', MeshId: it.url, Size: new V3(...it.size) } });
  }
}
