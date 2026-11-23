// More of Roblox's datatypes and members, from creator-docs (datatypes/*.yaml):
// - BrickColor: Roblox's named colours (the table is brickcolor_table.h, generated from the docs by
//   tools/gen-brickcolors.mjs). new(number), new(name), new(r, g, b) and new(Color3) (the nearest
//   colour: the smallest sum of per-channel differences, as the docs say; the first on a tie),
//   palette(i), random(), White/Gray/DarkGray/Black/Red/Yellow/Green/Blue; Number, Name, r, g, b, Color.
//   An unknown number or name gives "Medium stone grey" (the docs). Crosses to JS by its Number.
// - Rect: new(), new(min, max), new(x0, y0, x1, y1) (normalised so Min <= Max); Min, Max, Width, Height.
// - Region3: new(min, max) (not normalised: a negative volume is allowed); CFrame, Size, ExpandToGrid.
// - Color3: GetLuminance (WCAG 2.1 relative luminance of the clamped sRGB colour), GetContrastRatio,
//   GetContrastingColor(...) (black or white by default; the first on a tie).
// - Vector3.FromNormalId, Vector3.FromAxis.
// - CFrame: lookAlong, fromRotationBetweenVectors, fromEulerAngles(rx, ry, rz, order),
//   :ToEulerAngles(order), :AngleBetween(other).
// - Font: Roblox's font datatype (see its section below).
// Included by binding.cpp after Color3, CFrame, Vector2 and EnumItem.
#include "brickcolor_table.h"

static const char* BRICKCOLOR_MT = "BrickColor";
static const char* RECT_MT = "Rect";
static const char* REGION3_MT = "Region3";
struct BC { int i; }; // an index into BRICKCOLORS
struct RectV { float x0, y0, x1, y1; };
struct Reg3 { float mn[3], mx[3]; };

