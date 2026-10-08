// CFrame: a position and a rotation matrix, as Roblox's (create.roblox.com/docs/reference/engine/datatypes/CFrame).
// Stored as 12 floats like Roblox's: x, y, z, then R00 R01 R02 R10 R11 R12 R20 R21 R22
// (rows; the columns are RightVector, UpVector and -LookVector). Math is in
// double, rounded to float on store. Immutable.
// Included by binding.cpp.

static const char* CFRAME_MT = "CFrame";
struct CF { float m[12]; };

static void push_cf(lua_State* L, const double* m) {
    CF* c = (CF*)lua_newuserdata(L, sizeof(CF));
    for (int i = 0; i < 12; i++) c->m[i] = (float)m[i];
    luaL_getmetatable(L, CFRAME_MT);
    lua_setmetatable(L, -2);
}
static CF* to_cf(lua_State* L, int idx) {
    if (lua_type(L, idx) != LUA_TUSERDATA || !lua_getmetatable(L, idx)) return nullptr;
    luaL_getmetatable(L, CFRAME_MT);
    bool ok = lua_rawequal(L, -1, -2);
    lua_pop(L, 2);
    return ok ? (CF*)lua_touserdata(L, idx) : nullptr;
}
static void check_cf(lua_State* L, int idx, double* m) {
    CF* c = to_cf(L, idx);
    if (!c) luaL_typeerror(L, idx, "CFrame");
    for (int i = 0; i < 12; i++) m[i] = c->m[i];
}
static void check_v3(lua_State* L, int idx, double* v) { const float* f = luaL_checkvector(L, idx); v[0] = f[0]; v[1] = f[1]; v[2] = f[2]; }
static void push_v3(lua_State* L, double x, double y, double z) { lua_pushvector(L, (float)x, (float)y, (float)z); }

// ---- math on double[12]
static void cf_identity(double* m) { static const double I[12] = { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }; memcpy(m, I, sizeof I); }
#define R(m, r, c) (m)[3 + (r) * 3 + (c)]
static void cf_mul(const double* a, const double* b, double* o) {
    double t[12];
    for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 3; c++) R(t, r, c) = R(a, r, 0) * R(b, 0, c) + R(a, r, 1) * R(b, 1, c) + R(a, r, 2) * R(b, 2, c);
        t[r] = a[r] + R(a, r, 0) * b[0] + R(a, r, 1) * b[1] + R(a, r, 2) * b[2];
    }
    memcpy(o, t, sizeof t);
}
static void cf_inverse(const double* a, double* o) {
    double t[12];
    for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++) R(t, r, c) = R(a, c, r);
    for (int r = 0; r < 3; r++) t[r] = -(R(t, r, 0) * a[0] + R(t, r, 1) * a[1] + R(t, r, 2) * a[2]);
    memcpy(o, t, sizeof t);
}
static void cf_point(const double* a, const double* v, double* o) { for (int r = 0; r < 3; r++) o[r] = a[r] + R(a, r, 0) * v[0] + R(a, r, 1) * v[1] + R(a, r, 2) * v[2]; }
static void cf_vector(const double* a, const double* v, double* o) { for (int r = 0; r < 3; r++) o[r] = R(a, r, 0) * v[0] + R(a, r, 1) * v[1] + R(a, r, 2) * v[2]; }
static void cf_vector_inv(const double* a, const double* v, double* o) { for (int r = 0; r < 3; r++) o[r] = R(a, 0, r) * v[0] + R(a, 1, r) * v[1] + R(a, 2, r) * v[2]; }

