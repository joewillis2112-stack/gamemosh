//! Duke Nukem 3D's actors, run by Duke's own CON scripts, for a host world that
//! isn't Build's. Everything is in Build units (x/y horizontal, z down, 16 z
//! units per x/y unit; angles 0..2047). The host:
//!   1. `con_load` the shareware GAME.CON (+ DEFS.CON, USER.CON) sources;
//!   2. `con_spawn` actors; each tick `con_player`, `con_sense` per actor and
//!      `con_damage` when it hits one;
//!   3. `con_tick`, then reads `con_actors` (STRIDE ints each) and
//!      `con_events` (EVENT ints each), and writes collision-corrected
//!      positions back with `con_place`.
use dukecon::compiler::{CompiledScript, Compiler};
use dukecon::physics::TrigTables;
use dukecon::rng::DeterministicRng;
use dukecon::types::ActorRegisters;
use dukecon::vm::{ConVm, VmActorContext};

mod duke_move;

pub const STRIDE: usize = 16;
pub const EVENT: usize = 8;

/// Event kinds in `con_events`: [kind, actor, a, b, c, d, e, f].
pub mod ev {
    pub const SHOOT: i32 = 1; // tile, x, y, z, ang
    pub const SPAWN: i32 = 2; // tile, x, y, z, new actor id or -1 (no script)
    pub const SOUND: i32 = 3; // sound id, global
    pub const HITRADIUS: i32 = 4; // radius, d1, d2, d3, d4 (at the actor)
    pub const DEBRIS: i32 = 5; // tile, count
    pub const KILLED: i32 = 6; // (actor removed by killit)
    pub const QUOTE: i32 = 7; // quote id
    pub const PALFROM: i32 = 8; // time, r, g, b
    pub const PHEALTH: i32 = 9; // delta
    pub const AMMO: i32 = 10; // weapon, amount
    pub const INVENTORY: i32 = 11; // item, amount
}

#[derive(Default, Clone)]
struct Actor {
    alive: bool,
    picnum: i16,
    x: i32, y: i32, z: i32,
    ang: i16, xvel: i16, zvel: i16,
    extra: i16, cstat: i16, pal: u8, xrepeat: u8, yrepeat: u8, clipdist: u8,
    lotag: i16, hitag: i16, sectnum: i16,
    regs: ActorRegisters,
    // Sensing, set by the host before each tick.
    can_see: bool, away_from_wall: bool, bullet_near: bool, blocked: bool, water: bool,
    floor_z: i32, ceiling_z: i32,
    hit_weapon: i16,
    bposz: i32,
    spawned_by: i16,
}

#[derive(Default)]
struct Player {
    x: i32, y: i32, z: i32, ang: i16, health: i32, xvel: i32,
    flags: i32, weapon: i32, inv: [i32; 9],
}

pub mod pflag {
    pub const ON_GROUND: i32 = 1;
    pub const RUNNING: i32 = 2;
    pub const CROUCHING: i32 = 4;
    pub const JETPACK: i32 = 8;
    pub const SHRUNK: i32 = 16;
    pub const DEAD: i32 = 32;
    pub const STEROIDS: i32 = 64;
    pub const USE: i32 = 128;
}

struct World {
    vm: ConVm,
    script: CompiledScript,
    trig: TrigTables,
    rng: DeterministicRng,
    actors: Vec<Actor>,
    player: Player,
    out: Vec<i32>,
    events: Vec<i32>,
    badguy: Vec<bool>,
    sym: std::collections::HashMap<String, i32>,
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// Distance to the first solid block from (x, y, z) along Build angle `ang`.
    fn host_hits(x: i32, y: i32, z: i32, ang: i32) -> i32;
}
#[cfg(target_arch = "wasm32")]
fn hits(x: i32, y: i32, z: i32, ang: i16) -> i32 { unsafe { host_hits(x, y, z, ang as i32) } }
#[cfg(not(target_arch = "wasm32"))]
fn hits(_: i32, _: i32, _: i32, _: i16) -> i32 { 1 << 20 }

