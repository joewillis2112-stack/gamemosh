// Ray, RaycastParams, RaycastResult and WorldRoot:Raycast, written in Luau.
// They are plain data (Roblox docs: create.roblox.com/docs/reference/engine/
// datatypes/Ray, RaycastParams, RaycastResult); the geometry is the engine's
// (Workspace.__studioRaycast, web/raycast.js). typeof() reads each one's __type.
#pragma once
static const char* RAYCAST_LIB = R"LUA(
local lib = {}
local function locked(mt) mt.__metatable = "The metatable is locked" return mt end
local function fmt(v) return string.format("%g, %g, %g", v.X, v.Y, v.Z) end

-- Ray: an origin and a direction (not normalised), immutable.
local RayData = setmetatable({}, { __mode = "k" })
local RayMT = locked({ __type = "Ray" })
local Ray = {}
function Ray.new(origin, direction)
  if typeof(origin) ~= "Vector3" then error("invalid argument #1 to 'new' (Vector3 expected, got " .. typeof(origin) .. ")", 2) end
  if typeof(direction) ~= "Vector3" then error("invalid argument #2 to 'new' (Vector3 expected, got " .. typeof(direction) .. ")", 2) end
  local r = setmetatable({}, RayMT)
  RayData[r] = { origin, direction }
  return r
end
local RayMethods = {}
function RayMethods.ClosestPoint(self, p)
  local o, d = RayData[self][1], RayData[self][2]
  local m = d.Magnitude
  if m == 0 then return o end
  local u = d / m
  return o + u * math.max(0, (p - o):Dot(u))
end
function RayMethods.Distance(self, p) return (p - RayMethods.ClosestPoint(self, p)).Magnitude end
RayMT.__index = function(self, k)
  local d = RayData[self]
  if k == "Origin" then return d[1] elseif k == "Direction" then return d[2]
  elseif k == "Unit" then return Ray.new(d[1], d[2].Magnitude > 0 and d[2].Unit or d[2])
  elseif RayMethods[k] then return RayMethods[k] end
  error(tostring(k) .. " is not a valid member of Ray", 2)
end
RayMT.__newindex = function(_, k) error(tostring(k) .. " cannot be assigned to", 2) end
RayMT.__tostring = function(self) local d = RayData[self] return "{" .. fmt(d[1]) .. "}, {" .. fmt(d[2]) .. "}" end
RayMT.__eq = function(a, b) local x, y = RayData[a], RayData[b] return x ~= nil and y ~= nil and x[1] == y[1] and x[2] == y[2] end

-- RaycastParams: mutable settings, checked as they're set.
local ParamsData = setmetatable({}, { __mode = "k" })
local ParamsMT = locked({ __type = "RaycastParams" })
local RaycastParams = {}
local PARAM_TYPES = { FilterDescendantsInstances = "table", FilterType = "EnumItem", IgnoreWater = "boolean", CollisionGroup = "string", RespectCanCollide = "boolean", BruteForceAllSlow = "boolean" }
function RaycastParams.new(props)
  local p = setmetatable({}, ParamsMT)
  ParamsData[p] = { FilterDescendantsInstances = {}, FilterType = Enum.RaycastFilterType.Exclude, IgnoreWater = false, CollisionGroup = "Default", RespectCanCollide = false, BruteForceAllSlow = false }
  if props ~= nil then for k, v in pairs(props) do p[k] = v end end
  return p
end
local ParamsMethods = {}
function ParamsMethods.AddToFilter(self, x)
  local list = ParamsData[self].FilterDescendantsInstances
  if typeof(x) == "Instance" then table.insert(list, x)
  elseif type(x) == "table" then for _, i in ipairs(x) do if typeof(i) == "Instance" then table.insert(list, i) end end
  else error("invalid argument #1 to 'AddToFilter' (Instance or table expected, got " .. typeof(x) .. ")", 2) end
end
ParamsMT.__index = function(self, k)
  local d = ParamsData[self]
  if PARAM_TYPES[k] then return d[k] end
  if ParamsMethods[k] then return ParamsMethods[k] end
  error(tostring(k) .. " is not a valid member of RaycastParams", 2)
