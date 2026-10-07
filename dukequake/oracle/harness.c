// Oracle: id's own Quake server C (pr_*, sv_*, world, model, ...) driven
// headless, the same way dqengine's Server::frame drives the Rust port.
// Usage: harness <basedir containing id1/pak0.pak> <map> <cmds.txt> <out.bin> [skill]
#include "quakedef.h"

quakeparms_t host_parms;
qboolean host_initialized;
double host_frametime;
double realtime;
double host_time;
int host_framecount;
client_t *host_client;
int current_skill;
cvar_t skill = {"skill", "1"};
cvar_t deathmatch = {"deathmatch", "0"};
cvar_t coop = {"coop", "0"};
cvar_t teamplay = {"teamplay", "0"};
cvar_t fraglimit = {"fraglimit", "0"};
cvar_t timelimit = {"timelimit", "0"};
cvar_t samelevel = {"samelevel", "0"};
cvar_t noexit = {"noexit", "0"};
cvar_t hostname = {"hostname", "UNNAMED"};
cvar_t developer = {"developer", "0"};
cvar_t pausable = {"pausable", "1"};
cvar_t temp1 = {"temp1", "0"};
cvar_t cl_rollspeed = {"cl_rollspeed", "200"};
cvar_t cl_rollangle = {"cl_rollangle", "2.0"};
cvar_t registered_stub;
jmp_buf host_abortserver;
keydest_t key_dest = key_game;

static FILE *out;
static unsigned fnv(const char *s) { unsigned h = 2166136261u; while (*s) { h ^= (unsigned char)*s++; h *= 16777619u; } return h; }

static void dump(int frame) {
	int i, j;
	unsigned w;
	fwrite(&frame, 4, 1, out);
	fwrite(&sv.time, 8, 1, out);
	fwrite(&sv.num_edicts, 4, 1, out);
	for (i = 0; i < sv.num_edicts; i++) {
		edict_t *e = EDICT_NUM(i);
		unsigned char fr = e->free;
		fwrite(&fr, 1, 1, out);
		for (j = 0; j < progs->entityfields; j++) {
			w = ((unsigned *)&e->v)[j];
			fwrite(&w, 4, 1, out);
		}
	}
	// field and global string types are mapped to content hashes by the reader
	w = progs->numglobals;
	fwrite(&w, 4, 1, out);
	for (i = 0; i < progs->numglobals; i++) {
		w = ((unsigned *)pr_globals)[i];
		fwrite(&w, 4, 1, out);
	}
	// string table for hashing: every string field/global value's content hash
	for (i = 0; i < sv.num_edicts; i++) {
		edict_t *e = EDICT_NUM(i);
		for (j = 1; j < progs->numfielddefs; j++) {
			ddef_t *d = &pr_fielddefs[j];
			if ((d->type & ~DEF_SAVEGLOBAL) != ev_string) continue;
			w = fnv(pr_strings + ((int *)&e->v)[d->ofs]);
			fwrite(&w, 4, 1, out);
		}
	}
	for (j = 1; j < progs->numglobaldefs; j++) {
		ddef_t *d = &pr_globaldefs[j];
		if ((d->type & ~DEF_SAVEGLOBAL) != ev_string) continue;
		w = fnv(pr_strings + ((int *)pr_globals)[d->ofs]);
		fwrite(&w, 4, 1, out);
	}
}

static struct qsocket_s fakesock;

