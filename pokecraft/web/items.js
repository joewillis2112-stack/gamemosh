// What Minecraft items are and do: names, icons, stack sizes, tools and how
// fast they mine, what a block drops, food and fuel. Close to Minecraft's
// own rules, kept simple where a phone game needs it.

export class Items {
  constructor(world) {
    this.W = world; // world.json: names, icons, recipes, blocks
  }

  name(id) { return this.W.names[id] || id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  icon(id) { return this.W.icons[id] || null; }
  isBlock(id) { const b = this.W.blocks[id]; return !!b; }

  maxStack(id) {
    if (this.tool(id) || /_bed$|fishing_rod|bucket$|_boat$|saddle|stew$/.test(id)) return 1;
    if (/egg$|ender_pearl|snowball|sign$/.test(id)) return 16;
    return 64;
  }

  /// { kind: pickaxe|axe|shovel|sword|hoe, tier 1-5, speed, damage } or null.
  tool(id) {
    const m = /^(wooden|stone|copper|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|sword|hoe)$/.exec(id || '');
    if (!m) return null;
    const T = { wooden: [1, 2, 0], stone: [2, 4, 1], copper: [2, 5, 1], iron: [3, 6, 2], golden: [1, 12, 0], diamond: [4, 8, 3], netherite: [5, 9, 4] }[m[1]];
    const base = { sword: 4, axe: 3, pickaxe: 2, shovel: 2.5, hoe: 1 }[m[2]];
    return { kind: m[2], tier: T[0], speed: T[1], damage: base + T[2] };
  }

  /// Attack damage with this item in hand (a fist does 1).
  damage(id) { const t = this.tool(id); return t ? t.damage : 1; }

  /// Food points (half drumsticks) when eaten, or 0.
  food(id) {
    return {
      apple: 4, bread: 5, cooked_beef: 8, beef: 3, cooked_porkchop: 8, porkchop: 3, cooked_chicken: 6, chicken: 2,
      cooked_mutton: 6, mutton: 2, cod: 2, cooked_cod: 5, salmon: 2, cooked_salmon: 6, sweet_berries: 2, glow_berries: 2,
      melon_slice: 2, carrot: 3, potato: 1, baked_potato: 5, rotten_flesh: 4, pumpkin_pie: 8, cookie: 2, mushroom_stew: 6,
      golden_apple: 4, golden_carrot: 6, beetroot: 1, dried_kelp: 1, spider_eye: 2, tropical_fish: 1, rabbit: 3, cooked_rabbit: 5,
    }[id] || 0;
  }

  /// How many items one of these smelts in a furnace.
  fuel(id) {
    if (/^(coal|charcoal)$/.test(id)) return 8;
    if (id === 'coal_block') return 80;
    if (id === 'lava_bucket') return 100;
    if (id === 'blaze_rod') return 12;
    if (/_planks$|_log$|_wood$|_stem$|_hyphae$|crafting_table|chest$|bookshelf/.test(id)) return 1.5;
    if (/stick|_sapling$|bamboo$|bowl$/.test(id)) return 0.5;
    return 0;
  }

  // ---------------------------------------------------------------- mining
  /// Minecraft hardness for a block name (how long it takes to break).
  hardness(name) {
    if (/^(bedrock|barrier|end_portal_frame|water|lava|bubble_column|structure_void|light)$/.test(name)) return Infinity;
    if (/^(short_grass|tall_grass|fern|large_fern|dead_bush|bush|.*_sapling|dandelion|poppy|.*_tulip|.*orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|torch|wall_torch|.*_mushroom|sugar_cane|kelp.*|seagrass|tall_seagrass|lily_pad|wheat|carrots|potatoes|beetroots|sweet_berry_bush|short_dry_grass|tall_dry_grass|firefly_bush|pink_petals|wildflowers|leaf_litter|redstone_wire|.*_carpet|fire)$/.test(name)) return 0;
    if (/_leaves$/.test(name)) return 0.2;
    if (name === 'snow') return 0.1;
    if (/^(snow_block|powder_snow)$/.test(name)) return 0.2;
    if (/_bed$/.test(name)) return 0.2;
    if (/(glass|glowstone|sea_lantern)/.test(name)) return 0.3;
    if (/^(ice|packed_ice|frosted_ice)$/.test(name)) return 0.5;
    if (/^(dirt|coarse_dirt|rooted_dirt|farmland|dirt_path|sand|red_sand|soul_sand|mud|clay|cactus|sponge)$/.test(name)) return 0.5;
    if (/^(grass_block|podzol|mycelium|gravel|moss_block)$/.test(name)) return 0.6;
    if (/(_wool|^hay_block)$/.test(name)) return 0.8;
    if (/sandstone/.test(name)) return 0.8;
    if (/(pumpkin|melon|jack_o_lantern)$/.test(name)) return 1;
    if (/terracotta/.test(name)) return 1.25;
    if (/^(stone|andesite|diorite|granite|tuff|calcite|.*_bricks|bricks|stone_bricks|.*_stairs|.*_slab|.*_wall)$/.test(name)) return 1.5;
    if (/(_log|_wood|_planks|_stem|_hyphae|crafting_table|chest|barrel|bookshelf|_fence|_fence_gate|_door|_trapdoor|ladder|_sign|composter|lectern|loom|cartography_table|fletching_table|smithing_table)/.test(name)) return 2;
    if (/^(cobblestone|mossy_cobblestone|cobbled_deepslate)$/.test(name)) return 2;
    if (/^(deepslate|.*_ore|furnace|smoker|blast_furnace|bell|lantern|iron_block|gold_block|diamond_block|emerald_block)$/.test(name)) return 3;
    if (/obsidian/.test(name)) return 50;
    return 1;
  }

  /// The tool kind a block wants, and the lowest tier that makes it drop
  /// anything (0: no tool needed).
  wants(name) {
    if (/(_ore|stone|cobble|deepslate|brick|andesite|diorite|granite|tuff|calcite|basalt|sandstone|terracotta|concrete|prismarine|quartz|obsidian|furnace|smoker|anvil|bell|lantern|iron_|gold_block|diamond_block|emerald_block|lapis_block|copper|_stairs|_slab|_wall)/.test(name) && !/(_log|_planks|wood)/.test(name)) {
      let tier = 1;
      if (/^(iron_ore|deepslate_iron_ore|lapis_ore|deepslate_lapis_ore|copper_ore|deepslate_copper_ore|iron_block|lapis_block)$/.test(name)) tier = 2;
      if (/^(gold_ore|deepslate_gold_ore|diamond_ore|deepslate_diamond_ore|emerald_ore|deepslate_emerald_ore|redstone_ore|deepslate_redstone_ore|gold_block|diamond_block|emerald_block)$/.test(name)) tier = 3;
      if (/obsidian/.test(name)) tier = 4;
      return { kind: 'pickaxe', tier };
    }
    if (/(_log|_wood|_planks|_stem|_hyphae|crafting_table|chest|barrel|bookshelf|_fence|_door|_trapdoor|ladder|_sign|pumpkin|melon|composter|lectern|loom|bed$)/.test(name)) return { kind: 'axe', tier: 0 };
    if (/^(dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mycelium|farmland|dirt_path|sand|red_sand|gravel|clay|mud|soul_sand|snow|snow_block|powder_snow)$/.test(name)) return { kind: 'shovel', tier: 0 };
    if (/_leaves$|hay_block|moss/.test(name)) return { kind: 'hoe', tier: 0 };
    return { kind: null, tier: 0 };
  }

  /// Seconds to break `name` holding `held`, and whether it drops.
  breakTime(name, held) {
    const h = this.hardness(name);
    if (h === Infinity) return { t: Infinity, drops: false };
    if (h === 0) return { t: 0.05, drops: true };
    const want = this.wants(name), tool = this.tool(held);
    const right = tool && want.kind && tool.kind === want.kind;
    const drops = want.tier === 0 || (right && tool.tier >= want.tier);
    const speed = right ? tool.speed : 1;
    return { t: (h * (drops ? 1.5 : 5)) / speed, drops };
  }

  /// What breaking `name` gives you: [[item, count], …], plus Pokémon items
  /// (evolution stones turn up in ores) as { poke: 'FIRE_STONE' }.
  drops(name, rand = Math.random) {
    const r = rand();
    switch (name) {
      case 'grass_block': case 'podzol': case 'mycelium': case 'dirt_path': case 'farmland': case 'rooted_dirt': return [['dirt', 1]];
      case 'stone': return [['cobblestone', 1]];
      case 'deepslate': return [['cobbled_deepslate', 1]];
      case 'coal_ore': case 'deepslate_coal_ore': return [['coal', 1]];
      case 'iron_ore': case 'deepslate_iron_ore': return [['raw_iron', 1]];
      case 'gold_ore': case 'deepslate_gold_ore': return [['raw_gold', 1]];
      case 'copper_ore': case 'deepslate_copper_ore': return [['raw_copper', 2 + Math.floor(r * 4)], ...(rand() < 0.12 ? [{ poke: 'THUNDER_STONE' }] : [])];
      case 'diamond_ore': case 'deepslate_diamond_ore': return [['diamond', 1], ...(rand() < 0.2 ? [{ poke: 'MOON_STONE' }] : [])];
      case 'emerald_ore': case 'deepslate_emerald_ore': return [['emerald', 1], ...(rand() < 0.35 ? [{ poke: 'LEAF_STONE' }] : [])];
      case 'lapis_ore': case 'deepslate_lapis_ore': return [['lapis_lazuli', 4 + Math.floor(r * 5)], ...(rand() < 0.15 ? [{ poke: 'WATER_STONE' }] : [])];
      case 'redstone_ore': case 'deepslate_redstone_ore': return [['redstone', 4 + Math.floor(r * 2)], ...(rand() < 0.15 ? [{ poke: 'FIRE_STONE' }] : [])];
      case 'gravel': return r < 0.1 ? [['flint', 1]] : [['gravel', 1]];
      case 'short_grass': case 'tall_grass': case 'fern': case 'large_fern': return r < 0.125 ? [['wheat_seeds', 1]] : [];
      case 'sweet_berry_bush': return [['sweet_berries', 2 + Math.floor(r * 2)]];
      case 'cave_vines': case 'cave_vines_plant': return r < 0.5 ? [['glow_berries', 1]] : [];
      case 'melon': return [['melon_slice', 3 + Math.floor(r * 5)]];
      case 'wheat': return [['wheat', 1], ['wheat_seeds', 1 + Math.floor(r * 2)]];
      case 'carrots': return [['carrot', 2 + Math.floor(r * 2)]];
      case 'potatoes': return [['potato', 2 + Math.floor(r * 2)]];
      case 'snow': case 'ice': case 'glass': case 'glass_pane': case 'bubble_column': case 'fire': return [];
      case 'clay': return [['clay_ball', 4]];
      case 'glowstone': return [['glowstone_dust', 2 + Math.floor(r * 3)]];
      case 'wall_torch': return [['torch', 1]];
      default: break;
    }
    if (/_leaves$/.test(name)) {
      const out = [];
      if (r < 0.05) out.push([name.replace('_leaves', '_sapling'), 1]);
      if (rand() < 0.02) out.push(['stick', 1 + Math.floor(rand() * 2)]);
      if (/^(oak|dark_oak)_leaves$/.test(name) && rand() < 0.06) out.push(['apple', 1]);
      return out.filter(([i]) => this.W.icons[i]);
    }
    if (/_bed$/.test(name)) return [[name, 1]];
    return this.W.icons[name] ? [[name, 1]] : [];
  }
}

/// Recipes that turn Minecraft materials into Pokémon items, which go into
/// Pokémon's own bag (Pixelmon has its own; these are ours).
export const POKE_RECIPES = [
  { out: 'POKE_BALL', label: 'POKé BALL', n: 3, in: [['iron_ingot', 1], ['red_dye', 1], ['stone_button', 1]] },
  { out: 'GREAT_BALL', label: 'GREAT BALL', n: 2, in: [['iron_ingot', 2], ['lapis_lazuli', 2], ['red_dye', 1]] },
  { out: 'ULTRA_BALL', label: 'ULTRA BALL', n: 1, in: [['gold_ingot', 2], ['iron_ingot', 1], ['coal', 1]] },
  { out: 'POTION', label: 'POTION', n: 1, in: [['glass_bottle', 1], ['sweet_berries', 3]] },
  { out: 'POTION', label: 'POTION', n: 1, in: [['glass_bottle', 1], ['apple', 2]] },
  { out: 'SUPER_POTION', label: 'SUPER POTION', n: 1, in: [['glass_bottle', 1], ['glow_berries', 2], ['sugar', 1]] },
  { out: 'ANTIDOTE', label: 'ANTIDOTE', n: 1, in: [['glass_bottle', 1], ['spider_eye', 1]] },
  { out: 'PARLYZ_HEAL', label: 'PARLYZ HEAL', n: 1, in: [['glass_bottle', 1], ['redstone', 2]] },
  { out: 'AWAKENING', label: 'AWAKENING', n: 1, in: [['glass_bottle', 1], ['sugar', 2]] },
  { out: 'BURN_HEAL', label: 'BURN HEAL', n: 1, in: [['glass_bottle', 1], ['kelp', 2]] },
  { out: 'ESCAPE_ROPE', label: 'ESCAPE ROPE', n: 1, in: [['string', 4]] },
  { out: 'REVIVE', label: 'REVIVE', n: 1, in: [['glass_bottle', 1], ['golden_apple', 1]] },
  { out: 'RARE_CANDY', label: 'RARE CANDY', n: 1, in: [['diamond', 1], ['sugar', 2]] },
];
