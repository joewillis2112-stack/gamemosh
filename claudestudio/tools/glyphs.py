#!/usr/bin/env python3
"""Each bundled family's glyph outlines (assets/fonts/families.json), for exact text outlines in the
editor (vector editor: Type > Create Outlines, Pathfinder on text): one gzipped JSON per family, weight and
style in assets/fonts/glyphs/, written from the font files themselves with fontTools. A variable
font is instanced at the weight (400, and 700 where the family has a bold); a static family uses
its own Bold / Italic file. Coordinates are font units (y up), as SVG path data.

{ "upm": 1000, "ascender": 900, "descender": -250, "glyphs": { "A": [advance, "M..Z"], ... } }

usage: python3 tools/glyphs.py      (needs fonttools and brotli)
"""
import gzip, json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.varLib import instancer

FONTS = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
OUT = os.path.join(FONTS, 'glyphs')

def export(font, path):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    glyphs = {}
    for code, name in sorted(cmap.items()):
        if code < 32 or name not in gs:
            continue
        pen = SVGPathPen(gs, ntos=lambda v: str(round(v)))
        gs[name].draw(pen)
        glyphs[chr(code)] = [hmtx[name][0], pen.getCommands()]
    os2 = font['OS/2'] if 'OS/2' in font else None
    hhea = font['hhea']
    data = {'upm': font['head'].unitsPerEm,
            'ascender': os2.sTypoAscender if os2 else hhea.ascent,
            'descender': os2.sTypoDescender if os2 else hhea.descent,
            'glyphs': glyphs}
    raw = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    with open(path + '.gz', 'wb') as out, gzip.GzipFile(fileobj=out, mode='wb', compresslevel=9, mtime=0) as f: # fetched and un-gzipped by the page; mtime 0: the same file every run
        f.write(raw)
    return len(glyphs)

def main():
    os.makedirs(OUT, exist_ok=True)
    families = json.load(open(os.path.join(FONTS, 'families.json')))
    for key, fam in families.items():
        for file in fam['files']:
            font = TTFont(os.path.join(FONTS, file['file']))
            italic = file['style'] == 'italic'
            if 'fvar' in font:
                axes = {a.axisTag: a for a in font['fvar'].axes}
                weights = [w for w in (400, 700) if 'wght' not in axes or axes['wght'].minValue <= w <= axes['wght'].maxValue]
                for w in weights:
                    loc = {tag: (w if tag == 'wght' else a.defaultValue) for tag, a in axes.items()}
                    inst = instancer.instantiateVariableFont(TTFont(os.path.join(FONTS, file['file'])), loc)
                    n = export(inst, os.path.join(OUT, f"{fam['family']}-{w}{'i' if italic else ''}.json"))
                    print(fam['family'], w, 'italic' if italic else '', n, 'glyphs (instanced)')
            else:
                w = int(str(file['weight']).split()[0])
                n = export(font, os.path.join(OUT, f"{fam['family']}-{w}{'i' if italic else ''}.json"))
                print(fam['family'], w, 'italic' if italic else '', n, 'glyphs')

if __name__ == '__main__':
    main()