// ------------------------------------------------------------------ BrickColor
static int bc_of_number(int n) { for (int i = 0; i < BRICKCOLOR_COUNT; i++) if (BRICKCOLORS[i].number == n) return i; return -1; }
static int bc_default() { return bc_of_number(194); } // Medium stone grey
static int bc_of_name(const char* s) { for (int i = 0; i < BRICKCOLOR_COUNT; i++) if (!strcmp(BRICKCOLORS[i].name, s)) return i; return -1; }
static int bc_nearest(double r, double g, double b) {
    int best = 0; double bd = 1e300;
    for (int i = 0; i < BRICKCOLOR_COUNT; i++) {
        const BrickColorEntry& e = BRICKCOLORS[i];
        double d = std::fabs(r - e.r / 255.0) + std::fabs(g - e.g / 255.0) + std::fabs(b - e.b / 255.0);
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}
static int bc_of_palette(int p) { for (int i = 0; i < BRICKCOLOR_COUNT; i++) if (BRICKCOLORS[i].palette == p) return i; return -1; }
static void push_bc(lua_State* L, int i) {
    BC* c = (BC*)lua_newuserdata(L, sizeof(BC)); c->i = i < 0 ? bc_default() : i;
    luaL_getmetatable(L, BRICKCOLOR_MT); lua_setmetatable(L, -2);
}
static BC* to_bc(lua_State* L, int idx) { return to_ud<BC>(L, idx, BRICKCOLOR_MT); }
static int bc_new(lua_State* L) {
    int n = lua_gettop(L);
    if (n >= 3 && lua_isnumber(L, 1) && lua_isnumber(L, 2) && lua_isnumber(L, 3)) { push_bc(L, bc_nearest(lua_tonumber(L, 1), lua_tonumber(L, 2), lua_tonumber(L, 3))); return 1; }
    if (n >= 1 && lua_type(L, 1) == LUA_TNUMBER) { push_bc(L, bc_of_number((int)lua_tonumber(L, 1))); return 1; }
    if (n >= 1 && lua_type(L, 1) == LUA_TSTRING) { push_bc(L, bc_of_name(lua_tostring(L, 1))); return 1; }
    if (Color* c = n >= 1 ? to_color(L, 1) : nullptr) { push_bc(L, bc_nearest(c->r, c->g, c->b)); return 1; }
    luaL_error(L, "invalid argument #1 to 'new' (number, string, Color3 or r, g, b expected)");
    return 0;
}
static int bc_palette(lua_State* L) {
    int p = luaL_checkinteger(L, 1), i = bc_of_palette(p);
    if (i < 0) luaL_error(L, "invalid argument #1 to 'palette' (index %d out of range 0 to 127)", p);
    push_bc(L, i); return 1;
}
static int bc_random(lua_State* L) { push_bc(L, bc_of_palette((int)(emscripten_random() * 128) & 127)); return 1; }
#define BC_NAMED(fn, number) static int fn(lua_State* L) { push_bc(L, bc_of_number(number)); return 1; }
BC_NAMED(bc_white, 1) BC_NAMED(bc_gray, 194) BC_NAMED(bc_darkgray, 199) BC_NAMED(bc_black, 26)
BC_NAMED(bc_red, 21) BC_NAMED(bc_yellow, 24) BC_NAMED(bc_green, 28) BC_NAMED(bc_blue, 23)
static int bc_index(lua_State* L) {
    BC* c = to_bc(L, 1); if (!c) luaL_typeerror(L, 1, "BrickColor");
    const BrickColorEntry& e = BRICKCOLORS[c->i];
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Number")) { lua_pushinteger(L, e.number); return 1; }
    if (!strcmp(k, "Name")) { lua_pushstring(L, e.name); return 1; }
    if (!strcmp(k, "r")) { lua_pushnumber(L, e.r / 255.0); return 1; }
    if (!strcmp(k, "g")) { lua_pushnumber(L, e.g / 255.0); return 1; }
    if (!strcmp(k, "b")) { lua_pushnumber(L, e.b / 255.0); return 1; }
    if (!strcmp(k, "Color")) { push_color(L, e.r / 255.0, e.g / 255.0, e.b / 255.0); return 1; }
    luaL_error(L, "%s is not a valid member of BrickColor", k); return 0;
}
static int bc_eq(lua_State* L) { BC* a = to_bc(L, 1); BC* b = to_bc(L, 2); lua_pushboolean(L, a && b && BRICKCOLORS[a->i].number == BRICKCOLORS[b->i].number); return 1; }
static int bc_tostring(lua_State* L) { BC* c = to_bc(L, 1); if (!c) luaL_typeerror(L, 1, "BrickColor"); lua_pushstring(L, BRICKCOLORS[c->i].name); return 1; }

// ------------------------------------------------------------------ Rect
static void push_rect(lua_State* L, double a, double b, double c, double d) {
    RectV* r = (RectV*)lua_newuserdata(L, sizeof(RectV));
    r->x0 = (float)std::fmin(a, c); r->y0 = (float)std::fmin(b, d); r->x1 = (float)std::fmax(a, c); r->y1 = (float)std::fmax(b, d);
    luaL_getmetatable(L, RECT_MT); lua_setmetatable(L, -2);
}
static int rect_new(lua_State* L) {
    int n = lua_gettop(L);
    if (n == 0) { push_rect(L, 0, 0, 0, 0); return 1; }
    V2* a = to_ud<V2>(L, 1, VEC2_MT);
    if (a) { V2* b = check_ud<V2>(L, 2, VEC2_MT); push_rect(L, a->x, a->y, b->x, b->y); return 1; }
    push_rect(L, luaL_checknumber(L, 1), luaL_checknumber(L, 2), luaL_checknumber(L, 3), luaL_checknumber(L, 4)); return 1;
}
static int rect_index(lua_State* L) {
    RectV* r = check_ud<RectV>(L, 1, RECT_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Min")) { push_vec2(L, r->x0, r->y0); return 1; }
    if (!strcmp(k, "Max")) { push_vec2(L, r->x1, r->y1); return 1; }
    if (!strcmp(k, "Width")) { lua_pushnumber(L, (double)r->x1 - r->x0); return 1; }
    if (!strcmp(k, "Height")) { lua_pushnumber(L, (double)r->y1 - r->y0); return 1; }
    luaL_error(L, "%s is not a valid member of Rect", k); return 0;
}
static int rect_eq(lua_State* L) { RectV* a = to_ud<RectV>(L, 1, RECT_MT); RectV* b = to_ud<RectV>(L, 2, RECT_MT); lua_pushboolean(L, a && b && !memcmp(a, b, sizeof *a)); return 1; }
static int rect_tostring(lua_State* L) { RectV* r = check_ud<RectV>(L, 1, RECT_MT); std::string s = fmt_num(r->x0) + ", " + fmt_num(r->y0) + ", " + fmt_num(r->x1) + ", " + fmt_num(r->y1); lua_pushstring(L, s.c_str()); return 1; }

// ------------------------------------------------------------------ Region3
static void push_region3(lua_State* L, const double* mn, const double* mx) {
    Reg3* r = (Reg3*)lua_newuserdata(L, sizeof(Reg3));
    for (int k = 0; k < 3; k++) { r->mn[k] = (float)mn[k]; r->mx[k] = (float)mx[k]; }
    luaL_getmetatable(L, REGION3_MT); lua_setmetatable(L, -2);
}
static int region3_new(lua_State* L) { double a[3], b[3]; check_v3(L, 1, a); check_v3(L, 2, b); push_region3(L, a, b); return 1; }
static int region3_expand(lua_State* L) {
    Reg3* r = check_ud<Reg3>(L, 1, REGION3_MT); double res = luaL_checknumber(L, 2);
    if (!(res > 0)) luaL_error(L, "invalid argument #1 to 'ExpandToGrid' (resolution must be positive)");
    double a[3], b[3];
    for (int k = 0; k < 3; k++) { a[k] = std::floor(r->mn[k] / res) * res; b[k] = std::ceil(r->mx[k] / res) * res; }
    push_region3(L, a, b); return 1;
}
static int region3_index(lua_State* L) {
    Reg3* r = check_ud<Reg3>(L, 1, REGION3_MT); const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "CFrame")) { double m[12]; cf_identity(m); for (int i = 0; i < 3; i++) m[i] = ((double)r->mn[i] + r->mx[i]) / 2; push_cf(L, m); return 1; }
    if (!strcmp(k, "Size")) { push_v3(L, (double)r->mx[0] - r->mn[0], (double)r->mx[1] - r->mn[1], (double)r->mx[2] - r->mn[2]); return 1; }
    if (!strcmp(k, "ExpandToGrid")) { lua_pushcfunction(L, region3_expand, "ExpandToGrid"); return 1; }
    luaL_error(L, "%s is not a valid member of Region3", k); return 0;
}
// Roblox's own text for a Region3 isn't documented: its CFrame's, then its Size's.
static int region3_tostring(lua_State* L) {
    Reg3* r = check_ud<Reg3>(L, 1, REGION3_MT); std::string s;
    for (int k = 0; k < 3; k++) s += (k ? ", " : "") + fmt_num(((double)r->mn[k] + r->mx[k]) / 2);
    s += ", 1, 0, 0, 0, 1, 0, 0, 0, 1; ";
    for (int k = 0; k < 3; k++) s += (k ? ", " : "") + fmt_num((double)r->mx[k] - r->mn[k]);
    lua_pushstring(L, s.c_str()); return 1;
}

