// NumberRange, NumberSequence(Keypoint) and ColorSequence(Keypoint), as Roblox's datatypes
// (creator-docs datatypes/*.yaml; mashup-research/ROBLOX_PARTICLES_2026-11-13.md). Immutable
// userdata; values are float32, as Roblox stores them. A sequence holds at most MAX_KP keypoints:
// at least two, non-descending in time, the first at 0 and the last at 1 (the error wording is
// ours: Roblox's isn't documented). tostring gives Roblox's serialised form (the API dump's
// defaults: "time value envelope " per keypoint; "time r g b 0 " for colours; "min max ").
// Included by binding.cpp after Color3.

static const char* NUMRANGE_MT = "NumberRange";
static const char* NSK_MT = "NumberSequenceKeypoint";
static const char* NUMSEQ_MT = "NumberSequence";
static const char* CSK_MT = "ColorSequenceKeypoint";
static const char* COLORSEQ_MT = "ColorSequence";
static const int MAX_KP = 20;
struct NR { float min, max; };
struct NSK { float t, v, e; };
struct NSeq { int n; NSK k[MAX_KP]; };
struct CSK { float t; Color c; };
struct CSeq { int n; CSK k[MAX_KP]; };

static void push_numrange(lua_State* L, double a, double b) {
    NR* r = (NR*)lua_newuserdata(L, sizeof(NR)); r->min = (float)a; r->max = (float)b;
    luaL_getmetatable(L, NUMRANGE_MT); lua_setmetatable(L, -2);
}
static void push_nsk(lua_State* L, double t, double v, double e) {
    NSK* k = (NSK*)lua_newuserdata(L, sizeof(NSK)); k->t = (float)t; k->v = (float)v; k->e = (float)e;
    luaL_getmetatable(L, NSK_MT); lua_setmetatable(L, -2);
}
static void push_csk(lua_State* L, double t, Color c) {
    CSK* k = (CSK*)lua_newuserdata(L, sizeof(CSK)); k->t = (float)t; k->c = c;
    luaL_getmetatable(L, CSK_MT); lua_setmetatable(L, -2);
}
static NSeq* new_numseq(lua_State* L) { NSeq* s = (NSeq*)lua_newuserdata(L, sizeof(NSeq)); s->n = 0; luaL_getmetatable(L, NUMSEQ_MT); lua_setmetatable(L, -2); return s; }
static CSeq* new_colorseq(lua_State* L) { CSeq* s = (CSeq*)lua_newuserdata(L, sizeof(CSeq)); s->n = 0; luaL_getmetatable(L, COLORSEQ_MT); lua_setmetatable(L, -2); return s; }

// The rules every sequence keeps (times only).
template <class K> static void check_times(lua_State* L, const K* k, int n, const char* type) {
    if (n < 2) luaL_error(L, "%s requires at least 2 keypoints", type);
    if (n > MAX_KP) luaL_error(L, "%s supports at most %d keypoints", type, MAX_KP);
    if (k[0].t != 0.f || k[n - 1].t != 1.f) luaL_error(L, "%s time must start at 0 and end at 1", type);
    for (int i = 1; i < n; i++) if (k[i].t < k[i - 1].t) luaL_error(L, "%s keypoints must be in non-descending time order", type);
}

