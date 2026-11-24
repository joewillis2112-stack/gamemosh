// Generated R15 bodies (web/runtime/bodygen.js) as files: for each preset (or a JSON of parameters),
// assets/characters/r15/<name>.{json,glb}: the parts, rest pose and joints, and a .glb with a node per
// part (named as the part, parented as the joints), turned to face +Z as glTF characters do.
//   node tools/body.mjs                  every preset
//   node tools/body.mjs <name> '<json>'  one body from parameters (over the studio preset)
import fs from 'node:fs';
import path from 'node:path';
import { makeBody, partMesh, BODY_PRESETS, R15_PARTS, R15_JOINTS } from '../web/runtime/bodygen.js';
import { writeGlb } from './glbwrite.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets/characters/r15');
fs.mkdirSync(OUT, { recursive: true });
const flat = c => c.m.map(x => +x.toFixed(6));

export function writeBody(name, params) {
  const b = makeBody(params), index = new Map(R15_PARTS.map((n, i) => [n, i]));
  const nodes = R15_PARTS.map(n => {
    const j = R15_JOINTS.find(j => j[2] === n), local = j ? b.parts[j[1]].rest.inverse().mul(b.parts[n].rest) : b.parts[n].rest;
    const [x, y, z, w] = local.toQuat();
    return {
      name: n, translation: j ? [local.x, local.y, local.z] : [0, b.hrpHeight, 0], rotation: j ? [x, y, z, w] : [0, 1, 0, 0], // the root turned to face +Z
      children: R15_JOINTS.filter(k => k[1] === n).map(k => index.get(k[2])),
      // What the runtime needs to drive it (runtime/character.js): the part's size, and its joint to its
      // parent with Roblox's C0 and C1 (so a pose turns it about the joint: C0 * Transform * C1:Inverse()).
      extras: { r15: { part: n, size: b.parts[n].size, ...(j ? { joint: j[0], c0: flat(b.joints.find(x => x.part1 === n).c0), c1: flat(b.joints.find(x => x.part1 === n).c1) } : {}) } },
      mesh: b.parts[n].shape ? partMesh(b.parts[n].size, { ...b.parts[n].shape, segments: b.params.segments }) : null,
    };
  });
  writeGlb(path.join(OUT, name + '.glb'), nodes, [index.get('HumanoidRootPart')]);
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({
    generated: 'tools/body.mjs', params: b.params, hrpHeight: +b.hrpHeight.toFixed(4), height: +b.height.toFixed(4),
    parts: Object.fromEntries(R15_PARTS.map(n => [n, { size: b.parts[n].size.map(v => +v.toFixed(4)), rest: flat(b.parts[n].rest), attachments: Object.fromEntries(Object.entries(b.parts[n].attachments || {}).map(([k, v]) => [k, flat(v)])) }])),
    joints: b.joints.map(j => ({ name: j.name, part0: j.part0, part1: j.part1, c0: flat(j.c0), c1: flat(j.c1) })),
  }, null, 1));
  return b;
}

if (process.argv[1] && process.argv[1].endsWith('body.mjs')) {
  const [name, json] = process.argv.slice(2);
  const todo = name ? [[name, json ? JSON.parse(json) : BODY_PRESETS[name] || {}]] : Object.entries(BODY_PRESETS);
  for (const [n, p] of todo) { const b = writeBody(n, p); console.log(`${n}: ${b.height.toFixed(2)} studs tall, the root ${b.hrpHeight.toFixed(2)} above the soles`); }
}
