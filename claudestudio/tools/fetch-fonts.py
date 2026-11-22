#!/usr/bin/env python3
"""Fetch the open font families Roblox's Enum.Font values use (the Font datatype's table in
Roblox/creator-docs, reference/engine/datatypes/Font.yaml) from github.com/google/fonts, subset
them to Latin (Google's own latin subset) and write WOFF2 into assets/fonts/.

Each family's folder has METADATA.pb, which names its font files and its license (OFL, Apache,
UFL). A variable font is kept variable (one file, every weight); a family of static files keeps
its regular, bold and italic. Families already in assets/fonts are left as they are.

usage: python3 tools/fetch-fonts.py            (needs fonttools and brotli: pip install fonttools brotli)
"""
import io, json, os, re, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
RAW = 'https://raw.githubusercontent.com/google/fonts/main/'
# Roblox family file -> google/fonts folder (Font.yaml's families; the folder where it differs).
# ComicNeue stands in for Roblox's Comic Neue Angular (Cartoon), which google/fonts doesn't have;
# FredokaOne is already covered by Fredoka (its OFL successor).
FAMILIES = {
    'AmaticSC': 'amaticsc', 'Balthazar': 'balthazar', 'ComicNeue': 'comicneue', 'Creepster': 'creepster',
    'DenkOne': 'denkone', 'Fondamento': 'fondamento', 'GrenzeGotisch': 'grenzegotisch',
    'Inconsolata': 'inconsolata', 'IndieFlower': 'indieflower', 'JosefinSans': 'josefinsans', 'Jura': 'jura',
    'Kalam': 'kalam', 'LuckiestGuy': 'luckiestguy', 'Merriweather': 'merriweather', 'Michroma': 'michroma',
    'PatrickHand': 'patrickhand', 'PermanentMarker': 'permanentmarker', 'RobotoCondensed': 'robotocondensed',
    'RobotoMono': 'robotomono', 'Sarpanch': 'sarpanch', 'SpecialElite': 'specialelite', 'TitilliumWeb': 'titilliumweb',
    'Ubuntu': 'ubuntu',
}
# Open stand-ins where Roblox's family isn't open or couldn't be found (google/fonts folders).
STAND_INS = {
    'Overpass': ('overpass', 'Highway (HighwayGothic): Overpass is drawn after Highway Gothic'),
    'EBGaramond': ('ebgaramond', "Garamond (Roblox's Guru, not found)"),
    'Orbitron': ('orbitron', "SciFi (Zekton, whose free licence excludes embedding)"),
    'Cinzel': ('cinzel', "Antique (Roman Antique, not found): Roman capitals, a guess at its look"),
}
# Roblox's own families that live outside google/fonts: CTAN zips (the font files inside them).
CTAN = {
    'ComicNeueAngular': ('https://mirrors.ctan.org/fonts/comicneue.zip', 'OFL-1.1', {'ComicNeueAngular-Regular.otf': ('400', 'normal'), 'ComicNeueAngular-Bold.otf': ('700', 'normal'), 'ComicNeueAngular-RegularItalic.otf': ('400', 'italic')}),
    'AccanthisADFStd': ('https://mirrors.ctan.org/fonts/accanthis.zip', 'GPL-2.0-with-font-exception', {'AccanthisADFStdNo3-Regular.otf': ('400', 'normal'), 'AccanthisADFStdNo3-Bold.otf': ('700', 'normal'), 'AccanthisADFStdNo3-Italic.otf': ('400', 'italic')}),
}
LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()

def metadata(folder):
    for lic in ('ofl', 'apache', 'ufl'):
        try:
            return lic, get(f'{RAW}{lic}/{folder}/METADATA.pb').decode()
        except Exception:
            continue
    raise RuntimeError(f'no google/fonts folder {folder}')

def pick(meta):
    """The files to keep: a variable font if there is one, else regular, bold, italic (400/700)."""
    fonts = re.findall(r'fonts \{(.*?)\n\}', meta, re.S)
    rows = [dict(re.findall(r'(\w+): "?([^"\n]*)"?', f)) for f in fonts]
    var = [r for r in rows if '[' in r['filename']]
    if var:
        return [r for r in var if r.get('style') == 'normal'] or var[:1]
    keep = [r for r in rows if (r.get('style'), r.get('weight')) in (('normal', '400'), ('normal', '700'), ('italic', '400'))]
    return keep or rows[:1]

