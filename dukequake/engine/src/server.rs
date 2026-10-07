//! The server: pr_exec.c (the QuakeC interpreter), pr_edict.c (edict
//! allocation and map entity parsing), sv_main.c (SV_SpawnServer, client
//! connect) and host.c's server frame, ported from id's GPL source.
//! Floating point follows the C: `float` fields and globals are f32, while
//! sv.time and host_frametime are double, so mixed expressions are computed
//! in f64 and stored back to f32 exactly where C would.
use crate::bsp::Bsp;
use crate::defs::*;
use crate::mathlib::*;
use crate::pak::Pak;
use crate::progs::*;
use crate::world::AreaNode;
use std::collections::HashMap;

pub const MOVETYPE_NONE: i32 = 0;
pub const MOVETYPE_ANGLENOCLIP: i32 = 1;
pub const MOVETYPE_ANGLECLIP: i32 = 2;
pub const MOVETYPE_WALK: i32 = 3;
pub const MOVETYPE_STEP: i32 = 4;
pub const MOVETYPE_FLY: i32 = 5;
pub const MOVETYPE_TOSS: i32 = 6;
pub const MOVETYPE_PUSH: i32 = 7;
pub const MOVETYPE_NOCLIP: i32 = 8;
pub const MOVETYPE_FLYMISSILE: i32 = 9;
pub const MOVETYPE_BOUNCE: i32 = 10;

pub const SOLID_NOT: i32 = 0;
pub const SOLID_TRIGGER: i32 = 1;
pub const SOLID_BBOX: i32 = 2;
pub const SOLID_SLIDEBOX: i32 = 3;
pub const SOLID_BSP: i32 = 4;

pub const DAMAGE_NO: i32 = 0;
pub const DAMAGE_YES: i32 = 1;
pub const DAMAGE_AIM: i32 = 2;

pub const FL_FLY: i32 = 1;
pub const FL_SWIM: i32 = 2;
pub const FL_CONVEYOR: i32 = 4;
pub const FL_CLIENT: i32 = 8;
pub const FL_INWATER: i32 = 16;
pub const FL_MONSTER: i32 = 32;
pub const FL_GODMODE: i32 = 64;
pub const FL_NOTARGET: i32 = 128;
pub const FL_ITEM: i32 = 256;
pub const FL_ONGROUND: i32 = 512;
pub const FL_PARTIALGROUND: i32 = 1024;
pub const FL_WATERJUMP: i32 = 2048;
pub const FL_JUMPRELEASED: i32 = 4096;

pub const EF_MUZZLEFLASH: i32 = 2;

const SPAWNFLAG_NOT_EASY: i32 = 256;
const SPAWNFLAG_NOT_MEDIUM: i32 = 512;
const SPAWNFLAG_NOT_HARD: i32 = 1024;
const SPAWNFLAG_NOT_DEATHMATCH: i32 = 2048;

const MAX_STACK_DEPTH: usize = 32;
const LOCALSTACK_SIZE: usize = 2048;
pub const NUM_SPAWN_PARMS: usize = 16;
pub const MAX_MODELS: usize = 256;
pub const MAX_SOUNDS: usize = 256;
pub const MAX_LIGHTSTYLES: usize = 64;

/// What sv.models[i] is: enough of each model for the server's needs.
#[derive(Clone, Debug)]
pub enum Model {
    /// A brush model of the current map ("maps/x.bsp" is 0, "*i" is i).
    Brush(usize),
    /// Any other model: its bounds (alias models are ±16; sprites, their
    /// size; separate .bsp files such as the health boxes, their world bounds).
    Bounds(Vec3, Vec3),
}

/// usercmd_t, as the server reads it off the wire (angles already quantized).
#[derive(Clone, Copy, Debug, Default)]
pub struct UserCmd {
    pub angles: Vec3,
    pub forwardmove: f32,
    pub sidemove: f32,
    pub upmove: f32,
    pub buttons: u8,
    pub impulse: u8,
}

#[derive(Clone, Debug, Default)]
pub struct Client {
    pub active: bool,
    pub spawned: bool,
    pub cmd: UserCmd,
    pub spawn_parms: [f32; NUM_SPAWN_PARMS],
    pub name: String,
    pub colors: i32,
    pub edict: usize,
}

/// glibc's rand() (TYPE_3 additive feedback), so a run with the same seed
/// draws the same numbers as id's code compiled on Linux.
#[derive(Clone, Debug)]
pub struct Rand { r: [i32; 31], f: usize, b: usize }
impl Rand {
    pub fn new(seed: u32) -> Rand {
        let mut r = [0i32; 31];
        r[0] = if seed == 0 { 1 } else { seed as i32 };
        for i in 1..31 {
            let w = r[i - 1] as i64;
            let (hi, lo) = (w / 127773, w % 127773);
            let mut v = 16807 * lo - 2836 * hi;
            if v < 0 { v += 2147483647; }
            r[i] = v as i32;
        }
        let mut s = Rand { r, f: 3, b: 0 };
        for _ in 0..310 { s.next(); }
        s
    }
    pub fn next(&mut self) -> i32 {
        self.r[self.f] = self.r[self.f].wrapping_add(self.r[self.b]);
        let out = ((self.r[self.f] as u32) >> 1) as i32;
        self.f += 1;
        if self.f >= 31 { self.f = 0; self.b += 1; } else { self.b += 1; if self.b >= 31 { self.b = 0; } }
        out
    }
}

