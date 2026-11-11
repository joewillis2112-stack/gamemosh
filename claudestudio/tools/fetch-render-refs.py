#!/usr/bin/env python3
"""Fetch the rendering reference set (claudestudio/reference/rendering/): screenshots from each
game's own store media (Steam's store API, Roblox's game thumbnails), resized to 960 px wide JPEG,
with manifest.json recording every image's source and note. The set was curated by eye (in-game shots
kept; Roblox promo art marked): for a game already in the manifest this re-downloads exactly its kept
images; for a new one it fetches candidates to pick from. Run: python3 -I tools/fetch-render-refs.py [slugs]"""
import io, json, os, re, sys, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'reference', 'rendering')
PER_GAME = 3
# (group, platform, id, name): Steam app ids; Roblox place ids.
GAMES = [
  ('aaa', 'steam', 1091500, 'Cyberpunk 2077'), ('aaa', 'steam', 1174180, 'Red Dead Redemption 2'),
  ('aaa', 'steam', 3017860, 'DOOM: The Dark Ages'), ('aaa', 'steam', 3159330, "Assassin's Creed Shadows"),
  ('aaa', 'steam', 2358720, 'Black Myth: Wukong'), ('aaa', 'steam', 2461850, "Senua's Saga: Hellblade II"),
  ('aaa', 'steam', 1551360, 'Forza Horizon 5'), ('aaa', 'steam', 2101960, 'Cronos: The New Dawn'),
  ('stylized', 'steam', 1817230, 'Hi-Fi RUSH'), ('stylized', 'steam', 757310, 'Sable'),
  ('stylized', 'steam', 587620, 'Okami HD'), ('stylized', 'steam', 1384160, 'Guilty Gear -Strive-'),
  ('stylized', 'steam', 397540, 'Borderlands 3'), ('stylized', 'steam', 1426210, 'It Takes Two'),
  ('stylized', 'steam', 1057090, 'Ori and the Will of the Wisps'),
  ('steam-mid', 'steam', 892970, 'Valheim'), ('steam-mid', 'steam', 1966720, 'Lethal Company'),
  ('steam-mid', 'steam', 548430, 'Deep Rock Galactic'), ('steam-mid', 'steam', 264710, 'Subnautica'),
  ('steam-mid', 'steam', 1055540, 'A Short Hike'), ('steam-mid', 'steam', 383870, 'Firewatch'),
  ('steam-mid', 'steam', 1657630, 'Slime Rancher 2'), ('steam-mid', 'steam', 3241660, 'R.E.P.O.'),
  ('steam-mid', 'steam', 3527290, 'PEAK'), ('steam-mid', 'steam', 648800, 'Raft'),
  ('roblox', 'roblox', 5938036553, 'Frontlines'), ('roblox', 'roblox', 292439477, 'Phantom Forces'),
  ('roblox', 'roblox', 891852901, 'Greenville RP'), ('roblox', 'roblox', 3351674303, 'Driving Empire'),
  ('roblox', 'roblox', 2317712696, 'The Wild West'), ('roblox', 'roblox', 6737970321, 'Livetopia'),
  ('roblox', 'roblox', 2727067538, 'World // Zero'), ('roblox', 'roblox', 920587237, 'Adopt Me!'),
  ('roblox', 'roblox', 189707, 'Natural Disaster Survival'), ('roblox', 'roblox', 1962086868, 'Tower of Hell'),
  ('roblox', 'roblox', 4924922222, 'Brookhaven RP'), ('roblox', 'roblox', 6516141723, 'DOORS'),
  ('roblox', 'roblox', 2753915549, 'Blox Fruits'), ('roblox', 'roblox', 606849621, 'Jailbreak'),
  ('roblox', 'roblox', 126884695634066, 'Grow a Garden'), ('roblox', 'roblox', 15101393044, 'Dress to Impress'),
]

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'claudestudio-reference-fetch'})
    with urllib.request.urlopen(req, timeout=40) as r: return r.read()

def images_for(platform, gid):
    if platform == 'steam':
        d = json.loads(get(f'https://store.steampowered.com/api/appdetails?appids={gid}&filters=basic,screenshots'))[str(gid)]
        if not d.get('success'): return None, []
        return d['data'].get('name'), [s['path_full'] for s in d['data'].get('screenshots', [])]
    u = json.loads(get(f'https://apis.roblox.com/universes/v1/places/{gid}/universe'))['universeId']
    name = json.loads(get(f'https://games.roblox.com/v1/games?universeIds={u}'))['data'][0]['name']
    t = json.loads(get(f'https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds={u}&size=768x432&format=Png&countPerUniverse=10'))
    return name, [x['imageUrl'] for x in t['data'][0]['thumbnails'] if x.get('state') == 'Completed']

def main():
    only = set(sys.argv[1:])
    path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    for group, platform, gid, name in GAMES:
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        if only and slug not in only: continue
        if slug in manifest:  # curated: fetch exactly what was kept
            for f in manifest[slug]['images']:
                img = Image.open(io.BytesIO(get(f['source']))).convert('RGB')
                img = img.resize((960, round(img.height * 960 / img.width)), Image.LANCZOS) if img.width > 960 else img
                os.makedirs(os.path.join(OUT, group), exist_ok=True); img.save(os.path.join(OUT, f['file']), quality=82, optimize=True)
            print('ok  ', group, manifest[slug]['name'], len(manifest[slug]['images']), '(kept set)'); continue
        try: real, urls = images_for(platform, gid)
        except Exception as e: print('FAIL', name, e); continue
        if not urls: print('FAIL', name, 'no images'); continue
        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        # Steam: spread across the store's set (its first shots are often logos/key art); Roblox: all, picked later.
        picks = urls if platform == 'roblox' else [urls[min(len(urls) - 1, i * max(1, len(urls) // PER_GAME))] for i in range(PER_GAME)]
        files = []
        for i, u in enumerate(dict.fromkeys(picks)):
            img = Image.open(io.BytesIO(get(u))).convert('RGB')
            img = img.resize((960, round(img.height * 960 / img.width)), Image.LANCZOS) if img.width > 960 else img
            f = f'{group}/{slug}-{i + 1}.jpg'; img.save(os.path.join(OUT, f), quality=82, optimize=True)
            files.append({'file': f, 'source': u})
        manifest[slug] = {'name': real or name, 'group': group, 'platform': platform, 'id': gid, 'images': files}
        print('ok  ', group, real or name, len(files))
    json.dump(manifest, open(path, 'w'), indent=1)

main()
