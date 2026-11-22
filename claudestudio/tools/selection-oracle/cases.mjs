// The cases web/paint/selection.js is checked on against PhotoCraft's Rust (run.sh): marquee
// rectangles and ellipses (anti-aliased or not, partly off the canvas) in every mode over an
// existing selection, lassos (convex, concave, self-crossing, sub-pixel points) in every mode, and
// feathers of hard and soft selections, narrow (PhotoCraft's direct kernel) and wide (its cosine
// series). Seeded, so the file only changes when this does.
let s = 3; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const W = 40, H = 30, cases = [];
const bytes = fn => { const m = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m.push(Math.max(0, Math.min(255, Math.round(fn(x, y))))); return m; };
const olds = [null, bytes((x, y) => (x >= 10 && x < 30 && y >= 5 && y < 25 ? 255 : 0)), bytes((x, y) => 255 * Math.max(0, 1 - Math.hypot(x - 22, y - 14) / 12))];
const MODES = ['replace', 'add', 'subtract', 'intersect'];
for (const old of olds) for (const mode of MODES) {
  cases.push({ op: 'rect', w: W, h: H, r: [4, 3, 21, 17], old, mode });
  cases.push({ op: 'ellipse', w: W, h: H, r: [5, 4, 33, 25], aa: true, old, mode });
  cases.push({ op: 'lasso', w: W, h: H, points: [[3.2, 2.7], [31.6, 6.1], [18.4, 27.9], [11.05, 14.5]], aa: true, old, mode });
}
cases.push({ op: 'rect', w: W, h: H, r: [-5, -5, 12, 50], old: null, mode: 'replace' });
cases.push({ op: 'ellipse', w: W, h: H, r: [-10, 8, 25, 41], aa: true, old: null, mode: 'replace' });
cases.push({ op: 'ellipse', w: W, h: H, r: [7, 7, 20, 14], aa: false, old: null, mode: 'replace' });
cases.push({ op: 'ellipse', w: W, h: H, r: [12, 3, 13, 27], aa: true, old: null, mode: 'replace' });
cases.push({ op: 'lasso', w: W, h: H, points: [[2, 2], [38, 28], [38, 2], [2, 28]], aa: true, old: null, mode: 'replace' }); // a bowtie
cases.push({ op: 'lasso', w: W, h: H, points: [[5, 5], [35, 5], [35, 25], [20, 10], [5, 25]], aa: false, old: null, mode: 'replace' });
cases.push({ op: 'lasso', w: W, h: H, points: Array.from({ length: 24 }, (_, i) => [20 + (8 + rnd() * 10) * Math.cos(i / 24 * 2 * Math.PI), 15 + (6 + rnd() * 8) * Math.sin(i / 24 * 2 * Math.PI)]), aa: true, old: null, mode: 'replace' });
cases.push({ op: 'lasso', w: W, h: H, points: [[-5, -5], [60, 3], [10, 50]], aa: true, old: null, mode: 'replace' }); // past the canvas
for (const m of [olds[1], olds[2], bytes((x, y) => (x === 20 && y === 15 ? 255 : 0)), bytes((x, y) => (x < 3 ? 255 : 0))]) for (const radius of [0.05, 0.5, 1, 2.5, 4, 4.4, 7]) cases.push({ op: 'feather', w: W, h: H, m, radius });
console.log(JSON.stringify(cases));