/// What the server tells the page: sounds, prints and the raw message bytes
/// QuakeC writes (temp entities, intermission, ...), in order.
#[derive(Clone, Debug)]
pub enum Event {
    Sound { ent: usize, channel: i32, sample: String, volume: i32, attenuation: f32 },
    AmbientSound { pos: Vec3, sample: String, volume: i32, attenuation: f32 },
    Print { client: Option<usize>, text: String },
    CenterPrint { client: usize, text: String },
    StuffCmd { client: usize, text: String },
    LightStyle { style: usize, value: String },
    Particle { org: Vec3, dir: Vec3, color: i32, count: i32 },
    /// WriteByte & co.: dest 0 broadcast, 1 one (msg_entity), 2 all reliable, 3 init.
    Msg { dest: i32, to: usize, bytes: Vec<u8> },
    ChangeLevel { map: String },
    LocalCmd { text: String },
    Error { text: String },
}

pub struct Cvars { pub vars: HashMap<String, String> }
impl Cvars {
    pub fn new() -> Cvars {
        let mut vars = HashMap::new();
        for (k, v) in [
            ("sv_friction", "4"), ("sv_stopspeed", "100"), ("sv_gravity", "800"), ("sv_maxvelocity", "2000"),
            ("sv_nostep", "0"), ("sv_maxspeed", "320"), ("sv_accelerate", "10"), ("edgefriction", "2"),
            ("sv_idealpitchscale", "0.8"), ("sv_aim", "0.93"), ("cl_rollspeed", "200"), ("cl_rollangle", "2.0"),
            ("skill", "1"), ("deathmatch", "0"), ("coop", "0"), ("teamplay", "0"), ("fraglimit", "0"),
            ("timelimit", "0"), ("samelevel", "0"), ("noexit", "0"), ("registered", "0"), ("temp1", "0"),
            ("pausable", "1"), ("nomonsters", "0"), ("hostname", "UNNAMED"),
            ("saved1", "0"), ("saved2", "0"), ("saved3", "0"), ("saved4", "0"),
            ("scratch1", "0"), ("scratch2", "0"), ("scratch3", "0"), ("scratch4", "0"),
        ] { vars.insert(k.to_string(), v.to_string()); }
        Cvars { vars }
    }
    /// Cvar_VariableValue.
    pub fn v(&self, name: &str) -> f32 { self.vars.get(name).map(|s| atof(s)).unwrap_or(0.0) }
    pub fn s(&self, name: &str) -> &str { self.vars.get(name).map(|s| s.as_str()).unwrap_or("") }
    /// Cvar_Set (only existing variables, as in Quake).
    pub fn set(&mut self, name: &str, value: &str) { if let Some(v) = self.vars.get_mut(name) { *v = value.to_string(); } }
}
impl Default for Cvars { fn default() -> Self { Self::new() } }

pub struct Server {
    pub pak: Pak,
    pub pr: Progs,
    pub bsp: Bsp,
    pub name: String,
    pub areanodes: Vec<AreaNode>,
    /// sv.time (double).
    pub time: f64,
    /// host_frametime (double).
    pub frametime: f64,
    pub num_edicts: usize,
    pub maxclients: usize,
    pub clients: Vec<Client>,
    pub model_precache: Vec<String>,
    pub models: Vec<Option<Model>>,
    pub sound_precache: Vec<String>,
    pub lightstyles: Vec<String>,
    pub loading: bool,
    pub active: bool,
    pub paused: bool,
    pub cvars: Cvars,
    pub rand: Rand,
    pub events: Vec<Event>,
    pub serverflags: f32,
    pub current_skill: i32,
    pub changelevel_issued: bool,
    // sv_main / pr_cmds statics
    pub lastcheck: usize,
    pub lastchecktime: f64,
    pub checkpvs: Vec<u8>,
    /// Field offsets the engine looks up by name (GetEdictFieldValue).
    pub f_gravity: Option<usize>,
    pub f_items2: Option<usize>,
    pub error: Option<String>,
    // pr_exec state
    stack: Vec<(i32, usize)>,
    localstack: Vec<u32>,
    xfunction: usize,
    xstatement: i32,
    pub argc: usize,
}

