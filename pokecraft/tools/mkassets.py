# Builds Pokécraft's art from the Minecraft client jar and Pokémon's graphics:
#   blocks.png - every block face texture the 3D world needs (16x16 tiles)
#   items.png  - icons for items that aren't blocks (tools, food, ingots…)
#   mons.png   - every Pokémon's front and back picture, coloured with its
#                Super Game Boy palette, plus the NPCs (Nurse, Clerk, trainers)
#   world.json - block name -> shape, face tiles, tint, collision;
#                biome name -> colours and Minecraft's spawn lists;
#                species -> picture cells and sizes; NPC sprites; item names,
#                icons and Minecraft's own crafting and smelting recipes; mob skins
# Usage: python3 mkassets.py client.jar blocks.json biomes.json open-pokered/ out/
import io, json, re, sys, zipfile
from PIL import Image

jar = zipfile.ZipFile(sys.argv[1])
block_names = json.load(open(sys.argv[2]))
biome_names = json.load(open(sys.argv[3]))
pokered = sys.argv[4]
out = sys.argv[5]

TEX = 'assets/minecraft/textures/'
have = {n[len(TEX) + 6:-4] for n in jar.namelist() if n.startswith(TEX + 'block/') and n.endswith('.png')}


def png(path):
    return Image.open(io.BytesIO(jar.read(path))).convert('RGBA')


def block_png(name):
    return png(TEX + 'block/' + name + '.png')


# ---------------------------------------------------------------- shapes
# Shapes the mesher knows:
#   cube   full block            cross  two crossed quads (plants)
#   slab   lower half            flat   a thin layer (snow, carpet, lily pad)
#   liquid water/lava surface    post   a thin pillar (fences, walls, bars)
#   small  a small centred cube  (lanterns, bells, chests, beds, heads)
CROSS_RE = re.compile(r'^(short_grass|tall_grass|fern|large_fern|dead_bush|bush|firefly_bush|short_dry_grass|tall_dry_grass'
                      r'|.*_sapling|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower'
                      r'|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|torchflower|pitcher_plant|open_eyeblossom|closed_eyeblossom'
                      r'|sweet_berry_bush|sugar_cane|kelp|kelp_plant|seagrass|tall_seagrass|brown_mushroom|red_mushroom'
                      r'|wheat|carrots|potatoes|beetroots|.*_stem|attached_.*_stem|cave_vines|cave_vines_plant|hanging_roots'
                      r'|cobweb|torch|wall_torch|soul_torch|soul_wall_torch|redstone_torch|redstone_wall_torch|vine|glow_lichen'
                      r'|weeping_vines|weeping_vines_plant|twisting_vines|twisting_vines_plant|spore_blossom|mangrove_propagule'
                      r'|pale_hanging_moss|small_dripleaf|cactus_flower|resin_clump|sea_pickle|fire|soul_fire|bamboo_sapling|pink_petals_x)$')
FLAT_RE = re.compile(r'^(snow|.*_carpet|moss_carpet|pale_moss_carpet|lily_pad|rail|powered_rail|detector_rail|activator_rail'
                     r'|pink_petals|wildflowers|leaf_litter|.*_pressure_plate|redstone_wire|frogspawn)$')
POST_RE = re.compile(r'(_fence|_wall|_pane|^iron_bars|^chain|^lightning_rod|^end_rod|^bamboo)$')
SMALL_RE = re.compile(r'(^lantern|^soul_lantern|^bell|chest$|_bed$|_skull$|_head$|^flower_pot|^potted_.*|_banner$|^campfire|^soul_campfire'
                      r'|^decorated_pot|^brewing_stand|_candle$|^candle|^turtle_egg|^sniffer_egg|^dried_ghast|^conduit|_sign$|_hanging_sign$)')