// ---- NumberRange
static int numrange_new(lua_State* L) {
    double a = luaL_checknumber(L, 1), b = lua_isnoneornil(L, 2) ? a : luaL_checknumber(L, 2);
    if (a > b) luaL_error(L, "NumberRange: invalid range (min must be less than or equal to max)");
    push_numrange(L, a, b); return 1;
}
static int numrange_index(lua_State* L) {
    NR* r = check_ud<NR>(L, 1, NUMRANGE_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Min")) { lua_pushnumber(L, r->min); return 1; }
    if (!strcmp(k, "Max")) { lua_pushnumber(L, r->max); return 1; }
    luaL_error(L, "%s is not a valid member of NumberRange", k); return 0;
}
static int numrange_eq(lua_State* L) { NR* a = to_ud<NR>(L, 1, NUMRANGE_MT); NR* b = to_ud<NR>(L, 2, NUMRANGE_MT); lua_pushboolean(L, a && b && a->min == b->min && a->max == b->max); return 1; }
static int numrange_tostring(lua_State* L) { NR* r = check_ud<NR>(L, 1, NUMRANGE_MT); std::string s = fmt_num(r->min) + " " + fmt_num(r->max) + " "; lua_pushstring(L, s.c_str()); return 1; }

// ---- NumberSequenceKeypoint
static int nsk_new(lua_State* L) {
    double t = luaL_checknumber(L, 1), v = luaL_checknumber(L, 2), e = luaL_optnumber(L, 3, 0);
    if (e < 0) luaL_error(L, "NumberSequenceKeypoint envelope must be non-negative");
    push_nsk(L, t, v, e); return 1;
}
static int nsk_index(lua_State* L) {
    NSK* k = check_ud<NSK>(L, 1, NSK_MT); const char* f = luaL_checkstring(L, 2);
    if (!strcmp(f, "Time")) { lua_pushnumber(L, k->t); return 1; }
    if (!strcmp(f, "Value")) { lua_pushnumber(L, k->v); return 1; }
    if (!strcmp(f, "Envelope")) { lua_pushnumber(L, k->e); return 1; }
    luaL_error(L, "%s is not a valid member of NumberSequenceKeypoint", f); return 0;
}
static int nsk_eq(lua_State* L) { NSK* a = to_ud<NSK>(L, 1, NSK_MT); NSK* b = to_ud<NSK>(L, 2, NSK_MT); lua_pushboolean(L, a && b && a->t == b->t && a->v == b->v && a->e == b->e); return 1; }
static int nsk_tostring(lua_State* L) { NSK* k = check_ud<NSK>(L, 1, NSK_MT); std::string s = fmt_num(k->t) + " " + fmt_num(k->v) + " " + fmt_num(k->e) + " "; lua_pushstring(L, s.c_str()); return 1; }

// ---- NumberSequence: new(n), new(n0, n1), new{keypoints}
static int numseq_new(lua_State* L) {
    if (lua_istable(L, 1)) {
        int n = (int)lua_objlen(L, 1);
        NSK tmp[MAX_KP + 1];
        if (n > MAX_KP) luaL_error(L, "NumberSequence supports at most %d keypoints", MAX_KP);
        for (int i = 0; i < n; i++) { lua_rawgeti(L, 1, i + 1); tmp[i] = *check_ud<NSK>(L, -1, NSK_MT); lua_pop(L, 1); }
        check_times(L, tmp, n, "NumberSequence");
        NSeq* s = new_numseq(L); s->n = n; for (int i = 0; i < n; i++) s->k[i] = tmp[i];
        return 1;
    }
    double a = luaL_checknumber(L, 1), b = lua_isnoneornil(L, 2) ? a : luaL_checknumber(L, 2);
    NSeq* s = new_numseq(L); s->n = 2; s->k[0] = { 0.f, (float)a, 0.f }; s->k[1] = { 1.f, (float)b, 0.f };
    return 1;
}
static int numseq_index(lua_State* L) {
    NSeq* s = check_ud<NSeq>(L, 1, NUMSEQ_MT); const char* f = luaL_checkstring(L, 2);
    if (!strcmp(f, "Keypoints")) { lua_createtable(L, s->n, 0); for (int i = 0; i < s->n; i++) { push_nsk(L, s->k[i].t, s->k[i].v, s->k[i].e); lua_rawseti(L, -2, i + 1); } return 1; }
    luaL_error(L, "%s is not a valid member of NumberSequence", f); return 0;
}
static int numseq_eq(lua_State* L) {
    NSeq* a = to_ud<NSeq>(L, 1, NUMSEQ_MT); NSeq* b = to_ud<NSeq>(L, 2, NUMSEQ_MT);
    bool eq = a && b && a->n == b->n;
    for (int i = 0; eq && i < a->n; i++) eq = a->k[i].t == b->k[i].t && a->k[i].v == b->k[i].v && a->k[i].e == b->k[i].e;
    lua_pushboolean(L, eq); return 1;
}
static std::string numseq_str(const NSeq* s) { std::string o; for (int i = 0; i < s->n; i++) o += fmt_num(s->k[i].t) + " " + fmt_num(s->k[i].v) + " " + fmt_num(s->k[i].e) + " "; return o; }
static int numseq_tostring(lua_State* L) { lua_pushstring(L, numseq_str(check_ud<NSeq>(L, 1, NUMSEQ_MT)).c_str()); return 1; }
// From the engine's serialised form ("t v e " repeated).
static void push_numseq_str(lua_State* L, const char* str) {
    NSeq* s = new_numseq(L); const char* p = str; char* end;
    while (s->n < MAX_KP) {
        double t = strtod(p, &end); if (end == p) break; p = end;
        double v = strtod(p, &end); if (end == p) break; p = end;
        double e = strtod(p, &end); if (end == p) break; p = end;
        s->k[s->n++] = { (float)t, (float)v, (float)e };
    }
}

// ---- ColorSequenceKeypoint
static int csk_new(lua_State* L) { double t = luaL_checknumber(L, 1); Color c = *check_color(L, 2); push_csk(L, t, c); return 1; }
static int csk_index(lua_State* L) {
    CSK* k = check_ud<CSK>(L, 1, CSK_MT); const char* f = luaL_checkstring(L, 2);
    if (!strcmp(f, "Time")) { lua_pushnumber(L, k->t); return 1; }
    if (!strcmp(f, "Value")) { push_color(L, k->c.r, k->c.g, k->c.b); return 1; }
    luaL_error(L, "%s is not a valid member of ColorSequenceKeypoint", f); return 0;
}
static int csk_eq(lua_State* L) { CSK* a = to_ud<CSK>(L, 1, CSK_MT); CSK* b = to_ud<CSK>(L, 2, CSK_MT); lua_pushboolean(L, a && b && a->t == b->t && a->c.r == b->c.r && a->c.g == b->c.g && a->c.b == b->c.b); return 1; }
static int csk_tostring(lua_State* L) { CSK* k = check_ud<CSK>(L, 1, CSK_MT); std::string s = fmt_num(k->t) + " " + fmt_num(k->c.r) + " " + fmt_num(k->c.g) + " " + fmt_num(k->c.b) + " 0 "; lua_pushstring(L, s.c_str()); return 1; }

// ---- ColorSequence: new(c), new(c0, c1), new{keypoints}
static int colorseq_new(lua_State* L) {
    if (lua_istable(L, 1)) {
        int n = (int)lua_objlen(L, 1);
        CSK tmp[MAX_KP + 1];
        if (n > MAX_KP) luaL_error(L, "ColorSequence supports at most %d keypoints", MAX_KP);
        for (int i = 0; i < n; i++) { lua_rawgeti(L, 1, i + 1); tmp[i] = *check_ud<CSK>(L, -1, CSK_MT); lua_pop(L, 1); }
        check_times(L, tmp, n, "ColorSequence");
        CSeq* s = new_colorseq(L); s->n = n; for (int i = 0; i < n; i++) s->k[i] = tmp[i];
        return 1;
    }
    Color a = *check_color(L, 1), b = lua_isnoneornil(L, 2) ? a : *check_color(L, 2);
    CSeq* s = new_colorseq(L); s->n = 2; s->k[0] = { 0.f, a }; s->k[1] = { 1.f, b };
    return 1;
}
static int colorseq_index(lua_State* L) {
    CSeq* s = check_ud<CSeq>(L, 1, COLORSEQ_MT); const char* f = luaL_checkstring(L, 2);
    if (!strcmp(f, "Keypoints")) { lua_createtable(L, s->n, 0); for (int i = 0; i < s->n; i++) { push_csk(L, s->k[i].t, s->k[i].c); lua_rawseti(L, -2, i + 1); } return 1; }
    luaL_error(L, "%s is not a valid member of ColorSequence", f); return 0;
}
static int colorseq_eq(lua_State* L) {
    CSeq* a = to_ud<CSeq>(L, 1, COLORSEQ_MT); CSeq* b = to_ud<CSeq>(L, 2, COLORSEQ_MT);
    bool eq = a && b && a->n == b->n;
    for (int i = 0; eq && i < a->n; i++) eq = a->k[i].t == b->k[i].t && a->k[i].c.r == b->k[i].c.r && a->k[i].c.g == b->k[i].c.g && a->k[i].c.b == b->k[i].c.b;
    lua_pushboolean(L, eq); return 1;
}
static std::string colorseq_str(const CSeq* s) { std::string o; for (int i = 0; i < s->n; i++) o += fmt_num(s->k[i].t) + " " + fmt_num(s->k[i].c.r) + " " + fmt_num(s->k[i].c.g) + " " + fmt_num(s->k[i].c.b) + " 0 "; return o; }
static int colorseq_tostring(lua_State* L) { lua_pushstring(L, colorseq_str(check_ud<CSeq>(L, 1, COLORSEQ_MT)).c_str()); return 1; }
static void push_colorseq_str(lua_State* L, const char* str) {
    CSeq* s = new_colorseq(L); const char* p = str; char* end;
    while (s->n < MAX_KP) {
        double v[5]; int i = 0;
        for (; i < 5; i++) { v[i] = strtod(p, &end); if (end == p) break; p = end; }
        if (i < 5) break;
        s->k[s->n++] = { (float)v[0], { (float)v[1], (float)v[2], (float)v[3] } };
    }
}

static void register_seq_types(lua_State* L) {
    struct MM { const char* k; lua_CFunction f; };
    auto meta = [&](const char* name, std::initializer_list<MM> mm) {
        luaL_newmetatable(L, name);
        for (auto& e : mm) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); }
        lua_pushstring(L, name); lua_setfield(L, -2, "__type");
        lua_pop(L, 1);
    };
    meta(NUMRANGE_MT, { { "__index", numrange_index }, { "__newindex", ro_newindex }, { "__eq", numrange_eq }, { "__tostring", numrange_tostring } });
    meta(NSK_MT, { { "__index", nsk_index }, { "__newindex", ro_newindex }, { "__eq", nsk_eq }, { "__tostring", nsk_tostring } });
    meta(NUMSEQ_MT, { { "__index", numseq_index }, { "__newindex", ro_newindex }, { "__eq", numseq_eq }, { "__tostring", numseq_tostring } });
    meta(CSK_MT, { { "__index", csk_index }, { "__newindex", ro_newindex }, { "__eq", csk_eq }, { "__tostring", csk_tostring } });
    meta(COLORSEQ_MT, { { "__index", colorseq_index }, { "__newindex", ro_newindex }, { "__eq", colorseq_eq }, { "__tostring", colorseq_tostring } });
    struct G { const char* name; lua_CFunction f; } globals[] = {
        { "NumberRange", numrange_new }, { "NumberSequenceKeypoint", nsk_new }, { "NumberSequence", numseq_new },
        { "ColorSequenceKeypoint", csk_new }, { "ColorSequence", colorseq_new },
    };
    for (auto& g : globals) { lua_newtable(L); lua_pushcfunction(L, g.f, "new"); lua_setfield(L, -2, "new"); lua_setglobal(L, g.name); }
}
