// Edit Mode: Blender's Tab mode for meshes, in the studio's editor. The mesh
// is the modeling kernel's (web/modeling/, 3DOO's rebuild of Blender's BMesh);
// every change is an undoable studio command through web/modeling/editable.js.
// - Tab with a Part or MeshPart selected enters (a Part becomes a MeshPart
//   first), Tab again leaves.
// - 1/2/3: vertex, edge or face select. A click picks the nearest one (Shift
//   adds or removes); A selects all, Alt+A none. Vertices and edges are drawn
//   over the mesh, selected ones in orange.
// - E extrude, I inset, Ctrl+B bevel, Ctrl+R loop cut, X or Delete delete,
//   M merge, F fill, plus the toolbar's Subdivide. After each, the "last
//   operation" panel adjusts its amounts (the step is undone and redone).
// - G/R/S move, rotate and scale the selection with the mouse (X/Y/Z
//   constrain, numbers type an amount, Enter/click confirm, Esc cancels). The
//   move arrows also work, by touch too.
import { Vector3, Matrix, Quaternion, Color3, Color4, Plane } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo.js';
import { V3, isA } from '../datamodel.js';
import { loadMesh, saveMesh, extent, writeMesh, runMeshOperator, meshFromPart } from '../modeling/editable.js';

const ORANGE = new Color4(1, 0.55, 0.1, 1), DARK = new Color4(0.05, 0.05, 0.05, 1), PICK_PX = 14;
// Each operation's adjustable amounts and defaults (the kernel's parameter names).
export const MESH_OPS = {
  extrude: { key: 'KeyE', params: { offset: 1 }, need: 'faces or edges' },
  inset: { key: 'KeyI', params: { thickness: 0.2, depth: 0 }, need: 'faces' },
  bevel: { key: 'KeyB', ctrl: true, params: { width: 0.2, segments: 1 }, need: 'edges' },
  loopCut: { key: 'KeyR', ctrl: true, params: { cuts: 1 }, need: 'an edge' },
  subdivide: { params: { cuts: 1 }, need: 'faces or edges' },
  merge: { key: 'KeyM', params: {}, need: 'two vertices' },
  fill: { key: 'KeyF', params: {}, need: 'a boundary loop' },
  delete: { key: 'KeyX', params: {}, need: 'a selection' },
};
const DELETE_MODE = { vertex: 'verts', edge: 'edges', face: 'faces' };

export class EditMode {
  constructor({ scene, dm, commands, camera, world, layer, canvas, onState = () => {} }) {
    Object.assign(this, { scene, dm, commands, camera, world, layer, canvas, onState });
    this.part = null; this.mesh = null; this.mode = 'face'; this.last = null; this.modal = null;
    this.root = new TransformNode('editRoot', layer.utilityLayerScene);
    this.root.rotationQuaternion = Quaternion.Identity();
    const us = layer.utilityLayerScene;
    this.faceMat = new StandardMaterial('editFaces', us); this.faceMat.emissiveColor = new Color3(1, 0.55, 0.1); this.faceMat.disableLighting = true; this.faceMat.alpha = 0.3; this.faceMat.backFaceCulling = false;
    this.pointMat = new StandardMaterial('editPoints', us); this.pointMat.emissiveColor = Color3.White(); this.pointMat.disableLighting = true; this.pointMat.pointsCloud = true; this.pointMat.pointSize = 7;
    // Move arrows on the selection's median (desktop and touch).
    this.pivot = new TransformNode('editPivot', scene); this.pivot.rotationQuaternion = Quaternion.Identity();
    this.arrows = new PositionGizmo(layer); this.arrows.updateGizmoRotationToMatchAttachedMesh = false; this.arrows.scaleRatio = 1.4;
    this.arrows.onDragStartObservable.add(() => this.beginDrag());
    for (const a of ['xGizmo', 'yGizmo', 'zGizmo']) this.arrows[a].dragBehavior.onDragObservable.add(() => this.followArrows());
    for (const a of ['xPlaneGizmo', 'yPlaneGizmo', 'zPlaneGizmo']) if (this.arrows[a]) this.arrows[a].dragBehavior.onDragObservable.add(() => this.followArrows());
    this.arrows.onDragEndObservable.add(() => this.endDrag('Move vertices'));
    // Undo/redo (or anything else) changing the part's mesh: reload it, selection and all.
    dm.watch((inst, key) => { if (inst === this.part && key === 'MeshData' && !this.dragging && inst.props.MeshData !== this.written) this.reload(); if (inst === this.part && key === 'Parent' && !inst.parent) this.exit(); });
    this.attachInput();
  }
  get active() { return !!this.part; }

