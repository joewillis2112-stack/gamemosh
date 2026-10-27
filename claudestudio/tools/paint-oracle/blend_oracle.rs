// Oracle for web/paint/blend.js: composites every (mode, backdrop, source, opacity)
// of test/fixtures/paint/blend-cases.json with PhotoCraft's own blend::composite and
// prints the results as hex of the f32 bits, in the order: mode, backdrop, source, opacity.
use photocraft_color::blend::{composite, BlendMode};

fn main() {
    let path = std::env::args().nth(1).expect("blend-cases.json");
    let c: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).expect("read")).expect("json");
    let modes: Vec<BlendMode> = c["modes"].as_array().unwrap().iter().map(|m| serde_json::from_value(m.clone()).expect("mode")).collect();
    let col = |v: &serde_json::Value| -> [f32; 4] { let a = v.as_array().unwrap(); [0, 1, 2, 3].map(|i| a[i].as_f64().unwrap() as f32) };
    let colors: Vec<[f32; 4]> = c["colors"].as_array().unwrap().iter().map(col).collect();
    let ops: Vec<f32> = c["opacities"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap() as f32).collect();
    let mut hex = String::new();
    for m in &modes { for b in &colors { for s in &colors { for o in &ops {
        for v in composite(*m, *b, *s, *o) { hex.push_str(&format!("{:08x}", v.to_bits())); }
    } } } }
    println!("{}", serde_json::json!({ "results": hex }));
}
