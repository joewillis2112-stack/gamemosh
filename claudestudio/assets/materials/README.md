# Materials

Textures for Roblox's Material names, from ambientCG (CC0 1.0, https://ambientcg.com).
Each folder: `albedo.jpg` (greyscale, 0.5 = the part's Color; the engine tints it, as
Roblox tints its materials), `normal.jpg` (OpenGL convention), `orm.jpg` (R ambient
occlusion, G roughness remapped to the material's mean, B metalness). 512 px, from the
1K sets. `meta.json` records the source asset, target roughness and the share of
albedo texels clipped.

| Material | ambientCG asset |
|---|---|
| Wood | Wood094 |
| WoodPlanks | WoodFloor040 |
| Brick | Bricks101 |
| Cobblestone | PavingStones141 |
| Concrete | Concrete034 |
| Grass | Grass004 |
| Sand | Ground080 |
| Granite | Granite002A |
| Marble | Marble012 |
| DiamondPlate | DiamondPlate008B |
| CorrodedMetal | Metal041B |
| Fabric | Fabric061 |
| Pebble | Gravel023 |
| Ice | Ice003 |

Baked by `tools/bake-materials.py` (greyscale = luminance / mean,
contrast x0.7, stored at half).
