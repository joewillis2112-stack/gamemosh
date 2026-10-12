// What the editor draws over the scene for the selection, and the handles that
// change it (Roblox Studio's tools; ArtCraft's GizmoController and
// SelectionBridge do the same job over three.js):
// - a blue box around each selected part (a Model: around its parts' extent);
// - Move: arrows along the world axes, snapped to the move increment;
// - Rotate: rings about the world axes through the selection's centre, snapped
//   to the rotate increment;
// - Scale: a handle on each face of a single part; dragging it moves only that
//   face (the opposite face stays put), in whole move increments, as Studio's does.
// A drag changes the DataModel live and is recorded as one undoable step when it ends.
import { Vector3, Matrix, Quaternion, Color3 } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer.js';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo.js';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo.js';
import { PointerDragBehavior } from '@babylonjs/core/Behaviors/Meshes/pointerDragBehavior.js';
import '@babylonjs/core/Shaders/color.vertex.js'; // the line shader the selection boxes use (not pulled in by the builder)
import '@babylonjs/core/Shaders/color.fragment.js';
import { CF } from '../cframe.js';
import { V3, isA } from '../datamodel.js';
import { SNAP, allParts, centre } from './commands.js';

export const SELECT_COLOR = new Color3(0.05, 0.6, 1); // Studio's selection blue (ours, by eye)
const MIN_SIZE = 0.001; // Studio's smallest part size

const toMatrix = cf => Matrix.Compose(Vector3.One(), new Quaternion(...cf.toQuat()), new Vector3(cf.x, cf.y, cf.z));
function fromMatrix(m) {
  const s = new Vector3(), q = new Quaternion(), t = new Vector3();
  m.decompose(s, q, t);
  return CF.fromQuat(t.x, t.y, t.z, q.x, q.y, q.z, q.w);
}

export class Gizmos {
  constructor(scene, dm, commands, camera) {
    this.scene = scene; this.dm = dm; this.commands = commands; this.camera = camera;
    this.layer = new UtilityLayerRenderer(scene);
    this.layer.utilityLayerScene.autoClearDepthAndStencil = true;
    this.tool = 'select';
    this.pivot = new TransformNode('editorPivot', scene);
    this.pivot.rotationQuaternion = Quaternion.Identity();
    this.boxes = [];
    this.dragging = false;

    this.move = new PositionGizmo(this.layer);
    this.move.snapDistance = SNAP.move; this.move.updateGizmoRotationToMatchAttachedMesh = false; this.move.scaleRatio = 1.8; // big enough to grab (Studio's are)
    this.rotate = new RotationGizmo(this.layer);
    this.rotate.snapDistance = SNAP.rotate * Math.PI / 180; this.rotate.updateGizmoRotationToMatchAttachedMesh = false; this.rotate.scaleRatio = 1.6;
    for (const g of [this.move, this.rotate]) {
      g.attachedNode = null;
      g.onDragStartObservable.add(() => this.begin());
      g.onDragEndObservable.add(() => this.end(g === this.move ? 'Move' : 'Rotate'));
    }
    // The rotation rings' drag observables are per axis.
    for (const a of ['xGizmo', 'yGizmo', 'zGizmo']) this.rotate[a].dragBehavior.onDragObservable.add(() => this.follow());
    for (const a of ['xGizmo', 'yGizmo', 'zGizmo']) this.move[a].dragBehavior.onDragObservable.add(() => this.follow());
    for (const a of ['xPlaneGizmo', 'yPlaneGizmo', 'zPlaneGizmo']) if (this.move[a]) this.move[a].dragBehavior.onDragObservable.add(() => this.follow());

    this.handles = this.makeHandles();
    commands.selection.onChange(() => this.refresh());
    dm.watch((inst, key) => { if (!this.dragging && (key === 'CFrame' || key === 'Size' || key === 'Parent') && this.touches(inst)) this.refreshSoon(); });
  }