int main(int argc, char **argv) {
	static char *fargv[] = {"harness", 0};
	int frame;
	FILE *cf;
	host_parms.basedir = argv[1];
	host_parms.memsize = 64 * 1024 * 1024;
	host_parms.membase = malloc(host_parms.memsize);
	COM_InitArgv(1, fargv);
	Memory_Init(host_parms.membase, host_parms.memsize);
	Cbuf_Init();
	Cmd_Init();
	COM_Init(host_parms.basedir);
	Cvar_RegisterVariable(&skill);
	Cvar_RegisterVariable(&deathmatch);
	Cvar_RegisterVariable(&coop);
	Cvar_RegisterVariable(&teamplay);
	Cvar_RegisterVariable(&fraglimit);
	Cvar_RegisterVariable(&timelimit);
	Cvar_RegisterVariable(&samelevel);
	Cvar_RegisterVariable(&noexit);
	Cvar_RegisterVariable(&hostname);
	Cvar_RegisterVariable(&developer);
	Cvar_RegisterVariable(&pausable);
	Cvar_RegisterVariable(&temp1);
	Cvar_RegisterVariable(&cl_rollspeed);
	Cvar_RegisterVariable(&cl_rollangle);
	Mod_Init();
	PR_Init();
	SV_Init();
	svs.maxclients = 1;
	svs.maxclientslimit = 1;
	svs.clients = calloc(svs.maxclientslimit, sizeof(client_t));
	if (argc > 5) Cvar_Set("skill", argv[5]);
	srand(1);

	if (setjmp(host_abortserver)) { printf("Host_Error\n"); return 1; }
	SV_SpawnServer(argv[2]);
	if (!sv.active) { printf("spawn failed\n"); return 1; }

	// SV_ConnectClient
	host_client = svs.clients;
	strcpy(fakesock.address, "local");
	host_client->netconnection = &fakesock;
	SV_ConnectClient(0);
	// Host_Spawn_f
	{
		int i;
		edict_t *ent = host_client->edict;
		sv_player = ent;
		strcpy(host_client->name, "player");
		memset(&ent->v, 0, progs->entityfields * 4);
		ent->v.colormap = NUM_FOR_EDICT(ent);
		ent->v.team = (host_client->colors & 15) + 1;
		ent->v.netname = host_client->name - pr_strings;
		for (i = 0; i < NUM_SPAWN_PARMS; i++) (&pr_global_struct->parm1)[i] = host_client->spawn_parms[i];
		pr_global_struct->time = sv.time;
		pr_global_struct->self = EDICT_TO_PROG(sv_player);
		PR_ExecuteProgram(pr_global_struct->ClientConnect);
		PR_ExecuteProgram(pr_global_struct->PutClientInServer);
		host_client->spawned = true;
	}

	out = fopen(argv[4], "wb");
	cf = fopen(argv[3], "r");
	dump(-1);
	for (frame = 0;; frame++) {
		float a[3], fm, sm, um, dt;
		int buttons, impulse, i;
		if (fscanf(cf, "%f %f %f %f %f %f %f %d %d", &dt, &a[0], &a[1], &a[2], &fm, &sm, &um, &buttons, &impulse) != 9) break;
		host_frametime = dt;
		rand();
		pr_global_struct->frametime = host_frametime;
		SZ_Clear(&sv.datagram);
		// SV_RunClients: SV_ReadClientMove's effects, then SV_ClientThink
		host_client = svs.clients;
		sv_player = host_client->edict;
		for (i = 0; i < 3; i++) {
			signed char c = (signed char)(((int)a[i] * 256 / 360) & 255);
			sv_player->v.v_angle[i] = c * (360.0 / 256);
		}
		host_client->cmd.forwardmove = (short)(int)fm;
		host_client->cmd.sidemove = (short)(int)sm;
		host_client->cmd.upmove = (short)(int)um;
		sv_player->v.button0 = buttons & 1;
		sv_player->v.button2 = (buttons & 2) >> 1;
		if (impulse) sv_player->v.impulse = impulse;
		SV_ClientThink();
		SV_Physics();
		// SV_SendClientMessages's side effects on state
		{
			byte buf[MAX_DATAGRAM];
			sizebuf_t msg;
			msg.data = buf; msg.maxsize = sizeof(buf); msg.cursize = 0; msg.allowoverflow = true; msg.overflowed = false;
			SV_WriteClientdataToMessage(sv_player, &msg);
			for (i = 1; i < sv.num_edicts; i++) {
				edict_t *e = EDICT_NUM(i);
				e->v.effects = (int)e->v.effects & ~EF_MUZZLEFLASH;
			}
		}
		SZ_Clear(&host_client->message);
		SZ_Clear(&sv.reliable_datagram);
		SZ_Clear(&sv.signon);
		dump(frame);
	}
	fclose(out);
	printf("ok %d frames, %d edicts\n", frame, sv.num_edicts);
	return 0;
}