impl Server {
    /// A server for a PAK; call spawn_server to load a map.
    pub fn new(pak: Pak) -> Result<Server, String> {
        let pr = Progs::load(pak.get("progs.dat").ok_or("progs.dat not in pak")?)?;
        Ok(Server {
            pak, pr, bsp: Bsp::empty(), name: String::new(), areanodes: Vec::new(), time: 0.0, frametime: 0.1,
            num_edicts: 0, maxclients: 1, clients: vec![Client::default()], model_precache: Vec::new(), models: Vec::new(),
            sound_precache: Vec::new(), lightstyles: vec![String::new(); MAX_LIGHTSTYLES], loading: false, active: false,
            paused: false, cvars: Cvars::new(), rand: Rand::new(1), events: Vec::new(), serverflags: 0.0, current_skill: 1, changelevel_issued: false,
            lastcheck: 0, lastchecktime: 0.0, checkpvs: Vec::new(), f_gravity: None, f_items2: None, error: None,
            stack: Vec::new(), localstack: Vec::new(), xfunction: 0, xstatement: 0, argc: 0,
        })
    }

    pub fn model_brush(&self, mi: usize) -> Option<usize> {
        match self.models.get(mi) { Some(Some(Model::Brush(m))) => Some(*m), _ => None }
    }

    // ================================================================ pr_exec.c

    /// PR_RunError / Host_Error: stop the program and the server.
    pub fn run_error(&mut self, msg: &str) {
        if self.error.is_none() {
            let text = format!("{} in {}: {}", msg, self.pr.fn_name(self.xfunction), self.xstatement);
            self.events.push(Event::Error { text: text.clone() });
            self.error = Some(text);
        }
        self.active = false;
    }

    fn enter_function(&mut self, f: usize) -> i32 {
        self.stack.push((self.xstatement, self.xfunction));
        if self.stack.len() >= MAX_STACK_DEPTH { self.run_error("stack overflow"); }
        let func = &self.pr.functions[f];
        let (c, ps) = (func.locals.max(0) as usize, func.parm_start as usize);
        if self.localstack.len() + c > LOCALSTACK_SIZE { self.run_error("PR_ExecuteProgram: locals stack overflow"); }
        for i in 0..c { self.localstack.push(self.pr.globals[ps + i]); }
        let mut o = ps;
        let func = &self.pr.functions[f];
        for i in 0..func.numparms.max(0) as usize {
            for j in 0..func.parm_size[i] as usize {
                self.pr.globals[o] = self.pr.globals[OFS_PARM0 + i * 3 + j];
                o += 1;
            }
        }
        self.xfunction = f;
        self.pr.functions[f].first_statement - 1
    }

    fn leave_function(&mut self) -> i32 {
        let func = &self.pr.functions[self.xfunction];
        let (c, ps) = (func.locals.max(0) as usize, func.parm_start as usize);
        let used = self.localstack.len() - c;
        for i in 0..c { self.pr.globals[ps + i] = self.localstack[used + i]; }
        self.localstack.truncate(used);
        let (s, f) = self.stack.pop().expect("prog stack underflow");
        self.xfunction = f;
        s
    }