  setTool(t) { this.tool = t; this.refresh(); }
  touches(inst) { for (const s of this.commands.selection.items) for (let a = inst; a; a = a.parent) if (a === s) return true; return false; }
  refreshSoon() { if (!this.pending) { this.pending = true; queueMicrotask(() => { this.pending = false; this.refresh(); }); } }
  parts() { return allParts(this.commands.selection.items).filter(p => p.props.CFrame); }

  refresh() {
    for (const b of this.boxes) b.dispose();
    this.boxes = [];
    if (this.hidden) { this.move.attachedNode = this.rotate.attachedNode = null; this.placeHandles(null); return; } // Edit Mode draws its own
    const sel = this.commands.selection.items;
    for (const s of sel) {
      if (isA(s.ClassName, 'BasePart')) this.boxes.push(this.box(s.props.CFrame, s.props.Size));
      else { const ps = allParts([s]); if (ps.length) { const b = bounds(ps); this.boxes.push(this.box(new CF([b.c.x, b.c.y, b.c.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), b.size)); } }
    }
    const ps = this.parts();
    const c = ps.length ? centre(ps) : null;
    if (c) { this.pivot.position.set(c.x, c.y, c.z); this.pivot.rotationQuaternion = Quaternion.Identity(); this.pivot.computeWorldMatrix(true); }
    this.move.attachedNode = c && this.tool === 'move' ? this.pivot : null;
    this.rotate.attachedNode = c && this.tool === 'rotate' ? this.pivot : null;
    this.placeHandles(this.tool === 'scale' && ps.length === 1 && sel.length === 1 && isA(sel[0].ClassName, 'BasePart') ? sel[0] : null);
  }

  // A box outline: 12 edges of the part's oriented box, drawn over the scene. Unit
  // boxes are pooled and scaled, so each compiles its shader once (a new one per
  // frame of a drag would never finish compiling, and wouldn't show).
  box(cf, size) {
    this.pool = this.pool || [];
    let m = this.pool.find(b => !b.isEnabled());
    if (!m) {
      const P = (x, y, z) => new Vector3(x / 2, y / 2, z / 2), lines = [];
      for (const [a, b] of [[[-1, -1, -1], [1, -1, -1]], [[-1, 1, -1], [1, 1, -1]], [[-1, -1, 1], [1, -1, 1]], [[-1, 1, 1], [1, 1, 1]],
        [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[-1, -1, 1], [-1, 1, 1]], [[1, -1, 1], [1, 1, 1]],
        [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[1, 1, -1], [1, 1, 1]]]) lines.push([P(...a), P(...b)]);
      m = MeshBuilder.CreateLineSystem('selectionBox', { lines }, this.layer.utilityLayerScene);
      m.color = SELECT_COLOR; m.isPickable = false; m.rotationQuaternion = Quaternion.Identity();
      m.dispose = () => m.setEnabled(false); // back to the pool
      this.pool.push(m);
    }
    m.setEnabled(true);
    m.scaling.set(size.x + 0.04, size.y + 0.04, size.z + 0.04);
    m.position.set(cf.x, cf.y, cf.z); m.rotationQuaternion.set(...cf.toQuat());
    return m;
  }

  // Gizmo drags: the pivot moves; each selected part follows by the same rigid motion.
  begin() {
    this.dragging = true;
    this.start = this.parts().map(p => ({ inst: p, cf: p.props.CFrame }));
    this.pivot.computeWorldMatrix(true);
    this.pivotStart = this.pivot.getWorldMatrix().clone();
  }
  follow() {
    if (!this.dragging) return;
    this.pivot.computeWorldMatrix(true);
    const delta = Matrix.Invert(this.pivotStart).multiply(this.pivot.getWorldMatrix());
    for (const s of this.start) this.dm.set(s.inst, 'CFrame', fromMatrix(toMatrix(s.cf).multiply(delta)));
    for (const b of this.boxes) b.dispose();
    this.boxes = this.start.map(s => this.box(s.inst.props.CFrame, s.inst.props.Size));
  }
  end(label) {
    if (!this.dragging) return;
    this.follow();
    this.dragging = false;
    this.commands.run('commitDrag', { label, changes: this.start.map(s => ({ inst: s.inst, key: 'CFrame', before: s.cf, after: s.inst.props.CFrame })) });
    this.refresh();
  }

  // Scale handles: a ball on each face, dragged along that face's normal.
  makeHandles() {
    const us = this.layer.utilityLayerScene, mat = new StandardMaterial('handleMat', us);
    mat.emissiveColor = new Color3(0.2, 0.75, 1); mat.disableLighting = true;
    const out = [];
    for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
      const ball = MeshBuilder.CreateSphere('scaleHandle', { diameter: 0.6, segments: 8 }, us);
      ball.material = mat; ball.setEnabled(false);
      const drag = new PointerDragBehavior({ dragAxis: new Vector3(1, 0, 0) });
      drag.moveAttached = false; drag.useObjectOrientationForDragging = false;
      ball.addBehavior(drag);
      const h = { ball, axis, sign, drag, total: 0 };
      drag.onDragStartObservable.add(() => { this.dragging = true; h.total = 0; h.part = this.handlePart; h.cf = h.part.props.CFrame; h.size = h.part.props.Size; });
      drag.onDragObservable.add(e => { h.total += e.dragDistance; this.resize(h); });
      drag.onDragEndObservable.add(() => {
        this.dragging = false;
        const p = h.part;
        this.commands.run('commitDrag', { label: 'Resize', changes: [{ inst: p, key: 'Size', before: h.size, after: p.props.Size }, { inst: p, key: 'CFrame', before: h.cf, after: p.props.CFrame }] });
        this.refresh();
      });
      out.push(h);
    }
    return out;
  }
  // Move one face by a whole number of increments; the opposite face stays where it was.
  resize(h) {
    const p = h.part, size = [h.size.x, h.size.y, h.size.z];
    const grow = Math.max(MIN_SIZE - size[h.axis], Math.round(h.total / SNAP.move) * SNAP.move);
    const ns = [...size]; ns[h.axis] += grow;
    const m = h.cf.m, dir = [m[3 + h.axis], m[6 + h.axis], m[9 + h.axis]], shift = grow / 2 * h.sign;
    this.dm.set(p, 'Size', new V3(...ns));
    this.dm.set(p, 'CFrame', h.cf.withPosition(h.cf.x + dir[0] * shift, h.cf.y + dir[1] * shift, h.cf.z + dir[2] * shift));
    this.placeHandles(p, h);
    for (const b of this.boxes) b.dispose();
    this.boxes = [this.box(p.props.CFrame, p.props.Size)];
  }
  placeHandles(part, active = null) {
    this.handlePart = part;
    for (const h of this.handles) {
      h.ball.setEnabled(!!part);
      if (!part) continue;
      const cf = part.props.CFrame, m = cf.m, s = part.props.Size, half = [s.x, s.y, s.z][h.axis] / 2 + 0.6;
      const dir = new Vector3(m[3 + h.axis], m[6 + h.axis], m[9 + h.axis]).scale(h.sign);
      if (h !== active) h.ball.position.set(cf.x + dir.x * half, cf.y + dir.y * half, cf.z + dir.z * half);
      h.drag._options.dragAxis = dir; // the face's outward normal, in world space
    }
  }
}

// World-space extent of some parts.
function bounds(ps) {
  const c = centre(ps); let hi = [-Infinity, -Infinity, -Infinity];
  for (const p of ps) {
    const cf = p.props.CFrame.m, h = [p.props.Size.x / 2, p.props.Size.y / 2, p.props.Size.z / 2];
    for (let k = 0; k < 3; k++) hi[k] = Math.max(hi[k], cf[k] + Math.abs(cf[3 + k * 3]) * h[0] + Math.abs(cf[4 + k * 3]) * h[1] + Math.abs(cf[5 + k * 3]) * h[2]);
  }
  return { c, size: new V3(2 * (hi[0] - c.x), 2 * (hi[1] - c.y), 2 * (hi[2] - c.z)) };
}
