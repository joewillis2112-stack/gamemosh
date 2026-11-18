//! Claude Studio's oracle for web/paint/selection.js: each case builds or changes a selection with
//! PhotoCraft's own code (photocraft_algo::selection, as the engine's select.rect, select.lasso
//! and Select › Modify › Feather call it) and prints the selection's stored bytes (GRAY8), or a
//! raw f32 mask where noted. Copied into crates/algo/examples by run.sh.
use photocraft_algo::selection::{self as sel, SelectionMode};
use photocraft_color::PixelFormat;
use photocraft_geom::Rect;
use photocraft_raster::Surface;
use serde_json::{Value, json};

fn mask(v: &Value) -> Vec<f32> {
    v.as_array().unwrap().iter().map(|b| b.as_u64().unwrap() as u8 as f32 / 255.0).collect()
}
fn bytes(m: &[f32]) -> Value {
    json!(m.iter().map(|v| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8).collect::<Vec<u8>>())
}
fn surface(m: &[f32], area: Rect) -> Surface {
    sel::mask_to_surface(m, area)
}
fn rect(v: &Value) -> Rect {
    let g = |i: usize| v[i].as_i64().unwrap() as i32;
    Rect::new(g(0), g(1), g(2), g(3))
}

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let out: Vec<Value> = cases
        .iter()
        .map(|c| {
            let (w, h) = (c["w"].as_u64().unwrap() as u32, c["h"].as_u64().unwrap() as u32);
            let area = Rect::from_xywh(0, 0, w, h);
            let old = c.get("old").filter(|v| !v.is_null()).map(|v| surface(&mask(v), area));
            let mode = c["mode"].as_str().unwrap_or("replace");
            match c["op"].as_str().unwrap() {
                // select.rect: the marquee shape, then combine_surfaces with the current selection.
                "rect" | "ellipse" => {
                    let r = rect(&c["r"]);
                    let shape = if c["op"] == "ellipse" {
                        sel::ellipse_surface(r, area, c["aa"].as_bool().unwrap_or(true))
                    } else {
                        let mut s = Surface::new(PixelFormat::GRAY8);
                        s.fill_rect(r.intersect(&area), &[1.0]);
                        s
                    };
                    let combined = match (mode, old) {
                        ("add", Some(o)) => sel::combine_surfaces(&o, &shape, area, |a, b| a.max(b)),
                        ("subtract", Some(o)) => sel::combine_surfaces(&o, &shape, area, |a, b| a * (1.0 - b)),
                        ("intersect", Some(o)) => sel::combine_surfaces(&o, &shape, area, |a, b| a.min(b)),
                        ("subtract" | "intersect", None) => Surface::new(PixelFormat::GRAY8),
                        _ => shape,
                    };
                    bytes(&sel::mask_from_surface(Some(&combined), area))
                }
                // select.lasso: the polygon's coverage (raw f32, and combined).
                "lasso" => {
                    let pts: Vec<(f32, f32)> = c["points"].as_array().unwrap().iter().map(|p| (p[0].as_f64().unwrap() as f32, p[1].as_f64().unwrap() as f32)).collect();
                    let m = sel::polygon(&pts, area, c["aa"].as_bool().unwrap_or(true));
                    let s = sel::combine(old.as_ref(), &m, area, SelectionMode::parse(mode));
                    json!({ "raw": m, "stored": bytes(&sel::mask_from_surface(s.as_ref(), area)) })
                }
                // Select › Modify › Feather on a stored selection (raw f32 result).
                "feather" => {
                    let m = mask(&c["m"]);
                    json!(sel::feather(&m, w as usize, h as usize, c["radius"].as_f64().unwrap() as f32))
                }
                op => panic!("unknown op {op}"),
            }
        })
        .collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
