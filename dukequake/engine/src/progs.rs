//! QuakeC's data, as pr_edict.c lays it out: progs.dat (statements,
//! functions, defs, strings, globals) and the entity memory. Entities are
//! referred to by byte offset into one array, and fields by pointer, exactly
//! as the C engine does, so QuakeC sees the same numbers it saw in 1996.
use crate::defs::*;
use crate::mathlib::Vec3;

pub const OFS_RETURN: usize = 1;
pub const OFS_PARM0: usize = 4;
pub const MAX_EDICTS: usize = 600;
/// The C edict header before `v` on 32-bit x86: free, area link, num_leafs,
/// leafnums[16], baseline, freetime = 96 bytes.
pub const HEADER_WORDS: usize = 24;

pub mod ev { pub const VOID: u16 = 0; pub const STRING: u16 = 1; pub const FLOAT: u16 = 2; pub const VECTOR: u16 = 3; pub const ENTITY: u16 = 4; pub const FIELD: u16 = 5; pub const FUNCTION: u16 = 6; pub const POINTER: u16 = 7; }
pub const DEF_SAVEGLOBAL: u16 = 1 << 15;

#[derive(Clone, Copy, Debug, Default)]
pub struct Statement { pub op: u16, pub a: i16, pub b: i16, pub c: i16 }

#[derive(Clone, Debug, Default)]
pub struct Function {
    pub first_statement: i32, pub parm_start: i32, pub locals: i32, pub profile: i32,
    pub s_name: i32, pub s_file: i32, pub numparms: i32, pub parm_size: [u8; 8],
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Def { pub typ: u16, pub ofs: u16, pub s_name: i32 }

/// The per-edict data the C engine keeps outside `v`.
#[derive(Clone, Debug, Default)]
pub struct EdictMeta {
    pub free: bool,
    pub freetime: f32,
    /// world.c's area link: which areanode list this edict is in, if any.
    pub area: Option<(usize, bool)>,
    pub num_leafs: usize,
    pub leafnums: [i16; 16],
}

pub struct Progs {
    pub crc: i32,
    pub statements: Vec<Statement>,
    pub functions: Vec<Function>,
    pub globaldefs: Vec<Def>,
    pub fielddefs: Vec<Def>,
    /// pr_strings, plus strings made at run time (ED_NewString), appended.
    pub strings: Vec<u8>,
    pub globals: Vec<u32>,
    pub entityfields: usize,
    /// Edict memory in 32-bit words: (HEADER_WORDS + entityfields) per edict.
    pub mem: Vec<u32>,
    pub meta: Vec<EdictMeta>,
    pub edict_words: usize,
    /// Where ftos/vtos/etos write (pr_string_temp).
    pub string_temp: i32,
}

fn le32(b: &[u8], o: usize) -> i32 { i32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) }
fn le16(b: &[u8], o: usize) -> u16 { u16::from_le_bytes([b[o], b[o + 1]]) }

impl Progs {
    /// PR_LoadProgs.
    pub fn load(b: &[u8]) -> Result<Progs, String> {
        let h = |i: usize| le32(b, i * 4);
        if h(0) != 6 { return Err(format!("progs.dat has wrong version number ({} should be 6)", h(0))); }
        let crc = h(1);
        if crc != PROGHEADER_CRC { return Err("progs.dat system vars have been modified, progdefs.h is out of date".into()); }
        let (ofs_st, n_st, ofs_gd, n_gd, ofs_fd, n_fd, ofs_fn, n_fn, ofs_str, n_str, ofs_gl, n_gl, entityfields) =
            (h(2) as usize, h(3) as usize, h(4) as usize, h(5) as usize, h(6) as usize, h(7) as usize, h(8) as usize, h(9) as usize, h(10) as usize, h(11) as usize, h(12) as usize, h(13) as usize, h(14) as usize);
        let statements = (0..n_st).map(|i| { let o = ofs_st + i * 8; Statement { op: le16(b, o), a: le16(b, o + 2) as i16, b: le16(b, o + 4) as i16, c: le16(b, o + 6) as i16 } }).collect();
        let functions = (0..n_fn).map(|i| {
            let o = ofs_fn + i * 36;
            let mut parm_size = [0u8; 8];
            parm_size.copy_from_slice(&b[o + 28..o + 36]);
            Function { first_statement: le32(b, o), parm_start: le32(b, o + 4), locals: le32(b, o + 8), profile: le32(b, o + 12), s_name: le32(b, o + 16), s_file: le32(b, o + 20), numparms: le32(b, o + 24), parm_size }
        }).collect();
        let defs = |ofs: usize, n: usize| (0..n).map(|i| { let o = ofs + i * 8; Def { typ: le16(b, o), ofs: le16(b, o + 2), s_name: le32(b, o + 4) } }).collect::<Vec<_>>();
        let globaldefs = defs(ofs_gd, n_gd);
        let fielddefs = defs(ofs_fd, n_fd);
        if fielddefs.iter().any(|d| d.typ & DEF_SAVEGLOBAL != 0) { return Err("PR_LoadProgs: pr_fielddefs[i].type & DEF_SAVEGLOBAL".into()); }
        let mut strings = b[ofs_str..ofs_str + n_str].to_vec();
        // pr_string_temp: a 128-byte static buffer; place it after the file's strings.
        let string_temp = strings.len() as i32;
        strings.resize(strings.len() + 128, 0);
        let globals = (0..n_gl).map(|i| le32(b, ofs_gl + i * 4) as u32).collect();
        let edict_words = HEADER_WORDS + entityfields;
        Ok(Progs {
            crc, statements, functions, globaldefs, fielddefs, strings, globals, entityfields,
            mem: vec![0; edict_words * MAX_EDICTS], meta: vec![EdictMeta::default(); MAX_EDICTS], edict_words, string_temp,
        })
    }

