//! pr_cmds.c: the 79 builtins QuakeC calls, numbered as in pr_builtin[].
use crate::defs::*;
use crate::mathlib::*;
use crate::progs::*;
use crate::server::*;
use crate::world::MOVE_NORMAL;

const M_PI: f64 = std::f64::consts::PI;
const P0: usize = OFS_PARM0;
const P1: usize = OFS_PARM0 + 3;
const P2: usize = OFS_PARM0 + 6;
const P3: usize = OFS_PARM0 + 9;
const P4: usize = OFS_PARM0 + 12;

const SVC_SPAWNSTATIC: u8 = 20;
const SVC_SPAWNSTATICSOUND: u8 = 29;

/// MSG_WriteCoord / MSG_WriteAngle encodings.
fn coord(f: f32) -> [u8; 2] { ((f * 8.0) as i32 as i16).to_le_bytes() }
fn angle(f: f32) -> u8 { (((f as i32) * 256 / 360) & 255) as u8 }

/// printf("%5.1f"): C rounds the exact binary value half to even, as Rust does.
fn f51(v: f32) -> String { format!("{:5.1}", v as f64) }

impl Server {
    fn ret_edict(&mut self, e: usize) { let p = self.pr.prog(e); self.pr.set_gi(OFS_RETURN, p); }
    fn gstr(&self, o: usize) -> String { self.pr.str_at(self.pr.gi(o)).to_string() }

    /// PF_VarString: the string parameters from `first` on, joined (256 max).
    fn var_string(&self, first: usize) -> String {
        let mut s = String::new();
        for i in first..self.argc { s.push_str(self.pr.str_at(self.pr.gi(P0 + i * 3))); }
        s.truncate(255);
        s
    }

    /// Append bytes to a message destination (MSG_BROADCAST/ONE/ALL/INIT).
    fn write(&mut self, dest: i32, to: usize, bytes: &[u8]) {
        if let Some(Event::Msg { dest: d, to: t, bytes: b }) = self.events.last_mut() {
            if *d == dest && *t == to { b.extend_from_slice(bytes); return; }
        }
        self.events.push(Event::Msg { dest, to, bytes: bytes.to_vec() });
    }

    /// WriteDest: where PF_Write* goes.
    fn write_dest(&mut self) -> Option<(i32, usize)> {
        let dest = self.pr.gf(P0) as i32;
        match dest {
            0 | 2 | 3 => Some((dest, 0)),
            1 => {
                let n = self.pr.ge(G_MSG_ENTITY);
                if n < 1 || n > self.maxclients { self.run_error("WriteDest: not a client"); return None; }
                Some((1, n))
            }
            _ => { self.run_error("WriteDest: bad destination"); None }
        }
    }
    fn write_msg(&mut self, bytes: &[u8]) {
        if let Some((d, t)) = self.write_dest() { self.write(d, t, bytes); }
    }

    /// SetMinMaxSize (rotate is always forced off in id's code).
    fn set_min_max_size(&mut self, e: usize, min: Vec3, max: Vec3) {
        for i in 0..3 { if min[i] > max[i] { self.run_error("backwards mins/maxs"); return; } }
        self.pr.set_ev(e, F_MINS, min);
        self.pr.set_ev(e, F_MAXS, max);
        self.pr.set_ev(e, F_SIZE, sub(max, min));
        self.link_edict(e, false);
    }

    /// PF_newcheckclient.
    fn new_check_client(&mut self, check: usize) -> usize {
        let mc = self.maxclients;
        let check = check.clamp(1, mc);
        let mut i = if check == mc { 1 } else { check + 1 };
        loop {
            if i == mc + 1 { i = 1; }
            if i == check { break; }
            if self.pr.meta[i].free || self.pr.ef(i, F_HEALTH) <= 0.0 || self.pr.ef(i, F_FLAGS) as i32 & FL_NOTARGET != 0 { i += 1; continue; }
            break;
        }
        let org = add(self.pr.ev(i, F_ORIGIN), self.pr.ev(i, F_VIEW_OFS));
        let leaf = self.bsp.point_in_leaf(org);
        self.checkpvs = self.bsp.leaf_pvs(leaf);
        i
    }

