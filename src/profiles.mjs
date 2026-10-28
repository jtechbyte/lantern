import { createHash, randomBytes } from 'node:crypto';
import { settingsSchema, defaults } from './config.mjs';

const hash = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('hex');
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const PROFILE_POLICY = Object.freeze({ capacity:50, inviteLifetimeMs:48*3600000, inviteUses:1 });
export const profileSchema = settingsSchema.pick({
  rdToken:true, maxResults:true, perQuality:true, maxSizeGB:true, excludeQualities:true,
  excludeCam:true, preferLanguage:true, sort:true, rdFilenameMode:true,
  sourceFormat:true, formatIcons:true, formatSeeders:true,
}).strict();
const initial = () => profileSchema.parse(Object.fromEntries(
  Object.keys(profileSchema.shape).map(key => [key, defaults[key]])));

export class ProfileError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}

export class Profiles {
  constructor(store) { this.store=store; }
  async list() {
    return (await this.store.db.query(`SELECT id,label,created,disabled,claimed,invite_expires
      FROM profiles ORDER BY created DESC,id`)).rows.map(row=>({...row,created:Number(row.created),invite_expires:Number(row.invite_expires)}));
  }
  async invite(label) {
    const invite=token(), id=randomBytes(16).toString('hex'), now=Date.now();
    await this.store.transaction(async tx=>{
      await tx.db.query('SELECT pg_advisory_xact_lock(78214005)');
      const count=Number((await tx.db.query('SELECT count(*) AS n FROM profiles')).rows[0].n);
      if(count>=PROFILE_POLICY.capacity)throw new ProfileError(`Profile limit is ${PROFILE_POLICY.capacity}. Remove an unused profile first.`,409);
      await tx.db.query(`INSERT INTO profiles(id,label,created,invite_hash,invite_expires,secret)
        VALUES ($1,$2,$3,$4,$5,$6)`,[id,label,now,hash(invite),now+PROFILE_POLICY.inviteLifetimeMs,
        tx.encrypt({preferences:initial(),installToken:''})]);
    });
    return {id,invite,expires:now+PROFILE_POLICY.inviteLifetimeMs};
  }
  async claim(invite) {
    if(!valid(invite))throw new ProfileError('Invitation is invalid, expired or already used.',404);
    const manageToken=token(),installToken=token();
    const result=await this.store.db.query(`UPDATE profiles SET claimed=true,invite_hash=NULL,
      manage_hash=$1,install_hash=$2,secret=$3
      WHERE invite_hash=$4 AND claimed=false AND disabled=false AND invite_expires>$5
      RETURNING id`,[hash(manageToken),hash(installToken),this.store.encrypt({preferences:initial(),installToken}),hash(invite),Date.now()]);
    if(!result.rows.length)throw new ProfileError('Invitation is invalid, expired or already used.',404);
    return {manageToken};
  }
  async find(kind, credential) {
    if(!valid(credential)||this.store.backend!=='postgresql')return null;
    const column=kind==='install'?'install_hash':'manage_hash';
    return (await this.store.db.query(`SELECT id,label,secret FROM profiles
      WHERE ${column}=$1 AND claimed=true AND disabled=false`,[hash(credential)])).rows[0]||null;
  }
  unpack(profile) { return this.store.decrypt(profile.secret); }
  async effective(profile) {
    const owner=await this.store.settings();
    const {preferences}=this.unpack(profile);
    // Never inherit the owner's debrid credential, even from a malformed profile.
    return {...owner,...profileSchema.parse(preferences),rdToken:preferences.rdToken||'',provider:'realdebrid'};
  }
  async save(id,input) {
    await this.store.transaction(async tx=>{
      const row=(await tx.db.query('SELECT secret FROM profiles WHERE id=$1 AND disabled=false FOR UPDATE',[id])).rows[0];
      if(!row)throw new ProfileError('Profile unavailable.',401);
      const secret=tx.decrypt(row.secret);
      secret.preferences=profileSchema.parse({...input,rdToken:input.rdToken||secret.preferences.rdToken});
      await tx.db.query('UPDATE profiles SET secret=$1 WHERE id=$2',[tx.encrypt(secret),id]);
    });
  }
  async clearToken(id) {
    await this.store.transaction(async tx=>{
      const row=(await tx.db.query('SELECT secret FROM profiles WHERE id=$1 AND disabled=false FOR UPDATE',[id])).rows[0];
      if(!row)throw new ProfileError('Profile unavailable.',401);
      const secret=tx.decrypt(row.secret);secret.preferences.rdToken='';
      await tx.db.query('UPDATE profiles SET secret=$1 WHERE id=$2',[tx.encrypt(secret),id]);
    });
  }
  async rotate(id) {
    const installToken=token();
    await this.store.transaction(async tx=>{
      const row=(await tx.db.query('SELECT secret FROM profiles WHERE id=$1 AND disabled=false FOR UPDATE',[id])).rows[0];
      if(!row)throw new ProfileError('Profile unavailable.',401);
      const secret=tx.decrypt(row.secret);secret.installToken=installToken;
      await tx.db.query('UPDATE profiles SET secret=$1,install_hash=$2 WHERE id=$3',[tx.encrypt(secret),hash(installToken),id]);
    });
    return installToken;
  }
  async revoke(id) {
    // Erase the saved provider token as well as all access credentials.
    await this.store.db.query(`UPDATE profiles SET disabled=true,invite_hash=NULL,manage_hash=NULL,
      install_hash=NULL,secret=$1 WHERE id=$2`,[this.store.encrypt({preferences:initial(),installToken:''}),id]);
  }
  async remove(id) { await this.store.db.query('DELETE FROM profiles WHERE id=$1',[id]); }
}
