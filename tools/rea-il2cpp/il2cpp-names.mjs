#!/usr/bin/env node
// Unity IL2CPP names into REA: reads the script.json Il2CppDumper writes for a
// game (its ScriptMethod entries: an address relative to the image base, a
// name like "AdManager$$ShowRewardedVideo", a C signature) and writes what an
// agent needs to name those functions in its REA/Ghidra session:
//   - names-NNN.json: batches of { "0xADDRESS": "Name" } for REA's
//     set_addresses_names (after open_binary on the game's libil2cpp.so);
//   - index.tsv: every selected method (address, name, signature), to grep.
// A game has tens of thousands of methods; --match keeps the ones a question
// needs (e.g. "Ad|Revive|Difficulty|Score"), so the session stays small.
// Addresses: Ghidra loads a shared object at image base 0x100000 (REA reports
// it; pass --base if a target differs).
// Usage: il2cpp-names.mjs script.json out-dir [--match REGEX] [--base 0x100000] [--batch 500]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [input, outDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input || !outDir) { console.error('usage: il2cpp-names.mjs script.json out-dir [--match REGEX] [--base 0x100000] [--batch 500]'); process.exit(2); }
const base = BigInt(opt('--base', '0x100000')), batch = +opt('--batch', 500);
const match = opt('--match', null) ? new RegExp(opt('--match', null), 'i') : null;

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const methods = data.ScriptMethod || [];
if (!methods.length) { console.error('no ScriptMethod entries: is this an Il2CppDumper script.json?'); process.exit(1); }

// Ghidra labels can't hold spaces; Il2CppDumper's own Ghidra script swaps them for '-'.
// The same method name can occur at several addresses (generic instances): suffix the later ones.
const label = n => n.replace(/\s/g, '-');
const seen = new Map(), picked = [];
for (const m of methods) {
  if (match && !match.test(m.Name) && !match.test(m.Signature || '')) continue;
  const addr = '0x' + (base + BigInt(m.Address)).toString(16);
  let name = label(m.Name);
  const k = seen.get(name) || 0; seen.set(name, k + 1);
  if (k) name += '_' + k;
  picked.push({ addr, name, sig: m.Signature || '' });
}
// One name per address (several methods can share code: the first keeps it).
const byAddr = new Map();
for (const p of picked) if (!byAddr.has(p.addr)) byAddr.set(p.addr, p);
const list = [...byAddr.values()];

fs.mkdirSync(outDir, { recursive: true });
for (let i = 0; i * batch < list.length; i++) {
  const chunk = Object.fromEntries(list.slice(i * batch, (i + 1) * batch).map(p => [p.addr, p.name]));
  fs.writeFileSync(path.join(outDir, `names-${String(i).padStart(3, '0')}.json`), JSON.stringify(chunk));
}
fs.writeFileSync(path.join(outDir, 'index.tsv'), list.map(p => `${p.addr}\t${p.name}\t${p.sig}`).join('\n') + '\n');
console.log(JSON.stringify({ methods: methods.length, selected: list.length, batches: Math.ceil(list.length / batch), base: '0x' + base.toString(16), out: outDir }));
