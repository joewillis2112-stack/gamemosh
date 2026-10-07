use dqengine::{bsp::Bsp, pak::Pak};
fn main() {
    let pak = Pak::parse(std::fs::read(std::env::args().nth(1).unwrap()).unwrap()).unwrap();
    for m in ["maps/start.bsp", "maps/e1m1.bsp"] {
        let b = Bsp::parse(m, pak.get(m).unwrap().to_vec()).unwrap();
        let ents = b.entities.matches('{').count();
        println!("{m}: {} planes, {} nodes, {} clipnodes, {} leafs, {} models, {} entities; leaf at origin {}", b.planes.len(), b.nodes.len(), b.clipnodes.len(), b.leafs.len(), b.models.len(), ents, b.point_in_leaf([0.0; 3]));
    }
    println!("progs.dat {} bytes", pak.get("progs.dat").unwrap().len());
}
