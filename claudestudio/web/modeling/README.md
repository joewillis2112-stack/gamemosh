# Modeling: the studio's polygon editing kernel

`kernel/` is the mesh kernel of [3DOO](https://github.com/renatolinsdigital/3doo)
(MIT, `LICENSE-3doo`), vendored unchanged at commit
`08452789cb467f72d6a2739abb729183317a3a36`, and `meshBuffers.ts` its
`src/bridge/meshBuffers.ts` (import path changed only). 3DOO is a browser
rebuild of Blender's polygon modelling: a BMesh-style half-edge mesh (n-gons
kept), and Blender's edit operations (extrude, inset, bevel, loop cut, knife,
subdivide, merge, dissolve, bridge, fill, booleans, modifiers, remesh, ...).
Its own 518 tests run here: `npx vitest run web/modeling/kernel`.

The studio's side is `editable.js` (MeshPart.MeshData <-> the kernel, the
render arrays, every operator as an undoable studio command) and the editor's
edit mode (`web/editor/editmode.js`). To update the kernel, copy a newer
`src/kernel` over this one, rerun its tests and the studio's.
