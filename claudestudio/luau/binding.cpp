// Claude Studio's script host: Luau (MIT) compiled to WebAssembly.
//
// The Instance tree lives in JavaScript, next to the renderer and physics.
// Luau holds handles to it: an Instance is a userdata wrapping an int
// handle, and every property read, write and method call goes to JS through
// the js_* imports below. Vector3 is Luau's native vector type. Scripts run
// as coroutines; task.wait yields and JS resumes them from cs_step.
#include "lua.h"
#include "lualib.h"
#include "luacode.h"

#include <emscripten.h>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// ------------------------------------------------------------------ JS side
// Values cross as (tag, number, string, x, y, z, handle). Tags:
enum Tag { T_NIL = 0, T_BOOL = 1, T_NUM = 2, T_STR = 3, T_VEC = 4, T_INST = 5, T_METHOD = 6, T_SIGNAL = 7, T_ERR = 8, T_LIST = 9, T_COLOR = 10, T_ENUM = 11 };

EM_JS(int, js_new, (const char* cls), { return Module.studio.newInstance(UTF8ToString(cls)); });
EM_JS(int, js_index, (int h, const char* key), { return Module.studio.index(h, UTF8ToString(key)); });
EM_JS(void, js_newindex, (int h, const char* key), { Module.studio.newindex(h, UTF8ToString(key)); });
EM_JS(int, js_call, (int h, const char* method), { return Module.studio.call(h, UTF8ToString(method)); });
EM_JS(int, js_connect, (int h, const char* ev, int ref), { return Module.studio.connect(h, UTF8ToString(ev), ref); });
EM_JS(void, js_disconnect, (int id), { Module.studio.disconnect(id); });
EM_JS(void, js_print, (const char* s, int level), { Module.studio.print(UTF8ToString(s), level); });
EM_JS(int, js_global, (const char* name), { return Module.studio.global(UTF8ToString(name)); });
// The value channel: JS fills `ret` (results of index/call), C fills `args`.
EM_JS(int, js_ret_count, (), { return Module.studio.ret.length; });
EM_JS(int, js_ret_tag, (int i), { return Module.studio.ret[i].t; });
EM_JS(double, js_ret_num, (int i), { return Module.studio.ret[i].n; });
EM_JS(double, js_ret_vec, (int i, int k), { return Module.studio.ret[i].v[k]; });
EM_JS(char*, js_ret_str, (int i), { return stringToNewUTF8(Module.studio.ret[i].s); });
EM_JS(void, js_args_clear, (), { Module.studio.args = []; });
// Enums: does Enum.<type> exist; the value of Enum.<type>.<name> (or -2147483648);
// Enum.<type>:GetEnumItems() into the ret channel (returns the count).
EM_JS(int, js_enum_type, (const char* type), { return Module.studio.enumType(UTF8ToString(type)) ? 1 : 0; });
EM_JS(int, js_enum_value, (const char* type, const char* name), { const v = Module.studio.enumValue(UTF8ToString(type), UTF8ToString(name)); return v === null ? -2147483648 : v; });
EM_JS(int, js_enum_items, (const char* type), { return Module.studio.enumItems(UTF8ToString(type)); });
EM_JS(void, js_arg, (int t, double n, const char* s, double x, double y, double z), {
    Module.studio.args.push({ t: t, n: n, s: s ? UTF8ToString(s) : null, v: [x, y, z] });
});

// ------------------------------------------------------------------ state
static lua_State* L0;
static double now_s = 0;
struct Waiter { int thread_ref; double wake; double since; };
static std::vector<Waiter> waiters;

static const char* INST_MT = "Instance";
static const char* SIGNAL_MT = "RBXScriptSignal";
static const char* CONN_MT = "RBXScriptConnection";
static const char* COLOR_MT = "Color3";
static const char* ENUMITEM_MT = "EnumItem";
static const char* ENUM_MT = "Enum";
static int enum_cache_ref; // "Type.Name" -> EnumItem userdata, so == is identity
static int enum_types_ref; // "Type" -> its Enum table (the sandbox makes Enum itself read-only)
static int inst_cache_ref; // registry table: handle -> userdata (weak values)

struct Signal { int h; char ev[56]; };

