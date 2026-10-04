// Which Pokémon live where in a Minecraft world, and which Pokémon each
// Minecraft mob turns into when you touch it.

// An evolution line: species, then (level it evolves at, next species)…
// The form you meet is the one the encounter level has reached.
const L = (...chain) => chain;
const PIDGEY = L('Pidgey', 18, 'Pidgeotto', 36, 'Pidgeot');
const RATTATA = L('Rattata', 20, 'Raticate');
const SPEAROW = L('Spearow', 20, 'Fearow');
const CATERPIE = L('Caterpie', 7, 'Metapod', 10, 'Butterfree');
const WEEDLE = L('Weedle', 7, 'Kakuna', 10, 'Beedrill');
const ODDISH = L('Oddish', 21, 'Gloom', 40, 'Vileplume');
const BELLSPROUT = L('Bellsprout', 21, 'Weepinbell', 40, 'Victreebel');
const NIDORANF = L('NidoranF', 16, 'Nidorina', 40, 'Nidoqueen');
const NIDORANM = L('NidoranM', 16, 'Nidorino', 40, 'Nidoking');
const PARAS = L('Paras', 24, 'Parasect');
const VENONAT = L('Venonat', 31, 'Venomoth');
const GASTLY = L('Gastly', 25, 'Haunter', 45, 'Gengar');
const ZUBAT = L('Zubat', 22, 'Golbat');
const GEODUDE = L('Geodude', 25, 'Graveler', 45, 'Golem');
const MACHOP = L('Machop', 28, 'Machoke', 45, 'Machamp');
const MANKEY = L('Mankey', 28, 'Primeape');
const SANDSHREW = L('Sandshrew', 22, 'Sandslash');
const EKANS = L('Ekans', 22, 'Arbok');
const DIGLETT = L('Diglett', 26, 'Dugtrio');
const CUBONE = L('Cubone', 28, 'Marowak');
const PONYTA = L('Ponyta', 40, 'Rapidash');
const DODUO = L('Doduo', 31, 'Dodrio');
const RHYHORN = L('Rhyhorn', 42, 'Rhydon');
const GROWLITHE = L('Growlithe', 35, 'Arcanine');
const VULPIX = L('Vulpix', 35, 'Ninetales');
const MEOWTH = L('Meowth', 28, 'Persian');
const GRIMER = L('Grimer', 38, 'Muk');
const KOFFING = L('Koffing', 35, 'Weezing');
const POLIWAG = L('Poliwag', 25, 'Poliwhirl', 40, 'Poliwrath');
const PSYDUCK = L('Psyduck', 33, 'Golduck');
const SLOWPOKE = L('Slowpoke', 37, 'Slowbro');
const SEEL = L('Seel', 34, 'Dewgong');
const SHELLDER = L('Shellder', 35, 'Cloyster');
const KRABBY = L('Krabby', 28, 'Kingler');
const TENTACOOL = L('Tentacool', 30, 'Tentacruel');
const HORSEA = L('Horsea', 32, 'Seadra');
const GOLDEEN = L('Goldeen', 33, 'Seaking');
const STARYU = L('Staryu', 36, 'Starmie');
const MAGIKARP = L('Magikarp', 20, 'Gyarados');
const CLEFAIRY = L('Clefairy', 36, 'Clefable');
const JIGGLYPUFF = L('Jigglypuff', 36, 'Wigglytuff');
const EXEGGCUTE = L('Exeggcute', 40, 'Exeggutor');
const ABRA = L('Abra', 16, 'Kadabra', 40, 'Alakazam');
const VOLTORB = L('Voltorb', 30, 'Electrode');
const PIKACHU = L('Pikachu', 40, 'Raichu');
const DRATINI = L('Dratini', 30, 'Dragonair', 55, 'Dragonite');
const DROWZEE = L('Drowzee', 26, 'Hypno');
const ONIX = L('Onix');
const one = (s) => L(s);

