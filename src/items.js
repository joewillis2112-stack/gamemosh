// Item definitions, loot tables, crafting recipes.
import { RNG } from './core/rng.js';

export const ITEMS = {
  // Weapons: dmg per light hit, speed multiplier, reach (m), stamina per swing
  rusted_sword: { name: 'Rusted Shortsword', type: 'weapon', model: 'sword', dmg: 14, speed: 1.0, reach: 2.1, stamina: 16, desc: 'Notched and flaking. It still cuts.' },
  woodsman_axe: { name: "Woodsman's Axe", type: 'weapon', model: 'axe', dmg: 19, speed: 0.85, reach: 2.0, stamina: 20, desc: 'Fells trees and hollows alike. Gathers extra wood.' },
  pilgrim_spear: { name: 'Pilgrim Spear', type: 'weapon', model: 'spear', dmg: 15, speed: 1.1, reach: 2.9, stamina: 15, desc: 'Long reach. Carried north by those who never returned.' },
  iron_mace: { name: 'Iron Mace', type: 'weapon', model: 'mace', dmg: 22, speed: 0.8, reach: 1.9, stamina: 22, poise: 1.6, desc: 'Breaks guard and bone. Staggers easily.' },
  knight_greatsword: { name: 'Vigil Greatsword', type: 'weapon', model: 'greatsword', dmg: 30, speed: 0.62, reach: 2.8, stamina: 30, poise: 1.8, desc: 'Sworn blade of the Last Vigil. Heavy as an oath.' },
  warden_cleaver: { name: "Warden's Cleaver", type: 'weapon', model: 'greatsword', dmg: 36, speed: 0.66, reach: 2.9, stamina: 30, poise: 2, relic: true, desc: 'Taken from a keeper who forgot what he kept.' },
  ember_blade: { name: 'Ember-Wrought Blade', type: 'weapon', model: 'sword', dmg: 26, speed: 1.05, reach: 2.3, stamina: 17, relic: true, burn: true, desc: 'Warm to the touch. Sets the hollow alight.' },
  hound_fang: { name: 'Carrion Fang', type: 'weapon', model: 'spear', dmg: 25, speed: 1.15, reach: 3.0, stamina: 16, relic: true, desc: 'A spear tipped with a tooth the length of a forearm.' },

  // Armour: def reduces damage, weight slows rolls a little
  tattered_cloak: { name: 'Tattered Cloak', type: 'armor', def: 2, weight: 0, desc: 'Keeps off rain. Not much else.' },
  gambeson: { name: 'Quilted Gambeson', type: 'armor', def: 7, weight: 0.05, desc: 'Padded layers stitched by a patient hand.' },
  chain_hauberk: { name: 'Chain Hauberk', type: 'armor', def: 13, weight: 0.12, desc: 'Rusted links. Turns a blade, not a hammer.' },
  blackened_plate: { name: 'Blackened Plate', type: 'armor', def: 21, weight: 0.22, desc: 'Scorched in some old fire. Heavy.' },
  warden_mantle: { name: "Warden's Mantle", type: 'armor', def: 18, weight: 0.08, relic: true, desc: 'Grey wool over mail. Light for its strength.' },

  // Charms
  ember_locket: { name: 'Ember Locket', type: 'charm', effect: 'stamina', desc: 'Stamina recovers 30% faster.' },
  bone_talisman: { name: 'Bone Talisman', type: 'charm', effect: 'damage', desc: 'Attacks deal 15% more damage.' },
  pale_ring: { name: 'Pale Ring', type: 'charm', effect: 'dread', desc: 'Dread builds 40% slower.' },
  wolf_fang: { name: 'Wolf-Fang Necklace', type: 'charm', effect: 'speed', desc: 'Move 10% faster.' },
  miser_coin: { name: "Miser's Coin", type: 'charm', effect: 'embers', desc: 'Fallen foes yield 25% more embers.' },

  // Consumables
  dried_meat: { name: 'Dried Meat', type: 'consumable', desc: 'Restores 35 health over a few seconds.' },
  pale_herb: { name: 'Pale Herb', type: 'consumable', desc: 'Bitter. Calms the mind: removes 40 dread.' },
  torch: { name: 'Torch', type: 'consumable', desc: 'Adds 4 minutes of torch fuel. Light keeps dread at bay.' },
  firebomb: { name: 'Firebomb', type: 'throwable', desc: 'Throw to burst in flame. Ignites pitch barrels.' },

  // Materials
  wood: { name: 'Wood', type: 'material', desc: 'Split from dead trees.' },
  bone: { name: 'Bone', type: 'material', desc: 'Taken from the dead. They will not miss it.' },
  iron_scrap: { name: 'Iron Scrap', type: 'material', desc: 'Used to temper weapons.' },
  cloth: { name: 'Cloth', type: 'material', desc: 'Torn from banners and shrouds.' },
  resin: { name: 'Resin', type: 'material', desc: 'Sticky, flammable sap.' },
  ember_shard: { name: 'Ember Shard', type: 'material', desc: 'A splinter of old fire. Needed to reforge weapons past +2.' },
};

