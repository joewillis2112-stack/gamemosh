// The script editor: a Script's, LocalScript's or ModuleScript's Source in a code editor, as Studio
// opens one in a tab. CodeMirror 6 (MIT) with Luau highlighting (luaumode.js), line numbers,
// bracket matching, search and its own undo; syntax errors as you type, from the same Luau
// compiler that runs the game (vm.check), marked on their line and shown under the editor.
// Several scripts open in tabs (each keeps its own text, undo and cursor; • marks unsaved changes;
// × writes and closes one). Close writes every open script (one undo step each that changed) and
// hides the editor, keeping its tabs; Ctrl+S writes the open one. Play reads the Source, so the
// editor writes it before a Play.
// Autocomplete (completions.js) offers what the engine really has: the VM's libraries, the class
// table's members, services, classes and enums, and the open place's own instances.
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { autocompletion } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { luau } from './luaumode.js';
import { complete } from './completions.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const SCRIPT_CLASSES = ['Script', 'LocalScript', 'ModuleScript'];
const NEW_SOURCE = 'print("Hello world!")\n'; // what Studio puts in a new script

const style = HighlightStyle.define([
  { tag: tags.keyword, color: '#f86d7c' }, { tag: tags.string, color: '#adf195' }, { tag: tags.number, color: '#ffc600' },
  { tag: tags.comment, color: '#666', fontStyle: 'italic' }, { tag: [tags.standard(tags.variableName), tags.special(tags.variableName)], color: '#84d6f7' },
  { tag: tags.operator, color: '#cccccc' },
]);
const theme = EditorView.theme({
  '&': { height: '100%', background: '#1e1f22', color: '#e6e6e6', fontSize: '14px' },
  '.cm-content': { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', caretColor: '#fff' },
  '.cm-gutters': { background: '#1b1c1f', color: '#6b6f77', border: 'none' },
  '.cm-activeLine': { background: '#ffffff0a' }, '.cm-activeLineGutter': { background: '#ffffff10' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#fff' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: '#3a4a6b !important' },
}, { dark: true });

export class ScriptEditor {
  constructor({ dm, commands, vm, panel, libs = {}, onState = () => {} }) {
    Object.assign(this, { dm, commands, vm, panel, libs, onState });
    this.tabs = []; this.cur = -1; this.view = null; this.error = null;
    // A Source changed from outside (the scene's Undo/Redo, a script): a tab with no unsaved edits follows it.
    dm.watch((inst, key) => { if (key === 'Source') this.sourceChanged(inst); });
    panel.innerHTML = `<div class="ie-head"><div class="se-tabs"></div><span class="grow"></span><button data-se="save" title="Write the Source (Ctrl+S)">Save</button><button data-se="close" class="primary" title="Write every open script and hide the editor (its tabs stay)">Close</button></div>` +
      `<div class="se-body"></div><div class="se-status"></div>`;
    this.tabBar = panel.querySelector('.se-tabs'); this.body = panel.querySelector('.se-body'); this.status = panel.querySelector('.se-status');
    panel.addEventListener('click', e => {
      const x = e.target.closest('[data-tab-close]'); if (x) return this.closeTab(+x.dataset.tabClose);
      const t = e.target.closest('[data-tab]'); if (t) return this.switchTo(+t.dataset.tab);
      const b = e.target.closest('[data-se]'); if (!b) return; if (b.dataset.se === 'close') this.close(); else this.save();
    });
  }
  get active() { return !this.panel.hidden && this.cur >= 0; }
  get inst() { return this.cur >= 0 ? this.tabs[this.cur].inst : null; }
  static isScript(inst) { return !!inst && SCRIPT_CLASSES.includes(inst.ClassName); }

  // Each tab's own editor state (document, undo history, selection), all with the same extensions.
  makeState(inst) {
    const check = view => { // Luau's own compiler: one diagnostic at the error's line
      const e = this.vm.check(view.state.doc.toString()); this.error = e; this.showStatus();
      if (!e) return [];
      const line = view.state.doc.line(Math.min(Math.max(e.line, 1), view.state.doc.lines));
      return [{ from: line.from, to: Math.max(line.to, line.from), severity: 'error', message: e.message }];
    };
    return EditorState.create({
      doc: inst.props.Source,
      extensions: [basicSetup, StreamLanguage.define(luau),
        autocompletion({ override: [cx => complete(cx.state.doc.toString(), cx.pos, { libs: this.libs, dm: this.dm, script: this.inst })] }), syntaxHighlighting(style), theme, lintGutter(), linter(check, { delay: 300 }),
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { this.save(); return true; } }]),
        EditorView.updateListener.of(u => { if (u.docChanged) this.renderTabs(); })],
    });
  }
  /** Open `inst` (a script) in its tab (a new one if it has none) and show the editor; false if it isn't a script. */
  open(inst) {
    if (!ScriptEditor.isScript(inst)) return false;
    let i = this.tabs.findIndex(t => t.inst === inst);
    if (i < 0) { this.tabs.push({ inst, state: this.makeState(inst), saved: inst.props.Source }); i = this.tabs.length - 1; }
    this.panel.hidden = false;
    this.switchTo(i);
    this.onState({ active: true });
    return true;
  }
  switchTo(i) {
    if (i < 0 || i >= this.tabs.length) return;
    if (this.cur >= 0 && this.view) this.tabs[this.cur].state = this.view.state;
    this.cur = i;
    if (!this.view) this.view = new EditorView({ parent: this.body, state: this.tabs[i].state });
    else this.view.setState(this.tabs[i].state);
    this.error = this.vm.check(this.text); this.showStatus();
    this.renderTabs(); this.view.focus();
  }
  /** Write tab i's script and close the tab; the last one closed hides the editor. */
  closeTab(i) {
    if (i < 0 || i >= this.tabs.length) return;
    if (this.cur >= 0) this.tabs[this.cur].state = this.view.state; // keep the open tab's edits, whichever tab closes
    this.write(this.tabs[i]);
    this.tabs.splice(i, 1);
    if (!this.tabs.length) { this.cur = -1; this.view.destroy(); this.view = null; this.panel.hidden = true; this.renderTabs(); this.onState({ active: false }); return; }
    const next = i < this.cur ? this.cur - 1 : Math.min(this.cur === i ? i : this.cur, this.tabs.length - 1);
    this.cur = -1; // the closed tab's state isn't kept
    this.switchTo(next);
  }
  docOf(i) { return (i === this.cur && this.view ? this.view.state : this.tabs[i].state).doc.toString(); }
  sourceChanged(inst) {
    this.tabs.forEach((t, i) => {
      if (t.inst !== inst) return;
      const doc = this.docOf(i), src = inst.props.Source;
      if (doc === src) { t.saved = src; return; }
      if (doc !== t.saved) return; // unsaved edits: they stay (they're what's on screen)
      t.state = this.makeState(inst); t.saved = src;
      if (i === this.cur && this.view) { this.view.setState(t.state); this.error = this.vm.check(src); this.showStatus(); }
    });
    this.renderTabs();
  }
  renderTabs() {
    this.tabBar.innerHTML = this.tabs.map((t, i) => {
      const dirty = this.docOf(i) !== t.saved;
      return `<span class="se-tab${i === this.cur ? ' on' : ''}" data-tab="${i}" title="${t.inst.ClassName} ${esc(t.inst.Name)}">${esc(t.inst.Name)}${dirty ? ' •' : ''}<button data-tab-close="${i}" title="Close (writes it)">×</button></span>`;
    }).join('');
  }
  /** Put the cursor at the start of line n and scroll it into view. */
  goToLine(n) {
    const d = this.view.state.doc, line = d.line(Math.min(Math.max(n, 1), d.lines));
    this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true }); this.view.focus();
  }
  showStatus() { this.status.textContent = this.error ? `Line ${this.error.line}: ${this.error.message}` : 'No errors'; this.status.classList.toggle('bad', !!this.error); }
  get text() { return this.view ? this.view.state.doc.toString() : null; }
  write(tab) { // one undo step if the script changed
    const t = tab.state.doc.toString();
    if (t === tab.inst.props.Source) { tab.saved = t; return false; }
    tab.saved = t;
    this.commands.history.run('Edit Script', tx => tx.set(tab.inst, 'Source', t));
    return true;
  }
  /** Write the open tab's script if it changed: one undo step. */
  save() {
    if (this.cur < 0) return false;
    this.tabs[this.cur].state = this.view.state;
    const r = this.write(this.tabs[this.cur]); this.renderTabs(); return r;
  }
  /** Write every open script (one step each that changed) and hide the editor; the tabs stay for next time. */
  close() {
    if (this.panel.hidden) return;
    if (this.cur >= 0) this.tabs[this.cur].state = this.view.state;
    this.tabs.forEach(t => this.write(t));
    this.renderTabs();
    this.panel.hidden = true; this.onState({ active: false });
  }
  /** The Source a new script starts with (Studio's). */
  static get newSource() { return NEW_SOURCE; }
}
