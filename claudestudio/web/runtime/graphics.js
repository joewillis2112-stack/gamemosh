// The graphics quality in play (and in the editor): one QualityManager (runtime/quality.js) picks
// the fidelity tier and switches every system to it, and UserGameSettings.SavedQualityLevel
// mirrors the choice both ways, as in Roblox: the in-game menu or a script sets it, the tier
// follows, and the choice is saved for the next visit. A page given ?quality= keeps that tier
// (tests, comparisons): the setting is still there, but changes nothing and isn't saved.
import { QualityManager, guessTier, deviceFacts, TIER_LEVEL } from './quality.js';
import { ENUMS } from '../datamodel.js';

const LEVELS = Object.keys(ENUMS.SavedQualitySetting); // index = level (0: Automatic)

export class Graphics {
  /** R: the renderer (createRenderer); fixed: a tier from the page, or null. */
  constructor(R, dm, fixed = null) {
    Object.assign(this, { R, dm });
    this.systems = [];
    let store = null;
    try { store = window.localStorage; } catch { /* storage blocked: the choice lasts this visit */ }
    this.manager = new QualityManager({ store, fixed, guess: guessTier(deviceFacts(R.engine)), apply: t => this.apply(t) });
    if (this.manager.tier !== R.quality) R.setTier(this.manager.tier);
    this.settings = dm.userGameSettings();
    this.settings.props.SavedQualityLevel = LEVELS[this.manager.level]; // before the place's scripts read it
    dm.watch((inst, key) => {
      if (inst !== this.settings || key !== 'SavedQualityLevel') return;
      const v = inst.props.SavedQualityLevel, level = ENUMS.SavedQualitySetting[typeof v === 'string' ? v : v && v.name];
      if (level !== undefined && level !== this.manager.level) { this.manager.setLevel(level); this.onChange && this.onChange(); }
    });
    this.last = 0;
  }
  /** The tier every system was built with (pass it to their constructors). */
  get tier() { return this.manager.tier; }
  /** Systems with setTier(name), switched together with the renderer. */
  add(...systems) { this.systems.push(...systems.filter(Boolean)); }
  apply(t) {
    this.R.setTier(t);
    for (const s of this.systems) s.setTier(t);
    this.onChange && this.onChange();
  }
  /** The player's choice (0: Automatic, 1..10), through the setting, so scripts see it change. */
  setLevel(level) { this.dm.set(this.settings, 'SavedQualityLevel', LEVELS[Math.max(0, Math.min(10, level))]); }
  /** What the menu shows: the chosen level, or Automatic's current one. */
  get shownLevel() { return this.manager.level || TIER_LEVEL[this.manager.tier]; }
  /** Each drawn frame: Automatic watches the frame time. */
  frame(now = performance.now()) {
    if (this.last) this.manager.frame(now - this.last, now);
    this.last = now;
  }
}