// Rotation matrices about the axes (right-handed, as Roblox).
static void rot_x(double a, double* m) { cf_identity(m); double c = std::cos(a), s = std::sin(a); R(m, 1, 1) = c; R(m, 1, 2) = -s; R(m, 2, 1) = s; R(m, 2, 2) = c; }
static void rot_y(double a, double* m) { cf_identity(m); double c = std::cos(a), s = std::sin(a); R(m, 0, 0) = c; R(m, 0, 2) = s; R(m, 2, 0) = -s; R(m, 2, 2) = c; }
static void rot_z(double a, double* m) { cf_identity(m); double c = std::cos(a), s = std::sin(a); R(m, 0, 0) = c; R(m, 0, 1) = -s; R(m, 1, 0) = s; R(m, 1, 1) = c; }
// XYZ: Rx * Ry * Rz (applied Z, then Y, then X). YXZ: Ry * Rx * Rz (Orientation's order).
static void euler_xyz(double x, double y, double z, double* m) { double a[12], b[12], c[12]; rot_x(x, a); rot_y(y, b); rot_z(z, c); cf_mul(a, b, m); cf_mul(m, c, m); }
static void euler_yxz(double x, double y, double z, double* m) { double a[12], b[12], c[12]; rot_y(y, a); rot_x(x, b); rot_z(z, c); cf_mul(a, b, m); cf_mul(m, c, m); }
static double clamp1(double v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
static void to_xyz(const double* m, double* e) {
    e[1] = std::asin(clamp1(R(m, 0, 2)));
    if (std::fabs(R(m, 0, 2)) < 0.9999999) { e[0] = std::atan2(-R(m, 1, 2), R(m, 2, 2)); e[2] = std::atan2(-R(m, 0, 1), R(m, 0, 0)); }
    else { e[0] = std::atan2(R(m, 2, 1), R(m, 1, 1)); e[2] = 0; }
}
static void to_yxz(const double* m, double* e) {
    e[0] = std::asin(clamp1(-R(m, 1, 2)));
    if (std::fabs(R(m, 1, 2)) < 0.9999999) { e[1] = std::atan2(R(m, 0, 2), R(m, 2, 2)); e[2] = std::atan2(R(m, 1, 0), R(m, 1, 1)); }
    else { e[1] = std::atan2(-R(m, 2, 0), R(m, 0, 0)); e[2] = 0; }
}
// Quaternions (x, y, z, w), standard: v' = q v q*.
static void to_quat(const double* m, double* q) {
    double t = R(m, 0, 0) + R(m, 1, 1) + R(m, 2, 2);
    if (t > 0) { double s = std::sqrt(t + 1) * 2; q[3] = s / 4; q[0] = (R(m, 2, 1) - R(m, 1, 2)) / s; q[1] = (R(m, 0, 2) - R(m, 2, 0)) / s; q[2] = (R(m, 1, 0) - R(m, 0, 1)) / s; }
    else if (R(m, 0, 0) > R(m, 1, 1) && R(m, 0, 0) > R(m, 2, 2)) { double s = std::sqrt(1 + R(m, 0, 0) - R(m, 1, 1) - R(m, 2, 2)) * 2; q[3] = (R(m, 2, 1) - R(m, 1, 2)) / s; q[0] = s / 4; q[1] = (R(m, 0, 1) + R(m, 1, 0)) / s; q[2] = (R(m, 0, 2) + R(m, 2, 0)) / s; }
    else if (R(m, 1, 1) > R(m, 2, 2)) { double s = std::sqrt(1 + R(m, 1, 1) - R(m, 0, 0) - R(m, 2, 2)) * 2; q[3] = (R(m, 0, 2) - R(m, 2, 0)) / s; q[0] = (R(m, 0, 1) + R(m, 1, 0)) / s; q[1] = s / 4; q[2] = (R(m, 1, 2) + R(m, 2, 1)) / s; }
    else { double s = std::sqrt(1 + R(m, 2, 2) - R(m, 0, 0) - R(m, 1, 1)) * 2; q[3] = (R(m, 1, 0) - R(m, 0, 1)) / s; q[0] = (R(m, 0, 2) + R(m, 2, 0)) / s; q[1] = (R(m, 1, 2) + R(m, 2, 1)) / s; q[2] = s / 4; }
}
static void from_quat(double x, double y, double z, double w, double* m) {
    double n = std::sqrt(x * x + y * y + z * z + w * w);
    if (n == 0) { x = y = z = 0; w = 1; } else { x /= n; y /= n; z /= n; w /= n; }
    R(m, 0, 0) = 1 - 2 * (y * y + z * z); R(m, 0, 1) = 2 * (x * y - w * z); R(m, 0, 2) = 2 * (x * z + w * y);
    R(m, 1, 0) = 2 * (x * y + w * z); R(m, 1, 1) = 1 - 2 * (x * x + z * z); R(m, 1, 2) = 2 * (y * z - w * x);
    R(m, 2, 0) = 2 * (x * z - w * y); R(m, 2, 1) = 2 * (y * z + w * x); R(m, 2, 2) = 1 - 2 * (x * x + y * y);
}
static void axis_angle(const double* v, double a, double* m) {
    double n = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    cf_identity(m);
    if (n == 0) return;
    double s = std::sin(a / 2) / n;
    from_quat(v[0] * s, v[1] * s, v[2] * s, std::cos(a / 2), m);
}
static void unit(double* v) { double n = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); if (n > 0) { v[0] /= n; v[1] /= n; v[2] /= n; } }
static void cross(const double* a, const double* b, double* o) { double t[3] = { a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0] }; memcpy(o, t, sizeof t); }
static void set_cols(double* m, const double* rx, const double* uy, const double* bz) { for (int r = 0; r < 3; r++) { R(m, r, 0) = rx[r]; R(m, r, 1) = uy[r]; R(m, r, 2) = bz[r]; } }
// Looking from `at` toward `target`: back = -(target - at).Unit, right = up x back.
// Looking straight along `up`, Roblox's result isn't documented; this keeps right = +X.
static void look_at(const double* at, const double* target, const double* up, double* m) {
    double f[3] = { target[0] - at[0], target[1] - at[1], target[2] - at[2] };
    unit(f);
    double b[3] = { -f[0], -f[1], -f[2] }, r[3], u[3];
    cross(up, b, r);
    if (r[0] * r[0] + r[1] * r[1] + r[2] * r[2] < 1e-12) { r[0] = 1; r[1] = r[2] = 0; }
    unit(r);
    cross(b, r, u);
    cf_identity(m);
    m[0] = at[0]; m[1] = at[1]; m[2] = at[2];
    if (f[0] == 0 && f[1] == 0 && f[2] == 0) return; // target == at: no rotation
    set_cols(m, r, u, b);
}
// Gram-Schmidt on the columns, keeping the right vector's direction.
static void orthonormalize(double* m) {
    double x[3] = { R(m, 0, 0), R(m, 1, 0), R(m, 2, 0) }, y[3] = { R(m, 0, 1), R(m, 1, 1), R(m, 2, 1) }, z[3];
    unit(x); cross(x, y, z); unit(z); cross(z, x, y);
    set_cols(m, x, y, z);
}
static void cf_lerp(const double* a, const double* b, double t, double* o) {
    double qa[4], qb[4];
    to_quat(a, qa); to_quat(b, qb);
    double d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    if (d < 0) { d = -d; for (int i = 0; i < 4; i++) qb[i] = -qb[i]; } // the shorter way round
    double wa, wb;
    if (d > 0.9995) { wa = 1 - t; wb = t; }
    else { double th = std::acos(d), s = std::sin(th); wa = std::sin((1 - t) * th) / s; wb = std::sin(t * th) / s; }
    from_quat(qa[0] * wa + qb[0] * wb, qa[1] * wa + qb[1] * wb, qa[2] * wa + qb[2] * wb, qa[3] * wa + qb[3] * wb, o);
    for (int i = 0; i < 3; i++) o[i] = a[i] + (b[i] - a[i]) * t;
}

