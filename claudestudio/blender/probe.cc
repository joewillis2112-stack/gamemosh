// Native link probe: build a cube with Blender's own BMesh operators and dump it.
#include "bmesh.hh"
#include "BLI_math_matrix.h"
#include <cstdio>
int main() {
  BMeshCreateParams p = {}; p.use_toolflags = true;
  BMesh *bm = BM_mesh_create(&bm_mesh_allocsize_default, &p);
  float m[4][4]; unit_m4(m);
  BMO_op_callf(bm, BMO_FLAG_DEFAULTS, "create_cube calc_uvs=%b size=%f matrix=%m4", false, 2.0f, m);
  BMOperator op; BMO_op_initf(bm, &op, BMO_FLAG_DEFAULTS, "inset_individual faces=%af thickness=%f depth=%f", 0.2f, 0.1f);
  BMO_op_exec(bm, &op); BMO_op_finish(bm, &op);
  printf("%d %d %d\n", bm->totvert, bm->totedge, bm->totface);
  BMIter it; BMVert *v; BM_ITER_MESH (v, &it, bm, BM_VERTS_OF_MESH) printf("%a %a %a\n", v->co[0], v->co[1], v->co[2]);
  BM_mesh_free(bm);
}
