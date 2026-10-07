// The engine pieces the server needs but the oracle doesn't: console,
// network, renderer, sys. V_CalcRoll is view.c's, copied verbatim.
#include "quakedef.h"
#include <stdarg.h>
#include <sys/stat.h>
extern jmp_buf host_abortserver;
client_static_t cls;
unsigned short d_8to16table[256];
static texture_t notex;
texture_t *r_notexture_mip = &notex;
int r_pixbytes = 1;
float scr_centertime_off;
int net_activeconnections;
sizebuf_t net_message;
static int verbose = -1;
void Con_Printf(char *fmt, ...) { va_list a; if (verbose < 0) verbose = getenv("ORACLE_VERBOSE") != 0; if (!verbose) return; va_start(a, fmt); vfprintf(stderr, fmt, a); va_end(a); }
void Con_DPrintf(char *fmt, ...) {}
void Sys_Printf(char *fmt, ...) {}
void Draw_BeginDisc(void) {}
void Draw_EndDisc(void) {}
void R_InitSky(texture_t *t) {}
void Host_ClearMemory(void) { Mod_ClearAll(); memset(&sv, 0, sizeof(sv)); }
void Host_ClientCommands(char *fmt, ...) {}
void SV_BroadcastPrintf(char *fmt, ...) {}
void SV_DropClient(qboolean crash) {}
void Host_Error(char *fmt, ...) { va_list a; va_start(a, fmt); fprintf(stderr, "Host_Error: "); vfprintf(stderr, fmt, a); fprintf(stderr, "\n"); va_end(a); longjmp(host_abortserver, 1); }
void Sys_Error(char *fmt, ...) { va_list a; va_start(a, fmt); fprintf(stderr, "Sys_Error: "); vfprintf(stderr, fmt, a); fprintf(stderr, "\n"); va_end(a); exit(1); }
qboolean NET_CanSendMessage(qsocket_t *s) { return 1; }
qsocket_t *NET_CheckNewConnections(void) { return 0; }
int NET_GetMessage(qsocket_t *s) { return 0; }
int NET_SendMessage(qsocket_t *s, sizebuf_t *d) { return 1; }
int NET_SendUnreliableMessage(qsocket_t *s, sizebuf_t *d) { return 1; }
int NET_SendToAll(sizebuf_t *d, int t) { return 0; }
static FILE *handles[64];
static int findhandle(void) { int i; for (i = 1; i < 64; i++) if (!handles[i]) return i; Sys_Error("out of handles"); return -1; }
int Sys_FileOpenRead(char *path, int *hndl) {
	FILE *f = fopen(path, "rb"); int i, l;
	if (!f) { *hndl = -1; return -1; }
	i = findhandle(); handles[i] = f; *hndl = i;
	fseek(f, 0, SEEK_END); l = ftell(f); fseek(f, 0, SEEK_SET); return l;
}
int Sys_FileOpenWrite(char *path) { FILE *f = fopen(path, "wb"); int i; if (!f) return -1; i = findhandle(); handles[i] = f; return i; }
void Sys_FileClose(int h) { fclose(handles[h]); handles[h] = 0; }
void Sys_FileSeek(int h, int p) { fseek(handles[h], p, SEEK_SET); }
int Sys_FileRead(int h, void *d, int c) { return fread(d, 1, c, handles[h]); }
int Sys_FileWrite(int h, void *d, int c) { return fwrite(d, 1, c, handles[h]); }
int Sys_FileTime(char *path) { FILE *f = fopen(path, "rb"); if (f) { fclose(f); return 1; } return -1; }
void Sys_mkdir(char *path) { mkdir(path, 0777); }

extern cvar_t cl_rollspeed, cl_rollangle;
float V_CalcRoll (vec3_t angles, vec3_t velocity)
{
	vec3_t forward, right, up;
	float	sign;
	float	side;
	float	value;
	AngleVectors (angles, forward, right, up);
	side = DotProduct (velocity, right);
	sign = side < 0 ? -1 : 1;
	side = fabs(side);
	value = cl_rollangle.value;
	if (side < cl_rollspeed.value)
		side = side * value / cl_rollspeed.value;
	else
		side = value;
	return side*sign;
}