end
ParamsMT.__newindex = function(self, k, v)
  local want = PARAM_TYPES[k]
  if not want then error(tostring(k) .. " is not a valid member of RaycastParams", 2) end
  if k == "FilterType" and type(v) ~= "userdata" then
    local ok, item = pcall(function() return Enum.RaycastFilterType[v] end)
    if not ok then item = nil end
    if item == nil then -- by value: the first item with it (Exclude before its deprecated alias Blacklist)
      for _, e in ipairs(Enum.RaycastFilterType:GetEnumItems()) do if e.Value == v then item = e break end end
    end
    if item == nil then error("Invalid value for enum RaycastFilterType", 2) end
    v = item
  end
  if typeof(v) ~= want then error("Unable to assign property " .. k .. ". " .. want .. " expected, got " .. typeof(v), 2) end
  if k == "FilterDescendantsInstances" then
    local copy = {} -- Roblox keeps its own copy of the list (later edits to the table don't apply)
    for _, i in ipairs(v) do if typeof(i) == "Instance" then table.insert(copy, i) end end
    v = copy
  end
  ParamsData[self][k] = v
end
ParamsMT.__tostring = function() return "RaycastParams{...}" end

-- RaycastResult: read-only.
local ResultData = setmetatable({}, { __mode = "k" })
local ResultMT = locked({ __type = "RaycastResult" })
local RESULT_FIELDS = { Instance = 1, Position = 2, Normal = 3, Material = 4, Distance = 5 }
ResultMT.__index = function(self, k)
  local i = RESULT_FIELDS[k]
  if i then return ResultData[self][i] end
  error(tostring(k) .. " is not a valid member of RaycastResult", 2)
end
ResultMT.__newindex = function(_, k) error(tostring(k) .. " cannot be assigned to", 2) end
ResultMT.__tostring = function(self) local d = ResultData[self] return "RaycastResult{" .. d[1]:GetFullName() .. " @ " .. fmt(d[2]) .. "; " .. fmt(d[3]) .. "; " .. tostring(d[4]) .. "}" end

-- WorldRoot:Raycast(origin, direction, params?)
function lib.Raycast(self, origin, direction, params)
  if not self:IsA("Workspace") then error("Raycast is not a valid member of " .. self.ClassName, 2) end
  if typeof(origin) ~= "Vector3" then error("Unable to cast " .. typeof(origin) .. " to Vector3", 2) end
  if typeof(direction) ~= "Vector3" then error("Unable to cast " .. typeof(direction) .. " to Vector3", 2) end
  local d
  if params ~= nil then
    if typeof(params) ~= "RaycastParams" then error("Unable to cast " .. typeof(params) .. " to RaycastParams", 2) end
    d = ParamsData[params]
  else
    d = ParamsData[RaycastParams.new()]
  end
  local inst, pos, normal, material, dist = self:__studioRaycast(origin, direction, d.FilterDescendantsInstances, d.FilterType.Value, d.RespectCanCollide)
  if inst == nil then return nil end
  local r = setmetatable({}, ResultMT)
  ResultData[r] = { inst, pos, normal, material, dist }
  return r
end

-- Camera:ViewportPointToRay / ScreenPointToRay(x, y, depth?): a unit Ray through that pixel,
-- starting depth studs from the camera (the engine's pinhole, Camera.__studioPointToRay).
local function pointToRay(name, inset)
  return function(self, x, y, depth)
    if not self:IsA("Camera") then error(name .. " is not a valid member of " .. self.ClassName, 2) end
    if type(x) ~= "number" then error("invalid argument #1 to '" .. name .. "' (number expected, got " .. typeof(x) .. ")", 2) end
    if type(y) ~= "number" then error("invalid argument #2 to '" .. name .. "' (number expected, got " .. typeof(y) .. ")", 2) end
    if depth ~= nil and type(depth) ~= "number" then error("invalid argument #3 to '" .. name .. "' (number expected, got " .. typeof(depth) .. ")", 2) end
    local o, d = self:__studioPointToRay(x, y, depth or 0, inset)
    return Ray.new(o, d)
  end
end
lib.ViewportPointToRay = pointToRay("ViewportPointToRay", 0)
lib.ScreenPointToRay = pointToRay("ScreenPointToRay", 58) -- the GUI inset (runtime/gui.js)

lib.Ray = Ray
lib.RaycastParams = RaycastParams
return lib
)LUA";
