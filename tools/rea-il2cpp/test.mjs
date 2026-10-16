// il2cpp-names.mjs against a stand-in for a game: a small C shared object, with
// a script.json in Il2CppDumper's format built from its real symbol addresses.
// Checks the --match filter, the image base, label cleanup (spaces), suffixes for
// repeated names, one name per address, and batching. Needs gcc and nm.
// (Checked once by hand through REA/Ghidra 12.1.4: Ghidra loads the .so at
// 0x100000 and the decompile of Revive$$Offer calls the renamed functions.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'il2cpp-names-'));
const here = path.dirname(new URL(import.meta.url).pathname);
fs.writeFileSync(path.join(dir, 'g.c'), `int score;
int AdManager_ShowRewarded(int x){ return x*3+score; }
int Difficulty_Ramp(int s){ return s>100 ? s/2 : s+7; }
int Player_Jump(int h){ return h-1; }
int Revive_Offer(int a,int b){ return AdManager_ShowRewarded(a)+Difficulty_Ramp(b); }
`);
execFileSync('gcc', ['-O1', '-shared', '-fPIC', '-o', path.join(dir, 'g.so'), path.join(dir, 'g.c')]);
const sym = {};
for (const l of execFileSync('nm', [path.join(dir, 'g.so')]).toString().split('\n')) { const [a, , n] = l.split(' '); if (n) sym[n] = parseInt(a, 16); }
const M = (fn, Name) => ({ Address: sym[fn], Name, Signature: `int32_t ${fn}(void)`, TypeSignature: 'ii' });
fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ ScriptMethod: [
  M('AdManager_ShowRewarded', 'AdManager$$ShowRewarded'),
  M('Difficulty_Ramp', 'Difficulty$$Ramp'),
  M('Player_Jump', 'Player$$Jump'),
  M('Revive_Offer', 'Revive$$Offer System.Int32 b'),
  M('Revive_Offer', 'Revive$$Offer System.Int32 b'),        // shared code: dropped
  { ...M('Player_Jump', 'Difficulty$$Ramp'), Address: sym.Player_Jump + 4 }, // repeated name: suffixed
] }));

const run = (...a) => JSON.parse(execFileSync('node', [path.join(here, 'il2cpp-names.mjs'), path.join(dir, 'script.json'), ...a]).toString());
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const hex = n => '0x' + n.toString(16);

const out = path.join(dir, 'out');
const r = run(out, '--match', 'Ad|Revive|Difficulty', '--batch', '2');
const names = Object.assign({}, ...fs.readdirSync(out).filter(f => f.startsWith('names-')).sort().map(f => JSON.parse(fs.readFileSync(path.join(out, f)))));
check(r.selected === 4 && r.batches === 2, `--match keeps 4 of 6 methods, in 2 batches of 2 (${r.selected}, ${r.batches})`);
check(names[hex(0x100000 + sym.AdManager_ShowRewarded)] === 'AdManager$$ShowRewarded', 'addresses are image base 0x100000 + RVA');
check(names[hex(0x100000 + sym.Revive_Offer)] === 'Revive$$Offer-System.Int32-b', 'spaces become - (Ghidra labels)');
check(names[hex(0x100000 + sym.Player_Jump + 4)] === 'Difficulty$$Ramp_1', 'a repeated name gets a suffix');
check(!Object.values(names).includes('Player$$Jump'), 'unmatched methods are left out');
check(fs.readFileSync(path.join(out, 'index.tsv'), 'utf8').trim().split('\n').length === 4, 'index.tsv has one line per selected method');

const out2 = path.join(dir, 'out2');
run(out2, '--base', '0x0');
const n2 = JSON.parse(fs.readFileSync(path.join(out2, 'names-000.json')));
check(n2[hex(sym.Player_Jump)] === 'Player$$Jump' && Object.keys(n2).length === 5, '--base 0x0 and no --match: all 5 addresses, raw RVAs');

fs.rmSync(dir, { recursive: true });
if (fail) { console.log(fail + ' failed'); process.exit(1); }
