// Carrion crows: perch at grim places, scatter into the sky when you come close.
import * as THREE from 'three';

const bodyGeo = new THREE.BoxGeometry(0.16, 0.14, 0.34);
const headGeo = new THREE.BoxGeometry(0.1, 0.1, 0.12);
const wingGeo = new THREE.BoxGeometry(0.34, 0.02, 0.2);
wingGeo.translate(0.17, 0, 0);
const mat = new THREE.MeshLambertMaterial({ color: 0x141214 });
const CROW_PLACES = new Set(['gallows', 'wreck', 'necropolis', 'keep', 'camp', 'cairn', 'hamlet', 'stones']);

function makeCrow() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bodyGeo, mat));
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 0.07, 0.2);
  g.add(head);
  const wl = new THREE.Mesh(wingGeo, mat);
  const wr = new THREE.Mesh(wingGeo, mat);
  wl.position.set(0.05, 0.03, 0); wr.position.set(-0.05, 0.03, 0);
  wr.rotation.y = Math.PI;
  g.add(wl, wr);
  g.userData = { wl, wr, head };
  return g;
}

export function spawnCrows(loc, group, gen, rng) {
  if (!CROW_PLACES.has(loc.type) || rng.next() > 0.8) return [];
  const n = 3 + Math.floor(rng.next() * 5);
  const crows = [];
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2, r = 3 + rng.next() * (loc.kind === 'major' ? 18 : 6);
    const x = loc.x + Math.cos(a) * r, z = loc.z + Math.sin(a) * r;
    const m = makeCrow();
    const y = gen.height(x, z) + 0.08;
    m.position.set(x, y, z);
    m.rotation.y = rng.next() * 6.28;
    group.add(m);
    crows.push({ m, state: 'perch', t: rng.next() * 5, vx: 0, vy: 0, vz: 0, phase: rng.next() * 10 });
  }
  return crows;
}

// Returns true when any crow took off this frame (for a sound cue)
export function updateCrows(crows, px, pz, dt, t) {
  let scattered = false;
  for (const c of crows) {
    const m = c.m;
    const u = m.userData;
    c.t += dt;
    if (c.state === 'perch') {
      u.head.rotation.x = Math.sin(t * 3 + c.phase) > 0.7 ? 0.6 : 0; // pecking
      u.wl.rotation.z = u.wr.rotation.z = 0;
      const d = Math.hypot(m.position.x - px, m.position.z - pz);
      if (d < 9) {
        c.state = 'fly';
        c.t = 0;
        const a = Math.atan2(m.position.x - px, m.position.z - pz) + (Math.random() - 0.5);
        c.vx = Math.sin(a) * 6; c.vz = Math.cos(a) * 6; c.vy = 4 + Math.random() * 2;
        m.rotation.y = a;
        scattered = true;
      }
    } else if (c.state === 'fly') {
      m.position.x += c.vx * dt;
      m.position.y += c.vy * dt;
      m.position.z += c.vz * dt;
      c.vy = Math.max(1.2, c.vy - dt * 1.5);
      const flap = Math.sin(t * 22 + c.phase) * 0.9;
      u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
      if (c.t > 8) { m.visible = false; c.state = 'gone'; }
    }
  }
  return scattered;
}
