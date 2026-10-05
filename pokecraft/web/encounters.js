// Which Pokémon you meet, where and when.
//
// By day the world is gentle: cute Pokémon roam in plain sight and leave you
// alone, and the only Pokémon that jump you are the ones hiding where Pokémon
// always hide: tall grass, snow drifts, water you swim through, dark caves.
// At night the scary ones come out: they roam anywhere, grass or not, and
// they come for you.

// An evolution line: species, then (level it evolves at, next species)…
// The form you meet is the one the encounter level has reached.
const L = (...chain) => chain;
const one = (s) => L(s);
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
const GLOOMY = L('Gloom', 40, 'Vileplume');

// ---------------------------------------------------------------- by day: the gentle ones
// Biome groups -> [line, weight].
const DAY = {
  grassland: [[PIDGEY, 25], [RATTATA, 15], [NIDORANF, 10], [NIDORANM, 10], [one('Tauros'), 6], [PONYTA, 5], [DODUO, 6], [PIKACHU, 3], [JIGGLYPUFF, 6], [one('Eevee'), 1]],
  forest: [[CATERPIE, 25], [WEEDLE, 15], [PIDGEY, 15], [ODDISH, 10], [BELLSPROUT, 10], [PIKACHU, 5], [PARAS, 6], [one('Farfetchd'), 2], [one('Eevee'), 1]],
  taiga: [[GROWLITHE, 12], [VULPIX, 12], [PIDGEY, 15], [RATTATA, 10], [MEOWTH, 10], [NIDORANF, 8], [NIDORANM, 8], [one('Eevee'), 2]],
  jungle: [[PARAS, 15], [EXEGGCUTE, 15], [one('Tangela'), 12], [ODDISH, 10], [BELLSPROUT, 10], [PIKACHU, 6], [one('Bulbasaur'), 3], [one('Scyther'), 2]],
  swamp: [[POLIWAG, 20], [PSYDUCK, 15], [SLOWPOKE, 15], [ODDISH, 10], [one('Tangela'), 8], [one('Bulbasaur'), 2]],
  desert: [[SANDSHREW, 25], [DIGLETT, 15], [CUBONE, 10], [PONYTA, 8], [one('Charmander'), 3]],
  badlands: [[DIGLETT, 20], [SANDSHREW, 20], [GEODUDE, 15], [PONYTA, 10], [VULPIX, 8]],
  savanna: [[PONYTA, 20], [DODUO, 20], [one('Tauros'), 15], [one('Kangaskhan'), 4], [MEOWTH, 10], [PIDGEY, 10], [RHYHORN, 5]],
  snow: [[SEEL, 15], [JIGGLYPUFF, 10], [SANDSHREW, 6], [PSYDUCK, 8], [one('Lapras'), 1], [one('Snorlax'), 1], [VULPIX, 6]],
  mountain: [[GEODUDE, 20], [CLEFAIRY, 15], [JIGGLYPUFF, 10], [MACHOP, 10], [RHYHORN, 6], [one('Chansey'), 2], [one('Aerodactyl'), 1]],
  meadow: [[CLEFAIRY, 15], [JIGGLYPUFF, 15], [PIDGEY, 10], [ODDISH, 10], [one('Chansey'), 4], [one('Eevee'), 3], [PIKACHU, 5], [one('Tauros'), 5]],
  mushroom: [[PARAS, 20], [CLEFAIRY, 15], [one('Chansey'), 8], [one('Mew'), 1]],
  cherry: [[CLEFAIRY, 20], [JIGGLYPUFF, 20], [one('Chansey'), 6], [ODDISH, 10], [one('Eevee'), 4], [ABRA, 3]],
  beach: [[KRABBY, 20], [SHELLDER, 15], [PSYDUCK, 15], [SLOWPOKE, 15], [one('Squirtle'), 3], [SEEL, 5]],
};

