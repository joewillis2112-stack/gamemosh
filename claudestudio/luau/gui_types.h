// UDim, UDim2 and Vector2, as Roblox's datatypes
// (creator-docs datatypes/UDim.yaml, UDim2.yaml, Vector2.yaml). Immutable
// userdata. UDim's Offset is an integer ("the offset is stored as an
// integer"; a fractional one is truncated here, Roblox's rounding is
// undocumented). Included by binding.cpp.

static const char* UDIM_MT = "UDim";
static const char* UDIM2_MT = "UDim2";
static const char* VEC2_MT = "Vector2";
struct UD { float s; int o; };
struct UD2 { UD x, y; };
struct V2 { float x, y; };

template <class T> static T* to_ud(lua_State* L, int idx, const char* mt) {
    if (lua_type(L, idx) != LUA_TUSERDATA || !lua_getmetatable(L, idx)) return nullptr;
    luaL_getmetatable(L, mt);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? (T*)lua_touserdata(L, idx) : nullptr;
}
template <class T> static T* check_ud(lua_State* L, int idx, const char* mt) {
    T* p = to_ud<T>(L, idx, mt);
    if (!p) luaL_typeerror(L, idx, mt);
    return p;
}
static void push_udim(lua_State* L, double s, double o) {
    UD* u = (UD*)lua_newuserdata(L, sizeof(UD)); u->s = (float)s; u->o = (int)o;
    luaL_getmetatable(L, UDIM_MT); lua_setmetatable(L, -2);
}
static void push_udim2(lua_State* L, double xs, double xo, double ys, double yo) {
    UD2* u = (UD2*)lua_newuserdata(L, sizeof(UD2)); u->x = { (float)xs, (int)xo }; u->y = { (float)ys, (int)yo };
    luaL_getmetatable(L, UDIM2_MT); lua_setmetatable(L, -2);
}
static void push_vec2(lua_State* L, double x, double y) {
    V2* v = (V2*)lua_newuserdata(L, sizeof(V2)); v->x = (float)x; v->y = (float)y;
    luaL_getmetatable(L, VEC2_MT); lua_setmetatable(L, -2);
}
static std::string fmt_num(double v) { char b[32]; snprintf(b, sizeof b, "%.9g", v); return b; }
static int ro_newindex(lua_State* L) { luaL_error(L, "%s cannot be assigned to", luaL_checkstring(L, 2)); return 0; }

// ---- UDim
static int udim_new(lua_State* L) { push_udim(L, luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0)); return 1; }
static int udim_index(lua_State* L) {
    UD* u = check_ud<UD>(L, 1, UDIM_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Scale")) { lua_pushnumber(L, u->s); return 1; }
    if (!strcmp(k, "Offset")) { lua_pushinteger(L, u->o); return 1; }
    luaL_error(L, "%s is not a valid member of UDim", k); return 0;
}
static int udim_add(lua_State* L) { UD* a = check_ud<UD>(L, 1, UDIM_MT); UD* b = check_ud<UD>(L, 2, UDIM_MT); push_udim(L, (double)a->s + b->s, (double)a->o + b->o); return 1; }
static int udim_sub(lua_State* L) { UD* a = check_ud<UD>(L, 1, UDIM_MT); UD* b = check_ud<UD>(L, 2, UDIM_MT); push_udim(L, (double)a->s - b->s, (double)a->o - b->o); return 1; }
static int udim_eq(lua_State* L) { UD* a = to_ud<UD>(L, 1, UDIM_MT); UD* b = to_ud<UD>(L, 2, UDIM_MT); lua_pushboolean(L, a && b && a->s == b->s && a->o == b->o); return 1; }
static int udim_tostring(lua_State* L) { UD* u = check_ud<UD>(L, 1, UDIM_MT); std::string s = fmt_num(u->s) + ", " + std::to_string(u->o); lua_pushstring(L, s.c_str()); return 1; }

// ---- UDim2
static int udim2_new(lua_State* L) {
    UD* x = to_ud<UD>(L, 1, UDIM_MT); UD* y = to_ud<UD>(L, 2, UDIM_MT);
    if (x && y) { push_udim2(L, x->s, x->o, y->s, y->o); return 1; }
    push_udim2(L, luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0), luaL_optnumber(L, 3, 0), luaL_optnumber(L, 4, 0)); return 1;
}
static int udim2_fromScale(lua_State* L) { push_udim2(L, luaL_optnumber(L, 1, 0), 0, luaL_optnumber(L, 2, 0), 0); return 1; }
static int udim2_fromOffset(lua_State* L) { push_udim2(L, 0, luaL_optnumber(L, 1, 0), 0, luaL_optnumber(L, 2, 0)); return 1; }
static int udim2_lerp(lua_State* L) {
    UD2* a = check_ud<UD2>(L, 1, UDIM2_MT); UD2* b = check_ud<UD2>(L, 2, UDIM2_MT); double t = luaL_checknumber(L, 3);
    push_udim2(L, a->x.s + (b->x.s - a->x.s) * t, a->x.o + (b->x.o - a->x.o) * t, a->y.s + (b->y.s - a->y.s) * t, a->y.o + (b->y.o - a->y.o) * t); return 1;
}
static int udim2_index(lua_State* L) {
    UD2* u = check_ud<UD2>(L, 1, UDIM2_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "X") || !strcmp(k, "Width")) { push_udim(L, u->x.s, u->x.o); return 1; }
    if (!strcmp(k, "Y") || !strcmp(k, "Height")) { push_udim(L, u->y.s, u->y.o); return 1; }
    if (!strcmp(k, "Lerp")) { lua_pushcfunction(L, udim2_lerp, "Lerp"); return 1; }
    luaL_error(L, "%s is not a valid member of UDim2", k); return 0;
}
static int udim2_add(lua_State* L) { UD2* a = check_ud<UD2>(L, 1, UDIM2_MT); UD2* b = check_ud<UD2>(L, 2, UDIM2_MT); push_udim2(L, (double)a->x.s + b->x.s, (double)a->x.o + b->x.o, (double)a->y.s + b->y.s, (double)a->y.o + b->y.o); return 1; }
static int udim2_sub(lua_State* L) { UD2* a = check_ud<UD2>(L, 1, UDIM2_MT); UD2* b = check_ud<UD2>(L, 2, UDIM2_MT); push_udim2(L, (double)a->x.s - b->x.s, (double)a->x.o - b->x.o, (double)a->y.s - b->y.s, (double)a->y.o - b->y.o); return 1; }
static int udim2_eq(lua_State* L) { UD2* a = to_ud<UD2>(L, 1, UDIM2_MT); UD2* b = to_ud<UD2>(L, 2, UDIM2_MT); lua_pushboolean(L, a && b && a->x.s == b->x.s && a->x.o == b->x.o && a->y.s == b->y.s && a->y.o == b->y.o); return 1; }
static int udim2_tostring(lua_State* L) {
    UD2* u = check_ud<UD2>(L, 1, UDIM2_MT);
    std::string s = "{" + fmt_num(u->x.s) + ", " + std::to_string(u->x.o) + "}, {" + fmt_num(u->y.s) + ", " + std::to_string(u->y.o) + "}";
    lua_pushstring(L, s.c_str()); return 1;
}