// ------------------------------------------------------------------ marshalling
static void push_instance(lua_State* L, int h) {
    if (h <= 0) { lua_pushnil(L); return; }
    lua_getref(L, inst_cache_ref);
    lua_pushinteger(L, h);
    lua_rawget(L, -2);
    if (!lua_isnil(L, -1)) { lua_remove(L, -2); return; }
    lua_pop(L, 1);
    int* u = (int*)lua_newuserdata(L, sizeof(int));
    *u = h;
    luaL_getmetatable(L, INST_MT);
    lua_setmetatable(L, -2);
    lua_pushinteger(L, h);
    lua_pushvalue(L, -2);
    lua_rawset(L, -4);
    lua_remove(L, -2);
}

static int check_instance(lua_State* L, int idx) {
    int* u = (int*)luaL_checkudata(L, idx, INST_MT);
    return *u;
}

// Color3: an immutable userdata of three floats (0..1 nominal, not clamped, as in Roblox).
struct Color { float r, g, b; };
static void push_color(lua_State* L, double r, double g, double b) {
    Color* c = (Color*)lua_newuserdata(L, sizeof(Color));
    c->r = (float)r; c->g = (float)g; c->b = (float)b;
    luaL_getmetatable(L, COLOR_MT);
    lua_setmetatable(L, -2);
}
static Color* to_color(lua_State* L, int idx) {
    if (lua_type(L, idx) != LUA_TUSERDATA || !lua_getmetatable(L, idx)) return nullptr;
    luaL_getmetatable(L, COLOR_MT);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? (Color*)lua_touserdata(L, idx) : nullptr;
}
static Color* check_color(lua_State* L, int idx) {
    Color* c = to_color(L, idx);
    if (!c) luaL_typeerror(L, idx, "Color3");
    return c;
}

// EnumItem: one per "Type.Name", cached, immutable.
struct EnumItem { int value; char type[40]; char name[56]; };
static void push_enum_type(lua_State* L, const char* type);
static void push_enum(lua_State* L, const char* type, const char* name, int value) {
    std::string key = std::string(type) + "." + name;
    lua_getref(L, enum_cache_ref);
    lua_getfield(L, -1, key.c_str());
    if (!lua_isnil(L, -1)) { lua_remove(L, -2); return; }
    lua_pop(L, 1);
    EnumItem* e = (EnumItem*)lua_newuserdata(L, sizeof(EnumItem));
    e->value = value;
    strncpy(e->type, type, sizeof(e->type) - 1); e->type[sizeof(e->type) - 1] = 0;
    strncpy(e->name, name, sizeof(e->name) - 1); e->name[sizeof(e->name) - 1] = 0;
    luaL_getmetatable(L, ENUMITEM_MT);
    lua_setmetatable(L, -2);
    lua_pushvalue(L, -1);
    lua_setfield(L, -3, key.c_str());
    lua_remove(L, -2);
}
static EnumItem* to_enum(lua_State* L, int idx) {
    if (lua_type(L, idx) != LUA_TUSERDATA || !lua_getmetatable(L, idx)) return nullptr;
    luaL_getmetatable(L, ENUMITEM_MT);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? (EnumItem*)lua_touserdata(L, idx) : nullptr;
}

static int to_instance(lua_State* L, int idx) {
    if (lua_type(L, idx) != LUA_TUSERDATA) return 0;
    if (!lua_getmetatable(L, idx)) return 0;
    luaL_getmetatable(L, INST_MT);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? *(int*)lua_touserdata(L, idx) : 0;
}

// Send stack value idx to JS as one arg.
static void send_arg(lua_State* L, int idx) {
    switch (lua_type(L, idx)) {
    case LUA_TNIL: js_arg(T_NIL, 0, nullptr, 0, 0, 0); break;
    case LUA_TBOOLEAN: js_arg(T_BOOL, lua_toboolean(L, idx), nullptr, 0, 0, 0); break;
    case LUA_TNUMBER: js_arg(T_NUM, lua_tonumber(L, idx), nullptr, 0, 0, 0); break;
    case LUA_TSTRING: js_arg(T_STR, 0, lua_tostring(L, idx), 0, 0, 0); break;
    case LUA_TVECTOR: { const float* v = lua_tovector(L, idx); js_arg(T_VEC, 0, nullptr, v[0], v[1], v[2]); break; }
    case LUA_TUSERDATA: {
        int h = to_instance(L, idx);
        if (h) { js_arg(T_INST, h, nullptr, 0, 0, 0); break; }
        if (Color* c = to_color(L, idx)) { js_arg(T_COLOR, 0, nullptr, c->r, c->g, c->b); break; }
        if (EnumItem* e = to_enum(L, idx)) { std::string k = std::string(e->type) + "." + e->name; js_arg(T_ENUM, e->value, k.c_str(), 0, 0, 0); break; }
        luaL_error(L, "can't pass a %s to the engine", luaL_typename(L, idx));
    }
    default: luaL_error(L, "can't pass a %s to the engine", luaL_typename(L, idx));
    }
}

