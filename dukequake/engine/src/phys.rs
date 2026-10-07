//! sv_phys.c: every movetype, pushers (doors, plats), gravity, stepping,
//! water. Ported line by line; see server.rs on float vs double.
use crate::bsp::{CONTENTS_EMPTY, CONTENTS_WATER};
use crate::defs::*;
use crate::mathlib::*;
use crate::server::*;
use crate::world::{Trace, MOVE_MISSILE, MOVE_NOMONSTERS, MOVE_NORMAL};

const STOP_EPSILON: f32 = 0.1;
const MAX_CLIP_PLANES: usize = 5;
const STEPSIZE: f32 = 18.0;

/// ClipVelocity: slide off a plane; returns the blocked flags.
pub fn clip_velocity(inv: Vec3, normal: Vec3, overbounce: f32) -> (Vec3, i32) {
    let mut blocked = 0;
    if normal[2] > 0.0 { blocked |= 1; }
    if normal[2] == 0.0 { blocked |= 2; }
    let backoff = dot(inv, normal) * overbounce;
    let mut out = [0.0f32; 3];
    for i in 0..3 {
        let change = normal[i] * backoff;
        out[i] = inv[i] - change;
        if out[i] > -STOP_EPSILON && out[i] < STOP_EPSILON { out[i] = 0.0; }
    }
    (out, blocked)
}

impl Server {
    fn movetype(&self, e: usize) -> i32 { self.pr.ef(e, F_MOVETYPE) as i32 }
    fn flags(&self, e: usize) -> i32 { self.pr.ef(e, F_FLAGS) as i32 }
    fn set_flags(&mut self, e: usize, f: i32) { self.pr.set_ef(e, F_FLAGS, f as f32); }

    /// SV_CheckVelocity.
    pub fn check_velocity(&mut self, e: usize) {
        let maxv = self.cvars.v("sv_maxvelocity");
        let mut v = self.pr.ev(e, F_VELOCITY);
        let mut o = self.pr.ev(e, F_ORIGIN);
        for i in 0..3 {
            if v[i].is_nan() { v[i] = 0.0; }
            if o[i].is_nan() { o[i] = 0.0; }
            if v[i] > maxv { v[i] = maxv; } else if v[i] < -maxv { v[i] = -maxv; }
        }
        self.pr.set_ev(e, F_VELOCITY, v);
        self.pr.set_ev(e, F_ORIGIN, o);
    }

    /// SV_RunThink: false if the entity freed itself.
    pub fn run_think(&mut self, e: usize) -> bool {
        let mut thinktime = self.pr.ef(e, F_NEXTTHINK);
        if thinktime <= 0.0 || thinktime as f64 > self.time + self.frametime { return true; }
        if (thinktime as f64) < self.time { thinktime = self.time as f32; }
        self.pr.set_ef(e, F_NEXTTHINK, 0.0);
        self.pr.set_gf(G_TIME, thinktime);
        self.pr.set_gi(G_SELF, self.pr.prog(e));
        self.pr.set_gi(G_OTHER, 0);
        let f = self.pr.ei(e, F_THINK);
        self.execute(f);
        !self.pr.meta[e].free
    }

    /// SV_Impact: both entities' touch functions.
    pub fn impact(&mut self, e1: usize, e2: usize) {
        let (os, oo) = (self.pr.gi(G_SELF), self.pr.gi(G_OTHER));
        self.pr.set_gf(G_TIME, self.time as f32);
        if self.pr.ei(e1, F_TOUCH) != 0 && self.pr.ef(e1, F_SOLID) as i32 != SOLID_NOT {
            self.pr.set_gi(G_SELF, self.pr.prog(e1));
            self.pr.set_gi(G_OTHER, self.pr.prog(e2));
            let f = self.pr.ei(e1, F_TOUCH);
            self.execute(f);
        }
        if self.pr.ei(e2, F_TOUCH) != 0 && self.pr.ef(e2, F_SOLID) as i32 != SOLID_NOT {
            self.pr.set_gi(G_SELF, self.pr.prog(e2));
            self.pr.set_gi(G_OTHER, self.pr.prog(e1));
            let f = self.pr.ei(e2, F_TOUCH);
            self.execute(f);
        }
        self.pr.set_gi(G_SELF, os);
        self.pr.set_gi(G_OTHER, oo);
    }