    pub fn edict_size(&self) -> i32 { (self.edict_words * 4) as i32 }
    /// EDICT_TO_PROG / PROG_TO_EDICT.
    pub fn prog(&self, num: usize) -> i32 { (num * self.edict_words * 4) as i32 }
    pub fn num(&self, prog: i32) -> usize { (prog as usize) / (self.edict_words * 4) }

    // ---------------------------------------------------------------- strings
    pub fn str_at(&self, ofs: i32) -> &str {
        if ofs < 0 || ofs as usize >= self.strings.len() { return ""; }
        let s = &self.strings[ofs as usize..];
        let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
        std::str::from_utf8(&s[..end]).unwrap_or("")
    }
    pub fn cstr(&self, ofs: i32) -> &[u8] {
        if ofs < 0 || ofs as usize >= self.strings.len() { return b""; }
        let s = &self.strings[ofs as usize..];
        let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
        &s[..end]
    }
    /// ED_NewString: a copy with \n escapes turned into newlines.
    pub fn new_string(&mut self, s: &str) -> i32 {
        let o = self.strings.len() as i32;
        let b = s.as_bytes();
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'\\' && i + 1 < b.len() {
                i += 1;
                self.strings.push(if b[i] == b'n' { b'\n' } else { b'\\' });
            } else { self.strings.push(b[i]); }
            i += 1;
        }
        self.strings.push(0);
        o
    }
    /// Write into pr_string_temp; returns its offset.
    pub fn temp_string(&mut self, s: &str) -> i32 {
        let o = self.string_temp as usize;
        let b = s.as_bytes();
        let n = b.len().min(127);
        self.strings[o..o + n].copy_from_slice(&b[..n]);
        self.strings[o + n] = 0;
        self.string_temp
    }

    // ---------------------------------------------------------------- globals
    #[inline] pub fn gf(&self, o: usize) -> f32 { f32::from_bits(self.globals[o]) }
    #[inline] pub fn gi(&self, o: usize) -> i32 { self.globals[o] as i32 }
    #[inline] pub fn gv(&self, o: usize) -> Vec3 { [self.gf(o), self.gf(o + 1), self.gf(o + 2)] }
    #[inline] pub fn set_gf(&mut self, o: usize, v: f32) { self.globals[o] = v.to_bits(); }
    #[inline] pub fn set_gi(&mut self, o: usize, v: i32) { self.globals[o] = v as u32; }
    #[inline] pub fn set_gv(&mut self, o: usize, v: Vec3) { for i in 0..3 { self.globals[o + i] = v[i].to_bits(); } }
    /// G_EDICT: the edict number a global refers to.
    #[inline] pub fn ge(&self, o: usize) -> usize { self.num(self.gi(o)) }

    // ---------------------------------------------------------------- entity fields
    #[inline] fn fidx(&self, e: usize, f: usize) -> usize { e * self.edict_words + HEADER_WORDS + f }
    #[inline] pub fn ef(&self, e: usize, f: usize) -> f32 { f32::from_bits(self.mem[self.fidx(e, f)]) }
    #[inline] pub fn ei(&self, e: usize, f: usize) -> i32 { self.mem[self.fidx(e, f)] as i32 }
    #[inline] pub fn ev(&self, e: usize, f: usize) -> Vec3 { let i = self.fidx(e, f); [f32::from_bits(self.mem[i]), f32::from_bits(self.mem[i + 1]), f32::from_bits(self.mem[i + 2])] }
    #[inline] pub fn set_ef(&mut self, e: usize, f: usize, v: f32) { let i = self.fidx(e, f); self.mem[i] = v.to_bits(); }
    #[inline] pub fn set_ei(&mut self, e: usize, f: usize, v: i32) { let i = self.fidx(e, f); self.mem[i] = v as u32; }
    #[inline] pub fn set_ev(&mut self, e: usize, f: usize, v: Vec3) { let i = self.fidx(e, f); for k in 0..3 { self.mem[i + k] = v[k].to_bits(); } }
    /// The entity an entity field refers to (e.g. owner, enemy), as a number.
    #[inline] pub fn ee(&self, e: usize, f: usize) -> usize { self.num(self.ei(e, f)) }
    pub fn estr(&self, e: usize, f: usize) -> &str { self.str_at(self.ei(e, f)) }

    /// ED_ClearEdict: zero `v`.
    pub fn clear_edict(&mut self, e: usize) {
        let i = self.fidx(e, 0);
        let n = self.entityfields;
        self.mem[i..i + n].fill(0);
        self.meta[e].free = false;
    }

    // ---------------------------------------------------------------- lookups
    pub fn find_field(&self, name: &str) -> Option<Def> { self.fielddefs.iter().find(|d| self.str_at(d.s_name) == name).copied() }
    pub fn find_global(&self, name: &str) -> Option<Def> { self.globaldefs.iter().find(|d| self.str_at(d.s_name) == name).copied() }
    pub fn find_function(&self, name: &str) -> Option<usize> { self.functions.iter().position(|f| self.str_at(f.s_name) == name) }
    pub fn fn_name(&self, f: usize) -> &str { self.functions.get(f).map(|f| self.str_at(f.s_name)).unwrap_or("?") }
}

