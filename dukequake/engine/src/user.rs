//! sv_user.c: the player's movement from their command (SV_ClientThink and
//! friends), and SV_SetIdealPitch. V_CalcRoll is view.c's.
use crate::defs::*;
use crate::mathlib::*;
use crate::server::*;
use crate::world::MOVE_NOMONSTERS;

const MAX_FORWARD: usize = 6;
const ON_EPSILON: f64 = 0.1;

/// The statics sv_user.c shares between its functions.
struct Mv { wishdir: Vec3, wishspeed: f32, onground: bool, cmd: UserCmd }

impl Server {
    /// SV_SetIdealPitch: look down slopes when walking.
    pub fn set_ideal_pitch(&mut self, p: usize) {
        if self.pr.ef(p, F_FLAGS) as i32 & FL_ONGROUND == 0 { return; }
        let angleval = (self.pr.ev(p, F_ANGLES)[YAW] as f64 * std::f64::consts::PI * 2.0 / 360.0) as f32;
        let sinval = (angleval as f64).sin() as f32;
        let cosval = (angleval as f64).cos() as f32;
        let (o, vo) = (self.pr.ev(p, F_ORIGIN), self.pr.ev(p, F_VIEW_OFS));
        let mut z = [0.0f32; MAX_FORWARD];
        for i in 0..MAX_FORWARD {
            let k = (i + 3) as f32;
            let top = [o[0] + cosval * k * 12.0, o[1] + sinval * k * 12.0, o[2] + vo[2]];
            let bottom = [top[0], top[1], top[2] - 160.0];
            let tr = self.sv_move(top, [0.0; 3], [0.0; 3], bottom, MOVE_NOMONSTERS, Some(p));
            if tr.allsolid || tr.fraction == 1.0 { return; }
            z[i] = top[2] + tr.fraction * (bottom[2] - top[2]);
        }
        let (mut dir, mut steps) = (0i32, 0);
        for j in 1..MAX_FORWARD {
            let step = (z[j] - z[j - 1]) as i32;
            if (step as f64) > -ON_EPSILON && (step as f64) < ON_EPSILON { continue; }
            if dir != 0 && ((step - dir) as f64 > ON_EPSILON || ((step - dir) as f64) < -ON_EPSILON) { return; }
            steps += 1;
            dir = step;
        }
        if dir == 0 {
            self.pr.set_ef(p, F_IDEALPITCH, 0.0);
            return;
        }
        if steps < 2 { return; }
        let v = -(dir as f32) * self.cvars.v("sv_idealpitchscale");
        self.pr.set_ef(p, F_IDEALPITCH, v);
    }

    /// V_CalcRoll.
    fn calc_roll(&self, angles: Vec3, velocity: Vec3) -> f32 {
        let (_, right, _) = angle_vectors(angles);
        let mut side = dot(velocity, right);
        let sign = if side < 0.0 { -1.0 } else { 1.0 };
        side = side.abs();
        let value = self.cvars.v("cl_rollangle");
        let rs = self.cvars.v("cl_rollspeed");
        side = if side < rs { side * value / rs } else { value };
        side * sign
    }

    /// SV_UserFriction.
    fn user_friction(&mut self, p: usize) {
        let mut vel = self.pr.ev(p, F_VELOCITY);
        let speed = ((vel[0] * vel[0] + vel[1] * vel[1]) as f64).sqrt() as f32;
        if speed == 0.0 { return; }
        let o = self.pr.ev(p, F_ORIGIN);
        let start = [o[0] + vel[0] / speed * 16.0, o[1] + vel[1] / speed * 16.0, o[2] + self.pr.ev(p, F_MINS)[2]];
        let stop = [start[0], start[1], start[2] - 34.0];
        let trace = self.sv_move(start, [0.0; 3], [0.0; 3], stop, MOVE_NOMONSTERS, Some(p));
        let friction = if trace.fraction == 1.0 { self.cvars.v("sv_friction") * self.cvars.v("edgefriction") } else { self.cvars.v("sv_friction") };
        let stopspeed = self.cvars.v("sv_stopspeed");
        let control = if speed < stopspeed { stopspeed } else { speed };
        let mut newspeed = (speed as f64 - self.frametime * control as f64 * friction as f64) as f32;
        if newspeed < 0.0 { newspeed = 0.0; }
        newspeed /= speed;
        for v in vel.iter_mut() { *v *= newspeed; }
        self.pr.set_ev(p, F_VELOCITY, vel);
    }