// ---- constructors
static int cf_new(lua_State* L) {
    double m[12]; cf_identity(m);
    int n = lua_gettop(L);
    if (n == 0) { push_cf(L, m); return 1; }
    if (lua_isvector(L, 1)) {
        check_v3(L, 1, m);
        if (n >= 2) { double at[3], tg[3], up[3] = { 0, 1, 0 }; check_v3(L, 1, at); check_v3(L, 2, tg); look_at(at, tg, up, m); }
        push_cf(L, m); return 1;
    }
    if (n == 3) { for (int i = 0; i < 3; i++) m[i] = luaL_checknumber(L, i + 1); push_cf(L, m); return 1; }
    if (n == 7) {
        for (int i = 0; i < 3; i++) m[i] = luaL_checknumber(L, i + 1);
        from_quat(luaL_checknumber(L, 4), luaL_checknumber(L, 5), luaL_checknumber(L, 6), luaL_checknumber(L, 7), m);
        push_cf(L, m); return 1;
    }
    if (n == 12) { for (int i = 0; i < 12; i++) m[i] = luaL_checknumber(L, i + 1); push_cf(L, m); return 1; }
    luaL_error(L, "Invalid number of arguments: %d", n);
    return 0;
}
static int cf_lookAt(lua_State* L) {
    double at[3], tg[3], up[3] = { 0, 1, 0 }, m[12];
    check_v3(L, 1, at); check_v3(L, 2, tg);
    if (lua_isvector(L, 3)) check_v3(L, 3, up);
    look_at(at, tg, up, m); push_cf(L, m); return 1;
}
static int cf_angles(lua_State* L) { double m[12]; euler_xyz(luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0), luaL_optnumber(L, 3, 0), m); push_cf(L, m); return 1; }
static int cf_fromYXZ(lua_State* L) { double m[12]; euler_yxz(luaL_optnumber(L, 1, 0), luaL_optnumber(L, 2, 0), luaL_optnumber(L, 3, 0), m); push_cf(L, m); return 1; }
static int cf_fromAxisAngle(lua_State* L) { double v[3], m[12]; check_v3(L, 1, v); axis_angle(v, luaL_checknumber(L, 2), m); push_cf(L, m); return 1; }
static int cf_fromMatrix(lua_State* L) {
    double p[3], x[3], y[3], z[3], m[12];
    check_v3(L, 1, p); check_v3(L, 2, x); check_v3(L, 3, y);
    if (lua_isvector(L, 4)) check_v3(L, 4, z); else { cross(x, y, z); unit(z); }
    cf_identity(m); m[0] = p[0]; m[1] = p[1]; m[2] = p[2]; set_cols(m, x, y, z);
    push_cf(L, m); return 1;
}

