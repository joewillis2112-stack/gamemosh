//! A trooper and a pig cop with the player 3000 units away, in plain sight.
use conwasm::*;
fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let mut buf = Vec::new();
    for n in ["GAME.CON", "DEFS.CON", "USER.CON"] {
        buf.extend_from_slice(n.as_bytes()); buf.push(0);
        buf.extend_from_slice(&std::fs::read(format!("{dir}/{n}")).unwrap()); buf.push(0);
    }
    let p = con_input(buf.len());
    unsafe { std::ptr::copy_nonoverlapping(buf.as_ptr(), p, buf.len()); }
    println!("actors with scripts: {}", con_load());
    let sym = |name: &str| { let p = con_input(name.len()); unsafe { std::ptr::copy_nonoverlapping(name.as_ptr(), p, name.len()); } con_symbol() };
    let (liz, pig) = (sym("LIZTROOP"), sym("PIGCOP"));
    println!("LIZTROOP={liz} PIGCOP={pig} LIZTROOPSTRENGTH={} SHOTSPARK1={}", sym("LIZTROOPSTRENGTH"), sym("SHOTSPARK1"));
    let a = con_spawn(liz, 0, 0, 0, 0);
    let b = con_spawn(pig, 0, 2000, 0, 0);
    con_player(3000, 0, -(40 << 8), 1024, 100, 0, pflag::ON_GROUND, 1);
    for t in 0..240 {
        for id in [a, b] { con_sense(id, 1 | 2, 0, -(64 << 8)); }
        if t == 150 { con_damage(a, 100, sym("SHOTSPARK1")); }
        let ne = con_tick() as usize;
        let ev = unsafe { std::slice::from_raw_parts(con_events(), ne * EVENT) };
        let st = unsafe { std::slice::from_raw_parts(con_actors(), con_count() as usize * STRIDE) };
        let kinds: Vec<String> = ev.chunks(EVENT).map(|e| format!("{}@{}:{:?}", e[0], e[1], &e[2..5])).collect();
        if t % 20 == 0 || !kinds.is_empty() {
            let s: Vec<String> = st.chunks(STRIDE).filter(|r| r[0] == 1).map(|r| format!("[pic {} xy {},{} ang {} xvel {} hp {} tile {} views {}]", r[1], r[2], r[3], r[5], r[6], r[8], r[9], r[10])).collect();
            println!("t{t:3} {} {}", s.join(" "), kinds.join(" "));
        }
    }
}
