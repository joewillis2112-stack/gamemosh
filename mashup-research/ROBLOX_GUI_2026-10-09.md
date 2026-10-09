# Roblox GUI system: verified facts for the Claude Studio rebuild (2026-10-09)

_Gathered by a research agent; defaults are from rbx-dom's reflection database and the API dump (the docs YAML lists none). Treat as baseline, not as limits (claudestudio/PLAN.md, "What it is")._

Sources used (all fetched 2026-10-09):
- **CD** = Roblox/creator-docs `main`, i.e. `https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/...` (local partial clone at commit 9dc22ac, 2026-10-08).
- **DUMP** = `Full-API-Dump.json` from MaximumADHD/Roblox-Client-Tracker v0.742.0.7421053 (2026-10-07). Its `Default` field is the engine default, but only for a creatable class's *own* members. Inherited members say `__api_dump_class_not_creatable__`.
- **RBXDOM** = `https://raw.githubusercontent.com/rojo-rbx/rbx-dom/master/rbx_dom_lua/src/database.json`, Roblox v0.741.19, `DefaultProperties` per class including inherited ones. How it is made (rbx_reflector README): Studio opens "a place file with one copy of every instance in it. It has no properties defined", then saves it, so these are the engine's built-in defaults, i.e. what `Instance.new` gives. Not the values Studio's Insert Object applies.
- **RCT** = Roblox-Client-Tracker `scripts/CoreScripts/...`, Roblox's own shipped CoreScripts (git `https://github.com/MaximumADHD/Roblox-Client-Tracker`, branch `roblox`).
- **DF** = DevForum announcement JSON (`https://devforum.roblox.com/t/<id>.json`). Both threads are in category 36, the announcements category. The JSON doesn't flag authors as staff.

Enum ints below are RBXDOM's.

---

## 1. UDim / UDim2

- VERIFIED: `UDim.new(Scale, Offset)`, both default to 0. "The offset is stored as an integer." Fields `.Scale` and `.Offset` are read-only. `+` and `-` work component-wise: "`UDim.new(a.Scale + b.Scale, a.Offset + b.Offset)`". UDim has **no** methods (`methods: []`), so no Lerp. Source: CD `reference/engine/datatypes/UDim.yaml`.
- VERIFIED: resolution: "the engine computes the final pixel value as `Scale * referenceMeasurement + Offset`, where the reference measurement is typically the size of a parent GuiObject along the corresponding axis." Source: CD UDim.yaml.
- VERIFIED (CD `datatypes/UDim2.yaml`):
  - `UDim2.new()` gives all zeros.
  - `UDim2.new(xScale, xOffset, yScale, yOffset)`: "All parameters default to `0`."
  - `UDim2.new(x: UDim, y: UDim)`.
  - `UDim2.fromScale(xs, ys) == UDim2.new(xs,0,ys,0)` and `UDim2.fromOffset(xo, yo) == UDim2.new(0,xo,0,yo)` (doc prints `--> true`).
  - Fields `X`/`Y` (UDim). `Width` is "A synonym for `UDim2.X`", `Height` for `Y`.
  - `+` and `-` work per axis and per component, e.g. "`UDim2.new(1, 100, 1, 50) - UDim2.new(0.5, 30, 0, 10)` = `UDim2.new(0.5, 70, 1, 40)`".
  - `UDim2:Lerp(goal, alpha)`: "each axis is independently interpolated".
- VERIFIED tostring(UDim2): the doc example says `print(guiObject.Size) --> {0, 300}, {1, 0}`. Format: `{xs, xo}, {ys, yo}`. Source: CD UDim2.yaml.
- UNSURE tostring(UDim): probably `0, 8`, which is the DUMP's string form for UDim defaults (`CornerRadius = '0, 8'`). That is the reflection serializer, not confirmed to be `tostring`.
- UNSURE: unary minus, `*` and `/` on UDim2 aren't listed in `math_operations`, so treat them as unsupported. I don't know the rounding rule for a fractional Offset passed to the constructor.

