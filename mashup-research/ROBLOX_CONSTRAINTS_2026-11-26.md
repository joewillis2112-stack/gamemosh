# Roblox constraints (read 2026-11-26) [Studio]

Sources: creator-docs reference (`classes/Constraint.yaml`, `HingeConstraint`, `BallSocketConstraint`, `RopeConstraint`,
`RodConstraint`, `SpringConstraint`, `SlidingBallConstraint`, `PrismaticConstraint`, `CylindricalConstraint`,
`AlignPosition`, `AlignOrientation`, `LinearVelocity`, `AngularVelocity`, `VectorForce`, `Torque`, `Attachment`), the
guides `physics/mechanical-constraints.md`, `physics/mover-constraints.md`, `physics/units.md` and
`physics/constraints/*.md` (fetched from github.com/Roblox/creator-docs, main). Defaults: rbx-dom's reflection database
(`DefaultProperties`, what Instance.new gives; a null there is infinity) and the API dump.

## Common
- Constraint: Attachment0, Attachment1, Enabled (true), Visible (false), Color (BrickColor), Active (read-only: "true
  if the constraint and both of its parts are in the Workspace and Enabled").
- Attachments: a point and frame on a part; Axis is its X axis, SecondaryAxis its Y.
- Units: 1 stud = 28 cm, 1 RMU = 21.952 kg; forces in RMU stud/s^2, torques in RMU stud^2/s^2. "Internally, the Roblox
  physics engine does not use unit conversions." Our Havok world is in studs and RMU, so values go in as they are.

## Mechanical
- HingeConstraint: same position, X axes aligned; rotation about X. CurrentAngle from the attachments' Y axes (deg).
  ActuatorType None / Motor (reach AngularVelocity rad/s, MotorMaxTorque, MotorMaxAcceleration rad/s^2) / Servo (reach
  TargetAngle deg at AngularSpeed rad/s, ServoMaxTorque, AngularResponsiveness "sharpness"). LimitsEnabled:
  LowerAngle..UpperAngle (deg), Restitution at the ends. Defaults: Lower -45, Upper 45, AngularResponsiveness 45,
  MotorMaxAcceleration 500000, torques 0 (so a new motor or servo does nothing).
- BallSocketConstraint: same position, free rotation. LimitsEnabled: tilt in a cone of UpperAngle (45); TwistLimits
  (Twist -45..45) about X; MaxFrictionTorque resists rotation.
- RopeConstraint: no farther apart than Length (5); closer is free. Winch: WinchEnabled moves the length to
  WinchTarget at WinchSpeed (positive; negative means 0), WinchForce (10000), WinchResponsiveness (45).
- RodConstraint: kept at Length (5); rotation free; LimitAngle0/1 (90) tilt limits when LimitsEnabled.
- SpringConstraint: force from FreeLength (1), Stiffness (0), Damping (0, "multiplied to the velocity"), MaxForce (inf);
  LimitsEnabled: MinLength (0)..MaxLength (5), stopping "without restitution".
- PrismaticConstraint (SlidingBallConstraint): slide along X, no rotation. Motor: Velocity, MotorMaxForce,
  MotorMaxAcceleration (inf); Servo: TargetPosition at Speed, ServoMaxForce, LinearResponsiveness (45). Limits
  LowerLimit (0)..UpperLimit (5). The class page says the X axes are "collinear but pointing in opposite directions";
  the guide says each Axis "should point in the same direction". We follow the guide (UNSURE).
- CylindricalConstraint: a prismatic that also turns about the axis, with its own angular motor/servo/limits.

## Movers
- VectorForce: constant Force (default 1000, 0, 0) relative to Attachment0 (default), Attachment1 or World; at
  Attachment0, or the centre of mass with ApplyAtCenterOfMass.
- Torque: constant Torque about the centre of mass, RelativeTo Attachment0 (default).
- LinearVelocity: force to hold a velocity: Vector (VectorVelocity), Line (LineDirection x LineVelocity) or Plane
  (PlaneVelocity on PrimaryTangentAxis/SecondaryTangentAxis); RelativeTo World (default); ForceLimitsEnabled with
  MaxForce 1000 (Magnitude) or MaxAxesForce (PerAxis); ReactionForceEnabled.
- AngularVelocity: torque to hold AngularVelocity, MaxTorque (0: none), RelativeTo World.
- AlignPosition: force moving Attachment0 to Attachment1 (TwoAttachment) or to Position (OneAttachment); MaxForce
  10000, MaxVelocity inf, Responsiveness 10 (5..200); RigidityEnabled: as fast as the solver can; ReactionForceEnabled.
- AlignOrientation: torque aligning orientation (AllAxes by default), MaxTorque 10000, MaxAngularVelocity inf,
  Responsiveness 10, RigidityEnabled; OneAttachment aligns to its CFrame.

## Not documented (ours, marked in code)
- How Responsiveness, servo sharpness and winch responsiveness turn into force: ours, a critically damped approach.
- Restitution at limits (Havok's constraint limits are inelastic).
