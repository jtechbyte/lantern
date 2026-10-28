import express from 'express';
import { formatSource, previewSource } from './formatter.mjs';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { settingsSchema, defaults } from './config.mjs';
import { parseMedia } from './matching.mjs';
import { sourceDefinitions } from './sources.mjs';
import { PlaybackError } from './providers/real-debrid/client.mjs';
import { RD_FILENAME_RULES_VERSION } from './providers/real-debrid/filename-filter.mjs';
import { Profiles, ProfileError, profileSchema, PROFILE_POLICY } from './profiles.mjs';
import { DmmImporter } from './dmm.mjs';

const equal = (a,b) => timingSafeEqual(createHash('sha256').update(String(a || '')).digest(), createHash('sha256').update(String(b || '')).digest());
const importSchema = z.object({
  type: z.enum(['movie','series']), mediaId: z.string().max(50), title: z.string().min(1).max(500),
  infoHash: z.string().regex(/^(?!0{40}$)[a-f0-9]{40}$/i), torrentName: z.string().max(1000).optional(),
  fileIdx: z.number().int().min(0).max(100000).optional(), filePath: z.string().max(2000).optional(),
  size: z.number().int().nonnegative().optional(), seeders: z.number().int().nonnegative().optional(),
}).strict();
const mediaBody = z.object({ type: z.enum(['movie','series']), id: z.string().max(60), force: z.boolean().optional() }).strict();

