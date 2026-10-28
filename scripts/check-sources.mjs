import { Sources, sourceDefinitions } from '../src/sources.mjs';
// Read-only source diagnostics: no database, account tokens or torrent playback.
const ids=process.argv.slice(2);
const selected=ids.length?ids:['yts','apibay'];
if(selected.some(id=>!sourceDefinitions.some(s=>s.id===id))){console.error('Unknown source ID');process.exit(1);}
if(selected.includes('dmm')){console.error('DMM uses local imported metadata. Check its import status in Library instead.');process.exit(1);}
const health={};
const sources=new Sources({sourceHealth:async()=>health,health:async(id,value)=>{health[id]=value;}});
console.log('Testing movie sources with Big Buck Bunny (2008), and EZTV with an episode lookup. Zero results can be valid; this does not test playback.');
await Promise.all(selected.map(async id=>{
  try {
    const media=id==='eztv'?{type:'series',imdb:'tt0944947',season:1,episode:1}:{type:'movie',imdb:'tt1254207'};
    const rows=await sources.search(id,media,id==='eztv'?{name:'Game of Thrones',year:2011}:{name:'Big Buck Bunny',year:2008},AbortSignal.timeout(20000));
    console.log(JSON.stringify({source:id,status:health[id]?.status,code:health[id]?.code,parsed:rows.length,usableHashes:rows.filter(r=>/^[a-f0-9]{40}$/i.test(r.infoHash||'')).length,durationMs:health[id]?.durationMs}));
  }catch(error){console.log(JSON.stringify({source:id,status:health[id]?.status,code:health[id]?.code||error.code,durationMs:health[id]?.durationMs}));}
}));