LIQUID = {'water': 'water_still', 'bubble_column': 'water_still', 'lava': 'lava_still'}
AIR = {'air', 'cave_air', 'void_air', 'structure_void', 'light', 'barrier', 'moving_piston'}
NONSOLID_CUBE_RE = re.compile(r'(_door$|^scaffolding$|^powder_snow$)')
CUTOUT_RE = re.compile(r'(_leaves$|glass|^ice$|_door$|_trapdoor$|^spawner$|^scaffolding$|^mangrove_roots$|^azalea$|^flowering_azalea$|^cobweb$|^honey_block$|^slime_block$)')

SPECIAL = {
    'snow': 'snow', 'snow_block': 'snow', 'dirt_path': 'dirt_path_top', 'farmland': 'farmland_moist',
    'wheat': 'wheat_stage7', 'carrots': 'carrots_stage3', 'potatoes': 'potatoes_stage3', 'beetroots': 'beetroots_stage3',
    'bell': 'gold_block', 'bamboo': 'bamboo_stalk', 'sweet_berry_bush': 'sweet_berry_bush_stage3',
    'wall_torch': 'torch', 'soul_wall_torch': 'soul_torch', 'redstone_wall_torch': 'redstone_torch',
    'chest': 'oak_planks', 'trapped_chest': 'oak_planks', 'ender_chest': 'obsidian', 'frosted_ice': 'ice',
    'magma_block': 'magma', 'mushroom_stem': 'mushroom_stem', 'campfire': 'campfire_log_lit', 'soul_campfire': 'campfire_log_lit',
    'big_dripleaf': 'big_dripleaf_top', 'pointed_dripstone': 'dripstone_block', 'cocoa': 'cocoa_stage2',
    'glass_pane': 'glass', 'kelp': 'kelp_plant', 'cave_vines': 'cave_vines', 'cave_vines_plant': 'cave_vines_plant',
    'lantern': 'lantern', 'flower_pot': 'flower_pot', 'leaf_litter': 'leaf_litter', 'seagrass': 'seagrass',
    'lily_pad': 'lily_pad', 'cobweb': 'cobweb', 'decorated_pot': 'terracotta', 'brewing_stand': 'brewing_stand_base',
    'pink_petals': 'pink_petals', 'wildflowers': 'wildflowers', 'small_dripleaf': 'small_dripleaf_top',
    'pitcher_plant': 'pitcher_plant_top', 'bubble_column': 'water_still', 'water': 'water_still', 'lava': 'lava_still',
    'powder_snow': 'powder_snow', 'fire': 'fire_0', 'soul_fire': 'soul_fire_0', 'sea_pickle': 'sea_pickle',
    'dried_ghast': 'dried_ghast_hydration_0_top', 'smooth_sandstone': 'sandstone_top', 'smooth_red_sandstone': 'red_sandstone_top',
    'smooth_quartz': 'quartz_block_bottom', 'quartz_block': 'quartz_block_side', 'dried_kelp_block': 'dried_kelp_top', 'petrified_oak': 'oak_planks', 'quartz': 'quartz_block_side', 'chain': 'iron_chain', 'iron_bars': 'iron_bars',
}
SHAPES = ['_stairs', '_slab', '_wall', '_fence_gate', '_fence', '_pressure_plate', '_button',
          '_wall_hanging_sign', '_hanging_sign', '_wall_sign', '_sign', '_pane']


def base_texture(name):
    """The texture for a block's sides (or its only texture)."""
    if name in SPECIAL:
        return SPECIAL[name]
    for prefix in ('waxed_', 'infested_'):
        if name.startswith(prefix):
            return base_texture(name[len(prefix):])
    if name.startswith('potted_'):
        return 'flower_pot'
    if name in have:
        return name
    if name.endswith('_wood'):
        return base_texture(name[:-5] + '_log')
    if name.endswith('_hyphae'):
        return base_texture(name[:-7] + '_stem')
    if name.endswith('_carpet'):
        return base_texture(name[:-7] + '_wool')
    if name.endswith('_bed'):
        return base_texture(name[:-4] + '_wool')
    if name.endswith('_banner'):
        return base_texture(name.replace('_wall_banner', '_wool').replace('_banner', '_wool'))
    if name.endswith('_candle') or name == 'candle':
        return 'white_wool'
    if name.endswith('_door'):
        return name + '_top' if name + '_top' in have else 'oak_planks'
    if name.endswith('_skull') or name.endswith('_head'):
        return 'bone_block_side' if 'skeleton' in name else 'soul_sand'
    for suffix in ('_top', '_front', '_side', '_0', '_stage0', '_stage_0', '_on'):
        if name + suffix in have:
            return name + suffix
    for s in SHAPES:
        if name.endswith(s):
            base = name[:-len(s)]
            for cand in (base, base + 's', base + '_planks', base + '_block', base + '_top'):
                if cand in have:
                    return cand
            if base.endswith('_brick'):
                return base_texture(base + 's')
            return base_texture(base) if base != name else None
    if name.endswith('_wall_torch'):
        return base_texture(name.replace('_wall_torch', '_torch'))
    if name.endswith('_wall_fan'):
        return base_texture(name.replace('_wall_fan', '_fan'))
    return None


