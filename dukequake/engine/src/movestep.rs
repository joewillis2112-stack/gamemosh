//! sv_move.c: how monsters walk: check the floor under them, step, pick a
//! chase direction. Ported line by line, id's quirks included (the 215 typo,
//! abs() of a float truncating to int, rand() deciding the search order).
use crate::bsp::{CONTENTS_EMPTY, CONTENTS_SOLID};
use crate::defs::*;
use crate::mathlib::*;
use crate::progs::{OFS_PARM0, OFS_RETURN};
use crate::server::*;
use crate::world::{MOVE_NOMONSTERS, MOVE_NORMAL};

const STEPSIZE: f32 = 18.0;
const DI_NODIR: f32 = -1.0;

impl Server {
    /// SV_CheckBottom: is the entity standing on solid ground?
    pub fn check_bottom(&mut self, e: usize) -> bool {
        let o = self.pr.ev(e, F_ORIGIN);
        let mins = add(o, self.pr.ev(e, F_MINS));
        let maxs = add(o, self.pr.ev(e, F_MAXS));
        let mut start = [0.0f32, 0.0, mins[2] - 1.0];
        let mut all_solid = true;
        'corners: for x in 0..=1 {
            for y in 0..=1 {
                start[0] = if x == 1 { maxs[0] } else { mins[0] };
                start[1] = if y == 1 { maxs[1] } else { mins[1] };
                if self.point_contents(start) != CONTENTS_SOLID { all_solid = false; break 'corners; }
            }
        }
        if all_solid { return true; }
        // realcheck
        start[2] = mins[2];
        start[0] = ((mins[0] + maxs[0]) as f64 * 0.5) as f32;
        start[1] = ((mins[1] + maxs[1]) as f64 * 0.5) as f32;
        let mut stop = [start[0], start[1], start[2] - 2.0 * STEPSIZE];
        let tr = self.sv_move(start, [0.0; 3], [0.0; 3], stop, MOVE_NOMONSTERS, Some(e));
        if tr.fraction == 1.0 { return false; }
        let mid = tr.endpos[2];
        let mut bottom = mid;
        for x in 0..=1 {
            for y in 0..=1 {
                start[0] = if x == 1 { maxs[0] } else { mins[0] };
                stop[0] = start[0];
                start[1] = if y == 1 { maxs[1] } else { mins[1] };
                stop[1] = start[1];
                let tr = self.sv_move(start, [0.0; 3], [0.0; 3], stop, MOVE_NOMONSTERS, Some(e));
                if tr.fraction != 1.0 && tr.endpos[2] > bottom { bottom = tr.endpos[2]; }
                if tr.fraction == 1.0 || mid - tr.endpos[2] > STEPSIZE { return false; }
            }
        }
        true
    }

