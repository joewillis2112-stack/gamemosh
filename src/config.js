// Central tuning. Change numbers here rather than hunting through systems.
export const WORLD = {
  HALF: 1024, // world spans -HALF..HALF on X and Z (2 km across)
  PLAYABLE: 940, // invisible boundary for the player
  CHUNK: 64, // metres per terrain chunk
  RES: 32, // terrain quads per chunk side (2 m grid)
  WATER: 0, // sea / lake level
  MAJOR_COUNT: 6,
  MINOR_COUNT: 72,
};

export const QUALITY = {
  low: { viewChunks: 3, pixelRatio: 1, shadows: false, veg: 0.55, fogFar: 190, antialias: false },
  medium: { viewChunks: 4, pixelRatio: 1.5, shadows: false, veg: 0.8, fogFar: 250, antialias: true },
  high: { viewChunks: 5, pixelRatio: 2, shadows: true, veg: 1, fogFar: 320, antialias: true },
};

export const DAY_LENGTH = 14 * 60; // seconds of real time per full day

export const PLAYER = {
  radius: 0.35,
  halfHeight: 0.55,
  walk: 4.2,
  sprint: 7.2,
  jump: 6.8,
  gravity: 22,
  rollSpeed: 9.5,
  rollTime: 0.55,
  iframes: 0.38,
  baseHp: 100,
  baseStamina: 100,
  staminaRegen: 32,
  sprintCost: 14,
  rollCost: 24,
  jumpCost: 10,
};

export const SAVE_KEY = 'gloamreach.save.v1';
export const SETTINGS_KEY = 'gloamreach.settings.v1';