## 2. GuiObject defaults from Instance.new (RBXDOM, cross-checked with DUMP where DUMP has them)

Common to Frame, TextLabel, TextButton and ImageLabel. VERIFIED (RBXDOM):

| Prop | Default |
|---|---|
| Size | `{0,0},{0,0}` (zero size: an Instance.new Frame is invisible until sized) |
| Position | `{0,0},{0,0}` |
| AnchorPoint | (0,0) |
| BackgroundColor3 | 0.6392157, 0.63529414, 0.64705884 = RGB(163,162,165) |
| BackgroundTransparency | 0 |
| BorderSizePixel | 1 |
| BorderColor3 | 0.105882, 0.164706, 0.207843 = RGB(27,42,53) |
| BorderMode | Outline (0) |
| Visible | true |
| ZIndex | 1 |
| Rotation | 0 |
| LayoutOrder | 0 |
| ClipsDescendants | false |
| AutomaticSize | None |
| SizeConstraint | RelativeXY (0) |
| Interactable | true |
| Active | **false** on Frame, TextLabel and ImageLabel; **true** on TextButton, ImageButton and TextBox |
| Selectable | false on labels and Frame; true on buttons and TextBox |

TextLabel and TextButton. VERIFIED (DUMP, which is the class's own member defaults, plus RBXDOM; they agree):

| Prop | TextLabel | TextButton |
|---|---|---|
| Text | "Label" | "Button" |
| TextColor3 | RGB(27,42,53) (0.105882, 0.164706, 0.207843) | same |
| TextSize | **8** | 8 |
| Font | `Enum.Font.Legacy` | same |
| FontFace | family `rbxasset://fonts/families/LegacyArial.json`, Regular, Normal; RBXDOM `cachedFaceId` = `rbxasset://fonts/Arimo-Regular.ttf` | same |
| TextScaled / TextWrapped | false / false | same |
| TextXAlignment / TextYAlignment | Center / Center | same |
| TextTransparency | 0 | same |
| TextStrokeTransparency | 1 | same |
| TextStrokeColor3 | 0,0,0 | same |
| RichText | false | same |
| LineHeight | 1 | same |
| TextTruncate | None | same |
| MaxVisibleGraphemes | -1 | same |
| AutoButtonColor | n/a | true |
| Modal / Selected / Style | n/a | false / false / Default(0) |

ImageLabel. VERIFIED (DUMP):

| Prop | Default |
|---|---|
| Image | "" |
| ImageColor3 | 1,1,1 |
| ImageTransparency | 0 |
| ScaleType | Stretch |
| ResampleMode | Default |
| SliceScale | 1 |
| TileSize | `{1,0},{1,0}` |
| ImageRectOffset / ImageRectSize | 0,0 / 0,0 |
| SliceCenter | 0,0,0,0 |

Frame: `Style = Custom`.

- VERIFIED: "the `Enum.Font.Legacy` font does not hold this property" (TextSize), and "With the exception of the `Enum.Font.Legacy` font, each font will render text with the line height equal to the TextSize". Source: CD `classes/TextLabel.yaml`. **UNSURE** what pixel size Legacy actually renders at when TextSize = 8. Needs a Studio screenshot.
- UNSURE, important: Studio's *Insert Object* (Explorer ⊕) gives different values from Instance.new (white background, BorderSizePixel 0, a 100×100 or 200×50 size, TextSize 14 and so on, from memory). I found no doc stating those values. Scripts use Instance.new, so the table above is what Luau HUD scripts get. Studio-authored `.rbxl` UIs carry explicit values anyway.

## 3. ScreenGui, layout resolution, inset

ScreenGui defaults (RBXDOM; DUMP agrees for the own members):

| Prop | Default | Status |
|---|---|---|
| Enabled | true | VERIFIED |
| ResetOnSpawn | true | VERIFIED; also CD LayerCollector "When set to `true` (default)" |
| IgnoreGuiInset | false | VERIFIED; CD "If this property is `false` (default)" |
| DisplayOrder | 0 | VERIFIED |
| ClipToDeviceSafeArea | true | VERIFIED |
| ScreenInsets | CoreUISafeInsets (2) | VERIFIED |
| SafeAreaCompatibility | FullscreenExtension (1) | VERIFIED; CD "The default value is `FullscreenExtension`" |
| ZIndexBehavior | **Global (0)** per RBXDOM engine default | **CONFLICT** |

- ZIndexBehavior conflict: CD `LayerCollector.yaml` says "With `Enum.ZIndexBehavior.Sibling` (default)". My guess is that Studio's insert sets Sibling while Instance.new gives Global. UNSURE; check in Studio with `print(Instance.new("ScreenGui").ZIndexBehavior)`.
- VERIFIED semantics (CD LayerCollector.yaml):
  - Sibling: "children always render above their parents, and the ZIndex is used to decide the order in which children of a single UI object will render over each other."
  - Global: "sorts all descendants according to the ZIndex, then breaks ties using the hierarchy order."
- VERIFIED: DisplayOrder: "Those with a higher DisplayOrder will be drawn on top." Source: CD ScreenGui.yaml.
- VERIFIED: IgnoreGuiInset: if it is changed to true while ScreenInsets = CoreUISafeInsets, "ScreenInsets will be set to DeviceSafeInsets". Source: CD ScreenGui.yaml.
- VERIFIED: Enabled = false means "the UI contents will not render, process user input, or update in response to changes." Source: CD LayerCollector.yaml.
- VERIFIED: Position: "The scalar position is relative to the size of the parent GUI element… Position is centered around the object's AnchorPoint". Size scale is likewise relative to the parent. The actual pixels are in AbsolutePosition and AbsoluteSize. Source: CD GuiObject.yaml.
- VERIFIED: AnchorPoint: "a fraction from 0 to 1, relative to the size of the object… (0.5,0.5) places the anchor point halfway… changes to its position or size both move and scale outward from this point". The default is (0,0), top-left. Source: CD `ui/position-and-size.md`.
- Implied formula (my derivation from the above, not quoted): `absSize = parentAbsSize*Size.Scale + Size.Offset`; `absPos = parentAbsPos + parentAbsSize*Pos.Scale + Pos.Offset - AnchorPoint*absSize`.
- VERIFIED: Rotation is "relative to the **center** of the object, **not** the AnchorPoint". Source: CD GuiObject.yaml.
- VERIFIED: AbsolutePosition "always represents the top-left corner". In a ScreenGui it "uses the CoreUISafeInsets viewport coordinate system. The origin… is located at the bottom-left corner of the Roblox top bar… same coordinate system used by InputObject.Position." So with IgnoreGuiInset = true, AbsolutePosition.Y of a top-0 object is negative (−inset). The negative value is my inference. Source: CD GuiBase2d.yaml.
- VERIFIED: GUI inset is 58 px with the current top bar ("experience controls"), 36 px on the legacy bar.
  - DF 2567355 ("Studio Beta for Experience Controls", Aug 2023 to Feb 2024): "The updated experience controls are increasing the Roblox reserved space from a height of 36 pixels to 58 pixels. Please note that the Roblox reserve space may vary based on device and screen size." https://devforum.roblox.com/t/2567355
  - RCT `scripts/CoreScripts/Modules/TopBar/Constants.lua` (v0.742): `DEFAULT_CHROME_TOPBAR_HEIGHT = if ChromeEnabled() then withUIScale(58) else 58`, and the legacy `DEFAULT_TOPBAR_HEIGHT = … else 36`. `withUIScale` is ×1.5 on TenFoot (console).
  - RCT `TopBar/init.lua`: `GuiService:SetGlobalGuiInset(left, Constants.ApplyDisplayScale(Constants.TopBarHeight), right, bottom)`, where ApplyDisplayScale = `getUIScale() * value`. The legacy path is `SetGlobalGuiInset(0, Constants.TopBarHeight, 0, 0)`.
  - So: desktop and phone = 58 × UI scale (UI scale is normally 1; the exact value per device is UNSURE). `GuiService:GetGuiInset()` returns it (CD GuiService.yaml).
- VERIFIED: the ScreenInsets enum (CD `enums/ScreenInsets.yaml`): None=0, DeviceSafeInsets=1, CoreUISafeInsets=2 ("unobscured by both device screen cutouts and Roblox core UI elements like the top bar buttons"), TopbarSafeInsets=3 (the dynamic area inside the top bar beside Roblox's controls; see GuiService.TopbarInset).

## 4. StarterGui → PlayerGui

- VERIFIED (CD `classes/StarterGui.yaml`): "When a Player.Character spawns, the contents of their PlayerGui (if any) are emptied. Children of the StarterGui are then copied along with their descendants into the PlayerGui. … ResetOnSpawn … `false` will only be placed into each player's PlayerGui once and will not be deleted when the Player respawns."
- VERIFIED (CD LayerCollector.yaml): ResetOnSpawn = false applies only to a **direct** child of StarterGui. An indirect descendant (for example inside a Folder) resets anyway.
- VERIFIED (CD `classes/PlayerGui.yaml`):
  - "When a player first joins the experience, their PlayerGui is automatically inserted into their Player object. When the player's Character spawns for the first time, all of the contents of StarterGui are automatically copied."
  - "Any LocalScript will also run if it is inserted into a PlayerGui."
  - If `Players.CharacterAutoLoads` is false, nothing is copied until `LoadCharacterAsync`.
- VERIFIED access pattern (CD `ui/on-screen-containers.md`): `Players.LocalPlayer.PlayerGui` and `playerGui:WaitForChild("TitleScreen")`.
- VERIFIED: a ScreenGui "only shows if parented to a player's PlayerGui". Source: CD ScreenGui.yaml.
- VERIFIED: Roblox's touch controls live in PlayerGui. The guide finds them with `playerGui:FindFirstChild("JumpButton", true)`. Source: CD position-and-size.md.

## 5. UI modifiers (engine defaults: RBXDOM and DUMP agree)

- UICorner: CornerRadius **`0, 8`** (UDim offset 8 px). Since 2025-26 there are also per-corner TopLeft/TopRight/BottomRight/BottomLeftRadius, all `0, 8`. "Writing to this property sets [all four]… Reading this property returns TopLeftRadius." VERIFIED, source CD `classes/UICorner.yaml`. Scale is relative to what is UNSURE (not checked).
- UIStroke: Thickness 1, Color 0,0,0, Transparency 0, ApplyStrokeMode Contextual, Enabled true. Newer properties: LineJoinMode Round, StrokeSizingMode FixedSize, BorderStrokePosition Outer, BorderOffset `0,0`, ZIndex 1. VERIFIED.
  - Contextual means that on a text object it outlines the glyphs, and Border makes it outline the box. Two UIStrokes can do both. Source: CD `ui/appearance-modifiers.md`.
  - Thickness "measured in pixels (default) or scaled relative to the parent, depending on StrokeSizingMode".
- UIPadding: all four are `0, 0`. VERIFIED.
- UIListLayout: FillDirection **Vertical**, HorizontalAlignment **Left**, VerticalAlignment **Top**, SortOrder **Name**, Padding `0,0`, Wraps false, HorizontalFlex and VerticalFlex None, ItemLineAlignment Automatic. VERIFIED (RBXDOM).
  - SortOrder = Name is the engine default. Most scripts set LayoutOrder explicitly.
  - SortOrder semantics: LayoutOrder sorts ascending, and ties go to "whichever was added sooner". Name is "an alphanumeric sort". Source: CD UIGridStyleLayout.yaml.
  - Padding is a UDim: scale is a "percentage of the parent's size in the current direction".
- UIAspectRatioConstraint: AspectRatio 1, AspectType FitWithinMaxSize, DominantAxis Width. VERIFIED. "the constraint will **override** the layout and control the object's size". Source: CD.
- UITextSizeConstraint: MaxTextSize 100, MinTextSize 1. VERIFIED.
- UIGradient: Color white→white `ColorSequence`, Transparency 0→0, Rotation 0, Offset (0,0), Scale 1, Type Linear, TileMode Clamp, Enabled true. VERIFIED. Linear is the "default" in CD appearance-modifiers.md.

## 6. Text and fonts

- VERIFIED: the default for Instance.new TextLabel, TextButton and TextBox is still `Enum.Font.Legacy` with FontFace `LegacyArial.json`, not BuilderSans or SourceSans. Sources: DUMP v0.742 (`Font = 'Legacy'`) and RBXDOM. RBXDOM's cached face is `Arimo-Regular.ttf`, so Legacy now renders with Arimo glyphs.
- VERIFIED (DF 2868222, "Introducing Builder Font + Deprecating Gotham and Arial", Mar to May 2024): "Gotham & Arial will be removed from Roblox on May 28, 2024. … Gotham → Montserrat, Arial → Arimo". https://devforum.roblox.com/t/2868222
- VERIFIED: CD `enums/Font.yaml` says Gotham, GothamMedium, GothamBold and GothamBlack "has been removed. Using it will map to the `Montserrat` font family". Arial and ArialBold map to `Arimo`.
- VERIFIED `Font.fromEnum` mapping (CD `datatypes/Font.yaml`, table):

| Enum | Family JSON |
|---|---|
| Legacy | LegacyArial |
| SourceSans* (all weights) | SourceSansPro |
| Arcade | PressStart2P |
| FredokaOne | FredokaOne |
| Cartoon | ComicNeueAngular |
| Code | Inconsolata |
| SciFi | Zekton |
| Fantasy | Balthazar |
| Antique | RomanAntique |
| Bodoni | AccanthisADFStd |
| Garamond | Guru |
| Highway | HighwayGothic |
| BuilderSans* | BuilderSans |
| Arimo* | Arimo |
| LuckiestGuy, Bangers, Roboto, Nunito, Oswald, Merriweather, Michroma, Ubuntu, etc. | their own names |

- Licences (VERIFIED unless marked):
  - Source Sans: OFL 1.1 ("licensed under the SIL Open Font License, Version 1.1", https://raw.githubusercontent.com/adobe-fonts/source-sans/release/LICENSE.md).
  - Press Start 2P (= Arcade), Montserrat (= Gotham now), Arimo (= Arial and Legacy now), Bangers, Roboto, Nunito, Oswald, Merriweather, Titillium Web: `license: "OFL"` in google/fonts `ofl/<name>/METADATA.pb`.
  - Luckiest Guy and Permanent Marker: google/fonts `apache/` (Apache 2.0). Ubuntu: `ufl/` (Ubuntu Font Licence).
  - Fredoka One: UNSURE directly. google/fonts no longer has `ofl/fredokaone` (404); its successor `ofl/fredoka` is `license: "OFL"`.
  - Builder Sans: **not open**. CD `resources/builder-font-license.md`: "use the font solely for the purpose of creating… UGC… on the Roblox platform" and "not use or distribute the font for any other purpose". It can't be bundled in our engine; Nunito, Montserrat or Arimo would be the open stand-ins (my suggestion).
- UNSURE: which Enum.Font values are "commonly used" in 2025-26 games. I found no data; that list would be a guess.
- VERIFIED TextScaled (CD TextLabel.yaml): "When enabled, TextSize is ignored and TextWrapped is automatically enabled". It scales "up to the maximum font size (100) if there are no size constraints". Docs recommend AutomaticSize or UITextSizeConstraint instead.
- VERIFIED TextWrapped (CD TextLabel.yaml):
  - Breaks prefer whitespace, and a long word is split.
  - Lines that would exceed the height "will not be rendered at all".
- VERIFIED TextStrokeTransparency (CD TextLabel.yaml): the stroke is "multiple renderings… essentially multiplicative on itself four times over".
- VERIFIED TextSize "is in offsets, not points" and is the height of one line. Source: CD TextLabel.yaml.

## 7. leaderstats and the built-in PlayerList

- VERIFIED convention (CD `players/leaderboards.md`):
  - A Folder named exactly `leaderstats` (lowercase) is parented to the Player. "Roblox doesn't add the player to the leaderboard if you name it any other way."
  - The value object's Name "is exactly how the stat will appear on the leaderboard", so column header = Name.
- VERIFIED stat types (RCT `ServerCoreScripts/ServerLeaderstats.lua`): StringValue, IntValue, BoolValue, NumberValue, DoubleConstrainedValue and IntConstrainedValue.
- VERIFIED column order (CD leaderboards.md, and RCT `Modules/PlayerList/Reducers/GameStats.lua` `gameStatsComp`):
  1. Child `BoolValue IsPrimary = true` goes first. "IsPrimary takes precedence over any Priority values".
  2. Child `NumberValue Priority`: higher comes earlier, default 0.
  3. Otherwise insertion order (`addId`). The server tracks creation order in `RobloxReplicatedStorage.LeaderstatsOrder`.
- VERIFIED: rows are sorted by the first stat. RCT `Reducers/PlayerKeys.lua`: `primaryStat = store.gameStats[1].name` and key `{ name = player.DisplayName:upper(), stat = tonumber(stat) or stat }`.
  - The current comparator lives in the CorePackages PlayerList package, which the tracker doesn't include. Direction is UNSURE for the current build.
  - The 2018 Roblox/Core-Scripts `PlayerlistModule.lua` sorts **descending** by primary stat (`return statA > statB`), ties by uppercased name ascending, and players with no stat last. https://raw.githubusercontent.com/Roblox/Core-Scripts/master/CoreScriptsRoot/Modules/PlayerlistModule.lua
- VERIFIED max columns = 4 (1 on small screens). RCT `Modules/PlayerList/CreateLayoutValues.lua` at v0.719 (commit before ef54b101, May 2026) has `MaxLeaderstats = 4` and `MaxLeaderstatsSmallScreen = 1`; the 2018 module has `MAX_LEADERSTATS = 4`. Since about v0.720 the values live in the PlayerList package (not visible). Treat 4 as current but UNSURE.
- VERIFIED number formatting (RCT `PlayerList/FormatStatString.lua`):
  - nil shows `-`.
  - Numbers whose `tostring` is 7 or more characters are abbreviated (`NumberLocalization.abbreviate`, truncating, so 1.2M style).
  - Otherwise numbers are locale-formatted (thousands separators). Strings pass through.
- VERIFIED look, legacy (non-`FFlagUseNewPlayerList`) desktop path in the v0.719 CreateLayoutValues:
  - Placement: top-right; `ContainerPosition = UDim2.new(1,-4,0,4)`, `AnchorPoint (1,0)`, `ContainerSize (0,0,0.5,0)` (half the screen height). It sits below the top bar: `TopBarOffset = TopBarHeight` (58 with Chrome, else 36).
  - Rows: `PlayerEntrySizeY = 40`; `EntryBaseSizeX = 150` plus `EntrySizeIncreasePerStat = 11`; `StatEntrySizeX = 66` per stat column; `TitleBarSizeY = 20`.
  - Text: `PlayerNameTextSize = 14`, `StatTextSize = 14`, both `Enum.Font.SourceSans`; titles and the team stat use SourceSansBold. Mobile text size is 16.
  - Background: `OverrideBackgroundTransparency = 0.3`, `TeamEntryBackgroundTransparency = 0.5`. The panel title uses `rbxasset://textures/ui/TopRoundedRect8px.png`, so the top corners are rounded at 8 px.
- VERIFIED panel colour (RCT `PresentationCommon/PlayerListDisplayView.lua` plus UIBlox `DarkTheme.lua` and `Colors.lua`):
  - With the Chrome top bar the panel is `Theme.BackgroundUIContrast` = Black, and the transparency in use is `OverrideBackgroundTransparency × PreferredTransparency`, so ≈0.3 by default.
  - Without Chrome it is `BackgroundContrast` = Carbon RGB(25,27,29).
  - Player name colour is `TextDefault` = Pumice RGB(189,190,190), or `TextEmphasis` = white for emphasis (probably the local player; not checked).
  - Header text is `TextMuted` = white at 0.3 transparency.
  - Hover is `BackgroundOnHover` = white at 0.9 transparency.
- UNSURE: the 2025-26 "new PlayerList" (`FFlagUseNewPlayerList`) visuals, and the Here/Friends/Global tabs from CD leaderboards.md (beta). Its layout code isn't in the tracker.
- VERIFIED hide: `StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)`. Source: CD leaderboards.md.

### 7b. Read from the legacy PlayerList source (later the same day)

Source: Roblox-Client-Tracker at the commit before `ef54b101` (v0.719), `scripts/CoreScripts/Modules/PlayerList/` (the desktop path without `FFlagUseNewPlayerList`). Fetched with a blobless `git clone --filter=blob:none` and `git show <commit>:<path>`.

- VERIFIED sort direction for v0.719 (`PlayerSorting.lua` `keyCmp`): equal stats compare by name ascending; a nil stat goes last; mixed types compare as strings; otherwise `statL > statR` (**descending**). This settles item 4 of the open list for that version.
- VERIFIED panel structure (`PlayerListDisplayView.lua`, desktop branch): a 4 px top cap (`TopRoundedRect8px.png`, slice at `SliceScale = 0.5`, so the corners are about **4 px**, not 8), a 20 px title bar (only when there is at least one stat), the rows, then a 4 px bottom cap that is rounded the same way. The background is `BackgroundUIContrast` (black) with Chrome on, at `OverrideBackgroundTransparency (0.3) × PreferredTransparency`.
- VERIFIED width (`PlayerListApp.lua`): 66 per stat column, plus `ExtraContainerPadding` 16, plus the name column `150 + 11 × stats`. The name column shrinks when `screenX − (stats × 66 + 16 + 8 + 304)` is smaller than that; 304 is the dropdown's space. The y position is `4 + TopBarOffset`, which is 58 with Chrome.
- VERIFIED title bar (`TitleBarView.lua`): a "Players" label as wide as the name column, padded 15 px from the left; then one 66 px header per stat, centred and truncated. Text is `Font.Footer` (BuilderSansMedium at BaseSize × 10/16), in `TextMuted`. The contents sit 2 px up into the rounded cap.
- VERIFIED UIBlox fonts (`UIBlox/App/Style/Fonts/FontLoader.lua`, tokens `RbxDesignFoundations/tokens/Common/Builder/Dark/Global.lua`): `BaseSize = 16 × 1.26 = 20.16`; `Size_100/125/150/200 = 8/10/12/16`; Footer = CaptionSmall (BuilderSansMedium, 10/16, so 12.6 px); CaptionHeader = BuilderSansMedium 12/16 (15.12 px); CaptionBody = BuilderSans 12/16.
- VERIFIED row (`PlayerEntryView.lua`, `PlayerIcon.lua`, `PlayerNameTag.lua`, `StatEntry.lua`): rows are 40 px with no background of their own. The name frame is as wide as the name column: 12 px padding, a 16 px icon slot (shown only for friend, place-owner, premium and similar icons), 12 px, then the name.
  - The local player's name is CaptionHeader in `TextEmphasis` (white); other players' names are CaptionBody in `TextDefault` (Pumice).
  - Stat cells are 66 px, CaptionHeader, centred, padded 4 px from the left, in the row's text colour.
  - A 16 px blank cell ends the row. Hovering a row overlays `BackgroundOnHover`.
  - The name shown is the `DisplayName`.
- VERIFIED display defaults (`Reducers/DisplayOptions.lua`): the list is visible by default unless `FFlagPlayerListUseMobileOnSmallDisplay` is set (its value is unknown). Small touch devices cap the stats at 1 (`MaxLeaderstatsSmallScreen`) and use a separate scrolling layout, which we didn't port.
- VERIFIED Tab toggles it (`Components/Connection/ContextActionsBinder.lua`: `BindCoreAction(..., Enum.KeyCode.Tab)`).
- VERIFIED `Enum.CoreGuiType` from `API-Dump.txt`: PlayerList 0, Health 1, Backpack 2, Chat 3, All 4, EmotesMenu 5, SelfView 6, Captures 7, AvatarSwitcher 8. Also `StarterGui:SetCoreGuiEnabled(type, enabled)` and `GetCoreGuiEnabled(type)`.
- NOT FOUND: `NumberLocalization.abbreviate`. It lives in `CorePackages.Workspace.Packages.Localization`, which the tracker doesn't publish, and a web search found nothing. Its exact format is unknown.
- Tip: the tracker's `API-Dump.txt` holds every class, member and enum with its values. Prefer it to memory for enum numbers.

## 8. Buttons and input sinking

- VERIFIED `GuiButton.Activated(inputObject, clickCount)` (CD `classes/GuiButton.yaml`):
  - "Fires when a left click press-and-release is detected on desktop, touch release is detected on mobile, or A/cross is activated in UI navigation mode on console."
  - clickCount starts at 0 and increments on rapid repeats.
  - Client-only.
  - It fires only if `Active` is true: "this property determines whether Activated fires" (CD GuiObject.yaml).
- VERIFIED `MouseButton1Click`: the mouse must go down and up inside the bounds; "If the mouse leaves the bounds… and is released, the event will not fire." Source: CD GuiButton.yaml.
- VERIFIED AutoButtonColor (default true) "automatically change[s] color when the mouse hovers over or clicks on it". The exact tint values are UNSURE.
- VERIFIED sinking: `GuiObject.InputSink` (CD GuiObject.yaml) "defaults to `Enum.InputSink.None`, except on GuiButton objects… where it defaults to `Enum.InputSink.Activate`". Activate "sinks the mouse-button and touch press/release input used to activate it, but lets other input (such as mouse movement) pass through." Frames don't sink, so their Active is false by default.
- VERIFIED: `UserInputService.InputBegan`'s `gameProcessedEvent` is true when "a button was touched or clicked from this input". Source: CD UserInputService.yaml.
- VERIFIED: the camera ignores sunk input. RCT `PlayerScripts/StarterPlayerScripts/PlayerModule.module/CameraModule/CameraInput.lua`:
  - `touchBegan(input, sunk)`: `if not sunk then incPanInputCount() end`.
  - `inputBegan`: `MouseButton2 and not sunk then incPanInputCount()`.
  - So a touch or right-drag that starts on a button doesn't rotate the camera. The other copy, `StarterPlayer/PlayerModule`, uses the new InputAction system, where the sinking path is UNSURE.

## Open items to check in real Studio (can't do from here)

1. `Instance.new("ScreenGui").ZIndexBehavior`: Global or Sibling?
2. The Legacy font's rendered pixel size at TextSize 8.
3. AutoButtonColor hover and press tint amounts.
4. The current PlayerList sort direction and new-PlayerList visuals: screenshot one.
5. Studio Insert Object defaults versus Instance.new.