// ------------------------------------------------------------------ Color3: luminance and contrast (WCAG 2.1)
static double srgb_linear(double c) { c = c < 0 ? 0 : c > 1 ? 1 : c; return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4); }
static double luminance(const Color* c) { return 0.2126 * srgb_linear(c->r) + 0.7152 * srgb_linear(c->g) + 0.0722 * srgb_linear(c->b); }
static double contrast(const Color* a, const Color* b) { double la = luminance(a), lb = luminance(b); return (std::fmax(la, lb) + 0.05) / (std::fmin(la, lb) + 0.05); }
static int color_getLuminance(lua_State* L) { lua_pushnumber(L, luminance(check_color(L, 1))); return 1; }
static int color_getContrastRatio(lua_State* L) { lua_pushnumber(L, contrast(check_color(L, 1), check_color(L, 2))); return 1; }
static int color_getContrastingColor(lua_State* L) {
    Color* self = check_color(L, 1); int n = lua_gettop(L);
    if (n < 2) { // black, then white: a tie goes to black
        Color black = { 0, 0, 0 }, white = { 1, 1, 1 };
        if (contrast(self, &white) > contrast(self, &black)) push_color(L, 1, 1, 1); else push_color(L, 0, 0, 0);
        return 1;
    }
    int best = 2; double bd = -1;
    for (int i = 2; i <= n; i++) { double d = contrast(self, check_color(L, i)); if (d > bd) { bd = d; best = i; } }
    lua_pushvalue(L, best); return 1;
}

