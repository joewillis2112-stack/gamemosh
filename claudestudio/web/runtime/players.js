// Players, characters and humanoids, the way Roblox scripts expect them:
// the place's scripts run, then a Player joins (PlayerAdded), then its
// character spawns as a Model in Workspace with a Humanoid and a
// HumanoidRootPart (CharacterAdded). Every frame the root part follows the
// controller, Touched/TouchEnded fire for parts the body overlaps, and the
// Humanoid's properties drive the controller. Health 0 fires Died, plays the
// death clip, and the player respawns after Players.RespawnTime.
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { V3, Instance } from '../datamodel.js';

const DEG = Math.PI / 180;
const FALLEN_PARTS_DESTROY_HEIGHT = -500; // Workspace.FallenPartsDestroyHeight default

export class Players {
  constructor(dm, world, character, gravity) {
    this.dm = dm;
    this.world = world;
    this.char = character; // one visual + controller, reused across respawns
    this.gravity = gravity;
    this.service = dm.service('Players');
    this.touching = new Set(); // parts the body overlaps now
    this.respawnAt = null;
    dm.hooks.loadCharacter = player => this.spawn(player);
    dm.watch((inst, key) => this.changed(inst, key));
  }

  // The local player joins (after the place's scripts, so PlayerAdded handlers see it).
  join(name = 'Player1') {
    const p = new Instance(this.dm, 'Player'); // not creatable from scripts
    p.props.Name = name; p.props.DisplayName = name;
    this.player = p;
    this.dm.setParent(p, this.service);
    this.service.props.LocalPlayer = p;
    this.dm.fire(this.service, 'PlayerAdded', [p]);
    // The character loads a frame later, as in Roblox, so PlayerAdded handlers
    // have run (and connected CharacterAdded) before it arrives.
    this.pendingSpawn = this.service.props.CharacterAutoLoads;
    this.char.setVisible(false);
    return p;
  }

  spawnPoint(player) {
    const loc = player.props.RespawnLocation;
    const valid = s => s && !s.destroyed && s.ClassName === 'SpawnLocation' && this.world.inWorkspace(s);
    let s = valid(loc) ? loc : null;
    if (!s) { const all = []; const walk = i => i.children.forEach(c => { if (c.ClassName === 'SpawnLocation') all.push(c); walk(c); }); walk(this.dm.workspace); s = all[0] || null; }
    if (!s) return { foot: new Vector3(0, 0, 0), yaw: 0 };
    const P = s.props.Position, S = s.props.Size;
    // Roblox faces -Z at Orientation 0; the character's yaw 0 faces +Z.
    return { foot: new Vector3(P.x, P.y + S.y / 2, P.z), yaw: (s.props.Orientation.y || 0) * DEG + Math.PI };
  }

  spawn(player) {
    const old = player.props.Character;
    if (old && !old.destroyed) { this.dm.fire(player, 'CharacterRemoving', [old]); this.dm.destroy(old); }
    const model = this.dm.create('Model');
    model.props.Name = player.props.Name;
    model.isCharacter = true; // World leaves it alone: the controller moves it
    const hum = this.dm.create('Humanoid');
    const root = this.dm.create('Part');
    root.props.Name = 'HumanoidRootPart';
    root.props.Size = new V3(2, 2, 1);
    root.props.Transparency = 1;
    root.props.CanCollide = false;
    root.isCharacter = true;
    this.dm.setParent(hum, model);
    this.dm.setParent(root, model);
    model.props.PrimaryPart = root;
    this.model = model; this.humanoid = hum; this.root = root;
    this.dead = false; this.respawnAt = null;
    this.touching.clear();
    const { foot, yaw } = this.spawnPoint(player);
    this.char.respawn(foot, yaw);
    this.char.setVisible(true);
    this.syncRoot();
    this.dm.setParent(model, this.dm.workspace);
    player.props.Character = model;
    this.onSpawn && this.onSpawn(model);
    this.dm.fire(player, 'CharacterAdded', [model]);
  }

