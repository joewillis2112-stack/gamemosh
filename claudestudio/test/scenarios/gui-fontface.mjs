// Fonts as Roblox now has them (creator-docs datatypes/Font.yaml, classes/TextLabel.yaml FontFace,
// enums/Font.yaml), through the VM and on screen:
// - the Font datatype: Font.new / fromEnum / fromName / fromId; Family, Weight, Style and Bold read and
//   written (Weight sets Bold, Bold sets Weight); Font.fromEnum(Enum.Font.Unknown) errors; FontWeight
//   and FontStyle enums; Enum.Font.Unknown is 100;
// - FontFace on TextLabel, TextButton and TextBox kept in step with Font both ways, each firing its
//   Changed; a FontFace with no Enum.Font reads Font Unknown;
// - each label is drawn in the family, weight and style its FontFace names (Roblox's family ids mapped
//   to the bundled families: HighwayGothic to its Overpass stand-in; an unknown id falls back to Arimo),
//   and the face really is the bundled one (it measures unlike Arimo).
// Golden: the specimen.
import { helpers } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, luau, logs } = helpers(t);
  await t.sim(5);
  await luau(`
    local f = Font.new("rbxasset://fonts/families/Oswald.json", Enum.FontWeight.Bold, Enum.FontStyle.Italic)
    print("dt", typeof(f), f.Family, f.Weight.Name, f.Style.Name, f.Bold)
    f.Bold = false print("bold-off", f.Weight.Name) f.Weight = Enum.FontWeight.SemiBold print("semibold", f.Bold)
    local e = Font.fromEnum(Enum.Font.SourceSansSemibold) print("fromEnum", e.Family, e.Weight.Name)
    print("unknown", (pcall(Font.fromEnum, Enum.Font.Unknown)), Enum.Font.Unknown.Value)
    print("fromName", Font.fromName("Bangers").Family, (pcall(Font.fromName, "no spaces")))
    print("fromId", Font.fromId(42).Family)
    print("enums", #Enum.FontWeight:GetEnumItems(), Enum.FontWeight.Heavy.Value, Enum.FontStyle.Italic.Value)
    local gui = Instance.new("ScreenGui") gui.Name = "Faces" gui.Parent = game.Players.LocalPlayer.PlayerGui
    local frame = Instance.new("Frame") frame.Size = UDim2.fromScale(1, 1) frame.BackgroundColor3 = Color3.new(1, 1, 1) frame.Parent = gui
    local list = Instance.new("UIListLayout", frame) list.Padding = UDim.new(0, 4) list.SortOrder = Enum.SortOrder.LayoutOrder
    local changes = {}
    local function label(class, name, order)
      local l = Instance.new(class) l.Name = name l.LayoutOrder = order l.Size = UDim2.new(1, -20, 0, 34) l.TextSize = 26
      l.BackgroundTransparency = 1 l.TextXAlignment = Enum.TextXAlignment.Left l.TextColor3 = Color3.new(0, 0, 0) l.Text = name .. " Quick fox 123"
      if class == "TextBox" then l.ClearTextOnFocus = false end
      l:GetPropertyChangedSignal("Font"):Connect(function() changes[name] = (changes[name] or "") .. "F" end)
      l:GetPropertyChangedSignal("FontFace"):Connect(function() changes[name] = (changes[name] or "") .. "f" end)
      l.Parent = frame
      return l
    end
    local a = label("TextLabel", "OswaldBold", 1) a.FontFace = Font.fromName("Oswald", Enum.FontWeight.Bold)
    local b = label("TextButton", "Highway", 2) b.FontFace = Font.new("rbxasset://fonts/families/HighwayGothic.json")
    local c = label("TextBox", "SourceItalic", 3) c.Font = Enum.Font.SourceSansItalic
    local d = label("TextLabel", "MontserratHeavy", 4) d.FontFace = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Heavy)
    local u = label("TextLabel", "NoSuchFamily", 5) u.FontFace = Font.fromId(123456)
    task.wait()
    print("sync", a.Font.Name, b.Font.Name, c.FontFace.Family, c.FontFace.Style.Name, d.Font.Name, u.Font.Name)
    print("changes", changes.OswaldBold, changes.Highway, changes.SourceItalic)
  `, 3);
  const L = logs(), line = p => L.find(l => l.startsWith(p + ' ')) || '';
  check(line('dt') === 'dt Font rbxasset://fonts/families/Oswald.json Bold Italic true', `Font.new with weight and style; Bold follows the weight (${line('dt')})`);
  check(line('bold-off') === 'bold-off Regular' && line('semibold') === 'semibold true', 'setting Bold sets Weight; a SemiBold weight is Bold');
  check(line('fromEnum') === 'fromEnum rbxasset://fonts/families/SourceSansPro.json SemiBold', `Font.fromEnum: Roblox's family for the item, with its weight (${line('fromEnum')})`);
  check(line('unknown') === 'unknown false 100', 'Font.fromEnum(Enum.Font.Unknown) errors; Enum.Font.Unknown is 100');
  check(line('fromName') === 'fromName rbxasset://fonts/families/Bangers.json false' && line('fromId') === 'fromId rbxassetid://42', 'Font.fromName makes the content folder\'s id (and refuses spaces); Font.fromId an asset id');
  check(line('enums') === 'enums 9 900 1', `Enum.FontWeight (9 items, Heavy 900) and Enum.FontStyle (${line('enums')})`);
  check(line('sync') === 'sync Unknown Highway rbxasset://fonts/families/SourceSansPro.json Italic GothamBlack Unknown',
    `Font and FontFace follow each other: Oswald Bold has no Enum.Font (Unknown), HighwayGothic is Highway, SourceSansItalic is Source Sans Pro italic, Montserrat Heavy is GothamBlack (${line('sync')})`);
  const ch = line('changes').split(' ').slice(1);
  check(ch.length === 3 && ch.every(x => [...x].sort().join('') === 'Ff'), `setting either fires both Changed signals once (${line('changes')}; the order is ours: FontFace, then Font)`);

  await t.eval(() => window.studio.gui.fontsReady()); await t.sim(2); await t.frames(2);
  const res = await t.eval(() => {
    const out = {}, ctx = document.createElement('canvas').getContext('2d');
    const width = (fam, w, st) => { ctx.font = `${st} ${w} 40px ${fam}`; return ctx.measureText('Quick fox 123 Hamburgefonstiv').width; };
    for (const [inst, e] of window.studio.gui.els) {
      if (!e.span || !String(inst.props.Text).includes('Quick fox')) continue;
      const cs = getComputedStyle(e.el), fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      out[inst.props.Name] = { fam, weight: cs.fontWeight, style: cs.fontStyle, loaded: document.fonts.check(`${cs.fontStyle} ${cs.fontWeight} 40px '${fam}'`), differs: Math.abs(width(`'${fam}'`, cs.fontWeight, cs.fontStyle) - width("'Arimo'", cs.fontWeight, cs.fontStyle)) > 0.5 };
    }
    return out;
  });
  console.log(JSON.stringify(res));
  const is = (n, fam, w, st) => res[n] && res[n].fam === fam && res[n].weight === String(w) && res[n].style === st;
  check(is('OswaldBold', 'Oswald', 700, 'normal') && is('Highway', 'Overpass', 400, 'normal') && is('SourceItalic', 'Source Sans 3', 400, 'italic') && is('MontserratHeavy', 'Montserrat', 900, 'normal') && is('NoSuchFamily', 'Arimo', 400, 'normal'),
    'each is drawn in its FontFace\'s family (or its stand-in), weight and style; an unknown family falls back to Arimo');
  check(['OswaldBold', 'Highway', 'SourceItalic', 'MontserratHeavy'].every(n => res[n] && res[n].loaded && res[n].differs), 'and those faces are loaded and in use (each measures unlike Arimo)');
  await t.golden('gui-fontface', { text: true });
  done();
}
