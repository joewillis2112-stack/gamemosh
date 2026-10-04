// The Minecraft world as Pokémon sees it: what each block means for walking,
// and how a column is drawn top-down from the block textures.

export const NONE = 0xffff;

// Block kinds for movement and encounters.
export const K = { LAND: 0, WATER: 1, LAVA: 2, WALL: 3 };
const WALL_RE = /(_fence|_fence_gate|_wall|_pane|_door|chest|_bed|_skull|_head|_banner|_sign)$|^(iron_bars|cactus|bell|lantern|soul_lantern|campfire|soul_campfire|bamboo|pointed_dripstone|anvil|chipped_anvil|damaged_anvil|brewing_stand|cauldron|water_cauldron|lava_cauldron|composter|barrel|lectern|grindstone|bee_nest|beehive|glass|fire|spawner|end_rod|lightning_rod|chain|ladder|scaffolding|stonecutter|smithing_table|cartography_table|fletching_table|loom|smoker|blast_furnace|furnace|crafting_table|hay_block|dried_ghast)$/;
const WATER_RE = /^(water|bubble_column|kelp|kelp_plant|seagrass|tall_seagrass|sea_pickle)$/;
const GRASS_RE = /^(short_grass|tall_grass|fern|large_fern|bush|short_dry_grass|tall_dry_grass)$/;
const ROUGH_RE = /^(sand|red_sand|gravel|snow_block|powder_snow|stone|andesite|diorite|granite|tuff|calcite|terracotta|.*_terracotta|mud|suspicious_sand|packed_ice|ice|blue_ice|coarse_dirt|podzol|mycelium|moss_block|clay)$/;
const LEAVES_RE = /_leaves$|^vine$|^azalea$|^flowering_azalea$/;
// Things a player faces and presses A on.
export const SHOP_RE = /^(bell)$/;

export function buildBlocks(names, assets) {
  const stone = assets.blocks.stone;
  return names.map((name) => {
    const tex = assets.blocks[name] || null;
    let kind = K.LAND;
    if (WATER_RE.test(name)) kind = K.WATER;
    else if (name === 'lava' || name === 'magma_block') kind = K.LAVA;
    else if (WALL_RE.test(name)) kind = K.WALL;
    return {
      name,
      tile: tex ? tex[0] : stone[0],
      frames: tex ? tex[1] : 1,
      tint: tex ? tex[2] : '',
      missing: !tex,
      kind,
      grass: GRASS_RE.test(name),
      rough: ROUGH_RE.test(name) || name === 'snow',
      leaves: LEAVES_RE.test(name),
      snow: name === 'snow' || name === 'snow_block' || name === 'powder_snow',
    };
  });
}

export function buildBiomes(names, assets) {
  return names.map((name) => {
    const b = assets.biomes[name] || { grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4', spawns: {} };
    return { name, ...b, label: name.replace(/_/g, ' ').toUpperCase() };
  });
}

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/// Tinted 16x16 tiles, made once per (tile, colour) and kept.
export class Tiles {
  constructor(atlasImg, cols) {
    this.cols = cols;
    const c = document.createElement('canvas');
    c.width = atlasImg.width; c.height = atlasImg.height;
    const g = c.getContext('2d');
    g.drawImage(atlasImg, 0, 0);
    this.atlas = c;
    this.atlasData = g.getImageData(0, 0, c.width, c.height);
    this.cache = new Map();
  }

  /// A canvas holding tile `i` multiplied by `tint` ('' for none).
  get(i, tint, solid = false) {
    const key = i + '|' + tint + (solid ? '|s' : '');
    let t = this.cache.get(key);
    if (t) return t;
    t = document.createElement('canvas');
    t.width = 16; t.height = 16;
    const g = t.getContext('2d');
    const sx = (i % this.cols) * 16, sy = Math.floor(i / this.cols) * 16;
    const img = g.createImageData(16, 16);
    const src = this.atlasData.data, w = this.atlasData.width;
    const [r, gg, b] = tint ? hexRgb(tint) : [255, 255, 255];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const s = ((sy + y) * w + sx + x) * 4, d = (y * 16 + x) * 4;
        img.data[d] = (src[s] * r) / 255;
        img.data[d + 1] = (src[s + 1] * gg) / 255;
        img.data[d + 2] = (src[s + 2] * b) / 255;
        img.data[d + 3] = src[s + 3];
        if (solid && src[s + 3] < 128) {
          // Leaves seen from above: fill the holes with shade, as
          // Minecraft's "fast" leaves do, instead of showing the ground.
          img.data[d] = r * 0.32; img.data[d + 1] = gg * 0.32; img.data[d + 2] = b * 0.32; img.data[d + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    this.cache.set(key, t);
    return t;
  }
}

export function tintFor(block, biome) {
  switch (block.tint) {
    case 'g': return biome.grass;
    case 'f': return biome.foliage;
    case 'w': return biome.water;
    default: return block.tint;
  }
}