/// Duke's badguy() list (game.c), by name.
const BADGUYS: &[&str] = &["SHARK", "RECON", "DRONE", "LIZTROOPONTOILET", "LIZTROOPJUSTSIT", "LIZTROOPSTAYPUT", "LIZTROOPSHOOT", "LIZTROOPJETPACK", "LIZTROOPDUCKING", "LIZTROOPRUNNING", "LIZTROOP", "OCTABRAIN", "COMMANDER", "COMMANDERSTAYPUT", "PIGCOP", "EGG", "PIGCOPSTAYPUT", "PIGCOPDIVE", "LIZMAN", "LIZMANSPITTING", "LIZMANFEEDING", "LIZMANJUMP", "ORGANTIC", "BOSS1", "BOSS2", "BOSS3", "BOSS4", "RAT", "ROTATEGUN"];

static mut WORLD: Option<World> = None;
static mut INPUT: Vec<u8> = Vec::new();

#[allow(static_mut_refs)]
fn w() -> &'static mut World { unsafe { WORLD.as_mut().expect("con_load first") } }

/// Room for `n` bytes of input (CON sources, names); returns its address.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn con_input(n: usize) -> *mut u8 {
    unsafe { INPUT = vec![0; n]; INPUT.as_mut_ptr() }
}

#[allow(static_mut_refs)]
fn input_str() -> String { unsafe { String::from_utf8_lossy(&INPUT).to_string() } }

/// Compile CON sources. The input is "NAME\0text\0NAME\0text..." with GAME.CON
/// first; includes resolve against the other names. Returns the number of
/// scripted actors, or -1 (the error text is then in `con_output`).
#[no_mangle]
pub extern "C" fn con_load() -> i32 {
    let raw = input_str();
    let mut parts = raw.split('\0');
    let mut files: Vec<(String, String)> = Vec::new();
    while let (Some(n), Some(t)) = (parts.next(), parts.next()) {
        if !n.is_empty() { files.push((n.to_uppercase(), t.to_string())); }
    }
    let Some((_, game)) = files.first().cloned() else { return -1 };
    let loader = |name: &str| files.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)).map(|(_, t)| t.clone());
    let mut c = Compiler::new();
    match c.compile_with_loader(&game, &loader) {
        Ok(script) => {
            let n = script.actor_script_ptrs.iter().filter(|p| p.is_some()).count() as i32;
            let vm = ConVm::new(script.bytecode.clone(), script.actor_script_ptrs.clone(), script.actor_types.clone());
            let mut badguy = vec![false; dukecon::types::MAX_TILES];
            for n in BADGUYS { if let Some(&t) = script.symbols.get(*n) { if (t as usize) < badguy.len() { badguy[t as usize] = true; } } }
            if let Some(&g) = script.symbols.get("GREENSLIME") { for k in 0..8 { badguy[(g + k) as usize] = true; } }
            let sym = script.symbols.clone();
            unsafe {
                WORLD = Some(World { badguy, sym, vm, script, trig: TrigTables::new(), rng: DeterministicRng::new(0x0D0C), actors: Vec::new(), player: Player { health: 100, ..Default::default() }, out: Vec::new(), events: Vec::new() });
            }
            n
        }
        Err(e) => { unsafe { WORLD = None; INPUT = e.into_bytes(); } -1 }
    }
}

/// The value of a CON `define` (the name is in the input buffer), or i32::MIN.
#[no_mangle]
pub extern "C" fn con_symbol() -> i32 {
    let name = input_str();
    w().script.symbols.get(name.trim_end_matches('\0')).copied().unwrap_or(i32::MIN)
}

/// Does this tile have a CON actor script?
#[no_mangle]
pub extern "C" fn con_has_script(picnum: i32) -> i32 {
    w().vm.actor_script_ptrs.get(picnum as usize).copied().flatten().is_some() as i32
}

