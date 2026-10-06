use dukecon::compiler::Compiler;
fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let read = |n: &str| std::fs::read(format!("{dir}/{}", n.to_uppercase())).ok().map(|b| String::from_utf8_lossy(&b).to_string());
    let game = read("GAME.CON").unwrap();
    let mut c = Compiler::new();
    match c.compile_with_loader(&game, &read) {
        Ok(s) => {
            let actors = s.actor_script_ptrs.iter().filter(|p| p.is_some()).count();
            println!("OK: {} bytecode words, {} actors with scripts, {} actions, {} moves, {} ais, {} symbols", s.bytecode.len(), actors, s.actions.len(), s.moves.len(), s.ais.len(), s.symbols.len());
            for n in ["LIZTROOP", "PIGCOP", "LIZMAN", "OCTABRAIN", "COMMANDER", "DRONE", "BOSS1", "EGG", "GREENSLIME", "RECON", "NEWBEAST"] {
                let id = s.symbols.get(n).copied();
                let has = id.and_then(|i| s.actor_script_ptrs.get(i as usize).copied().flatten()).is_some();
                println!("  {n:<10} tile {:?} script {}", id, has);
            }
        }
        Err(e) => println!("FAILED: {e}"),
    }
}
