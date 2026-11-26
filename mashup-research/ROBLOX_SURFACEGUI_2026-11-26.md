# Roblox SurfaceGui (read 2026-11-26) [Studio]

Sources: creator-docs reference (`classes/SurfaceGui.yaml`, `classes/SurfaceGuiBase.yaml`, `classes/LayerCollector.yaml`,
`enums/SurfaceGuiSizingMode.yaml`, `enums/NormalId.yaml`), the guide `ui/in-experience-containers.md` (fetched from
github.com/Roblox/creator-docs, main), and the API dump (`Full-API-Dump.json`) for Instance.new defaults.

## Properties (dump defaults; docs)
- SurfaceGuiBase: `Adornee` (nil: "renders on its parent when that parent is a BasePart"), `Face` (NormalId; Front:
  not in the dump, SurfaceGuiBase isn't creatable), `Active` ("true by default"; "sinks input").
- SurfaceGui: AlwaysOnTop false, Brightness 1 (0..1000), CanvasSize 800x600, ClipsDescendants false, LightInfluence 0,
  MaxDistance 0 ("0 means there is no limit"), PixelsPerStud 50, SizingMode FixedSize, ToolPunchThroughDistance 0,
  ZOffset 0. Hidden in the dump: Shape (Flat / CurvedHorizontally), HorizontalCurvature.
- The docs' prose disagrees with the dump in two places: it calls ClipsDescendants "true (default)" and SizingMode
  "PixelsPerStud (default)". The dump is Instance.new's; the prose probably describes Studio's insert. We use the dump.

## Behaviour (docs)
- "The canvas occupies the entire Face". FixedSize: CanvasSize virtual pixels over the face (stretched to it);
  PixelsPerStud: the face's size in studs times PixelsPerStud.
- "Similar to Decals and Textures, UI objects ... face the same direction as the surface they're on."
- AlwaysOnTop false: "renders like other 3D content and is occluded by other 3D objects". True: "always renders on top
  of 3D content", "colors match how they appear inside a ScreenGui", "text may appear sharper", LightInfluence treated
  as 0, Brightness has no effect.
- LightInfluence 0..1: 1 = "surrounding lighting has complete control", 0 = "lighting has no effect". Brightness scales
  the container's light when LightInfluence is 0 (a video board brightened to 10 in a dark room).
- ClipsDescendants false: parts of objects outside the canvas are drawn; objects completely outside are not.
- ZOffset: layers SurfaceGuis on the same face; "does not visually lift or sink" it.
- Input: buttons and boxes inside work only when the SurfaceGui is in PlayerGui (usually from StarterGui, with Adornee
  set); the part's CanQuery must be true.
- Appearance is cached until a descendant is added/removed or a property of it or the container changes.

## Not documented (ours, marked in code)
- Which way up a canvas lies on Top and Bottom. Ours: as our Decals, Top's canvas up toward the part's Back (+Z),
  Bottom's toward its Front (-Z). UNSURE.
- Wedge Front: the slope, up the slope. Balls and cylinders: the flat face of their box.
- How Brightness at LightInfluence 0 maps to our renderer's light: white at Brightness 1 is drawn just under our
  default Bloom threshold (Roblox's default Threshold 2 is above a GUI's white), so it doesn't glow.

## How we draw it (web/runtime/surfacegui.js, surfaces.js, gui.js)
- Laid out as DOM like every GUI. AlwaysOnTop: that DOM over the page through a CSS matrix3d (exact colours, live text).
- Otherwise: the DOM drawn into an image (SVG foreignObject from a data URL; a blob URL taints the canvas in Chromium
  153), text as the bundled fonts' glyph outlines at the page's own character positions (embedding the fonts cost
  15-45 ms of main thread per image), images inlined as data URLs; the image on a quad over the face, occluded by depth.
- Clicks: an invisible copy of the DOM over the face takes them; a press where a ray from the camera to that point of
  the face is blocked doesn't reach the button.