fn spawn_actor(wd: &mut World, picnum: i16, x: i32, y: i32, z: i32, ang: i16, by: i16) -> i32 {
    let mut a = Actor { alive: true, picnum, x, y, z, ang, xrepeat: 64, yrepeat: 64, clipdist: 32, sectnum: 0, spawned_by: by, ..Default::default() };
    // Duke's spawn(): the actor header is strength, action, move, move flags.
    if let Some(Some(p)) = wd.vm.actor_script_ptrs.get(picnum as usize).copied() {
        let bc = &wd.vm.bytecode;
        a.extra = bc[p] as i16;
        if bc[p + 1] != 0 { a.regs.action_ptr = Some(bc[p + 1] as usize); }
        if bc[p + 2] != 0 { a.regs.move_ptr = Some(bc[p + 2] as usize); }
        a.hitag = bc[p + 3] as i16;
    }
    // Duke's spawn() (game.c): enemies are drawn at 40×40 (bosses 80, the
    // shark 60), and troopers wear palette 22.
    if wd.badguy.get(picnum as usize).copied().unwrap_or(false) {
        let name = |n: &str| wd.sym.get(n).copied().unwrap_or(-1) as i16;
        let boss = ["BOSS1", "BOSS2", "BOSS3", "BOSS4"].iter().any(|b| name(b) == picnum);
        let r = if boss { 80 } else if picnum == name("SHARK") { 60 } else { 40 };
        a.xrepeat = r; a.yrepeat = r;
        a.clipdist = if boss { 164 } else if r == 60 { 40 } else { 80 };
        if ["LIZTROOP", "LIZTROOPSHOOT", "LIZTROOPJETPACK", "LIZTROOPDUCKING", "LIZTROOPRUNNING", "LIZTROOPSTAYPUT", "LIZTROOPONTOILET", "LIZTROOPJUSTSIT"].iter().any(|t| name(t) == picnum) { a.pal = 22; }
    }
    // Reuse a dead slot.
    if let Some(i) = wd.actors.iter().position(|a| !a.alive) { wd.actors[i] = a; return i as i32; }
    wd.actors.push(a);
    (wd.actors.len() - 1) as i32
}

#[no_mangle]
pub extern "C" fn con_spawn(picnum: i32, x: i32, y: i32, z: i32, ang: i32) -> i32 {
    let wd = w();
    spawn_actor(wd, picnum as i16, x, y, z, ang as i16, -1)
}

#[no_mangle]
pub extern "C" fn con_remove(id: i32) {
    if let Some(a) = w().actors.get_mut(id as usize) { a.alive = false; }
}

#[no_mangle]
pub extern "C" fn con_player(x: i32, y: i32, z: i32, ang: i32, health: i32, xvel: i32, flags: i32, weapon: i32) {
    let p = &mut w().player;
    p.x = x; p.y = y; p.z = z; p.ang = ang as i16; p.health = health; p.xvel = xvel; p.flags = flags; p.weapon = weapon;
}

/// Inventory amounts for `ifpinventory`: steroids, shield, scuba, holoduke,
/// jetpack, heat, firstaid, boots, access.
#[no_mangle]
pub extern "C" fn con_player_inv(i: i32, amount: i32) {
    if let Some(v) = w().player.inv.get_mut(i as usize) { *v = amount; }
}

/// What an actor senses this tick, from the host's world. `flags`:
/// 1 can see the player, 2 away from a wall, 4 bullet near, 8 blocked
/// (didn't move last tick), 16 in water.
#[no_mangle]
pub extern "C" fn con_sense(id: i32, flags: i32, floor_z: i32, ceiling_z: i32) {
    if let Some(a) = w().actors.get_mut(id as usize) {
        a.can_see = flags & 1 != 0; a.away_from_wall = flags & 2 != 0; a.bullet_near = flags & 4 != 0;
        a.blocked = flags & 8 != 0; a.water = flags & 16 != 0;
        a.floor_z = floor_z; a.ceiling_z = ceiling_z;
    }
}

