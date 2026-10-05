// What a wild Pokémon leaves behind when it faints: the Minecraft items that
// fit it. Fish Pokémon drop fish, cow-like ones beef, birds chicken and
// feathers, and so on. Gen 1 has no sheep or pig Pokémon, so nothing drops
// mutton or pork. Caught Pokémon drop nothing.
//
// Each entry: [item, min, max]; `food: true` marks what counts as food for
// a hunting bonus.

const FISH = [['cod', 1, 2]];
const BIG_FISH = [['salmon', 1, 3]];
const BIRD = [['chicken', 1, 1], ['feather', 0, 2]];
const BIG_BIRD = [['chicken', 1, 2], ['feather', 1, 3]];
const BEAST = [['beef', 1, 2], ['leather', 0, 2]];
const RABBIT = [['rabbit', 1, 1], ['rabbit_hide', 0, 1]];
const BUG = [['string', 0, 2]];
const SHELL = [['cod', 0, 1], ['nautilus_shell', 0, 1]];

/// Species (Gen 1 names as the runner spells them) → drops.
export const FAINT_DROPS = {
  // Water: fish and sea creatures.
  Magikarp: FISH, Goldeen: FISH, Seaking: BIG_FISH, Horsea: FISH, Seadra: BIG_FISH, Gyarados: [['salmon', 2, 4]],
  Poliwag: FISH, Poliwhirl: FISH, Psyduck: [['cod', 1, 1], ['feather', 0, 1]], Golduck: [['salmon', 1, 2], ['feather', 0, 1]],
  Slowpoke: [['salmon', 1, 2]], Slowbro: [['salmon', 1, 2], ['nautilus_shell', 0, 1]], // Slowpoke tails are a delicacy
  Seel: [['cod', 1, 2]], Dewgong: [['cod', 1, 3]], Krabby: [['cod', 1, 1]], Kingler: [['cod', 1, 2]],
  Shellder: SHELL, Cloyster: [['nautilus_shell', 1, 1], ['cod', 0, 1]], Staryu: [['prismarine_shard', 0, 2]], Starmie: [['prismarine_shard', 1, 3]],
  Tentacool: [['ink_sac', 1, 2]], Tentacruel: [['ink_sac', 1, 3]], Omanyte: SHELL, Kabuto: SHELL,
  // Birds: chicken and feathers.
  Pidgey: BIRD, Pidgeotto: BIRD, Pidgeot: BIG_BIRD, Spearow: BIRD, Fearow: BIG_BIRD, Doduo: BIG_BIRD, Dodrio: [['chicken', 2, 3], ['feather', 1, 3]],
  Farfetchd: [['chicken', 1, 1], ['feather', 1, 2], ['wheat', 0, 1]],
  // Cattle and big beasts: beef and leather.
  Tauros: [['beef', 2, 3], ['leather', 0, 2]], Kangaskhan: BEAST, Rhyhorn: [['beef', 1, 2], ['leather', 1, 2]], Rhydon: [['beef', 2, 3], ['leather', 1, 2]],
  Ponyta: [['leather', 1, 2]], Rapidash: [['leather', 1, 3]], Lickitung: BEAST, Snorlax: [['beef', 3, 5], ['apple', 1, 3]],
  // Small mammals: rabbit.
  Rattata: RABBIT, Raticate: RABBIT, NidoranF: RABBIT, NidoranM: RABBIT, Nidorina: RABBIT, Nidorino: RABBIT,
  Sandshrew: [['rabbit_hide', 0, 1], ['flint', 0, 1]], Sandslash: [['rabbit_hide', 1, 1], ['flint', 0, 2]],
  Eevee: RABBIT, Meowth: [['gold_nugget', 1, 3]], Persian: [['gold_nugget', 2, 4]], // PAY DAY
  Growlithe: [['bone', 0, 1], ['leather', 0, 1]], Arcanine: [['bone', 1, 2], ['leather', 1, 2]], Vulpix: [['rabbit_hide', 0, 1]], Ninetales: [['rabbit_hide', 1, 1]],
  Cubone: [['bone', 1, 2]], Marowak: [['bone', 2, 3]],
  // Eggs.
  Chansey: [['egg', 1, 3]], Exeggcute: [['egg', 1, 2]], Exeggutor: [['egg', 1, 2], ['apple', 0, 2]],
  // Bugs: string; bees: honeycomb; spiders: eyes.
  Caterpie: BUG, Metapod: BUG, Butterfree: [['string', 1, 2]], Weedle: BUG, Kakuna: BUG, Beedrill: [['honeycomb', 0, 1], ['string', 0, 1]],
  Venonat: [['spider_eye', 0, 1], ['string', 0, 1]], Venomoth: [['string', 1, 2]], Paras: [['red_mushroom', 1, 1]], Parasect: [['red_mushroom', 1, 2], ['brown_mushroom', 1, 2]],
  Scyther: [['string', 0, 1]], Pinsir: [['string', 0, 1]],
  // Plants: seeds, berries, flowers.
  Oddish: [['wheat_seeds', 1, 2]], Gloom: [['poppy', 0, 1], ['wheat_seeds', 1, 2]], Vileplume: [['poppy', 1, 2]],
  Bellsprout: [['wheat_seeds', 1, 2]], Weepinbell: [['sweet_berries', 0, 2]], Victreebel: [['sweet_berries', 1, 3]],
  Tangela: [['kelp', 1, 3]],
  // Slime, gas and sparks.
  Grimer: [['slime_ball', 1, 2]], Muk: [['slime_ball', 2, 3]], Koffing: [['gunpowder', 0, 2]], Weezing: [['gunpowder', 1, 2]],
  Voltorb: [['redstone', 1, 2]], Electrode: [['redstone', 1, 3]], Magnemite: [['iron_nugget', 1, 2]], Magneton: [['iron_nugget', 2, 4]],
  Pikachu: [['redstone', 0, 1]], Raichu: [['redstone', 1, 2]],
  // Rock and ground.
  Geodude: [['cobblestone', 1, 2], ['flint', 0, 1]], Graveler: [['cobblestone', 1, 3]], Onix: [['cobblestone', 2, 4], ['coal', 0, 1]],
  Diglett: [['clay_ball', 0, 2]], Dugtrio: [['clay_ball', 1, 3]],
  // Snakes: hide.
  Ekans: [['leather', 0, 1]], Arbok: [['leather', 1, 2]], Dratini: [['leather', 0, 1]],
  // Fluffy ones: wool.
  Jigglypuff: [['white_wool', 0, 1]], Wigglytuff: [['white_wool', 1, 2]], Clefairy: [['white_wool', 0, 1]], Clefable: [['white_wool', 1, 1]],
};

const FOOD = new Set(['cod', 'salmon', 'chicken', 'beef', 'rabbit', 'egg', 'apple', 'sweet_berries', 'porkchop', 'mutton', 'wheat']);

/// Items a fainted wild Pokémon drops: [[item, n]]. `hunter` adds one to
/// each food drop (a Normal-type partner). Higher levels drop a little more.
export function faintDrops(species, level, hunter, rand = Math.random) {
  const list = FAINT_DROPS[species];
  if (!list) return [];
  const out = [];
  const extra = level >= 30 ? 1 : 0;
  for (const [item, lo, hi] of list) {
    let n = lo + Math.floor(rand() * (hi - lo + 1));
    if (n > 0 || FOOD.has(item)) n += FOOD.has(item) ? (hunter ? 1 : 0) + extra : 0;
    if (n > 0) out.push([item, n]);
  }
  return out;
}
