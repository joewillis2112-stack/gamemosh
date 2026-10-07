//! Tick-by-tick comparison with id's C server (the oracle harness in
//! dukequake/oracle). Both run the same map and the same player commands;
//! every entity field and every named global is compared after every frame.
//! cargo run --release --example oracle -- <PAK0.PAK> <oracle.bin> <cmds.txt> [map] [skill]
//! cargo run --release --example oracle -- --gen <cmds.txt> <frames> <seed> <dt>
use dqengine::defs::*;
use dqengine::pak::Pak;
use dqengine::progs::ev;
use dqengine::server::*;

fn fnv(s: &[u8]) -> u32 { let mut h = 2166136261u32; for &c in s { h ^= c as u32; h = h.wrapping_mul(16777619); } h }

struct Rd<'a> { b: &'a [u8], o: usize }
impl Rd<'_> {
    fn u32(&mut self) -> u32 { let v = u32::from_le_bytes(self.b[self.o..self.o + 4].try_into().unwrap()); self.o += 4; v }
    fn f64(&mut self) -> f64 { let v = f64::from_le_bytes(self.b[self.o..self.o + 8].try_into().unwrap()); self.o += 8; v }
    fn u8(&mut self) -> u8 { let v = self.b[self.o]; self.o += 1; v }
}

/// One frame's state, as both sides dump it.
struct Snap { frame: i32, time: f64, free: Vec<bool>, fields: Vec<Vec<u32>>, globals: Vec<u32>, fstr: Vec<Vec<u32>>, gstr: Vec<u32> }

fn read_snap(r: &mut Rd, nf: usize, sfields: &[usize], sglobals: &[usize]) -> Snap {
    let frame = r.u32() as i32;
    let time = r.f64();
    let n = r.u32() as usize;
    let mut free = vec![];
    let mut fields = vec![];
    for _ in 0..n { free.push(r.u8() != 0); fields.push((0..nf).map(|_| r.u32()).collect()); }
    let ng = r.u32() as usize;
    let globals = (0..ng).map(|_| r.u32()).collect();
    let fstr = (0..n).map(|_| sfields.iter().map(|_| r.u32()).collect()).collect();
    let gstr = sglobals.iter().map(|_| r.u32()).collect();
    Snap { frame, time, free, fields, globals, fstr, gstr }
}

fn snap(sv: &Server, frame: i32, sfields: &[usize], sglobals: &[usize]) -> Snap {
    let pr = &sv.pr;
    let n = sv.num_edicts;
    let nf = pr.entityfields;
    Snap {
        frame, time: sv.time,
        free: (0..n).map(|e| pr.meta[e].free).collect(),
        fields: (0..n).map(|e| (0..nf).map(|f| pr.ei(e, f) as u32).collect()).collect(),
        globals: pr.globals.clone(),
        fstr: (0..n).map(|e| sfields.iter().map(|&f| fnv(pr.cstr(pr.ei(e, f)))).collect()).collect(),
        gstr: sglobals.iter().map(|&g| fnv(pr.cstr(pr.gi(g)))).collect(),
    }
}