    /// SV_FlyMove: move by velocity*time, sliding along up to 5 planes.
    pub fn fly_move(&mut self, e: usize, time: f32, mut steptrace: Option<&mut Trace>) -> i32 {
        let numbumps = 4;
        let mut blocked = 0;
        let mut original_velocity = self.pr.ev(e, F_VELOCITY);
        let primal_velocity = original_velocity;
        let mut planes = [[0.0f32; 3]; MAX_CLIP_PLANES];
        let mut numplanes = 0;
        let mut time_left = time;
        for _ in 0..numbumps {
            let vel = self.pr.ev(e, F_VELOCITY);
            if vel[0] == 0.0 && vel[1] == 0.0 && vel[2] == 0.0 { break; }
            let org = self.pr.ev(e, F_ORIGIN);
            let mut end = [0.0f32; 3];
            for i in 0..3 { end[i] = org[i] + time_left * vel[i]; }
            let trace = self.sv_move(org, self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS), end, MOVE_NORMAL, Some(e));
            if trace.allsolid {
                self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
                return 3;
            }
            if trace.fraction > 0.0 {
                self.pr.set_ev(e, F_ORIGIN, trace.endpos);
                original_velocity = self.pr.ev(e, F_VELOCITY);
                numplanes = 0;
            }
            if trace.fraction == 1.0 { break; }
            let te = trace.ent.expect("SV_FlyMove: !trace.ent");
            if trace.plane_normal[2] > 0.7 {
                blocked |= 1;
                if self.pr.ef(te, F_SOLID) as i32 == SOLID_BSP {
                    let fl = self.flags(e) | FL_ONGROUND;
                    self.set_flags(e, fl);
                    self.pr.set_ei(e, F_GROUNDENTITY, self.pr.prog(te));
                }
            }
            if trace.plane_normal[2] == 0.0 {
                blocked |= 2;
                if let Some(st) = steptrace.as_deref_mut() { *st = trace; }
            }
            self.impact(e, te);
            if self.pr.meta[e].free { break; }
            time_left -= time_left * trace.fraction;
            if numplanes >= MAX_CLIP_PLANES {
                self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
                return 3;
            }
            planes[numplanes] = trace.plane_normal;
            numplanes += 1;
            let mut new_velocity = [0.0f32; 3];
            let mut i = 0;
            while i < numplanes {
                new_velocity = clip_velocity(original_velocity, planes[i], 1.0).0;
                let mut j = 0;
                while j < numplanes {
                    if j != i && dot(new_velocity, planes[j]) < 0.0 { break; }
                    j += 1;
                }
                if j == numplanes { break; }
                i += 1;
            }
            if i != numplanes {
                self.pr.set_ev(e, F_VELOCITY, new_velocity);
            } else {
                if numplanes != 2 {
                    self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
                    return 7;
                }
                let dir = cross(planes[0], planes[1]);
                let d = dot(dir, self.pr.ev(e, F_VELOCITY));
                self.pr.set_ev(e, F_VELOCITY, scale(dir, d));
            }
            if dot(self.pr.ev(e, F_VELOCITY), primal_velocity) <= 0.0 {
                self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
                return blocked;
            }
        }
        blocked
    }

    /// SV_AddGravity: the entity's "gravity" field if the progs has one.
    pub fn add_gravity(&mut self, e: usize) {
        let g = match self.f_gravity { Some(f) if self.pr.ef(e, f) != 0.0 => self.pr.ef(e, f), _ => 1.0 };
        let mut v = self.pr.ev(e, F_VELOCITY);
        v[2] = (v[2] as f64 - (g * self.cvars.v("sv_gravity")) as f64 * self.frametime) as f32;
        self.pr.set_ev(e, F_VELOCITY, v);
    }

    /// SV_PushEntity: move without sliding; touch what's hit.
    pub fn push_entity(&mut self, e: usize, push: Vec3) -> Trace {
        let org = self.pr.ev(e, F_ORIGIN);
        let end = add(org, push);
        let solid = self.pr.ef(e, F_SOLID) as i32;
        let typ = if self.movetype(e) == MOVETYPE_FLYMISSILE { MOVE_MISSILE }
            else if solid == SOLID_TRIGGER || solid == SOLID_NOT { MOVE_NOMONSTERS } else { MOVE_NORMAL };
        let trace = self.sv_move(org, self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS), end, typ, Some(e));
        self.pr.set_ev(e, F_ORIGIN, trace.endpos);
        self.link_edict(e, true);
        if let Some(te) = trace.ent { self.impact(e, te); }
        trace
    }

    /// SV_PushMove: a door or plat moves, carrying or blocked by what it hits.
    fn push_move(&mut self, pusher: usize, movetime: f32) {
        let vel = self.pr.ev(pusher, F_VELOCITY);
        if vel[0] == 0.0 && vel[1] == 0.0 && vel[2] == 0.0 {
            let lt = self.pr.ef(pusher, F_LTIME) + movetime;
            self.pr.set_ef(pusher, F_LTIME, lt);
            return;
        }
        let (absmin, absmax) = (self.pr.ev(pusher, F_ABSMIN), self.pr.ev(pusher, F_ABSMAX));
        let mut mv = [0.0f32; 3];
        let (mut mins, mut maxs) = ([0.0f32; 3], [0.0f32; 3]);
        for i in 0..3 {
            mv[i] = vel[i] * movetime;
            mins[i] = absmin[i] + mv[i];
            maxs[i] = absmax[i] + mv[i];
        }
        let pushorig = self.pr.ev(pusher, F_ORIGIN);
        self.pr.set_ev(pusher, F_ORIGIN, add(pushorig, mv));
        let lt = self.pr.ef(pusher, F_LTIME) + movetime;
        self.pr.set_ef(pusher, F_LTIME, lt);
        self.link_edict(pusher, false);

        let mut moved: Vec<(usize, Vec3)> = Vec::new();
        let mut e = 1;
        while e < self.num_edicts {
            let check = e;
            e += 1;
            if self.pr.meta[check].free { continue; }
            let mt = self.movetype(check);
            if mt == MOVETYPE_PUSH || mt == MOVETYPE_NONE || mt == MOVETYPE_NOCLIP { continue; }
            if !(self.flags(check) & FL_ONGROUND != 0 && self.pr.ee(check, F_GROUNDENTITY) == pusher) {
                let (cmin, cmax) = (self.pr.ev(check, F_ABSMIN), self.pr.ev(check, F_ABSMAX));
                if cmin[0] >= maxs[0] || cmin[1] >= maxs[1] || cmin[2] >= maxs[2]
                    || cmax[0] <= mins[0] || cmax[1] <= mins[1] || cmax[2] <= mins[2] { continue; }
                if self.test_entity_position(check).is_none() { continue; }
            }
            if mt != MOVETYPE_WALK {
                let fl = self.flags(check) & !FL_ONGROUND;
                self.set_flags(check, fl);
            }
            let entorig = self.pr.ev(check, F_ORIGIN);
            moved.push((check, entorig));
            self.pr.set_ef(pusher, F_SOLID, SOLID_NOT as f32);
            self.push_entity(check, mv);
            self.pr.set_ef(pusher, F_SOLID, SOLID_BSP as f32);
            if self.test_entity_position(check).is_some() {
                let (cmins, cmaxs) = (self.pr.ev(check, F_MINS), self.pr.ev(check, F_MAXS));
                if cmins[0] == cmaxs[0] { continue; }
                let cs = self.pr.ef(check, F_SOLID) as i32;
                if cs == SOLID_NOT || cs == SOLID_TRIGGER {
                    let m = [0.0, 0.0, cmins[2]];
                    self.pr.set_ev(check, F_MINS, m);
                    self.pr.set_ev(check, F_MAXS, m);
                    continue;
                }
                self.pr.set_ev(check, F_ORIGIN, entorig);
                self.link_edict(check, true);
                self.pr.set_ev(pusher, F_ORIGIN, pushorig);
                self.link_edict(pusher, false);
                let lt = self.pr.ef(pusher, F_LTIME) - movetime;
                self.pr.set_ef(pusher, F_LTIME, lt);
                if self.pr.ei(pusher, F_BLOCKED) != 0 {
                    self.pr.set_gi(G_SELF, self.pr.prog(pusher));
                    self.pr.set_gi(G_OTHER, self.pr.prog(check));
                    let f = self.pr.ei(pusher, F_BLOCKED);
                    self.execute(f);
                }
                for (m, from) in moved {
                    self.pr.set_ev(m, F_ORIGIN, from);
                    self.link_edict(m, false);
                }
                return;
            }
        }
    }

    /// SV_Physics_Pusher.
    fn physics_pusher(&mut self, e: usize) {
        let oldltime = self.pr.ef(e, F_LTIME);
        let thinktime = self.pr.ef(e, F_NEXTTHINK);
        let movetime = if (thinktime as f64) < oldltime as f64 + self.frametime {
            (thinktime - oldltime).max(0.0)
        } else {
            self.frametime as f32
        };
        if movetime != 0.0 { self.push_move(e, movetime); }
        if thinktime > oldltime && thinktime <= self.pr.ef(e, F_LTIME) {
            self.pr.set_ef(e, F_NEXTTHINK, 0.0);
            self.pr.set_gf(G_TIME, self.time as f32);
            self.pr.set_gi(G_SELF, self.pr.prog(e));
            self.pr.set_gi(G_OTHER, 0);
            let f = self.pr.ei(e, F_THINK);
            self.execute(f);
        }
    }

    /// SV_CheckStuck.
    fn check_stuck(&mut self, e: usize) {
        if self.test_entity_position(e).is_none() {
            let o = self.pr.ev(e, F_ORIGIN);
            self.pr.set_ev(e, F_OLDORIGIN, o);
            return;
        }
        let org = self.pr.ev(e, F_ORIGIN);
        let old = self.pr.ev(e, F_OLDORIGIN);
        self.pr.set_ev(e, F_ORIGIN, old);
        if self.test_entity_position(e).is_none() {
            self.link_edict(e, true);
            return;
        }
        for z in 0..18 {
            for i in -1..=1 {
                for j in -1..=1 {
                    self.pr.set_ev(e, F_ORIGIN, [org[0] + i as f32, org[1] + j as f32, org[2] + z as f32]);
                    if self.test_entity_position(e).is_none() {
                        self.link_edict(e, true);
                        return;
                    }
                }
            }
        }
        self.pr.set_ev(e, F_ORIGIN, org);
    }

    /// SV_CheckWater: sets waterlevel/watertype; true if waist deep.
    fn check_water(&mut self, e: usize) -> bool {
        let (o, mins, maxs, vo) = (self.pr.ev(e, F_ORIGIN), self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS), self.pr.ev(e, F_VIEW_OFS));
        let mut p = [o[0], o[1], o[2] + mins[2] + 1.0];
        self.pr.set_ef(e, F_WATERLEVEL, 0.0);
        self.pr.set_ef(e, F_WATERTYPE, CONTENTS_EMPTY as f32);
        let cont = self.point_contents(p);
        if cont <= CONTENTS_WATER {
            self.pr.set_ef(e, F_WATERTYPE, cont as f32);
            self.pr.set_ef(e, F_WATERLEVEL, 1.0);
            p[2] = (o[2] as f64 + (mins[2] + maxs[2]) as f64 * 0.5) as f32;
            if self.point_contents(p) <= CONTENTS_WATER {
                self.pr.set_ef(e, F_WATERLEVEL, 2.0);
                p[2] = o[2] + vo[2];
                if self.point_contents(p) <= CONTENTS_WATER { self.pr.set_ef(e, F_WATERLEVEL, 3.0); }
            }
        }
        self.pr.ef(e, F_WATERLEVEL) > 1.0
    }

    /// SV_WallFriction.
    fn wall_friction(&mut self, e: usize, tr: &Trace) {
        let (forward, _, _) = angle_vectors(self.pr.ev(e, F_V_ANGLE));
        let d = (dot(tr.plane_normal, forward) as f64 + 0.5) as f32;
        if d >= 0.0 { return; }
        let v = self.pr.ev(e, F_VELOCITY);
        let i = dot(tr.plane_normal, v);
        let into = scale(tr.plane_normal, i);
        let side = sub(v, into);
        self.pr.set_ev(e, F_VELOCITY, [side[0] * (1.0 + d), side[1] * (1.0 + d), v[2]]);
    }

    /// SV_TryUnstick.
    fn try_unstick(&mut self, e: usize, oldvel: Vec3) -> i32 {
        let oldorg = self.pr.ev(e, F_ORIGIN);
        const DIRS: [[f32; 2]; 8] = [[2.0, 0.0], [0.0, 2.0], [-2.0, 0.0], [0.0, -2.0], [2.0, 2.0], [-2.0, 2.0], [2.0, -2.0], [-2.0, -2.0]];
        for d in DIRS {
            self.push_entity(e, [d[0], d[1], 0.0]);
            self.pr.set_ev(e, F_VELOCITY, [oldvel[0], oldvel[1], 0.0]);
            let mut st = Trace::default();
            let clip = self.fly_move(e, 0.1, Some(&mut st));
            let o = self.pr.ev(e, F_ORIGIN);
            if (oldorg[1] - o[1]).abs() > 4.0 || (oldorg[0] - o[0]).abs() > 4.0 { return clip; }
            self.pr.set_ev(e, F_ORIGIN, oldorg);
        }
        self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
        7
    }

    /// SV_WalkMove: the player's move, with stair stepping.
    fn walk_move(&mut self, e: usize, player: usize) {
        let oldonground = self.flags(e) & FL_ONGROUND;
        let fl = self.flags(e) & !FL_ONGROUND;
        self.set_flags(e, fl);
        let oldorg = self.pr.ev(e, F_ORIGIN);
        let oldvel = self.pr.ev(e, F_VELOCITY);
        let mut steptrace = Trace::default();
        let mut clip = self.fly_move(e, self.frametime as f32, Some(&mut steptrace));
        if clip & 2 == 0 { return; }
        if oldonground == 0 && self.pr.ef(e, F_WATERLEVEL) == 0.0 { return; }
        if self.movetype(e) != MOVETYPE_WALK { return; }
        if self.cvars.v("sv_nostep") != 0.0 { return; }
        if self.flags(player) & FL_WATERJUMP != 0 { return; }
        let nosteporg = self.pr.ev(e, F_ORIGIN);
        let nostepvel = self.pr.ev(e, F_VELOCITY);
        self.pr.set_ev(e, F_ORIGIN, oldorg);
        let upmove = [0.0, 0.0, STEPSIZE];
        let downmove = [0.0, 0.0, (-STEPSIZE as f64 + oldvel[2] as f64 * self.frametime) as f32];
        self.push_entity(e, upmove);
        self.pr.set_ev(e, F_VELOCITY, [oldvel[0], oldvel[1], 0.0]);
        clip = self.fly_move(e, self.frametime as f32, Some(&mut steptrace));
        if clip != 0 {
            let o = self.pr.ev(e, F_ORIGIN);
            if (oldorg[1] - o[1]).abs() < 0.03125 && (oldorg[0] - o[0]).abs() < 0.03125 {
                clip = self.try_unstick(e, oldvel);
            }
        }
        if clip & 2 != 0 { self.wall_friction(e, &steptrace); }
        let downtrace = self.push_entity(e, downmove);
        if downtrace.plane_normal[2] > 0.7 {
            if self.pr.ef(e, F_SOLID) as i32 == SOLID_BSP {
                let fl = self.flags(e) | FL_ONGROUND;
                self.set_flags(e, fl);
                self.pr.set_ei(e, F_GROUNDENTITY, self.pr.prog(downtrace.ent.unwrap_or(0)));
            }
        } else {
            self.pr.set_ev(e, F_ORIGIN, nosteporg);
            self.pr.set_ev(e, F_VELOCITY, nostepvel);
        }
    }

    /// SV_Physics_Client.
    fn physics_client(&mut self, e: usize, num: usize) {
        if !self.clients[num - 1].active { return; }
        self.pr.set_gf(G_TIME, self.time as f32);
        self.pr.set_gi(G_SELF, self.pr.prog(e));
        let f = self.pr.gi(G_PLAYERPRETHINK);
        self.execute(f);
        self.check_velocity(e);
        match self.movetype(e) {
            MOVETYPE_NONE => { if !self.run_think(e) { return; } }
            MOVETYPE_WALK => {
                if !self.run_think(e) { return; }
                if !self.check_water(e) && self.flags(e) & FL_WATERJUMP == 0 { self.add_gravity(e); }
                self.check_stuck(e);
                self.walk_move(e, e);
            }
            MOVETYPE_TOSS | MOVETYPE_BOUNCE => self.physics_toss(e),
            MOVETYPE_FLY => {
                if !self.run_think(e) { return; }
                self.fly_move(e, self.frametime as f32, None);
            }
            MOVETYPE_NOCLIP => {
                if !self.run_think(e) { return; }
                let o = ma(self.pr.ev(e, F_ORIGIN), self.frametime as f32, self.pr.ev(e, F_VELOCITY));
                self.pr.set_ev(e, F_ORIGIN, o);
            }
            m => panic!("SV_Physics_client: bad movetype {m}"),
        }
        self.link_edict(e, true);
        self.pr.set_gf(G_TIME, self.time as f32);
        self.pr.set_gi(G_SELF, self.pr.prog(e));
        let f = self.pr.gi(G_PLAYERPOSTTHINK);
        self.execute(f);
    }

    /// SV_Physics_Noclip.
    fn physics_noclip(&mut self, e: usize) {
        if !self.run_think(e) { return; }
        let ft = self.frametime as f32;
        let a = ma(self.pr.ev(e, F_ANGLES), ft, self.pr.ev(e, F_AVELOCITY));
        self.pr.set_ev(e, F_ANGLES, a);
        let o = ma(self.pr.ev(e, F_ORIGIN), ft, self.pr.ev(e, F_VELOCITY));
        self.pr.set_ev(e, F_ORIGIN, o);
        self.link_edict(e, false);
    }

    /// SV_CheckWaterTransition (with id's waterlevel = cont bug).
    fn check_water_transition(&mut self, e: usize) {
        let cont = self.point_contents(self.pr.ev(e, F_ORIGIN));
        if self.pr.ef(e, F_WATERTYPE) == 0.0 {
            self.pr.set_ef(e, F_WATERTYPE, cont as f32);
            self.pr.set_ef(e, F_WATERLEVEL, 1.0);
            return;
        }
        if cont <= CONTENTS_WATER {
            if self.pr.ef(e, F_WATERTYPE) == CONTENTS_EMPTY as f32 { self.start_sound(e, 0, "misc/h2ohit1.wav", 255, 1.0); }
            self.pr.set_ef(e, F_WATERTYPE, cont as f32);
            self.pr.set_ef(e, F_WATERLEVEL, 1.0);
        } else {
            if self.pr.ef(e, F_WATERTYPE) != CONTENTS_EMPTY as f32 { self.start_sound(e, 0, "misc/h2ohit1.wav", 255, 1.0); }
            self.pr.set_ef(e, F_WATERTYPE, CONTENTS_EMPTY as f32);
            self.pr.set_ef(e, F_WATERLEVEL, cont as f32);
        }
    }

    /// SV_Physics_Toss: grenades, gibs, missiles.
    fn physics_toss(&mut self, e: usize) {
        if !self.run_think(e) { return; }
        if self.flags(e) & FL_ONGROUND != 0 { return; }
        self.check_velocity(e);
        let mt = self.movetype(e);
        if mt != MOVETYPE_FLY && mt != MOVETYPE_FLYMISSILE { self.add_gravity(e); }
        let ft = self.frametime as f32;
        let a = ma(self.pr.ev(e, F_ANGLES), ft, self.pr.ev(e, F_AVELOCITY));
        self.pr.set_ev(e, F_ANGLES, a);
        let mv = scale(self.pr.ev(e, F_VELOCITY), ft);
        let trace = self.push_entity(e, mv);
        if trace.fraction == 1.0 { return; }
        if self.pr.meta[e].free { return; }
        let backoff = if self.movetype(e) == MOVETYPE_BOUNCE { 1.5 } else { 1.0 };
        let (v, _) = clip_velocity(self.pr.ev(e, F_VELOCITY), trace.plane_normal, backoff);
        self.pr.set_ev(e, F_VELOCITY, v);
        if trace.plane_normal[2] > 0.7 && (v[2] < 60.0 || self.movetype(e) != MOVETYPE_BOUNCE) {
            let fl = self.flags(e) | FL_ONGROUND;
            self.set_flags(e, fl);
            self.pr.set_ei(e, F_GROUNDENTITY, self.pr.prog(trace.ent.unwrap_or(0)));
            self.pr.set_ev(e, F_VELOCITY, [0.0; 3]);
            self.pr.set_ev(e, F_AVELOCITY, [0.0; 3]);
        }
        self.check_water_transition(e);
    }

    /// SV_Physics_Step: monsters fall, then think.
    fn physics_step(&mut self, e: usize) {
        if self.flags(e) & (FL_ONGROUND | FL_FLY | FL_SWIM) == 0 {
            let hitsound = (self.pr.ev(e, F_VELOCITY)[2] as f64) < self.cvars.v("sv_gravity") as f64 * -0.1;
            self.add_gravity(e);
            self.check_velocity(e);
            self.fly_move(e, self.frametime as f32, None);
            self.link_edict(e, true);
            if self.flags(e) & FL_ONGROUND != 0 && hitsound { self.start_sound(e, 0, "demon/dland2.wav", 255, 1.0); }
        }
        self.run_think(e);
        self.check_water_transition(e);
    }

    /// SV_Physics: one frame for every entity.
    pub fn physics(&mut self) {
        self.pr.set_gi(G_SELF, 0);
        self.pr.set_gi(G_OTHER, 0);
        self.pr.set_gf(G_TIME, self.time as f32);
        let f = self.pr.gi(G_STARTFRAME);
        self.execute(f);
        let mut i = 0;
        while i < self.num_edicts {
            let e = i;
            i += 1;
            if self.error.is_some() { return; }
            if self.pr.meta[e].free { continue; }
            if self.pr.gf(G_FORCE_RETOUCH) != 0.0 { self.link_edict(e, true); }
            let mt = self.movetype(e);
            if e > 0 && e <= self.maxclients { self.physics_client(e, e); }
            else if mt == MOVETYPE_PUSH { self.physics_pusher(e); }
            else if mt == MOVETYPE_NONE { self.run_think(e); }
            else if mt == MOVETYPE_NOCLIP { self.physics_noclip(e); }
            else if mt == MOVETYPE_STEP { self.physics_step(e); }
            else if mt == MOVETYPE_TOSS || mt == MOVETYPE_BOUNCE || mt == MOVETYPE_FLY || mt == MOVETYPE_FLYMISSILE { self.physics_toss(e); }
            else { panic!("SV_Physics: bad movetype {mt}"); }
        }
        let fr = self.pr.gf(G_FORCE_RETOUCH);
        if fr != 0.0 { self.pr.set_gf(G_FORCE_RETOUCH, fr - 1.0); }
        self.time += self.frametime;
    }
}