// ---- Vector2
static int vec2_new(lua_State* L) { push_vec2(L, luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0)); return 1; }
static V2 vec2_or_num(lua_State* L, int idx) { if (lua_isnumber(L, idx)) { float n = (float)lua_tonumber(L, idx); return { n, n }; } return *check_ud<V2>(L, idx, VEC2_MT); }
static int vec2_add(lua_State* L) { V2 a = vec2_or_num(L, 1), b = vec2_or_num(L, 2); push_vec2(L, a.x + b.x, a.y + b.y); return 1; }
static int vec2_sub(lua_State* L) { V2 a = vec2_or_num(L, 1), b = vec2_or_num(L, 2); push_vec2(L, a.x - b.x, a.y - b.y); return 1; }
static int vec2_mul(lua_State* L) { V2 a = vec2_or_num(L, 1), b = vec2_or_num(L, 2); push_vec2(L, a.x * b.x, a.y * b.y); return 1; }
static int vec2_div(lua_State* L) { V2 a = vec2_or_num(L, 1), b = vec2_or_num(L, 2); push_vec2(L, a.x / b.x, a.y / b.y); return 1; }
static int vec2_unm(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); push_vec2(L, -a->x, -a->y); return 1; }
static int vec2_eq(lua_State* L) { V2* a = to_ud<V2>(L, 1, VEC2_MT); V2* b = to_ud<V2>(L, 2, VEC2_MT); lua_pushboolean(L, a && b && a->x == b->x && a->y == b->y); return 1; }
static int vec2_tostring(lua_State* L) { V2* v = check_ud<V2>(L, 1, VEC2_MT); std::string s = fmt_num(v->x) + ", " + fmt_num(v->y); lua_pushstring(L, s.c_str()); return 1; }
static int vec2_dot(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); V2* b = check_ud<V2>(L, 2, VEC2_MT); lua_pushnumber(L, (double)a->x * b->x + (double)a->y * b->y); return 1; }
static int vec2_cross(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); V2* b = check_ud<V2>(L, 2, VEC2_MT); lua_pushnumber(L, (double)a->x * b->y - (double)a->y * b->x); return 1; }
static int vec2_lerp(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); V2* b = check_ud<V2>(L, 2, VEC2_MT); double t = luaL_checknumber(L, 3); push_vec2(L, a->x + (b->x - a->x) * t, a->y + (b->y - a->y) * t); return 1; }
static int vec2_fuzzyeq(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); V2* b = check_ud<V2>(L, 2, VEC2_MT); double e = luaL_optnumber(L, 3, 1e-5); lua_pushboolean(L, std::fabs(a->x - b->x) <= e && std::fabs(a->y - b->y) <= e); return 1; }
static int vec2_angle(lua_State* L) {
    V2* a = check_ud<V2>(L, 1, VEC2_MT); V2* b = check_ud<V2>(L, 2, VEC2_MT);
    double ang = std::atan2((double)a->x * b->y - (double)a->y * b->x, (double)a->x * b->x + (double)a->y * b->y);
    lua_pushnumber(L, lua_toboolean(L, 3) ? ang : std::fabs(ang)); return 1; // isSigned
}
#define VEC2_MAP(name, f) static int name(lua_State* L) { V2* a = check_ud<V2>(L, 1, VEC2_MT); push_vec2(L, f(a->x), f(a->y)); return 1; }
static float sgn2f(float x) { return x > 0 ? 1.f : x < 0 ? -1.f : 0.f; }
VEC2_MAP(vec2_abs, std::fabs) VEC2_MAP(vec2_floor, std::floor) VEC2_MAP(vec2_ceil, std::ceil) VEC2_MAP(vec2_sign, sgn2f)
static int vec2_minmax(lua_State* L, bool mx) {
    V2 r = *check_ud<V2>(L, 1, VEC2_MT);
    for (int i = 2; i <= lua_gettop(L); i++) { V2* b = check_ud<V2>(L, i, VEC2_MT); r.x = mx ? std::fmax(r.x, b->x) : std::fmin(r.x, b->x); r.y = mx ? std::fmax(r.y, b->y) : std::fmin(r.y, b->y); }
    push_vec2(L, r.x, r.y); return 1;
}
static int vec2_min(lua_State* L) { return vec2_minmax(L, false); }
static int vec2_max(lua_State* L) { return vec2_minmax(L, true); }
static int vec2_index(lua_State* L) {
    V2* v = check_ud<V2>(L, 1, VEC2_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "X") || !strcmp(k, "x")) { lua_pushnumber(L, v->x); return 1; }
    if (!strcmp(k, "Y") || !strcmp(k, "y")) { lua_pushnumber(L, v->y); return 1; }
    double m = std::sqrt((double)v->x * v->x + (double)v->y * v->y);
    if (!strcmp(k, "Magnitude")) { lua_pushnumber(L, m); return 1; }
    if (!strcmp(k, "Unit")) { push_vec2(L, m > 0 ? v->x / m : 0, m > 0 ? v->y / m : 0); return 1; }
    static const struct { const char* n; lua_CFunction f; } M[] = {
        { "Dot", vec2_dot }, { "Cross", vec2_cross }, { "Lerp", vec2_lerp }, { "FuzzyEq", vec2_fuzzyeq }, { "Angle", vec2_angle },
        { "Abs", vec2_abs }, { "Floor", vec2_floor }, { "Ceil", vec2_ceil }, { "Sign", vec2_sign }, { "Min", vec2_min }, { "Max", vec2_max },
    };
    for (auto& e : M) if (!strcmp(k, e.n)) { lua_pushcfunction(L, e.f, e.n); return 1; }
    luaL_error(L, "%s is not a valid member of Vector2", k); return 0;
}