// [line, weight, when]: when is 'day', 'night' or omitted for any time.
const GRASSLAND = [[PIDGEY, 30], [RATTATA, 25], [SPEAROW, 12], [NIDORANF, 8], [NIDORANM, 8], [MANKEY, 5], [PIKACHU, 2], [DROWZEE, 4], [GASTLY, 6, 'night'], [ODDISH, 10, 'night']];
const FOREST = [[CATERPIE, 20], [WEEDLE, 20], [PIDGEY, 15], [ODDISH, 10], [BELLSPROUT, 10], [PIKACHU, 4], [VENONAT, 8, 'night'], [GASTLY, 6, 'night'], [one('Scyther'), 1]];
const DARK = [[ODDISH, 20], [VENONAT, 20], [PARAS, 15], [GASTLY, 20], [EXEGGCUTE, 8], [one('Tangela'), 6], [one('Pinsir'), 2]];
const TAIGA = [[GROWLITHE, 15], [VULPIX, 10], [NIDORANF, 10], [NIDORANM, 10], [PIDGEY, 15], [RATTATA, 10], [MEOWTH, 10], [ABRA, 4], [GASTLY, 6, 'night']];
const JUNGLE = [[PARAS, 20], [EXEGGCUTE, 15], [one('Tangela'), 15], [ODDISH, 10], [BELLSPROUT, 10], [one('Scyther'), 5], [one('Pinsir'), 5], [one('Bulbasaur'), 2], [VENONAT, 10, 'night']];
const SWAMP = [[GRIMER, 20], [KOFFING, 20], [EKANS, 15], [POLIWAG, 15], [PSYDUCK, 10], [SLOWPOKE, 10], [one('Tangela'), 5], [GASTLY, 10, 'night']];
const DESERT = [[SANDSHREW, 30], [EKANS, 25], [DIGLETT, 15], [CUBONE, 15], [one('Charmander'), 2], [ZUBAT, 10, 'night']];
const BADLANDS = [[DIGLETT, 20], [SANDSHREW, 20], [GEODUDE, 20], [CUBONE, 10], [RHYHORN, 10], [ONIX, 6], [ZUBAT, 10, 'night']];
const SAVANNA = [[PONYTA, 20], [DODUO, 20], [one('Tauros'), 10], [RHYHORN, 10], [MANKEY, 10], [SPEAROW, 15], [MEOWTH, 10], [one('Kangaskhan'), 3]];
const SNOW = [[SEEL, 15], [one('Jynx'), 10], [SANDSHREW, 5], [GROWLITHE, 5], [PIDGEY, 10], [one('Lapras'), 1], [one('Snorlax'), 1], [GASTLY, 6, 'night']];
const MOUNTAIN = [[GEODUDE, 25], [MACHOP, 20], [ONIX, 10], [MANKEY, 10], [RHYHORN, 8], [CLEFAIRY, 6], [ZUBAT, 15, 'night'], [one('Aerodactyl'), 1]];
const MEADOW = [[CLEFAIRY, 15], [JIGGLYPUFF, 15], [PIDGEY, 15], [NIDORANF, 10], [NIDORANM, 10], [ODDISH, 10], [one('Chansey'), 2], [one('Eevee'), 2], [GASTLY, 6, 'night']];
const MUSHROOM = [[PARAS, 30], [CLEFAIRY, 20], [one('Chansey'), 8], [VENONAT, 20], [one('Mew'), 1]];
const CHERRY = [[CLEFAIRY, 25], [JIGGLYPUFF, 25], [one('Chansey'), 5], [ODDISH, 15], [one('Eevee'), 3], [ABRA, 5]];
const BEACH = [[KRABBY, 30], [SHELLDER, 20], [PSYDUCK, 15], [SLOWPOKE, 15], [STARYU, 10, 'night'], [one('Squirtle'), 2]];
const OCEAN = [[TENTACOOL, 40], [HORSEA, 15], [STARYU, 10], [SHELLDER, 10], [KRABBY, 10], [MAGIKARP, 10], [one('Lapras'), 2], [DRATINI, 1]];
const RIVER = [[MAGIKARP, 25], [GOLDEEN, 25], [POLIWAG, 20], [PSYDUCK, 15], [SLOWPOKE, 10], [DRATINI, 2]];

