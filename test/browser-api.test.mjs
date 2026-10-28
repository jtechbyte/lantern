import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const file of ['app.js','account.js']) {
  const text=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
  const code=text.slice(text.indexOf('async function api('),text.indexOf('\nconst run'));
  function api(fetch) {
    return vm.runInNewContext(code+';api', {fetch,token:'fixture',access:'fixture',lock(){},SyntaxError,
      AbortSignal:{timeout(ms){assert.equal(ms,60000);return AbortSignal.timeout(20);}}});
  }
  test(`${file}: stalled requests expire without automatic retry`,async()=>{
    let calls=0;
    const request=api(async(url,{signal})=>{
      calls++;
      return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));
    });
    // Keep the event loop alive while the unref'ed AbortSignal timer runs.
    const keepAlive=setInterval(()=>{},1000);
    try {await assert.rejects(request('settings'),/timed out.*server may have completed/);assert.equal(calls,1);}
    finally {clearInterval(keepAlive);}
  });
  test(`${file}: proxy HTML produces a readable error`,async()=>{
    const request=api(async()=>({json:async()=>{throw new SyntaxError('HTML');}}));
    await assert.rejects(request('settings'),/Unexpected server response/);
  });
}

test('an old guest authorization failure cannot lock a newer credential',async()=>{
  const text=readFileSync(new URL('../public/account.js',import.meta.url),'utf8');
  const code=text.slice(text.indexOf('async function api('),text.indexOf('\nconst run'));
  let finish,locks=0;
  const context=vm.createContext({access:'old-fixture',lock(){locks++;},AbortSignal,SyntaxError,
    fetch:()=>new Promise(resolve=>finish=resolve)});
  const request=vm.runInContext(code+';api',context)('settings');
  context.access='new-fixture';
  finish({ok:false,status:401,json:async()=>({error:'Unauthorized'})});
  await assert.rejects(request,/Unauthorized/);assert.equal(locks,0);
});