// ---- methods
static int cf_m_inverse(lua_State* L) { double a[12]; check_cf(L, 1, a); cf_inverse(a, a); push_cf(L, a); return 1; }
static int cf_m_lerp(lua_State* L) { double a[12], b[12], o[12]; check_cf(L, 1, a); check_cf(L, 2, b); cf_lerp(a, b, luaL_checknumber(L, 3), o); push_cf(L, o); return 1; }
static int cf_m_orthonormalize(lua_State* L) { double a[12]; check_cf(L, 1, a); orthonormalize(a); push_cf(L, a); return 1; }
// ToWorldSpace(cf...) = self * cf; ToObjectSpace(cf...) = self:Inverse() * cf. Each takes any number of arguments.
static int cf_m_space(lua_State* L, bool world) {
    double a[12], inv[12], b[12]; check_cf(L, 1, a); cf_inverse(a, inv);
    int n = lua_gettop(L);
    for (int i = 2; i <= n; i++) { check_cf(L, i, b); cf_mul(world ? a : inv, b, b); push_cf(L, b); }
    return n - 1;
}
static int cf_m_toWorld(lua_State* L) { return cf_m_space(L, true); }
static int cf_m_toObject(lua_State* L) { return cf_m_space(L, false); }
static int cf_m_vecs(lua_State* L, int mode) { // 0 point->world, 1 point->object, 2 vector->world, 3 vector->object
    double a[12], inv[12], v[3], o[3]; check_cf(L, 1, a); cf_inverse(a, inv);
    int n = lua_gettop(L);
    for (int i = 2; i <= n; i++) {
        check_v3(L, i, v);
        if (mode == 0) cf_point(a, v, o); else if (mode == 1) cf_point(inv, v, o); else if (mode == 2) cf_vector(a, v, o); else cf_vector_inv(a, v, o);
        push_v3(L, o[0], o[1], o[2]);
    }
    return n - 1;
}
static int cf_m_p2w(lua_State* L) { return cf_m_vecs(L, 0); }
static int cf_m_p2o(lua_State* L) { return cf_m_vecs(L, 1); }
static int cf_m_v2w(lua_State* L) { return cf_m_vecs(L, 2); }
static int cf_m_v2o(lua_State* L) { return cf_m_vecs(L, 3); }
static int cf_m_components(lua_State* L) { CF* c = to_cf(L, 1); if (!c) luaL_typeerror(L, 1, "CFrame"); for (int i = 0; i < 12; i++) lua_pushnumber(L, c->m[i]); return 12; }
static int cf_m_toXYZ(lua_State* L) { double a[12], e[3]; check_cf(L, 1, a); to_xyz(a, e); for (int i = 0; i < 3; i++) lua_pushnumber(L, e[i]); return 3; }
static int cf_m_toYXZ(lua_State* L) { double a[12], e[3]; check_cf(L, 1, a); to_yxz(a, e); for (int i = 0; i < 3; i++) lua_pushnumber(L, e[i]); return 3; }
static int cf_m_toAxisAngle(lua_State* L) {
    double a[12], q[4]; check_cf(L, 1, a); to_quat(a, q);
    if (q[3] < 0) for (int i = 0; i < 4; i++) q[i] = -q[i];
    double s = std::sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]), ang = 2 * std::atan2(s, q[3]);
    if (s < 1e-12) push_v3(L, 1, 0, 0); else push_v3(L, q[0] / s, q[1] / s, q[2] / s);
    lua_pushnumber(L, ang); return 2;
}
static int cf_m_fuzzyeq(lua_State* L) {
    double a[12], b[12]; check_cf(L, 1, a); check_cf(L, 2, b); double e = luaL_optnumber(L, 3, 1e-5);
    bool ok = true;
    for (int i = 0; i < 12; i++) if (std::fabs(a[i] - b[i]) > e) ok = false;
    lua_pushboolean(L, ok); return 1;
}