/// C's atof: leading whitespace, then the longest number prefix; 0 if none.
pub fn atof(s: &str) -> f32 {
    let s = s.trim_start();
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
    let ds = i;
    while i < b.len() && b[i].is_ascii_digit() { i += 1; }
    if i < b.len() && b[i] == b'.' { i += 1; while i < b.len() && b[i].is_ascii_digit() { i += 1; } }
    if i == ds || (i == ds + 1 && b[ds] == b'.') { return 0.0; }
    let mut j = i;
    if j < b.len() && (b[j] == b'e' || b[j] == b'E') {
        j += 1;
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') { j += 1; }
        let es = j;
        while j < b.len() && b[j].is_ascii_digit() { j += 1; }
        if j > es { i = j; }
    }
    s[..i].parse::<f64>().map(|v| v as f32).unwrap_or(0.0)
}

/// C's atoi.
pub fn atoi(s: &str) -> i32 {
    let s = s.trim_start();
    let b = s.as_bytes();
    let mut i = 0;
    let neg = if i < b.len() && (b[i] == b'-' || b[i] == b'+') { i += 1; b[0] == b'-' } else { false };
    let mut v: i64 = 0;
    while i < b.len() && b[i].is_ascii_digit() { v = v * 10 + (b[i] - b'0') as i64; i += 1; }
    (if neg { -v } else { v }) as i32
}

/// COM_Parse: the next token and the rest of the text, or None at the end.
pub fn com_parse(data: &str) -> Option<(String, &str)> {
    let b = data.as_bytes();
    let mut i = 0;
    loop {
        while i < b.len() && b[i] <= b' ' { i += 1; }
        if i >= b.len() { return None; }
        if b[i] == b'/' && i + 1 < b.len() && b[i + 1] == b'/' {
            while i < b.len() && b[i] != b'\n' { i += 1; }
            continue;
        }
        break;
    }
    let c = b[i];
    if c == b'"' {
        i += 1;
        let st = i;
        while i < b.len() && b[i] != b'"' { i += 1; }
        let tok = String::from_utf8_lossy(&b[st..i]).to_string();
        return Some((tok, &data[(i + 1).min(b.len())..]));
    }
    if matches!(c, b'{' | b'}' | b')' | b'(' | b'\'' | b':') {
        return Some(((c as char).to_string(), &data[i + 1..]));
    }
    let st = i;
    loop {
        i += 1;
        if i >= b.len() || b[i] <= b' ' || matches!(b[i], b'{' | b'}' | b')' | b'(' | b'\'' | b':') { break; }
    }
    Some((String::from_utf8_lossy(&b[st..i]).to_string(), &data[i..]))
}
