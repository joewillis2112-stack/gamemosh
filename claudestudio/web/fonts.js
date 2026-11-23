// Roblox's fonts: the Font datatype (family, weight, style), Enum.Font's mapping to it, and the
// bundled families that draw each one. Used by the DataModel (TextLabel.Font and FontFace kept in
// step, as Roblox keeps them) and the GUI (runtime/gui.js draws a FontFace); the VM's Font datatype
// (luau/more_types.h) asks the DataModel's host for Font.fromEnum, so this is the one table.
//
// Enum.Font -> family: Roblox's table (creator-docs, datatypes/Font.yaml, Font.fromEnum). Gotham* and
// Arial* "map to the Montserrat / Arimo family" (enums/Font.yaml). Weights and styles: the variant
// each item's name says (SourceSansLight is Light, GothamBlack Heavy, SourceSansItalic Italic; OURS
// where the docs list only the family).
import FAMILIES from '../assets/fonts/families.json' with { type: 'json' };

export const FONT_WEIGHTS = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Heavy: 900 };
export const FONT_STYLES = { Normal: 0, Italic: 1 };
export const FAMILY_PREFIX = 'rbxasset://fonts/families/';

/** Roblox's Font datatype. weight and style are Enum.FontWeight / Enum.FontStyle item names. */
export class Font {
  constructor(family = FAMILY_PREFIX + 'LegacyArial.json', weight = 'Regular', style = 'Normal') { this.family = family; this.weight = weight; this.style = style; }
  equals(o) { return o instanceof Font && o.family === this.family && o.weight === this.weight && o.style === this.style; }
  get bold() { return FONT_WEIGHTS[this.weight] >= 600; }
}

const own = n => [n, 'Regular', 'Normal'];
export const ENUM_FONTS = {
  Legacy: own('LegacyArial'), Arial: own('Arimo'), ArialBold: ['Arimo', 'Bold', 'Normal'], Arimo: own('Arimo'), ArimoBold: ['Arimo', 'Bold', 'Normal'],
  SourceSans: own('SourceSansPro'), SourceSansBold: ['SourceSansPro', 'Bold', 'Normal'], SourceSansLight: ['SourceSansPro', 'Light', 'Normal'],
  SourceSansItalic: ['SourceSansPro', 'Regular', 'Italic'], SourceSansSemibold: ['SourceSansPro', 'SemiBold', 'Normal'],
  Gotham: own('Montserrat'), GothamMedium: ['Montserrat', 'Medium', 'Normal'], GothamBold: ['Montserrat', 'Bold', 'Normal'], GothamBlack: ['Montserrat', 'Heavy', 'Normal'],
  BuilderSans: own('BuilderSans'), BuilderSansMedium: ['BuilderSans', 'Medium', 'Normal'], BuilderSansBold: ['BuilderSans', 'Bold', 'Normal'], BuilderSansExtraBold: ['BuilderSans', 'ExtraBold', 'Normal'],
  Bodoni: own('AccanthisADFStd'), Garamond: own('Guru'), Cartoon: own('ComicNeueAngular'), Code: own('Inconsolata'), Highway: own('HighwayGothic'),
  SciFi: own('Zekton'), Arcade: own('PressStart2P'), Fantasy: own('Balthazar'), Antique: own('RomanAntique'),
  AmaticSC: own('AmaticSC'), Bangers: own('Bangers'), Creepster: own('Creepster'), DenkOne: own('DenkOne'), Fondamento: own('Fondamento'), FredokaOne: own('FredokaOne'),
  GrenzeGotisch: own('GrenzeGotisch'), IndieFlower: own('IndieFlower'), JosefinSans: own('JosefinSans'), Jura: own('Jura'), Kalam: own('Kalam'), LuckiestGuy: own('LuckiestGuy'),
  Merriweather: own('Merriweather'), Michroma: own('Michroma'), Nunito: own('Nunito'), Oswald: own('Oswald'), PatrickHand: own('PatrickHand'), PermanentMarker: own('PermanentMarker'),
  Roboto: own('Roboto'), RobotoCondensed: own('RobotoCondensed'), RobotoMono: own('RobotoMono'), Sarpanch: own('Sarpanch'), SpecialElite: own('SpecialElite'),
  TitilliumWeb: own('TitilliumWeb'), Ubuntu: own('Ubuntu'),
};
/** Font.fromEnum: the Font an Enum.Font item names (null for Unknown or a name that isn't one). */
export function fontFromEnum(name) { const f = ENUM_FONTS[name]; return f ? new Font(FAMILY_PREFIX + f[0] + '.json', f[1], f[2]) : null; }
/** The Enum.Font a Font matches, or 'Unknown' (Roblox's Font property for a FontFace with no enum value).
 *  Where several match (Arial and Arimo), the newer item (OURS). */
