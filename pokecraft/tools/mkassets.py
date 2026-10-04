# Builds the page's world assets from the Minecraft client jar:
#   atlas.png  - every block texture the top-down view needs, 16x16 each
#                (water and lava keep their animation frames), then mob faces
#                and the player sprites
#   world.json - block name -> [tile, frames, tint], biome name -> colours and
#                Minecraft's own spawn lists, mob name -> tile
# Usage: python3 mkassets.py client.jar blocks.json biomes.json pokered/gfx/sprites out/
import io, json, sys, zipfile
from PIL import Image

jar = zipfile.ZipFile(sys.argv[1])
block_names = json.load(open(sys.argv[2]))
biome_names = json.load(open(sys.argv[3]))
sprites_dir = sys.argv[4]
out = sys.argv[5]

TEX = 'assets/minecraft/textures/'
DATA = 'data/minecraft/worldgen/biome/'
have = {n[len(TEX) + 6:-4] for n in jar.namelist() if n.startswith(TEX + 'block/') and n.endswith('.png')}

def png(path):
    return Image.open(io.BytesIO(jar.read(path))).convert('RGBA')

# ---------- block -> texture
SPECIAL = {
    'grass_block': 'grass_block_top', 'water': 'water_still', 'bubble_column': 'water_still',
    'lava': 'lava_still', 'snow': 'snow', 'snow_block': 'snow', 'dirt_path': 'dirt_path_top',
    'farmland': 'farmland_moist', 'tall_grass': 'tall_grass_top', 'large_fern': 'large_fern_top',
    'sunflower': 'sunflower_front', 'lilac': 'lilac_top', 'rose_bush': 'rose_bush_top',
    'peony': 'peony_top', 'tall_seagrass': 'tall_seagrass_top', 'kelp': 'kelp_plant',
    'wheat': 'wheat_stage7', 'carrots': 'carrots_stage3', 'potatoes': 'potatoes_stage3',
    'beetroots': 'beetroots_stage3', 'bell': 'gold_block', 'cactus': 'cactus_top',
    'bamboo': 'bamboo_stalk', 'sweet_berry_bush': 'sweet_berry_bush_stage3',
    'wall_torch': 'torch', 'chest': 'oak_planks', 'trapped_chest': 'oak_planks', 'barrel': 'barrel_top',
    'cave_air': None, 'void_air': None, 'air': None, 'frosted_ice': 'ice', 'magma_block': 'magma',
    'dried_kelp_block': 'dried_kelp_top', 'mushroom_stem': 'mushroom_stem', 'campfire': 'campfire_log_lit',
    'big_dripleaf': 'big_dripleaf_top', 'pointed_dripstone': 'dripstone_block', 'cocoa': 'cocoa_stage2',
    'pitcher_plant': 'pitcher_plant_top', 'smooth_stone_slab': 'smooth_stone', 'glass_pane': 'glass',
    'iron_bars': 'iron_bars', 'ladder': 'ladder', 'lectern': 'lectern_top', 'smoker': 'smoker_top',
    'blast_furnace': 'blast_furnace_top', 'furnace': 'furnace_top', 'cartography_table': 'cartography_table_top',
    'fletching_table': 'fletching_table_top', 'smithing_table': 'smithing_table_top',
    'stonecutter': 'stonecutter_top', 'grindstone': 'grindstone_side', 'loom': 'loom_top',
    'brewing_stand': 'brewing_stand_base', 'cauldron': 'cauldron_top', 'water_cauldron': 'cauldron_top',
    'anvil': 'anvil_top', 'flower_pot': 'flower_pot', 'hopper': 'hopper_top', 'leaf_litter': 'leaf_litter',
    'seagrass': 'seagrass', 'sea_pickle': 'sea_pickle', 'mangrove_roots': 'mangrove_roots_top',
    'muddy_mangrove_roots': 'muddy_mangrove_roots_top', 'bee_nest': 'bee_nest_top',
    'suspicious_sand': 'suspicious_sand_0', 'suspicious_gravel': 'suspicious_gravel_0',
    'quartz_block': 'quartz_block_top', 'sandstone': 'sandstone_top', 'red_sandstone': 'red_sandstone_top',
    'smooth_sandstone': 'sandstone_top', 'smooth_red_sandstone': 'red_sandstone_top',
    'cut_sandstone': 'cut_sandstone', 'chiseled_sandstone': 'sandstone_top', 'tnt': 'tnt_top',
    'crafting_table': 'crafting_table_top', 'jack_o_lantern': 'pumpkin_top', 'carved_pumpkin': 'pumpkin_top',
    'bookshelf': 'oak_planks', 'scaffolding': 'scaffolding_top', 'target': 'target_top',
}
SHAPES = ['_stairs', '_slab', '_wall', '_fence_gate', '_fence', '_pressure_plate', '_button',
          '_wall_hanging_sign', '_hanging_sign', '_wall_sign', '_sign']