    /// SV_Accelerate.
    fn accelerate(&mut self, p: usize, m: &Mv) {
        let mut vel = self.pr.ev(p, F_VELOCITY);
        let currentspeed = dot(vel, m.wishdir);
        let addspeed = m.wishspeed - currentspeed;
        if addspeed <= 0.0 { return; }
        let mut accelspeed = (self.cvars.v("sv_accelerate") as f64 * self.frametime * m.wishspeed as f64) as f32;
        if accelspeed > addspeed { accelspeed = addspeed; }
        for i in 0..3 { vel[i] += accelspeed * m.wishdir[i]; }
        self.pr.set_ev(p, F_VELOCITY, vel);
    }

    /// SV_AirAccelerate (note: uses wishspeed, not wishspd, as id's does).
    fn air_accelerate(&mut self, p: usize, m: &Mv, mut wishveloc: Vec3) {
        let mut vel = self.pr.ev(p, F_VELOCITY);
        let mut wishspd = normalize(&mut wishveloc);
        if wishspd > 30.0 { wishspd = 30.0; }
        let currentspeed = dot(vel, wishveloc);
        let addspeed = wishspd - currentspeed;
        if addspeed <= 0.0 { return; }
        let mut accelspeed = ((self.cvars.v("sv_accelerate") * m.wishspeed) as f64 * self.frametime) as f32;
        if accelspeed > addspeed { accelspeed = addspeed; }
        for i in 0..3 { vel[i] += accelspeed * wishveloc[i]; }
        self.pr.set_ev(p, F_VELOCITY, vel);
    }

    /// DropPunchAngle.
    fn drop_punch_angle(&mut self, p: usize) {
        let mut pa = self.pr.ev(p, F_PUNCHANGLE);
        let mut len = normalize(&mut pa);
        len = (len as f64 - 10.0 * self.frametime) as f32;
        if len < 0.0 { len = 0.0; }
        self.pr.set_ev(p, F_PUNCHANGLE, scale(pa, len));
    }

    /// SV_WaterMove.
    fn water_move(&mut self, p: usize, m: &Mv) {
        let (forward, right, _) = angle_vectors(self.pr.ev(p, F_V_ANGLE));
        let c = m.cmd;
        let mut wishvel = [0.0f32; 3];
        for i in 0..3 { wishvel[i] = forward[i] * c.forwardmove + right[i] * c.sidemove; }
        if c.forwardmove == 0.0 && c.sidemove == 0.0 && c.upmove == 0.0 { wishvel[2] -= 60.0; } else { wishvel[2] += c.upmove; }
        let mut wishspeed = length(wishvel);
        let maxspeed = self.cvars.v("sv_maxspeed");
        if wishspeed > maxspeed {
            wishvel = scale(wishvel, maxspeed / wishspeed);
            wishspeed = maxspeed;
        }
        wishspeed = (wishspeed as f64 * 0.7) as f32;
        let mut vel = self.pr.ev(p, F_VELOCITY);
        let speed = length(vel);
        let newspeed;
        if speed != 0.0 {
            let mut ns = (speed as f64 - self.frametime * speed as f64 * self.cvars.v("sv_friction") as f64) as f32;
            if ns < 0.0 { ns = 0.0; }
            vel = scale(vel, ns / speed);
            newspeed = ns;
        } else {
            newspeed = 0.0;
        }
        self.pr.set_ev(p, F_VELOCITY, vel);
        if wishspeed == 0.0 { return; }
        let addspeed = wishspeed - newspeed;
        if addspeed <= 0.0 { return; }
        normalize(&mut wishvel);
        let mut accelspeed = ((self.cvars.v("sv_accelerate") * wishspeed) as f64 * self.frametime) as f32;
        if accelspeed > addspeed { accelspeed = addspeed; }
        for i in 0..3 { vel[i] += accelspeed * wishvel[i]; }
        self.pr.set_ev(p, F_VELOCITY, vel);
    }