static int method_call(lua_State* L);

// Push JS result at cursor i onto the Luau stack and return the next cursor.
// Results are flattened: a list is {T_LIST, n} followed by its n items.
// `self` and `key` give context for methods and signals.
static int push_ret(lua_State* L, int i, int self, const char* key) {
    switch (js_ret_tag(i)) {
    case T_LIST: {
        int n = (int)js_ret_num(i);
        lua_createtable(L, n, 0);
        int j = i + 1;
        for (int k = 1; k <= n; k++) {
            j = push_ret(L, j, 0, "");
            lua_rawseti(L, -2, k);
        }
        return j;
    }
    case T_NIL: lua_pushnil(L); break;
    case T_BOOL: lua_pushboolean(L, js_ret_num(i) != 0); break;
    case T_NUM: lua_pushnumber(L, js_ret_num(i)); break;
    case T_STR: { char* s = js_ret_str(i); lua_pushstring(L, s); free(s); break; }
    case T_VEC: lua_pushvector(L, (float)js_ret_vec(i, 0), (float)js_ret_vec(i, 1), (float)js_ret_vec(i, 2)); break;
    case T_INST: push_instance(L, (int)js_ret_num(i)); break;
    case T_COLOR: push_color(L, js_ret_vec(i, 0), js_ret_vec(i, 1), js_ret_vec(i, 2)); break;
    case T_ENUM: {
        char* s = js_ret_str(i);
        std::string full = s ? s : "";
        free(s);
        size_t dot = full.find('.');
        push_enum(L, full.substr(0, dot).c_str(), dot == std::string::npos ? "" : full.substr(dot + 1).c_str(), (int)js_ret_num(i));
        break;
    }
    case T_METHOD:
        lua_pushstring(L, key);
        lua_pushcclosurek(L, method_call, key, 1, nullptr);
        break;
    case T_SIGNAL: {
        Signal* s = (Signal*)lua_newuserdata(L, sizeof(Signal));
        s->h = self;
        strncpy(s->ev, key, sizeof(s->ev) - 1);
        s->ev[sizeof(s->ev) - 1] = 0;
        luaL_getmetatable(L, SIGNAL_MT);
        lua_setmetatable(L, -2);
        break;
    }
    default: { char* s = js_ret_str(i); std::string m = s ? s : "error"; free(s); luaL_error(L, "%s", m.c_str()); }
    }
    return i + 1;
}

// ------------------------------------------------------------------ Instance
static int inst_index(lua_State* L) {
    int h = check_instance(L, 1);
    const char* key = luaL_checkstring(L, 2);
    js_index(h, key);
    push_ret(L, 0, h, key);
    return 1;
}

static int inst_newindex(lua_State* L) {
    int h = check_instance(L, 1);
    const char* key = luaL_checkstring(L, 2);
    js_args_clear();
    send_arg(L, 3);
    js_newindex(h, key);
    if (js_ret_count() > 0 && js_ret_tag(0) == T_ERR) push_ret(L, 0, h, key); // raises
    return 0;
}

static int method_call(lua_State* L) {
    const char* method = lua_tostring(L, lua_upvalueindex(1));
    int h = to_instance(L, 1);
    if (!h) luaL_error(L, "Expected ':' not '.' calling member function %s", method);
    int n = lua_gettop(L);
    js_args_clear();
    for (int i = 2; i <= n; i++) send_arg(L, i);
    int nret = js_call(h, method);
    for (int i = 0, c = 0; i < nret; i++) c = push_ret(L, c, h, method);
    return nret;
}

static int inst_tostring(lua_State* L) {
    int h = check_instance(L, 1);
    js_index(h, "Name");
    char* s = js_ret_str(0);
    lua_pushstring(L, s);
    free(s);
    return 1;
}

static int instance_new(lua_State* L) {
    const char* cls = luaL_checkstring(L, 1);
    int h = js_new(cls);
    if (h <= 0) luaL_error(L, "Unable to create an Instance of type \"%s\"", cls);
    push_instance(L, h);
    if (lua_gettop(L) >= 3 && !lua_isnil(L, 2)) {
        // Instance.new(class, parent)
        js_args_clear();
        send_arg(L, 2);
        js_newindex(h, "Parent");
    }
    return 1;
}