    /// PR_ExecuteProgram.
    pub fn execute(&mut self, fnum: i32) {
        if self.error.is_some() { return; }
        if fnum <= 0 || fnum as usize >= self.pr.functions.len() {
            self.run_error("PR_ExecuteProgram: NULL function");
            return;
        }
        let mut runaway = 100000;
        let exitdepth = self.stack.len();
        let mut s = self.enter_function(fnum as usize);
        loop {
            if self.error.is_some() {
                // Host_Error longjmps out: drop the whole program stack.
                self.stack.clear();
                self.localstack.clear();
                return;
            }
            s += 1;
            let st = self.pr.statements[s as usize];
            let (a, b, c) = (st.a as u16 as usize, st.b as u16 as usize, st.c as u16 as usize);
            runaway -= 1;
            if runaway == 0 { self.run_error("runaway loop error"); continue; }
            self.xstatement = s;
            let g = &mut self.pr.globals;
            let f = |g: &Vec<u32>, i: usize| f32::from_bits(g[i]);
            let bf = |v: bool| if v { 1.0f32.to_bits() } else { 0 };
            match st.op {
                OP_ADD_F => g[c] = (f(g, a) + f(g, b)).to_bits(),
                OP_ADD_V => for i in 0..3 { g[c + i] = (f(g, a + i) + f(g, b + i)).to_bits() },
                OP_SUB_F => g[c] = (f(g, a) - f(g, b)).to_bits(),
                OP_SUB_V => for i in 0..3 { g[c + i] = (f(g, a + i) - f(g, b + i)).to_bits() },
                OP_MUL_F => g[c] = (f(g, a) * f(g, b)).to_bits(),
                OP_MUL_V => g[c] = (f(g, a) * f(g, b) + f(g, a + 1) * f(g, b + 1) + f(g, a + 2) * f(g, b + 2)).to_bits(),
                OP_MUL_FV => { let k = f(g, a); for i in 0..3 { g[c + i] = (k * f(g, b + i)).to_bits() } }
                OP_MUL_VF => { let k = f(g, b); for i in 0..3 { g[c + i] = (k * f(g, a + i)).to_bits() } }
                OP_DIV_F => g[c] = (f(g, a) / f(g, b)).to_bits(),
                OP_BITAND => g[c] = ((f(g, a) as i32 & f(g, b) as i32) as f32).to_bits(),
                OP_BITOR => g[c] = ((f(g, a) as i32 | f(g, b) as i32) as f32).to_bits(),
                OP_GE => g[c] = bf(f(g, a) >= f(g, b)),
                OP_LE => g[c] = bf(f(g, a) <= f(g, b)),
                OP_GT => g[c] = bf(f(g, a) > f(g, b)),
                OP_LT => g[c] = bf(f(g, a) < f(g, b)),
                OP_AND => g[c] = bf(f(g, a) != 0.0 && f(g, b) != 0.0),
                OP_OR => g[c] = bf(f(g, a) != 0.0 || f(g, b) != 0.0),
                OP_NOT_F => g[c] = bf(f(g, a) == 0.0),
                OP_NOT_V => g[c] = bf(f(g, a) == 0.0 && f(g, a + 1) == 0.0 && f(g, a + 2) == 0.0),
                OP_NOT_S => { let so = g[a] as i32; let v = so == 0 || self.pr.cstr(so).is_empty(); self.pr.globals[c] = bf(v); }
                OP_NOT_FNC => g[c] = bf(g[a] == 0),
                OP_NOT_ENT => g[c] = bf(g[a] == 0),
                OP_EQ_F => g[c] = bf(f(g, a) == f(g, b)),
                OP_EQ_V => g[c] = bf(f(g, a) == f(g, b) && f(g, a + 1) == f(g, b + 1) && f(g, a + 2) == f(g, b + 2)),
                OP_EQ_S => { let (x, y) = (g[a] as i32, g[b] as i32); let v = self.pr.cstr(x) == self.pr.cstr(y); self.pr.globals[c] = bf(v); }
                OP_EQ_E | OP_EQ_FNC => g[c] = bf(g[a] == g[b]),
                OP_NE_F => g[c] = bf(f(g, a) != f(g, b)),
                OP_NE_V => g[c] = bf(f(g, a) != f(g, b) || f(g, a + 1) != f(g, b + 1) || f(g, a + 2) != f(g, b + 2)),
                OP_NE_S => {
                    // strcmp's sign as a float: QuakeC only tests it for zero.
                    let (xo, yo) = (g[a] as i32, g[b] as i32);
                    let (x, y) = (self.pr.cstr(xo), self.pr.cstr(yo));
                    let v = match x.cmp(y) { std::cmp::Ordering::Less => -1.0f32, std::cmp::Ordering::Equal => 0.0, _ => 1.0 };
                    self.pr.globals[c] = v.to_bits();
                }
                OP_NE_E | OP_NE_FNC => g[c] = bf(g[a] != g[b]),
                OP_STORE_F | OP_STORE_ENT | OP_STORE_FLD | OP_STORE_S | OP_STORE_FNC => g[b] = g[a],
                OP_STORE_V => { g[b] = g[a]; g[b + 1] = g[a + 1]; g[b + 2] = g[a + 2]; }
                OP_STOREP_F | OP_STOREP_ENT | OP_STOREP_FLD | OP_STOREP_S | OP_STOREP_FNC => {
                    let p = g[b] as usize / 4;
                    let v = g[a];
                    if p < self.pr.mem.len() { self.pr.mem[p] = v; }
                }
                OP_STOREP_V => {
                    let p = g[b] as usize / 4;
                    let v = [g[a], g[a + 1], g[a + 2]];
                    if p + 2 < self.pr.mem.len() { self.pr.mem[p..p + 3].copy_from_slice(&v); }
                }
                OP_ADDRESS => {
                    let (ed, fld) = (g[a], g[b]);
                    if ed == 0 && !self.loading && self.active { self.run_error("assignment to world entity"); continue; }
                    self.pr.globals[c] = ed.wrapping_add(((HEADER_WORDS as u32).wrapping_add(fld)).wrapping_mul(4));
                }
                OP_LOAD_F | OP_LOAD_FLD | OP_LOAD_ENT | OP_LOAD_S | OP_LOAD_FNC => {
                    let p = (g[a] as usize / 4) + HEADER_WORDS + g[b] as usize;
                    g[c] = *self.pr.mem.get(p).unwrap_or(&0);
                }
                OP_LOAD_V => {
                    let p = (g[a] as usize / 4) + HEADER_WORDS + g[b] as usize;
                    for i in 0..3 { g[c + i] = *self.pr.mem.get(p + i).unwrap_or(&0); }
                }
                OP_IFNOT => if g[a] == 0 { s += st.b as i32 - 1 },
                OP_IF => if g[a] != 0 { s += st.b as i32 - 1 },
                OP_GOTO => s += st.a as i32 - 1,
                OP_CALL0..=OP_CALL8 => {
                    self.argc = (st.op - OP_CALL0) as usize;
                    let fnum = g[a] as usize;
                    if fnum == 0 { self.run_error("NULL function"); continue; }
                    let first = self.pr.functions[fnum].first_statement;
                    if first < 0 {
                        self.builtin((-first) as usize);
                    } else {
                        s = self.enter_function(fnum);
                    }
                }
                OP_DONE | OP_RETURN => {
                    g[OFS_RETURN] = g[a];
                    g[OFS_RETURN + 1] = g[a + 1];
                    g[OFS_RETURN + 2] = g[a + 2];
                    s = self.leave_function();
                    if self.stack.len() == exitdepth { return; }
                }
                OP_STATE => {
                    let ed = self.pr.ge(G_SELF);
                    let t = (self.pr.gf(G_TIME) as f64 + 0.1) as f32;
                    self.pr.set_ef(ed, F_NEXTTHINK, t);
                    let fr = self.pr.gf(a);
                    if fr != self.pr.ef(ed, F_FRAME) { self.pr.set_ef(ed, F_FRAME, fr); }
                    let th = self.pr.gi(b);
                    self.pr.set_ei(ed, F_THINK, th);
                }
                op => { self.run_error(&format!("Bad opcode {op}")); }
            }
        }
    }