static int cf_index(lua_State* L) {
    double m[12]; check_cf(L, 1, m);
    const char* k = luaL_checkstring(L, 2);
    if (!k[1] && (k[0] == 'X' || k[0] == 'Y' || k[0] == 'Z')) { lua_pushnumber(L, (float)m[k[0] - 'X']); return 1; }
    if (!strcmp(k, "Position") || !strcmp(k, "p")) { push_v3(L, m[0], m[1], m[2]); return 1; }
    if (!strcmp(k, "Rotation")) { m[0] = m[1] = m[2] = 0; push_cf(L, m); return 1; }
    if (!strcmp(k, "RightVector") || !strcmp(k, "XVector") || !strcmp(k, "rightVector")) { push_v3(L, R(m, 0, 0), R(m, 1, 0), R(m, 2, 0)); return 1; }
    if (!strcmp(k, "UpVector") || !strcmp(k, "YVector") || !strcmp(k, "upVector")) { push_v3(L, R(m, 0, 1), R(m, 1, 1), R(m, 2, 1)); return 1; }
    if (!strcmp(k, "ZVector")) { push_v3(L, R(m, 0, 2), R(m, 1, 2), R(m, 2, 2)); return 1; }
    if (!strcmp(k, "LookVector") || !strcmp(k, "lookVector")) { push_v3(L, -R(m, 0, 2), -R(m, 1, 2), -R(m, 2, 2)); return 1; }
    static const struct { const char* name; lua_CFunction fn; } M[] = {
        { "Inverse", cf_m_inverse }, { "inverse", cf_m_inverse }, { "Lerp", cf_m_lerp }, { "lerp", cf_m_lerp },
        { "Orthonormalize", cf_m_orthonormalize }, { "ToWorldSpace", cf_m_toWorld }, { "toWorldSpace", cf_m_toWorld },
        { "ToObjectSpace", cf_m_toObject }, { "toObjectSpace", cf_m_toObject },
        { "PointToWorldSpace", cf_m_p2w }, { "pointToWorldSpace", cf_m_p2w }, { "PointToObjectSpace", cf_m_p2o }, { "pointToObjectSpace", cf_m_p2o },
        { "VectorToWorldSpace", cf_m_v2w }, { "vectorToWorldSpace", cf_m_v2w }, { "VectorToObjectSpace", cf_m_v2o }, { "vectorToObjectSpace", cf_m_v2o },
        { "GetComponents", cf_m_components }, { "components", cf_m_components },
        { "ToEulerAnglesXYZ", cf_m_toXYZ }, { "toEulerAnglesXYZ", cf_m_toXYZ }, { "ToEulerAnglesYXZ", cf_m_toYXZ }, { "toEulerAnglesYXZ", cf_m_toYXZ },
        { "ToOrientation", cf_m_toYXZ }, { "ToAxisAngle", cf_m_toAxisAngle }, { "toAxisAngle", cf_m_toAxisAngle }, { "FuzzyEq", cf_m_fuzzyeq },
    };
    for (auto& e : M) if (!strcmp(k, e.name)) { lua_pushcfunction(L, e.fn, e.name); return 1; }
    luaL_error(L, "%s is not a valid member of CFrame", k);
    return 0;
}
static int cf_newindex(lua_State* L) { luaL_error(L, "%s cannot be assigned to", luaL_checkstring(L, 2)); return 0; }
// CFrame * CFrame, CFrame * Vector3 (a point), CFrame +/- Vector3 (moves the position).
static int cf_mulop(lua_State* L) {
    double a[12]; check_cf(L, 1, a);
    if (lua_isvector(L, 2)) { double v[3], o[3]; check_v3(L, 2, v); cf_point(a, v, o); push_v3(L, o[0], o[1], o[2]); return 1; }
    double b[12]; check_cf(L, 2, b); cf_mul(a, b, a); push_cf(L, a); return 1;
}
static int cf_addsub(lua_State* L, double sign) {
    double a[12], v[3];
    if (!to_cf(L, 1)) luaL_error(L, "attempt to perform arithmetic on a %s value", luaL_typename(L, 1));
    check_cf(L, 1, a); check_v3(L, 2, v);
    for (int i = 0; i < 3; i++) a[i] += sign * v[i];
    push_cf(L, a); return 1;
}
static int cf_add(lua_State* L) { return cf_addsub(L, 1); }
static int cf_sub(lua_State* L) { return cf_addsub(L, -1); }
static int cf_eq(lua_State* L) {
    CF* a = to_cf(L, 1); CF* b = to_cf(L, 2);
    lua_pushboolean(L, a && b && !memcmp(a->m, b->m, sizeof a->m));
    return 1;
}
static int cf_tostring(lua_State* L) {
    CF* c = to_cf(L, 1); if (!c) luaL_typeerror(L, 1, "CFrame");
    std::string s;
    char buf[32];
    for (int i = 0; i < 12; i++) { snprintf(buf, sizeof buf, i ? ", %.9g" : "%.9g", c->m[i]); s += buf; }
    lua_pushstring(L, s.c_str());
    return 1;
}

