// NPCs (mashup-research/ROBLOX_HUMANOID_MOVETO_2026-11-24.md): a rig in the Workspace (a Model with a Humanoid
// and a HumanoidRootPart, not a player's character) whose root part isn't anchored is a character, driven as
// the player's is: its own physics capsule (runtime/character.js), its Humanoid's WalkSpeed, JumpPower and
// Jump, MoveTo and Move (runtime/walk.js), R15's parts and Motor6Ds on its body (runtime/charbody.js, so
// scripts, IKControls and AnimationTracks reach them), and the clips of its state (idle, walk, run, jump,
// fall). OURS: Roblox NPCs only animate with an Animate script. Its body: a generated one from the
// HumanoidDescription under its Humanoid (an R15 rig), else the blocky character. Anchored rigs stay statues
// (runtime/rigs.js). Health 0: Died, the death pose, no respawn.
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { V3, CF } from '../datamodel.js';
import { Character } from './character.js';
import { CharacterBody } from './charbody.js';
import { describedBody, bodyFile, bodyColors } from './bodygen.js';
import { walkStep } from './walk.js';
import { animatedJoints } from '../animation.js';

const DEG = Math.PI / 180;
// A rig's Humanoid and root part (runtime/rigs.js rigParts, but also once it's ours: an NPC's model is
// marked a character, which rigParts turns away so the statue isn't drawn too).
const npcParts = m => {
  if (!m || m.ClassName !== 'Model') return null;
  const hum = m.children.find(c => c.ClassName === 'Humanoid'), root = m.children.find(c => c.props.Name === 'HumanoidRootPart' && c.props.CFrame);
  return hum && root ? { hum, root } : null;
};

export class Npcs {
  constructor({ scene, dm, world, shadows, gravity, quality = 'high', url = '../assets/characters/character-a.glb' }) {
    Object.assign(this, { scene, dm, world, shadows, gravity, tier: quality, url });
    this.npcs = new Map(); // model -> { char, body, hum, root, loading }
    dm.watch((inst, key) => this.changed(inst, key));
  }

  // Rigs that should be NPCs now: unanchored roots, in the Workspace, not a player's character.
  candidates() {
    const out = [], players = this.dm.service('Players').children;
    const walk = i => { for (const c of i.children) { const r = npcParts(c); if (r && !r.root.props.Anchored && !players.some(p => p.props.Character === c)) out.push(c); else if (c.ClassName === 'Model' || c.ClassName === 'Folder') walk(c); } };
    walk(this.dm.workspace);
    return out;
  }

  // An NPC begins: its root part leaves the World's physics (its capsule carries it now), its body loads.
  start(model) {
    const { hum, root } = npcParts(model), e = { hum, root, model, loading: true };
    this.npcs.set(model, e);
    this.world.removed(root); root.isCharacter = true;
    const params = this.described(hum), cf = root.props.CFrame;
    e.sig = JSON.stringify(params);
    Character.load(this.scene, params ? bodyFile(params, this.tier) : this.url, this.shadows, Vector3.Zero()).then(char => {
      if (this.npcs.get(model) !== e) { char.holder.dispose(false, true); char.ctrl.dispose(); return; } // gone meanwhile
      model.isCharacter = true; // runtime/rigs.js stops drawing it as a statue
      e.char = char; e.loading = false;
      if (params) { char.bodyParams = params; char.colors = bodyColors(params); } // (CharacterBody gives it a BodyColors)
      const look = [-cf.m[5], -cf.m[11]];
      char.teleport(new Vector3(cf.x, cf.y - char.rootHeight, cf.z), Math.atan2(look[0], look[1]));
      e.body = new CharacterBody(this.dm, char, model, root);
      hum.props.RigType = char.rig ? 'R15' : 'R6';
      char.joints = () => { const a = hum.children.find(c => c.ClassName === 'Animator'); return a ? animatedJoints(a) : new Map(); };
      this.sync(e);
      e.body.update(0);
    });
  }

  // The generated body its Humanoid's description gives (an R15 rig), or null.
  described(hum) {
    const d = hum.props.RigType === 'R15' && hum.children.find(c => c.ClassName === 'HumanoidDescription');
    const sh = d && d.children.find(c => c.ClassName === 'BodyShape');
    return d ? describedBody(d.props, sh && sh.props) : null;
  }

