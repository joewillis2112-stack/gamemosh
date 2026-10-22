// Oracle for Claude Studio's brush engine (web/paint/brush.js): renders every case
// in test/fixtures/paint/cases.json with PhotoCraft's own brush engine (crates/paint)
// and prints the dabs and the pixels (RGBA, 32-bit float, as hex of the f32 bits).
// Built by tools/paint-oracle/run.sh as an example of photocraft-paint, at a pinned commit.
use photocraft_color::PixelFormat;
use photocraft_geom::Rect;
use photocraft_paint::{apply_stroke, dabs, BrushSettings, Stroke, StrokePoint};
use photocraft_raster::Surface;

fn main() {
    let path = std::env::args().nth(1).expect("cases.json");
    let cases: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(path).expect("read")).expect("json");
    let mut out = Vec::new();
    for c in &cases {
        let (w, h) = (c["w"].as_i64().unwrap() as i32, c["h"].as_i64().unwrap() as i32);
        let brush: BrushSettings = serde_json::from_value(c["brush"].clone()).expect("brush");
        let points: Vec<StrokePoint> = c["points"].as_array().unwrap().iter().map(|p| {
            let a = p.as_array().unwrap();
            StrokePoint::new(a[0].as_f64().unwrap(), a[1].as_f64().unwrap(), a.get(2).map_or(1.0, |v| v.as_f64().unwrap() as f32))
        }).collect();
        let mut s = Surface::new(PixelFormat::RGBA32F);
        if let Some(f) = c.get("fill").and_then(|f| f.as_array()) {
            let px: Vec<f32> = f.iter().map(|v| v.as_f64().unwrap() as f32).collect();
            s.fill_rect(Rect::new(0, 0, w, h), &px);
        }
        let stroke = Stroke { brush, points };
        let ds = dabs(&stroke);
        apply_stroke(&mut s, &stroke, None, false);
        let mut hex = String::with_capacity((w * h * 4 * 8) as usize);
        for y in 0..h { for x in 0..w { for v in s.pixel(x, y) { hex.push_str(&format!("{:08x}", v.to_bits())); } } }
        let dj: Vec<serde_json::Value> = ds.iter().map(|d| serde_json::json!([d.center.x, d.center.y, d.radius, d.alpha, d.opacity, d.angle, d.roundness])).collect();
        out.push(serde_json::json!({ "name": c["name"], "dabs": dj, "pixels": hex }));
    }
    println!("{}", serde_json::to_string(&out).unwrap());
}