static void register_cframe(lua_State* L) {
    luaL_newmetatable(L, CFRAME_MT);
    const struct { const char* k; lua_CFunction f; } mm[] = {
        { "__index", cf_index }, { "__newindex", cf_newindex }, { "__mul", cf_mulop }, { "__add", cf_add }, { "__sub", cf_sub },
        { "__eq", cf_eq }, { "__tostring", cf_tostring },
    };
    for (auto& e : mm) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); }
    lua_pushstring(L, "CFrame");
    lua_setfield(L, -2, "__type");
    lua_pop(L, 1);

    lua_newtable(L);
    const struct { const char* k; lua_CFunction f; } fns[] = {
        { "new", cf_new }, { "lookAt", cf_lookAt }, { "Angles", cf_angles }, { "fromEulerAnglesXYZ", cf_angles },
        { "fromEulerAnglesYXZ", cf_fromYXZ }, { "fromOrientation", cf_fromYXZ }, { "fromAxisAngle", cf_fromAxisAngle }, { "fromMatrix", cf_fromMatrix },
    };
    for (auto& e : fns) { lua_pushcfunction(L, e.f, e.k); lua_setfield(L, -2, e.k); }
    double I[12]; cf_identity(I);
    push_cf(L, I);
    lua_setfield(L, -2, "identity");
    lua_setreadonly(L, -1, true);
    lua_setglobal(L, "CFrame");
}
#undef R
