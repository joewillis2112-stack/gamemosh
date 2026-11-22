//! Claude Studio's binding to VectorCraft's path booleans (crates/pathops: Illustrator's Pathfinder
//! shape modes on linesweeper's sweep), compiled to wasm for web/vector/pathops.js. No wasm-bindgen:
//! paths go in and out as flat f64 arrays in the module's memory.
//!
//! Input:  [op, shapes, (key, subpaths, (closed, anchors, (px, py, inx, iny, outx, outy, smooth)*)*)*]
//!         op: 0 Unite, 1 Minus Front, 2 Intersect, 3 Exclude, 4 Divide, 5 Trim, 6 Merge, 7 Crop;
//!         shapes back to front; key names the shape's paint (Merge joins shapes of one key).
//! Output: [shapes, (key, subpaths, (closed, anchors, (px, py, inx, iny, outx, outy, smooth)*)*)*]
//!         key: the input whose paint the result keeps; [-1] on bad input.
use vectorcraft_geom::{Anchor, AnchorKind, FillRule, PathData, Point, SubPath};
use vectorcraft_pathops::{PathfinderOp, Shape, pathfinder};

/// Decode, run, encode. Shared by the wasm export and the native oracle.
pub fn run(input: &[f64]) -> Vec<f64> {
    decode(input).map(|(op, shapes)| encode(&pathfinder(op, &shapes))).unwrap_or_else(|| vec![-1.0])
}

fn decode(v: &[f64]) -> Option<(PathfinderOp, Vec<Shape>)> {
    let mut i = 0usize;
    let mut next = || -> Option<f64> {
        let x = *v.get(i)?;
        i += 1;
        x.is_finite().then_some(x)
    };
    let op = match next()? as u32 {
        0 => PathfinderOp::Unite,
        1 => PathfinderOp::MinusFront,
        2 => PathfinderOp::Intersect,
        3 => PathfinderOp::Exclude,
        4 => PathfinderOp::Divide,
        5 => PathfinderOp::Trim,
        6 => PathfinderOp::Merge,
        7 => PathfinderOp::Crop,
        _ => return None,
    };
    let n = next()? as usize;
    let mut shapes = Vec::with_capacity(n.min(1024));
    for _ in 0..n {
        let key = next()? as u64;
        let ns = next()? as usize;
        let mut subs = Vec::with_capacity(ns.min(1024));
        for _ in 0..ns {
            let closed = next()? != 0.0;
            let na = next()? as usize;
            let mut anchors = Vec::with_capacity(na.min(65536));
            for _ in 0..na {
                let p = Point::new(next()?, next()?);
                let h_in = Point::new(next()?, next()?);
                let h_out = Point::new(next()?, next()?);
                let kind = if next()? != 0.0 { AnchorKind::Smooth } else { AnchorKind::Corner };
                anchors.push(Anchor { p, h_in, h_out, kind });
            }
            subs.push(SubPath::new(anchors, closed));
        }
        shapes.push(Shape::new(PathData::new(subs), FillRule::NonZero, key));
    }
    Some((op, shapes))
}

fn encode(shapes: &[Shape]) -> Vec<f64> {
    let mut o = vec![shapes.len() as f64];
    for s in shapes {
        o.push(s.key as f64);
        o.push(s.path.subpaths.len() as f64);
        for sp in &s.path.subpaths {
            o.push(if sp.closed { 1.0 } else { 0.0 });
            o.push(sp.anchors.len() as f64);
            for a in &sp.anchors {
                o.extend([a.p.x, a.p.y, a.h_in.x, a.h_in.y, a.h_out.x, a.h_out.y, if a.kind == AnchorKind::Smooth { 1.0 } else { 0.0 }]);
            }
        }
    }
    o
}

/// Image Trace (VectorCraft's trace crate) of an RGBA8 raster: dark shapes on white, as paths in
/// pixel coordinates, encoded as `run`'s output (key 0 each). `preset` 0: Black and White Logo,
/// 1: Flat Logo (sub-pixel edges, sharp corners restored). Text to outlines draws its glyphs into
/// such a raster and traces them.
pub fn trace_rgba(rgba: &[u8], w: u32, h: u32, preset: u32) -> Vec<f64> {
    if rgba.len() != w as usize * h as usize * 4 || w == 0 || h == 0 {
        return vec![-1.0];
    }
    let img = vectorcraft_trace::Raster { width: w, height: h, rgba: rgba.to_vec() };
    let name = if preset == 1 { "Flat Logo" } else { "Black and White Logo" };
    let Some(mut params) = vectorcraft_trace::preset(name) else { return vec![-1.0] };
    params.ignore_white = true;
    let res = vectorcraft_trace::trace(&img, &params);
    let shapes: Vec<Shape> = res.paths.into_iter().filter(|p| p.stroke.is_none() && p.color.iter().any(|&c| c < 245)).map(|p| Shape::new(p.path, FillRule::NonZero, 0)).collect();
    encode(&shapes)
}

// ---- wasm exports: the caller allocates the input, calls `pathfinder`, reads `out_ptr`/`out_len`.
static mut OUT: Vec<f64> = Vec::new();

#[unsafe(no_mangle)]
pub extern "C" fn alloc(n: usize) -> *mut f64 {
    let mut v = vec![0.0f64; n];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `p` and `n` must come from one `alloc(n)` call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn free(p: *mut f64, n: usize) {
    drop(unsafe { Vec::from_raw_parts(p, n, n) });
}

/// # Safety
/// `p` must point at `n` f64s (from `alloc`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pathfinder_run(p: *const f64, n: usize) -> usize {
    let input = unsafe { std::slice::from_raw_parts(p, n) };
    let out = run(input);
    let len = out.len();
    unsafe { OUT = out };
    len
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc_bytes(n: usize) -> *mut u8 {
    let mut v = vec![0u8; n];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `p` and `n` must come from one `alloc_bytes(n)` call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn free_bytes(p: *mut u8, n: usize) {
    drop(unsafe { Vec::from_raw_parts(p, n, n) });
}

/// # Safety
/// `p` must point at `w * h * 4` bytes (from `alloc_bytes`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn trace_run(p: *const u8, w: u32, h: u32, preset: u32) -> usize {
    let rgba = unsafe { std::slice::from_raw_parts(p, w as usize * h as usize * 4) };
    let out = trace_rgba(rgba, w, h, preset);
    let len = out.len();
    unsafe { OUT = out };
    len
}

#[unsafe(no_mangle)]
pub extern "C" fn out_ptr() -> *const f64 {
    unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() }
}
