// Oracle for Claude Studio's brush presets (web/paint/presets.js): for each name in
// test/fixtures/paint/preset-cases.json, PhotoCraft's own built-in preset (crates/paint presets.rs)
// as its JSON, and one stroke painted with it (its coverage, alpha in 16 bits).
// Built by tools/paint-oracle/run.sh as an example of photocraft-paint, at a pinned commit.
use photocraft_color::PixelFormat;
use photocraft_paint::{apply_stroke, presets, Stroke, StrokePoint};
use photocraft_raster::Surface;

fn main() {
    let path = std::env::args().nth(1).expect("preset-cases.json");
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).expect("read")).expect("json");
    let (w, h) = (v["w"].as_i64().unwrap() as i32, v["h"].as_i64().unwrap() as i32);
    let all = presets::builtin();
    let mut out = Vec::new();
    for name in v["names"].as_array().unwrap() {
        let name = name.as_str().unwrap();
        let Some(p) = presets::find(&all, name) else { out.push(serde_json::json!({ "name": name, "missing": true })); continue };
        let mut brush = p.brush.clone();
        brush.color = [0.8, 0.2, 0.1, 1.0];
        let points: Vec<StrokePoint> = v["points"].as_array().unwrap().iter().map(|q| {
            let a = q.as_array().unwrap();
            StrokePoint::new(a[0].as_f64().unwrap(), a[1].as_f64().unwrap(), a[2].as_f64().unwrap() as f32)
        }).collect();
        let mut s = Surface::new(PixelFormat::RGBA32F);
        let stroke = Stroke { brush, points };
        apply_stroke(&mut s, &stroke, None, false);
        // Coverage only (the colour is the same wherever it paints), as 16-bit hex: kept small.
        let mut hex = String::with_capacity((w * h * 4) as usize);
        for y in 0..h { for x in 0..w { hex.push_str(&format!("{:04x}", (s.pixel(x, y)[3].clamp(0.0, 1.0) * 65535.0).round() as u16)); } }
        out.push(serde_json::json!({ "name": name, "brush": serde_json::to_value(&p.brush).unwrap(), "alpha16": hex }));
    }
    println!("{}", serde_json::to_string(&out).unwrap());
}