    // ================================================================ pr_edict.c

    /// ED_Alloc.
    pub fn ed_alloc(&mut self) -> usize {
        let mut i = self.maxclients + 1;
        while i < self.num_edicts {
            let m = &self.pr.meta[i];
            if m.free && (m.freetime < 2.0 || self.time - m.freetime as f64 > 0.5) {
                self.pr.clear_edict(i);
                return i;
            }
            i += 1;
        }
        if i == MAX_EDICTS { panic!("ED_Alloc: no free edicts"); }
        self.num_edicts += 1;
        self.pr.clear_edict(i);
        i
    }

    /// ED_Free.
    pub fn ed_free(&mut self, e: usize) {
        self.unlink_edict(e);
        let pr = &mut self.pr;
        pr.meta[e].free = true;
        pr.set_ei(e, F_MODEL, 0);
        pr.set_ef(e, F_TAKEDAMAGE, 0.0);
        pr.set_ef(e, F_MODELINDEX, 0.0);
        pr.set_ef(e, F_COLORMAP, 0.0);
        pr.set_ef(e, F_SKIN, 0.0);
        pr.set_ef(e, F_FRAME, 0.0);
        pr.set_ev(e, F_ORIGIN, [0.0; 3]);
        pr.set_ev(e, F_ANGLES, [0.0; 3]);
        pr.set_ef(e, F_NEXTTHINK, -1.0);
        pr.set_ef(e, F_SOLID, 0.0);
        pr.meta[e].freetime = self.time as f32;
    }

    /// ED_ParseEpair into an edict's fields.
    fn parse_epair(&mut self, e: usize, key: Def, s: &str) -> bool {
        let base = e * self.pr.edict_words + HEADER_WORDS + key.ofs as usize;
        match key.typ & !DEF_SAVEGLOBAL {
            ev::STRING => { let o = self.pr.new_string(s); self.pr.mem[base] = o as u32; }
            ev::FLOAT => self.pr.mem[base] = atof(s).to_bits(),
            ev::VECTOR => {
                let mut it = s.split(' ');
                for i in 0..3 { self.pr.mem[base + i] = atof(it.next().unwrap_or("")).to_bits(); }
            }
            ev::ENTITY => self.pr.mem[base] = self.pr.prog(atoi(s) as usize) as u32,
            ev::FIELD => match self.pr.find_field(s) {
                Some(d) => self.pr.mem[base] = self.pr.globals[d.ofs as usize],
                None => return false,
            },
            ev::FUNCTION => match self.pr.find_function(s) {
                Some(f) => self.pr.mem[base] = f as u32,
                None => return false,
            },
            _ => {}
        }
        true
    }

