//! Duke's own actor movement, ported line by line from the 1996 source
//! (JFDuke3D `gamedef.c`: `move()`, `alterang()`, `furthestangle()`, `dodge()`
//! minus projectiles). Geometry questions go to the host world:
//! `hits` is Build's `hits()` (distance to the first wall straight ahead).
//! Instead of `movesprite`, this returns the displacement; the host moves the
//! actor with its own collision and reports back with `con_place`.

use dukecon::physics::{get_angle, TrigTables};
use dukecon::rng::DeterministicRng;
use dukecon::types::{getincangle, move_flags as mf, ActorRegisters};

pub struct Mover<'a> {
    pub trig: &'a TrigTables,
    pub rng: &'a mut DeterministicRng,
    pub bytecode: &'a [i32],
    /// Distance to the first wall from (x, y, z) along `ang`, in Build units.
    pub hits: &'a dyn Fn(i32, i32, i32, i16) -> i32,
}

pub struct Body<'a> {
    pub picnum: i16,
    pub badguy: bool,
    pub is_drone: bool,
    pub is_commander: bool,
    pub is_shark: bool,
    pub x: i32, pub y: i32, pub z: i32,
    pub ang: &'a mut i16,
    pub xvel: &'a mut i16,
    pub zvel: &'a mut i16,
    pub hitag: i16,
    pub extra: i16,
    pub xrepeat: u8,
    pub regs: &'a mut ActorRegisters,
    pub bposz: i32,
    /// Distance to the player (Duke's g_x).
    pub g_x: i32,
    pub player_x: i32, pub player_y: i32,
}

impl Mover<'_> {
    fn trand(&mut self) -> i32 { (self.rng.next_f32() * 65536.0) as i32 & 0xffff }

    fn furthestangle(&mut self, b: &Body, angs: i32) -> i16 {
        if (b.regs.count & 63) > 2 { return (*b.ang + 1024) & 2047; }
        let mut greatest = i32::MIN;
        let mut best = 0i32;
        let inc = 2048 / angs;
        let mut j = *b.ang as i32;
        while j < 2048 + *b.ang as i32 {
            let d = (self.hits)(b.x, b.y, b.z - (8 << 8), (j & 2047) as i16);
            if d > greatest { greatest = d; best = j; }
            j += inc;
        }
        (best & 2047) as i16
    }

    fn alterang(&mut self, b: &mut Body, a: i32, moveptr: usize) {
        let ticselapsed = b.regs.count & 31;
        let aang = *b.ang;
        let mv = self.bytecode[moveptr];
        let mvv = self.bytecode[moveptr + 1];
        *b.xvel += ((mv - *b.xvel as i32) / 5) as i16;
        if *b.zvel < 648 { *b.zvel += (((mvv << 4) - *b.zvel as i32) / 5) as i16; }

        if a & mf::SEEK_PLAYER != 0 {
            // No holoduke: the owner is the player, aimed at where it was last seen.
            let goalang = get_angle(b.regs.last_vx - b.x, b.regs.last_vy - b.y);
            if *b.xvel != 0 && !b.is_drone {
                let angdif = getincangle(aang, goalang);
                if ticselapsed < 2 {
                    if angdif.abs() < 256 {
                        let j = (128 - (self.trand() & 256)) as i16;
                        *b.ang = (*b.ang + j) & 2047;
                        if (self.hits)(b.x, b.y, b.z, *b.ang) < 844 { *b.ang = (*b.ang - j) & 2047; }
                    }
                } else if ticselapsed > 18 && ticselapsed < 26 {
                    if (angdif >> 2).abs() < 128 { *b.ang = goalang; } else { *b.ang = (*b.ang + (angdif >> 2)) & 2047; }
                }
            } else {
                *b.ang = goalang;
            }
        }

        if ticselapsed < 1 && (a & (mf::FURTHEST_DIR | mf::FLEE_ENEMY)) != 0 {
            let g = self.furthestangle(b, 2);
            *b.ang = g;
        }
    }

    /// Duke's move(). Returns the (dx, dy, dz) to try this tick.
    pub fn step(&mut self, b: &mut Body) -> (i32, i32, i32) {
        let mut a = b.hitag as i32;
        if a == -1 { a = 0; }
        b.regs.count += 1;
        let t0 = b.regs.count;
        let (px, py) = (b.player_x, b.player_y);

        if a & mf::FACE_PLAYER != 0 {
            let goalang = get_angle(px - b.x, py - b.y);
            let mut angdif = getincangle(*b.ang, goalang) >> 2;
            if angdif > -8 && angdif < 0 { angdif = 0; }
            *b.ang = (*b.ang + angdif) & 2047;
        }
        if a & mf::SPIN != 0 {
            *b.ang = (*b.ang + (self.trig.sin(((t0 << 3) & 2047) as i16) >> 6) as i16) & 2047;
        }
        if a & mf::FACE_PLAYER_SLOW != 0 {
            let goalang = get_angle(px - b.x, py - b.y);
            let mut angdif = getincangle(*b.ang, goalang).signum() << 5;
            if angdif > -32 && angdif < 0 { angdif = 0; *b.ang = goalang; }
            *b.ang = (*b.ang + angdif) & 2047;
        }
        if (a & mf::JUMP_TO_PLAYER) == mf::JUMP_TO_PLAYER && t0 < 16 {
            *b.zvel -= (self.trig.sin(((512 + (t0 << 4)) & 2047) as i16) >> 5) as i16;
        }
        if a & mf::FACE_PLAYER_SMART != 0 {
            // The player's velocity isn't tracked here; aim at where it is.
            let goalang = get_angle(px - b.x, py - b.y);
            let mut angdif = getincangle(*b.ang, goalang) >> 2;
            if angdif > -8 && angdif < 0 { angdif = 0; }
            *b.ang = (*b.ang + angdif) & 2047;
        }

        let Some(moveptr) = b.regs.move_ptr.filter(|&p| p != 0 && p + 1 < self.bytecode.len()) else { return (0, 0, 0) };
        if a == 0 { return (0, 0, 0); }

        if a & mf::GET_H != 0 { *b.xvel += ((self.bytecode[moveptr] - *b.xvel as i32) >> 1) as i16; }
        if a & mf::GET_V != 0 { *b.zvel += (((self.bytecode[moveptr + 1] << 4) - *b.zvel as i32) >> 1) as i16; }
        // dodgebullet needs the weapons list; the host's bullet_near stands in.
        self.alterang(b, a, moveptr);
        if *b.xvel > -6 && *b.xvel < 6 { *b.xvel = 0; }

        if *b.xvel == 0 && *b.zvel == 0 { return (0, 0, 0); }

        let mut daxvel = *b.xvel as i32;
        let mut angdif = *b.ang;
        if b.badguy {
            if b.g_x < 960 && b.xrepeat > 16 {
                // Too close: back off from the player.
                daxvel = -(1024 - b.g_x);
                angdif = get_angle(px - b.x, py - b.y);
            } else if !b.is_drone && !b.is_shark && !b.is_commander {
                // Normal skill: move every 2nd tick on slopes, every 4th on level ground.
                if b.bposz != b.z {
                    if t0 & 1 != 0 { return (0, 0, 0); }
                    daxvel <<= 1;
                } else {
                    if t0 & 3 != 0 { return (0, 0, 0); }
                    daxvel <<= 2;
                }
            }
        }
        let dx = (daxvel * self.trig.sin(((angdif as i32 + 512) & 2047) as i16)) >> 14;
        let dy = (daxvel * self.trig.sin((angdif as i32 & 2047) as i16)) >> 14;
        (dx, dy, *b.zvel as i32)
    }
}