// ------------------------------------------------------------------ Vector3.FromNormalId, FromAxis
// An enum argument: an EnumItem of `type`, its name, or its value (values from the DataModel's ENUMS).
static std::string enum_arg(lua_State* L, int idx, const char* type) {
    if (EnumItem* e = to_enum(L, idx)) { if (strcmp(e->type, type)) luaL_error(L, "invalid argument #%d (Enum.%s expected, got Enum.%s)", idx, type, e->type); return e->name; }
    if (lua_type(L, idx) == LUA_TSTRING) return lua_tostring(L, idx);
    if (lua_type(L, idx) == LUA_TNUMBER) {
        int v = (int)lua_tonumber(L, idx), n = js_enum_items(type);
        for (int i = 0; i < n; i++) if ((int)js_ret_num(i) == v) { char* s = js_ret_str(i); std::string full = s ? s : ""; free(s); return full.substr(full.find('.') + 1); }
    }
    luaL_error(L, "invalid argument #%d (Enum.%s expected)", idx, type);
    return "";
}
static int vec_fromNormalId(lua_State* L) {
    std::string n = enum_arg(L, 1, "NormalId");
    static const struct { const char* n; float x, y, z; } N[] = { { "Right", 1, 0, 0 }, { "Top", 0, 1, 0 }, { "Back", 0, 0, 1 }, { "Left", -1, 0, 0 }, { "Bottom", 0, -1, 0 }, { "Front", 0, 0, -1 } };
    for (auto& e : N) if (n == e.n) { lua_pushvector(L, e.x, e.y, e.z); return 1; }
    luaL_error(L, "invalid argument #1 to 'FromNormalId' (%s is not a NormalId)", n.c_str()); return 0;
}
static int vec_fromAxis(lua_State* L) {
    std::string n = enum_arg(L, 1, "Axis");
    if (n == "X") lua_pushvector(L, 1, 0, 0); else if (n == "Y") lua_pushvector(L, 0, 1, 0); else if (n == "Z") lua_pushvector(L, 0, 0, 1);
    else luaL_error(L, "invalid argument #1 to 'FromAxis' (%s is not an Axis)", n.c_str());
    return 1;
}

