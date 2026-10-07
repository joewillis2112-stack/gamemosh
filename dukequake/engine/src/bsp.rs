//! Quake BSP version 29: what the server needs (planes, clipnodes, hulls,
//! leafs, submodels, entities), from model.c's Mod_LoadBrushModel.
use crate::mathlib::Vec3;

pub const CONTENTS_EMPTY: i32 = -1;
pub const CONTENTS_SOLID: i32 = -2;
pub const CONTENTS_WATER: i32 = -3;
pub const CONTENTS_SLIME: i32 = -4;
pub const CONTENTS_LAVA: i32 = -5;
pub const CONTENTS_SKY: i32 = -6;

#[derive(Clone, Copy, Debug, Default)]
pub struct Plane { pub normal: Vec3, pub dist: f32, pub typ: u8, pub signbits: u8 }

#[derive(Clone, Copy, Debug, Default)]
pub struct ClipNode { pub planenum: i32, pub children: [i16; 2] }

#[derive(Clone, Copy, Debug, Default)]
pub struct Hull {
    pub firstclipnode: i32,
    pub lastclipnode: i32,
    pub clip_mins: Vec3,
    pub clip_maxs: Vec3,
    /// Which clipnode array: 0 = hull 0's (made from the render nodes), 1 = the map's clipnodes.
    pub nodes: u8,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Node { pub planenum: i32, pub children: [i32; 2], pub mins: [i16; 3], pub maxs: [i16; 3], pub firstface: u16, pub numfaces: u16 }

#[derive(Clone, Copy, Debug, Default)]
pub struct Leaf { pub contents: i32, pub visofs: i32, pub mins: [i16; 3], pub maxs: [i16; 3], pub firstmarksurface: u16, pub nummarksurfaces: u16, pub ambient: [u8; 4] }

#[derive(Clone, Copy, Debug, Default)]
pub struct SubModel { pub mins: Vec3, pub maxs: Vec3, pub origin: Vec3, pub headnode: [i32; 4], pub visleafs: i32, pub firstface: i32, pub numfaces: i32 }

/// One brush model: the world ("maps/x.bsp") or a submodel ("*1", "*2", ...),
/// each with its own hulls into the shared arrays.
#[derive(Clone, Debug, Default)]
pub struct BrushModel { pub name: String, pub hulls: [Hull; 4], pub mins: Vec3, pub maxs: Vec3, pub numleafs: i32, pub firstface: i32, pub numfaces: i32 }

#[derive(Default)]
pub struct Bsp {
    pub data: Vec<u8>,
    pub lumps: [(usize, usize); 15],
    pub planes: Vec<Plane>,
    pub clipnodes: Vec<ClipNode>,
    pub hull0: Vec<ClipNode>,
    pub nodes: Vec<Node>,
    pub leafs: Vec<Leaf>,
    pub submodels: Vec<SubModel>,
    pub models: Vec<BrushModel>,
    pub entities: String,
    pub visdata: Vec<u8>,
}

fn le32(b: &[u8], o: usize) -> i32 { i32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) }
fn le16(b: &[u8], o: usize) -> i16 { i16::from_le_bytes([b[o], b[o + 1]]) }
fn lef(b: &[u8], o: usize) -> f32 { f32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) }

pub const LUMP_ENTITIES: usize = 0;
pub const LUMP_PLANES: usize = 1;
pub const LUMP_TEXTURES: usize = 2;
pub const LUMP_VERTEXES: usize = 3;
pub const LUMP_VISIBILITY: usize = 4;
pub const LUMP_NODES: usize = 5;
pub const LUMP_TEXINFO: usize = 6;
pub const LUMP_FACES: usize = 7;
pub const LUMP_LIGHTING: usize = 8;
pub const LUMP_CLIPNODES: usize = 9;
pub const LUMP_LEAFS: usize = 10;
pub const LUMP_MARKSURFACES: usize = 11;
pub const LUMP_EDGES: usize = 12;
pub const LUMP_SURFEDGES: usize = 13;
pub const LUMP_MODELS: usize = 14;