export function createApp({ store, engine, rd, adminToken, publicUrl, signingKey, dmm = new DmmImporter(store) }) {
  if (!adminToken || adminToken.length < 32) throw new Error('ADMIN_TOKEN must be at least 32 characters; run npm run setup');
  const app = express(); app.disable('x-powered-by'); app.disable('etag');
  const profiles = new Profiles(store);
  const limits = new Map();
  app.use((req,res,next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (req.path === '/healthz') return next();
    const ip = req.socket.remoteAddress, now = Date.now();
    if (limits.size > 2000) for (const [key,value] of limits) if (value.reset <= now) limits.delete(key);
    let bucket = limits.get(ip);
    if (!bucket || bucket.reset < now) { bucket = { count: 0, reset: now + 60000 }; limits.set(ip, bucket); }
    if (++bucket.count > 180) return res.status(429).set('Retry-After','60').json({ error: 'Request limit reached' });
    next();
  });
  app.use(express.json({ limit: '512kb' }));
  app.get('/healthz', async (req,res) => { try { await store.ping(); res.json({ status: 'ok', version: '0.1.1' }); } catch { res.status(503).json({ status: 'unavailable' }); } });
  app.use('/api', (req,res,next) => {
    if (!equal(req.get('authorization'), `Bearer ${adminToken}`)) return res.status(401).json({ error: 'Admin token required' });
    if (req.get('origin') && req.get('origin') !== publicUrl) return res.status(403).json({ error: 'Origin does not match PUBLIC_URL' });
    next();
  });
  const installUrl = async () => `${publicUrl}/a/${await store.get('installToken')}/manifest.json`;
  app.get('/api/settings', async (req,res) => {
    const settings = (await store.settings());
    res.json({ settings: { ...settings, rdToken: '' }, rdTokenSet: Boolean(settings.rdToken), installUrl: await installUrl(),
      sources: sourceDefinitions, rdRulesVersion: RD_FILENAME_RULES_VERSION, database: store.backend || 'sqlite-test-fixture' });
  });
  app.post('/api/formatter-preview', (req,res) => {
    const input = settingsSchema.pick({ name:true, sourceFormat:true, formatIcons:true, formatSeeders:true }).parse(req.body);
    res.json(formatSource(previewSource, input));
  });
  app.put('/api/settings', async (req,res) => {
    const settings = settingsSchema.parse({ ...req.body, rdToken: req.body?.rdToken || (await store.settings()).rdToken });
    await store.saveSettings(settings); rd.links.clear();
    res.json({ ok: true });
  });
  app.post('/api/settings/recommended', async (req,res) => {
    const { name, description, logo, provider, rdToken, sourceFormat, formatIcons, formatSeeders } = (await store.settings());
    await store.saveSettings({ ...defaults, name, description, logo, provider, rdToken, sourceFormat, formatIcons, formatSeeders });
    rd.links.clear();
    res.json({ ok: true });
  });
  app.delete('/api/rd-token', async (req,res) => { await store.saveSettings({ ...(await store.settings()), rdToken: '', provider: 'realdebrid' }); rd.links.clear(); res.json({ ok: true }); });
  app.get('/api/status', async (req,res) => res.json({ ...await store.stats(), activeSearches: engine.inflight.size, activePlayback: rd.active.size }));
  app.get('/api/activity', async (req,res) => res.json({events:await store.activityHistory()}));
  app.post('/api/rotate-token', async (req,res) => { await store.rotateToken(); res.json({ installUrl: await installUrl() }); });
  app.post('/api/rd-test', async (req,res) => {
    const token = (await store.settings()).rdToken;
    if (!token) return res.status(409).json({ error: 'Save a Real-Debrid token first' });
    try { const user = await rd.user(token); res.json({ status: 'connected', type: user.type, expiration: user.expiration }); }
    catch { res.status(502).json({ error: 'Real-Debrid account check failed. Verify your token and connectivity.' }); }
  });
  app.post('/api/search', async (req,res) => {
    const { type, id, force } = mediaBody.parse(req.body), media = parseMedia(type,id);
    const { selected, rejected } = await engine.results(media, { force });
    res.json({ selected, rejected, health: await store.sourceHealth() });
  });
  app.post('/api/watch', async (req,res) => { const input = mediaBody.parse(req.body); await store.watch(parseMedia(input.type,input.id).key); res.json({ ok: true }); });
  app.delete('/api/watch', async (req,res) => { const input = mediaBody.parse(req.body); await store.unwatch(parseMedia(input.type,input.id).key); res.json({ ok: true }); });
  app.post('/api/import', async (req,res) => {
    const records = z.array(importSchema).min(1).max(100).parse(req.body);
    for (const record of records) parseMedia(record.type,record.mediaId); // validate whole batch first
    let imported = 0;
    await store.transaction(async tx => { for (const row of records) if (await engine.importRelease(row, tx)) imported++; });
    res.json({ imported, excluded: records.length - imported });
  });
  app.delete('/api/import/:id', async (req,res) => { await store.deleteImport(req.params.id); res.json({ ok: true }); });
  app.get('/api/filename-cleanup', async (req,res) => res.json(await store.cleanFilenameMatches()));
  app.post('/api/filename-cleanup', async (req,res) => res.json(await store.cleanFilenameMatches(true)));
  app.post('/api/cleanup', async (req,res) => { await store.prune(); res.json({ ok: true }); });
  app.get('/api/dmm', async (req,res) => res.json({ active: Boolean(dmm.active), last: JSON.parse(await store.get('dmm:last') || 'null') }));
  app.post('/api/dmm', async (req,res) => {
    const settings = await store.settings();
    if (!settings.sources.includes('dmm') || (!settings.dmmAuto && !settings.dmmHashlists.length)) return res.status(409).json({error:'Enable DMM and automatic discovery, or save hashlist URLs first.'});
    void dmm.run(true);
    res.status(202).json({ok:true});
  });

  app.get('/api/profiles', async (req,res) => res.json({profiles:await profiles.list(),policy:PROFILE_POLICY}));
  app.post('/api/profiles', async (req,res) => {
    const {label}=z.object({label:z.string().trim().min(1).max(60)}).strict().parse(req.body);
    const invitation=await profiles.invite(label);
    res.status(201).json({id:invitation.id,expires:invitation.expires,inviteUrl:`${publicUrl}/account#invite=${invitation.invite}`});
  });
  app.post('/api/profiles/:id/revoke', async (req,res) => {await profiles.revoke(req.params.id);res.json({ok:true});});
  app.delete('/api/profiles/:id', async (req,res) => {await profiles.remove(req.params.id);res.json({ok:true});});

  app.use('/profile-api', (req,res,next)=>{
    if(req.get('origin') && req.get('origin')!==publicUrl)return res.status(403).json({error:'Origin does not match PUBLIC_URL'});
    next();
  });
  app.post('/profile-api/claim', async (req,res)=>{
    const {invite}=z.object({invite:z.string().length(64)}).strict().parse(req.body);
    res.json(await profiles.claim(invite));
  });
  app.use('/profile-api', async (req,res,next)=>{
    const credential=/^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization')||'')?.[1];
    req.profile=await profiles.find('manage',credential);
    if(!req.profile)return res.status(401).json({error:'Profile access required. Use your private management link.'});
    next();
  });
  app.get('/profile-api/settings', async (req,res)=>{
    const secret=profiles.unpack(req.profile),owner=await store.settings();
    res.json({label:req.profile.label,name:owner.name,settings:{...secret.preferences,rdToken:''},
      rdTokenSet:Boolean(secret.preferences.rdToken),installUrl:`${publicUrl}/a/${secret.installToken}/manifest.json`});
  });
  app.put('/profile-api/settings', async (req,res)=>{await profiles.save(req.profile.id,profileSchema.parse(req.body));res.json({ok:true});});
  app.delete('/profile-api/rd-token', async (req,res)=>{await profiles.clearToken(req.profile.id);res.json({ok:true});});
  app.post('/profile-api/rotate-token', async (req,res)=>{
    const token=await profiles.rotate(req.profile.id);res.json({installUrl:`${publicUrl}/a/${token}/manifest.json`});
  });
  app.post('/profile-api/rd-test', async (req,res)=>{
    const settings=await profiles.effective(req.profile);
    if(!settings.rdToken)return res.status(409).json({error:'Save your own Real-Debrid token first.'});
    try {const user=await rd.user(settings.rdToken);res.json({type:user.type||'account'});}
    catch {res.status(502).json({error:'Account check failed. Verify your token and connectivity.'});}
  });
  app.get('/account', (req,res)=>res.sendFile(fileURLToPath(new URL('../public/account.html',import.meta.url))));

  app.use('/a/:token', async (req,res,next) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.set('Access-Control-Allow-Methods','GET, OPTIONS').sendStatus(204);
    if (!equal(req.params.token, await store.get('installToken'))) {
      req.profile=await profiles.find('install',req.params.token);
      if(!req.profile)return res.status(404).json({ error: 'Unknown installation' });
    }
    req.addonSettings=req.profile?await profiles.effective(req.profile):await store.settings();
    next();
  });
  app.get('/a/:token/manifest.json', async (req,res) => {
    const settings = req.addonSettings;
    res.json({ id: req.profile?`org.lantern.profile.${req.profile.id}`:'org.lantern.selfhosted', version: '0.1.1', name: settings.name, description: settings.description,
      logo: settings.logo || `${publicUrl}/brand/lantern-mark.png`, catalogs: [], types: ['movie','series'],
      resources: [{ name: 'stream', types: ['movie','series'], idPrefixes: ['tt'] }],
      behaviorHints: { configurable: true, configurationRequired: false } });
  });
  app.get('/a/:token/configure', async (req,res) => res.redirect(req.profile?'/account':'/'));
  function signature(token, id, expires) { return createHmac('sha256', signingKey).update(`${token}|${id}|${expires}`).digest('hex'); }
  app.get('/a/:token/stream/:type/:id.json', async (req,res) => {
    let media;
    try { media = parseMedia(req.params.type,req.params.id); } catch { return res.json({ streams: [] }); }
    const { selected: candidates, settings, refreshing } = await engine.results(media, {profileSettings:req.addonSettings,includeManual:!req.profile});
    const selected = [];
    if (settings.provider === 'realdebrid' && settings.rdToken) {
      for (const row of candidates) if (!await rd.blocked(row.infoHash, settings.rdToken)) selected.push(row);
    }
    const expires = Date.now() + 24 * 3600000;
    const streams = selected.map(row => {
      const common = { ...formatSource(row, settings),
        behaviorHints: { notWebReady: !/\.mp4$/i.test(row.filePath || ''), bingeGroup: `lantern|${row.quality}|${row.source}`, ...(row.filePath ? { filename: row.filePath.split(/[\\/]/).at(-1) } : {}) } };
      return { ...common,
        url: `${publicUrl}/a/${req.params.token}/play/${row.id}?expires=${expires}&sig=${signature(req.params.token,row.id,expires)}` };
    });
    res.json({ streams, cacheMaxAge: refreshing ? 0 : 60, staleRevalidate: refreshing ? 0 : 60, staleError: 0 });
  });
  app.get('/a/:token/play/:id', async (req,res) => {
    const expires = Number(req.query.expires);
    if (!Number.isSafeInteger(expires) || expires < Date.now() || expires > Date.now() + 25 * 3600000 ||
        !equal(req.query.sig, signature(req.params.token,req.params.id,expires))) return res.status(403).send('Playback link expired or invalid. Refresh streams.');
    const release = await store.release(req.params.id);
    if (!release || req.addonSettings.provider !== 'realdebrid' || (req.profile && release.source==='manual')) return res.status(404).send('Stream unavailable');
    try {
      const url=await rd.resolve(release,req.addonSettings);
      if(req.profile && !await profiles.find('install',req.params.token))return res.status(404).send('Profile access revoked');
      res.redirect(302,url);
    }
    catch (error) {
      const message = error instanceof PlaybackError ? error.message : 'Playback resolution failed';
      await store.event('playback', `${release.media}: ${message}`);
      res.status(error instanceof PlaybackError ? error.status : 502).type('text/plain').send(message);
    }
  });
  app.get('/configure', async (req,res) => res.redirect('/'));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { maxAge: 0 }));
  app.use(async (req,res) => res.status(404).json({ error: 'Not found' }));
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ProfileError) return res.status(error.status).json({error:error.message});
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', fields: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (error instanceof SyntaxError || error.message.startsWith('Use movie/')) return res.status(400).json({ error: 'Invalid request' });
    res.status(500).json({ error: 'Operation failed; check input and server configuration.' });
  });
  return app;
}
