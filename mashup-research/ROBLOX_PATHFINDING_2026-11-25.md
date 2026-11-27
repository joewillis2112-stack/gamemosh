# Roblox PathfindingService (read 2026-11-25) [Studio]

Source: creator-docs reference (`classes/PathfindingService.yaml`, `classes/Path.yaml`, `datatypes/PathWaypoint.yaml`,
`enums/PathStatus.yaml`, `enums/PathWaypointAction.yaml`, `classes/PathfindingModifier.yaml`, `classes/PathfindingLink.yaml`).
The guide page (characters/pathfinding.md) isn't in our copy. Roblox doesn't publish its solver: ours is marked OURS.

## API
- `PathfindingService:CreatePath(agentParameters)` -> Path. Keys (defaults): AgentRadius (2, "minimum horizontal space
  required"), AgentHeight (5, "minimum vertical space"), AgentCanJump (true), AgentCanClimb (false: TrussParts),
  WaypointSpacing (4, "spacing between intermediate waypoints"), Costs ({}: materials or PathfindingModifier labels -> cost).
- `PathfindingService:FindPathAsync(start, finish)` -> Path computed for "a regular-sized Roblox character"; NoPath status
  when none. ComputeRawPathAsync / ComputeSmoothPathAsync / EmptyCutoff are the legacy system's.
- `Path:ComputeAsync(start, finish)` (yields): fills the path; must be called again to update it.
- `Path.Status` (PathStatus): Success; ClosestNoPath / ClosestOutOfRange (a path to the closest point); FailStartNotEmpty /
  FailFinishNotEmpty (the start / finish point not empty); NoPath.
- `Path:GetWaypoints()` -> PathWaypoints from start to end, empty if no path. `Path:CheckOcclusionAsync(start)` -> the first
  occluded waypoint from `start`, or -1 (an error if start < 0 or beyond the waypoints).
- `Path.Blocked(index)` / `Path.Unblocked(index)`: the computed path became blocked / unblocked (possibly behind the agent).
- `PathWaypoint.new(position, action, label?)`: Position, Action (PathWaypointAction: Walk, Jump "needed to reach the next
  waypoint", Custom for PathfindingLinks), Label (the navigation area's name; automatic jump links are labelled "Jump").

## Ours
- A navigation grid of 1-stud columns over the start-finish box (plus a margin): each column's floors are the tops of the
  collidable parts under it (exact ray tests), a floor walkable if its slope is under 60 degrees and a vertical capsule of
  AgentRadius from 1 stud above it to AgentHeight is clear (exact shape tests). Characters aren't obstacles.
- Steps of up to 1 stud walk; rises up to 7 studs need a jump (AgentCanJump); drops of up to 20 studs walk off the edge.
- A* over 8 neighbours (no corner cutting), jump and drop links reaching past the agent's clearance; Costs multiply a floor's
  material cost. Then straightened (line of sight over walkable floor) and spaced by WaypointSpacing.
- Waypoints are at floor level; a jump's take-off waypoint has Action Jump and Label "Jump".
- [Studio] Terrain (2026-11-27): done (claudestudio/PLAN.md). Roblox's docs give water a material cost (Costs.Water, math.huge to keep out); how its navmesh treats shores and the ground under water isn't documented, so ours (swum at the surface, a Jump out) is OURS.
- [Studio] TrussPart climbing (2026-11-27, create.roblox.com/docs/characters/pathfinding, read today): AgentCanClimb "Determines whether climbing TrussParts during pathfinding is allowed. A climbable path has a Label named Climb and the cost for a climbable path is 1 by default." The page's PlayerPathFollow script flattens its approach plane only `if nextWaypoint.Label ~= "Climb"` ("when not climbing up"). Not stated: which waypoints carry the label, their Action, what the cost multiplies, climbing down. The 2022 announcement (devforum 2040033) adds `Costs = { Climb = 2 }` as an example and a staff-acknowledged issue: no climbing with a collidable part above the truss. Done in claudestudio/PLAN.md.
- Not yet: PathfindingModifier, PathfindingLink, ClosestNoPath / partial paths.
