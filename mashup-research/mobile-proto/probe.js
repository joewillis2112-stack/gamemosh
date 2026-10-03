// usage: node probe.js URL out.png waitMs [keys...]
const {chromium}=require('/home/user/gamemosh/node_modules/playwright-core');
(async()=>{const [url,out,wait,...keys]=process.argv.slice(2);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const p=await ctx.newPage();const logs=[];p.on('console',m=>logs.push(m.type()+': '+m.text()));p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
const reqs=[];p.on('response',r=>{if(/wasm|\.js$/.test(r.url()))reqs.push(r.status()+' '+r.url());});
await p.goto(url,{waitUntil:'load'});await p.waitForTimeout(+wait);
for(const k of keys){ if(k.startsWith('eval:')){console.log('eval',String(JSON.stringify(await p.evaluate(k.slice(5)))).slice(0,800));} else if(k.startsWith('tap:')){const [x,y]=k.slice(4).split(',');await p.touchscreen.tap(+x,+y);} else if(k.startsWith('wait:')){await p.waitForTimeout(+k.slice(5));} else if(k.startsWith('click:')){await p.click(k.slice(6)).catch(e=>console.log('clickfail',e.message));} else if(k.startsWith('hold:')){const [kk,ms]=k.slice(5).split(',');await p.keyboard.down(kk);await p.waitForTimeout(+ms);await p.keyboard.up(kk);} else {await p.keyboard.press(k);} await p.waitForTimeout(300);}
await p.screenshot({path:out});console.log(reqs.join('\n'));console.log(logs.slice(0,40).join('\n'));await b.close();})();