// ---------------------------------------------------------------- at night: the scary ones
const NIGHT = {
  grassland: [[GASTLY, 20], [ZUBAT, 15], [RATTATA, 8], [EKANS, 12], [DROWZEE, 12], [MANKEY, 8], [SPEAROW, 8], [one('Haunter'), 3]],
  forest: [[GASTLY, 18], [VENONAT, 15], [ZUBAT, 12], [GLOOMY, 10], [one('Beedrill'), 6], [one('Scyther'), 3], [one('Pinsir'), 3], [one('Haunter'), 3]],
  dark: [[GASTLY, 25], [one('Haunter'), 10], [VENONAT, 15], [one('Parasect'), 10], [GLOOMY, 10], [one('Gengar'), 1]],
  taiga: [[GASTLY, 15], [ZUBAT, 15], [one('Arcanine'), 2], [DROWZEE, 12], [one('Haunter'), 4], [one('Primeape'), 6]],
  jungle: [[VENONAT, 15], [GASTLY, 12], [one('Scyther'), 6], [one('Pinsir'), 6], [EKANS, 10], [one('Haunter'), 4]],
  swamp: [[GRIMER, 20], [KOFFING, 20], [EKANS, 12], [GASTLY, 15], [one('Muk'), 3], [one('Weezing'), 3]],
  desert: [[EKANS, 20], [CUBONE, 15], [ZUBAT, 15], [one('Marowak'), 5], [one('Arbok'), 4], [GASTLY, 8]],
  badlands: [[ZUBAT, 15], [GEODUDE, 10], [CUBONE, 12], [one('Onix'), 6], [EKANS, 10], [one('Marowak'), 4]],
  savanna: [[EKANS, 15], [ZUBAT, 15], [one('Primeape'), 8], [GASTLY, 12], [DROWZEE, 10]],
  snow: [[one('Jynx'), 15], [GASTLY, 15], [ZUBAT, 10], [one('Dewgong'), 4], [one('Haunter'), 4]],
  mountain: [[ZUBAT, 20], [one('Golbat'), 8], [MACHOP, 10], [one('Onix'), 8], [GASTLY, 12], [one('Graveler'), 4]],
  meadow: [[GASTLY, 18], [DROWZEE, 15], [ZUBAT, 12], [ABRA, 5], [one('Hypno'), 3]],
  mushroom: [[one('Parasect'), 20], [GASTLY, 15], [VENONAT, 15], [GRIMER, 10]],
  cherry: [[GASTLY, 18], [ABRA, 10], [DROWZEE, 15], [one('Haunter'), 4]],
  beach: [[ZUBAT, 15], [GASTLY, 15], [one('Kingler'), 6], [TENTACOOL, 10]],
};

// ---------------------------------------------------------------- terrain where Pokémon hide
const SNOW_DAY = [[SEEL, 25], [JIGGLYPUFF, 15], [SANDSHREW, 10], [PSYDUCK, 10], [one('Lapras'), 2], [one('Snorlax'), 2], [VULPIX, 8]];
const SNOW_NIGHT = [[one('Jynx'), 25], [GASTLY, 15], [one('Dewgong'), 10], [ZUBAT, 10], [one('Haunter'), 4], [one('Articuno'), 1]];
const WATER_DAY = [[MAGIKARP, 25], [GOLDEEN, 20], [POLIWAG, 15], [PSYDUCK, 15], [HORSEA, 10], [SHELLDER, 10], [STARYU, 8], [one('Lapras'), 1]];
const WATER_NIGHT = [[TENTACOOL, 30], [STARYU, 15], [one('Tentacruel'), 8], [one('Gyarados'), 2], [GASTLY, 8], [DRATINI, 2]];
const RIVER_DAY = [[MAGIKARP, 30], [GOLDEEN, 25], [POLIWAG, 20], [PSYDUCK, 15], [SLOWPOKE, 10], [DRATINI, 2]];
const CAVE = [[ZUBAT, 35], [GEODUDE, 25], [PARAS, 10], [DIGLETT, 8], [one('Onix'), 6], [CLEFAIRY, 4], [MACHOP, 6]];
const FISH = [[MAGIKARP, 40], [GOLDEEN, 20], [POLIWAG, 12], [KRABBY, 10], [SHELLDER, 8], [HORSEA, 8], [TENTACOOL, 8], [STARYU, 5], [DRATINI, 1]];