def woff2(data):
    f = TTFont(io.BytesIO(data))
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(unicodes=subset.parse_unicodes(LATIN)); s.subset(f)
    # An optical-size axis is pinned at its default: browsers pick it from the text size, which the
    # editor's glyph outlines (tools/glyphs.py) can't follow, and Roblox's fonts don't vary it.
    if 'fvar' in f and any(a.axisTag == 'opsz' for a in f['fvar'].axes):
        from fontTools.varLib import instancer
        f = instancer.instantiateVariableFont(f, {a.axisTag: a.defaultValue for a in f['fvar'].axes if a.axisTag == 'opsz'})
    out = io.BytesIO(); f.flavor = 'woff2'; f.save(out); return out.getvalue()

def main():
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, 'families.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for fam, folder in FAMILIES.items():
        if fam in index:
            continue
        lic, meta = metadata(folder)
        name = re.search(r'^name: "([^"]+)"', meta, re.M).group(1)
        files = []
        for r in pick(meta):
            data = get(f'{RAW}{lic}/{folder}/{r["filename"]}')
            out = f'{fam}{"-Bold" if r.get("weight") == "700" and "[" not in r["filename"] else ""}{"-Italic" if r.get("style") == "italic" else ""}.woff2'
            open(os.path.join(OUT, out), 'wb').write(woff2(data))
            axes = TTFont(io.BytesIO(data)).get('fvar')
            weight = f'{int(min(a.minValue for a in axes.axes if a.axisTag == "wght"))} {int(max(a.maxValue for a in axes.axes if a.axisTag == "wght"))}' if axes and any(a.axisTag == 'wght' for a in axes.axes) else r.get('weight', '400')
            files.append({'file': out, 'weight': weight, 'style': r.get('style', 'normal'), 'source': f'{lic}/{folder}/{r["filename"]}'})
        index[fam] = {'family': name, 'license': {'ofl': 'OFL-1.1', 'apache': 'Apache-2.0', 'ufl': 'UFL-1.0'}[lic], 'files': files}
        print(fam, name, index[fam]['license'], [f['file'] + ' ' + f['weight'] for f in files], flush=True)
        json.dump(index, open(index_path, 'w'), indent=1) # after each family: a failure keeps what was done
    for fam, (folder, note) in STAND_INS.items():
        if fam in index:
            continue
        lic, meta = metadata(folder)
        name = re.search(r'^name: "([^"]+)"', meta, re.M).group(1)
        r = pick(meta)[0]
        data = get(f'{RAW}{lic}/{folder}/{r["filename"]}')
        open(os.path.join(OUT, fam + '.woff2'), 'wb').write(woff2(data))
        axes = TTFont(io.BytesIO(data)).get('fvar')
        weight = f'{int(min(a.minValue for a in axes.axes if a.axisTag == "wght"))} {int(max(a.maxValue for a in axes.axes if a.axisTag == "wght"))}' if axes and any(a.axisTag == 'wght' for a in axes.axes) else r.get('weight', '400')
        index[fam] = {'family': name, 'license': {'ofl': 'OFL-1.1', 'apache': 'Apache-2.0', 'ufl': 'UFL-1.0'}[lic], 'standsFor': note, 'files': [{'file': fam + '.woff2', 'weight': weight, 'style': 'normal', 'source': f'{lic}/{folder}/{r["filename"]}'}]}
        print(fam, name, note, flush=True)
        json.dump(index, open(index_path, 'w'), indent=1)
    import zipfile
    for fam, (url, lic, files) in CTAN.items():
        if fam in index:
            continue
        z = zipfile.ZipFile(io.BytesIO(get(url)))
        out = []
        for member in z.namelist():
            base = member.rsplit('/', 1)[-1]
            if base in files:
                w, st = files[base]
                name = f'{fam}{"-Bold" if w == "700" else ""}{"-Italic" if st == "italic" else ""}.woff2'
                open(os.path.join(OUT, name), 'wb').write(woff2(z.read(member)))
                out.append({'file': name, 'weight': w, 'style': st, 'source': url + ' ' + member})
        fname = TTFont(io.BytesIO(z.read(next(m for m in z.namelist() if m.endswith(next(iter(files))))))) ['name'].getDebugName(1)
        index[fam] = {'family': fname, 'license': lic, 'files': out}
        lic_file = next((m for m in z.namelist() if re.search(r'(COPYING|OFL\.txt|LICENSE)', m)), None)
        if lic_file: open(os.path.join(OUT, f'LICENSE-{fam}.txt'), 'wb').write(z.read(lic_file))
        print(fam, fname, lic, [f['file'] for f in out], flush=True)
        json.dump(index, open(index_path, 'w'), indent=1)

if __name__ == '__main__':
    sys.exit(main())
