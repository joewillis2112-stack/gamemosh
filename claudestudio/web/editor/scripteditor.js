// The script editor: a Script's, LocalScript's or ModuleScript's Source in a code editor, as Studio
// opens one in a tab. CodeMirror 6 (MIT) with Luau highlighting (luaumode.js), line numbers,
// bracket matching, search and its own undo; syntax errors as you type, from the same Luau
// compiler that runs the game (vm.check), marked on their line and shown under the editor.
// Closing writes the Source back as one undo step in the editor (nothing if unchanged); so does
// Ctrl+S, without closing. Play reads the Source, so the editor writes it before a Play.
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { luau } from './luaumode.js';

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
  constructor({ dm, commands, vm, panel, onState = () => {} }) {
    Object.assign(this, { dm, commands, vm, panel, onState });
    this.inst = null; this.view = null; this.error = null;
    panel.innerHTML = `<div class="ie-head"><b class="se-title"></b><span class="grow"></span><button data-se="save" title="Write the Source (Ctrl+S)">Save</button><button data-se="close" class="primary">Close</button></div>` +
      `<div class="se-body"></div><div class="se-status"></div>`;
    this.title = panel.querySelector('.se-title'); this.body = panel.querySelector('.se-body'); this.status = panel.querySelector('.se-status');
    panel.addEventListener('click', e => { const b = e.target.closest('[data-se]'); if (!b) return; if (b.dataset.se === 'close') this.close(); else this.save(); });
  }
  get active() { return !!this.inst; }
  static isScript(inst) { return !!inst && SCRIPT_CLASSES.includes(inst.ClassName); }

  /** Open `inst` (a script); false if it isn't one. */
  open(inst) {
    if (!ScriptEditor.isScript(inst)) return false;
    if (this.inst) this.close();
    this.inst = inst;
    this.title.textContent = `${inst.ClassName} ${inst.Name}`;
    this.panel.hidden = false;
    const check = view => { // Luau's own compiler: one diagnostic at the error's line
      const e = this.vm.check(view.state.doc.toString()); this.error = e; this.showStatus();
      if (!e) return [];
      const line = view.state.doc.line(Math.min(Math.max(e.line, 1), view.state.doc.lines));
      return [{ from: line.from, to: Math.max(line.to, line.from), severity: 'error', message: e.message }];
    };
    this.view = new EditorView({
      parent: this.body, doc: inst.props.Source,
      extensions: [basicSetup, StreamLanguage.define(luau), syntaxHighlighting(style), theme, lintGutter(), linter(check, { delay: 300 }),
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { this.save(); return true; } }])],
    });
    this.error = this.vm.check(inst.props.Source); this.showStatus();
    this.view.focus();
    this.onState({ active: true });
    return true;
  }
  showStatus() { this.status.textContent = this.error ? `Line ${this.error.line}: ${this.error.message}` : 'No errors'; this.status.classList.toggle('bad', !!this.error); }
  get text() { return this.view ? this.view.state.doc.toString() : null; }
  /** Write the Source if it changed: one undo step. */
  save() {
    const inst = this.inst, t = this.text;
    if (!inst || t === inst.props.Source) return false;
    this.commands.history.run('Edit Script', tx => tx.set(inst, 'Source', t));
    return true;
  }
  close() {
    if (!this.inst) return;
    this.save();
    this.view.destroy(); this.view = null; this.inst = null;
    this.panel.hidden = true; this.onState({ active: false });
  }
  /** The Source a new script starts with (Studio's). */
  static get newSource() { return NEW_SOURCE; }
}