/// The player (or anything) hit this actor with `weapon` (a tile number,
/// e.g. SHOTSPARK1 for the pistol) for `amount` damage.
#[no_mangle]
pub extern "C" fn con_damage(id: i32, amount: i32, weapon: i32) {
    if let Some(a) = w().actors.get_mut(id as usize) {
        if !a.alive { return; }
        a.extra = a.extra.saturating_sub(amount as i16);
        a.hit_weapon = if weapon == 0 { 1 } else { weapon as i16 };
    }
}

/// Collision-corrected position from the host, after it moved the actor.
#[no_mangle]
pub extern "C" fn con_place(id: i32, x: i32, y: i32, z: i32, zvel: i32) {
    if let Some(a) = w().actors.get_mut(id as usize) { a.x = x; a.y = y; a.z = z; a.zvel = zvel as i16; }
}

/// One game tick for every actor: run its script, then its move.
#[no_mangle]
pub extern "C" fn con_tick() -> i32 {
    let wd = w();
    wd.events.clear();
    let n = wd.actors.len();
    let mut spawns: Vec<(i16, i32, i32, i32, i16, i32)> = Vec::new();
    for i in 0..n {
        if !wd.actors[i].alive || wd.vm.actor_script_ptrs.get(wd.actors[i].picnum as usize).copied().flatten().is_none() { continue; }
        let p = &wd.player;
        let a = &mut wd.actors[i];
        // Duke's player distance: |dx| + |dy| + |dz + 28<<8| >> 4.
        let dist = (p.x - a.x).abs() + (p.y - a.y).abs() + ((p.z - a.z + (28 << 8)).abs() >> 4);
        let to_player = dukecon::physics::get_angle(a.x - p.x, a.y - p.y);
        let facing = dukecon::types::getincangle(p.ang, to_player).abs() < 128;
        let pf = p.flags;
        let mut regs = a.regs.clone();
        regs.floor_z = a.floor_z;
        if a.can_see { regs.last_vx = p.x; regs.last_vy = p.y; }
        regs.ceiling_z = a.ceiling_z;
        let (mut x, mut y, mut z, mut ang, mut xvel, mut zvel) = (a.x, a.y, a.z, a.ang, a.xvel, a.zvel);
        let (mut extra, mut picnum, mut sectnum, mut cstat, mut pal) = (a.extra, a.picnum, a.sectnum, a.cstat, a.pal);
        let (mut xr, mut yr, mut cd, mut lotag, mut hitag) = (a.xrepeat, a.yrepeat, a.clipdist, a.lotag, a.hitag);
        let mut ctx = VmActorContext {
            sprite_idx: i, player_idx: 0, dist_to_player: dist, can_see_player: a.can_see,
            hit_by_weapon: a.hit_weapon != 0, rng: &mut wd.rng, registers: &mut regs,
            sprite_x: &mut x, sprite_y: &mut y, sprite_z: &mut z, sprite_ang: &mut ang,
            sprite_xvel: &mut xvel, sprite_zvel: &mut zvel, sprite_extra: &mut extra,
            sprite_picnum: &mut picnum, sprite_sectnum: &mut sectnum, sprite_cstat: &mut cstat,
            sprite_pal: &mut pal, sprite_xrepeat: &mut xr, sprite_yrepeat: &mut yr,
            sprite_clipdist: &mut cd, sprite_lotag: &mut lotag, sprite_hitag: &mut hitag,
            killit_flag: false, spawned_sprites: Vec::new(), sound_events: Vec::new(),
            quotes_displayed: Vec::new(), pal_flashes: Vec::new(), player_health_delta: 0,
            player_ammo_deltas: Vec::new(), player_inventory_deltas: Vec::new(),
            debris_events: Vec::new(), hitradius_events: Vec::new(), end_of_game: None,
            player_health: p.health, player_ang: p.ang, player_on_ground: pf & pflag::ON_GROUND != 0,
            player_jumping_counter: 0, player_posz_velocity: 0, player_crouching: pf & pflag::CROUCHING != 0,
            player_xvel: p.xvel, player_running: pf & pflag::RUNNING != 0, player_quick_kick: 0,
            player_shrunk: pf & pflag::SHRUNK != 0, player_jetpack_on: pf & pflag::JETPACK != 0,
            player_steroids_active: pf & pflag::STEROIDS != 0, player_dead: pf & pflag::DEAD != 0,
            player_weapon: p.weapon, player_kickback: 0, player_facing_actor: facing,
            player_steroids_amount: p.inv[0], player_shield_amount: p.inv[1], player_scuba_amount: p.inv[2],
            player_holoduke_amount: p.inv[3], player_jetpack_amount: p.inv[4], player_heat_amount: p.inv[5],
            player_firstaid_amount: p.inv[6], player_boot_amount: p.inv[7], player_got_access: p.inv[8],
            sector_lotag: if a.water { 2 } else { 0 }, sector_ceilingstat: 0, is_multiplayer: false,
            hit_space_pressed: pf & pflag::USE != 0, spawned_by_picnum: a.spawned_by,
            last_hit_weapon: a.hit_weapon, can_shoot_target: a.can_see, bullet_near: a.bullet_near,
            not_moving: a.blocked, away_from_wall: a.away_from_wall, has_active_sound: false,
            shoot_events: Vec::new(),
        };
        wd.vm.execute(&mut ctx);
        let killit = ctx.killit_flag;
        let pic_now = *ctx.sprite_picnum;
        let id = i as i32;
        let e = &mut wd.events;
        let mut push = |k: i32, v: [i32; 6]| { e.push(k); e.push(id); e.extend_from_slice(&v); };
        for (t, sx, sy, sz, sa) in ctx.shoot_events.drain(..) { push(ev::SHOOT, [t as i32, sx, sy, sz, sa as i32, 0]); }
        for (t, sx, sy, sz) in ctx.spawned_sprites.drain(..) { spawns.push((t, sx, sy, sz, pic_now, id)); }
        for (s, global) in ctx.sound_events.drain(..) { push(ev::SOUND, [s, global as i32, 0, 0, 0, 0]); }
        for (r, d1, d2, d3, d4) in ctx.hitradius_events.drain(..) { push(ev::HITRADIUS, [r, d1, d2, d3, d4, 0]); }
        for (t, c) in ctx.debris_events.drain(..) { push(ev::DEBRIS, [t as i32, c, 0, 0, 0, 0]); }
        for q in ctx.quotes_displayed.drain(..) { push(ev::QUOTE, [q, 0, 0, 0, 0, 0]); }
        for (t, r, g, b) in ctx.pal_flashes.drain(..) { push(ev::PALFROM, [t, r, g, b, 0, 0]); }
        if ctx.player_health_delta != 0 { push(ev::PHEALTH, [ctx.player_health_delta, 0, 0, 0, 0, 0]); }
        for (wpn, amt) in ctx.player_ammo_deltas.drain(..) { push(ev::AMMO, [wpn, amt, 0, 0, 0, 0]); }
        for (it, amt) in ctx.player_inventory_deltas.drain(..) { push(ev::INVENTORY, [it, amt, 0, 0, 0, 0]); }
        drop(ctx);
        // Duke's move(), with the host's world for hitscans.
        let (mut dx, mut dy, mut dz) = (0, 0, 0);
        if !killit {
            let pic = picnum as usize;
            let s_ = |n: &str| wd.sym.get(n).copied().unwrap_or(-1) as i16;
            let (drone, commander, shark) = (s_("DRONE"), s_("COMMANDER"), s_("SHARK"));
            let bposz = wd.actors[i].bposz;
            let mut body = duke_move::Body {
                picnum, badguy: wd.badguy.get(pic).copied().unwrap_or(false),
                is_drone: picnum == drone, is_commander: picnum == commander, is_shark: picnum == shark,
                x, y, z, ang: &mut ang, xvel: &mut xvel, zvel: &mut zvel, hitag, extra, xrepeat: xr,
                regs: &mut regs, bposz, g_x: dist, player_x: wd.player.x, player_y: wd.player.y,
            };
            let mut m = duke_move::Mover { trig: &wd.trig, rng: &mut wd.rng, bytecode: &wd.vm.bytecode, hits: &hits };
            (dx, dy, dz) = m.step(&mut body);
        }
        wd.actors[i].bposz = z;
        x += dx; y += dy; z += dz;
        let a = &mut wd.actors[i];
        a.regs = regs; a.x = x; a.y = y; a.z = z; a.ang = ang; a.xvel = xvel; a.zvel = zvel;
        a.extra = extra; a.picnum = picnum; a.sectnum = sectnum; a.cstat = cstat; a.pal = pal;
        a.xrepeat = xr; a.yrepeat = yr; a.clipdist = cd; a.lotag = lotag; a.hitag = hitag;
        a.hit_weapon = 0;
        if killit {
            a.alive = false;
            wd.events.extend_from_slice(&[ev::KILLED, id, 0, 0, 0, 0, 0, 0]);
        }
    }
    for (t, sx, sy, sz, by, from) in spawns {
        let has = wd.vm.actor_script_ptrs.get(t as usize).copied().flatten().is_some();
        let nid = if has { spawn_actor(wd, t, sx, sy, sz, 0, by) } else { -1 };
        wd.events.extend_from_slice(&[ev::SPAWN, from, t as i32, sx, sy, sz, nid, 0]);
    }
    (wd.events.len() / EVENT) as i32
}

