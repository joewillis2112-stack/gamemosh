# Roblox physical properties, character pushing, solver rate, sleep (research 2026-10-09)

_Gathered by a research agent. The material table was re-parsed by script straight from the creator-docs source (`parts/materials.md`) into `claudestudio/web/runtime/physprops.js`; the agent's quoted values match it._

Sources: Roblox/creator-docs `main` fetched raw on 2026-10-09 (a local clone at commit 9dc22ac, dated 2026-10-08, was cross-checked against raw), plus DevForum topics fetched through the Discourse JSON API. A DevForum post counts as an "engineer" statement only where the topic JSON shows `primary_group_name: Roblox_Staff`.

Doc URL shorthand: `CD/` = `https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/`

---

## 1. Default physical properties per material: VERIFIED

Source: `CD/parts/materials.md`, section "Default physical properties". Quote: "The following table lists each material's default physical properties as detailed in the `Datatype.PhysicalProperties` reference."

Columns are in the doc's order: Density, Elasticity, ElasticityWeight, Friction, FrictionWeight.

| Material | Density | Elasticity | ElastW | Friction | FricW |
|---|---|---|---|---|---|
| Plastic | 0.7 | 0.5 | 1 | 0.3 | 1 |
| SmoothPlastic | 0.7 | 0.5 | 1 | 0.2 | 1 |
| Neon | 0.7 | 0.2 | 1 | 0.3 | 1 |
| Wood | 0.35 | 0.2 | 1 | 0.48 | 1 |
| WoodPlanks | 0.35 | 0.2 | 1 | 0.48 | 1 |
| Brick | 1.922 | 0.15 | 1 | 0.8 | 0.3 |
| Concrete | 2.403 | 0.2 | 1 | 0.7 | 0.3 |
| Metal | 7.85 | 0.25 | 1 | 0.4 | 1 |
| DiamondPlate | 7.85 | 0.25 | 1 | 0.35 | 1 |
| CorrodedMetal | 7.85 | 0.2 | 1 | 0.7 | 1 |
| Foil | 2.7 | 0.25 | 1 | 0.4 | 1 |
| Grass | 0.9 | 0.1 | 1.5 | 0.4 | 1 |
| LeafyGrass | 0.9 | 0.1 | 2 | 0.4 | 2 |
| Ground | 0.9 | 0.1 | 1 | 0.45 | 1 |
| Mud | 0.9 | 0.07 | 4 | 0.3 | 3 |
| Snow | 0.9 | 0.03 | 4 | 0.3 | 3 |
| Sand | 1.602 | 0.05 | 2.5 | 0.5 | 5 |
| Sandstone | 2.691 | 0.15 | 1 | 0.5 | 5 |
| Ice | 0.919 | 0.15 | 1 | 0.02 | 3 |
| Glacier | 0.919 | 0.15 | 1 | 0.05 | 2 |
| Glass | 2.403 | 0.2 | 1 | 0.25 | 1 |
| Slate | 2.691 | 0.2 | 1 | 0.4 | 1 |
| Granite | 2.691 | 0.2 | 1 | 0.4 | 1 |
| Marble | 2.563 | 0.17 | 1 | 0.2 | 1 |
| Basalt | 2.691 | 0.15 | 1 | 0.7 | 0.3 |
| Rock | 2.691 | 0.17 | 1 | 0.5 | 1 |
| Limestone | 2.691 | 0.15 | 1 | 0.5 | 1 |
| Cobblestone | 2.691 | 0.17 | 1 | 0.5 | 1 |
| Pebble | 2.403 | 0.17 | 1.5 | 0.4 | 1 |
| Pavement | 2.691 | 0.17 | 1 | 0.5 | 0.3 |
| Asphalt | 2.36 | 0.2 | 1 | 0.8 | 0.3 |
| RoofShingles | 2.36 | 0.2 | 1 | 0.8 | 0.3 |
| CrackedLava | 2.691 | 0.15 | 1 | 0.65 | 1 |
| Salt | 2.165 | 0.05 | 1 | 0.5 | 1 |
| Fabric | 0.7 | 0.05 | 1 | 0.35 | 1 |
| Carpet | 1.1 | 0.25 | 2 | 0.4 | 1 |
| Leather | 0.86 | 0.25 | 1 | 0.35 | 1 |
| Cardboard | 0.7 | 0.05 | 2 | 0.5 | 1 |
| Plaster | 0.75 | 0.2 | 1 | 0.6 | 0.3 |
| CeramicTiles | 2.4 | 0.2 | 1 | 0.51 | 1 |
| ClayRoofTiles | 2 | 0.2 | 1 | 0.51 | 1 |
| Rubber | 1.3 | 0.95 | 2 | 1.5 | 3 |
| ForceField | 2.403 | 0.2 | 1 | 0.25 | 1 |