def resolve(name):
    if name in SPECIAL:
        return SPECIAL[name]
    for prefix in ('waxed_', 'infested_', 'potted_'):
        if name.startswith(prefix):
            return 'flower_pot' if prefix == 'potted_' else resolve(name[len(prefix):])
    for cand in (name + '_top', name):
        if cand in have:
            return cand
    if name.endswith('_wood'):
        return resolve(name[:-5] + '_log')
    if name.endswith('_carpet'):
        return resolve(name[:-7] + '_wool')
    if name.endswith('_bed'):
        return resolve(name[:-4] + '_wool')
    if name.endswith('_door'):
        return name + '_top' if name + '_top' in have else None
    if name.endswith('_banner') or name.endswith('_skull') or name.endswith('_head'):
        return None
    for s in SHAPES:
        if name.endswith(s):
            base = name[:-len(s)]
            for cand in (base, base + 's', base + '_planks', base + '_block', base + '_top'):
                if cand in have:
                    return cand
            return resolve(base) if base != name else None
    if name.endswith('_wall_torch'):
        return resolve(name.replace('_wall_torch', '_torch'))
    if name.endswith('_wall_fan'):
        return resolve(name.replace('_wall_fan', '_fan'))
    return None

GRASS = {'grass_block', 'short_grass', 'tall_grass', 'fern', 'large_fern', 'sugar_cane', 'bush', 'potted_fern'}
FOLIAGE = {'oak_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'mangrove_leaves', 'vine'}
FIXED = {'spruce_leaves': '#619961', 'birch_leaves': '#80a755', 'lily_pad': '#208030',
         'attached_melon_stem': '#e0c71c', 'attached_pumpkin_stem': '#e0c71c'}
WATER = {'water', 'bubble_column'}

tiles = []          # list of 16x16 images
tile_of = {}        # texture name -> (first tile, frames)

def add_texture(tex):
    if tex in tile_of:
        return tile_of[tex]
    img = png(TEX + 'block/' + tex + '.png')
    w, h = img.size
    frames = h // w if tex in ('water_still', 'lava_still') else 1
    first = len(tiles)
    for f in range(frames):
        tiles.append(img.crop((0, f * w, w, f * w + w)).resize((16, 16), Image.NEAREST))
    tile_of[tex] = (first, frames)
    return tile_of[tex]

blocks, missing = {}, []
for name in block_names:
    tex = resolve(name)
    if tex is None or tex not in have:
        if name not in ('air', 'cave_air', 'void_air'):
            missing.append(name)
        continue
    first, frames = add_texture(tex)
    tint = 'g' if name in GRASS else 'f' if name in FOLIAGE else 'w' if name in WATER else FIXED.get(name, '')
    blocks[name] = [first, frames, tint]

# ---------- biomes: colours from the colormaps, spawns from the datapack
def colormap(file):
    return png(TEX + 'colormap/' + file)
grass_map, foliage_map = colormap('grass.png'), colormap('foliage.png')

def sample(img, temp, down):
    t = min(max(temp, 0.0), 1.0)
    d = min(max(down, 0.0), 1.0) * t
    x, y = int((1 - t) * 255), int((1 - d) * 255)
    r, g, b, _ = img.getpixel((x, y))
    return '#%02x%02x%02x' % (r, g, b)

def mix_dark_forest(hexc):
    c = int(hexc[1:], 16)
    c = ((c & 0xfefefe) + 0x28340a) >> 1
    return '#%06x' % c

biomes = {}
for name in biome_names:
    path = DATA + name + '.json'
    if path not in jar.namelist():
        continue
    d = json.loads(jar.read(path))
    fx = d.get('effects', {})
    temp, down = d.get('temperature', 0.5), d.get('downfall', 0.5)
    grass = fx.get('grass_color') or sample(grass_map, temp, down)
    foliage = fx.get('foliage_color') or sample(foliage_map, temp, down)
    mod = fx.get('grass_color_modifier')
    if mod == 'swamp':
        grass = '#6a7039'
    elif mod == 'dark_forest':
        grass = mix_dark_forest(grass)
    spawns = {}
    nat = d.get('attributes', {}).get('minecraft:gameplay/natural_mob_spawns', {})
    for cat, lst in nat.get('argument', {}).get('spawns_by_category', {}).items():
        if cat in ('creature', 'monster'):
            spawns[cat] = [[e['type'].split(':')[1], e['weight']] for e in lst]
    biomes[name] = {'grass': grass, 'foliage': foliage, 'water': fx.get('water_color', '#3f76e4'),
                    'temp': temp, 'snow': temp < 0.15, 'spawns': spawns}

# ---------- mobs: the front of the head, 8x8 (or smaller) scaled to 16x16
# (texture, u, v, w, h): u, v of the head's front face in the entity texture.
MOBS = {
    'zombie': ('zombie/zombie', 8, 8, 8, 8), 'husk': ('zombie/husk', 8, 8, 8, 8),
    'drowned': ('zombie/drowned', 8, 8, 8, 8), 'skeleton': ('skeleton/skeleton', 8, 8, 8, 8),
    'stray': ('skeleton/stray', 8, 8, 8, 8), 'creeper': ('creeper/creeper', 8, 8, 8, 8),
    'spider': ('spider/spider', 40, 12, 8, 8), 'enderman': ('enderman/enderman', 8, 8, 8, 8),
    'slime': ('slime/slime', 6, 6, 6, 6), 'witch': ('witch', 10, 10, 10, 10),
    'pig': ('pig/pig_temperate', 8, 8, 8, 8), 'cow': ('cow/cow_temperate', 6, 6, 8, 8),
    'sheep': ('sheep/sheep', 8, 8, 6, 6), 'chicken': ('chicken/chicken_temperate', 3, 3, 4, 6),
    'wolf': ('wolf/wolf', 4, 4, 6, 6), 'rabbit': ('rabbit/rabbit_brown', 7, 7, 5, 4),
    'fox': ('fox/fox', 7, 13, 8, 6), 'horse': ('horse/horse_brown', 7, 25, 5, 5),
    'goat': ('goat/goat', 2, 52, 5, 7), 'frog': ('frog/frog_temperate', 3, 3, 7, 3),
    'cat': ('cat/cat_tabby', 5, 5, 5, 4), 'ocelot': ('cat/ocelot', 5, 5, 5, 4),
    'parrot': ('parrot/parrot_red_blue', 2, 2, 2, 3), 'llama': ('llama/llama_creamy', 6, 20, 8, 10),
    'panda': ('panda/panda', 9, 15, 13, 10), 'polar_bear': ('bear/polar_bear', 7, 7, 7, 7),
    'armadillo': ('armadillo/armadillo', 2, 2, 4, 6), 'mooshroom': ('cow/mooshroom_red', 6, 6, 8, 8),
    'donkey': ('horse/donkey', 7, 25, 5, 5), 'turtle': ('turtle/big_sea_turtle', 3, 3, 6, 5),
    'bee': ('bee/bee', 7, 7, 7, 7), 'camel': ('camel/camel', 7, 7, 7, 7), 'villager': ('villager/villager', 8, 8, 8, 10),
    'wandering_trader': ('wandering_trader/wandering_trader', 8, 8, 8, 10),
}
mobs, mob_missing = {}, []
names = set(jar.namelist())
for mob, (tex, u, v, w, h) in MOBS.items():
    p = TEX + 'entity/' + tex + '.png'
    if p not in names:
        mob_missing.append(mob)
        continue
    face = png(p).crop((u, v, u + w, v + h))
    scale = max(1, min(16 // w, 16 // h))
    face = face.resize((w * scale, h * scale), Image.NEAREST)
    tile = Image.new('RGBA', (16, 16))
    tile.paste(face, ((16 - face.width) // 2, 16 - face.height))
    mobs[mob] = len(tiles)
    tiles.append(tile)

# ---------- player (pokered's Red and the surfing Seel, 16x96: 6 frames), GB shades -> colours
PALETTES = {
    'red': {0xff: (0, 0, 0, 0), 0xaa: (248, 176, 136, 255), 0x55: (200, 48, 40, 255), 0x00: (24, 24, 32, 255)},
    'seel': {0xff: (0, 0, 0, 0), 0xaa: (232, 240, 248, 255), 0x55: (120, 150, 200, 255), 0x00: (24, 24, 40, 255)},
}
player = {}
for sheet, SHADES in PALETTES.items():
    img = Image.open(f'{sprites_dir}/{sheet}.png').convert('L')
    player[sheet] = len(tiles)
    for f in range(img.height // 16):
        tile = Image.new('RGBA', (16, 16))
        for y in range(16):
            for x in range(16):
                g = img.getpixel((x, f * 16 + y))
                tile.putpixel((x, y), SHADES[min(SHADES, key=lambda s: abs(s - g))])
        tiles.append(tile)

COLS = 32
rows = (len(tiles) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * 16, rows * 16))
for i, t in enumerate(tiles):
    atlas.paste(t, ((i % COLS) * 16, (i // COLS) * 16))
atlas.save(f'{out}/atlas.png', optimize=True)
json.dump({'cols': COLS, 'blocks': blocks, 'biomes': biomes, 'mobs': mobs, 'player': player},
          open(f'{out}/world.json', 'w'), separators=(',', ':'))
print(f'{len(tiles)} tiles, {len(blocks)} blocks textured, {len(missing)} without a texture, '
      f'{len(biomes)} biomes, {len(mobs)} mobs (missing: {mob_missing})')
open(f'{out}/untextured.txt', 'w').write('\n'.join(missing) + '\n')