// ------------------------------------------------------------------ CFrame: rotation orders and the rest
#define R(m, r, c) (m)[3 + (r) * 3 + (c)]
// Enum.RotationOrder's name (default XYZ): the order the rotations multiply, e.g. YXZ = Ry * Rx * Rz.
static std::string rotation_order(lua_State* L, int idx) {
    if (lua_isnoneornil(L, idx)) return "XYZ";
    std::string o = enum_arg(L, idx, "RotationOrder");
    if (o.size() != 3 || o.find('X') == std::string::npos || o.find('Y') == std::string::npos || o.find('Z') == std::string::npos) luaL_error(L, "%s is not a RotationOrder", o.c_str());
    return o;
}
static void euler_order(const double* a, const std::string& o, double* m) { // a: angles about X, Y, Z
    double t[12];
    cf_identity(m);
    for (char ax : o) { if (ax == 'X') rot_x(a[0], t); else if (ax == 'Y') rot_y(a[1], t); else rot_z(a[2], t); cf_mul(m, t, m); }
}
// R = R_i(a_i) R_j(a_j) R_k(a_k), order (i, j, k). With P the permutation taking axis i to X, j to Y
// and k to Z, P R P^T = Rx(s a_i) Ry(s a_j) Rz(s a_k), s = det P (an odd order reverses the angles), so
// the XYZ decomposition of the permuted matrix gives them.
static void to_euler_order(const double* m, const std::string& o, double* out) {
    int p[3] = { o[0] - 'X', o[1] - 'X', o[2] - 'X' };
    double q[12], e[3];
    cf_identity(q);
    for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++) R(q, r, c) = R(m, p[r], p[c]);
    to_xyz(q, e);
    double s = (p[0] == 0 && p[1] == 1) || (p[0] == 1 && p[1] == 2) || (p[0] == 2 && p[1] == 0) ? 1 : -1; // even permutations
    for (int k = 0; k < 3; k++) out[p[k]] = s * e[k];
}
static int cf_fromEulerAngles(lua_State* L) {
    double a[3] = { luaL_checknumber(L, 1), luaL_checknumber(L, 2), luaL_checknumber(L, 3) }, m[12];
    euler_order(a, rotation_order(L, 4), m); push_cf(L, m); return 1;
}
static int cf_m_toEulerAngles(lua_State* L) {
    double m[12], e[3]; check_cf(L, 1, m); to_euler_order(m, rotation_order(L, 2), e);
    for (int k = 0; k < 3; k++) lua_pushnumber(L, e[k]);
    return 3;
}
static int cf_m_angleBetween(lua_State* L) {
    double a[12], b[12], inv[12], rel[12], q[4]; check_cf(L, 1, a); check_cf(L, 2, b);
    cf_inverse(a, inv); cf_mul(inv, b, rel); to_quat(rel, q);
    double w = std::fabs(q[3]) / std::sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    lua_pushnumber(L, 2 * std::acos(w > 1 ? 1 : w)); return 1;
}
static int cf_lookAlong(lua_State* L) {
    double at[3], dir[3], up[3] = { 0, 1, 0 }, tg[3], m[12];
    check_v3(L, 1, at); check_v3(L, 2, dir);
    if (lua_isvector(L, 3)) check_v3(L, 3, up);
    for (int k = 0; k < 3; k++) tg[k] = at[k] + dir[k];
    look_at(at, tg, up, m); push_cf(L, m); return 1;
}
// The shortest arc from `from` to `to`. Opposite vectors: half a turn about an axis perpendicular to
// `from` (which one Roblox picks isn't documented).
static int cf_fromRotationBetweenVectors(lua_State* L) {
    double f[3], t[3], ax[3], m[12];
    check_v3(L, 1, f); check_v3(L, 2, t); unit(f); unit(t);
    cross(f, t, ax);
    double s = std::sqrt(ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2]), c = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
    if (s < 1e-9) {
        if (c > 0) { cf_identity(m); push_cf(L, m); return 1; }
        double x[3] = { 1, 0, 0 }, y[3] = { 0, 1, 0 };
        cross(f, std::fabs(f[0]) < 0.9 ? x : y, ax);
        axis_angle(ax, M_PI, m); push_cf(L, m); return 1;
    }
    axis_angle(ax, std::atan2(s, c), m); push_cf(L, m); return 1;
}
#undef R

// ------------------------------------------------------------------ Font
// Roblox's Font datatype (creator-docs datatypes/Font.yaml): a family (an rbxasset:// or rbxassetid://
// id), a FontWeight and a FontStyle. Font.new(family, weight?, style?), Font.fromEnum(Enum.Font) (the
// DataModel's table, web/fonts.js: one table for the VM, the properties and the GUI; Enum.Font.Unknown
// errors, as the docs say), Font.fromName(name, weight?, style?) (letters, digits, _ and - only, made
// rbxasset://fonts/families/<name>.json), Font.fromId(id, weight?, style?). Family, Weight, Style and
// Bold read and write: setting Weight sets Bold (SemiBold or thicker), setting Bold sets Weight Bold or
// Regular (the docs). A mutable value, as Roblox's is: a FontFace read from a label is a copy.
// OURS: tostring's form; whether Roblox lets Family be set (here it can).
static const char* FONT_MT = "Font";
struct FontV { int weight, style; char family[240]; };
static const struct { const char* name; int value; } FONT_WEIGHT_ITEMS[] = {
    { "Thin", 100 }, { "ExtraLight", 200 }, { "Light", 300 }, { "Regular", 400 }, { "Medium", 500 }, { "SemiBold", 600 }, { "Bold", 700 }, { "ExtraBold", 800 }, { "Heavy", 900 } };
