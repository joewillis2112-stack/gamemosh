//! Claude Studio's oracle for web/paint/develop.js: renders each case's 8-bit sRGB image through
//! LightCraft's develop pipeline (`render`, a rendered/non-raw source) with the case's settings
//! and prints the 8-bit result. Copied into the pipeline crate's examples by run.sh.
//! Second argument: the spatial scene's pixels (cases.mjs --spatial-pixels); its cases
//! (`spatial.cases` in cases.json) print every `spatial.sample`-th pixel, named "spatial: <name>".
use lightcraft_color::transfer::decode_srgb8;
use lightcraft_color::{REC2020, SRGB};
use lightcraft_develop::DevelopSettings;
use lightcraft_pipeline::{RenderRequest, SourceInfo, render};
use lightcraft_raster::Rgb32f;
use serde_json::{Value, json};

fn image(v: &Value) -> (usize, usize, Rgb32f) {
    let (w, h) = (v["w"].as_u64().unwrap() as usize, v["h"].as_u64().unwrap() as usize);
    let px: Vec<u8> = hex(v["pixels"].as_str().unwrap());
    let m = SRGB.to_space(&REC2020);
    let mut src = Rgb32f::new(w, h);
    for i in 0..w * h {
        src.data[i] = m.apply_f32([decode_srgb8(px[i * 3]), decode_srgb8(px[i * 3 + 1]), decode_srgb8(px[i * 3 + 2])]);
    }
    (w, h, src)
}

fn run(src: &Rgb32f, w: usize, h: usize, cases: &Value, prefix: &str, sample: usize) -> Vec<Value> {
    cases.as_array().unwrap().iter().map(|c| {
        let s: DevelopSettings = serde_json::from_value(c["settings"].clone()).unwrap();
        let r = render(src, &SourceInfo::default(), &s, &RenderRequest::fit(w, h));
        assert_eq!((r.image.width, r.image.height), (w, h));
        let rgb: String = r.image.data.iter().step_by(sample).flat_map(|p| p[..3].iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>()).collect();
        json!({ "name": format!("{prefix}{}", c["name"].as_str().unwrap()), "rgb": rgb })
    }).collect()
}

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let (w, h, src) = image(&v);
    let mut out = run(&src, w, h, &v["cases"], "", 1);
    if let Some(spatial) = std::env::args().nth(2) {
        let p: Value = serde_json::from_str(&std::fs::read_to_string(spatial).unwrap()).unwrap();
        let (sw, sh, simg) = image(&p);
        let sample = v["spatial"]["sample"].as_u64().unwrap() as usize;
        out.extend(run(&simg, sw, sh, &v["spatial"]["cases"], "spatial: ", sample));
    }
    println!("{}", serde_json::to_string(&out).unwrap());
}
fn hex(s: &str) -> Vec<u8> { (0..s.len() / 2).map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap()).collect() }
