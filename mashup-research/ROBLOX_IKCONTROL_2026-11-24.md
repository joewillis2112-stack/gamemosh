# Roblox IKControl (read 2026-11-24) [Studio]

Source: creator-docs `reference/engine/classes/IKControl.yaml`, `enums/IKControlType.yaml`, and the API dump
(defaults). What Claude Studio does differently is marked OURS where it is built.

## What it is
A procedural pose from inverse kinematics. Child of a Humanoid (or AnimationController) that has an Animator.
It needs Type, EndEffector, Target and ChainRoot; until all are set it does nothing. It overrides the
animation for every part from ChainRoot to EndEffector (Weight blends it over the animation).

## Properties (defaults from the API dump)
- **Type** (IKControlType, Transform): Transform = full 6-DoF (EndEffector's CFrame to Target's); Position =
  position only; Rotation = rotation only; LookAt = moves and orients the whole chain so an axis of the
  EndEffector (forward by default; EndEffectorOffset picks another) points at Target's position.
- **ChainRoot** (Instance, nil): the last part allowed to move (e.g. LeftUpperArm); must be an ancestor of
  EndEffector; a BasePart or a Bone. Not the character's actual root ("unrealistic results").
- **EndEffector** (Instance, nil): the last part (a BasePart with a Motor6D child, a Motor6D, a Bone, or an
  Attachment). Its pivot moves to Target; an Attachment as EndEffector moves that point instead.
- **Target** (Instance, nil): something with a CFrame in the world; followed each frame if it moves.
- **Offset** (CFrame, identity): applied on top of Target's CFrame.
- **EndEffectorOffset** (CFrame, identity): applied on top of Target's CFrame, in EndEffector's local space;
  also picks the LookAt axis.
- **Pole** (Instance, nil): something with a position; the middle joints bend towards it. Without one, an
  "Arm" chain (LeftHand/RightHand to the same side's UpperArm) and a "Leg" chain (LeftFoot/RightFoot to
  UpperLeg) bend as elbows and knees do; other chains "might not bend as you expect".
- **Weight** (float, 1): 0..1 (clamped), the interpolation between the EndEffector (animated) and the IK
  target. 0 doesn't disable it (SmoothTime and Pole still act); Enabled false does.
- **SmoothTime** (float, 0.05): a critically damped spring on the target, about SmoothTime seconds to arrive;
  0 = no smoothing.
- **Priority** (int, 0): higher priorities solve later (their result can override lower ones).
- **Enabled** (bool, true).

## Methods
- GetChainCount(): segments between ChainRoot and EndEffector (3 parts -> 2); 0 if not a valid chain.
- GetChainLength(): sum of world distances between consecutive parts, EndEffector up to ChainRoot (max reach;
  a farther Target makes the chain extend towards it as far as it can).
- GetNodeWorldCFrame(i), GetNodeLocalCFrame(i): the solved chain's nodes, 1 = ChainRoot ... count+1 =
  EndEffector; identity outside the range or without a valid chain.
- GetRawFinalTarget(): the target this frame after Weight, Offset and EndEffectorOffset, before smoothing
  (LookAt: the world position aimed at). GetSmoothedFinalTarget(): after smoothing (equal when SmoothTime 0).

## Not stated (we choose, marked OURS in code)
- The solver itself (Roblox doesn't say): two-bone analytic for 2-segment chains with the pole (or the limb's
  natural bend), FABRIK-style for others.
- Joint limits from constraints on the chain: not described in these pages.
