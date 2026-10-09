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
enum Tag { T_NIL = 0, T_BOOL = 1, T_NUM = 2, T_STR = 3, T_VEC = 4, T_INST = 5, T_METHOD = 6, T_SIGNAL = 7, T_ERR = 8, T_LIST = 9, T_COLOR = 10, T_ENUM = 11, T_CFRAME = 12, T_DICT = 13, T_TWEENINFO = 14, T_UDIM = 15, T_UDIM2 = 16, T_VEC2 = 17 };

EM_JS(int, js_new, (const char* cls), { return Module.studio.newInstance(UTF8ToString(cls)); });
EM_JS(int, js_index, (int h, const char* key), { return Module.studio.index(h, UTF8ToString(key)); });
EM_JS(void, js_newindex, (int h, const char* key), { Module.studio.newindex(h, UTF8ToString(key)); });
EM_JS(int, js_call, (int h, const char* method), { return Module.studio.call(h, UTF8ToString(method)); });
EM_JS(int, js_connect, (int h, const char* ev, int ref), { return Module.studio.connect(h, UTF8ToString(ev), ref); });
EM_JS(void, js_disconnect, (int id), { Module.studio.disconnect(id); });
EM_JS(int, js_connected, (int id), { return Module.studio.connected(id); });
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
// A CFrame: 12 floats at `m` (x, y, z, then the rotation's rows).
EM_JS(void, js_arg_cf, (const float* m), {
    Module.studio.args.push({ t: 12, v: Array.from(HEAPF32.subarray(m >> 2, (m >> 2) + 12)) });
});

// ------------------------------------------------------------------ state
static lua_State* L0;
static double now_s = 0;
struct Waiter { int thread_ref; double wake; double since; int nargs = 0; };
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
static int waitforchild_ref; // Instance:WaitForChild, written in Luau (it yields)

struct Signal { int h; char ev[56]; };

#include "cframe.h"
#include "gui_types.h"

