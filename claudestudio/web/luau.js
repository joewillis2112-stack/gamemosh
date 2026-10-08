// Boots the Luau VM (luau.mjs, built by luau/build.sh) against a DataModel.
import { makeHost } from './datamodel.js';

export async function startLuau(createLuau, dm, log = console.log) {
  const host = makeHost(dm, log);
  const Module = await createLuau({ studio: host, print: s => log(s, 0), printErr: s => log(s, 2) });
  // Deferred events, as Roblox's default SignalBehavior: firing queues the
  // handler, and the queue runs when the current script yields or ends.
  const queue = [];
  dm.onFire = (ref, args, id) => queue.push([ref, args, id]);
  const flush = () => {
    for (let n = 0; queue.length && n < 10000; n++) {
      const [ref, args, id] = queue.shift();
      if (id && !dm.conns.has(id)) continue; // disconnected (or its instance destroyed) since it was queued
      host.ret = [];
      args.forEach(a => host.put(host.ret, a));
      Module._cs_fire(ref, args.length);
    }
  };
  Module._cs_init();
  // Handlers of destroyed instances: release their Luau refs (once nothing queued can still call them).
  dm.onRelease = refs => { pendingRelease.push(...refs); };
  const pendingRelease = [];
  const release = () => { if (!queue.length) while (pendingRelease.length) Module._cs_unref(pendingRelease.pop()); };
  const withString = (s, f) => { const p = Module.stringToNewUTF8(s); try { return f(p); } finally { Module._free(p); } };
  return {
    run(name, source, script = null) { const r = withString(name, n => withString(source, s => Module._cs_run(n, s, script ? script.handle : 0))); flush(); return r; },
    step(t) { flush(); Module._cs_step(t); flush(); release(); },
    flush,
    waiting() { return Module._cs_waiting(); },
  };
}
