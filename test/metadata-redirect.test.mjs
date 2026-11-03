import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readJson} from '../src/network.mjs';
test('metadata redirect allowance follows only one exact URL, with size and timeout bounds',async t=>{
 let base,alternate=0,mode='allowed';
 const server=createServer((req,res)=>{
  if(req.url==='/primary'){res.writeHead(307,{Location:base+(mode==='wrong'?'/other':'/alternate')});res.end();}
  else if(req.url==='/alternate'){alternate++;if(mode==='loop'){res.writeHead(307,{Location:base+'/final'});res.end();}else if(mode==='slow'){setTimeout(()=>res.end('{}'),200);}else res.end(JSON.stringify({meta:{id:'tt1234567'}}));}
  else {res.end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));base='http://127.0.0.1:'+server.address().port;
 await assert.rejects(readJson(base+'/primary'));assert.equal(alternate,0);
 assert.equal((await readJson(base+'/primary',{allowedRedirect:base+'/alternate'})).meta.id,'tt1234567');
 mode='wrong';await assert.rejects(readJson(base+'/primary',{allowedRedirect:base+'/alternate'}));assert.equal(alternate,1);
 mode='loop';await assert.rejects(readJson(base+'/primary',{allowedRedirect:base+'/alternate'}));
 mode='allowed';await assert.rejects(readJson(base+'/primary',{allowedRedirect:base+'/alternate',maxBytes:2}),{code:'RESPONSE_TOO_LARGE'});
 mode='slow';await assert.rejects(readJson(base+'/primary',{allowedRedirect:base+'/alternate',timeout:30}),{code:'TIMEOUT'});
});
