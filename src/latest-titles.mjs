import { readJson } from './network.mjs';

// Only observations with a validated media identity can enter the showcase.
const present = `EXISTS (SELECT 1 FROM releases r WHERE
  split_part(r.media,'/',1) || '/' || split_part(split_part(r.media,'/',2),':',1)=t.key)`;
export function normalizeCatalogMetadata(meta, key) {
  const [type,id] = key.split('/');
  if (!meta || (meta.imdb_id || meta.id) !== id || meta.type !== type || !meta.name?.trim()) throw Error('Metadata identity mismatch');
  const imageUrl=value=>{try {const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;} catch {} return null;};
  const poster=imageUrl(meta.poster),background=imageUrl(meta.background);
  const rating = Number(meta.imdbRating);
  const date = typeof meta.released === 'string' && Number.isFinite(Date.parse(meta.released)) ? new Date(meta.released).toISOString().slice(0,10) : null;
  return { title:meta.name.slice(0,500), description:String(meta.description || '').slice(0,5000), poster, background,
    releaseDate:date, year:/^(19|20)\d{2}/.exec(String(meta.releaseInfo || ''))?.[0] || date?.slice(0,4) || null,
    imdbRating:meta.imdbRating != null && String(meta.imdbRating).trim() && Number.isFinite(rating) && rating>0 && rating<=10 ? rating : null,
    provider:'Cinemeta' };
}

export class LatestTitles {
  constructor(store, { request=readJson, now=Date.now }={}) { this.db=store.db; this.request=request; this.now=now; this.pending=null; this.nextWarm=0; this.cache=new Map(); }
  warm() {
    if (this.pending) return this.pending;
    if (this.now()<this.nextWarm) return Promise.resolve();
    this.nextWarm=this.now()+30000;
    this.pending=this.enrich().catch(()=>{}).finally(()=>{this.pending=null;this.cache.clear();});
    return this.pending;
  }
  async enrich() {
    const rows=(await this.db.query(`SELECT t.key FROM indexed_titles t WHERE next_metadata_at<=$1 AND ${present} ORDER BY next_metadata_at,first_seen DESC LIMIT 4`,[this.now()])).rows;
    // Two network requests at a time; each is bounded by the shared network helper.
    for(let i=0;i<rows.length;i+=2) await Promise.all(rows.slice(i,i+2).map(async row=>{
      try {
        const [type,id]=row.key.split('/');
        const data=await this.request(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`,{timeout:5000,maxBytes:2097152});
        const metadata=normalizeCatalogMetadata(data.meta,row.key);
        await this.db.query('UPDATE indexed_titles SET metadata=$2,metadata_at=$3,next_metadata_at=$4 WHERE key=$1',[row.key,JSON.stringify(metadata),this.now(),this.now()+7*86400000]);
      } catch {
        // Keep previous metadata; its age is returned explicitly to the UI.
        await this.db.query('UPDATE indexed_titles SET next_metadata_at=$2 WHERE key=$1',[row.key,this.now()+900000]);
      }
    }));
  }
  async list({type='all',view='added',offset=0,limit=12}={}) {
    const cacheKey=JSON.stringify({type,view,offset,limit}), cached=this.cache.get(cacheKey);
    if(cached?.expires>this.now()) return cached.promise;
    if(this.cache.size>=30)this.cache.delete(this.cache.keys().next().value);
    const promise=this.query({type,view,offset,limit}).catch(error=>{this.cache.delete(cacheKey);throw error;});
    this.cache.set(cacheKey,{expires:this.now()+5000,promise});
    return promise;
  }
  async query({type,view,offset,limit}) {
    const today=new Date(this.now()).toISOString().slice(0,10), cutoff=new Date(this.now()-90*86400000).toISOString().slice(0,10);
    const where=`${present} AND ($1='all' OR split_part(t.key,'/',1)=$1)`;
    const releaseFilter=view==='released'?" AND metadata->>'releaseDate' BETWEEN $2 AND $3":'';
    const parameters=view==='released'?[type,cutoff,today]:[type];
    const counts=(await this.db.query(`SELECT count(*) AS total FROM indexed_titles t WHERE ${where}${releaseFilter}`,parameters)).rows[0];
    const rows=(await this.db.query(`SELECT t.*, (SELECT r.media FROM releases r WHERE split_part(r.media,'/',1) || '/' || split_part(split_part(r.media,'/',2),':',1)=t.key ORDER BY r.updated DESC,r.id LIMIT 1) AS media
      FROM indexed_titles t WHERE ${where}${releaseFilter} ORDER BY ${view==='released'?"metadata->>'releaseDate' DESC,":''}first_seen DESC,t.key LIMIT $${parameters.length+1} OFFSET $${parameters.length+2}`,[...parameters,limit,offset])).rows;
    return {total:Number(counts.total),offset,limit,view,type,updatedAt:new Date(this.now()).toISOString(),items:rows.map(row=>({
      key:row.key,type:row.key.split('/')[0],imdb:row.key.split('/')[1],media:row.media,
      firstSeen:Number(row.first_seen),lastSeen:Number(row.last_seen),estimated:row.estimated,
      metadata:row.metadata,metadataAt:row.metadata_at?Number(row.metadata_at):null,
      metadataState:!row.metadata?'unavailable':this.now()-Number(row.metadata_at)>=7*86400000?'stale':'fresh'
    }))};
  }
}