  // Its description changed (ApplyDescriptionAsync, a script): the body rebuilt where it stands, the same
  // parts and joints resized, as for the player.
  reshape(e, sig) {
    e.sig = sig; const params = JSON.parse(sig), token = (e.token = {});
    Character.loadRes(this.scene, bodyFile(params, this.tier)).then(r => {
      if (e.token !== token || !e.char || !this.npcs.has(e.model)) { r.res.meshes.slice().forEach(m => m.dispose(false, true)); return; }
      e.char.setBody(r.res, r); e.char.bodyParams = params; e.char.colors = bodyColors(params);
      e.body.reshape();
      const bc = e.body.bodyColors;
      if (bc) for (const [g, c] of Object.entries(e.char.colors)) { bc.props[g + 'Color3'] = new (bc.props[g + 'Color3'].constructor)(...c); }
    });
  }

  stop(model) {
    const e = this.npcs.get(model);
    this.npcs.delete(model);
    if (e && e.char) { e.char.holder.dispose(false, true); e.char.ctrl.dispose(); }
  }

  // A script moving the root part teleports the NPC (and ends its MoveTo); Health 0 kills it.
  changed(inst, key) {
    for (const [model, e] of this.npcs) {
      if (!e.char) continue;
      if (inst === e.root && key === 'CFrame' && !e.dead) {
        const cf = inst.props.CFrame, look = [-cf.m[5], -cf.m[11]];
        e.char.teleport(new Vector3(cf.x, cf.y - e.char.rootHeight, cf.z), Math.hypot(...look) > 1e-3 ? Math.atan2(look[0], look[1]) : undefined);
        if (e.hum.walk && e.hum.walk.kind === 'to') { e.hum.walk = null; this.dm.fire(e.hum, 'MoveToFinished', [false]); }
      }
      if (e.body && inst === e.body.bodyColors && /Color3$/.test(key)) { const c = inst.props[key]; e.char.setColors({ [key.slice(0, -6)]: [c.r, c.g, c.b] }); }
      if (inst === e.hum && key === 'Health' && inst.props.Health <= 0 && !e.dead) { e.dead = true; e.char.dead = true; e.hum.walk = null; this.dm.fire(e.hum, 'Died', []); }
    }
  }

  // Each frame, with the player's step: start and stop NPCs, then input, physics and the body for each.
  update(t, dt) {
    const live = new Set(this.candidates());
    for (const m of [...this.npcs.keys()]) if (!live.has(m) || m.destroyed) this.stop(m);
    for (const m of live) if (!this.npcs.has(m)) this.start(m);
    const cam = this.dm.workspace.props.CurrentCamera, cf = cam && cam.props.CFrame, fwd = cf ? (l => { const n = Math.hypot(l[0], l[1]) || 1; return { x: l[0] / n, z: l[1] / n }; })([-cf.m[5], -cf.m[11]]) : null;
    for (const e of this.npcs.values()) {
      if (!e.char) continue;
      if (e.char.bodyParams) { const now = this.described(e.hum); if (now && JSON.stringify(now) !== e.sig) this.reshape(e, JSON.stringify(now)); }
      const h = e.hum.props, p = e.char.p;
      p.WalkSpeed = h.WalkSpeed; p.JumpPower = h.UseJumpPower ? h.JumpPower : Math.sqrt(2 * this.gravity * Math.max(0, h.JumpHeight));
      p.AutoJumpEnabled = false; p.MaxSlopeAngle = Math.min(89, Math.max(0, h.MaxSlopeAngle));
      const w = e.dead ? null : walkStep(e.hum, e.char.holder.position, t, fwd), jump = !e.dead && h.Jump;
      if (h.Jump) h.Jump = false; // taken, as for the player
      e.char.setInput(w ? w[0] : 0, w ? w[1] : 0, jump);
      e.char.step(dt, this.gravity);
      this.sync(e);
      e.body.update(dt);
      const md = e.char.moveDir; h.MoveDirection = new V3(md.x, 0, md.z);
    }
  }

  // The root part where the capsule carried the body (physics-written: no Changed), as for the player.
  sync(e) {
    const f = e.char.holder.position, P = e.root.props;
    let oy = e.char.yaw / DEG - 180; oy = ((oy + 180) % 360 + 360) % 360 - 180;
    P.CFrame = CF.fromOrientation(f.x, f.y + e.char.rootHeight, f.z, 0, oy, 0);
    P.Position = new V3(P.CFrame.x, P.CFrame.y, P.CFrame.z);
    P.Orientation = new V3(0, oy, 0);
  }

  /** A tier change: the next NPCs load at its detail (those walking keep theirs). */
  setTier(t) { this.tier = t; }
}
