//! mathlib.c: vectors as id wrote them. Where C mixes float and double
//! (sin/cos/sqrt return double, M_PI is double), this does the same, so
//! results match the original bit for bit as far as f32 allows.
pub type Vec3 = [f32; 3];
pub const PITCH: usize = 0;
pub const YAW: usize = 1;
pub const ROLL: usize = 2;
const M_PI: f64 = std::f64::consts::PI;

#[inline] pub fn dot(a: Vec3, b: Vec3) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
#[inline] pub fn sub(a: Vec3, b: Vec3) -> Vec3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
#[inline] pub fn add(a: Vec3, b: Vec3) -> Vec3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
#[inline] pub fn scale(a: Vec3, s: f32) -> Vec3 { [a[0] * s, a[1] * s, a[2] * s] }
/// VectorMA: a + scale*b
#[inline] pub fn ma(a: Vec3, s: f32, b: Vec3) -> Vec3 { [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]] }
pub fn cross(a: Vec3, b: Vec3) -> Vec3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
/// Length: sqrt in double, as C's sqrt.
pub fn length(v: Vec3) -> f32 { let l: f32 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]; (l as f64).sqrt() as f32 }

pub fn normalize(v: &mut Vec3) -> f32 {
    let l: f32 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    let l = (l as f64).sqrt() as f32;
    if l != 0.0 {
        let il = 1.0 / l;
        v[0] *= il; v[1] *= il; v[2] *= il;
    }
    l
}

pub fn angle_vectors(angles: Vec3) -> (Vec3, Vec3, Vec3) {
    let a = (angles[YAW] as f64 * (M_PI * 2.0 / 360.0)) as f32;
    let (sy, cy) = ((a as f64).sin() as f32, (a as f64).cos() as f32);
    let a = (angles[PITCH] as f64 * (M_PI * 2.0 / 360.0)) as f32;
    let (sp, cp) = ((a as f64).sin() as f32, (a as f64).cos() as f32);
    let a = (angles[ROLL] as f64 * (M_PI * 2.0 / 360.0)) as f32;
    let (sr, cr) = ((a as f64).sin() as f32, (a as f64).cos() as f32);
    let forward = [cp * cy, cp * sy, -sp];
    let right = [-1.0 * sr * sp * cy + -1.0 * cr * -sy, -1.0 * sr * sp * sy + -1.0 * cr * cy, -1.0 * sr * cp];
    let up = [cr * sp * cy + -sr * -sy, cr * sp * sy + -sr * cy, cr * cp];
    (forward, right, up)
}

pub fn anglemod(a: f32) -> f32 {
    ((360.0f64 / 65536.0) * (((a as f64 * (65536.0 / 360.0)) as i32) & 65535) as f64) as f32
}

/// BOX_ON_PLANE_SIDE: 1 = in front, 2 = behind, 3 = both.
pub fn box_on_plane_side(emins: Vec3, emaxs: Vec3, p: &crate::bsp::Plane) -> i32 {
    if p.typ < 3 {
        let t = p.typ as usize;
        return if p.dist <= emins[t] { 1 } else if p.dist >= emaxs[t] { 2 } else { 3 };
    }
    let n = p.normal;
    let (a, b) = match p.signbits {
        0 => (emaxs, emins), 7 => (emins, emaxs),
        _ => {
            let mut d1 = [0.0f32; 3];
            let mut d2 = [0.0f32; 3];
            for i in 0..3 { if p.signbits & (1 << i) != 0 { d1[i] = emins[i]; d2[i] = emaxs[i]; } else { d1[i] = emaxs[i]; d2[i] = emins[i]; } }
            (d1, d2)
        }
    };
    let dist1 = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    let dist2 = n[0] * b[0] + n[1] * b[1] + n[2] * b[2];
    let mut sides = 0;
    if dist1 >= p.dist { sides = 1; }
    if dist2 < p.dist { sides |= 2; }
    sides
}