  // ---- entering and leaving
  enter(target = this.commands.selection.primary) {
    if (!target || !isA(target.ClassName, 'BasePart')) return false;
    let part = target;
    if (part.ClassName !== 'MeshPart' || !part.props.MeshData) {
      if (part.ClassName === 'MeshPart') return false; // a file's mesh (MeshId) isn't editable here
      part = this.commands.history.run('Edit mesh', tx => meshFromPart(tx, this.dm, target));
      this.commands.selection.set([part]);
    }
    this.part = part; this.reload();
    this.state();
    return true;
  }
  exit() {
    if (!this.part) return;
    if (this.modal) this.cancelModal();
    this.part = null; this.mesh = null; this.last = null;
    this.clearOverlay(); this.arrows.attachedNode = null;
    this.state();
  }
  reload() { this.mesh = loadMesh(this.part.props.MeshData); this.written = this.part.props.MeshData; this.refresh(); }
  setMode(m) { if (!this.mesh) return; this.mode = m; this.mesh.flushSelection(m); this.refresh(); this.state(); }
  state() { this.onState({ active: this.active, mode: this.mode, last: this.last, stats: this.mesh ? this.mesh.stats() : null }); }

  // ---- the part's space: mesh coordinates -> world
  space() {
    const P = this.part.props, ex = extent(this.mesh), ms = P.MeshSize && P.MeshSize.x > 0 ? P.MeshSize : new V3(...ex.size);
    const k = new Vector3(P.Size.x / ms.x, P.Size.y / ms.y, P.Size.z / ms.z), q = new Quaternion(...P.CFrame.toQuat()), c = new Vector3(...ex.centre);
    const pos = new Vector3(P.CFrame.x, P.CFrame.y, P.CFrame.z).subtract(c.multiply(k).applyRotationQuaternion(q));
    return { k, q, pos, matrix: Matrix.Compose(k, q, pos) };
  }
  toWorld(co) { return Vector3.TransformCoordinates(new Vector3(co.x, co.y, co.z), this.space().matrix); }
  // A world-space offset into the mesh's own space.
  toLocalOffset(d) { const s = this.space(), inv = Quaternion.Inverse(s.q); const l = d.applyRotationQuaternion(inv); return { x: l.x / s.k.x, y: l.y / s.k.y, z: l.z / s.k.z }; }

  // ---- the overlay: edges, vertices, selected faces
  clearOverlay() { for (const m of this.overlay || []) m.dispose(); this.overlay = []; }
  refresh() {
    this.clearOverlay();
    if (!this.mesh) return;
    const s = this.space();
    this.root.position.copyFrom(s.pos); this.root.rotationQuaternion.copyFrom(s.q); this.root.scaling.copyFrom(s.k);
    const us = this.layer.utilityLayerScene, P = v => new Vector3(v.co.x, v.co.y, v.co.z);
    const lines = [], colors = [];
    for (const e of this.mesh.edges.values()) { lines.push([P(e.v0), P(e.v1)]); const c = e.selected ? ORANGE : DARK; colors.push([c, c]); }
    if (lines.length) { const l = MeshBuilder.CreateLineSystem('editEdges', { lines, colors, useVertexAlpha: false }, us); l.parent = this.root; l.isPickable = false; this.overlay.push(l); }
    if (this.mode === 'vertex') {
      const pts = new Mesh('editVerts', us), pos = [], col = [], idx = [];
      let i = 0;
      for (const v of this.mesh.verts.values()) { pos.push(v.co.x, v.co.y, v.co.z); const c = v.selected ? ORANGE : DARK; col.push(c.r, c.g, c.b, 1); idx.push(i++); }
      const vd = new VertexData(); vd.positions = pos; vd.colors = col; vd.indices = idx; vd.applyToMesh(pts);
      pts.material = this.pointMat; pts.parent = this.root; pts.isPickable = false; this.overlay.push(pts);
    }
    const sel = this.mesh.selectedFaces();
    if (sel.length) {
      const fm = new Mesh('editFaces', us), pos = [], idx = [];
      for (const f of sel) { const pts = this.mesh.facePoints(f), b = pos.length / 3; for (const p of pts) pos.push(p.x, p.y, p.z); for (let j = 1; j + 1 < pts.length; j++) idx.push(b, b + j, b + j + 1); }
      const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(fm);
      fm.material = this.faceMat; fm.parent = this.root; fm.isPickable = false; this.overlay.push(fm);
    }
    // The move arrows sit on the selection's median.
    const verts = this.mesh.selectedVerts();
    if (verts.length && !this.dragging) {
      const m = verts.reduce((a, v) => a.addInPlace(P(v)), Vector3.Zero()).scale(1 / verts.length);
      this.pivot.position.copyFrom(Vector3.TransformCoordinates(m, s.matrix)); this.pivot.rotationQuaternion = Quaternion.Identity(); this.pivot.computeWorldMatrix(true);
      this.arrows.attachedNode = this.pivot;
    } else if (!this.dragging) this.arrows.attachedNode = null;
  }