  changed(inst, key) {
    // A script moving the root part teleports the character (obby teleporters).
    if (inst === this.root && key === 'Position' && !this.dead) {
      const P = inst.props.Position;
      this.char.teleport(new Vector3(P.x, P.y - 3, P.z));
      return;
    }
    if (inst !== this.humanoid) return;
    if (key === 'Health') {
      this.dm.fire(inst, 'HealthChanged', [inst.props.Health]);
      if (inst.props.Health <= 0 && !this.dead) this.die();
    }
  }

  die() {
    this.dead = true;
    this.char.dead = true;
    this.clearFall();
    this.dm.fire(this.humanoid, 'Died', []);
    this.respawnAt = this.time + this.service.props.RespawnTime;
  }

  // Where the body will lie: the death clip's footprint (measured from the
  // clip) must not cut into a part. Try the current facing, then turned, then
  // slid back a little; the floor itself is excluded (the box starts 0.2 up).
  clearFall() {
    const c = this.char, box = c.deadBox;
    if (!box) return;
    const f = c.holder.position.clone();
    const free = (yaw, shift) => {
      const ax = yawAxes(yaw), back = [-ax[2][0] * shift, 0, -ax[2][2] * shift];
      const lo = Math.max(box.min.y, 0.2), hi = Math.max(box.max.y, lo + 0.1);
      const local = [(box.min.x + box.max.x) / 2, (lo + hi) / 2, (box.min.z + box.max.z) / 2];
      const cx = f.x + back[0] + ax[0][0] * local[0] + ax[2][0] * local[2], cz = f.z + back[2] + ax[0][2] * local[0] + ax[2][2] * local[2];
      const body = { c: [cx, f.y + local[1], cz], h: [(box.max.x - box.min.x) / 2, (hi - lo) / 2, (box.max.z - box.min.z) / 2], axes: ax };
      for (const [inst, e] of this.world.parts) {
        if (inst.isCharacter || !inst.props.CanCollide) continue;
        const P = inst.props;
        const hit = P.Shape === 'Ball' ? sphereBox([P.Position.x, P.Position.y, P.Position.z], P.Size.x / 2, body)
          : boxBox(body, { c: [P.Position.x, P.Position.y, P.Position.z], h: [P.Size.x / 2, P.Size.y / 2, P.Size.z / 2], axes: rotAxes(e.mesh.rotationQuaternion) });
        if (hit) return false;
      }
      return true;
    };
    for (const shift of [0, 0.5, 1, 1.5, 2]) for (const turn of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
      if (!free(c.yaw + turn, shift)) continue;
      const ax = yawAxes(c.yaw + turn);
      c.yaw += turn;
      if (shift) c.teleport(new Vector3(f.x - ax[2][0] * shift, f.y, f.z - ax[2][2] * shift));
      c.dead = true;
      return;
    }
  }

  // The Humanoid's properties drive the controller each frame.
  applyHumanoid() {
    const h = this.humanoid.props, p = this.char.p;
    p.WalkSpeed = h.WalkSpeed;
    p.JumpPower = h.UseJumpPower ? h.JumpPower : Math.sqrt(2 * this.gravity * Math.max(0, h.JumpHeight));
    p.AutoJumpEnabled = h.AutoJumpEnabled && (this.player ? this.player.props.AutoJumpEnabled : true);
    p.MaxSlopeAngle = Math.min(89, Math.max(0, h.MaxSlopeAngle));
  }

  // Before the character steps: input-side state (a script setting Humanoid.Jump).
  preStep() {
    if (!this.humanoid) return false;
    this.applyHumanoid();
    const j = this.humanoid.props.Jump;
    if (j) this.humanoid.props.Jump = false; // Roblox clears it once the jump is taken
    return j;
  }