// TweenInfo: immutable, as Roblox's. Enum fields are kept by name.
static const char* TWEENINFO_MT = "TweenInfo";
struct TI { double time, delay; int repeat, reverses; char style[16], dir[8]; };
static TI* to_ti(lua_State* L, int idx) {
    if (lua_type(L, idx) != LUA_TUSERDATA || !lua_getmetatable(L, idx)) return nullptr;
    luaL_getmetatable(L, TWEENINFO_MT);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? (TI*)lua_touserdata(L, idx) : nullptr;
}
static void push_ti(lua_State* L, double time, const char* style, const char* dir, int repeat, int reverses, double delay) {
    TI* t = (TI*)lua_newuserdata(L, sizeof(TI));
    t->time = time; t->delay = delay; t->repeat = repeat; t->reverses = reverses;
    strncpy(t->style, style, sizeof t->style - 1); t->style[sizeof t->style - 1] = 0;
    strncpy(t->dir, dir, sizeof t->dir - 1); t->dir[sizeof t->dir - 1] = 0;
    luaL_getmetatable(L, TWEENINFO_MT);
    lua_setmetatable(L, -2);
}


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
static int send_depth = 0;
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
        if (CF* c = to_cf(L, idx)) { js_arg_cf(c->m); break; }
        if (UD* u = to_ud<UD>(L, idx, UDIM_MT)) { js_arg(T_UDIM, 0, nullptr, u->s, u->o, 0); break; }
        if (UD2* u = to_ud<UD2>(L, idx, UDIM2_MT)) { js_arg(T_UDIM2, u->x.s, nullptr, u->x.o, u->y.s, u->y.o); break; }
        if (V2* v = to_ud<V2>(L, idx, VEC2_MT)) { js_arg(T_VEC2, 0, nullptr, v->x, v->y, 0); break; }
        if (TI* t = to_ti(L, idx)) { std::string k = std::string(t->style) + "," + t->dir; js_arg(T_TWEENINFO, t->time, k.c_str(), t->repeat, t->reverses, t->delay); break; }
        if (EnumItem* e = to_enum(L, idx)) { std::string k = std::string(e->type) + "." + e->name; js_arg(T_ENUM, e->value, k.c_str(), 0, 0, 0); break; }
        luaL_error(L, "can't pass a %s to the engine", luaL_typename(L, idx));
    }
    case LUA_TTABLE: {
        // A table: {T_DICT, n} then its n key/value pairs, each sent the same way.
        if (send_depth > 8) luaL_error(L, "table nested too deeply to pass to the engine");
        int t = idx < 0 ? lua_gettop(L) + idx + 1 : idx, n = 0;
        lua_pushnil(L);
        while (lua_next(L, t)) { n++; lua_pop(L, 1); }
        js_arg(T_DICT, n, nullptr, 0, 0, 0);
        send_depth++;
        lua_pushnil(L);
        while (lua_next(L, t)) { send_arg(L, -2); send_arg(L, -1); lua_pop(L, 1); }
        send_depth--;
        break;
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
    case T_CFRAME: { double m[12]; for (int k = 0; k < 12; k++) m[k] = js_ret_vec(i, k); push_cf(L, m); break; }
    case T_UDIM: push_udim(L, js_ret_vec(i, 0), js_ret_vec(i, 1)); break;
    case T_UDIM2: push_udim2(L, js_ret_num(i), js_ret_vec(i, 0), js_ret_vec(i, 1), js_ret_vec(i, 2)); break;
    case T_VEC2: push_vec2(L, js_ret_vec(i, 0), js_ret_vec(i, 1)); break;
    case T_TWEENINFO: {
        char* s = js_ret_str(i);
        std::string k = s ? s : "Quad,Out";
        free(s);
        size_t c = k.find(',');
        push_ti(L, js_ret_num(i), k.substr(0, c).c_str(), c == std::string::npos ? "Out" : k.substr(c + 1).c_str(), (int)js_ret_vec(i, 0), (int)js_ret_vec(i, 1), js_ret_vec(i, 2));
        break;
    }
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
    if (!strcmp(key, "WaitForChild")) { lua_getref(L, waitforchild_ref); return 1; }
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
        if (js_ret_count() > 0 && js_ret_tag(0) == T_ERR) push_ret(L, 0, h, "Parent"); // raises
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
        // If the instance was destroyed, the connection already ended and JS
        // released its ref; unref only a live one (never twice).
        if (js_connected(c[0])) { js_disconnect(c[0]); lua_unref(L, c[1]); }
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
    else if (!strcmp(key, "Connected")) { int id = ((int*)luaL_checkudata(L, 1, CONN_MT))[0]; lua_pushboolean(L, id != 0 && js_connected(id)); }
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
static void resume(lua_State* T, int ref, int nargs, lua_State* from = nullptr) {
    // Whatever yields (task.wait, Signal:Wait) takes its own ref to the thread,
    // so the caller's ref is dropped in every case. `from` (the calling thread,
    // for task.spawn) keeps nested resumes inside Luau's C-call limit.
    int st = lua_resume(T, from, nargs);
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
    int n = lua_gettop(L);
    if (lua_type(L, 1) == LUA_TTHREAD) {
        // task.spawn(thread, ...): resume a thread now with the arguments.
        lua_State* T = lua_tothread(L, 1);
        int tref = lua_ref(L, 1);
        lua_xmove(L, T, n - 1);
        resume(T, tref, n - 1, L);
        return 0;
    }
    luaL_checktype(L, 1, LUA_TFUNCTION);
    lua_State* T = lua_newthread(L);
    int tref = lua_ref(L, -1);
    lua_pop(L, 1);
    lua_xmove(L, T, n); // function + args
    resume(T, tref, n - 1, L);
    return 0;
}

static int task_delay(lua_State* L) {
    double t = luaL_checknumber(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    lua_State* T = lua_newthread(L);
    int tref = lua_ref(L, -1);
    lua_pop(L, 1);
    int n = lua_gettop(L);
    for (int i = 2; i <= n; i++) lua_pushvalue(L, i);
    lua_xmove(L, T, n - 1); // the function and its arguments
    waiters.push_back({ tref, now_s + t, -1, n - 2 }); // since < 0: start the function with nargs
    lua_getref(L, tref); // returns the thread, so task.cancel can stop it (Roblox)
    return 1;
}

// task.cancel(thread): it never runs or resumes.
static int task_cancel(lua_State* L) {
    luaL_checktype(L, 1, LUA_TTHREAD);
    lua_State* target = lua_tothread(L, 1);
    for (size_t i = 0; i < waiters.size();) {
        lua_getref(L, waiters[i].thread_ref);
        bool same = lua_tothread(L, -1) == target;
        lua_pop(L, 1);
        if (same) { lua_unref(L, waiters[i].thread_ref); waiters.erase(waiters.begin() + i); }
        else i++;
    }
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
static int l_typeof(lua_State* L) {
    if (lua_type(L, 1) == LUA_TVECTOR) { lua_pushstring(L, "Vector3"); return 1; }
    lua_pushvalue(L, lua_upvalueindex(1));
    lua_pushvalue(L, 1);
    lua_call(L, 1, 1);
    return 1;
}
static int l_print(lua_State* L) { return g_print(L, 0); }
// time(): seconds the game has been running (the frame clock). tick(): Unix time, deprecated in Roblox but still common.
EM_JS(double, js_unix_time, (), { return Date.now() / 1000; });
static int l_time(lua_State* L) { lua_pushnumber(L, now_s); return 1; }
static int l_tick(lua_State* L) { lua_pushnumber(L, js_unix_time()); return 1; }
static int l_warn(lua_State* L) { return g_print(L, 1); }

// ------------------------------------------------------------------ Vector3
static int vec_new(lua_State* L) {
    lua_pushvector(L, (float)luaL_optnumber(L, 1, 0), (float)luaL_optnumber(L, 2, 0), (float)luaL_optnumber(L, 3, 0));
    return 1;
}

// Vector3 methods (Roblox's): a:Dot(b), a:Cross(b), a:Lerp(b, t), a:FuzzyEq(b, eps), a:Angle(b, axis?), Abs/Floor/Ceil/Sign, Min/Max(...).
static int vec_dot(lua_State* L) { const float* a = luaL_checkvector(L, 1); const float* b = luaL_checkvector(L, 2); lua_pushnumber(L, (double)a[0] * b[0] + (double)a[1] * b[1] + (double)a[2] * b[2]); return 1; }
static int vec_cross(lua_State* L) { const float* a = luaL_checkvector(L, 1); const float* b = luaL_checkvector(L, 2); lua_pushvector(L, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]); return 1; }
static int vec_lerp(lua_State* L) { const float* a = luaL_checkvector(L, 1); const float* b = luaL_checkvector(L, 2); float t = (float)luaL_checknumber(L, 3); lua_pushvector(L, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); return 1; }
static int vec_fuzzyeq(lua_State* L) {
    const float* a = luaL_checkvector(L, 1); const float* b = luaL_checkvector(L, 2); double e = luaL_optnumber(L, 3, 1e-5);
    lua_pushboolean(L, std::fabs(a[0] - b[0]) <= e && std::fabs(a[1] - b[1]) <= e && std::fabs(a[2] - b[2]) <= e); return 1;
}
static int vec_angle(lua_State* L) {
    const float* a = luaL_checkvector(L, 1); const float* b = luaL_checkvector(L, 2);
    double cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    double ang = std::atan2(std::sqrt(cx * cx + cy * cy + cz * cz), (double)a[0] * b[0] + (double)a[1] * b[1] + (double)a[2] * b[2]);
    if (lua_isvector(L, 3)) { const float* ax = lua_tovector(L, 3); if (cx * ax[0] + cy * ax[1] + cz * ax[2] < 0) ang = -ang; } // signed about `axis`
    lua_pushnumber(L, ang); return 1;
}
#define VEC_MAP(name, f) static int name(lua_State* L) { const float* a = luaL_checkvector(L, 1); lua_pushvector(L, f(a[0]), f(a[1]), f(a[2])); return 1; }
static float sgnf(float x) { return x > 0 ? 1.f : x < 0 ? -1.f : 0.f; }
VEC_MAP(vec_abs, std::fabs) VEC_MAP(vec_floor, std::floor) VEC_MAP(vec_ceil, std::ceil) VEC_MAP(vec_sign, sgnf)
static int vec_minmax(lua_State* L, bool mx) {
    const float* a = luaL_checkvector(L, 1); float r[3] = { a[0], a[1], a[2] };
    for (int i = 2; i <= lua_gettop(L); i++) { const float* b = luaL_checkvector(L, i); for (int k = 0; k < 3; k++) r[k] = mx ? std::fmax(r[k], b[k]) : std::fmin(r[k], b[k]); }
    lua_pushvector(L, r[0], r[1], r[2]); return 1;
}
static int vec_min(lua_State* L) { return vec_minmax(L, false); }
static int vec_max(lua_State* L) { return vec_minmax(L, true); }

static int vec_index(lua_State* L) {
    const float* v = luaL_checkvector(L, 1);
    const char* k = luaL_checkstring(L, 2);
    // Components: the VM's fast path covers most reads, but not every one (a
    // vector read back out of a table comes here), so answer them too.
    if ((k[0] == 'X' || k[0] == 'Y' || k[0] == 'Z' || k[0] == 'x' || k[0] == 'y' || k[0] == 'z') && k[1] == 0) { lua_pushnumber(L, v[(k[0] | 32) - 'x']); return 1; }
    double m = std::sqrt((double)v[0] * v[0] + (double)v[1] * v[1] + (double)v[2] * v[2]);
    if (!strcmp(k, "Magnitude")) { lua_pushnumber(L, m); return 1; }
    if (!strcmp(k, "Unit")) {
        float s = m > 0 ? (float)(1.0 / m) : 0.f;
        lua_pushvector(L, v[0] * s, v[1] * s, v[2] * s);
        return 1;
    }
    if (!strcmp(k, "Dot")) { lua_pushcfunction(L, vec_dot, "Dot"); return 1; }
    if (!strcmp(k, "Cross")) { lua_pushcfunction(L, vec_cross, "Cross"); return 1; }
    if (!strcmp(k, "Lerp")) { lua_pushcfunction(L, vec_lerp, "Lerp"); return 1; }
    if (!strcmp(k, "FuzzyEq")) { lua_pushcfunction(L, vec_fuzzyeq, "FuzzyEq"); return 1; }
    if (!strcmp(k, "Angle")) { lua_pushcfunction(L, vec_angle, "Angle"); return 1; }
    if (!strcmp(k, "Abs")) { lua_pushcfunction(L, vec_abs, "Abs"); return 1; }
    if (!strcmp(k, "Floor")) { lua_pushcfunction(L, vec_floor, "Floor"); return 1; }
    if (!strcmp(k, "Ceil")) { lua_pushcfunction(L, vec_ceil, "Ceil"); return 1; }
    if (!strcmp(k, "Sign")) { lua_pushcfunction(L, vec_sign, "Sign"); return 1; }
    if (!strcmp(k, "Min")) { lua_pushcfunction(L, vec_min, "Min"); return 1; }
    if (!strcmp(k, "Max")) { lua_pushcfunction(L, vec_max, "Max"); return 1; }
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

// ------------------------------------------------------------------ TweenInfo
// TweenInfo.new(time = 1, EasingStyle.Quad, EasingDirection.Out, repeatCount = 0, reverses = false, delayTime = 0)
static const char* enum_arg(lua_State* L, int idx, const char* type, const char* dflt) {
    if (lua_isnoneornil(L, idx)) return dflt;
    EnumItem* e = to_enum(L, idx);
    if (!e || strcmp(e->type, type)) luaL_error(L, "TweenInfo.new: argument %d must be an Enum.%s", idx, type);
    return e->name;
}
static int ti_new(lua_State* L) {
    double time = luaL_optnumber(L, 1, 1);
    const char* style = enum_arg(L, 2, "EasingStyle", "Quad");
    const char* dir = enum_arg(L, 3, "EasingDirection", "Out");
    int repeat = (int)luaL_optnumber(L, 4, 0);
    int reverses = lua_toboolean(L, 5);
    double delay = luaL_optnumber(L, 6, 0);
    push_ti(L, time, style, dir, repeat, reverses, delay);
    return 1;
}
static int ti_index(lua_State* L) {
    TI* t = to_ti(L, 1); if (!t) luaL_typeerror(L, 1, "TweenInfo");
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Time")) { lua_pushnumber(L, t->time); return 1; }
    if (!strcmp(k, "DelayTime")) { lua_pushnumber(L, t->delay); return 1; }
    if (!strcmp(k, "RepeatCount")) { lua_pushinteger(L, t->repeat); return 1; }
    if (!strcmp(k, "Reverses")) { lua_pushboolean(L, t->reverses); return 1; }
    if (!strcmp(k, "EasingStyle") || !strcmp(k, "EasingDirection")) {
        bool st = k[6] == 'S';
        const char* type = st ? "EasingStyle" : "EasingDirection", *name = st ? t->style : t->dir;
        int v = js_enum_value(type, name);
        push_enum(L, type, name, v);
        return 1;
    }
    luaL_error(L, "%s is not a valid member of TweenInfo", k);
    return 0;
}
static int ti_tostring(lua_State* L) {
    TI* t = to_ti(L, 1); if (!t) luaL_typeerror(L, 1, "TweenInfo");
    char buf[160];
    snprintf(buf, sizeof buf, "Time:%g DelayTime:%g RepeatCount:%d Reverses:%s EasingDirection:%s EasingStyle:%s", t->time, t->delay, t->repeat, t->reverses ? "true" : "false", t->dir, t->style);
    lua_pushstring(L, buf);
    return 1;
}
static int ti_eq(lua_State* L) {
    TI* a = to_ti(L, 1); TI* b = to_ti(L, 2);
    lua_pushboolean(L, a && b && a->time == b->time && a->delay == b->delay && a->repeat == b->repeat && a->reverses == b->reverses && !strcmp(a->style, b->style) && !strcmp(a->dir, b->dir));
    return 1;
}

// ------------------------------------------------------------------ Enum
static int enumitem_index(lua_State* L) {
    EnumItem* e = to_enum(L, 1);
    if (!e) luaL_typeerror(L, 1, "EnumItem");
    const char* k = luaL_checkstring(L, 2);
    if (!strcmp(k, "Name")) { lua_pushstring(L, e->name); return 1; }
    if (!strcmp(k, "Value")) { lua_pushinteger(L, e->value); return 1; }
    if (!strcmp(k, "EnumType")) { push_enum_type(L, e->type); return 1; }
    luaL_error(L, "%s is not a valid member of \"Enum.%s.%s\"", k, e->type, e->name);
    return 0;
}
static int enumitem_tostring(lua_State* L) {
    EnumItem* e = to_enum(L, 1);
    if (!e) luaL_typeerror(L, 1, "EnumItem");
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
    luaL_checktype(L, 1, LUA_TTABLE);
    lua_rawgetfield(L, 1, "__name");
    if (!lua_isstring(L, -1)) luaL_error(L, "invalid Enum");
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

// require(ModuleScript): runs the module's Source once and caches its single
// return value per module, as Roblox does. A module requiring itself (directly
// or round a cycle) errors. Modules run to completion: one that yields errors.
static int module_cache_ref;
static int l_require(lua_State* L) {
    int h = to_instance(L, 1);
    if (!h) luaL_error(L, "Attempted to call require with invalid argument(s).");
    lua_getref(L, module_cache_ref);
    lua_pushinteger(L, h);
    lua_rawget(L, -2);
    if (lua_islightuserdata(L, -1)) luaL_error(L, "Requested module was required recursively");
    if (!lua_isnil(L, -1)) { lua_remove(L, -2); return 1; }
    lua_pop(L, 1);
    js_index(h, "ClassName");
    char* cls = js_ret_str(0);
    bool isModule = cls && !strcmp(cls, "ModuleScript");
    free(cls);
    if (!isModule) luaL_error(L, "Attempted to call require with invalid argument(s).");
    lua_pushinteger(L, h); lua_pushlightuserdata(L, (void*)&module_cache_ref); lua_rawset(L, -3); // loading
    js_index(h, "Source");
    char* src = js_ret_str(0);
    js_index(h, "Name");
    char* name = js_ret_str(0);
    static const char* mutableGlobals[] = { "typeof", nullptr };
    lua_CompileOptions opts = {}; opts.optimizationLevel = 1; opts.debugLevel = 1; opts.mutableGlobals = mutableGlobals;
    size_t blen;
    char* bc = luau_compile(src ? src : "", src ? strlen(src) : 0, &opts, &blen);
    free(src);
    lua_State* T = lua_newthread(L);
    luaL_sandboxthread(T);
    push_instance(T, h);
    lua_setglobal(T, "script");
    std::string chunk = std::string("=") + (name ? name : "Module");
    free(name);
    int st = luau_load(T, chunk.c_str(), bc, blen, 0);
    free(bc);
    if (st == 0) st = lua_pcall(T, 0, LUA_MULTRET, 0);
    if (st != 0) {
        std::string err = lua_tostring(T, -1) ? lua_tostring(T, -1) : "module error";
        lua_pushinteger(L, h); lua_pushnil(L); lua_rawset(L, -4);
        luaL_error(L, "%s", err.c_str());
    }
    if (lua_gettop(T) != 1) {
        lua_pushinteger(L, h); lua_pushnil(L); lua_rawset(L, -4);
        luaL_error(L, "Module code did not return exactly one value");
    }
    lua_xmove(T, L, 1);                 // [cache, thread, result]
    lua_pushinteger(L, h); lua_pushvalue(L, -2); lua_rawset(L, -5);
    return 1;
}

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
    module_cache_ref = lua_ref(L0, -1);
    lua_pop(L0, 1);
    lua_pushcfunction(L0, l_require, "require");
    lua_setglobal(L0, "require");
    lua_pushcfunction(L0, l_time, "time");
    lua_setglobal(L0, "time");
    lua_pushcfunction(L0, l_tick, "tick");
    lua_setglobal(L0, "tick");

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
    lua_pushvector(L0, 1, 0, 0); lua_setfield(L0, -2, "xAxis");
    lua_pushvector(L0, 0, 1, 0); lua_setfield(L0, -2, "yAxis");
    lua_pushvector(L0, 0, 0, 1); lua_setfield(L0, -2, "zAxis");
    lua_setglobal(L0, "Vector3");

    // typeof(Vector3.new()) is "Vector3" in Roblox ("vector" is Luau's native name).
    lua_getglobal(L0, "typeof");
    lua_pushcclosurek(L0, l_typeof, "typeof", 1, nullptr);
    lua_setglobal(L0, "typeof");

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

    register_cframe(L0);
    register_gui_types(L0);
    luaL_newmetatable(L0, TWEENINFO_MT);
    lua_pushcfunction(L0, ti_index, "__index"); lua_setfield(L0, -2, "__index");
    lua_pushcfunction(L0, color_newindex, "__newindex"); lua_setfield(L0, -2, "__newindex");
    lua_pushcfunction(L0, ti_tostring, "__tostring"); lua_setfield(L0, -2, "__tostring");
    lua_pushcfunction(L0, ti_eq, "__eq"); lua_setfield(L0, -2, "__eq");
    lua_pushstring(L0, "TweenInfo"); lua_setfield(L0, -2, "__type");
    lua_pop(L0, 1);
    lua_newtable(L0);
    lua_pushcfunction(L0, ti_new, "new"); lua_setfield(L0, -2, "new");
    lua_setglobal(L0, "TweenInfo");

    lua_newtable(L0);
    lua_pushcfunction(L0, task_wait, "wait");
    lua_setfield(L0, -2, "wait");
    lua_pushcfunction(L0, task_spawn, "spawn");
    lua_setfield(L0, -2, "spawn");
    lua_pushcfunction(L0, task_delay, "delay");
    lua_setfield(L0, -2, "delay");
    lua_pushcfunction(L0, task_cancel, "cancel");
    lua_setfield(L0, -2, "cancel");
    lua_setglobal(L0, "task");
    lua_pushcfunction(L0, task_wait, "wait");
    lua_setglobal(L0, "wait");

    push_instance(L0, js_global("game"));
    lua_setglobal(L0, "game");
    push_instance(L0, js_global("workspace"));
    lua_setglobal(L0, "workspace");

    // Instance:WaitForChild(name, timeout?) yields until the child exists (or
    // the timeout passes, returning nil), warning after 5 s without a timeout.
    static const char* WAITFORCHILD = R"(
return function(self, name, timeout)
  local c = self:FindFirstChild(name)
  if c then return c end
  local thread = coroutine.running()
  local done = false
  local conn
  conn = self.ChildAdded:Connect(function(child)
    if not done and child.Name == name then done = true conn:Disconnect() task.spawn(thread, child) end
  end)
  local warning
  if timeout then
    local timer
    timer = task.delay(timeout, function() if not done then done = true conn:Disconnect() task.spawn(thread, nil) end end)
    warning = timer -- cancelled below once the child arrives
  else
    warning = task.delay(5, function()
      if not done then warn("Infinite yield possible on '" .. self:GetFullName() .. ':WaitForChild("' .. name .. '")' .. "'") end
    end)
  end
  local child = coroutine.yield()
  if warning then task.cancel(warning) end
  return child
end)";
    size_t wlen;
    char* wbc = luau_compile(WAITFORCHILD, strlen(WAITFORCHILD), nullptr, &wlen);
    if (luau_load(L0, "=WaitForChild", wbc, wlen, 0) != 0) js_print(lua_tostring(L0, -1), 2);
    free(wbc);
    if (lua_pcall(L0, 0, 1, 0) != LUA_OK) { js_print(lua_tostring(L0, -1), 2); lua_pop(L0, 1); lua_pushnil(L0); }
    waitforchild_ref = lua_ref(L0, -1);
    lua_pop(L0, 1);

    // Lock the shared metatables (as Roblox does), so one script can't
    // rewrite Instance, Color3 or EnumItem behaviour for every script.
    auto lock = [](int idx) {
        lua_pushstring(L0, "The metatable is locked");
        lua_setfield(L0, idx < 0 ? idx - 1 : idx, "__metatable");
        lua_setreadonly(L0, idx, true);
    };
    for (const char* mt : { INST_MT, SIGNAL_MT, CONN_MT, COLOR_MT, ENUMITEM_MT, ENUM_MT, CFRAME_MT, TWEENINFO_MT, UDIM_MT, UDIM2_MT, VEC2_MT }) { luaL_getmetatable(L0, mt); lock(-1); lua_pop(L0, 1); }
    lua_pushvector(L0, 0, 0, 0); lua_getmetatable(L0, -1); lock(-1); lua_pop(L0, 2);
    lua_getglobal(L0, "Enum"); lua_getmetatable(L0, -1); lock(-1); lua_pop(L0, 2);

    // _G and shared: in Roblox, tables every script can write and share (not
    // the globals themselves). The sandbox freezes every global table, so
    // they're unfrozen after it.
    lua_newtable(L0); lua_setglobal(L0, "_G");
    lua_newtable(L0); lua_setglobal(L0, "shared");
    luaL_sandbox(L0);
    for (const char* g : { "_G", "shared" }) { lua_getglobal(L0, g); lua_setreadonly(L0, -1, false); lua_pop(L0, 1); }
}

// A handler's ref, released when its instance is destroyed (after any queued fires ran).
EMSCRIPTEN_KEEPALIVE void cs_unref(int ref) { lua_unref(L0, ref); }

// Compile and start a script. Returns 0 on success, else prints the error.
EMSCRIPTEN_KEEPALIVE int cs_run(const char* chunkname, const char* source, int script_handle) {
    size_t blen;
    // typeof is overridden (Vector3), so the compiler mustn't inline it as a builtin.
    static const char* mutableGlobals[] = { "typeof", nullptr };
    lua_CompileOptions opts = {};
    opts.optimizationLevel = 1;
    opts.debugLevel = 1;
    opts.mutableGlobals = mutableGlobals;
    char* bc = luau_compile(source, strlen(source), &opts, &blen);
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
        if (w.since < 0) { resume(T, w.thread_ref, w.nargs); continue; }
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