// ------------------------------------------------------------------ signals
static int signal_connect(lua_State* L) {
    Signal* s = (Signal*)luaL_checkudata(L, 1, SIGNAL_MT);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    int ref = lua_ref(L, 2);
    int id = js_connect(s->h, s->ev, ref);
    int* c = (int*)lua_newuserdata(L, sizeof(int) * 2);
    c[0] = id;
    c[1] = ref;
    luaL_getmetatable(L, CONN_MT);
    lua_setmetatable(L, -2);
    return 1;
}

static int conn_disconnect(lua_State* L) {
    int* c = (int*)luaL_checkudata(L, 1, CONN_MT);
    if (c[0]) {
        js_disconnect(c[0]);
        lua_unref(L, c[1]);
        c[0] = 0;
    }
    return 0;
}

static int signal_wait(lua_State* L);

static int signal_index(lua_State* L) {
    const char* key = luaL_checkstring(L, 2);
    if (!strcmp(key, "Connect")) lua_pushcfunction(L, signal_connect, "Connect");
    else if (!strcmp(key, "Wait")) lua_pushcfunction(L, signal_wait, "Wait");
    else luaL_error(L, "%s is not a valid member of RBXScriptSignal", key);
    return 1;
}

static int conn_index(lua_State* L) {
    const char* key = luaL_checkstring(L, 2);
    if (!strcmp(key, "Disconnect")) lua_pushcfunction(L, conn_disconnect, "Disconnect");
    else if (!strcmp(key, "Connected")) lua_pushboolean(L, ((int*)luaL_checkudata(L, 1, CONN_MT))[0] != 0);
    else luaL_error(L, "%s is not a valid member of RBXScriptConnection", key);
    return 1;
}

// ------------------------------------------------------------------ scheduler
static void report_error(lua_State* T) {
    std::string msg = lua_tostring(T, -1) ? lua_tostring(T, -1) : "error";
    msg += "\n";
    msg += lua_debugtrace(T);
    js_print(msg.c_str(), 2);
}

// Resume thread T (whose ref is `ref`) with nargs on its stack. Drops the ref unless it yielded.
static void resume(lua_State* T, int ref, int nargs) {
    // Whatever yields (task.wait, Signal:Wait) takes its own ref to the thread,
    // so the caller's ref is dropped in every case.
    int st = lua_resume(T, nullptr, nargs);
    if (st != LUA_OK && st != LUA_YIELD) report_error(T);
    lua_unref(L0, ref);
}

static int task_wait(lua_State* L) {
    double t = luaL_optnumber(L, 1, 0);
    if (t < 1.0 / 60) t = 1.0 / 60;
    lua_pushthread(L);
    int ref = lua_ref(L, -1);
    lua_pop(L, 1);
    waiters.push_back({ ref, now_s + t, now_s });
    return lua_yield(L, 0);
}

static int signal_wait(lua_State* L) {
    // Signal:Wait() as a one-shot connection that resumes this thread.
    Signal* s = (Signal*)luaL_checkudata(L, 1, SIGNAL_MT);
    lua_pushthread(L);
    int ref = lua_ref(L, -1);
    lua_pop(L, 1);
    js_connect(s->h, s->ev, -ref); // negative ref: resume a waiting thread once
    return lua_yield(L, 0);
}

// Run function at stack top of L0 in a new thread with nargs taken from `args` builder.
static lua_State* new_thread_with(int fnref, int& tref) {
    lua_State* T = lua_newthread(L0);
    tref = lua_ref(L0, -1);
    lua_pop(L0, 1);
    lua_getref(T, fnref);
    return T;
}

static int task_spawn(lua_State* L) {
    luaL_checktype(L, 1, LUA_TFUNCTION);
    int n = lua_gettop(L);
    lua_State* T = lua_newthread(L);
    int tref = lua_ref(L, -1);
    lua_pop(L, 1);
    lua_xmove(L, T, n); // function + args
    resume(T, tref, n - 1);
    return 0;
}

