// Studio's Output window, in the player when it was opened by the editor's Play: every print,
// warn and script error (with its traceback) as a timestamped line, warnings orange, errors red;
// Clear; collapsible (open on desktop, closed on a phone until tapped). Lines that arrive before
// the page is ready are kept and shown once it is. A line naming a script and a line
// (`ServerScriptService.Broken:3: ...`) is a link: onOpen(fullName, line) (the player sends it
// back to the editor, which opens that script there, as Studio's Output does).
const MAX_LINES = 500;
const stamp = d => [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');

export class Output {
  constructor() { this.lines = []; this.el = null; this.list = null; this.onOpen = null; }
  /** Record one message (level 0 print, 1 warn, 2 error). */
  add(text, level = 0) {
    const line = { time: stamp(new Date()), text: String(text), level };
    this.lines.push(line); if (this.lines.length > MAX_LINES) this.lines.shift();
    if (this.list) { this.append(line); while (this.list.childElementCount > MAX_LINES) this.list.firstChild.remove(); }
  }
  append(l) {
    const row = document.createElement('div');
    row.className = 'out-line' + (l.level === 2 ? ' err' : l.level === 1 ? ' warn' : '');
    row.textContent = `${l.time}  ${l.text}`;
    const at = /^([A-Za-z_][\w ]*(?:\.[\w ]+)+):(\d+):/.exec(l.text); // Service.Path.Script:line:
    if (at) { row.classList.add('link'); row.dataset.script = at[1]; row.dataset.line = at[2]; row.title = `Open ${at[1]} at line ${at[2]}`; }
    const atEnd = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 4;
    this.list.appendChild(row);
    if (atEnd) this.list.scrollTop = this.list.scrollHeight;
  }
  /** Put the window on the page. */
  mount(open = !matchMedia('(max-width:760px)').matches) {
    const css = document.createElement('style');
    css.textContent = '#output{position:fixed;left:8px;bottom:8px;z-index:10;width:min(560px,calc(100vw - 16px));display:flex;flex-direction:column;background:#1b1c1fee;border:1px solid #3a3d44;border-radius:8px;font:12px ui-monospace,Menlo,Consolas,monospace;color:#ddd}' +
      '#output .out-head{display:flex;gap:6px;align-items:center;padding:4px 6px}#output .out-head b{flex:1;font:600 13px system-ui,sans-serif}#output button{height:28px;padding:0 10px;border:1px solid #3a3d44;border-radius:6px;background:#26282d;color:#ddd;font:13px system-ui,sans-serif}' +
      '#output .out-list{height:180px;overflow-y:auto;padding:2px 8px 6px;white-space:pre-wrap;word-break:break-word}#output.closed .out-list,#output.closed [data-out=clear]{display:none}#output .warn{color:#ffb347}#output .err{color:#ff7b7b}#output .link{cursor:pointer}#output .link:hover{text-decoration:underline}' +
      '@media (max-width:760px){#output button{height:40px;min-width:44px}#output .out-list{height:30vh}}';
    document.head.appendChild(css);
    const el = this.el = document.createElement('div');
    el.id = 'output'; el.className = open ? '' : 'closed';
    el.innerHTML = '<div class="out-head"><b>Output</b><button data-out="clear">Clear</button><button data-out="toggle"></button></div><div class="out-list"></div>';
    this.list = el.querySelector('.out-list');
    const label = () => { el.querySelector('[data-out=toggle]').textContent = el.classList.contains('closed') ? 'Show' : 'Hide'; };
    el.addEventListener('click', e => {
      const link = e.target.closest('.out-line.link');
      if (link && this.onOpen) return this.onOpen(link.dataset.script, +link.dataset.line);
      const b = e.target.closest('[data-out]'); if (!b) return;
      if (b.dataset.out === 'clear') { this.lines = []; this.list.innerHTML = ''; } else { el.classList.toggle('closed'); label(); this.list.scrollTop = this.list.scrollHeight; }
    });
    // Touches and clicks on the window are the window's, not the camera's.
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'wheel']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    label(); document.body.appendChild(el);
    for (const l of this.lines) this.append(l);
    this.list.scrollTop = this.list.scrollHeight;
  }
}
