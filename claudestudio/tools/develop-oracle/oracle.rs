//! Claude Studio's oracle for web/paint/develop.js: renders each case's 8-bit sRGB image through
//! LightCraft's develop pipeline (`render`, a rendered/non-raw source) with the case's settings
//! and prints the 8-bit result. Copied into the pipeline crate's examples by run.sh.
use lightcraft_color::transfer::decode_srgb8;
use lightcraft_color::{REC2020, SRGB};
use lightcraft_develop::DevelopSettings;
use lightcraft_pipeline::{RenderRequest, SourceInfo, render};
use lightcraft_raster::Rgb32f;
use serde_json::{Value, json};

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let (w, h) = (v["w"].as_u64().unwrap() as usize, v["h"].as_u64().unwrap() as usize);
    let px: Vec<u8> = hex(v["pixels"].as_str().unwrap());
    let m = SRGB.to_space(&REC2020);
    let mut src = Rgb32f::new(w, h);
    for i in 0..w * h {
        src.data[i] = m.apply_f32([decode_srgb8(px[i * 3]), decode_srgb8(px[i * 3 + 1]), decode_srgb8(px[i * 3 + 2])]);
    }
    let out: Vec<Value> = v["cases"].as_array().unwrap().iter().map(|c| {
        let s: DevelopSettings = serde_json::from_value(c["settings"].clone()).unwrap();
        let r = render(&src, &SourceInfo::default(), &s, &RenderRequest::fit(w, h));
        assert_eq!((r.image.width, r.image.height), (w, h));
        let rgb: String = r.image.data.iter().flat_map(|p| p[..3].iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>()).collect();
        json!({ "name": c["name"], "rgb": rgb })
    }).collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
fn hex(s: &str) -> Vec<u8> { (0..s.len() / 2).map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap()).collect() }