    /// ED_ParseEdict: the key/value pairs up to '}'; returns the rest.
    fn parse_edict<'a>(&mut self, mut data: &'a str, e: usize) -> &'a str {
        let mut init = false;
        if e != 0 {
            let i = e * self.pr.edict_words + HEADER_WORDS;
            let n = self.pr.entityfields;
            self.pr.mem[i..i + n].fill(0);
        }
        loop {
            let (tok, rest) = com_parse(data).unwrap_or_else(|| panic!("ED_ParseEntity: EOF without closing brace"));
            data = rest;
            if tok.starts_with('}') { break; }
            let (mut keyname, anglehack) = if tok == "angle" { ("angles".to_string(), true) } else { (tok, false) };
            if keyname == "light" { keyname = "light_lev".into(); }
            while keyname.ends_with(' ') { keyname.pop(); }
            let (val, rest) = com_parse(data).unwrap_or_else(|| panic!("ED_ParseEntity: EOF without closing brace"));
            data = rest;
            if val.starts_with('}') { panic!("ED_ParseEntity: closing brace without data"); }
            init = true;
            if keyname.starts_with('_') { continue; }
            let Some(key) = self.pr.find_field(&keyname) else { continue };
            let val = if anglehack { format!("0 {val} 0") } else { val };
            if !self.parse_epair(e, key, &val) { panic!("ED_ParseEdict: parse error"); }
        }
        if !init { self.pr.meta[e].free = true; }
        data
    }

    /// ED_LoadFromFile: make the map's entities and run their spawn functions.
    fn load_from_file(&mut self, text: &str) {
        let mut data = text;
        let mut first = true;
        self.pr.set_gf(G_TIME, self.time as f32);
        while let Some((tok, rest)) = com_parse(data) {
            if !tok.starts_with('{') { panic!("ED_LoadFromFile: found {tok} when expecting {{"); }
            let e = if first { first = false; 0 } else { self.ed_alloc() };
            data = self.parse_edict(rest, e);
            let sf = self.pr.ef(e, F_SPAWNFLAGS) as i32;
            if self.cvars.v("deathmatch") != 0.0 {
                if sf & SPAWNFLAG_NOT_DEATHMATCH != 0 { self.ed_free(e); continue; }
            } else if (self.current_skill == 0 && sf & SPAWNFLAG_NOT_EASY != 0)
                || (self.current_skill == 1 && sf & SPAWNFLAG_NOT_MEDIUM != 0)
                || (self.current_skill >= 2 && sf & SPAWNFLAG_NOT_HARD != 0) {
                self.ed_free(e);
                continue;
            }
            if self.pr.ei(e, F_CLASSNAME) == 0 { self.ed_free(e); continue; }
            let cn = self.pr.estr(e, F_CLASSNAME).to_string();
            let Some(func) = self.pr.find_function(&cn) else { self.ed_free(e); continue };
            self.pr.set_gi(G_SELF, self.pr.prog(e));
            self.execute(func as i32);
            if self.error.is_some() { return; }
        }
    }

    // ================================================================ sv_main.c

    /// Mod_ForName for the server: the precache entry for a model name.
    fn load_model(&mut self, name: &str) -> Option<Model> {
        if let Some(n) = name.strip_prefix('*') {
            return n.parse::<usize>().ok().map(Model::Brush);
        }
        let data = self.pak.get(name)?;
        if data.len() < 24 { return None; }
        match &data[0..4] {
            b"IDPO" => Some(Model::Bounds([-16.0; 3], [16.0; 3])),
            b"IDSP" => {
                let w = i32::from_le_bytes(data[16..20].try_into().unwrap());
                let h = i32::from_le_bytes(data[20..24].try_into().unwrap());
                let (hw, hh) = ((-w / 2) as f32, (-h / 2) as f32);
                Some(Model::Bounds([hw, hw, hh], [-hw, -hw, -hh]))
            }
            _ => Bsp::parse(name, data.to_vec()).ok().map(|b| Model::Bounds(b.models[0].mins, b.models[0].maxs)),
        }
    }

    /// PF_precache_model's work, also used by SpawnServer.
    pub fn precache_model(&mut self, name: &str) {
        if self.model_precache.iter().any(|m| m == name) { return; }
        if self.model_precache.len() >= MAX_MODELS { self.run_error("PF_precache_model: overflow"); return; }
        let m = self.load_model(name);
        if m.is_none() { panic!("Mod_NumForName: {name} not found"); }
        self.model_precache.push(name.to_string());
        self.models.push(m);
    }

    /// SV_SpawnServer.
    pub fn spawn_server(&mut self, map: &str) -> Result<(), String> {
        let mut skill = (self.cvars.v("skill") + 0.5) as i32;
        skill = skill.clamp(0, 3);
        self.current_skill = skill;
        self.cvars.set("skill", &skill.to_string());
        if self.cvars.v("coop") != 0.0 { self.cvars.set("deathmatch", "0"); }

        self.pr = Progs::load(self.pak.get("progs.dat").ok_or("progs.dat not in pak")?)?;
        self.f_gravity = self.pr.find_field("gravity").map(|d| d.ofs as usize);
        self.f_items2 = self.pr.find_field("items2").map(|d| d.ofs as usize);
        self.stack.clear();
        self.localstack.clear();
        self.error = None;
        self.name = map.to_string();
        self.num_edicts = self.maxclients + 1;
        for i in 0..self.maxclients { self.clients[i].edict = i + 1; }
        self.loading = true;
        self.active = false;
        self.paused = false;
        self.time = 1.0;
        self.changelevel_issued = false;
        self.lastcheck = 0;
        self.lastchecktime = 0.0;
        self.lightstyles = vec![String::new(); MAX_LIGHTSTYLES];

        let modelname = format!("maps/{map}.bsp");
        let data = self.pak.get(&modelname).ok_or(format!("Couldn't spawn server {modelname}"))?.to_vec();
        self.bsp = Bsp::parse(&modelname, data)?;
        self.clear_world();

        self.sound_precache = vec![String::new()];
        self.model_precache = vec![String::new(), modelname.clone()];
        self.models = vec![None, Some(Model::Brush(0))];
        for i in 1..self.bsp.models.len() {
            self.model_precache.push(format!("*{i}"));
            self.models.push(Some(Model::Brush(i)));
        }

        self.pr.clear_edict(0);
        let mn = self.pr.new_string(&modelname);
        self.pr.set_ei(0, F_MODEL, mn);
        self.pr.set_ef(0, F_MODELINDEX, 1.0);
        self.pr.set_ef(0, F_SOLID, SOLID_BSP as f32);
        self.pr.set_ef(0, F_MOVETYPE, MOVETYPE_PUSH as f32);
        if self.cvars.v("coop") != 0.0 { self.pr.set_gf(G_COOP, self.cvars.v("coop")); }
        else { self.pr.set_gf(G_DEATHMATCH, self.cvars.v("deathmatch")); }
        let nm = self.pr.new_string(map);
        self.pr.set_gi(G_MAPNAME, nm);
        self.pr.set_gf(G_SERVERFLAGS, self.serverflags);

        let ents = self.bsp.entities.clone();
        self.load_from_file(&ents);
        if let Some(e) = &self.error { return Err(e.clone()); }
        self.loading = false;
        self.active = true;

        self.frametime = 0.1;
        self.physics();
        self.physics();
        match &self.error { Some(e) => Err(e.clone()), None => Ok(()) }
    }

    /// SV_ConnectClient + Host_Spawn_f + "begin": the local player joins.
    pub fn connect_client(&mut self, n: usize, name: &str) {
        let ent = n + 1;
        self.clients[n] = Client { active: true, spawned: false, name: name.to_string(), edict: ent, ..Default::default() };
        let f = self.pr.gi(G_SETNEWPARMS);
        self.execute(f);
        for i in 0..NUM_SPAWN_PARMS { self.clients[n].spawn_parms[i] = self.pr.gf(G_PARM1 + i); }
        // Host_Spawn_f
        let i = ent * self.pr.edict_words + HEADER_WORDS;
        let nf = self.pr.entityfields;
        self.pr.mem[i..i + nf].fill(0);
        self.pr.set_ef(ent, F_COLORMAP, ent as f32);
        self.pr.set_ef(ent, F_TEAM, ((self.clients[n].colors & 15) + 1) as f32);
        let nn = self.pr.new_string(name);
        self.pr.set_ei(ent, F_NETNAME, nn);
        for i in 0..NUM_SPAWN_PARMS { self.pr.set_gf(G_PARM1 + i, self.clients[n].spawn_parms[i]); }
        self.pr.set_gf(G_TIME, self.time as f32);
        self.pr.set_gi(G_SELF, self.pr.prog(ent));
        let f = self.pr.gi(G_CLIENTCONNECT);
        self.execute(f);
        let f = self.pr.gi(G_PUTCLIENTINSERVER);
        self.execute(f);
        // Host_Begin_f
        self.clients[n].spawned = true;
    }

    /// One host frame of `dt` seconds with the local player's command:
    /// SV_RunClients, SV_Physics, then SV_SendClientMessages's side effects.
    pub fn frame(&mut self, dt: f64, cmd: Option<UserCmd>) {
        if !self.active { return; }
        self.frametime = dt;
        self.rand.next(); // _Host_Frame: "keep the random time dependent"
        self.pr.set_gf(G_FRAMETIME, dt as f32);
        // SV_RunClients
        for n in 0..self.maxclients {
            if !self.clients[n].active { continue; }
            let ent = self.clients[n].edict;
            if let Some(c) = cmd { self.read_client_move(n, c); }
            if !self.clients[n].spawned { self.clients[n].cmd = UserCmd::default(); continue; }
            if !self.paused { self.client_think(ent, n); }
        }
        if !self.paused { self.physics(); }
        // SV_SendClientMessages: what writing the client's data changes.
        for n in 0..self.maxclients {
            if !(self.clients[n].active && self.clients[n].spawned) { continue; }
            let ent = self.clients[n].edict;
            self.pr.set_ef(ent, F_DMG_TAKE, 0.0);
            self.pr.set_ef(ent, F_DMG_SAVE, 0.0);
            self.set_ideal_pitch(ent);
            self.pr.set_ef(ent, F_FIXANGLE, 0.0);
        }
        // SV_CleanupEnts
        for e in 1..self.num_edicts {
            let fx = self.pr.ef(e, F_EFFECTS) as i32;
            self.pr.set_ef(e, F_EFFECTS, (fx & !EF_MUZZLEFLASH) as f32);
        }
    }

    /// SV_ReadClientMove: angles arrive as bytes (MSG_ReadAngle), moves as shorts.
    fn read_client_move(&mut self, n: usize, c: UserCmd) {
        let ent = self.clients[n].edict;
        let mut a = [0.0f32; 3];
        for i in 0..3 {
            let byte = (((c.angles[i] as i32) * 256 / 360) & 255) as u8 as i8;
            a[i] = (byte as f64 * (360.0 / 256.0)) as f32;
        }
        self.pr.set_ev(ent, F_V_ANGLE, a);
        let q = |v: f32| (v as i32 as i16) as f32;
        self.clients[n].cmd = UserCmd { angles: a, forwardmove: q(c.forwardmove), sidemove: q(c.sidemove), upmove: q(c.upmove), buttons: c.buttons, impulse: c.impulse };
        self.pr.set_ef(ent, F_BUTTON0, (c.buttons & 1) as f32);
        self.pr.set_ef(ent, F_BUTTON2, ((c.buttons & 2) >> 1) as f32);
        if c.impulse != 0 { self.pr.set_ef(ent, F_IMPULSE, c.impulse as f32); }
    }

    /// SV_StartSound.
    pub fn start_sound(&mut self, ent: usize, channel: i32, sample: &str, volume: i32, attenuation: f32) {
        if !(0..=255).contains(&volume) { panic!("SV_StartSound: volume = {volume}"); }
        if !(0.0..=4.0).contains(&attenuation) { panic!("SV_StartSound: attenuation = {attenuation}"); }
        if !(0..=7).contains(&channel) { panic!("SV_StartSound: channel = {channel}"); }
        if !self.sound_precache.iter().any(|s| s == sample) { return; }
        self.events.push(Event::Sound { ent, channel, sample: sample.to_string(), volume, attenuation });
    }
}

