// Choosing the fidelity tier (web/runtime/quality.js): the device guess, Roblox's ten levels on our
// four tiers, Automatic's adaptation to the frame time, and the player's saved choice.
import { QualityManager, guessTier, LEVEL_TIER, TIER_LEVEL } from '../web/runtime/quality.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };

// The guess.
check(guessTier({ renderer: 'Google SwiftShader' }) === 'low' && guessTier({ renderer: 'llvmpipe (LLVM 15)' }) === 'low' && guessTier({ memory: 2 }) === 'low', 'a software renderer or 2 GB of memory: low');
check(guessTier({ touch: true, width: 390, height: 844, memory: 4 }) === 'phone', 'a touch device with a small screen: phone');
check(guessTier({ touch: true, width: 1366, height: 1024, memory: 8 }) === 'high' && guessTier({ renderer: 'ANGLE (NVIDIA GeForce RTX 3060)', memory: 8 }) === 'high', 'a tablet-sized screen or a desktop GPU: high; ultra is never guessed');

// Levels and tiers.
check(LEVEL_TIER.slice(1).join() === 'low,low,low,phone,phone,high,high,high,ultra,ultra', 'levels 1-3 low, 4-5 phone, 6-8 high, 9-10 ultra');
check(Object.entries(TIER_LEVEL).every(([t, l]) => LEVEL_TIER[l] === t), 'each tier is shown as one of its own levels');

// Automatic: slow frames step down, after 3 s of them; fast ones step up, after 10 s, never past high.
const run = (q, ms, seconds, t0) => { let t = t0; while (t < t0 + seconds * 1000) { t += ms; q.frame(ms, t); } return t; };
{
  const applied = [];
  const q = new QualityManager({ apply: t => applied.push(t), guess: 'high' });
  check(q.tier === 'high' && q.level === 0, 'Automatic starts at the guess');
  let t = run(q, 50, 5, 0); // the first 5 s after start are quiet (shaders compiling)
  check(q.tier === 'high', 'the first 5 s are ignored');
  t = run(q, 50, 2.5, t);
  check(q.tier === 'high', 'slow for 2.5 s: no change yet');
  t = run(q, 50, 1, t);
  check(q.tier === 'phone' && applied.join() === 'phone', 'slow (20 fps) for 3 s: down a tier, to phone');
  t = run(q, 50, 8.5, t);
  check(q.tier === 'low', 'still slow: down to low (after the 5 s quiet, 3 s more)');
  t = run(q, 50, 20, t);
  check(q.tier === 'low', 'low is the floor');
  t = run(q, 16, 14.5, t);
  check(q.tier === 'phone', 'fast (60 fps) for 10 s: up a tier');
  t = run(q, 16, 60, t);
  check(q.tier === 'high', 'up to high, and no further: ultra is the player\'s choice');
  t = run(q, 25, 30, t);
  check(q.tier === 'high', 'in between (40 fps): stays');
  run(q, 2000, 30, t);
  check(q.tier === 'high', 'gaps over 250 ms (a background tab) aren\'t slow frames');
}

// The player's choice: a level fixes the tier, Automatic adapts again, and the choice is saved.
{
  const store = new Map(), S = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const applied = [];
  const q = new QualityManager({ apply: t => applied.push(t), store: S, guess: 'high' });
  q.setLevel(2);
  check(q.tier === 'low' && q.level === 2 && applied.join() === 'low', 'level 2: low');
  run(q, 10, 30, 0);
  check(q.tier === 'low', 'a chosen level doesn\'t adapt');
  const again = new QualityManager({ apply: () => {}, store: S, guess: 'high' });
  check(again.level === 2 && again.tier === 'low', 'the choice is saved: the next visit starts at level 2');
  q.setLevel(0);
  check(q.level === 0 && q.tier === 'high' && new QualityManager({ apply: () => {}, store: S, guess: 'phone' }).level === 0, 'Automatic again: back to its own tier, and saved');
  q.setLevel(9);
  check(q.tier === 'ultra', 'level 9: ultra');
}

// A fixed tier (the page's ?quality=): nothing changes it, nothing is saved.
{
  const store = new Map(), S = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const applied = [];
  const q = new QualityManager({ apply: t => applied.push(t), store: S, fixed: 'phone', guess: 'high' });
  run(q, 50, 30, 0); q.setLevel(10);
  check(q.tier === 'phone' && !applied.length && !store.size, 'a fixed tier stays, applies nothing and saves nothing');
}

if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
