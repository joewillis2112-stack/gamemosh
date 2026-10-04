//! Minecraft 26.3 world generation in the browser. The page hands over a
//! gzipped data bundle once (`mc_init`), then asks for chunks one at a time
//! (`mc_chunk`): for each of the 256 columns, the ground block and height,
//! what grows on it, any tree canopy over it, and the biome.

use minecraftoss_core::chunk::HeightmapKind;
use minecraftoss_core::registries::DataPaths;
use minecraftoss_core::{ChunkPos, Registries};
use minecraftoss_generator::terrain::TerrainGenerator;
use minecraftoss_world::chunk_map::{ChunkMap, WorldGen};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

/// Where the bundle's files appear to the generator.
const ROOT: &str = "/mc";
/// Bytes per column in `mc_chunk` output (see there).
const COLUMN: usize = 12;
/// "No block" in `mc_chunk` output.
const NONE: u16 = 0xffff;

struct Gen {
    registries: Arc<Registries>,
    map: ChunkMap,
    out: Vec<u8>,
    text: String,
    air: u16,
}

static mut GEN: Option<Gen> = None;
static mut ERROR: String = String::new();

#[allow(static_mut_refs)]
fn gen() -> Option<&'static mut Gen> {
    unsafe { GEN.as_mut() }
}