- Rubber exists as a material: VERIFIED (it is in the table above).
- Water and Air (terrain-only) are not in the table, so I don't know their values.
- The docs give a precedence order for the effective values: "Custom physical properties of the specific part" > "of the part's custom material" > "of the material override of the part's material" > "The default physical properties of the part's material". VERIFIED: `CD/parts/materials.md`, and the same list appears in `BasePart.CurrentPhysicalProperties` in `CD/reference/engine/classes/BasePart.yaml`.
- History, VERIFIED (Roblox staff): before Feb 2016 every part had the same properties. Khanovich (Roblox_Staff), 2016-01-30, gives a script to "Set any non-Custom parts to OLD defaults" using `PhysicalProperties.new(1, 0.3, 0.5, 1, 1)`. https://devforum.roblox.com/t/21946

## 2. How two touching parts combine friction and elasticity: VERIFIED

Source: `CD/reference/engine/datatypes/PhysicalProperties.yaml`. Quote: "When two parts interact, the friction and elasticity between them are determined in the same way by the following pairwise weighted average function:"

```lua
local function getActualFriction(partA, partB)
	return (partA.Friction * partA.FrictionWeight + partB.Friction * partB.FrictionWeight) / (partA.FrictionWeight + partB.FrictionWeight)
end
```

The doc continues: "the formula is used in the same manner when determining Elasticity". So:

- `e = (eA*ewA + eB*ewB) / (ewA + ewB)`
- `f = (fA*fwA + fB*fwB) / (fwA + fwB)`

Gaps:
- The behaviour when both weights are 0 (0/0) is not documented. I don't know it.
- Whether `f` is a single Coulomb coefficient (one coefficient for both static and kinetic friction) is not stated. UNSURE.
- kleptonaut (Roblox_Staff), 2020-04-07: "Friction depends on the friction coefficient values on the two materials in contact, and the force pushing them together (in your case, gravity). So the mass of the car is always going to play a part in this." This points to normal-force-proportional (Coulomb) friction. VERIFIED that the quote exists; the exact model is UNSURE. https://devforum.roblox.com/t/514675

## 3. Constructors, CustomPhysicalProperties, Massless, mass: VERIFIED unless marked

Source: `CD/reference/engine/datatypes/PhysicalProperties.yaml`. Note that the argument order differs from the order of the table columns.

Constructors:
- `PhysicalProperties.new(material: Enum.Material)`: "Returns a PhysicalProperties with the default properties for the given material."
- `PhysicalProperties.new(density, friction, elasticity)`
- `PhysicalProperties.new(density, friction, elasticity, frictionWeight, elasticityWeight)`
- `PhysicalProperties.new(density, friction, elasticity, frictionWeight, elasticityWeight, acousticAbsorption)`

Clamps, quoted from the docs:
- density: "clamped to the range [0.0001, 100]"
- friction: "clamped to [0, 2]"
- elasticity: "clamped to [0, 1]"
- frictionWeight and elasticityWeight: "clamped to [0, 100]"
- acousticAbsorption: "[0, 1]"

Fields: `Density`, `Friction`, `Elasticity`, `FrictionWeight`, `ElasticityWeight`, `AcousticAbsorption`.