    /// SV_movestep: try a move, stepping up and down stairs; swimmers and
    /// fliers also close vertically on their enemy.
    pub fn movestep(&mut self, e: usize, mv: Vec3, relink: bool) -> bool {
        let oldorg = self.pr.ev(e, F_ORIGIN);
        let mut neworg = add(oldorg, mv);
        let flags = self.pr.ef(e, F_FLAGS) as i32;
        if flags & (FL_SWIM | FL_FLY) != 0 {
            for i in 0..2 {
                let org = self.pr.ev(e, F_ORIGIN);
                neworg = add(org, mv);
                let enemy = self.pr.ee(e, F_ENEMY);
                if i == 0 && enemy != 0 {
                    let dz = org[2] - self.pr.ev(enemy, F_ORIGIN)[2];
                    if dz > 40.0 { neworg[2] -= 8.0; }
                    if dz < 30.0 { neworg[2] += 8.0; }
                }
                let tr = self.sv_move(org, self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS), neworg, MOVE_NORMAL, Some(e));
                if tr.fraction == 1.0 {
                    if flags & FL_SWIM != 0 && self.point_contents(tr.endpos) == CONTENTS_EMPTY { return false; }
                    self.pr.set_ev(e, F_ORIGIN, tr.endpos);
                    if relink { self.link_edict(e, true); }
                    return true;
                }
                if enemy == 0 { break; }
            }
            return false;
        }
        neworg[2] += STEPSIZE;
        let mut end = neworg;
        end[2] -= STEPSIZE * 2.0;
        let (mins, maxs) = (self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS));
        let mut tr = self.sv_move(neworg, mins, maxs, end, MOVE_NORMAL, Some(e));
        if tr.allsolid { return false; }
        if tr.startsolid {
            neworg[2] -= STEPSIZE;
            tr = self.sv_move(neworg, mins, maxs, end, MOVE_NORMAL, Some(e));
            if tr.allsolid || tr.startsolid { return false; }
        }
        if tr.fraction == 1.0 {
            if flags & FL_PARTIALGROUND != 0 {
                self.pr.set_ev(e, F_ORIGIN, add(oldorg, mv));
                if relink { self.link_edict(e, true); }
                let fl = self.pr.ef(e, F_FLAGS) as i32 & !FL_ONGROUND;
                self.pr.set_ef(e, F_FLAGS, fl as f32);
                return true;
            }
            return false;
        }
        self.pr.set_ev(e, F_ORIGIN, tr.endpos);
        if !self.check_bottom(e) {
            if self.pr.ef(e, F_FLAGS) as i32 & FL_PARTIALGROUND != 0 {
                if relink { self.link_edict(e, true); }
                return true;
            }
            self.pr.set_ev(e, F_ORIGIN, oldorg);
            return false;
        }
        let fl = self.pr.ef(e, F_FLAGS) as i32;
        if fl & FL_PARTIALGROUND != 0 { self.pr.set_ef(e, F_FLAGS, (fl & !FL_PARTIALGROUND) as f32); }
        self.pr.set_ei(e, F_GROUNDENTITY, self.pr.prog(tr.ent.unwrap_or(0)));
        if relink { self.link_edict(e, true); }
        true
    }

    /// PF_changeyaw: turn self toward ideal_yaw by at most yaw_speed.
    pub fn change_yaw(&mut self) {
        let ent = self.pr.ge(G_SELF);
        let current = anglemod(self.pr.ev(ent, F_ANGLES)[1]);
        let ideal = self.pr.ef(ent, F_IDEAL_YAW);
        let speed = self.pr.ef(ent, F_YAW_SPEED);
        if current == ideal { return; }
        let mut mv = ideal - current;
        if ideal > current { if mv >= 180.0 { mv -= 360.0; } } else if mv <= -180.0 { mv += 360.0; }
        if mv > 0.0 { if mv > speed { mv = speed; } } else if mv < -speed { mv = -speed; }
        let mut a = self.pr.ev(ent, F_ANGLES);
        a[1] = anglemod(current + mv);
        self.pr.set_ev(ent, F_ANGLES, a);
    }

    /// SV_StepDirection.
    fn step_direction(&mut self, e: usize, yaw: f32, dist: f32) -> bool {
        self.pr.set_ef(e, F_IDEAL_YAW, yaw);
        self.change_yaw();
        let yaw = (yaw as f64 * std::f64::consts::PI * 2.0 / 360.0) as f32;
        let mv = [((yaw as f64).cos() * dist as f64) as f32, ((yaw as f64).sin() * dist as f64) as f32, 0.0];
        let oldorigin = self.pr.ev(e, F_ORIGIN);
        if self.movestep(e, mv, false) {
            let delta = self.pr.ev(e, F_ANGLES)[YAW] - self.pr.ef(e, F_IDEAL_YAW);
            if delta > 45.0 && delta < 315.0 { self.pr.set_ev(e, F_ORIGIN, oldorigin); }
            self.link_edict(e, true);
            return true;
        }
        self.link_edict(e, true);
        false
    }

    /// SV_NewChaseDir.
    fn new_chase_dir(&mut self, actor: usize, enemy: usize, dist: f32) {
        let olddir = anglemod(((self.pr.ef(actor, F_IDEAL_YAW) / 45.0) as i32 * 45) as f32);
        let turnaround = anglemod(olddir - 180.0);
        let (ao, eo) = (self.pr.ev(actor, F_ORIGIN), self.pr.ev(enemy, F_ORIGIN));
        let deltax = eo[0] - ao[0];
        let deltay = eo[1] - ao[1];
        let mut d = [0.0f32; 3];
        d[1] = if deltax > 10.0 { 0.0 } else if deltax < -10.0 { 180.0 } else { DI_NODIR };
        d[2] = if deltay < -10.0 { 270.0 } else if deltay > 10.0 { 90.0 } else { DI_NODIR };
        if d[1] != DI_NODIR && d[2] != DI_NODIR {
            let tdir = if d[1] == 0.0 { if d[2] == 90.0 { 45.0 } else { 315.0 } } else if d[2] == 90.0 { 135.0 } else { 215.0 };
            if tdir != turnaround && self.step_direction(actor, tdir, dist) { return; }
        }
        if ((self.rand.next() & 3) & 1) != 0 || (deltay as i32).abs() > (deltax as i32).abs() {
            d.swap(1, 2);
        }
        if d[1] != DI_NODIR && d[1] != turnaround && self.step_direction(actor, d[1], dist) { return; }
        if d[2] != DI_NODIR && d[2] != turnaround && self.step_direction(actor, d[2], dist) { return; }
        if olddir != DI_NODIR && self.step_direction(actor, olddir, dist) { return; }
        if self.rand.next() & 1 != 0 {
            let mut tdir = 0.0f32;
            while tdir <= 315.0 {
                if tdir != turnaround && self.step_direction(actor, tdir, dist) { return; }
                tdir += 45.0;
            }
        } else {
            let mut tdir = 315.0f32;
            while tdir >= 0.0 {
                if tdir != turnaround && self.step_direction(actor, tdir, dist) { return; }
                tdir -= 45.0;
            }
        }
        if turnaround != DI_NODIR && self.step_direction(actor, turnaround, dist) { return; }
        self.pr.set_ef(actor, F_IDEAL_YAW, olddir);
        if !self.check_bottom(actor) {
            let fl = self.pr.ef(actor, F_FLAGS) as i32 | FL_PARTIALGROUND;
            self.pr.set_ef(actor, F_FLAGS, fl as f32);
        }
    }

    /// SV_CloseEnough.
    fn close_enough(&self, e: usize, goal: usize, dist: f32) -> bool {
        let (gmin, gmax) = (self.pr.ev(goal, F_ABSMIN), self.pr.ev(goal, F_ABSMAX));
        let (emin, emax) = (self.pr.ev(e, F_ABSMIN), self.pr.ev(e, F_ABSMAX));
        for i in 0..3 {
            if gmin[i] > emax[i] + dist { return false; }
            if gmax[i] < emin[i] - dist { return false; }
        }
        true
    }

    /// SV_MoveToGoal (builtin 67).
    pub fn move_to_goal(&mut self) {
        let ent = self.pr.ge(G_SELF);
        let goal = self.pr.ee(ent, F_GOALENTITY);
        let dist = self.pr.gf(OFS_PARM0);
        if self.pr.ef(ent, F_FLAGS) as i32 & (FL_ONGROUND | FL_FLY | FL_SWIM) == 0 {
            self.pr.set_gf(OFS_RETURN, 0.0);
            return;
        }
        if self.pr.ee(ent, F_ENEMY) != 0 && self.close_enough(ent, goal, dist) { return; }
        if (self.rand.next() & 3) == 1 || !self.step_direction(ent, self.pr.ef(ent, F_IDEAL_YAW), dist) {
            self.new_chase_dir(ent, goal, dist);
        }
    }
}
