//! world.c: the area grid that holds entities, and every trace through the
//! world and its entities (SV_Move), ported line by line.
use crate::bsp::{ClipNode, Hull, Plane, CONTENTS_EMPTY, CONTENTS_SOLID};
use crate::defs::*;
use crate::mathlib::*;
use crate::server::{Server, FL_ITEM, FL_MONSTER, MOVETYPE_PUSH, SOLID_BSP, SOLID_NOT, SOLID_TRIGGER};

pub const MOVE_NORMAL: i32 = 0;
pub const MOVE_NOMONSTERS: i32 = 1;
pub const MOVE_MISSILE: i32 = 2;
const DIST_EPSILON: f32 = 0.03125;
const AREA_DEPTH: i32 = 4;

#[derive(Clone, Copy, Debug, Default)]
pub struct Trace {
    pub allsolid: bool,
    pub startsolid: bool,
    pub inopen: bool,
    pub inwater: bool,
    pub fraction: f32,
    pub endpos: Vec3,
    pub plane_normal: Vec3,
    pub plane_dist: f32,
    /// The edict hit, if any.
    pub ent: Option<usize>,
}

#[derive(Clone, Debug, Default)]
pub struct AreaNode {
    pub axis: i32,
    pub dist: f32,
    pub children: [usize; 2],
    pub trigger_edicts: Vec<usize>,
    pub solid_edicts: Vec<usize>,
}

/// A hull to trace against: a model's, or the 6-plane box hull.
pub enum HullRef { Model(usize, usize), Box([Plane; 6]) }

/// SV_InitBoxHull's clipnodes (the planes vary per call).
fn box_clipnodes() -> [ClipNode; 6] {
    let mut n = [ClipNode::default(); 6];
    for i in 0..6 {
        n[i].planenum = i as i32;
        let side = i & 1;
        n[i].children[side] = CONTENTS_EMPTY as i16;
        n[i].children[side ^ 1] = if i != 5 { (i + 1) as i16 } else { CONTENTS_SOLID as i16 };
    }
    n
}

/// SV_HullForBox.
pub fn hull_for_box(mins: Vec3, maxs: Vec3) -> [Plane; 6] {
    let mut p = [Plane::default(); 6];
    for i in 0..6 { p[i].typ = (i >> 1) as u8; p[i].normal[i >> 1] = 1.0; }
    p[0].dist = maxs[0]; p[1].dist = mins[0];
    p[2].dist = maxs[1]; p[3].dist = mins[1];
    p[4].dist = maxs[2]; p[5].dist = mins[2];
    p
}

/// A hull resolved to its nodes and planes for one trace.
pub struct HullView<'a> { pub nodes: &'a [ClipNode], pub planes: &'a [Plane], pub first: i32, pub last: i32 }