def face_textures(name, side):
    """(top, side, bottom) texture names."""
    top = bottom = side
    for t in (name + '_top',):
        if t in have:
            top = t
    for b in (name + '_bottom',):
        if b in have:
            bottom = b
    if name + '_side' in have:
        side = name + '_side'
    if name.endswith('_log') or name.endswith('_stem') and name + '_top' in have:
        top = bottom = name + '_top'
    if name.endswith('_wood') or name.endswith('_hyphae'):
        top = bottom = side
    if name in ('grass_block', 'podzol', 'mycelium', 'dirt_path', 'crimson_nylium', 'warped_nylium'):
        bottom = 'dirt' if name != 'crimson_nylium' and name != 'warped_nylium' else 'netherrack'
    if name == 'farmland':
        top, side, bottom = 'farmland_moist', 'dirt', 'dirt'
    if name in ('snow_block', 'snow'):
        top = side = bottom = 'snow'
    if name in ('sandstone', 'red_sandstone'):
        top, bottom = name + '_top', name + '_bottom'
    if name in ('pumpkin', 'melon', 'cactus', 'hay_block', 'tnt', 'crafting_table', 'bee_nest', 'barrel', 'bone_block', 'quartz_pillar', 'purpur_pillar', 'basalt', 'polished_basalt'):
        top = name + '_top' if name + '_top' in have else top
    return top, side, bottom


