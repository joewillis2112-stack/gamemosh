//! Claude Studio's oracle for web/paint/resample.js: each case is an 8-bit RGBA layer filling its
//! canvas; it goes through PhotoCraft's Image Size resampler (resize_surface_in_canvas, as
//! image_cmds.rs's resample_doc calls it) and comes back as the new canvas's 8-bit pixels.
//! Copied into crates/algo/examples by run.sh.
use photocraft_algo::resample::{Resample, resize_surface_in_canvas};
use photocraft_color::PixelFormat;
use photocraft_geom::Rect;
use photocraft_raster::Surface;
use serde_json::{Value, json};

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let out: Vec<Value> = cases
        .iter()
        .map(|c| {
            let (w, h) = (c["w"].as_u64().unwrap() as u32, c["h"].as_u64().unwrap() as u32);
            let (nw, nh) = (c["nw"].as_u64().unwrap() as u32, c["nh"].as_u64().unwrap() as u32);
            let px: Vec<f32> = c["px"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap() as u8 as f32 / 255.0).collect();
            let filter = match c["filter"].as_str().unwrap() {
                "nearest" => Resample::Nearest,
                "bilinear" => Resample::Bilinear,
                "bicubicSmoother" => Resample::BicubicSmoother,
                "bicubicSharper" => Resample::BicubicSharper,
                _ => Resample::Bicubic,
            };
            let canvas = Rect::from_xywh(0, 0, w, h);
            let mut s = Surface::new(PixelFormat::RGBA8);
            s.write_region(canvas, &px);
            let (sx, sy) = (nw as f64 / w as f64, nh as f64 / h as f64);
            let r = resize_surface_in_canvas(&s, sx, sy, filter, canvas);
            let d = r.read_region(Rect::from_xywh(0, 0, nw, nh));
            json!(d.iter().map(|v| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8).collect::<Vec<u8>>())
        })
        .collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