  // After the character steps: root part, events, touches, death and respawn.
  postStep(t) {
    this.time = t;
    if (this.pendingSpawn) { this.pendingSpawn = false; this.spawn(this.player); return; }
    if (!this.humanoid) return;
    const c = this.char;
    this.syncRoot();
    const md = c.moveDir;
    this.humanoid.props.MoveDirection = new V3(md.x, 0, md.z);
    this.humanoid.props.FloorMaterial = c.grounded && c.floorPart ? c.floorPart.props.Material : 'Air';
    if (c.state !== this.lastState) {
      if (c.state === 'jump' && c.vy > 0 && this.lastState !== 'jump') this.dm.fire(this.humanoid, 'Jumping', [true]);
      if (c.state === 'fall') this.dm.fire(this.humanoid, 'FreeFalling', [true]);
      if (c.state === 'walk' || c.state === 'idle') this.dm.fire(this.humanoid, 'Running', [c.state === 'walk' ? Math.hypot(c.velocity.x, c.velocity.z) : 0]);
      this.lastState = c.state;
    }
    if (!this.dead) this.touches();
    if (!this.dead && c.footY < FALLEN_PARTS_DESTROY_HEIGHT) this.dm.set(this.humanoid, 'Health', 0);
    if (this.dead && this.respawnAt !== null && t >= this.respawnAt && this.service.props.CharacterAutoLoads) this.spawn(this.player);
  }

  syncRoot() {
    // Physics-driven, like Roblox: written straight to the props (no Changed per frame).
    const f = this.char.holder.position;
    this.root.props.Position = new V3(f.x, f.y + 3, f.z);
    let oy = this.char.yaw / DEG - 180; // Roblox: 0 = facing -Z
    oy = ((oy + 180) % 360 + 360) % 360 - 180;
    this.root.props.Orientation = new V3(0, oy, 0);
  }

  // Touched / TouchEnded: the body's box (yaw-aligned, 2 x 5 x 1.2 studs,
  // reaching 0.05 below the soles so standing on a part touches it) against
  // every part's box (balls as spheres). Exact separating-axis tests.
  touches() {
    const c = this.char, f = c.holder.position;
    const body = { c: [f.x, f.y + 2.5 - 0.025, f.z], h: [1, 2.525, 0.6], axes: yawAxes(c.yaw) };
    const now = new Set();
    for (const [inst, e] of this.world.parts) {
      if (inst.isCharacter || inst.props.CanTouch === false) continue;
      const P = inst.props;
      const hit = P.Shape === 'Ball'
        ? sphereBox([P.Position.x, P.Position.y, P.Position.z], P.Size.x / 2, body)
        : boxBox(body, { c: [P.Position.x, P.Position.y, P.Position.z], h: [P.Size.x / 2, P.Size.y / 2, P.Size.z / 2], axes: rotAxes(e.mesh.rotationQuaternion) });
      if (hit) now.add(inst);
    }
    for (const part of now) if (!this.touching.has(part)) {
      this.dm.fire(part, 'Touched', [this.root]);
      this.dm.fire(this.root, 'Touched', [part]);
      this.dm.fire(this.humanoid, 'Touched', [part, this.root]);
    }
    for (const part of this.touching) if (!now.has(part) && !part.destroyed) {
      this.dm.fire(part, 'TouchEnded', [this.root]);
      this.dm.fire(this.root, 'TouchEnded', [part]);
    }
    this.touching = now;
  }
}

// ------------------------------------------------------------------ geometry
function yawAxes(yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; }
function rotAxes(q) {
  if (!q) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const { x, y, z, w } = q;
  // Columns of the rotation matrix: where the local X, Y, Z axes point.
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
  ];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function boxBox(A, B) {
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  const axes = [...A.axes, ...B.axes];
  for (const a of A.axes) for (const b of B.axes) { const x = cross(a, b); if (dot(x, x) > 1e-10) axes.push(x); }
  for (const L of axes) {
    const ra = A.h.reduce((s, h, i) => s + h * Math.abs(dot(A.axes[i], L)), 0);
    const rb = B.h.reduce((s, h, i) => s + h * Math.abs(dot(B.axes[i], L)), 0);
    if (Math.abs(dot(d, L)) > ra + rb) return false;
  }
  return true;
}
function sphereBox(c, r, B) {
  const d = [c[0] - B.c[0], c[1] - B.c[1], c[2] - B.c[2]];
  let dist2 = 0;
  for (let i = 0; i < 3; i++) {
    const p = dot(d, B.axes[i]), e = Math.max(-B.h[i], Math.min(B.h[i], p));
    dist2 += (p - e) * (p - e);
  }
  return dist2 <= r * r;
}