static void register_gui_types(lua_State* L) {
    struct MM { const char* k; lua_CFunction f; };
    auto meta = [&](const char* name, std::initializer_list<MM> mm) {
        luaL_newmetatable(L, name);
        for (auto& e : mm) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); }
        lua_pushstring(L, name); lua_setfield(L, -2, "__type");
        lua_pop(L, 1);
    };
    meta(UDIM_MT, { { "__index", udim_index }, { "__newindex", ro_newindex }, { "__add", udim_add }, { "__sub", udim_sub }, { "__eq", udim_eq }, { "__tostring", udim_tostring } });
    meta(UDIM2_MT, { { "__index", udim2_index }, { "__newindex", ro_newindex }, { "__add", udim2_add }, { "__sub", udim2_sub }, { "__eq", udim2_eq }, { "__tostring", udim2_tostring } });
    meta(VEC2_MT, { { "__index", vec2_index }, { "__newindex", ro_newindex }, { "__add", vec2_add }, { "__sub", vec2_sub }, { "__mul", vec2_mul }, { "__div", vec2_div },
                    { "__unm", vec2_unm }, { "__eq", vec2_eq }, { "__tostring", vec2_tostring } });
    lua_newtable(L);
    lua_pushcfunction(L, udim_new, "new"); lua_setfield(L, -2, "new");
    lua_setglobal(L, "UDim");
    lua_newtable(L);
    lua_pushcfunction(L, udim2_new, "new"); lua_setfield(L, -2, "new");
    lua_pushcfunction(L, udim2_fromScale, "fromScale"); lua_setfield(L, -2, "fromScale");
    lua_pushcfunction(L, udim2_fromOffset, "fromOffset"); lua_setfield(L, -2, "fromOffset");
    lua_setglobal(L, "UDim2");
    lua_newtable(L);
    lua_pushcfunction(L, vec2_new, "new"); lua_setfield(L, -2, "new");
    push_vec2(L, 0, 0); lua_setfield(L, -2, "zero");
    push_vec2(L, 1, 1); lua_setfield(L, -2, "one");
    push_vec2(L, 1, 0); lua_setfield(L, -2, "xAxis");
    push_vec2(L, 0, 1); lua_setfield(L, -2, "yAxis");
    lua_setglobal(L, "Vector2");
}
