// Path booleans: VectorCraft's own pathops (crates/pathops, Illustrator's Pathfinder: the shape modes and Divide, Trim, Merge, Crop,
// curve-preserving, on linesweeper's robust sweep; github.com/storytold/vectorcraft, MIT/Apache)
// compiled to wasm (web/vector/pathops.wasm, built by tools/vector-oracle/run.sh from
// tools/vector-oracle/pathops/lib.rs) rather than ported line by line: 4.8k lines of pathops plus
// linesweeper and kurbo. test/vector.test.mjs holds the wasm to the same code built natively.
// Paths are geom.js's: subpaths { anchors: [{ p, in, out, kind }], closed }.
export const OPS = ['unite', 'minusFront', 'intersect', 'exclude', 'divide', 'trim', 'merge', 'crop'];
let module = null, inst = null;

/** Load the module (bytes: the .wasm, else fetched next to this source). Resolves when ready. */
export async function loadPathops(bytes) {
  if (inst) return;
  if (!bytes) bytes = await (await fetch(new URL('../../web/vector/pathops.wasm', import.meta.url))).arrayBuffer();
  module = await WebAssembly.compile(bytes);
  inst = new WebAssembly.Instance(module, {});
}
export const pathopsReady = () => !!inst;

function encode(op, paths, keys = paths.map((_, i) => i)) {
  const v = [OPS.indexOf(op), paths.length];
  paths.forEach((path, n) => {
    v.push(keys[n], path.length);
    for (const sp of path) {
      v.push(sp.closed ? 1 : 0, sp.anchors.length);
      for (const a of sp.anchors) v.push(a.p[0], a.p[1], a.in[0], a.in[1], a.out[0], a.out[1], a.kind === 'Smooth' ? 1 : 0);
    }
  });
  return v;
}
/** Run the module on a flat input (see lib.rs); the flat output. */
export function runFlat(input) {
  if (!inst) throw new Error('pathops not loaded');
  const X = inst.exports, n = input.length, p = X.alloc(n);
  try {
    new Float64Array(X.memory.buffer, p, n).set(input);
    const len = X.pathfinder_run(p, n);
    return Array.from(new Float64Array(X.memory.buffer, X.out_ptr(), len));
  } catch (e) { // a trap (a panic inside) leaves the instance unusable: start a fresh one
    inst = new WebAssembly.Instance(module, {});
    throw e;
  } finally { try { X.free(p, n); } catch { /* the instance was replaced */ } }
}
/** Results as [{ key, path }]: key is the key (by default the index) of the input whose paint the result keeps. */
export function decode(v) {
  if (v[0] < 0) return null;
  let i = 0; const next = () => v[i++], out = [];
  for (let s = next(); s > 0; s--) {
    const key = next(), path = [];
    for (let k = next(); k > 0; k--) {
      const closed = next() !== 0, anchors = [];
      for (let a = next(); a > 0; a--) { const p = [next(), next()], hin = [next(), next()], hout = [next(), next()]; anchors.push({ p, in: hin, out: hout, kind: next() ? 'Smooth' : 'Corner' }); }
      path.push({ anchors, closed });
    }
    out.push({ key, path });
  }
  return out;
}
/** Pathfinder `op` over `paths` (back to front), each filled non-zero; `keys` name their paints
 *  (Merge joins shapes of one key; default: each its own). [] when nothing is left; null if it failed. */
export function pathfinder(op, paths, keys) {
  if (!OPS.includes(op)) throw new Error('unknown op ' + op);
  try { return decode(runFlat(encode(op, paths, keys))); } catch { return null; }
}
export { encode as encodePathfinder };