static const char* font_weight_name(int w) { for (auto& e : FONT_WEIGHT_ITEMS) if (e.value == w) return e.name; return "Regular"; }
static void push_font(lua_State* L, const char* family, int weight, int style) {
    FontV* f = (FontV*)lua_newuserdata(L, sizeof(FontV));
    f->weight = weight; f->style = style;
    strncpy(f->family, family, sizeof f->family - 1); f->family[sizeof f->family - 1] = 0;
    luaL_getmetatable(L, FONT_MT); lua_setmetatable(L, -2);
}
static FontV* to_font(lua_State* L, int idx) { return to_ud<FontV>(L, idx, FONT_MT); }
// An Enum.FontWeight argument (an item, its name or its value), or `def` when absent.
static int font_weight_arg(lua_State* L, int idx, int def) {
    if (lua_isnoneornil(L, idx)) return def;
    std::string n = enum_arg(L, idx, "FontWeight");
    for (auto& e : FONT_WEIGHT_ITEMS) if (n == e.name) return e.value;
    luaL_error(L, "invalid argument #%d (%s is not a FontWeight)", idx, n.c_str()); return def;
}
static int font_style_arg(lua_State* L, int idx, int def) {
    if (lua_isnoneornil(L, idx)) return def;
    std::string n = enum_arg(L, idx, "FontStyle");
    if (n == "Normal") return 0;
    if (n == "Italic") return 1;
    luaL_error(L, "invalid argument #%d (%s is not a FontStyle)", idx, n.c_str()); return def;
}
static int font_new(lua_State* L) {
    const char* fam = luaL_checkstring(L, 1);
    push_font(L, fam, font_weight_arg(L, 2, 400), font_style_arg(L, 3, 0)); return 1;
}
static int font_fromName(lua_State* L) {
    const char* n = luaL_checkstring(L, 1);
    if (!*n) luaL_error(L, "invalid argument #1 to 'fromName' (the name is empty)");
    for (const char* c = n; *c; c++) if (!(isalnum((unsigned char)*c) || *c == '_' || *c == '-')) luaL_error(L, "invalid argument #1 to 'fromName' (a name may only contain letters, digits, _ and -)");
    std::string fam = std::string("rbxasset://fonts/families/") + n + ".json";
    push_font(L, fam.c_str(), font_weight_arg(L, 2, 400), font_style_arg(L, 3, 0)); return 1;
}
static int font_fromId(lua_State* L) {
    double id = luaL_checknumber(L, 1);
    std::string fam = "rbxassetid://" + fmt_num(std::floor(id));
    push_font(L, fam.c_str(), font_weight_arg(L, 2, 400), font_style_arg(L, 3, 0)); return 1;
}
static int push_ret(lua_State* L, int i, int self, const char* key);
EM_JS(int, js_font_from_enum, (const char* name), { return Module.studio.fontFromEnum(UTF8ToString(name)); });
static int font_fromEnum(lua_State* L) {
    EnumItem* e = to_enum(L, 1);
    if (!e || strcmp(e->type, "Font")) luaL_error(L, "invalid argument #1 to 'fromEnum' (Enum.Font expected)");
    if (!strcmp(e->name, "Unknown")) luaL_error(L, "invalid argument #1 to 'fromEnum' (Enum.Font.Unknown has no font)");
    if (!js_font_from_enum(e->name)) luaL_error(L, "invalid argument #1 to 'fromEnum' (no font for Enum.Font.%s)", e->name);
    push_ret(L, 0, 0, ""); return 1;
}
static int font_index(lua_State* L) {
    FontV* f = to_font(L, 1); if (!f) luaL_typeerror(L, 1, "Font");
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Family")) { lua_pushstring(L, f->family); return 1; }
    if (!strcmp(k, "Weight")) { push_enum(L, "FontWeight", font_weight_name(f->weight), f->weight); return 1; }
    if (!strcmp(k, "Style")) { push_enum(L, "FontStyle", f->style ? "Italic" : "Normal", f->style); return 1; }
    if (!strcmp(k, "Bold")) { lua_pushboolean(L, f->weight >= 600); return 1; }
    luaL_error(L, "%s is not a valid member of Font", k); return 0;
}
static int font_newindex(lua_State* L) {
    FontV* f = to_font(L, 1); if (!f) luaL_typeerror(L, 1, "Font");
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Family")) { const char* s = luaL_checkstring(L, 3); strncpy(f->family, s, sizeof f->family - 1); f->family[sizeof f->family - 1] = 0; return 0; }
    if (!strcmp(k, "Weight")) { f->weight = font_weight_arg(L, 3, f->weight); return 0; }
    if (!strcmp(k, "Style")) { f->style = font_style_arg(L, 3, f->style); return 0; }
    if (!strcmp(k, "Bold")) { f->weight = lua_toboolean(L, 3) ? 700 : 400; return 0; }
    luaL_error(L, "%s is not a valid member of Font", k); return 0;
}
static int font_eq(lua_State* L) { FontV* a = to_font(L, 1); FontV* b = to_font(L, 2); lua_pushboolean(L, a && b && a->weight == b->weight && a->style == b->style && !strcmp(a->family, b->family)); return 1; }
static int font_tostring(lua_State* L) {
    FontV* f = to_font(L, 1); if (!f) luaL_typeerror(L, 1, "Font");
    std::string s = std::string("Font { Family = ") + f->family + ", Weight = " + font_weight_name(f->weight) + ", Style = " + (f->style ? "Italic" : "Normal") + " }";
    lua_pushstring(L, s.c_str()); return 1;
}