const GROUPS = {
  plains: GRASSLAND, sunflower_plains: GRASSLAND,
  forest: FOREST, flower_forest: FOREST, birch_forest: FOREST, old_growth_birch_forest: FOREST, windswept_forest: FOREST, dappled_forest: FOREST,
  dark_forest: DARK, pale_garden: DARK,
  taiga: TAIGA, old_growth_pine_taiga: TAIGA, old_growth_spruce_taiga: TAIGA, snowy_taiga: TAIGA,
  jungle: JUNGLE, sparse_jungle: JUNGLE, bamboo_jungle: JUNGLE,
  swamp: SWAMP, mangrove_swamp: SWAMP,
  desert: DESERT,
  badlands: BADLANDS, eroded_badlands: BADLANDS, wooded_badlands: BADLANDS,
  savanna: SAVANNA, savanna_plateau: SAVANNA, windswept_savanna: SAVANNA,
  snowy_plains: SNOW, ice_spikes: SNOW, snowy_beach: SNOW, frozen_peaks: SNOW, snowy_slopes: SNOW, grove: SNOW,
  stony_peaks: MOUNTAIN, jagged_peaks: MOUNTAIN, windswept_hills: MOUNTAIN, windswept_gravelly_hills: MOUNTAIN, stony_shore: MOUNTAIN,
  meadow: MEADOW,
  mushroom_fields: MUSHROOM,
  cherry_grove: CHERRY,
  beach: BEACH,
  river: RIVER, frozen_river: RIVER,
};
const WATER_GROUPS = { river: RIVER, frozen_river: RIVER, swamp: SWAMP, mangrove_swamp: SWAMP };

export function formAt(line, level) {
  let s = line[0];
  for (let i = 1; i + 1 < line.length; i += 2) if (level >= line[i]) s = line[i + 1];
  return s;
}

function pick(list, rand, night) {
  const ok = list.filter(([, , when]) => !when || (when === 'night') === night);
  let total = 0;
  for (const e of ok) total += e[1];
  let r = rand() * total;
  for (const e of ok) { r -= e[1]; if (r < 0) return e[0]; }
  return ok[0][0];
}

/// The wild Pokémon for a step in `biome`: on water when `surfing`.
export function wildFor(biome, surfing, level, rand, night) {
  const list = surfing ? (WATER_GROUPS[biome] || OCEAN) : (GROUPS[biome] || (biome.includes('ocean') ? BEACH : GRASSLAND));
  return formAt(pick(list, rand, night), level);
}

/// Wild level for a spot: the farther from where the world began, the
/// stronger. About one level per 40 blocks, ±2.
export function levelAt(dist, rand) {
  const base = 3 + Math.floor(dist / 40);
  return Math.max(2, Math.min(70, base + Math.floor(rand() * 5) - 2));
}

// Minecraft mob -> [Pokémon line, level bonus, prize money per level when beaten].
export const MOB_POKEMON = {
  zombie: [GASTLY, 2, 8], husk: [CUBONE, 2, 8], drowned: [POLIWAG, 2, 8],
  skeleton: [CUBONE, 3, 10], stray: [SEEL, 3, 10], creeper: [VOLTORB, 3, 12],
  spider: [VENONAT, 2, 8], enderman: [ABRA, 6, 20], slime: [one('Ditto'), 2, 10],
  pig: [SLOWPOKE, 0, 0], cow: [one('Tauros'), 0, 0], sheep: [JIGGLYPUFF, 0, 0],
  chicken: [DODUO, 0, 0], wolf: [GROWLITHE, 1, 0], rabbit: [NIDORANF, 0, 0],
  fox: [VULPIX, 0, 0], horse: [PONYTA, 1, 0], donkey: [PONYTA, 0, 0], goat: [RHYHORN, 1, 0],
  frog: [POLIWAG, 0, 0], mooshroom: [PARAS, 0, 0], ocelot: [MEOWTH, 1, 0], cat: [MEOWTH, 0, 0],
  parrot: [SPEAROW, 0, 0], armadillo: [SANDSHREW, 0, 0], llama: [PONYTA, 1, 0], bee: [WEEDLE, 0, 0],
};
export const HOSTILE = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider', 'enderman', 'slime']);
