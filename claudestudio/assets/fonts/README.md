# Fonts

Every `Enum.Font` is drawn in the family Roblox's own table names (creator-docs, the Font datatype:
each Enum.Font's `rbxasset://fonts/families/*.json`), or in an open stand-in where Roblox's family
isn't open or couldn't be found. `families.json` lists each family's files, weights, licence and
source, and says what a stand-in stands in for. `runtime/gui.js` maps Enum.Font to these families.

- **Where the files come from:**
  - Most are from github.com/google/fonts (`tools/fetch-fonts.py`: subset to Latin, WOFF2, variable where the family is).
  - Comic Neue Angular and Accanthis ADF Std come from CTAN.
- **Licences:**
  - SIL OFL 1.1 (`OFL.txt`);
  - Apache 2.0 (`LICENSE-Apache-2.0.txt`: Luckiest Guy, Permanent Marker, Special Elite);
  - Ubuntu Font Licence 1.0 (`LICENSE-UFL-1.0.txt`);
  - GPL 2 with the font exception (`LICENSE-AccanthisADFStd.txt`).

  Each family's copyright is in its font file.
- **Loading:** only the fonts on screen are fetched; the CoreGui's are loaded up front.

## Stand-ins

| Enum.Font | Roblox's family | Drawn in | Why |
|---|---|---|---|
| BuilderSans* | Builder Sans | Nunito | Builder Sans isn't open |
| Gotham* | Gotham SSm | Montserrat | Roblox's own mapping |
| FredokaOne | Fredoka One | Fredoka | its OFL successor (google/fonts dropped Fredoka One) |
| Highway | Highway Gothic | Overpass | Overpass is drawn after Highway Gothic |
| Garamond | Guru | EB Garamond | Guru couldn't be found |
| SciFi | Zekton | Orbitron | Zekton's free licence excludes embedding |
| Antique | Roman Antique | Cinzel | Roman Antique couldn't be found; Roman capitals are a guess at its look |

## Glyph outlines

`glyphs/<Family>-<weight>[i].json.gz` holds each family's Latin glyphs as SVG path data in font
units (`tools/glyphs.py`, from the files here; variable fonts instanced at 400 and 700). The
editor uses them for exact text outlines.