static int task_delay(lua_State* L) {
    double t = luaL_checknumber(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    lua_State* T = lua_newthread(L);
    int tref = lua_ref(L, -1);
    lua_pop(L, 1);
    lua_pushvalue(L, 2);
    lua_xmove(L, T, 1);
    waiters.push_back({ tref, now_s + t, -1 }); // since < 0: start the function, don't resume
    return 0;
}

static int g_print(lua_State* L, int level) {
    int n = lua_gettop(L);
    std::string out;
    for (int i = 1; i <= n; i++) {
        size_t len;
        const char* s = luaL_tolstring(L, i, &len);
        if (i > 1) out += " ";
        out.append(s, len);
        lua_pop(L, 1);
    }
    js_print(out.c_str(), level);
    return 0;
}
static int l_print(lua_State* L) { return g_print(L, 0); }
static int l_warn(lua_State* L) { return g_print(L, 1); }

// ------------------------------------------------------------------ Vector3
static int vec_new(lua_State* L) {
    lua_pushvector(L, (float)luaL_optnumber(L, 1, 0), (float)luaL_optnumber(L, 2, 0), (float)luaL_optnumber(L, 3, 0));
    return 1;
}

static int vec_index(lua_State* L) {
    const float* v = luaL_checkvector(L, 1);
    const char* k = luaL_checkstring(L, 2);
    double m = std::sqrt((double)v[0] * v[0] + (double)v[1] * v[1] + (double)v[2] * v[2]);
    if (!strcmp(k, "Magnitude")) { lua_pushnumber(L, m); return 1; }
    if (!strcmp(k, "Unit")) {
        float s = m > 0 ? (float)(1.0 / m) : 0.f;
        lua_pushvector(L, v[0] * s, v[1] * s, v[2] * s);
        return 1;
    }
    luaL_error(L, "%s is not a valid member of Vector3", k);
    return 0;
}

// ------------------------------------------------------------------ Color3
static void rgb_to_hsv(double r, double g, double b, double* h, double* s, double* v) {
    double mx = std::fmax(r, std::fmax(g, b)), mn = std::fmin(r, std::fmin(g, b)), d = mx - mn;
    *v = mx; *s = mx > 0 ? d / mx : 0;
    if (d == 0) { *h = 0; return; }
    double hh = mx == r ? std::fmod((g - b) / d, 6.0) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh /= 6; if (hh < 0) hh += 1;
    *h = hh;
}
static int color_new(lua_State* L) {
    push_color(L, luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0), luaL_optnumber(L, 3, 0));
    return 1;
}
static int color_fromRGB(lua_State* L) {
    push_color(L, luaL_optnumber(L, 1, 0) / 255.0, luaL_optnumber(L, 2, 0) / 255.0, luaL_optnumber(L, 3, 0) / 255.0);
    return 1;
}
static int color_fromHSV(lua_State* L) {
    double h = luaL_checknumber(L, 1), s = luaL_checknumber(L, 2), v = luaL_checknumber(L, 3);
    h = std::fmod(h, 1.0); if (h < 0) h += 1;
    double f = h * 6, c = v * s, x = c * (1 - std::fabs(std::fmod(f, 2.0) - 1)), m = v - c, r = 0, g = 0, b = 0;
    switch ((int)f % 6) { case 0: r = c; g = x; break; case 1: r = x; g = c; break; case 2: g = c; b = x; break;
                          case 3: g = x; b = c; break; case 4: r = x; b = c; break; default: r = c; b = x; }
    push_color(L, r + m, g + m, b + m);
    return 1;
}
static int color_fromHex(lua_State* L) {
    const char* s = luaL_checkstring(L, 1);
    if (*s == '#') s++;
    size_t n = strlen(s);
    char buf[7] = {0};
    if (n == 3) { for (int i = 0; i < 3; i++) buf[2 * i] = buf[2 * i + 1] = s[i]; }
    else if (n == 6) memcpy(buf, s, 6);
    else luaL_error(L, "Unable to convert characters to hex value");
    for (int i = 0; i < 6; i++) if (!isxdigit((unsigned char)buf[i])) luaL_error(L, "Unable to convert characters to hex value");
    long v = strtol(buf, nullptr, 16);
    push_color(L, ((v >> 16) & 255) / 255.0, ((v >> 8) & 255) / 255.0, (v & 255) / 255.0);
    return 1;
}
static int color_lerp(lua_State* L) {
    Color* a = check_color(L, 1); Color* b = check_color(L, 2);
    double t = luaL_checknumber(L, 3);
    push_color(L, a->r + (b->r - a->r) * t, a->g + (b->g - a->g) * t, a->b + (b->b - a->b) * t);
    return 1;
}
static int color_toHSV(lua_State* L) {
    Color* c = check_color(L, 1);
    double h, s, v; rgb_to_hsv(c->r, c->g, c->b, &h, &s, &v);
    lua_pushnumber(L, h); lua_pushnumber(L, s); lua_pushnumber(L, v);
    return 3;
}
static int color_toHex(lua_State* L) {
    Color* c = check_color(L, 1);
    auto byte = [](float f) { int v = (int)std::lround(f * 255.0); return v < 0 ? 0 : v > 255 ? 255 : v; };
    char buf[8];
    snprintf(buf, sizeof buf, "%02x%02x%02x", byte(c->r), byte(c->g), byte(c->b));
    lua_pushstring(L, buf);
    return 1;
}
static int color_index(lua_State* L) {
    Color* c = check_color(L, 1);
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "R")) { lua_pushnumber(L, c->r); return 1; }
    if (!strcmp(k, "G")) { lua_pushnumber(L, c->g); return 1; }
    if (!strcmp(k, "B")) { lua_pushnumber(L, c->b); return 1; }
    if (!strcmp(k, "Lerp")) { lua_pushcfunction(L, color_lerp, "Lerp"); return 1; }
    if (!strcmp(k, "ToHSV")) { lua_pushcfunction(L, color_toHSV, "ToHSV"); return 1; }
    if (!strcmp(k, "ToHex")) { lua_pushcfunction(L, color_toHex, "ToHex"); return 1; }
    luaL_error(L, "%s is not a valid member of Color3", k);
    return 0;
}
static int color_newindex(lua_State* L) {
    luaL_error(L, "%s cannot be assigned to", luaL_checkstring(L, 2));
    return 0;
}
static int color_eq(lua_State* L) {
    Color* a = to_color(L, 1); Color* b = to_color(L, 2);
    lua_pushboolean(L, a && b && a->r == b->r && a->g == b->g && a->b == b->b);
    return 1;
}
static int color_tostring(lua_State* L) {
    Color* c = check_color(L, 1);
    char buf[96];
    snprintf(buf, sizeof buf, "%.9g, %.9g, %.9g", c->r, c->g, c->b);
    lua_pushstring(L, buf);
    return 1;
}

