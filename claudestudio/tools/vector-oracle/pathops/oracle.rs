//! Claude Studio's oracle for the Vector Editor's booleans and gradients: reads cases (JSON) and
//! answers each with VectorCraft's own code, natively. `pathfinder` cases carry the flat input the
//! wasm build (web/vector/pathops.wasm, lib.rs) takes, so test/vector.test.mjs can hold the wasm to
//! the native answer; `grad*` cases go through vectorcraft-color's gradient model, which
//! web/vector/gradient.js ports.
use claudestudio_pathops::run;
use kurbo::{Point, Rect};
use serde_json::{Value, json};
use vectorcraft_color::gradient::{Gradient, GradientGeom, GradientKind, GradientStop};
use vectorcraft_color::Color;

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}
fn kind(v: &Value) -> GradientKind {
    if v.as_str() == Some("radial") { GradientKind::Radial } else { GradientKind::Linear }
}
fn gradient(v: &Value) -> Gradient {
    let stops = v.as_array().unwrap().iter().map(|s| {
        let c = &s["color"];
        GradientStop {
            opacity: f(&s["opacity"]) as f32,
            midpoint: f(&s["midpoint"]) as f32,
            ..GradientStop::new(f(&s["offset"]) as f32, Color::rgb(f(&c[0]) as f32, f(&c[1]) as f32, f(&c[2]) as f32))
        }
    });
    Gradient { kind: GradientKind::Linear, stops: stops.collect() }
}
fn pt(p: Point) -> Value {
    json!([p.x, p.y])
}

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let out: Vec<Value> = cases
        .iter()
        .map(|c| match c["op"].as_str().unwrap() {
            "pathfinder" => {
                let input: Vec<f64> = c["flat"].as_array().unwrap().iter().map(f).collect();
                json!(run(&input))
            }
            "gradFit" => {
                let r = &c["r"];
                let g = GradientGeom::fit(kind(&c["kind"]), Rect::new(f(&r[0]), f(&r[1]), f(&r[2]), f(&r[3])), f(&c["angle"]));
                json!({ "start": pt(g.start), "end": pt(g.end) })
            }
            "gradSample" => {
                let g = gradient(&c["stops"]);
                json!(c["t"].as_array().unwrap().iter().map(|t| {
                    let (col, o) = g.sample(f(t) as f32);
                    let [r, gg, b] = col.to_rgb();
                    json!([r, gg, b, o])
                }).collect::<Vec<_>>())
            }
            "gradExpanded" => {
                let g = gradient(&c["stops"]);
                json!(g.expanded_stops().iter().map(|(t, col, o)| {
                    let [r, gg, b] = col.to_rgb();
                    json!([t, r, gg, b, o])
                }).collect::<Vec<_>>())
            }
            "gradParam" => {
                let (s, e) = (&c["start"], &c["end"]);
                let g = GradientGeom { start: Point::new(f(&s[0]), f(&s[1])), end: Point::new(f(&e[0]), f(&e[1])), aspect: f(&c["aspect"]), focal: None };
                let k = kind(&c["kind"]);
                json!(c["points"].as_array().unwrap().iter().map(|p| g.param_at(k, Point::new(f(&p[0]), f(&p[1])))).collect::<Vec<_>>())
            }
            op => panic!("unknown op {op}"),
        })
        .collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
