# Roblox Humanoid:MoveTo and walking NPCs (read 2026-11-24) [Studio]

Source: creator-docs `reference/engine/classes/Humanoid.yaml` (MoveTo, Move, WalkToPoint, WalkToPart,
MoveToFinished). Claude Studio's choices are marked OURS.

- **MoveTo(location, part?)** sets WalkToPoint and WalkToPart and starts walking. With a part, the humanoid
  walks to `location`, and if the part moves the point moves with it (same position relative to the part).
- **WalkToPart** set: the goal is the part's position plus WalkToPoint "translated in object space relative to
  the rotation of the part". The page's own snippet says `PointToObjectSpace`, which contradicts its prose; we
  read the prose: with a part, MoveTo stores WalkToPoint = part.CFrame:PointToObjectSpace(location) and the
  goal each frame is part.CFrame:PointToWorldSpace(WalkToPoint). (OURS: the reading.)
- Setting WalkToPoint or WalkToPart alone doesn't start walking.
- **Ends** when the character arrives (about a 1 stud threshold), gets stuck and the 8 s timer runs out,
  WalkToPoint or WalkToPart changes, a script calls Move with a new direction, or a script sets the root
  part's CFrame. MoveTo again within 8 s resets the timer.
- **MoveToFinished(reached)**: true if reached within 8 s, false when the timer ran out (the humanoid stops).
- **Move(direction, relativeToCamera?)**: walk in that direction until called again (world terms, or the
  current camera's when true). Roblox's control script overwrites it every frame for players.

## Plan (OURS where noted)
1. The Humanoid API: WalkToPoint, WalkToPart, MoveTo, Move, MoveToFinished; one shared goal-to-input step
   used by every driven humanoid (threshold 1 stud horizontally, 8 s timeout).
2. The player's character: MoveTo drives it while the player gives no input (Roblox's control script would
   call Move each frame; with no input it moves nothing, so MoveTo shows).
3. NPCs: a rig (a Model with a Humanoid and a HumanoidRootPart, not a player's) whose root part is not
   anchored is driven like the player's character: its own physics capsule, Humanoid properties (WalkSpeed,
   JumpPower...), MoveTo/Move/Jump, R15 parts and Motor6Ds from its description's body, and its state's clips
   (idle, walk, jump, fall) played for it. OURS: Roblox NPCs only animate with an Animate script.
   Anchored rigs stay statues drawn by rigs.js.
4. Players:CreateHumanoidModelFromDescriptionAsync gives an unanchored root, as Roblox's does.