impl HullView<'_> {
    /// SV_HullPointContents.
    pub fn point_contents(&self, mut num: i32, p: Vec3) -> i32 {
        while num >= 0 {
            if num < self.first || num > self.last { panic!("SV_HullPointContents: bad node number"); }
            let node = &self.nodes[num as usize];
            let plane = &self.planes[node.planenum as usize];
            let d = if plane.typ < 3 { p[plane.typ as usize] - plane.dist } else { dot(plane.normal, p) - plane.dist };
            num = if d < 0.0 { node.children[1] as i32 } else { node.children[0] as i32 };
        }
        num
    }

    /// SV_RecursiveHullCheck.
    pub fn recursive_check(&self, num: i32, p1f: f32, p2f: f32, p1: Vec3, p2: Vec3, tr: &mut Trace) -> bool {
        if num < 0 {
            if num != CONTENTS_SOLID {
                tr.allsolid = false;
                if num == CONTENTS_EMPTY { tr.inopen = true; } else { tr.inwater = true; }
            } else {
                tr.startsolid = true;
            }
            return true;
        }
        if num < self.first || num > self.last { panic!("SV_RecursiveHullCheck: bad node number"); }
        let node = &self.nodes[num as usize];
        let plane = &self.planes[node.planenum as usize];
        let (t1, t2) = if plane.typ < 3 {
            (p1[plane.typ as usize] - plane.dist, p2[plane.typ as usize] - plane.dist)
        } else {
            (dot(plane.normal, p1) - plane.dist, dot(plane.normal, p2) - plane.dist)
        };
        if t1 >= 0.0 && t2 >= 0.0 { return self.recursive_check(node.children[0] as i32, p1f, p2f, p1, p2, tr); }
        if t1 < 0.0 && t2 < 0.0 { return self.recursive_check(node.children[1] as i32, p1f, p2f, p1, p2, tr); }
        let mut frac = if t1 < 0.0 { (t1 + DIST_EPSILON) / (t1 - t2) } else { (t1 - DIST_EPSILON) / (t1 - t2) };
        if frac < 0.0 { frac = 0.0; }
        if frac > 1.0 { frac = 1.0; }
        let mut midf = p1f + (p2f - p1f) * frac;
        let mut mid = [0.0f32; 3];
        for i in 0..3 { mid[i] = p1[i] + frac * (p2[i] - p1[i]); }
        let side = (t1 < 0.0) as usize;
        if !self.recursive_check(node.children[side] as i32, p1f, midf, p1, mid, tr) { return false; }
        if self.point_contents(node.children[side ^ 1] as i32, mid) != CONTENTS_SOLID {
            return self.recursive_check(node.children[side ^ 1] as i32, midf, p2f, mid, p2, tr);
        }
        if tr.allsolid { return false; }
        if side == 0 {
            tr.plane_normal = plane.normal;
            tr.plane_dist = plane.dist;
        } else {
            tr.plane_normal = sub([0.0; 3], plane.normal);
            tr.plane_dist = -plane.dist;
        }
        while self.point_contents(self.first, mid) == CONTENTS_SOLID {
            frac -= 0.1;
            if frac < 0.0 {
                tr.fraction = midf;
                tr.endpos = mid;
                return false;
            }
            midf = p1f + (p2f - p1f) * frac;
            for i in 0..3 { mid[i] = p1[i] + frac * (p2[i] - p1[i]); }
        }
        tr.fraction = midf;
        tr.endpos = mid;
        false
    }
}