fn gen(path: &str, frames: usize, seed: u32, dt: f32) {
    // A player who walks, strafes, turns, looks, jumps, fires and switches weapons.
    let mut s = seed;
    let mut rnd = || { s = s.wrapping_mul(1103515245).wrapping_add(12345); (s >> 16) & 0x7fff };
    let mut out = String::new();
    let (mut yaw, mut pitch) = (90.0f32, 0.0f32);
    let (mut fm, mut sm, mut b, mut imp);
    for f in 0..frames {
        if f % 20 == 0 { yaw += (rnd() % 90) as f32 - 45.0; pitch = (rnd() % 40) as f32 - 20.0; }
        yaw = yaw.rem_euclid(360.0);
        fm = if rnd() % 10 < 7 { 320.0 } else { -200.0 };
        sm = match rnd() % 5 { 0 => 350.0, 1 => -350.0, _ => 0.0 };
        b = (if rnd() % 4 == 0 { 1 } else { 0 }) | (if rnd() % 15 == 0 { 2 } else { 0 });
        imp = if f % 97 == 50 { 1 + rnd() % 8 } else { 0 };
        out += &format!("{dt} {pitch} {yaw} 0 {fm} {sm} 0 {b} {imp}\n");
    }
    std::fs::write(path, out).unwrap();
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a[1] == "--gen" {
        gen(&a[2], a[3].parse().unwrap(), a[4].parse().unwrap(), a[5].parse().unwrap());
        return;
    }
    let pak = Pak::parse(std::fs::read(&a[1]).unwrap()).unwrap();
    let data = std::fs::read(&a[2]).unwrap();
    let cmds = std::fs::read_to_string(&a[3]).unwrap();
    let map = a.get(4).map(|s| s.as_str()).unwrap_or("e1m1");
    let mut sv = Server::new(pak).unwrap();
    if let Some(sk) = a.get(5) { sv.cvars.set("skill", sk); }
    sv.spawn_server(map).unwrap();
    sv.connect_client(0, "player");

    let pr = &sv.pr;
    let is_str = |t: u16| t & !dqengine::progs::DEF_SAVEGLOBAL == ev::STRING;
    let sfields: Vec<usize> = pr.fielddefs.iter().skip(1).filter(|d| is_str(d.typ)).map(|d| d.ofs as usize).collect();
    let sglobals: Vec<usize> = pr.globaldefs.iter().skip(1).filter(|d| is_str(d.typ)).map(|d| d.ofs as usize).collect();
    // Named non-string globals are compared raw; temporaries are not (they may hold string offsets).
    let mut named = vec![false; pr.globals.len()];
    for d in pr.globaldefs.iter().skip(1) {
        let t = d.typ & !dqengine::progs::DEF_SAVEGLOBAL;
        if t == ev::STRING || t == ev::VOID { continue; }
        let w = if t == ev::VECTOR { 3 } else { 1 };
        for k in 0..w { if (d.ofs as usize + k) < named.len() { named[d.ofs as usize + k] = true; } }
    }
    let fnames: Vec<String> = (0..pr.entityfields).map(|f| pr.fielddefs.iter().find(|d| d.ofs as usize == f && d.typ & !dqengine::progs::DEF_SAVEGLOBAL != ev::VECTOR).map(|d| pr.str_at(d.s_name).to_string()).unwrap_or(format!("field{f}"))).collect();
    let gnames: Vec<String> = (0..pr.globals.len()).map(|g| pr.globaldefs.iter().find(|d| d.ofs as usize == g).map(|d| pr.str_at(d.s_name).to_string()).unwrap_or(format!("global{g}"))).collect();
    let fname = |f: usize| fnames[f].clone();
    let gname = |g: usize| gnames[g].clone();

    let nf = sv.pr.entityfields;
    let mut r = Rd { b: &data, o: 0 };
    let mut lines = cmds.lines();
    let mut frame = -1i32;
    let mut checked = 0;
    let total_fields;
    loop {
        if r.o >= data.len() { break; }
        let c = read_snap(&mut r, nf, &sfields, &sglobals);
        let me = snap(&sv, frame, &sfields, &sglobals);
        assert_eq!(c.frame, frame);
        let mut diffs = vec![];
        if c.time != me.time { diffs.push(format!("sv.time C {} vs {}", c.time, me.time)); }
        if c.free.len() != me.free.len() { diffs.push(format!("num_edicts C {} vs {}", c.free.len(), me.free.len())); }
        for e in 0..c.free.len().min(me.free.len()) {
            let cn = sv.pr.estr(e, F_CLASSNAME).to_string();
            if c.free[e] != me.free[e] { diffs.push(format!("edict {e} ({cn}) free C {} vs {}", c.free[e], me.free[e])); continue; }
            for f in 0..nf {
                if sfields.contains(&f) { continue; }
                let (x, y) = (c.fields[e][f], me.fields[e][f]);
                if x != y { diffs.push(format!("edict {e} ({cn}) .{} C {} ({x:#x}) vs {} ({y:#x})", fname(f), f32::from_bits(x), f32::from_bits(y))); }
            }
            for (k, &f) in sfields.iter().enumerate() {
                if c.fstr[e][k] != me.fstr[e][k] { diffs.push(format!("edict {e} ({cn}) .{} string differs (now {:?})", fname(f), sv.pr.estr(e, f))); }
            }
        }
        for g in 0..c.globals.len().min(me.globals.len()) {
            if named[g] && c.globals[g] != me.globals[g] {
                diffs.push(format!("global {} C {} ({:#x}) vs {} ({:#x})", gname(g), f32::from_bits(c.globals[g]), c.globals[g], f32::from_bits(me.globals[g]), me.globals[g]));
            }
        }
        for (k, &g) in sglobals.iter().enumerate() {
            if c.gstr[k] != me.gstr[k] { diffs.push(format!("global {} string differs (now {:?})", gname(g), sv.pr.str_at(sv.pr.gi(g)))); }
        }
        if !diffs.is_empty() {
            println!("DIVERGED at frame {frame} (time {:.3}): {} differences", c.time, diffs.len());
            for d in diffs.iter().take(25) { println!("  {d}"); }
            std::process::exit(1);
        }
        checked += 1;
        let Some(line) = lines.next() else { break };
        let v: Vec<f32> = line.split_whitespace().map(|x| x.parse().unwrap()).collect();
        let cmd = UserCmd { angles: [v[1], v[2], v[3]], forwardmove: v[4], sidemove: v[5], upmove: v[6], buttons: v[7] as u8, impulse: v[8] as u8 };
        sv.frame(v[0] as f64, Some(cmd));
        if let Some(e) = &sv.error { println!("Rust error at frame {frame}: {e}"); std::process::exit(1); }
        frame += 1;
    }
    total_fields = checked * sv.num_edicts * nf;
    println!("MATCH: {checked} frames, {} edicts, ~{} entity fields compared, time {:.2}", sv.num_edicts, total_fields, sv.time);
    println!("player org {:?} health {} weapon {}", sv.pr.ev(1, F_ORIGIN), sv.pr.ef(1, F_HEALTH), sv.pr.ef(1, F_WEAPON));
}