#[no_mangle]
pub extern "C" fn mc_alloc(len: u32) -> *mut u8 {
    let mut buf = vec![0u8; len as usize];
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr`/`len` must come from `mc_alloc`.
#[no_mangle]
pub unsafe extern "C" fn mc_free(ptr: *mut u8, len: u32) {
    drop(Vec::from_raw_parts(ptr, len as usize, len as usize));
}

/// Bundle format (after gunzip): u32 count, then per file u32 path length,
/// path (relative to the data root), u32 data length, data. All little-endian.
fn unpack(gz: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut raw = Vec::new();
    flate2::read::GzDecoder::new(gz).read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let mut at = 0usize;
    let u32_at = |raw: &[u8], at: &mut usize| -> Result<usize, String> {
        let b = raw.get(*at..*at + 4).ok_or("bundle truncated")?;
        *at += 4;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
    };
    let count = u32_at(&raw, &mut at)?;
    let mut files = BTreeMap::new();
    for _ in 0..count {
        let n = u32_at(&raw, &mut at)?;
        let path = String::from_utf8(raw.get(at..at + n).ok_or("bundle truncated")?.to_vec()).map_err(|e| e.to_string())?;
        at += n;
        let n = u32_at(&raw, &mut at)?;
        let data = raw.get(at..at + n).ok_or("bundle truncated")?.to_vec();
        at += n;
        files.insert(format!("{ROOT}/{path}"), data);
    }
    Ok(files)
}

fn init(bundle: &[u8], seed: i64) -> Result<Gen, String> {
    minecraftoss_core::vfs::mount(unpack(bundle)?);
    let registries = Arc::new(Registries::load(&DataPaths::under(Path::new(ROOT)))?);
    let terrain = Arc::new(TerrainGenerator::overworld(registries.clone(), seed)?);
    let worldgen = Arc::new(WorldGen::new(terrain)?);
    let map = ChunkMap::with_worldgen(worldgen, 2, 0);
    let air = registries.blocks.blocks().find(|(_, b)| b.name.path() == "air").map(|(id, _)| id.0).ok_or("no air block")?;
    Ok(Gen { registries, map, out: vec![0; 256 * COLUMN], text: String::new(), air })
}

/// Load the gzipped bundle and set up the world for `seed`. 0 on success;
/// otherwise `mc_text` holds the error.
///
/// # Safety
/// `ptr` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn mc_init(ptr: *const u8, len: u32, seed_lo: u32, seed_hi: i32) -> u32 {
    let bundle = std::slice::from_raw_parts(ptr, len as usize);
    let seed = ((seed_hi as i64) << 32) | seed_lo as i64;
    match init(bundle, seed) {
        Ok(g) => {
            GEN = Some(g);
            0
        }
        Err(e) => {
            ERROR = e;
            1
        }
    }
}

/// Generate (or fetch) chunk (cx, cz) and return a pointer to 256 columns of
/// `COLUMN` bytes, row-major by z then x:
/// - ground block u16, ground y i16: the top block that stops movement,
///   leaves ignored (`MOTION_BLOCKING_NO_LEAVES`; water counts);
/// - deco block u16: what stands on the ground (grass, flowers, snow), or NONE;
/// - canopy block u16: the top block seen from above when it is higher than
///   the deco (leaves, mostly), or NONE; canopy height above ground u8;
/// - biome u8; 2 spare bytes.
#[no_mangle]
pub extern "C" fn mc_chunk(cx: i32, cz: i32) -> *const u8 {
    let Some(g) = gen() else { return std::ptr::null() };
    let chunk = g.map.load_now(ChunkPos::new(cx, cz));
    let reg = &g.registries;
    let id = |x: usize, y: i32, z: usize| reg.blocks.block_of(chunk.block(x, y, z)).0;
    for z in 0..16usize {
        for x in 0..16usize {
            let gy = chunk.heightmaps.get(HeightmapKind::MotionBlockingNoLeaves, x, z) - 1;
            let ty = chunk.heightmaps.get(HeightmapKind::WorldSurface, x, z) - 1;
            let ground = id(x, gy, z);
            let above = id(x, gy + 1, z);
            let deco = if above == g.air { NONE } else { above };
            let (canopy, lift) = if ty > gy + 1 {
                let top = id(x, ty, z);
                if top == above { (NONE, 0) } else { (top, (ty - gy).clamp(0, 255) as u8) }
            } else {
                (NONE, 0)
            };
            let biome = chunk.biome(x >> 2, gy >> 2, z >> 2).0;
            let o = (z * 16 + x) * COLUMN;
            g.out[o..o + 2].copy_from_slice(&ground.to_le_bytes());
            g.out[o + 2..o + 4].copy_from_slice(&(gy as i16).to_le_bytes());
            g.out[o + 4..o + 6].copy_from_slice(&deco.to_le_bytes());
            g.out[o + 6..o + 8].copy_from_slice(&canopy.to_le_bytes());
            g.out[o + 8] = lift;
            g.out[o + 9] = biome as u8;
            g.out[o + 10] = 0;
            g.out[o + 11] = 0;
        }
    }
    g.out.as_ptr()
}

/// Forget generated chunks farther than `keep` chunks from (cx, cz).
#[no_mangle]
pub extern "C" fn mc_trim(cx: i32, cz: i32, keep: i32) {
    if let Some(g) = gen() {
        g.map.trim(ChunkPos::new(cx, cz), keep);
    }
}

/// The world spawn chunk (vanilla's climate-based search), packed as
/// `(cx & 0xffff) | (cz << 16)`.
#[no_mangle]
pub extern "C" fn mc_spawn() -> i32 {
    let Some(g) = gen() else { return 0 };
    let pos = g.map.generator().spawn_origin();
    (pos.x & 0xffff) | (pos.z << 16)
}

/// The biome at block (x, y, z) from the climate noise alone (cheap: no chunk).
#[no_mangle]
pub extern "C" fn mc_biome_at(x: i32, y: i32, z: i32) -> u32 {
    let Some(g) = gen() else { return 0 };
    g.map.generator().biome_at_quart(x >> 2, y >> 2, z >> 2).0 as u32
}

/// `kind` 0: block names, 1: biome names (JSON arrays, index = id);
/// 2: the last error. Returns a pointer; length via `mc_text_len`.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn mc_text(kind: u32) -> *const u8 {
    let text = match (kind, gen()) {
        (0, Some(g)) => {
            let names: Vec<String> = g.registries.blocks.blocks().map(|(_, b)| b.name.path().to_string()).collect();
            format!("{names:?}")
        }
        (1, Some(g)) => {
            let names: Vec<String> = (0..g.registries.biomes.len()).map(|i| g.registries.biomes.get(minecraftoss_core::BiomeId(i as _)).name.path().to_string()).collect();
            format!("{names:?}")
        }
        _ => unsafe { ERROR.clone() },
    };
    match gen() {
        Some(g) => {
            g.text = text;
            g.text.as_ptr()
        }
        None => unsafe {
            ERROR = text;
            ERROR.as_ptr()
        },
    }
}

#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn mc_text_len() -> u32 {
    match gen() {
        Some(g) => g.text.len() as u32,
        None => unsafe { ERROR.len() as u32 },
    }
}