`BasePart.CustomPhysicalProperties` (type PhysicalProperties). Quote: "If enabled, this property let's you configure these physical properties. If disabled, these physical properties are determined by the Material of the part."
- Disabled reads and writes as `nil`. UNSURE: the reference does not say so. Evidence: Roblox staff migration code tests `if instance.CustomPhysicalProperties then ... else PhysicalProperties.new(instance.Material)` (https://devforum.roblox.com/t/21946).
- Changing it wakes a sleeping assembly (`CD/physics/sleep-system.md`).

`BasePart.CurrentPhysicalProperties` is ReadOnly and NotReplicated, and holds the effective values after the precedence order in section 1.

`BasePart.Mass` is ReadOnly. Quote: "describes the product of a part's volume and density". "The volume of a part is determined by its Size and its Shape". Density comes from Material, or from CustomPhysicalProperties if that is set. `GetMass()` returns the same value.
- So mass = density × volume (studs³). For example, a 4×1×2 Plastic block weighs 8 × 0.7 = 5.6.
- The exact volume formula for Ball, Cylinder and Wedge (true geometric volume or not) is UNSURE; I didn't check it.

`BasePart.AssemblyMass`. Quotes: "The sum of the mass of all the BaseParts in this part's assembly. Parts that are Massless and are not the assembly's root part will not contribute". "If the assembly has an anchored part, the assembly's mass is considered infinite. ... unanchored assemblies with a large difference in mass may cause instabilities."

`BasePart.Massless`. Quotes: "the part will not contribute to the total mass or inertia of its assembly as long as it is welded to another part that has mass." "If the part is its own root part ... this will be ignored for that part".
- kleptonaut (Roblox_Staff): "Massless does not work if all parts in a given assembly are set to be massless. An assembly must have mass". https://devforum.roblox.com/t/3293198

Units: 1 stud = 28 cm, 1 RMU (Roblox Mass Unit) = 21.952 kg, water = 1 RMU/stud³, 1 N = 0.163 "Rowtons" [RMU stud/s²]. Source: `CD/physics/units.md`. So density 1 means water.

## 4. Humanoid character against loose parts

Two character controllers exist, and they differ on this:

**(a) Legacy C++ Humanoid controller**

- VERIFIED (kleptonaut, Roblox_Staff, 2025-03-12): "This is a known inconsistency with the Humanoid movement controller and the rest of the physics engine. The humanoid is treated differently in a variety of scenarios." The context: a floating platform held up far more Humanoid mass than the same mass of plain parts. https://devforum.roblox.com/t/3536230
- VERIFIED (same thread, 2025-03-13): "there is no way to customize the forces on the standard Humanoid." The PhysicsState "disables all forces on the character".
- VERIFIED (kleptonaut, "Releasing Character Physics Controllers", 2023-09-29), listing what the new controllers do "that the Humanoid did not do": "Customize friction with the ground. Customize max forces for keeping upright and moving around. Conserves momentum when leaving the ground by default." The same post says the new controllers ensure "the Parts in your character follow the same physics laws that every other Part does". https://devforum.roblox.com/t/2623426
- VERIFIED (Khanovich, Roblox_Staff, 2016-02-01): "Now we tree Humanoid feet as plastic". Before that, the floor was treated as touching its own material. Whether this still holds today is UNSURE. https://devforum.roblox.com/t/19608/63
- Community observation, UNSURE and not from an engineer: XAXA, 2019, found that an anchored part with Velocity (a conveyor) pushes the character only when the part's mass is greater than the character's mass. He measured the character at 12.67 RMU. https://devforum.roblox.com/t/234808
  - Another user measured an R15 character at "13.77 units" in 2023. https://devforum.roblox.com/t/2224726
- Community, UNSURE: users report that lowering a character's density makes collisions with it gentler, for example "set all Other players part's Density to .02 ... only gives you a slight nudge" (Baumz, 2016, in t/21946).

**(b) ControllerManager / GroundController, which is the new default path**

- The Character Controller Library is the Luau ability layer built on ControllerManager. VERIFIED (m0bsterlobster, Roblox_Staff, 2026-04-08): "defaulted to ON in the Classic Obby template. Over the next several months, we will progressively default it to ON in all Studio templates." Also: "Friction-Based Ground Movement: Walking now respects material properties." https://devforum.roblox.com/t/4565267
- VERIFIED: `CD/reference/engine/classes/GroundController.yaml`.
  - `Friction`: "Determines how much force is available for locomotion or to keep the character stationary on slopes."
  - `FrictionWeight` is "equal in behavior to the FrictionWeight ... of CustomPhysicalProperties".
  - Class description: "Ground friction comes from the floor material and this controller's Friction and FrictionWeight."
  - `BalanceMaxTorque`: "A lower torque means it's easer for the root part to get knocked over when running into things."
  - `ControllerManager.RootPart` is where "the controller's forces and torques are applied".
- VERIFIED (kleptonaut, 2023-01-30): "The GroundController achieves it's behavior by treating it's contact with the floor part just like any other part contact collision." https://devforum.roblox.com/t/1999211
- Inference, UNSURE: under (b), the horizontal drive force is limited by friction × normal force, which comes from the character's weight. A walking character can therefore push a loose part only while the part's friction resistance (its weight × combined friction with its floor) is below the drive the character can get from its own floor contact. On this reading, character mass matters.
- Community, UNSURE: a user in t/1999211 (Galvarino, 2022) reported that with the new controller "the character can now exert friction and forces onto parts THEY ARE WALKING ON". Another user asked for a "walk force" knob to decide whether characters can push heavy blocks. No staff answer gave a number.

**Unknown, said plainly**
- I found no engineer statement giving the legacy Humanoid's push force, such as "force proportional to X". I don't know it.
- I found no documentation or engineer statement on whether a loose part landing on a character pushes the character. The only evidence is a 2018 bug report: heavy parts inside a character's model fling the character while it is airborne (https://devforum.roblox.com/t/183140). That is not the same case.

## 5. Solver rate, sleep, stacking

**Rate: VERIFIED**
- `CD/physics/adaptive-timestepping.md`: "By default, Roblox simulates physics at 240 Hz. Given cycles of approximately 60 frames per second, around 4 worldsteps are advanced per frame."
- Adaptive mode puts assemblies in 240, 120 or 60 Hz islands. 240 Hz goes to "assemblies with high velocity values, high acceleration values, and complex mechanisms". The microprofiler names the solver `LDLPGSSolver::solve`.
- `CD/reference/engine/enums/PhysicsSteppingMethod.yaml`: "The default value is Default, which currently resolves to the same behavior as Adaptive." Fixed means "advance forward at 240 Hz".
- Workspace.yaml: "when assemblies of different simulation rates become connected via Constraints or collisions, the combined mechanism will default to the highest simulation rate".
- Note: the default became Adaptive at some point. The 2021 announcement said "default and fixed are identical" at that time (https://devforum.roblox.com/t/1038853, which describes "Our LDL-PGS solver ... 240 times per second"; the poster's staff flag is not shown in the JSON, so the attribution is UNSURE).
- chefdeletat, 2018: "PGS uses 240hz simulation steps" and free-fall error "for PGS the theoretical error should be -6.25" with g = 1000 over about 3 s. That error comes from the integrator. The posts carry no staff flag now, so the attribution is UNSURE. https://devforum.roblox.com/t/162083

**Sleep: VERIFIED** (`CD/physics/sleep-system.md`)
- States: awake, sleeping, sleep-checking.
- An assembly sleeps when linear velocity < 0.33 studs/s and rotational velocity < 0.42 studs/s, with no linear or rotational acceleration > 0.24 studs/s².
- A sleep-checking assembly wakes if its own acceleration > 16.9 studs/s², or if a neighbour's linear velocity > 0.48 studs/s or rotational velocity > 0.59 studs/s.
- "Rotational velocity ... of a point located on the assembly bounding sphere".
- Other wake triggers: a collision with an assembly moving faster than 1 stud/s; changes to Anchored, velocities, CanCollide/CanTouch, CustomPhysicalProperties, Massless or RootPriority; impulses; changes to Workspace Gravity, FluidForces, GlobalWind or AirDensity; constraint add or change; being in an explosion's radius.
- Joints driven by a motor or actuator use a stricter sleep threshold, but the doc gives no value.
- The doc does not say how long an assembly must stay below the thresholds before it sleeps. I don't know.
- "Anchored parts are always asleep." (kleptonaut, Physics Best Practices, 2019, https://devforum.roblox.com/t/280812)
- The sleep system was revised in 2025, and the change was forced on all experiences by 2025-08-12 (m0bsterlobster, Roblox_Staff, https://devforum.roblox.com/t/3587885).

**Stacking stability**
- No documentation or engineer statement on stacking specifically. I don't know.
- The closest documented guidance, VERIFIED:
  - "Avoid large differences in mass between parts connected by a constraint." (kleptonaut, t/280812)
  - The AssemblyMass warning on large mass ratios (section 3).
  - Adaptive docs recommend Fixed 240 Hz for "destruction simulations".