    /// SV_WaterJump.
    fn water_jump(&mut self, p: usize) {
        if self.time > self.pr.ef(p, F_TELEPORT_TIME) as f64 || self.pr.ef(p, F_WATERLEVEL) == 0.0 {
            let fl = self.pr.ef(p, F_FLAGS) as i32 & !FL_WATERJUMP;
            self.pr.set_ef(p, F_FLAGS, fl as f32);
            self.pr.set_ef(p, F_TELEPORT_TIME, 0.0);
        }
        let md = self.pr.ev(p, F_MOVEDIR);
        let mut v = self.pr.ev(p, F_VELOCITY);
        v[0] = md[0];
        v[1] = md[1];
        self.pr.set_ev(p, F_VELOCITY, v);
    }

    /// SV_AirMove.
    fn air_move(&mut self, p: usize, m: &mut Mv) {
        let (forward, right, _) = angle_vectors(self.pr.ev(p, F_ANGLES));
        let mut fmove = m.cmd.forwardmove;
        let smove = m.cmd.sidemove;
        if self.time < self.pr.ef(p, F_TELEPORT_TIME) as f64 && fmove < 0.0 { fmove = 0.0; }
        let mut wishvel = [0.0f32; 3];
        for i in 0..3 { wishvel[i] = forward[i] * fmove + right[i] * smove; }
        let mt = self.pr.ef(p, F_MOVETYPE) as i32;
        wishvel[2] = if mt != MOVETYPE_WALK { m.cmd.upmove } else { 0.0 };
        m.wishdir = wishvel;
        m.wishspeed = normalize(&mut m.wishdir);
        let maxspeed = self.cvars.v("sv_maxspeed");
        if m.wishspeed > maxspeed {
            wishvel = scale(wishvel, maxspeed / m.wishspeed);
            m.wishspeed = maxspeed;
        }
        if mt == MOVETYPE_NOCLIP {
            self.pr.set_ev(p, F_VELOCITY, wishvel);
        } else if m.onground {
            self.user_friction(p);
            self.accelerate(p, m);
        } else {
            self.air_accelerate(p, m, wishvel);
        }
    }

    /// SV_ClientThink.
    pub fn client_think(&mut self, p: usize, n: usize) {
        if self.pr.ef(p, F_MOVETYPE) as i32 == MOVETYPE_NONE { return; }
        let mut m = Mv { wishdir: [0.0; 3], wishspeed: 0.0, onground: self.pr.ef(p, F_FLAGS) as i32 & FL_ONGROUND != 0, cmd: self.clients[n].cmd };
        self.drop_punch_angle(p);
        if self.pr.ef(p, F_HEALTH) <= 0.0 { return; }
        let v_angle = add(self.pr.ev(p, F_V_ANGLE), self.pr.ev(p, F_PUNCHANGLE));
        let mut angles = self.pr.ev(p, F_ANGLES);
        angles[ROLL] = self.calc_roll(angles, self.pr.ev(p, F_VELOCITY)) * 4.0;
        if self.pr.ef(p, F_FIXANGLE) == 0.0 {
            angles[PITCH] = -v_angle[PITCH] / 3.0;
            angles[YAW] = v_angle[YAW];
        }
        self.pr.set_ev(p, F_ANGLES, angles);
        if self.pr.ef(p, F_FLAGS) as i32 & FL_WATERJUMP != 0 {
            self.water_jump(p);
            return;
        }
        if self.pr.ef(p, F_WATERLEVEL) >= 2.0 && self.pr.ef(p, F_MOVETYPE) as i32 != MOVETYPE_NOCLIP {
            self.water_move(p, &m);
            return;
        }
        self.air_move(p, &mut m);
    }
}