// ------------------------------------------------------------------ Enum
static int enumitem_index(lua_State* L) {
    EnumItem* e = to_enum(L, 1);
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Name")) { lua_pushstring(L, e->name); return 1; }
    if (!strcmp(k, "Value")) { lua_pushinteger(L, e->value); return 1; }
    if (!strcmp(k, "EnumType")) { push_enum_type(L, e->type); return 1; }
    luaL_error(L, "%s is not a valid member of \"Enum.%s.%s\"", k, e->type, e->name);
    return 0;
}
static int enumitem_tostring(lua_State* L) {
    EnumItem* e = to_enum(L, 1);
    lua_pushfstring(L, "Enum.%s.%s", e->type, e->name);
    return 1;
}
static int enumitem_eq(lua_State* L) {
    EnumItem* a = to_enum(L, 1); EnumItem* b = to_enum(L, 2);
    lua_pushboolean(L, a && b && !strcmp(a->type, b->type) && !strcmp(a->name, b->name));
    return 1;
}
// An Enum type (Enum.Material): a table holding its name; items resolve on index.
static int enum_getitems(lua_State* L) {
    luaL_checktype(L, 1, LUA_TTABLE);
    lua_rawgetfield(L, 1, "__name");
    std::string type = luaL_checkstring(L, -1);
    lua_pop(L, 1);
    int n = js_enum_items(type.c_str());
    lua_createtable(L, n, 0);
    for (int i = 0; i < n; i++) { push_ret(L, i, 0, ""); lua_rawseti(L, -2, i + 1); }
    return 1;
}
static int enumtype_index(lua_State* L) {
    lua_rawgetfield(L, 1, "__name");
    std::string type = lua_tostring(L, -1);
    lua_pop(L, 1);
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "GetEnumItems")) { lua_pushcfunction(L, enum_getitems, "GetEnumItems"); return 1; }
    int v = js_enum_value(type.c_str(), k);
    if (v == (int)-2147483648) luaL_error(L, "%s is not a valid member of \"Enum.%s\"", k, type.c_str());
    push_enum(L, type.c_str(), k, v);
    return 1;
}
static int enumtype_tostring(lua_State* L) {
    lua_rawgetfield(L, 1, "__name");
    return 1;
}
static void push_enum_type(lua_State* L, const char* type) {
    lua_getglobal(L, "Enum");
    lua_getfield(L, -1, type);
    lua_remove(L, -2);
}
static int enum_index(lua_State* L) {
    const char* k = luaL_checkstring(L, 2);
    lua_getref(L, enum_types_ref);
    lua_rawgetfield(L, -1, k);
    if (!lua_isnil(L, -1)) return 1;
    lua_pop(L, 2);
    if (!js_enum_type(k)) luaL_error(L, "%s is not a valid member of \"Enum\"", k);
    lua_newtable(L);
    lua_pushstring(L, k);
    lua_rawsetfield(L, -2, "__name");
    luaL_getmetatable(L, ENUM_MT);
    lua_setmetatable(L, -2);
    lua_setreadonly(L, -1, true);
    lua_getref(L, enum_types_ref);
    lua_pushvalue(L, -2);
    lua_rawsetfield(L, -2, k);
    lua_pop(L, 1);
    return 1;
}

