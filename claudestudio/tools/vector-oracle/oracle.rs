//! Claude Studio's oracle for web/vector/geom.js: reads cases (JSON), runs each through
//! vectorcraft-geom's shapes and Live Corners, prints the anchors. Copied into the crate's
//! examples by run.sh.
use serde_json::{json, Value};
use vectorcraft_geom::corners::{cut_corners, path_corners};
use vectorcraft_geom::shapes::{self, CornerKind};
use vectorcraft_geom::{Anchor, AnchorKind, PathData, Point, Rect, SubPath};

fn f(v: &Value) -> f64 { v.as_f64().unwrap() }
fn pt(v: &Value) -> Point { Point::new(f(&v[0]), f(&v[1])) }
fn rect(v: &Value) -> Rect { Rect::new(f(&v[0]), f(&v[1]), f(&v[2]), f(&v[3])) }
fn kind(s: &Value) -> CornerKind {
    match s.as_str().unwrap() { "Round" => CornerKind::Round, "InvertedRound" => CornerKind::InvertedRound, _ => CornerKind::Chamfer }
}
fn path_in(v: &Value) -> PathData {
    PathData::new(v.as_array().unwrap().iter().map(|sp| {
        let anchors = sp["anchors"].as_array().unwrap().iter().map(|a| Anchor {
            p: Point::new(f(&a[0]), f(&a[1])), h_in: Point::new(f(&a[2]), f(&a[3])), h_out: Point::new(f(&a[4]), f(&a[5])),
            kind: if a[6].as_str() == Some("Smooth") { AnchorKind::Smooth } else { AnchorKind::Corner },
        }).collect();
        SubPath::new(anchors, sp["closed"].as_bool().unwrap())
    }).collect())
}
fn path_out(p: &PathData) -> Value {
    json!(p.subpaths.iter().map(|sp| json!({
        "closed": sp.closed,
        "anchors": sp.anchors.iter().map(|a| json!([a.p.x, a.p.y, a.h_in.x, a.h_in.y, a.h_out.x, a.h_out.y,
            if a.kind == AnchorKind::Smooth { "Smooth" } else { "Corner" }])).collect::<Vec<_>>(),
    })).collect::<Vec<_>>())
}

fn main() {
    let file = std::env::args().nth(1).expect("cases.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    let out: Vec<Value> = cases.iter().map(|c| match c["op"].as_str().unwrap() {
        "rect" => path_out(&shapes::rectangle(rect(&c["r"]))),
        "corners" => {
            let radii: Vec<f64> = c["radii"].as_array().unwrap().iter().map(f).collect();
            let kinds: Vec<CornerKind> = c["kinds"].as_array().unwrap().iter().map(kind).collect();
            path_out(&shapes::rectangle_with_corners(rect(&c["r"]), [radii[0], radii[1], radii[2], radii[3]], [kinds[0], kinds[1], kinds[2], kinds[3]]))
        }
        "ellipse" => path_out(&shapes::ellipse(rect(&c["r"]))),
        "pie" => path_out(&shapes::ellipse_pie(rect(&c["r"]), f(&c["start"]), f(&c["end"]))),
        "polygon" => path_out(&shapes::polygon(pt(&c["c"]), f(&c["radius"]), c["sides"].as_u64().unwrap() as u32, f(&c["rot"]))),
        "star" => path_out(&shapes::star(pt(&c["c"]), f(&c["r1"]), f(&c["r2"]), c["points"].as_u64().unwrap() as u32, f(&c["rot"]))),
        "starInner" => json!(shapes::straight_star_inner_radius(f(&c["r1"]), c["points"].as_u64().unwrap() as u32)),
        "line" => path_out(&shapes::line(pt(&c["a"]), pt(&c["b"]))),
        "pathCorners" => json!(path_corners(&path_in(&c["path"])).iter().map(|k| json!({
            "index": k.index, "angle": k.angle_deg(), "lu": k.lu, "lv": k.lv, "max": k.max_radius(),
        })).collect::<Vec<_>>()),
        "cut" => {
            let radii: Vec<f64> = c["radii"].as_array().unwrap().iter().map(f).collect();
            let kinds: Vec<CornerKind> = c["kinds"].as_array().unwrap().iter().map(kind).collect();
            let (p, from) = cut_corners(&path_in(&c["path"]), &radii, &kinds);
            json!({ "path": path_out(&p), "from": from })
        }
        op => panic!("unknown op {op}"),
    }).collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
