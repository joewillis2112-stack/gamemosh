// Your lead Pokémon's types change how you survive the Minecraft world, the
// way GTA's story-mode abilities still work in a Rocket League car. The lead
// is the first Pokémon in your party that hasn't fainted (the one following
// you); swap it in Pokémon's START menu to change perks.

/// What each type does for you. `text` is shown in the HUD.
export const PERKS = {
  Water: { text: 'breathe 3× longer, swim faster', breath: 3, swim: 1.5 },
  Flying: { text: 'hold JUMP to glide; no fall damage', glide: true, noFall: true },
  Fire: { text: 'lights the dark around you; lava hurts less; food cooks as you eat', hand: 1, lava: 0.35, cook: true },
  Grass: { text: 'heals you slowly in sunlight; crops give more; sneak through grass and weaker wild Pokémon stay hidden', sunHeal: true, farm: true, repel: true },
  Electric: { text: 'FLASH: the night is never pitch black', floor: 0.16 },
  Ice: { text: 'water freezes under your feet', frost: true },
  Ghost: { text: 'the undead leave you alone', calm: /^(zombie|husk|drowned|skeleton|stray)$/ },
  Poison: { text: 'spiders leave you alone', calm: /^spider$/ },
  Bug: { text: 'spiders leave you alone; jump higher; sneak through grass and weaker wild Pokémon stay hidden', calm: /^spider$/, jump: 1.15, repel: true },
  Rock: { text: 'mines stone and ore 1.5× faster', mine: 1.5 },
  Ground: { text: 'mines dirt, sand and gravel 2× faster; mines stone 1.3× faster', mine: 1.3, dig: 2 },
  Fighting: { text: 'your punches hit 3 harder', melee: 3 },
  Normal: { text: 'you get hungry 30% slower; hunting gives more food', hunger: 0.7, hunt: true },
  Psychic: { text: 'senses monsters coming', sense: true },
  Dragon: { text: 'you take 30% less damage', armour: 0.7 },
};

const LOWER = new Set(['hunger', 'armour', 'lava']);

/// The merged perks of a Pokémon with these types (Gen 1 names, e.g. ["Grass", "Poison"]).
export function perksFor(types) {
  const p = { types: [], calm: [], text: [] };
  for (const t of new Set(types || [])) {
    const k = PERKS[t];
    if (!k) continue;
    p.types.push(t);
    p.text.push(`${t.toUpperCase()}: ${k.text}`);
    for (const [key, v] of Object.entries(k)) {
      if (key === 'text') continue;
      if (key === 'calm') p.calm.push(v);
      // Multipliers below 1 (hunger, damage taken) combine to the smallest; the rest to the largest.
      else if (typeof v === 'number') p[key] = LOWER.has(key) ? Math.min(p[key] ?? 1, v) : Math.max(p[key] ?? 0, v);
      else p[key] = v;
    }
  }
  return p;
}

/// Does a mob of this type leave you alone?
export const calms = (perks, type) => !!perks && perks.calm.some((re) => re.test(type));

/// Pokémon you can ride: four-legged ones on land, big swimmers on water,
/// big fliers in the air. `speed` multiplies walking; `seat` is how much
/// higher your eyes are.
export const MOUNTS = {
  Tauros: { kind: 'land', speed: 1.9, jump: 1.25, seat: 0.7 },
  Ponyta: { kind: 'land', speed: 2.0, jump: 1.3, seat: 0.6 },
  Rapidash: { kind: 'land', speed: 2.4, jump: 1.35, seat: 0.8 },
  Rhyhorn: { kind: 'land', speed: 1.5, jump: 1.1, seat: 0.6 },
  Rhydon: { kind: 'land', speed: 1.6, jump: 1.1, seat: 0.9 },
  Arcanine: { kind: 'land', speed: 2.3, jump: 1.35, seat: 0.8 },
  Ninetales: { kind: 'land', speed: 2.0, jump: 1.3, seat: 0.5 },
  Doduo: { kind: 'land', speed: 1.8, jump: 1.2, seat: 0.6 },
  Dodrio: { kind: 'land', speed: 2.2, jump: 1.3, seat: 0.8 },
  Kangaskhan: { kind: 'land', speed: 1.5, jump: 1.15, seat: 0.9 },
  Lapras: { kind: 'surf', speed: 1.6, seat: 0.5 },
  Gyarados: { kind: 'surf', speed: 2.0, seat: 0.6 },
  Dewgong: { kind: 'surf', speed: 1.6, seat: 0.4 },
  Tentacruel: { kind: 'surf', speed: 1.5, seat: 0.4 },
  Seaking: { kind: 'surf', speed: 1.4, seat: 0.3 },
  Starmie: { kind: 'surf', speed: 1.7, seat: 0.3 },
  Pidgeot: { kind: 'fly', speed: 1.0, seat: 0.5 },
  Fearow: { kind: 'fly', speed: 1.1, seat: 0.5 },
  Charizard: { kind: 'fly', speed: 1.1, seat: 0.7 },
  Aerodactyl: { kind: 'fly', speed: 1.3, seat: 0.6 },
  Dragonite: { kind: 'fly', speed: 1.2, seat: 0.8 },
  Articuno: { kind: 'fly', speed: 1.2, seat: 0.6 },
  Zapdos: { kind: 'fly', speed: 1.3, seat: 0.6 },
  Moltres: { kind: 'fly', speed: 1.2, seat: 0.6 },
};
export const mountFor = (species) => MOUNTS[species] || null;
