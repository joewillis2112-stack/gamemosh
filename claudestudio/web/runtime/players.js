// Players, characters and humanoids, the way Roblox scripts expect them:
// the place's scripts run, then a Player joins (PlayerAdded), then its
// character spawns as a Model in Workspace with a Humanoid and a
// HumanoidRootPart (CharacterAdded). Every frame the root part follows the
// controller, Touched/TouchEnded fire for parts the body overlaps, and the
// Humanoid's properties drive the controller. Health 0 fires Died, plays the
// death clip, and the player respawns after Players.RespawnTime.
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { V3, CF, Instance } from '../datamodel.js';
import { capsuleHits } from './shapes.js';

const DEG = Math.PI / 180;

export class Players {
  constructor(dm, world, character, gravity) {
    this.dm = dm;
    this.world = world;
    this.char = character; // one visual + controller, reused across respawns
    this.gravity = gravity;
    this.service = dm.service('Players');
    this.touching = new Set(); // parts the body overlaps now
    this.respawnAt = null;
    this.time = 0;
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

  get hasCharacter() { return !!this.humanoid && !this.removed; }

  // The body leaves (respawn, removal): parts it touched get TouchEnded.
  endTouches() {
    for (const part of this.touching) if (!part.destroyed) {
      this.dm.fire(part, 'TouchEnded', [this.root]);
      if (this.root && !this.root.destroyed) this.dm.fire(this.root, 'TouchEnded', [part]);
    }
    this.touching = new Set();
  }

  spawn(player) {
    this.endTouches();
    this.removed = false;
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
    this.dead = false; this.respawnAt = null; this.regenAt = null;
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
    // Setting its CFrame also turns the character to the CFrame's facing.
    if (inst === this.root && key === 'CFrame' && !this.dead) {
      const cf = inst.props.CFrame, look = [-cf.m[5], -cf.m[11]]; // LookVector's x and z
      const turned = Math.hypot(look[0], look[1]) > 1e-3;
      this.char.teleport(new Vector3(cf.x, cf.y - 3, cf.z), turned ? Math.atan2(look[0], look[1]) : undefined);
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
    this.onDied && this.onDied();
    this.respawnAt = this.time + this.service.props.RespawnTime;
  }

  // Where the body will lie: the death clip's footprint (measured from the
  // clip) must not cut into a part. Try the current facing, then turned, then
  // slid back a little; the floor itself is excluded (the box starts 0.2 up).
  clearFall() {
    const c = this.char, box = c.deadBox;
    if (!box) return;
    const f = c.holder.position.clone();
    // The lying body as two capsules along its length (the measured die pose,
    // in the character's frame: feet at the origin, facing +Z), lifted 0.2
    // off the floor so the floor itself doesn't count.
    const r = Math.min(0.75, (box.max.x - box.min.x) / 4), y = f.y + 0.2 + r;
    const free = (yaw, shift) => {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const at = (lx, lz) => [f.x + lx * cs + (lz - shift) * sn, f.z - lx * sn + (lz - shift) * cs];
      for (const lx of [box.min.x + r, box.max.x - r]) {
        const [x0, z0] = at(lx, box.min.z + r), [x1, z1] = at(lx, box.max.z - r);
        for (const [inst, e] of this.world.parts) {
          if (inst.isCharacter || !inst.props.CanCollide) continue;
          if (capsuleHits(x0, y, z0, x1, y, z1, r, e.shape)) return false;
        }
      }
      return true;
    };
    for (const shift of [0, 0.5, 1, 1.5, 2]) for (const turn of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
      if (!free(c.yaw + turn, shift)) continue;
      c.yaw += turn;
      if (shift) c.teleport(new Vector3(f.x - Math.sin(c.yaw) * shift, f.y, f.z - Math.cos(c.yaw) * shift));
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
    // A script removed the character (Destroy, or parented it away): no body
    // to drive; it comes back after RespawnTime like a death.
    if (!this.removed && (this.model.destroyed || !this.world.inWorkspace(this.model) || this.humanoid.destroyed || this.root.destroyed)) {
      this.endTouches();
      this.removed = true; this.dead = true; this.char.dead = true;
      this.char.setVisible(false);
      this.respawnAt = t + this.service.props.RespawnTime;
    }
    if (this.removed) {
      if (this.respawnAt !== null && t >= this.respawnAt && this.service.props.CharacterAutoLoads) this.spawn(this.player);
      return;
    }
    const c = this.char;
    this.syncRoot();
    const md = c.moveDir;
    this.humanoid.props.MoveDirection = new V3(md.x, 0, md.z);
    this.humanoid.props.FloorMaterial = c.grounded && c.floorPart ? c.floorPart.props.Material : 'Air';
    // Humanoid events, as Roblox fires them: Jumping(true) on takeoff,
    // FreeFalling(true/false) entering and leaving a fall, and Running(speed)
    // whenever the ground speed changes (including to 0).
    if (c.state !== this.lastState) {
      if (c.state === 'jump' && this.lastState !== 'jump') this.dm.fire(this.humanoid, 'Jumping', [true]);
      if (c.state === 'fall') this.dm.fire(this.humanoid, 'FreeFalling', [true]);
      if (this.lastState === 'fall') this.dm.fire(this.humanoid, 'FreeFalling', [false]);
      this.lastState = c.state;
    }
    const speed = c.grounded ? Math.hypot(c.velocity.x - c.floorVel.x, c.velocity.z - c.floorVel.z) : 0; // over the floor (ours: Roblox doesn't say)
    if (c.grounded && Math.abs(speed - (this.lastSpeed ?? -1)) > 0.1) { this.lastSpeed = speed; this.dm.fire(this.humanoid, 'Running', [speed]); }
    if (!this.dead) this.touches();
    if (!this.dead) this.regen(t);
    if (!this.dead && c.footY < this.dm.workspace.props.FallenPartsDestroyHeight) this.dm.set(this.humanoid, 'Health', 0);
    if (this.dead && this.respawnAt !== null && t >= this.respawnAt && this.service.props.CharacterAutoLoads) this.spawn(this.player);
  }

  // Roblox's default Health script: while hurt, every 1 s regain 1% of MaxHealth per second elapsed.
  regen(t) {
    const h = this.humanoid.props;
    if (h.Health >= h.MaxHealth) { this.regenAt = null; return; }
    if (this.regenAt == null) this.regenAt = t + 1;
    if (t >= this.regenAt - 1e-6) {
      this.dm.set(this.humanoid, 'Health', Math.min(h.MaxHealth, h.Health + 0.01 * h.MaxHealth));
      this.regenAt += 1; // from the last mark, so the steps don't drift a frame late each time
    }
  }

  syncRoot() {
    // Physics-driven, like Roblox: written straight to the props (no Changed per frame).
    const f = this.char.holder.position, P = this.root.props;
    let oy = this.char.yaw / DEG - 180; // Roblox: 0 = facing -Z
    oy = ((oy + 180) % 360 + 360) % 360 - 180;
    P.CFrame = CF.fromOrientation(f.x, f.y + 3, f.z, 0, oy, 0);
    P.Position = new V3(P.CFrame.x, P.CFrame.y, P.CFrame.z);
    P.Orientation = new V3(0, oy, 0);
  }

  // Touched / TouchEnded: the body as a capsule from the soles to the top of
  // the head, radius = the collision capsule's plus a 0.15-stud skin, so a
  // part the body presses against (a floor, a wall, a ceiling) touches it,
  // tested exactly against each part's shape (box, ball, cylinder, wedge).
  touches() {
    const c = this.char, f = c.holder.position, R = c.p.Radius + 0.15, H = c.p.Height;
    const ax = f.x, ay = f.y + R - 0.15, az = f.z, by = f.y + H - R + 0.15;
    const now = new Set();
    for (const [inst, e] of this.world.parts) {
      if (inst.isCharacter || inst.props.CanTouch === false) continue;
      if (capsuleHits(ax, ay, az, ax, by, az, R, e.shape)) now.add(inst);
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