/// Snapshot of every actor slot, STRIDE ints each:
/// alive, picnum, x, y, z, ang, xvel, zvel, extra, tile, views, pal,
/// xrepeat, yrepeat, cstat, hitag. `tile` is the tile to draw before the
/// view rotation is added: picnum + action start + views × frame.
#[no_mangle]
pub extern "C" fn con_actors() -> *const i32 {
    let wd = w();
    wd.out.clear();
    for a in &wd.actors {
        let (mut tile, mut views) = (a.picnum as i32, 1);
        if let Some(ap) = a.regs.action_ptr {
            let bc = &wd.vm.bytecode;
            if ap + 4 < bc.len() {
                views = bc[ap + 2].max(1);
                tile = a.picnum as i32 + bc[ap] + views * a.regs.frame_offset;
            }
        }
        wd.out.extend_from_slice(&[a.alive as i32, a.picnum as i32, a.x, a.y, a.z, a.ang as i32, a.xvel as i32, a.zvel as i32, a.extra as i32, tile, views, a.pal as i32, a.xrepeat as i32, a.yrepeat as i32, a.cstat as i32, a.hitag as i32]);
    }
    wd.out.as_ptr()
}

#[no_mangle]
pub extern "C" fn con_count() -> i32 { w().actors.len() as i32 }

#[no_mangle]
pub extern "C" fn con_events() -> *const i32 { w().events.as_ptr() }

/// The input buffer, which holds an error after a failed `con_load`.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn con_output() -> *const u8 { unsafe { INPUT.as_ptr() } }
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn con_output_len() -> usize { unsafe { INPUT.len() } }

/// The script's sound table and quotes as JSON, into the output buffer:
/// {"sounds":{"id":"FILE.VOC",...},"quotes":{"id":"text",...}}. Returns its length.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn con_meta() -> usize {
    let wd = w();
    let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
    let mut j = String::from("{\"sounds\":{");
    for (k, snd) in wd.script.sounds.iter().enumerate() {
        if k > 0 { j.push(','); }
        j.push_str(&format!("\"{}\":\"{}\"", snd.sound_id, esc(&snd.filename)));
    }
    j.push_str("},\"quotes\":{");
    for (k, (id, q)) in wd.script.quotes.iter().enumerate() {
        if k > 0 { j.push(','); }
        j.push_str(&format!("\"{}\":\"{}\"", id, esc(q)));
    }
    j.push_str("}}");
    unsafe { INPUT = j.into_bytes(); INPUT.len() }
}