// ------------------------------------------------------------------ exports
extern "C" {

EMSCRIPTEN_KEEPALIVE void cs_init() {
    L0 = luaL_newstate();
    luaL_openlibs(L0);

    lua_newtable(L0);
    lua_newtable(L0);
    lua_pushstring(L0, "v");
    lua_setfield(L0, -2, "__mode");
    lua_setmetatable(L0, -2);
    inst_cache_ref = lua_ref(L0, -1);
    lua_pop(L0, 1);

    luaL_newmetatable(L0, INST_MT);
    lua_pushcfunction(L0, inst_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushcfunction(L0, inst_newindex, "__newindex");
    lua_setfield(L0, -2, "__newindex");
    lua_pushcfunction(L0, inst_tostring, "__tostring");
    lua_setfield(L0, -2, "__tostring");
    lua_pushstring(L0, "Instance");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);

    luaL_newmetatable(L0, SIGNAL_MT);
    lua_pushcfunction(L0, signal_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushstring(L0, "RBXScriptSignal");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);

    luaL_newmetatable(L0, CONN_MT);
    lua_pushcfunction(L0, conn_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushstring(L0, "RBXScriptConnection");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);

    luaL_newmetatable(L0, COLOR_MT);
    lua_pushcfunction(L0, color_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushcfunction(L0, color_newindex, "__newindex");
    lua_setfield(L0, -2, "__newindex");
    lua_pushcfunction(L0, color_eq, "__eq");
    lua_setfield(L0, -2, "__eq");
    lua_pushcfunction(L0, color_tostring, "__tostring");
    lua_setfield(L0, -2, "__tostring");
    lua_pushstring(L0, "Color3");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);

    lua_newtable(L0);
    enum_cache_ref = lua_ref(L0, -1);
    lua_pop(L0, 1);
    lua_newtable(L0);
    enum_types_ref = lua_ref(L0, -1);
    lua_pop(L0, 1);
    luaL_newmetatable(L0, ENUMITEM_MT);
    lua_pushcfunction(L0, enumitem_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushcfunction(L0, enumitem_tostring, "__tostring");
    lua_setfield(L0, -2, "__tostring");
    lua_pushcfunction(L0, enumitem_eq, "__eq");
    lua_setfield(L0, -2, "__eq");
    lua_pushstring(L0, "EnumItem");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);
    luaL_newmetatable(L0, ENUM_MT);
    lua_pushcfunction(L0, enumtype_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushcfunction(L0, enumtype_tostring, "__tostring");
    lua_setfield(L0, -2, "__tostring");
    lua_pushstring(L0, "Enum");
    lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);
    lua_newtable(L0);               // the global Enum: types resolve on first use
    lua_newtable(L0);
    lua_pushcfunction(L0, enum_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_pushstring(L0, "Enums");
    lua_setfield(L0, -2, "__type");
    lua_setmetatable(L0, -2);
    lua_setglobal(L0, "Enum");

    // vector metatable: .X/.Y/.Z are native; Magnitude and Unit here.
    lua_pushvector(L0, 0, 0, 0);
    lua_newtable(L0);
    lua_pushcfunction(L0, vec_index, "__index");
    lua_setfield(L0, -2, "__index");
    lua_setmetatable(L0, -2);
    lua_pop(L0, 1);

    lua_pushcfunction(L0, l_print, "print");
    lua_setglobal(L0, "print");
    lua_pushcfunction(L0, l_warn, "warn");
    lua_setglobal(L0, "warn");

    lua_newtable(L0);
    lua_pushcfunction(L0, instance_new, "new");
    lua_setfield(L0, -2, "new");
    lua_setglobal(L0, "Instance");

    lua_newtable(L0);
    lua_pushcfunction(L0, vec_new, "new");
    lua_setfield(L0, -2, "new");
    lua_pushvector(L0, 0, 0, 0);
    lua_setfield(L0, -2, "zero");
    lua_pushvector(L0, 1, 1, 1);
    lua_setfield(L0, -2, "one");
    lua_setglobal(L0, "Vector3");

    lua_newtable(L0);
    lua_pushcfunction(L0, color_new, "new");
    lua_setfield(L0, -2, "new");
    lua_pushcfunction(L0, color_fromRGB, "fromRGB");
    lua_setfield(L0, -2, "fromRGB");
    lua_pushcfunction(L0, color_fromHSV, "fromHSV");
    lua_setfield(L0, -2, "fromHSV");
    lua_pushcfunction(L0, color_fromHex, "fromHex");
    lua_setfield(L0, -2, "fromHex");
    lua_pushcfunction(L0, color_toHSV, "toHSV");
    lua_setfield(L0, -2, "toHSV");
    lua_setglobal(L0, "Color3");

    lua_newtable(L0);
    lua_pushcfunction(L0, task_wait, "wait");
    lua_setfield(L0, -2, "wait");
    lua_pushcfunction(L0, task_spawn, "spawn");
    lua_setfield(L0, -2, "spawn");
    lua_pushcfunction(L0, task_delay, "delay");
    lua_setfield(L0, -2, "delay");
    lua_setglobal(L0, "task");
    lua_pushcfunction(L0, task_wait, "wait");
    lua_setglobal(L0, "wait");

    push_instance(L0, js_global("game"));
    lua_setglobal(L0, "game");
    push_instance(L0, js_global("workspace"));
    lua_setglobal(L0, "workspace");

    luaL_sandbox(L0);
}

// Compile and start a script. Returns 0 on success, else prints the error.
EMSCRIPTEN_KEEPALIVE int cs_run(const char* chunkname, const char* source, int script_handle) {
    size_t blen;
    char* bc = luau_compile(source, strlen(source), nullptr, &blen);
    lua_State* T = lua_newthread(L0);
    int tref = lua_ref(L0, -1);
    lua_pop(L0, 1);
    luaL_sandboxthread(T);
    if (script_handle > 0) {
        push_instance(T, script_handle);
        lua_setglobal(T, "script");
    }
    int st = luau_load(T, chunkname, bc, blen, 0);
    free(bc);
    if (st != 0) {
        js_print(lua_tostring(T, -1), 2);
        lua_unref(L0, tref);
        return 1;
    }
    resume(T, tref, 0);
    return 0;
}

// Advance the scheduler to time t (seconds): resume every due task.wait.
EMSCRIPTEN_KEEPALIVE void cs_step(double t) {
    now_s = t;
    std::vector<Waiter> due;
    for (size_t i = 0; i < waiters.size();) {
        if (waiters[i].wake <= t) { due.push_back(waiters[i]); waiters.erase(waiters.begin() + i); }
        else i++;
    }
    for (auto& w : due) {
        lua_getref(L0, w.thread_ref);
        lua_State* T = lua_tothread(L0, -1);
        lua_pop(L0, 1);
        if (w.since < 0) { resume(T, w.thread_ref, 0); continue; }
        lua_pushnumber(T, t - w.since);
        resume(T, w.thread_ref, 1);
    }
}

// Fire a connection: JS has filled `args` (via the same channel) and calls
// cs_fire(ref, n). ref > 0: a handler function (runs in a new thread);
// ref < 0: a thread waiting in Signal:Wait() (resumed once).
static void push_js_args(lua_State* T, int n) {
    for (int i = 0, c = 0; i < n; i++) c = push_ret(T, c, 0, "");
}

EMSCRIPTEN_KEEPALIVE void cs_fire(int ref, int n) {
    if (ref > 0) {
        int tref;
        lua_State* T = new_thread_with(ref, tref);
        push_js_args(T, n);
        resume(T, tref, n);
    } else {
        lua_getref(L0, -ref);
        lua_State* T = lua_tothread(L0, -1);
        lua_pop(L0, 1);
        push_js_args(T, n);
        resume(T, -ref, n);
    }
}

EMSCRIPTEN_KEEPALIVE int cs_waiting() { return (int)waiters.size(); }

} // extern "C"