export const RECIPES = [
  { out: 'torch', qty: 1, needs: { wood: 1, cloth: 1 }, where: 'fire' },
  { out: 'firebomb', qty: 1, needs: { resin: 1, cloth: 1, bone: 1 }, where: 'fire' },
  { out: 'dried_meat', qty: 1, needs: { bone: 2, wood: 1 }, where: 'fire', desc: 'Boil the marrow.' },
  { out: 'pale_herb', qty: 1, needs: { resin: 2 }, where: 'fire', desc: 'Steep resin into a bitter tea.' },
  { out: 'gambeson', qty: 1, needs: { cloth: 6, bone: 2 }, where: 'fire', once: true },
  { out: 'chain_hauberk', qty: 1, needs: { iron_scrap: 8, cloth: 2 }, where: 'fire', once: true },
];

// Upgrade cost for weapon level n -> n+1
export function upgradeCost(level) {
  const c = { iron_scrap: 2 + level * 2 };
  if (level >= 2) c.ember_shard = level - 1;
  return c;
}

const LOOT = {
  common: [['wood', 3], ['bone', 4], ['cloth', 4], ['resin', 3], ['iron_scrap', 3], ['dried_meat', 2], ['pale_herb', 1.5], ['torch', 1.2], ['firebomb', 1]],
  gear: [['woodsman_axe', 2], ['pilgrim_spear', 2], ['iron_mace', 1.6], ['gambeson', 2], ['chain_hauberk', 1.3], ['ember_locket', 1], ['bone_talisman', 1], ['pale_ring', 1], ['wolf_fang', 1], ['miser_coin', 0.8], ['knight_greatsword', 0.7], ['blackened_plate', 0.6]],
};

export const BOSS_DROPS = {
  warden: ['warden_cleaver', 'warden_mantle'],
  knight: ['knight_greatsword', 'blackened_plate'],
  witch: ['ember_blade', 'pale_ring'],
  beast: ['hound_fang', 'wolf_fang'],
};

// Returns [{id, qty}]. quality 0..1 raises gear chance.
export function rollLoot(seed, danger, quality = 0.3) {
  const rng = new RNG(seed);
  const out = [];
  const n = rng.int(2, 3) + (quality > 0.6 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const id = rng.weighted(LOOT.common);
    const qty = ITEMS[id].type === 'material' ? rng.int(1, 2 + Math.floor(danger / 2)) : 1;
    out.push({ id, qty });
  }
  if (rng.chance(0.18 + quality * 0.5)) out.push({ id: rng.weighted(LOOT.gear), qty: 1 });
  if (danger >= 3 && rng.chance(0.25 + quality * 0.3)) out.push({ id: 'ember_shard', qty: 1 });
  return out;
}

export function itemName(id, level = 0) {
  const d = ITEMS[id];
  if (!d) return id;
  return level > 0 ? `${d.name} +${level}` : d.name;
}

// The Pale Merchant's wares, priced in embers
export const MERCHANT = [
  { id: 'torch', price: 60 },
  { id: 'dried_meat', price: 70 },
  { id: 'pale_herb', price: 90 },
  { id: 'firebomb', price: 140 },
  { id: 'cloth', price: 35 },
  { id: 'resin', price: 45 },
  { id: 'iron_scrap', price: 80 },
  { id: 'ember_shard', price: 450 },
  { id: 'gambeson', price: 600, once: true },
  { id: 'pilgrim_spear', price: 900, once: true },
  { id: 'ember_locket', price: 1200, once: true },
  { id: 'flask', price: 1500, special: true, name: 'Flask ember', desc: 'Your flask holds one more draught.' },
];