const GROUP = {
  plains: 'grassland', sunflower_plains: 'grassland',
  forest: 'forest', flower_forest: 'forest', birch_forest: 'forest', old_growth_birch_forest: 'forest', windswept_forest: 'forest', dappled_forest: 'forest',
  dark_forest: 'dark', pale_garden: 'dark',
  taiga: 'taiga', old_growth_pine_taiga: 'taiga', old_growth_spruce_taiga: 'taiga', snowy_taiga: 'taiga', grove: 'snow',
  jungle: 'jungle', sparse_jungle: 'jungle', bamboo_jungle: 'jungle',
  swamp: 'swamp', mangrove_swamp: 'swamp',
  desert: 'desert',
  badlands: 'badlands', eroded_badlands: 'badlands', wooded_badlands: 'badlands',
  savanna: 'savanna', savanna_plateau: 'savanna', windswept_savanna: 'savanna',
  snowy_plains: 'snow', ice_spikes: 'snow', snowy_beach: 'snow', frozen_peaks: 'snow', snowy_slopes: 'snow',
  stony_peaks: 'mountain', jagged_peaks: 'mountain', windswept_hills: 'mountain', windswept_gravelly_hills: 'mountain', stony_shore: 'mountain',
  meadow: 'meadow', mushroom_fields: 'mushroom', cherry_grove: 'cherry', beach: 'beach',
};
const groupOf = (biome) => GROUP[biome] || (/ocean|river/.test(biome) ? 'beach' : 'grassland');

export function formAt(line, level) {
  let s = line[0];
  for (let i = 1; i + 1 < line.length; i += 2) if (level >= line[i]) s = line[i + 1];
  return s;
}

function pick(list, rand) {
  let total = 0;
  for (const e of list) total += e[1];
  let r = rand() * total;
  for (const e of list) { r -= e[1]; if (r < 0) return e[0]; }
  return list[0][0];
}

/// A Pokémon roaming in plain sight: cute by day, scary at night.
export function roamer(biome, level, rand, night) {
  const g = groupOf(biome);
  const list = night ? (NIGHT[g] || NIGHT.grassland) : (DAY[g === 'dark' ? 'forest' : g] || DAY.grassland);
  return formAt(pick(list, rand), level);
}

/// A Pokémon that jumps out of where you're walking: 'grass', 'snow',
/// 'water', 'cave'.
export function hiding(terrain, biome, level, rand, night) {
  const g = groupOf(biome);
  let list;
  if (terrain === 'snow') list = night ? SNOW_NIGHT : SNOW_DAY;
  else if (terrain === 'water') list = night ? WATER_NIGHT : /river|swamp/.test(biome) ? RIVER_DAY : WATER_DAY;
  else if (terrain === 'cave') list = CAVE;
  // Grass: the biome's own Pokémon; at night the grass hides the scary ones too.
  else list = night ? [...(NIGHT[g] || NIGHT.grassland), ...(DAY[g === 'dark' ? 'forest' : g] || DAY.grassland).map(([l, w]) => [l, w / 2])] : (DAY[g === 'dark' ? 'forest' : g] || DAY.grassland);
  return formAt(pick(list, rand), level);
}

/// What bites on a fishing line: a Pokémon, mostly.
export function fished(level, rand) { return formAt(pick(FISH, rand), level); }

/// Wild level for a spot: the farther from where the world began, the
/// stronger. About one level per 40 blocks, ±2; night ones a bit tougher.
export function levelAt(dist, rand, night = false) {
  const base = 3 + Math.floor(dist / 40) + (night ? 2 : 0);
  return Math.max(2, Math.min(70, base + Math.floor(rand() * 5) - 2));
}