static void register_more_types(lua_State* L) {
    struct MM { const char* k; lua_CFunction f; };
    auto meta = [&](const char* name, std::initializer_list<MM> mm) {
        luaL_newmetatable(L, name);
        for (auto& e : mm) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); }
        lua_pushstring(L, name); lua_setfield(L, -2, "__type");
        lua_pop(L, 1);
    };
    auto fns = [&](std::initializer_list<MM> list) { for (auto& e : list) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); } };
    meta(BRICKCOLOR_MT, { { "__index", bc_index }, { "__newindex", ro_newindex }, { "__eq", bc_eq }, { "__tostring", bc_tostring } });
    meta(RECT_MT, { { "__index", rect_index }, { "__newindex", ro_newindex }, { "__eq", rect_eq }, { "__tostring", rect_tostring } });
    meta(REGION3_MT, { { "__index", region3_index }, { "__newindex", ro_newindex }, { "__tostring", region3_tostring } });
    meta(FONT_MT, { { "__index", font_index }, { "__newindex", font_newindex }, { "__eq", font_eq }, { "__tostring", font_tostring } });
    lua_newtable(L);
    fns({ { "new", bc_new }, { "palette", bc_palette }, { "random", bc_random }, { "White", bc_white }, { "Gray", bc_gray }, { "DarkGray", bc_darkgray },
          { "Black", bc_black }, { "Red", bc_red }, { "Yellow", bc_yellow }, { "Green", bc_green }, { "Blue", bc_blue } });
    lua_setglobal(L, "BrickColor");
    lua_newtable(L); fns({ { "new", rect_new } }); lua_setglobal(L, "Rect");
    lua_newtable(L); fns({ { "new", region3_new } }); lua_setglobal(L, "Region3");
    lua_newtable(L); fns({ { "new", font_new }, { "fromEnum", font_fromEnum }, { "fromName", font_fromName }, { "fromId", font_fromId } }); lua_setglobal(L, "Font");
    lua_getglobal(L, "Vector3"); fns({ { "FromNormalId", vec_fromNormalId }, { "FromAxis", vec_fromAxis } }); lua_pop(L, 1);
    lua_getglobal(L, "CFrame"); lua_setreadonly(L, -1, false);
    fns({ { "lookAlong", cf_lookAlong }, { "fromRotationBetweenVectors", cf_fromRotationBetweenVectors }, { "fromEulerAngles", cf_fromEulerAngles } });
    lua_setreadonly(L, -1, true); lua_pop(L, 1);
}