impl Bsp {
    pub fn empty() -> Bsp { Bsp::default() }
    pub fn lump(&self, i: usize) -> &[u8] { let (o, l) = self.lumps[i]; &self.data[o..o + l] }

    pub fn parse(name: &str, data: Vec<u8>) -> Result<Bsp, String> {
        if le32(&data, 0) != 29 { return Err(format!("{name}: not BSP version 29")); }
        let mut lumps = [(0usize, 0usize); 15];
        for (i, l) in lumps.iter_mut().enumerate() { *l = (le32(&data, 4 + i * 8) as usize, le32(&data, 8 + i * 8) as usize); }
        let lump = |i: usize| -> &[u8] { let (o, l) = lumps[i]; &data[o..o + l] };

        // Mod_LoadPlanes
        let b = lump(LUMP_PLANES);
        let planes: Vec<Plane> = (0..b.len() / 20).map(|i| {
            let o = i * 20;
            let normal = [lef(b, o), lef(b, o + 4), lef(b, o + 8)];
            let mut bits = 0u8;
            for (j, n) in normal.iter().enumerate() { if *n < 0.0 { bits |= 1 << j; } }
            Plane { normal, dist: lef(b, o + 12), typ: le32(b, o + 16) as u8, signbits: bits }
        }).collect();
        // Mod_LoadLeafs
        let b = lump(LUMP_LEAFS);
        let leafs: Vec<Leaf> = (0..b.len() / 28).map(|i| {
            let o = i * 28;
            Leaf {
                contents: le32(b, o), visofs: le32(b, o + 4),
                mins: [le16(b, o + 8), le16(b, o + 10), le16(b, o + 12)], maxs: [le16(b, o + 14), le16(b, o + 16), le16(b, o + 18)],
                firstmarksurface: le16(b, o + 20) as u16, nummarksurfaces: le16(b, o + 22) as u16,
                ambient: [b[o + 24], b[o + 25], b[o + 26], b[o + 27]],
            }
        }).collect();
        // Mod_LoadNodes: children >= 0 are nodes, else leaf -1-p.
        let b = lump(LUMP_NODES);
        let nodes: Vec<Node> = (0..b.len() / 24).map(|i| {
            let o = i * 24;
            Node {
                planenum: le32(b, o), children: [le16(b, o + 4) as i32, le16(b, o + 6) as i32],
                mins: [le16(b, o + 8), le16(b, o + 10), le16(b, o + 12)], maxs: [le16(b, o + 14), le16(b, o + 16), le16(b, o + 18)],
                firstface: le16(b, o + 20) as u16, numfaces: le16(b, o + 22) as u16,
            }
        }).collect();
        // Mod_LoadClipnodes
        let b = lump(LUMP_CLIPNODES);
        let clipnodes: Vec<ClipNode> = (0..b.len() / 8).map(|i| ClipNode { planenum: le32(b, i * 8), children: [le16(b, i * 8 + 4), le16(b, i * 8 + 6)] }).collect();
        // Mod_MakeHull0: the render nodes as clipnodes, leaf children as their contents.
        let hull0: Vec<ClipNode> = nodes.iter().map(|n| {
            let mut c = [0i16; 2];
            for j in 0..2 {
                let p = n.children[j];
                c[j] = if p < 0 { leafs[(-1 - p) as usize].contents as i16 } else { p as i16 };
            }
            ClipNode { planenum: n.planenum, children: c }
        }).collect();
        // Mod_LoadSubmodels: mins/maxs spread by a pixel.
        let b = lump(LUMP_MODELS);
        let submodels: Vec<SubModel> = (0..b.len() / 64).map(|i| {
            let o = i * 64;
            SubModel {
                mins: [lef(b, o) - 1.0, lef(b, o + 4) - 1.0, lef(b, o + 8) - 1.0],
                maxs: [lef(b, o + 12) + 1.0, lef(b, o + 16) + 1.0, lef(b, o + 20) + 1.0],
                origin: [lef(b, o + 24), lef(b, o + 28), lef(b, o + 32)],
                headnode: [le32(b, o + 36), le32(b, o + 40), le32(b, o + 44), le32(b, o + 48)],
                visleafs: le32(b, o + 52), firstface: le32(b, o + 56), numfaces: le32(b, o + 60),
            }
        }).collect();
        let ents = lump(LUMP_ENTITIES);
        let entities = String::from_utf8_lossy(&ents[..ents.iter().position(|&c| c == 0).unwrap_or(ents.len())]).to_string();
        let visdata = lump(LUMP_VISIBILITY).to_vec();

        // Mod_LoadBrushModel's submodel setup: the world is model 0, "*i" the rest.
        let (nnodes, nclip) = (nodes.len() as i32, clipnodes.len() as i32);
        let base_hulls = [
            Hull { firstclipnode: 0, lastclipnode: nnodes - 1, clip_mins: [0.0; 3], clip_maxs: [0.0; 3], nodes: 0 },
            Hull { firstclipnode: 0, lastclipnode: nclip - 1, clip_mins: [-16.0, -16.0, -24.0], clip_maxs: [16.0, 16.0, 32.0], nodes: 1 },
            Hull { firstclipnode: 0, lastclipnode: nclip - 1, clip_mins: [-32.0, -32.0, -24.0], clip_maxs: [32.0, 32.0, 64.0], nodes: 1 },
            Hull { firstclipnode: 0, lastclipnode: 0, clip_mins: [0.0; 3], clip_maxs: [0.0; 3], nodes: 1 },
        ];
        let models = submodels.iter().enumerate().map(|(i, bm)| {
            let mut hulls = base_hulls;
            hulls[0].firstclipnode = bm.headnode[0];
            for j in 1..4 { hulls[j].firstclipnode = bm.headnode[j]; hulls[j].lastclipnode = nclip - 1; }
            BrushModel { name: if i == 0 { name.to_string() } else { format!("*{i}") }, hulls, mins: bm.mins, maxs: bm.maxs, numleafs: bm.visleafs, firstface: bm.firstface, numfaces: bm.numfaces }
        }).collect();
        Ok(Bsp { data: Vec::new(), lumps, planes, clipnodes, hull0, nodes, leafs, submodels, models, entities, visdata }.with_data(data))
    }