impl Server {
    fn hull_view<'a>(&'a self, h: &'a HullRef, boxn: &'a [ClipNode; 6]) -> HullView<'a> {
        match h {
            HullRef::Model(m, i) => {
                let bm = &self.bsp.models[*m];
                let hull: &Hull = &bm.hulls[*i];
                HullView { nodes: self.bsp.hull_nodes(hull), planes: &self.bsp.planes, first: hull.firstclipnode, last: hull.lastclipnode }
            }
            HullRef::Box(p) => HullView { nodes: boxn, planes: p, first: 0, last: 5 },
        }
    }

    /// SV_HullForEntity: the hull to clip an object of mins/maxs against
    /// `ent`, and the offset to add to the object's origin.
    pub fn hull_for_entity(&self, ent: usize, mins: Vec3, maxs: Vec3) -> (HullRef, Vec3) {
        let pr = &self.pr;
        if pr.ef(ent, F_SOLID) as i32 == SOLID_BSP {
            if pr.ef(ent, F_MOVETYPE) as i32 != MOVETYPE_PUSH { panic!("SOLID_BSP without MOVETYPE_PUSH"); }
            let mi = pr.ef(ent, F_MODELINDEX) as usize;
            let m = match self.model_brush(mi) { Some(m) => m, None => panic!("MOVETYPE_PUSH with a non bsp model") };
            let size = sub(maxs, mins);
            let hi = if size[0] < 3.0 { 0 } else if size[0] <= 32.0 { 1 } else { 2 };
            let hull = &self.bsp.models[m].hulls[hi];
            let offset = add(sub(hull.clip_mins, mins), pr.ev(ent, F_ORIGIN));
            (HullRef::Model(m, hi), offset)
        } else {
            let hullmins = sub(pr.ev(ent, F_MINS), maxs);
            let hullmaxs = sub(pr.ev(ent, F_MAXS), mins);
            (HullRef::Box(hull_for_box(hullmins, hullmaxs)), pr.ev(ent, F_ORIGIN))
        }
    }

    // ---------------------------------------------------------------- area nodes
    fn create_area_node(&mut self, depth: i32, mins: Vec3, maxs: Vec3) -> usize {
        let i = self.areanodes.len();
        self.areanodes.push(AreaNode::default());
        if depth == AREA_DEPTH {
            self.areanodes[i].axis = -1;
            return i;
        }
        let size = sub(maxs, mins);
        let axis = if size[0] > size[1] { 0 } else { 1 };
        let dist = 0.5 * (maxs[axis] + mins[axis]);
        let (mut mins1, mut maxs1, mut mins2, maxs2) = (mins, maxs, mins, maxs);
        maxs1[axis] = dist; mins2[axis] = dist;
        let _ = &mut mins1;
        self.areanodes[i].axis = axis as i32;
        self.areanodes[i].dist = dist;
        let c0 = self.create_area_node(depth + 1, mins2, maxs2);
        let c1 = self.create_area_node(depth + 1, mins1, maxs1);
        self.areanodes[i].children = [c0, c1];
        i
    }

    /// SV_ClearWorld.
    pub fn clear_world(&mut self) {
        self.areanodes.clear();
        let (mins, maxs) = (self.bsp.models[0].mins, self.bsp.models[0].maxs);
        self.create_area_node(0, mins, maxs);
    }

    /// SV_UnlinkEdict.
    pub fn unlink_edict(&mut self, e: usize) {
        if let Some((node, trig)) = self.pr.meta[e].area.take() {
            let list = if trig { &mut self.areanodes[node].trigger_edicts } else { &mut self.areanodes[node].solid_edicts };
            if let Some(p) = list.iter().position(|&x| x == e) { list.remove(p); }
        }
    }

    /// SV_TouchLinks.
    fn touch_links(&mut self, ent: usize, node: usize) {
        let list = self.areanodes[node].trigger_edicts.clone();
        for touch in list {
            if self.pr.meta[touch].area != Some((node, true)) { continue; }
            if touch == ent { continue; }
            if self.pr.ei(touch, F_TOUCH) == 0 || self.pr.ef(touch, F_SOLID) as i32 != SOLID_TRIGGER { continue; }
            let (amin, amax) = (self.pr.ev(ent, F_ABSMIN), self.pr.ev(ent, F_ABSMAX));
            let (tmin, tmax) = (self.pr.ev(touch, F_ABSMIN), self.pr.ev(touch, F_ABSMAX));
            if amin[0] > tmax[0] || amin[1] > tmax[1] || amin[2] > tmax[2] || amax[0] < tmin[0] || amax[1] < tmin[1] || amax[2] < tmin[2] { continue; }
            let (old_self, old_other) = (self.pr.gi(G_SELF), self.pr.gi(G_OTHER));
            self.pr.set_gi(G_SELF, self.pr.prog(touch));
            self.pr.set_gi(G_OTHER, self.pr.prog(ent));
            self.pr.set_gf(G_TIME, self.time as f32);
            let f = self.pr.ei(touch, F_TOUCH);
            self.execute(f);
            self.pr.set_gi(G_SELF, old_self);
            self.pr.set_gi(G_OTHER, old_other);
        }
        let n = &self.areanodes[node];
        if n.axis == -1 { return; }
        let (axis, dist, c) = (n.axis as usize, n.dist, n.children);
        if self.pr.ev(ent, F_ABSMAX)[axis] > dist { self.touch_links(ent, c[0]); }
        if self.pr.ev(ent, F_ABSMIN)[axis] < dist { self.touch_links(ent, c[1]); }
    }

    /// SV_FindTouchedLeafs (node index into the world's nodes; negative = leaf).
    fn find_touched_leafs(&mut self, e: usize, node: i32) {
        if node < 0 {
            let leaf = (-1 - node) as usize;
            if self.bsp.leafs[leaf].contents == CONTENTS_SOLID { return; }
            let m = &mut self.pr.meta[e];
            if m.num_leafs == 16 { return; }
            m.leafnums[m.num_leafs] = (leaf as i32 - 1) as i16;
            m.num_leafs += 1;
            return;
        }
        let n = self.bsp.nodes[node as usize];
        let plane = self.bsp.planes[n.planenum as usize];
        let sides = box_on_plane_side(self.pr.ev(e, F_ABSMIN), self.pr.ev(e, F_ABSMAX), &plane);
        if sides & 1 != 0 { self.find_touched_leafs(e, n.children[0]); }
        if sides & 2 != 0 { self.find_touched_leafs(e, n.children[1]); }
    }

    /// SV_LinkEdict.
    pub fn link_edict(&mut self, e: usize, touch_triggers: bool) {
        if self.pr.meta[e].area.is_some() { self.unlink_edict(e); }
        if e == 0 || self.pr.meta[e].free { return; }
        let org = self.pr.ev(e, F_ORIGIN);
        let mut absmin = add(org, self.pr.ev(e, F_MINS));
        let mut absmax = add(org, self.pr.ev(e, F_MAXS));
        if self.pr.ef(e, F_FLAGS) as i32 & FL_ITEM != 0 {
            absmin[0] -= 15.0; absmin[1] -= 15.0; absmax[0] += 15.0; absmax[1] += 15.0;
        } else {
            for i in 0..3 { absmin[i] -= 1.0; absmax[i] += 1.0; }
        }
        self.pr.set_ev(e, F_ABSMIN, absmin);
        self.pr.set_ev(e, F_ABSMAX, absmax);
        self.pr.meta[e].num_leafs = 0;
        if self.pr.ef(e, F_MODELINDEX) != 0.0 { self.find_touched_leafs(e, 0); }
        let solid = self.pr.ef(e, F_SOLID) as i32;
        if solid == SOLID_NOT { return; }
        let mut node = 0;
        loop {
            let n = &self.areanodes[node];
            if n.axis == -1 { break; }
            let a = n.axis as usize;
            if absmin[a] > n.dist { node = n.children[0]; }
            else if absmax[a] < n.dist { node = n.children[1]; }
            else { break; }
        }
        let trig = solid == SOLID_TRIGGER;
        if trig { self.areanodes[node].trigger_edicts.push(e); } else { self.areanodes[node].solid_edicts.push(e); }
        self.pr.meta[e].area = Some((node, trig));
        if touch_triggers { self.touch_links(e, 0); }
    }

    // ---------------------------------------------------------------- point contents
    pub fn world_hull0(&self) -> HullView<'_> {
        let h = &self.bsp.models[0].hulls[0];
        HullView { nodes: &self.bsp.hull0, planes: &self.bsp.planes, first: h.firstclipnode, last: h.lastclipnode }
    }
    /// SV_PointContents: currents count as water.
    pub fn point_contents(&self, p: Vec3) -> i32 {
        let c = self.world_hull0().point_contents(0, p);
        if (-14..=-9).contains(&c) { crate::bsp::CONTENTS_WATER } else { c }
    }
    pub fn true_point_contents(&self, p: Vec3) -> i32 { self.world_hull0().point_contents(0, p) }

    /// SV_TestEntityPosition: Some(0) (the world) if stuck.
    pub fn test_entity_position(&mut self, e: usize) -> Option<usize> {
        let o = self.pr.ev(e, F_ORIGIN);
        let tr = self.sv_move(o, self.pr.ev(e, F_MINS), self.pr.ev(e, F_MAXS), o, 0, Some(e));
        if tr.startsolid { Some(0) } else { None }
    }

    // ---------------------------------------------------------------- traces
    /// SV_ClipMoveToEntity.
    pub fn clip_move_to_entity(&self, ent: usize, start: Vec3, mins: Vec3, maxs: Vec3, end: Vec3) -> Trace {
        let mut tr = Trace { fraction: 1.0, allsolid: true, endpos: end, ..Default::default() };
        let (h, offset) = self.hull_for_entity(ent, mins, maxs);
        let boxn = box_clipnodes();
        let hv = self.hull_view(&h, &boxn);
        let start_l = sub(start, offset);
        let end_l = sub(end, offset);
        hv.recursive_check(hv.first, 0.0, 1.0, start_l, end_l, &mut tr);
        if tr.fraction != 1.0 { tr.endpos = add(tr.endpos, offset); }
        if tr.fraction < 1.0 || tr.startsolid { tr.ent = Some(ent); }
        tr
    }

    #[allow(clippy::too_many_arguments)]
    fn clip_to_links(&self, node: usize, c: &mut MoveClip) {
        let pr = &self.pr;
        for &touch in &self.areanodes[node].solid_edicts {
            let solid = pr.ef(touch, F_SOLID) as i32;
            if solid == SOLID_NOT { continue; }
            if Some(touch) == c.passedict { continue; }
            if solid == SOLID_TRIGGER { panic!("Trigger in clipping list"); }
            if c.typ == MOVE_NOMONSTERS && solid != SOLID_BSP { continue; }
            let (tmin, tmax) = (pr.ev(touch, F_ABSMIN), pr.ev(touch, F_ABSMAX));
            if c.boxmins[0] > tmax[0] || c.boxmins[1] > tmax[1] || c.boxmins[2] > tmax[2] || c.boxmaxs[0] < tmin[0] || c.boxmaxs[1] < tmin[1] || c.boxmaxs[2] < tmin[2] { continue; }
            if let Some(pd) = c.passedict { if pr.ev(pd, F_SIZE)[0] != 0.0 && pr.ev(touch, F_SIZE)[0] == 0.0 { continue; } }
            if c.trace.allsolid { return; }
            if let Some(pd) = c.passedict {
                if pr.ee(touch, F_OWNER) == pd { continue; }
                if pr.ee(pd, F_OWNER) == touch { continue; }
            }
            let mut tr = if pr.ef(touch, F_FLAGS) as i32 & FL_MONSTER != 0 {
                self.clip_move_to_entity(touch, c.start, c.mins2, c.maxs2, c.end)
            } else {
                self.clip_move_to_entity(touch, c.start, c.mins, c.maxs, c.end)
            };
            if tr.allsolid || tr.startsolid || tr.fraction < c.trace.fraction {
                tr.ent = Some(touch);
                if c.trace.startsolid { c.trace = tr; c.trace.startsolid = true; } else { c.trace = tr; }
            } else if tr.startsolid {
                c.trace.startsolid = true;
            }
        }
        let n = &self.areanodes[node];
        if n.axis == -1 { return; }
        let (a, d, ch) = (n.axis as usize, n.dist, n.children);
        if c.boxmaxs[a] > d { self.clip_to_links(ch[0], c); }
        if c.boxmins[a] < d { self.clip_to_links(ch[1], c); }
    }

    /// SV_Move: trace a box from start to end through the world and its entities.
    pub fn sv_move(&self, start: Vec3, mins: Vec3, maxs: Vec3, end: Vec3, typ: i32, passedict: Option<usize>) -> Trace {
        let mut c = MoveClip { trace: self.clip_move_to_entity(0, start, mins, maxs, end), start, end, mins, maxs, mins2: mins, maxs2: maxs, typ, passedict, boxmins: [0.0; 3], boxmaxs: [0.0; 3] };
        if typ == MOVE_MISSILE { c.mins2 = [-15.0; 3]; c.maxs2 = [15.0; 3]; }
        for i in 0..3 {
            if end[i] > start[i] {
                c.boxmins[i] = start[i] + c.mins2[i] - 1.0;
                c.boxmaxs[i] = end[i] + c.maxs2[i] + 1.0;
            } else {
                c.boxmins[i] = end[i] + c.mins2[i] - 1.0;
                c.boxmaxs[i] = start[i] + c.maxs2[i] + 1.0;
            }
        }
        self.clip_to_links(0, &mut c);
        c.trace
    }
}

struct MoveClip {
    trace: Trace,
    start: Vec3, end: Vec3,
    mins: Vec3, maxs: Vec3,
    mins2: Vec3, maxs2: Vec3,
    typ: i32,
    passedict: Option<usize>,
    boxmins: Vec3, boxmaxs: Vec3,
}
