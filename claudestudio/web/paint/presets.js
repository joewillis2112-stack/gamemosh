// Brush presets: PhotoCraft's built-in presets (github.com/storytold/photocraft, MIT/Apache,
// crates/paint/src/presets.rs) that use only what web/paint/brush.js has ported (round tips,
// spacing, the Pencil, shape dynamics, transfer). Left out: those needing sampled tips, textures,
// scattering, colour dynamics, wet edges, airbrush build-up, noise, dual brush or smoothing
// (Airbrush Soft/Pressure Flow, Soft Pencil, Chalk, Charcoal, Pastel, Wax Crayon, Dry Bristle,
// Rake, the watercolours, Ink Pen, Oil Bristle, Ink Wash Sponge and all of Special Effects).
// test/paint.test.mjs checks each against PhotoCraft's own (its settings, and a stroke rendered by both).
// Fields are brush.js's (PhotoCraft's JSON, camelCase); anything unset takes PhotoCraft's default.
const BASE = { pressureSize: false, spacing: 0.25 }; // presets.rs builtin(): base
const pressure = (minimum = 0) => ({ control: 'penPressure', minimum });
const sizeDyn = size => ({ enabled: true, size });
const transfer = (opacity = {}, flow = {}) => ({ enabled: true, opacity, flow });
const P = (group, name, b) => ({ group, name, brush: { ...BASE, ...b } });

export const PRESETS = [
  P('General', 'Hard Round', { size: 30, hardness: 1 }),
  P('General', 'Soft Round', { size: 45, hardness: 0 }),
  P('General', 'Hard Round Fine', { size: 5, hardness: 1, spacing: 0.1 }),
  P('General', 'Soft Round Large', { size: 300, hardness: 0, spacing: 0.15 }),
  P('General', 'Hard Round Pressure Size', { size: 30, hardness: 1, shapeDynamics: sizeDyn(pressure()) }),
  P('General', 'Soft Round Pressure Size', { size: 45, hardness: 0, shapeDynamics: sizeDyn(pressure()) }),
  P('General', 'Hard Round Pressure Opacity', { size: 30, hardness: 1, transfer: transfer(pressure()) }),
  P('General', 'Soft Round Pressure Opacity', { size: 45, hardness: 0, transfer: transfer(pressure()) }),
  P('General', 'Hard Round Pressure Opacity and Flow', { size: 30, hardness: 0.9, transfer: transfer(pressure(), pressure(0.2)) }),
  P('General', 'Calligraphy Flat', { size: 28, hardness: 1, roundness: 0.2, angle: 45, spacing: 0.05 }),
  P('Dry Media', 'Hard Pencil', { size: 3, hardness: 1, aliased: true, spacing: 0.1 }),
  P('Wet Media', 'Gouache Flat', { size: 40, hardness: 0.9, roundness: 0.35, spacing: 0.05, shapeDynamics: { enabled: true, angle: { control: 'direction' } }, transfer: transfer({}, { control: 'fade', fadeSteps: 600, minimum: 0.35 }) }),
];
/** The brush fields a preset sets on the tool (everything a preset can change; colour and eraser stay). */
export const PRESET_FIELDS = ['size', 'hardness', 'spacing', 'opacity', 'flow', 'roundness', 'angle', 'aliased', 'pressureSize', 'shapeDynamics', 'transfer'];
/** The tool settings for preset `p` on top of `current` (colour and eraser kept; unset fields at PhotoCraft's defaults). */
export function applyPreset(current, p) {
  const out = { ...current, size: 20, hardness: 1, spacing: 0.1, opacity: 1, flow: 1, roundness: 1, angle: 0, aliased: false, pressureSize: false, shapeDynamics: undefined, transfer: undefined };
  for (const k of PRESET_FIELDS) if (p.brush[k] !== undefined) out[k] = structuredClone(p.brush[k]);
  out.preset = p.name;
  return out;
}
