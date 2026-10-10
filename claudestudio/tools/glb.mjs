// Node wrapper for web/runtime/glb.js.
import fs from 'node:fs';
import { parseGlb } from '../web/runtime/glb.js';
export const readGlb = file => parseGlb(fs.readFileSync(file));
