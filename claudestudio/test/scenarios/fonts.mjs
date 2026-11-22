// Every Enum.Font in its own family (runtime/gui.js FONT_MAP, assets/fonts/families.json): a
// TextLabel per font, and for each one
// - the label is drawn in the family Roblox's table names (or its listed open stand-in);
// - that face is really loaded and used: the same text measures differently from the Arimo
//   fallback (every family but Arimo's own fonts);
// - only the fonts on screen are fetched, not all of them.
// Golden: the type specimen (one line per Enum.Font).
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(5);
  const before = await t.eval(() => performance.getEntriesByType('resource').filter(r => /\/assets\/fonts\/.*\.woff2/.test(r.name)).length);
  await t.eval(() => window.studio.vm.run('fonts', `
    local gui = Instance.new("ScreenGui") gui.Name = "Specimen" gui.Parent = game.Players.LocalPlayer.PlayerGui
    local frame = Instance.new("Frame") frame.Size = UDim2.fromScale(1, 1) frame.BackgroundColor3 = Color3.new(1, 1, 1) frame.Parent = gui
    local items, i = Enum.Font:GetEnumItems(), 0
    table.sort(items, function(a, b) return a.Name < b.Name end)
    for _, f in ipairs(items) do
      if f.Name ~= "Unknown" then
        local l = Instance.new("TextLabel") l.Name = f.Name l.Font = f l.Text = f.Name .. " Quick fox 123" l.TextSize = 15
        l.Size = UDim2.new(1 / 3, -6, 0, 26) l.Position = UDim2.new((i % 3) / 3, 6, 0, 4 + math.floor(i / 3) * 27) i += 1
        l.TextXAlignment = Enum.TextXAlignment.Left l.BackgroundTransparency = 1 l.TextColor3 = Color3.new(0, 0, 0) l.Parent = frame
      end
    end
    print("specimen ready", #frame:GetChildren())`));
  await t.sim(3); await t.eval(() => window.studio.gui.fontsReady()); await t.sim(3); await t.frames(3);
  const res = await t.eval(() => {
    const out = [], ctx = document.createElement('canvas').getContext('2d');
    const width = (fam, w, st, text) => { ctx.font = `${st || 'normal'} ${w} 40px ${fam}`; return ctx.measureText(text).width; };
    for (const [inst, e] of window.studio.gui.els) {
      if (inst.ClassName !== 'TextLabel' || !String(inst.props.Text).includes('Quick fox')) continue;
      const name = inst.props.Name, el = e.text || e.el, cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      const loaded = document.fonts.check(`${cs.fontStyle} ${cs.fontWeight} 40px '${fam}'`);
      const own = width(`'${fam}'`, cs.fontWeight, cs.fontStyle, 'Quick fox 123 Hamburgefonstiv'), arimo = width("'Arimo'", cs.fontWeight, cs.fontStyle, 'Quick fox 123 Hamburgefonstiv');
      out.push({ name, fam, loaded, differs: Math.abs(own - arimo) > 0.5 });
    }
    return out;
  });
  const EXPECT = { // Roblox's table (creator-docs, the Font datatype), or the open stand-in families.json names
    Legacy: 'Arimo', Arial: 'Arimo', ArialBold: 'Arimo', Arimo: 'Arimo', ArimoBold: 'Arimo', SourceSans: 'Source Sans 3', Gotham: 'Montserrat', GothamBlack: 'Montserrat',
    AmaticSC: 'Amatic SC', Antique: 'Cinzel', Arcade: 'Press Start 2P', Bangers: 'Bangers', Bodoni: 'Accanthis ADF Std No3', Cartoon: 'Comic Neue Angular', Code: 'Inconsolata',
    Creepster: 'Creepster', DenkOne: 'Denk One', Fantasy: 'Balthazar', Fondamento: 'Fondamento', FredokaOne: 'Fredoka', Garamond: 'EB Garamond', GrenzeGotisch: 'Grenze Gotisch',
    Highway: 'Overpass', IndieFlower: 'Indie Flower', JosefinSans: 'Josefin Sans', Jura: 'Jura', Kalam: 'Kalam', LuckiestGuy: 'Luckiest Guy', Merriweather: 'Merriweather',
    Michroma: 'Michroma', Nunito: 'Nunito', Oswald: 'Oswald', PatrickHand: 'Patrick Hand', PermanentMarker: 'Permanent Marker', Roboto: 'Roboto', RobotoCondensed: 'Roboto Condensed',
    RobotoMono: 'Roboto Mono', Sarpanch: 'Sarpanch', SciFi: 'Orbitron', SpecialElite: 'Special Elite', TitilliumWeb: 'Titillium Web', Ubuntu: 'Ubuntu', BuilderSans: 'Nunito',
  };
  check(res.length >= 50, `a label for every Enum.Font (${res.length})`);
  const wrong = Object.entries(EXPECT).filter(([n, fam]) => { const r = res.find(x => x.name === n); return !r || r.fam !== fam; });
  check(!wrong.length, `each Enum.Font is drawn in its family (${Object.keys(EXPECT).length} checked)${wrong.length ? ': wrong ' + wrong.map(([n, f]) => `${n} (${(res.find(x => x.name === n) || {}).fam} for ${f})`).join(', ') : ''}`);
  const notLoaded = res.filter(r => !r.loaded).map(r => r.name);
  check(!notLoaded.length, `every face on screen is loaded${notLoaded.length ? ': not ' + notLoaded.join(', ') : ''}`);
  const fallback = res.filter(r => r.fam !== 'Arimo' && !r.differs).map(r => r.name);
  check(!fallback.length, `each non-Arimo family measures unlike Arimo, so its own face is in use${fallback.length ? ': not ' + fallback.join(', ') : ''}`);
  check(before <= 6, `before any of them is on screen, only the CoreGui's fonts were fetched (${before} files of 58)`);
  await t.golden('fonts', { text: true });
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('fonts: all checks passed');
}