export function enumFromFont(font) {
  let best = 'Unknown';
  for (const [name, [fam, w, st]] of Object.entries(ENUM_FONTS)) if (font.family === FAMILY_PREFIX + fam + '.json' && font.weight === w && font.style === st) best = name;
  return best;
}

// Roblox's family (rbxasset://fonts/families/<X>.json) -> the bundled CSS family that draws it
// (assets/fonts/families.json; its README says why for each stand-in), and the CSS weight for a
// FontWeight where the face has its own (Fredoka One is one heavy weight: Fredoka's 600).
const FAMILY_CSS = {
  LegacyArial: 'Arimo', Arimo: 'Arimo', SourceSansPro: 'Source Sans 3', Montserrat: 'Montserrat', PressStart2P: 'Press Start 2P', FredokaOne: 'Fredoka',
  BuilderSans: 'Nunito', Roboto: 'Roboto', RobotoCondensed: 'Roboto Condensed', RobotoMono: 'Roboto Mono', Nunito: 'Nunito', Oswald: 'Oswald', Bangers: 'Bangers',
  AmaticSC: 'Amatic SC', Balthazar: 'Balthazar', ComicNeueAngular: 'Comic Neue Angular', Creepster: 'Creepster', DenkOne: 'Denk One', Fondamento: 'Fondamento',
  GrenzeGotisch: 'Grenze Gotisch', Inconsolata: 'Inconsolata', IndieFlower: 'Indie Flower', JosefinSans: 'Josefin Sans', Jura: 'Jura', Kalam: 'Kalam',
  LuckiestGuy: 'Luckiest Guy', Merriweather: 'Merriweather', Michroma: 'Michroma', PatrickHand: 'Patrick Hand', PermanentMarker: 'Permanent Marker',
  Sarpanch: 'Sarpanch', SpecialElite: 'Special Elite', TitilliumWeb: 'Titillium Web', Ubuntu: 'Ubuntu', AccanthisADFStd: 'Accanthis ADF Std No3',
  // Stand-ins (families.json says why): Roblox's own isn't open or wasn't found.
  HighwayGothic: 'Overpass', Guru: 'EB Garamond', Zekton: 'Orbitron', RomanAntique: 'Cinzel',
  // OURS: stand-ins for Roblox's Builder Mono and Builder Extended (not open; nothing bundled for them).
  BuilderMono: 'Roboto Mono', BuilderExtended: 'Nunito',
};
const WEIGHT_CSS = { FredokaOne: w => Math.max(w, 600) };
/** The CSS [family, weight, style] that draws a Font. A family Roblox doesn't have but this studio
 *  bundles (families.json's names: Font.fromName("Overpass")) draws in it (Claude Studio's own); an
 *  unknown one falls back to Arimo, as Legacy. */
export function cssFont(font) {
  const m = /^rbxasset:\/\/fonts\/families\/([A-Za-z0-9_-]+)\.json$/.exec(font && font.family || '');
  const key = m ? m[1] : null;
  const family = key && (FAMILY_CSS[key] || (FAMILIES[key] && FAMILIES[key].family)) || 'Arimo';
  const w = FONT_WEIGHTS[font && font.weight] || 400;
  return [family, key && WEIGHT_CSS[key] ? WEIGHT_CSS[key](w) : w, font && font.style === 'Italic' ? 'italic' : 'normal'];
}
