// Your lead Pokémon's types change how you survive the Minecraft world, the
// way GTA's story-mode abilities still work in a Rocket League car. The lead
// is the first Pokémon in your party that hasn't fainted (the one following
// you); swap it in Pokémon's START menu to change perks.

/// What each type does for you. `text` is shown in the HUD.
export const PERKS = {
  Water: { text: 'breathe 3× longer, swim faster', breath: 3, swim: 1.5 },
  Flying: { text: 'hold JUMP to glide; no fall damage', glide: true, noFall: true },
  Fire: { text: 'lights the dark around you; lava hurts less; food cooks as you eat', hand: 1, lava: 0.35, cook: true },
  Grass: { text: 'heals you slowly in sunlight', sunHeal: true },
  Electric: { text: 'FLASH: the night is never pitch black', floor: 0.16 },
  Ice: { text: 'water freezes under your feet', frost: true },
  Ghost: { text: 'the undead leave you alone', calm: /^(zombie|husk|drowned|skeleton|stray)$/ },
  Poison: { text: 'spiders leave you alone', calm: /^spider$/ },
  Bug: { text: 'spiders leave you alone; climbs one block higher', calm: /^spider$/, jump: 1.15 },
  Rock: { text: 'mines stone and ore 1.5× faster', mine: 1.5 },
  Ground: { text: 'mines dirt, sand and gravel 2× faster; mines stone 1.3× faster', mine: 1.3, dig: 2 },
  Fighting: { text: 'your punches hit 3 harder', melee: 3 },
  Normal: { text: 'you get hungry 30% slower', hunger: 0.7 },
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