// pr_comp.h opcodes.
pub const OP_DONE: u16 = 0;
pub const OP_MUL_F: u16 = 1;
pub const OP_MUL_V: u16 = 2;
pub const OP_MUL_FV: u16 = 3;
pub const OP_MUL_VF: u16 = 4;
pub const OP_DIV_F: u16 = 5;
pub const OP_ADD_F: u16 = 6;
pub const OP_ADD_V: u16 = 7;
pub const OP_SUB_F: u16 = 8;
pub const OP_SUB_V: u16 = 9;
pub const OP_EQ_F: u16 = 10;
pub const OP_EQ_V: u16 = 11;
pub const OP_EQ_S: u16 = 12;
pub const OP_EQ_E: u16 = 13;
pub const OP_EQ_FNC: u16 = 14;
pub const OP_NE_F: u16 = 15;
pub const OP_NE_V: u16 = 16;
pub const OP_NE_S: u16 = 17;
pub const OP_NE_E: u16 = 18;
pub const OP_NE_FNC: u16 = 19;
pub const OP_LE: u16 = 20;
pub const OP_GE: u16 = 21;
pub const OP_LT: u16 = 22;
pub const OP_GT: u16 = 23;
pub const OP_LOAD_F: u16 = 24;
pub const OP_LOAD_V: u16 = 25;
pub const OP_LOAD_S: u16 = 26;
pub const OP_LOAD_ENT: u16 = 27;
pub const OP_LOAD_FLD: u16 = 28;
pub const OP_LOAD_FNC: u16 = 29;
pub const OP_ADDRESS: u16 = 30;
pub const OP_STORE_F: u16 = 31;
pub const OP_STORE_V: u16 = 32;
pub const OP_STORE_S: u16 = 33;
pub const OP_STORE_ENT: u16 = 34;
pub const OP_STORE_FLD: u16 = 35;
pub const OP_STORE_FNC: u16 = 36;
pub const OP_STOREP_F: u16 = 37;
pub const OP_STOREP_V: u16 = 38;
pub const OP_STOREP_S: u16 = 39;
pub const OP_STOREP_ENT: u16 = 40;
pub const OP_STOREP_FLD: u16 = 41;
pub const OP_STOREP_FNC: u16 = 42;
pub const OP_RETURN: u16 = 43;
pub const OP_NOT_F: u16 = 44;
pub const OP_NOT_V: u16 = 45;
pub const OP_NOT_S: u16 = 46;
pub const OP_NOT_ENT: u16 = 47;
pub const OP_NOT_FNC: u16 = 48;
pub const OP_IF: u16 = 49;
pub const OP_IFNOT: u16 = 50;
pub const OP_CALL0: u16 = 51;
pub const OP_CALL8: u16 = 59;
pub const OP_STATE: u16 = 60;
pub const OP_GOTO: u16 = 61;
pub const OP_AND: u16 = 62;
pub const OP_OR: u16 = 63;
pub const OP_BITAND: u16 = 64;
pub const OP_BITOR: u16 = 65;