GRASS = {'grass_block', 'short_grass', 'tall_grass', 'fern', 'large_fern', 'sugar_cane', 'bush', 'potted_fern'}
FOLIAGE = {'oak_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'mangrove_leaves', 'vine'}
FIXED = {'spruce_leaves': '#619961', 'birch_leaves': '#80a755', 'lily_pad': '#208030',
         'attached_melon_stem': '#e0c71c', 'attached_pumpkin_stem': '#e0c71c', 'melon_stem': '#e0c71c', 'pumpkin_stem': '#e0c71c'}
WATER = {'water', 'bubble_column'}

tiles, tile_of = [], {}


def add_tile(key, img):
    if key not in tile_of:
        tile_of[key] = len(tiles)
        tiles.append(img)
    return tile_of[key]


def tex_tile(tex):
    if tex in tile_of:
        return tile_of[tex]
    img = block_png(tex)
    w = img.width
    img = img.crop((0, 0, w, w)).resize((16, 16), Image.NEAREST)
    return add_tile(tex, img)


# The grass block's side: dirt with its grass fringe, the fringe coloured
# like plains grass (sides don't vary by biome here; tops do).
side = block_png('grass_block_side')
overlay = block_png('grass_block_side_overlay')
tinted = Image.new('RGBA', (16, 16))
for y in range(16):
    for x in range(16):
        r, g, b, a = overlay.getpixel((x, y))
        if a:
            tinted.putpixel((x, y), (r * 0x91 // 255, g * 0xbd // 255, b * 0x59 // 255, 255))
side.alpha_composite(tinted)
add_tile('grass_block_side', side)

# Light levels from Minecraft's block properties.
LIGHT = {'torch': 14, 'wall_torch': 14, 'soul_torch': 10, 'soul_wall_torch': 10, 'redstone_torch': 7, 'redstone_wall_torch': 7,
         'lantern': 15, 'soul_lantern': 10, 'glowstone': 15, 'sea_lantern': 15, 'jack_o_lantern': 15, 'campfire': 15,
         'soul_campfire': 10, 'lava': 15, 'magma_block': 3, 'shroomlight': 15, 'fire': 15, 'end_rod': 14, 'beacon': 15,
         'ochre_froglight': 15, 'verdant_froglight': 15, 'pearlescent_froglight': 15, 'glow_lichen': 7, 'cave_vines': 14,
         'cave_vines_plant': 14, 'sea_pickle': 6, 'amethyst_cluster': 5, 'brewing_stand': 1, 'furnace': 0, 'crying_obsidian': 10}
LIGHT_SUFFIX = {'_candle': 3}

blocks, missing = {}, []
for name in block_names:
    if name in AIR:
        continue
    tex = base_texture(name)
    if tex is None or (tex not in have and tex not in tile_of):
        missing.append(name)
        tex = 'stone'
    if name in LIQUID:
        shape = 'liquid'
    elif CROSS_RE.match(name):
        shape = 'cross'
    elif FLAT_RE.match(name):
        shape = 'flat'
    elif name.endswith('_slab'):
        shape = 'slab'
    elif SMALL_RE.search(name):
        shape = 'small'
    elif POST_RE.search(name):
        shape = 'post'
    else:
        shape = 'cube'
    if shape == 'cross':
        # Double plants: lower and upper halves (the mesher picks by what's below).
        lower = name + '_bottom' if name + '_bottom' in have else tex
        upper = name + '_top' if name + '_top' in have else tex
        if name == 'sunflower':
            lower, upper = 'sunflower_bottom', 'sunflower_front'
        faces = [tex_tile(lower), tex_tile(upper), tex_tile(lower)]
    elif shape == 'cube' or shape == 'slab':
        t, s, b = face_textures(name, tex)
        faces = [tex_tile(t if t in have or t in tile_of else tex), tex_tile(s if s in have or s in tile_of else tex),
                 tex_tile(b if b in have or b in tile_of else tex)]
    else:
        faces = [tex_tile(tex)] * 3
    tint = 'g' if name in GRASS else 'f' if name in FOLIAGE else 'w' if name in WATER else FIXED.get(name, '')
    solid = shape in ('cube', 'slab', 'post', 'small') and not NONSOLID_CUBE_RE.search(name)
    layer = 'water' if name in WATER else 'cutout' if (shape in ('cross', 'flat', 'post', 'small') or CUTOUT_RE.search(name)) else 'opaque'
    entry = {'s': shape, 'f': faces, 'c': 1 if solid else 0, 'l': layer}
    if tint:
        entry['t'] = tint
    glow = LIGHT.get(name) or next((v for k, v in LIGHT_SUFFIX.items() if name.endswith(k)), 0)
    if glow:
        entry['e'] = glow  # light level it gives off, as in Minecraft
    blocks[name] = entry

# Minecraft's ten cracking stages, drawn over a block while you mine it.
destroy = [tex_tile(f'destroy_stage_{i}') for i in range(10)]

# ---------------------------------------------------------------- biomes
grass_map, foliage_map = png(TEX + 'colormap/grass.png'), png(TEX + 'colormap/foliage.png')


def sample(img, temp, down):
    t = min(max(temp, 0.0), 1.0)
    d = min(max(down, 0.0), 1.0) * t
    r, g, b, _ = img.getpixel((int((1 - t) * 255), int((1 - d) * 255)))
    return '#%02x%02x%02x' % (r, g, b)


def spawns_of(d):
    # Minecraft's own spawn lists for the biome (creatures by day, monsters by night).
    nat = d.get('attributes', {}).get('minecraft:gameplay/natural_mob_spawns', {})
    out = {}
    for cat, lst in nat.get('argument', {}).get('spawns_by_category', {}).items():
        if cat in ('creature', 'monster'):
            out[cat] = [[e['type'].split(':')[1], e['weight']] for e in lst]
    return out


biomes = {}
for name in biome_names:
    path = 'data/minecraft/worldgen/biome/' + name + '.json'
    if path not in jar.namelist():
        continue
    d = json.loads(jar.read(path))
    fx = d.get('effects', {})
    temp, down = d.get('temperature', 0.5), d.get('downfall', 0.5)
    grass = fx.get('grass_color') or sample(grass_map, temp, down)
    foliage = fx.get('foliage_color') or sample(foliage_map, temp, down)
    if fx.get('grass_color_modifier') == 'swamp':
        grass = '#6a7039'
    elif fx.get('grass_color_modifier') == 'dark_forest':
        c = int(grass[1:], 16)
        grass = '#%06x' % (((c & 0xfefefe) + 0x28340a) >> 1)
    sky = d.get('attributes', {}).get('minecraft:visual/sky_color')
    biomes[name] = {'grass': grass, 'foliage': foliage, 'water': fx.get('water_color', '#3f76e4'),
                    'temp': temp, 'sky': ('#%06x' % sky) if isinstance(sky, int) else '#78a7ff',
                    'spawns': spawns_of(d)}

# ---------------------------------------------------------------- Pokémon pictures
# Super Game Boy palettes from open-pokered's own transcription of the ROM.
src = open(f'{pokered}/crates/pokered-data/src/sgb_palettes.rs').read()
red = src[src.index('SUPER_PALETTES_RED'):]
red = red[:red.index('];')]
pals = {}
for m in re.finditer(r'sgb_pal\(([\d,\s]+)\),\s*//\s*(PAL_\w+)', red):
    v = [int(x) for x in m.group(1).replace(' ', '').split(',')]
    pals[m.group(2)] = [tuple(round(c * 255 / 31) for c in v[i:i + 3]) for i in range(0, 12, 3)]
ID2PAL = {'PaleMon': 'PAL_MEWMON', 'BlueMon': 'PAL_BLUEMON', 'RedMon': 'PAL_REDMON', 'CyanMon': 'PAL_CYANMON',
          'PurpleMon': 'PAL_PURPLEMON', 'BrownMon': 'PAL_BROWNMON', 'GreenMon': 'PAL_GREENMON', 'PinkMon': 'PAL_PINKMON',
          'YellowMon': 'PAL_YELLOWMON', 'GrayMon': 'PAL_GRAYMON'}
mons = src[src.index('pub const MONSTER_PALETTES'):]
mons = mons[:mons.index('];')]
species = []  # (dex, NAME, palette)
for m in re.finditer(r'SgbPaletteId::(\w+),\s*//\s*(\d+):\s*([A-Z0-9_.\'♀♂ -]+)', mons):
    dex = int(m.group(2))
    if dex:
        species.append((dex, m.group(3).strip(), pals[ID2PAL[m.group(1)]]))

FILE = {'MR. MIME': 'mr.mime', 'NIDORAN♀': 'nidoranf', 'NIDORAN♂': 'nidoranm', 'NIDORAN_F': 'nidoranf', 'NIDORAN_M': 'nidoranm', 'MR_MIME': 'mr.mime', 'FARFETCHD': 'farfetchd', "FARFETCH'D": 'farfetchd', 'MR.MIME': 'mr.mime'}
PASCAL = {'nidoranf': 'NidoranF', 'nidoranm': 'NidoranM', 'mr.mime': 'MrMime', 'farfetchd': 'Farfetchd'}
CELL = 56


def colour_pic(path, pal):
    """A 4-shade picture coloured with an SGB palette. White touching the
    edge is background (transparent); white inside stays white."""
    im = Image.open(path).convert('L')
    w, h = im.size
    shade = lambda v: 0 if v > 212 else 1 if v > 127 else 2 if v > 42 else 3
    px = [[shade(im.getpixel((x, y))) for x in range(w)] for y in range(h)]
    outside = [[False] * w for _ in range(h)]
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if 0 <= x < w and 0 <= y < h and not outside[y][x] and px[y][x] == 0:
            outside[y][x] = True
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    pic = Image.new('RGBA', (w, h))
    for y in range(h):
        for x in range(w):
            if not outside[y][x]:
                pic.putpixel((x, y), pal[px[y][x]] + (255,))
    return pic


pics, pokemon = [], {}
for dex, NAME, pal in species:
    f = FILE.get(NAME, NAME.lower())
    pascal = PASCAL.get(f, f.capitalize())
    front = colour_pic(f'{pokered}/gfx/pokemon/front/{f}.png', pal)
    back = colour_pic(f'{pokered}/gfx/pokemon/back/{f}b.png', pal).resize((64, 64), Image.NEAREST).crop((4, 4, 60, 60))
    entry = {'dex': dex}
    for key, img in (('f', front), ('b', back)):
        box = img.getbbox() or (0, 0, 1, 1)
        img = img.crop(box)
        entry[key] = len(pics)
        entry[key + 'w'], entry[key + 'h'] = img.size
        pics.append(img)
    # Height in metres from its Pokédex entry: sets its size in the world.
    try:
        dexd = json.load(open(f'{pokered}/crates/pokered-data/pokemon/{pascal}.json'))['pokedex']
        entry['m'] = round((dexd['heightFeet'] * 12 + dexd['heightInches']) * 0.0254, 2)
    except (OSError, KeyError):
        entry['m'] = 1.0
    pokemon[pascal] = entry

# NPCs: pokered's overworld people, facing the camera (frame 0), in a few colours.
NPC_COLOURS = {'nurse': [(255, 160, 170), (200, 60, 90)], 'clerk': [(140, 190, 255), (40, 80, 170)],
               'youngster': [(250, 200, 120), (60, 120, 200)], 'hiker': [(220, 170, 110), (130, 80, 40)],
               'lass': [(255, 200, 150), (220, 70, 70)] , 'bug_catcher': [(255, 220, 120), (60, 150, 60)],
               'cooltrainer_m': [(250, 190, 140), (60, 90, 160)], 'cooltrainer_f': [(250, 190, 140), (190, 60, 120)],
               'fisher': [(240, 200, 150), (50, 120, 170)], 'super_nerd': [(250, 200, 160), (120, 120, 140)],
               'gentleman': [(240, 200, 160), (80, 60, 60)], 'beauty': [(255, 200, 170), (200, 80, 160)],
               'oak': [(240, 210, 180), (120, 120, 120)], 'blue': [(250, 200, 160), (110, 80, 50)]}
FILES = {'lass': 'brunette_girl', 'bug_catcher': 'youngster'}
npcs = {}
for npc, (light, dark) in NPC_COLOURS.items():
    path = f'{pokered}/gfx/sprites/{FILES.get(npc, npc)}.png'
    im = Image.open(path).convert('L')
    frame = im.crop((0, 0, 16, 16))
    person = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            v = frame.getpixel((x, y))
            if v > 212:
                continue
            person.putpixel((x, y), (light if v > 127 else dark if v > 42 else (24, 24, 32)) + (255,))
    npcs[npc] = len(pics)
    pics.append(person)

# Trainers who roam the world: their real Gen 1 parties, with the top level
# of each, so the page can pick a fair fight for the distance travelled.
TRAINERS = {'Youngster': 'youngster', 'BugCatcher': 'bug_catcher', 'Lass': 'lass', 'Hiker': 'hiker',
            'CooltrainerM': 'cooltrainer_m', 'CooltrainerF': 'cooltrainer_f', 'Fisher': 'fisher',
            'SuperNerd': 'super_nerd', 'Gentleman': 'gentleman', 'Beauty': 'beauty'}
trainers = {}
for cls, sprite in TRAINERS.items():
    d = json.load(open(f'{pokered}/crates/pokered-data/trainers/{cls}.json'))
    trainers[cls] = {'npc': sprite, 'parties': [[i, max(m['level'] for m in p['pokemon']), len(p['pokemon'])]
                                                 for i, p in enumerate(d['parties']) if p['pokemon']]}

# ---------------------------------------------------------------- items, names, recipes
lang = json.loads(jar.read('assets/minecraft/lang/en_us.json'))
item_tex = {n[len(TEX) + 5:-4] for n in jar.namelist() if n.startswith(TEX + 'item/') and n.endswith('.png')}
names = jar.namelist()


def tag_items(tag, seen=None):
    """Item ids in an item tag, following nested tags."""
    seen = seen or set()
    if tag in seen:
        return []
    seen.add(tag)
    path = f'data/minecraft/tags/item/{tag}.json'
    if path not in names:
        return []
    out = []
    for v in json.loads(jar.read(path))['values']:
        v = v['id'] if isinstance(v, dict) else v
        if v.startswith('#'):
            out += tag_items(v[1:].split(':')[1], seen)
        else:
            out.append(v.split(':')[1])
    return out


def alternatives(ing):
    if isinstance(ing, dict):
        ing = ing.get('item') or ing.get('tag') and '#' + ing['tag'] or ing.get('id')
    if isinstance(ing, list):
        out = []
        for i in ing:
            out += alternatives(i)
        return out
    if ing.startswith('#'):
        return tag_items(ing[1:].split(':')[1])
    return [ing.split(':')[1]]


def known(item):
    return item in blocks or item in item_tex


recipes = []
for path in sorted(n for n in names if n.startswith('data/minecraft/recipe/') and n.endswith('.json')):
    try:
        r = json.loads(jar.read(path))
    except ValueError:
        continue
    kind = r.get('type', '').split(':')[-1]
    res = r.get('result')
    if not isinstance(res, dict) or 'id' not in res:
        continue
    out_id, count = res['id'].split(':')[1], res.get('count', 1)
    if kind == 'crafting_shaped':
        pattern = r['pattern']
        counts = {}
        for row in pattern:
            for ch in row:
                if ch != ' ':
                    counts[ch] = counts.get(ch, 0) + 1
        ings = [[alternatives(r['key'][ch]), n] for ch, n in counts.items()]
        grid = 3 if len(pattern) > 2 or max(len(row) for row in pattern) > 2 else 2
    elif kind == 'crafting_shapeless':
        merged = {}
        for ing in r['ingredients']:
            key = tuple(alternatives(ing))
            merged[key] = merged.get(key, 0) + 1
        ings = [[list(k), n] for k, n in merged.items()]
        grid = 3 if sum(merged.values()) > 4 else 2
    elif kind in ('smelting',):
        ings = [[alternatives(r['ingredient']), 1]]
        grid = 'furnace'
    else:
        continue
    ings = [[[i for i in alts if known(i)], n] for alts, n in ings]
    if not known(out_id) or any(not alts for alts, _ in ings):
        continue
    recipes.append({'out': out_id, 'n': count, 'in': ings, 'g': grid})

# Every item that can be held: blocks, recipe ingredients and results, and drops.
EXTRA = ['stick', 'coal', 'charcoal', 'raw_iron', 'raw_gold', 'raw_copper', 'iron_ingot', 'gold_ingot', 'copper_ingot', 'diamond',
         'emerald', 'lapis_lazuli', 'redstone', 'flint', 'apple', 'wheat_seeds', 'rotten_flesh', 'bone', 'arrow', 'string',
         'spider_eye', 'gunpowder', 'beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'chicken', 'cooked_chicken', 'mutton',
         'cooked_mutton', 'leather', 'feather', 'cod', 'cooked_cod', 'salmon', 'cooked_salmon', 'sweet_berries', 'bread',
         'fishing_rod', 'bone_meal', 'red_dye', 'white_dye', 'iron_nugget', 'gold_nugget', 'egg', 'white_wool', 'glass_bottle',
         'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'wooden_axe', 'stone_axe', 'iron_axe', 'diamond_axe',
         'wooden_shovel', 'stone_shovel', 'iron_shovel', 'diamond_shovel', 'wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword',
         'baked_potato', 'potato', 'carrot', 'melon_slice', 'pumpkin_pie', 'cookie', 'glow_berries', 'mushroom_stew', 'bowl', 'sugar']
held = set(EXTRA)
for r in recipes:
    held.add(r['out'])
    for alts, _ in r['in']:
        held.update(alts)
item_tiles, icons = [], {}
for item in sorted(held):
    if item in item_tex:
        img = png(TEX + 'item/' + item + '.png').crop((0, 0, 16, 16))
        icons[item] = {'i': len(item_tiles)}
        item_tiles.append(img)
    elif item in blocks:
        b = blocks[item]
        icons[item] = {'b': b['f'][1] if b['s'] in ('cube', 'slab') else b['f'][0]}


def nice(item):
    return lang.get(f'item.minecraft.{item}') or lang.get(f'block.minecraft.{item}') or item.replace('_', ' ').title()


item_names = {i: nice(i) for i in set(icons) | set(blocks)}
IROWS = (len(item_tiles) + 31) // 32
items_atlas = Image.new('RGBA', (32 * 16, max(1, IROWS) * 16))
for i, t in enumerate(item_tiles):
    items_atlas.paste(t, ((i % 32) * 16, (i // 32) * 16))
items_atlas.save(f'{out}/items.png', optimize=True)

# Minecraft mob skins for the 3D mob models.
MOB_SKINS = {'zombie': 'zombie/zombie', 'husk': 'zombie/husk', 'drowned': 'zombie/drowned', 'skeleton': 'skeleton/skeleton',
             'stray': 'skeleton/stray', 'creeper': 'creeper/creeper', 'spider': 'spider/spider', 'cow': 'cow/cow_temperate',
             'pig': 'pig/pig_temperate', 'sheep': 'sheep/sheep', 'sheep_wool': 'sheep/sheep_wool', 'chicken': 'chicken/chicken_temperate'}
import base64
mob_skins = {}
for mob, tex in MOB_SKINS.items():
    p = TEX + 'entity/' + tex + '.png'
    if p in names:
        mob_skins[mob] = base64.b64encode(jar.read(p)).decode()

COLS = 32
rows = (len(tiles) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * 16, rows * 16))
for i, t in enumerate(tiles):
    atlas.paste(t, ((i % COLS) * 16, (i // COLS) * 16))
atlas.save(f'{out}/blocks.png', optimize=True)

PCOLS = 16
prow = (len(pics) + PCOLS - 1) // PCOLS
mon_atlas = Image.new('RGBA', (PCOLS * CELL, prow * CELL))
cells = []
for i, img in enumerate(pics):
    x, y = (i % PCOLS) * CELL, (i // PCOLS) * CELL
    mon_atlas.paste(img, (x, y))
    cells.append([x, y, img.width, img.height])
mon_atlas.save(f'{out}/mons.png', optimize=True)

json.dump({'cols': COLS, 'blocks': blocks, 'biomes': biomes, 'pokemon': pokemon, 'npcs': npcs, 'cells': cells, 'trainers': trainers,
           'icons': icons, 'names': item_names, 'recipes': recipes, 'skins': mob_skins, 'destroy': destroy,
           'sun': base64.b64encode(jar.read(TEX + 'environment/celestial/sun.png' if TEX + 'environment/celestial/sun.png' in names else TEX + 'environment/sun.png')).decode(),
           'moon': base64.b64encode(jar.read(TEX + 'environment/celestial/moon/full_moon.png' if TEX + 'environment/celestial/moon/full_moon.png' in names else TEX + 'environment/moon_phases.png')).decode(),
           'monsSize': [mon_atlas.width, mon_atlas.height]},
          open(f'{out}/world.json', 'w'), separators=(',', ':'))
open(f'{out}/untextured.txt', 'w').write('\n'.join(missing) + '\n')
print(f'{len(tiles)} block tiles, {len(blocks)} blocks ({len(missing)} untextured), {len(biomes)} biomes, '
      f'{len(pokemon)} Pokémon, {len(npcs)} NPCs, {len(icons)} items ({len(item_tiles)} item icons), {len(recipes)} recipes, {len(mob_skins)} mob skins')