    fn with_data(mut self, data: Vec<u8>) -> Bsp { self.data = data; self }

    pub fn hull_nodes(&self, h: &Hull) -> &[ClipNode] { if h.nodes == 0 { &self.hull0 } else { &self.clipnodes } }

    /// Mod_PointInLeaf: the leaf index containing point p (world model).
    pub fn point_in_leaf(&self, p: Vec3) -> usize {
        let mut n: i32 = 0;
        loop {
            if n < 0 { return (-1 - n) as usize; }
            let node = &self.nodes[n as usize];
            let pl = &self.planes[node.planenum as usize];
            let d = crate::mathlib::dot(p, pl.normal) - pl.dist;
            n = if d > 0.0 { node.children[0] } else { node.children[1] };
        }
    }

    /// Mod_DecompressVis for a leaf: one bit per visible leaf.
    pub fn leaf_pvs(&self, leaf: usize) -> Vec<u8> {
        let row = ((self.models[0].numleafs + 7) >> 3) as usize;
        let l = &self.leafs[leaf];
        if l.visofs < 0 || self.visdata.is_empty() || leaf == 0 { return vec![0xff; row]; }
        let mut out = Vec::with_capacity(row);
        let mut i = l.visofs as usize;
        while out.len() < row {
            let c = self.visdata[i];
            if c != 0 { out.push(c); i += 1; continue; }
            let n = self.visdata[i + 1] as usize;
            i += 2;
            for _ in 0..n { if out.len() < row { out.push(0); } }
        }
        out
    }
}
