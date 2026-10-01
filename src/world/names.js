// Seeded place and character names. Kept grim, not goofy.
const PRE = ['Ash', 'Grim', 'Hol', 'Vael', 'Mor', 'Dun', 'Bleak', 'Ser', 'Oss', 'Wyr', 'Thorn', 'Hael',
  'Raven', 'Gloam', 'Sallow', 'Umber', 'Ker', 'Drear', 'Cinder', 'Wither', 'Black', 'Lorn', 'Fell', 'Grey'];
const SUF = ['mere', 'hold', 'moor', 'fell', 'gard', 'wick', 'reach', 'barrow', 'stead', 'crag', 'fen',
  'vale', 'mark', 'ford', 'hithe', 'wold', 'combe', 'thorpe'];
const EPITHET_NOUN = ['Ash', 'Silence', 'Ruin', 'Embers', 'Thorns', 'the Drowned', 'the Last Vigil',
  'Pale Light', 'the Hanged', 'Crows', 'Quiet Bells', 'the Broken Oath', 'Salt', 'Old Kings'];
const SAINT = ['Pale Saint', 'Weeping Mother', 'Blind Shepherd', 'Iron Martyr', 'Ashen Choir', 'Lantern Bearer'];
const FIRST = ['Aldric', 'Morwen', 'Cassen', 'Ysolde', 'Garrow', 'Ilse', 'Branoc', 'Veyra', 'Othric',
  'Sabine', 'Rook', 'Maelis', 'Tamsin', 'Corvus', 'Hesk', 'Lenore'];
const BOSS_TITLE = {
  warden: ['the Hollow Warden', 'Keeper of the Gate', 'the Oathless'],
  knight: ['the Blackened Knight', 'Last of the Vigil', 'the Rusted Oath'],
  witch: ['the Ember Witch', 'Mother of Ash', 'the Candle-Eater'],
  beast: ['the Carrion Hound', 'Old Maw', 'the Barrow Wolf'],
};

export function placeName(rng) {
  return rng.pick(PRE) + rng.pick(SUF);
}

export function locationName(rng, type) {
  const p = placeName(rng);
  switch (type) {
    case 'keep': return rng.pick([`${p} Keep`, `The Hollow Keep of ${p}`, `Castle ${p}`]);
    case 'cathedral': return rng.pick([`Cathedral of the ${rng.pick(SAINT)}`, `${p} Cathedral`]);
    case 'necropolis': return rng.pick([`Necropolis of ${p}`, `The Barrows of ${p}`, `${p} Ossuary`]);
    case 'hamlet': return rng.pick([p, `${p} Hamlet`, `Abandoned ${p}`]);
    case 'shrine': return `Shrine of ${rng.pick(EPITHET_NOUN)}`;
    case 'watchtower': return `${p} Watch`;
    case 'stones': return rng.pick([`Stones of ${rng.pick(EPITHET_NOUN)}`, `${p} Circle`]);
    case 'camp': return rng.pick([`Deserters' Camp`, `Pilgrim Camp`, `${p} Camp`]);
    case 'gallows': return rng.pick([`${p} Gallows`, `Gallows of ${rng.pick(EPITHET_NOUN)}`]);
    case 'wreck': return rng.pick([`Overturned Wagon`, `Merchant's Ruin`, `Wreck at ${p}`]);
    case 'cairn': return `Cairn of ${rng.pick(FIRST)}`;
    case 'crypt': return rng.pick([`Crypt of ${rng.pick(FIRST)}`, `${p} Crypt`]);
    default: return p;
  }
}

export function bossName(rng, kind) {
  return `${rng.pick(FIRST)}, ${rng.pick(BOSS_TITLE[kind] || BOSS_TITLE.warden)}`;
}

const LORE_OPEN = [
  'The bells stopped the winter the sun did not rise.',
  'We lit the beacons as our fathers did, and still the Gloam came.',
  'Whoever reads this: do not rest where the fire has gone out.',
  'The Warden swore to keep the gate. He keeps it still, though he no longer remembers why.',
  'My brother went to the barrows for silver. He came back, but he was not my brother.',
  'Salt the thresholds. Burn the dead. Keep a flame lit through the night.',
  'They say six fires once held back the dark. Now there is only ash where they burned.',
  'The crows eat well this year. That is all the good news I have.',
  'I have counted the days by candle stubs. There are no candles left.',
  'Pilgrims walk north to the cathedral. None walk south again.',
];
const LORE_CLOSE = [
  'If the beacons burn again, perhaps the morning will return.',
  'May the embers keep you.',
  'I am going to the shrine. If I do not return, take my blade.',
  'Forgive me. I could not carry the fire any further.',
  'Listen for the wind. When it stops, run.',
  'The wolves do not fear the dark. They fear only fire.',
];

export function loreText(rng, placeLabel) {
  return `${rng.pick(LORE_OPEN)} ${rng.chance(0.5) ? `Near ${placeLabel}, ` : ''}${rng.pick(LORE_CLOSE)}`;
}
