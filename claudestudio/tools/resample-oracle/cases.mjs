// The cases web/paint/resample.js is checked on against PhotoCraft's Rust (run.sh): small 8-bit
// RGBA layers (noise, an opaque background, a soft blob on clear, hard edges, a layer that
// doesn't reach the canvas edge) through each filter, up, down, by much (below 1/4: the
// average-first path) and by one axis only. Seeded, so the file only changes when this does.
let s = 5; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const img = (w, h, fn) => { const px = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(...fn(x, y)); return { w, h, px }; };
const u8 = v => Math.max(0, Math.min(255, Math.round(v)));
const sources = [
  img(17, 13, () => [rnd() * 255, rnd() * 255, rnd() * 255, rnd() * 255].map(u8)), // noise, any alpha
  img(16, 16, (x, y) => [x * 16, y * 16, 128, 255].map(u8)), // opaque gradient (a Background)
  img(20, 14, (x, y) => { const d = Math.hypot(x - 9.5, y - 6.5); return [255, 64, 0, u8(255 * Math.max(0, 1 - d / 6))]; }), // soft blob on clear
  img(12, 12, (x, y) => (x >= 3 && x < 8 && y >= 2 && y < 10) ? [0, 0, 255, 255] : [0, 0, 0, 0]), // hard square, inside the canvas
  img(9, 23, (x, y) => [(x * 37 + y * 11) % 256, (x * y * 7) % 256, 200, (x + y) % 3 ? 255 : 90]), // tall, mixed alpha
];
const sizes = (w, h) => [[w * 2, h * 2], [Math.round(w * 1.37), Math.round(h * 0.61)], [Math.round(w / 2), Math.round(h / 2)], [Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 5))], [w + 3, h], [w, h - 2], [3 * w, h + 1], [1, 1]];
const cases = [];
for (const src of sources) for (const filter of ['bicubic', 'bicubicSmoother', 'bicubicSharper', 'bilinear', 'nearest']) for (const [nw, nh] of sizes(src.w, src.h)) cases.push({ ...src, nw, nh, filter });
console.log(JSON.stringify(cases));
