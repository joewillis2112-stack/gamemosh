export async function loadPico(url, cartUrl){
  const {instance}=await WebAssembly.instantiate(await (await fetch(url)).arrayBuffer(),{});
  const e=instance.exports; const cart=new Uint8Array(await (await fetch(cartUrl)).arrayBuffer());
  const p=e.web_alloc(cart.length); new Uint8Array(e.memory.buffer,p,cart.length).set(cart);
  if(e.web_init(p,cart.length)!==0) throw new Error('cart init failed');
  return e;
}
export function blitPico(e, ctx, img){ img.data.set(new Uint8Array(e.memory.buffer,e.web_get_pixel_buffer(),128*128*4));
  // pico-r buffer is ARGB little-endian => bytes B,G,R,A; swap to RGBA
  const d=img.data; for(let i=0;i<d.length;i+=4){const b=d[i];d[i]=d[i+2];d[i+2]=b;d[i+3]=255;} ctx.putImageData(img,0,0); }
export const stats={};
export function count(k){ stats[k]=(stats[k]||0)+1; }