    /// Dispatch builtin number n.
    pub fn builtin(&mut self, n: usize) {
        let pr = &self.pr;
        match n {
            1 => { // makevectors
                let (f, r, u) = angle_vectors(pr.gv(P0));
                self.pr.set_gv(G_V_FORWARD, f);
                self.pr.set_gv(G_V_RIGHT, r);
                self.pr.set_gv(G_V_UP, u);
            }
            2 => { // setorigin
                let e = pr.ge(P0);
                let o = pr.gv(P1);
                self.pr.set_ev(e, F_ORIGIN, o);
                self.link_edict(e, false);
            }
            3 => { // setmodel
                let e = pr.ge(P0);
                let mofs = pr.gi(P1);
                let m = pr.str_at(mofs).to_string();
                let Some(i) = self.model_precache.iter().position(|x| *x == m) else { self.run_error(&format!("no precache: {m}")); return };
                self.pr.set_ei(e, F_MODEL, mofs);
                self.pr.set_ef(e, F_MODELINDEX, i as f32);
                let (mn, mx) = match &self.models[i] {
                    Some(Model::Brush(b)) => (self.bsp.models[*b].mins, self.bsp.models[*b].maxs),
                    Some(Model::Bounds(a, b)) => (*a, *b),
                    None => ([0.0; 3], [0.0; 3]),
                };
                self.set_min_max_size(e, mn, mx);
            }
            4 => { let (e, mn, mx) = (pr.ge(P0), pr.gv(P1), pr.gv(P2)); self.set_min_max_size(e, mn, mx); } // setsize
            6 => self.run_error("break"),
            7 => { let r = ((self.rand.next() & 0x7fff) as f32) / (0x7fff as f32); self.pr.set_gf(OFS_RETURN, r); } // random
            8 => { // sound
                let e = pr.ge(P0);
                let channel = pr.gf(P1) as i32;
                let sample = self.gstr(P2);
                let volume = (pr.gf(P3) * 255.0) as i32;
                let att = pr.gf(P4);
                self.start_sound(e, channel, &sample, volume, att);
            }
            9 => { // normalize
                let v = pr.gv(P0);
                let mut l: f32 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
                l = (l as f64).sqrt() as f32;
                let out = if l == 0.0 { [0.0; 3] } else { let il = 1.0 / l; [v[0] * il, v[1] * il, v[2] * il] };
                self.pr.set_gv(OFS_RETURN, out);
            }
            10 => { let s = self.var_string(0); self.run_error(&format!("Program error: {s}")); } // error
            11 => { // objerror
                let s = self.var_string(0);
                let e = pr.ge(G_SELF);
                self.ed_free(e);
                self.run_error(&format!("Program error: {s}"));
            }
            12 => { let v = pr.gv(P0); let l: f32 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]; self.pr.set_gf(OFS_RETURN, (l as f64).sqrt() as f32); } // vlen
            13 => { // vectoyaw
                let v = pr.gv(P0);
                let mut yaw = 0.0f32;
                if !(v[1] == 0.0 && v[0] == 0.0) {
                    yaw = ((v[1] as f64).atan2(v[0] as f64) * 180.0 / M_PI) as i32 as f32;
                    if yaw < 0.0 { yaw += 360.0; }
                }
                self.pr.set_gf(OFS_RETURN, yaw);
            }
            14 => { let e = self.ed_alloc(); self.ret_edict(e); } // spawn
            15 => { let e = pr.ge(P0); self.ed_free(e); } // remove
            16 => { // traceline
                let (v1, v2, nomon, ent) = (pr.gv(P0), pr.gv(P1), pr.gf(P2) as i32, pr.ge(P3));
                let tr = self.sv_move(v1, [0.0; 3], [0.0; 3], v2, nomon, Some(ent));
                let b = |x: bool| if x { 1.0 } else { 0.0 };
                self.pr.set_gf(G_TRACE_ALLSOLID, b(tr.allsolid));
                self.pr.set_gf(G_TRACE_STARTSOLID, b(tr.startsolid));
                self.pr.set_gf(G_TRACE_FRACTION, tr.fraction);
                self.pr.set_gf(G_TRACE_INWATER, b(tr.inwater));
                self.pr.set_gf(G_TRACE_INOPEN, b(tr.inopen));
                self.pr.set_gv(G_TRACE_ENDPOS, tr.endpos);
                self.pr.set_gv(G_TRACE_PLANE_NORMAL, tr.plane_normal);
                self.pr.set_gf(G_TRACE_PLANE_DIST, tr.plane_dist);
                let te = self.pr.prog(tr.ent.unwrap_or(0));
                self.pr.set_gi(G_TRACE_ENT, te);
            }
            17 => { // checkclient
                if self.time - self.lastchecktime >= 0.1 {
                    self.lastcheck = self.new_check_client(self.lastcheck);
                    self.lastchecktime = self.time;
                }
                let ent = self.lastcheck;
                if self.pr.meta[ent].free || self.pr.ef(ent, F_HEALTH) <= 0.0 { self.ret_edict(0); return; }
                let me = self.pr.ge(G_SELF);
                let view = add(self.pr.ev(me, F_ORIGIN), self.pr.ev(me, F_VIEW_OFS));
                let l = self.bsp.point_in_leaf(view) as i32 - 1;
                if l < 0 || self.checkpvs.get((l >> 3) as usize).copied().unwrap_or(0) & (1 << (l & 7)) == 0 { self.ret_edict(0); return; }
                self.ret_edict(ent);
            }
            18 => { // find
                let mut e = pr.ge(P0);
                let f = pr.gi(P1) as usize;
                let s = pr.cstr(pr.gi(P2)).to_vec();
                e += 1;
                while e < self.num_edicts {
                    if !self.pr.meta[e].free {
                        let t = self.pr.ei(e, f);
                        if t != 0 && self.pr.cstr(t) == s.as_slice() { self.ret_edict(e); return; }
                    }
                    e += 1;
                }
                self.ret_edict(0);
            }
            19 | 76 => { // precache_sound
                if !self.loading { self.run_error("PF_Precache_*: Precache can only be done in spawn functions"); return; }
                let s = self.gstr(P0);
                self.pr.set_gi(OFS_RETURN, self.pr.gi(P0));
                if s.as_bytes().first().map_or(true, |&c| c <= b' ') { self.run_error("Bad string"); return; }
                if self.sound_precache.iter().any(|x| *x == s) { return; }
                if self.sound_precache.len() >= MAX_SOUNDS { self.run_error("PF_precache_sound: overflow"); return; }
                self.sound_precache.push(s);
            }
            20 | 75 => { // precache_model
                if !self.loading { self.run_error("PF_Precache_*: Precache can only be done in spawn functions"); return; }
                let s = self.gstr(P0);
                self.pr.set_gi(OFS_RETURN, self.pr.gi(P0));
                if s.as_bytes().first().map_or(true, |&c| c <= b' ') { self.run_error("Bad string"); return; }
                self.precache_model(&s);
            }
            21 => { // stuffcmd
                let n = pr.ge(P0);
                if n < 1 || n > self.maxclients { self.run_error("Parm 0 not a client"); return; }
                let text = self.gstr(P1);
                self.events.push(Event::StuffCmd { client: n, text });
            }
            22 => { // findradius
                let org = pr.gv(P0);
                let rad = pr.gf(P1);
                let mut chain = 0usize;
                for i in 1..self.num_edicts {
                    if self.pr.meta[i].free || self.pr.ef(i, F_SOLID) as i32 == SOLID_NOT { continue; }
                    let (o, mn, mx) = (self.pr.ev(i, F_ORIGIN), self.pr.ev(i, F_MINS), self.pr.ev(i, F_MAXS));
                    let mut eorg = [0.0f32; 3];
                    for j in 0..3 { eorg[j] = (org[j] as f64 - (o[j] as f64 + (mn[j] + mx[j]) as f64 * 0.5)) as f32; }
                    if length(eorg) > rad { continue; }
                    let c = self.pr.prog(chain);
                    self.pr.set_ei(i, F_CHAIN, c);
                    chain = i;
                }
                self.ret_edict(chain);
            }
            23 => { let s = self.var_string(0); self.events.push(Event::Print { client: None, text: s }); } // bprint
            24 | 73 => { // sprint, centerprint
                let c = pr.ge(P0);
                let text = self.var_string(1);
                if c < 1 || c > self.maxclients { return; }
                self.events.push(if n == 73 { Event::CenterPrint { client: c, text } } else { Event::Print { client: Some(c), text } });
            }
            25 | 28 | 29 | 30 | 31 | 68 | 77 => { // dprint, coredump, traceon/off, eprint, precache_file(2)
                if n == 68 || n == 77 { self.pr.set_gi(OFS_RETURN, self.pr.gi(P0)); }
            }
            26 => { // ftos
                let v = pr.gf(P0);
                let s = if v == (v as i32) as f32 { format!("{}", v as i32) } else { f51(v) };
                let o = self.pr.temp_string(&s);
                self.pr.set_gi(OFS_RETURN, o);
            }
            27 => { // vtos
                let v = pr.gv(P0);
                let s = format!("'{} {} {}'", f51(v[0]), f51(v[1]), f51(v[2]));
                let o = self.pr.temp_string(&s);
                self.pr.set_gi(OFS_RETURN, o);
            }
            32 => { // walkmove
                let ent = pr.ge(G_SELF);
                let yaw = pr.gf(P0);
                let dist = pr.gf(P1);
                if pr.ef(ent, F_FLAGS) as i32 & (FL_ONGROUND | FL_FLY | FL_SWIM) == 0 { self.pr.set_gf(OFS_RETURN, 0.0); return; }
                let yaw = (yaw as f64 * M_PI * 2.0 / 360.0) as f32;
                let mv = [((yaw as f64).cos() * dist as f64) as f32, ((yaw as f64).sin() * dist as f64) as f32, 0.0];
                let oldself = self.pr.gi(G_SELF);
                let r = self.movestep(ent, mv, true);
                self.pr.set_gf(OFS_RETURN, if r { 1.0 } else { 0.0 });
                self.pr.set_gi(G_SELF, oldself);
            }
            34 => { // droptofloor
                let ent = pr.ge(G_SELF);
                let o = pr.ev(ent, F_ORIGIN);
                let end = [o[0], o[1], o[2] - 256.0];
                let tr = self.sv_move(o, self.pr.ev(ent, F_MINS), self.pr.ev(ent, F_MAXS), end, MOVE_NORMAL, Some(ent));
                if tr.fraction == 1.0 || tr.allsolid {
                    self.pr.set_gf(OFS_RETURN, 0.0);
                } else {
                    self.pr.set_ev(ent, F_ORIGIN, tr.endpos);
                    self.link_edict(ent, false);
                    let fl = self.pr.ef(ent, F_FLAGS) as i32 | FL_ONGROUND;
                    self.pr.set_ef(ent, F_FLAGS, fl as f32);
                    let g = self.pr.prog(tr.ent.unwrap_or(0));
                    self.pr.set_ei(ent, F_GROUNDENTITY, g);
                    self.pr.set_gf(OFS_RETURN, 1.0);
                }
            }
            35 => { // lightstyle
                let style = pr.gf(P0) as usize;
                let val = self.gstr(P1);
                if style < MAX_LIGHTSTYLES { self.lightstyles[style] = val.clone(); }
                if self.active && !self.loading { self.events.push(Event::LightStyle { style, value: val }); }
            }
            36 => { let f = pr.gf(P0); let r = if f > 0.0 { (f as f64 + 0.5) as i32 } else { (f as f64 - 0.5) as i32 }; self.pr.set_gf(OFS_RETURN, r as f32); } // rint
            37 => { let f = pr.gf(P0); self.pr.set_gf(OFS_RETURN, (f as f64).floor() as f32); } // floor
            38 => { let f = pr.gf(P0); self.pr.set_gf(OFS_RETURN, (f as f64).ceil() as f32); } // ceil
            40 => { let e = pr.ge(P0); let r = self.check_bottom(e); self.pr.set_gf(OFS_RETURN, if r { 1.0 } else { 0.0 }); } // checkbottom
            41 => { let v = pr.gv(P0); let c = self.point_contents(v); self.pr.set_gf(OFS_RETURN, c as f32); } // pointcontents
            43 => { let f = pr.gf(P0); self.pr.set_gf(OFS_RETURN, f.abs()); } // fabs
            44 => self.pf_aim(),
            45 => { let s = self.gstr(P0); let v = self.cvars.v(&s); self.pr.set_gf(OFS_RETURN, v); } // cvar
            46 => { let text = self.gstr(P0); self.events.push(Event::LocalCmd { text }); } // localcmd
            47 => { // nextent
                let mut i = pr.ge(P0);
                loop {
                    i += 1;
                    if i >= self.num_edicts { self.ret_edict(0); return; }
                    if !self.pr.meta[i].free { self.ret_edict(i); return; }
                }
            }
            48 => { // particle
                let (org, dir, color, count) = (pr.gv(P0), pr.gv(P1), pr.gf(P2) as i32, pr.gf(P3) as i32);
                self.events.push(Event::Particle { org, dir, color, count });
            }
            49 => self.change_yaw(),
            51 => { // vectoangles
                let v = pr.gv(P0);
                let (yaw, pitch);
                if v[1] == 0.0 && v[0] == 0.0 {
                    yaw = 0.0;
                    pitch = if v[2] > 0.0 { 90.0 } else { 270.0 };
                } else {
                    let mut y = ((v[1] as f64).atan2(v[0] as f64) * 180.0 / M_PI) as i32 as f32;
                    if y < 0.0 { y += 360.0; }
                    let forward = ((v[0] * v[0] + v[1] * v[1]) as f64).sqrt() as f32;
                    let mut p = ((v[2] as f64).atan2(forward as f64) * 180.0 / M_PI) as i32 as f32;
                    if p < 0.0 { p += 360.0; }
                    yaw = y;
                    pitch = p;
                }
                self.pr.set_gv(OFS_RETURN, [pitch, yaw, 0.0]);
            }
            52 => { let v = pr.gf(P1) as i32 as u8; self.write_msg(&[v]); } // WriteByte
            53 => { let v = pr.gf(P1) as i32 as i8 as u8; self.write_msg(&[v]); } // WriteChar
            54 => { let v = (pr.gf(P1) as i32 as i16).to_le_bytes(); self.write_msg(&v); } // WriteShort
            55 => { let v = (pr.gf(P1) as i32).to_le_bytes(); self.write_msg(&v); } // WriteLong
            56 => { let v = coord(pr.gf(P1)); self.write_msg(&v); } // WriteCoord
            57 => { let v = angle(pr.gf(P1)); self.write_msg(&[v]); } // WriteAngle
            58 => { let mut v = pr.cstr(pr.gi(P1)).to_vec(); v.push(0); self.write_msg(&v); } // WriteString
            59 => { let v = (pr.ge(P1) as i16).to_le_bytes(); self.write_msg(&v); } // WriteEntity
            67 => self.move_to_goal(),
            69 => { // makestatic
                let e = pr.ge(P0);
                let m = pr.estr(e, F_MODEL).to_string();
                let mi = self.model_precache.iter().position(|x| *x == m).unwrap_or(0) as u8;
                let mut b = vec![SVC_SPAWNSTATIC, mi, pr.ef(e, F_FRAME) as i32 as u8, pr.ef(e, F_COLORMAP) as i32 as u8, pr.ef(e, F_SKIN) as i32 as u8];
                let (o, a) = (pr.ev(e, F_ORIGIN), pr.ev(e, F_ANGLES));
                for i in 0..3 { b.extend_from_slice(&coord(o[i])); b.push(angle(a[i])); }
                self.write(3, 0, &b);
                self.ed_free(e);
            }
            70 => { // changelevel
                if self.changelevel_issued { return; }
                self.changelevel_issued = true;
                let map = self.gstr(P0);
                self.events.push(Event::ChangeLevel { map });
            }
            72 => { let (k, v) = (self.gstr(P0), self.gstr(P1)); self.cvars.set(&k, &v); } // cvar_set
            74 => { // ambientsound
                let pos = pr.gv(P0);
                let samp = self.gstr(P1);
                let (vol, att) = (pr.gf(P2), pr.gf(P3));
                let Some(sn) = self.sound_precache.iter().position(|x| *x == samp) else { return };
                let mut b = vec![SVC_SPAWNSTATICSOUND];
                for i in 0..3 { b.extend_from_slice(&coord(pos[i])); }
                b.extend_from_slice(&[sn as u8, (vol * 255.0) as i32 as u8, (att * 64.0) as i32 as u8]);
                self.write(3, 0, &b);
                self.events.push(Event::AmbientSound { pos, sample: samp, volume: (vol * 255.0) as i32, attenuation: att });
            }
            78 => { // setspawnparms
                let i = pr.ge(P0);
                if i < 1 || i > self.maxclients { self.run_error("Entity is not a client"); return; }
                for k in 0..NUM_SPAWN_PARMS { let v = self.clients[i - 1].spawn_parms[k]; self.pr.set_gf(G_PARM1 + k, v); }
            }
            _ => self.run_error("unimplemented bulitin"),
        }
    }

    /// PF_aim: autoaim toward the best target in a cone (sv_aim).
    fn pf_aim(&mut self) {
        let ent = self.pr.ge(P0);
        let mut start = self.pr.ev(ent, F_ORIGIN);
        start[2] += 20.0;
        let fwd = self.pr.gv(G_V_FORWARD);
        let mut dir = fwd;
        let mut end = ma(start, 2048.0, dir);
        let tr = self.sv_move(start, [0.0; 3], [0.0; 3], end, MOVE_NORMAL, Some(ent));
        let teamplay = self.cvars.v("teamplay");
        let team = self.pr.ef(ent, F_TEAM);
        if let Some(te) = tr.ent {
            if self.pr.ef(te, F_TAKEDAMAGE) as i32 == DAMAGE_AIM && (teamplay == 0.0 || team <= 0.0 || team != self.pr.ef(te, F_TEAM)) {
                self.pr.set_gv(OFS_RETURN, fwd);
                return;
            }
        }
        let bestdir = dir;
        let mut bestdist = self.cvars.v("sv_aim");
        let mut bestent = None;
        for check in 1..self.num_edicts {
            if self.pr.ef(check, F_TAKEDAMAGE) as i32 != DAMAGE_AIM { continue; }
            if check == ent { continue; }
            if teamplay != 0.0 && team > 0.0 && team == self.pr.ef(check, F_TEAM) { continue; }
            let (o, mn, mx) = (self.pr.ev(check, F_ORIGIN), self.pr.ev(check, F_MINS), self.pr.ev(check, F_MAXS));
            for j in 0..3 { end[j] = (o[j] as f64 + 0.5 * (mn[j] + mx[j]) as f64) as f32; }
            dir = sub(end, start);
            normalize(&mut dir);
            let dist = dot(dir, fwd);
            if dist < bestdist { continue; }
            let tr = self.sv_move(start, [0.0; 3], [0.0; 3], end, MOVE_NORMAL, Some(ent));
            if tr.ent == Some(check) {
                bestdist = dist;
                bestent = Some(check);
            }
        }
        if let Some(b) = bestent {
            let dir = sub(self.pr.ev(b, F_ORIGIN), self.pr.ev(ent, F_ORIGIN));
            let dist = dot(dir, fwd);
            let mut end = scale(fwd, dist);
            end[2] = dir[2];
            normalize(&mut end);
            self.pr.set_gv(OFS_RETURN, end);
        } else {
            self.pr.set_gv(OFS_RETURN, bestdir);
        }
    }
}
