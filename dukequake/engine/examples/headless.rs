//! Load PAK0, spawn a map, put the player in, run frames; print what's alive.
//! cargo run --release --example headless -- <PAK0.PAK> [map] [frames]
use dqengine::defs::*;
use dqengine::pak::Pak;
use dqengine::server::*;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let pak = Pak::parse(std::fs::read(&a[1]).expect("read pak")).expect("pak");
    let map = a.get(2).map(|s| s.as_str()).unwrap_or("e1m1");
    let frames: usize = a.get(3).and_then(|s| s.parse().ok()).unwrap_or(100);
    let mut sv = Server::new(pak).expect("server");
    let t = std::time::Instant::now();
    sv.spawn_server(map).expect("spawn");
    println!("spawned {map}: {} edicts, {} models, {} sounds in {:?}", sv.num_edicts, sv.model_precache.len(), sv.sound_precache.len(), t.elapsed());
    sv.connect_client(0, "player");
    let p = 1;
    println!("player at {:?} health {}", sv.pr.ev(p, F_ORIGIN), sv.pr.ef(p, F_HEALTH));
    let t = std::time::Instant::now();
    for f in 0..frames {
        let cmd = UserCmd { angles: [0.0, 90.0, 0.0], forwardmove: if f < 50 { 200.0 } else { 0.0 }, ..Default::default() };
        sv.frame(0.05, Some(cmd));
        if let Some(e) = &sv.error { println!("error: {e}"); break; }
    }
    println!("{frames} frames in {:?}, time {:.2}", t.elapsed(), sv.time);
    println!("player at {:?} vel {:?} health {}", sv.pr.ev(p, F_ORIGIN), sv.pr.ev(p, F_VELOCITY), sv.pr.ef(p, F_HEALTH));
    let mut counts = std::collections::BTreeMap::new();
    for e in 1..sv.num_edicts {
        if sv.pr.meta[e].free { continue; }
        *counts.entry(sv.pr.estr(e, F_CLASSNAME).to_string()).or_insert(0) += 1;
    }
    println!("{:?}", counts);
    for e in 1..sv.num_edicts {
        if sv.pr.meta[e].free || !sv.pr.estr(e, F_CLASSNAME).starts_with("monster_") { continue; }
        println!("  {e:3} {:16} org {:?} hp {} frame {} enemy {}", sv.pr.estr(e, F_CLASSNAME), sv.pr.ev(e, F_ORIGIN), sv.pr.ef(e, F_HEALTH), sv.pr.ef(e, F_FRAME), sv.pr.ee(e, F_ENEMY));
    }
    let n = sv.events.len();
    println!("{n} events; first few:");
    for ev in sv.events.iter().filter(|e| !matches!(e, Event::Msg { .. })).take(12) { println!("  {ev:?}"); }
}