  // ---- picking (CSS px in the canvas)
  screen(p) { const c = this.canvas, s = this.camera.scale(), q = Vector3.Project(p, Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.cam.viewport.toGlobal(c.width, c.height)); return [q.x / s, q.y / s, q.z]; }
  pickAt(x, y) {
    if (this.mode === 'face') {
      const e = this.world.parts.get(this.part), r = e && e.meshPart && e.meshPart.render[0];
      if (!r) return null;
      const h = this.scene.pick(x, y, m => m === r, false, this.camera.cam);
      return h && h.hit ? this.mesh.faces.get(e.meshPart.faceIds[h.faceId]) || null : null;
    }
    let best = null, bd = PICK_PX;
    if (this.mode === 'vertex') {
      for (const v of this.mesh.verts.values()) { const [sx, sy, z] = this.screen(this.toWorld(v.co)); const d = Math.hypot(sx - x, sy - y); if (z > 0 && z < 1 && d < bd) { bd = d; best = v; } }
    } else {
      for (const e of this.mesh.edges.values()) {
        const a = this.screen(this.toWorld(e.v0.co)), b = this.screen(this.toWorld(e.v1.co)), dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
        const t = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0, d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best;
  }
  click(x, y, add = false) {
    const hit = this.pickAt(x, y), m = this.mesh;
    if (!add) m.deselectAll();
    if (hit) {
      if (this.mode === 'vertex') { if (add && hit.selected) hit.selected = false; else m.selectVert(hit); }
      else if (this.mode === 'edge') { const on = !(add && hit.selected); hit.selected = on; }
      else { const on = !(add && hit.selected); hit.selected = on; }
    }
    m.flushSelection(this.mode);
    this.refresh(); this.state();
    return hit;
  }
  selectAll(on = true) { on ? this.mesh.selectAll() : this.mesh.deselectAll(); this.mesh.flushSelection(this.mode); this.refresh(); this.state(); }

  // ---- operations: one undoable step each, adjustable afterwards
  op(name, params = {}) {
    if (!this.mesh) return null;
    const spec = MESH_OPS[name] || { params: {} }, p = { ...spec.params, ...params };
    if (name === 'delete') p.mode = DELETE_MODE[this.mode];
    const pre = saveMesh(this.mesh);
    const r = runMeshOperator(this.commands.history, this.part, name, p, { selectMode: this.mode, live: this.mesh });
    this.last = r.refused ? null : { name, params: p, pre, status: r.status };
    this.reload(); this.state();
    return r;
  }
  // The last operation again with new amounts: its step undone, then rerun from the same selection.
  adjust(params) {
    if (!this.last) return null;
    const { name, pre } = this.last;
    this.commands.history.undo();
    this.mesh = loadMesh(pre);
    return this.op(name, { ...this.last.params, ...params });
  }

  // ---- moving the selection (arrows and G/R/S): live preview, one step at the end
  beginDrag() {
    this.dragging = true;
    this.dragStart = { mesh: saveMesh(this.mesh), props: { MeshData: this.part.props.MeshData, MeshSize: this.part.props.MeshSize, Size: this.part.props.Size, CFrame: this.part.props.CFrame } };
    this.pivot.computeWorldMatrix(true); this.pivotStart = this.pivot.position.clone();
    this.dragSpace = this.space();
  }
  // Show the mesh as it would be (no history yet).
  preview(mesh) { const live = { set: (i, k, v) => this.dm.set(i, k, v) }; writeMesh(live, this.part, mesh, loadMesh(this.dragStart.mesh)); this.written = this.part.props.MeshData; this.mesh = mesh; this.refreshOverlayOnly(); }
  refreshOverlayOnly() { const d = this.dragging; this.dragging = true; this.refresh(); this.dragging = d; }
  followArrows() {
    if (!this.dragging) return;
    const d = this.pivot.position.subtract(this.pivotStart), s = this.dragSpace, inv = Quaternion.Inverse(s.q), l = d.applyRotationQuaternion(inv);
    const mesh = loadMesh(this.dragStart.mesh);
    for (const v of mesh.selectedVerts()) v.co = { x: v.co.x + l.x / s.k.x, y: v.co.y + l.y / s.k.y, z: v.co.z + l.z / s.k.z };
    mesh.computeNormals();
    this.preview(mesh);
  }
  endDrag(label) {
    if (!this.dragging) return;
    const final = this.mesh, start = this.dragStart;
    this.dragging = false;
    // Back to where the drag began, then the whole change as one step.
    for (const [k, v] of Object.entries(start.props)) this.dm.set(this.part, k, v);
    if (saveMesh(final) !== start.mesh) this.commands.history.run(label, tx => writeMesh(tx, this.part, final, loadMesh(start.mesh)));
    this.last = null;
    this.reload(); this.state();
  }

  // G/R/S on the selection, Blender's modal way.
  startModal(kind) {
    if (!this.mesh || !this.mesh.selectedVerts().length) return false;
    this.beginDrag();
    const verts = this.mesh.selectedVerts(), med = verts.reduce((a, v) => a.addInPlace(new Vector3(v.co.x, v.co.y, v.co.z)), Vector3.Zero()).scale(1 / verts.length);
    this.modal = { kind, axis: null, typed: '', m0: [...(this.mouse || [0, 0])], centre: this.toWorld(med), med };
    this.modal.p0 = this.planePoint(this.modal.m0);
    this.updateModal();
    return true;
  }
  planePoint([x, y]) {
    const r = this.camera.ray(x, y), n = this.camera.forward().scale(-1), pl = Plane.FromPositionAndNormal(this.modal.centre, n);
    const t = -(Vector3.Dot(pl.normal, r.origin) + pl.d) / Vector3.Dot(pl.normal, r.dir);
    return isFinite(t) && t > 0 ? r.origin.add(r.dir.scale(t)) : this.modal.centre.clone();
  }
  updateModal() {
    const M = this.modal, mesh = loadMesh(this.dragStart.mesh), sel = mesh.selectedVerts(), typed = M.typed ? parseFloat(M.typed) : null;
    const AX = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
    if (M.kind === 'grab') {
      let d = typed !== null && isFinite(typed) ? AX[M.axis || 'x'].scale(typed) : this.planePoint(this.mouse || M.m0).subtract(M.p0);
      if (M.axis && !(typed !== null)) d = AX[M.axis].scale(Vector3.Dot(d, AX[M.axis]));
      const l = this.toLocalOffsetFrom(d);
      for (const v of sel) v.co = { x: v.co.x + l.x, y: v.co.y + l.y, z: v.co.z + l.z };
    } else {
      const cs = this.screen(M.centre), m = this.mouse || M.m0;
      if (M.kind === 'rotate') {
        let deg = typed !== null && isFinite(typed) ? typed : -(Math.atan2(m[1] - cs[1], m[0] - cs[0]) - Math.atan2(M.m0[1] - cs[1], M.m0[0] - cs[0])) * 180 / Math.PI;
        let axis = M.axis ? AX[M.axis] : this.camera.forward().scale(-1);
        if (M.axis && Vector3.Dot(axis, this.camera.forward()) > 0) axis = axis.scale(-1);
        const s = this.dragSpace, la = axis.applyRotationQuaternion(Quaternion.Inverse(s.q)).normalize(), q = Quaternion.RotationAxis(la, deg * Math.PI / 180);
        for (const v of sel) { const o = new Vector3(v.co.x - M.med.x, v.co.y - M.med.y, v.co.z - M.med.z).applyRotationQuaternion(q); v.co = { x: M.med.x + o.x, y: M.med.y + o.y, z: M.med.z + o.z }; }
      } else {
        const f = typed !== null && isFinite(typed) ? typed : Math.hypot(m[0] - cs[0], m[1] - cs[1]) / (Math.hypot(M.m0[0] - cs[0], M.m0[1] - cs[1]) || 1);
        const s = this.dragSpace, la = M.axis ? AX[M.axis].applyRotationQuaternion(Quaternion.Inverse(s.q)) : null;
        for (const v of sel) {
          const o = new Vector3(v.co.x - M.med.x, v.co.y - M.med.y, v.co.z - M.med.z);
          const n = la ? o.add(la.scale(Vector3.Dot(o, la) * (f - 1))) : o.scale(f);
          v.co = { x: M.med.x + n.x, y: M.med.y + n.y, z: M.med.z + n.z };
        }
      }
    }
    mesh.computeNormals();
    this.preview(mesh);
    this.onState({ active: true, mode: this.mode, hint: `${{ grab: 'Grab', rotate: 'Rotate', scale: 'Scale' }[M.kind]}${M.axis ? ' along ' + M.axis.toUpperCase() : ''}${M.typed ? ': ' + M.typed : ''}` });
  }
  toLocalOffsetFrom(d) { const s = this.dragSpace, l = d.applyRotationQuaternion(Quaternion.Inverse(s.q)); return { x: l.x / s.k.x, y: l.y / s.k.y, z: l.z / s.k.z }; }
  confirmModal() { const k = this.modal.kind; this.modal = null; this.endDrag({ grab: 'Move vertices', rotate: 'Rotate vertices', scale: 'Scale vertices' }[k]); }
  cancelModal() {
    const start = this.dragStart; this.modal = null; this.dragging = false;
    for (const [k, v] of Object.entries(start.props)) this.dm.set(this.part, k, v);
    this.reload(); this.state();
  }

  attachInput() {
    const c = this.canvas;
    c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(); this.mouse = [e.clientX - r.left, e.clientY - r.top]; if (this.modal) this.updateModal(); });
    c.addEventListener('pointerdown', e => { if (!this.modal) return; e.stopImmediatePropagation(); e.button === 2 ? this.cancelModal() : this.confirmModal(); this.swallowUp = true; }, true);
    c.addEventListener('pointerup', e => { if (this.swallowUp) { this.swallowUp = false; e.stopImmediatePropagation(); } }, true);
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.active ? this.exit() : this.enter(); return; }
      if (!this.active || e.metaKey || this.camera.flying()) return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (this.modal) {
        stop();
        if (e.code === 'Escape') return this.cancelModal();
        if (e.code === 'Enter' || e.code === 'NumpadEnter') return this.confirmModal();
        const a = { KeyX: 'x', KeyY: 'y', KeyZ: 'z' }[e.code];
        if (a) { this.modal.axis = this.modal.axis === a ? null : a; return this.updateModal(); }
        if (/^[0-9.\-]$/.test(e.key)) { this.modal.typed += e.key; return this.updateModal(); }
        if (e.code === 'Backspace') { this.modal.typed = this.modal.typed.slice(0, -1); return this.updateModal(); }
        return;
      }
      if (e.ctrlKey && (e.code === 'KeyZ' || e.code === 'KeyY')) return; // undo/redo: the editor's, then the mesh reloads
      const modeKey = { Digit1: 'vertex', Digit2: 'edge', Digit3: 'face' }[e.code];
      if (modeKey && !e.ctrlKey) { stop(); return this.setMode(modeKey); }
      if (e.code === 'KeyA' && !e.ctrlKey) { stop(); return this.selectAll(!e.altKey); }
      if (!e.ctrlKey && !e.altKey && { KeyG: 'grab', KeyR: 'rotate', KeyS: 'scale' }[e.code]) { stop(); return this.startModal({ KeyG: 'grab', KeyR: 'rotate', KeyS: 'scale' }[e.code]); }
      if (e.code === 'Delete') { stop(); return this.op('delete'); }
      for (const [name, spec] of Object.entries(MESH_OPS)) if (spec.key === e.code && !!spec.ctrl === e.ctrlKey && !e.altKey) { stop(); return this.op(name); }
    }, true);
  }
}
