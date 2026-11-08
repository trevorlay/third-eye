// store.js: the ONLY module that touches storage. Everything stays on this device (IndexedDB).
// Async API: links, cases, findings, photos, broker statuses, settings, exportAll, importAll.
const DB_NAME = 'third-eye';
// v1: links, cases, findings, brokers, settings. v2 (app 1.2.0): adds 'photos' (Blob records, indexed by caseId).
// v3 (1.4.0): adds privacy stores and broker recheck dates. Existing cases, findings and settings are retained.
const DB_VERSION = 3;
const SCHEMA = 3; // backup format; schema 1 files (no photos) still import

const STORES = ['links', 'cases', 'findings', 'brokers', 'aliases', 'phones', 'personas', 'checklist'];
export const BROKER_STATUSES = ['not started', 'submitted', 'confirmed removed', 'reappeared'];
const DEFAULT_SETTINGS = {
  theme: 'dark', lastBackup: null, favs: [], pins: [], lastCaseId: null, hidePaid: false,
  profile: { name: '', aliases: '', address: '', pastAddresses: '', emails: '', phones: '', contactEmail: '' },
};

let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result, tx = req.transaction;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      // v3: enrich existing broker records in place without changing their statuses.
      const cursor = tx.objectStore('brokers').openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { c.update(normBroker(c.value)); c.continue(); } };
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      const ps = db.objectStoreNames.contains('photos') ? tx.objectStore('photos') : db.createObjectStore('photos', { keyPath: 'id' });
      if (!ps.indexNames.contains('caseId')) ps.createIndex('caseId', 'caseId', { unique: false });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('Third Eye: database upgrade is waiting for another open tab to close.');
  });
  return dbp;
}
function done(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
function wrap(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function all(store) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).getAll()); }
async function get(store, key) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).get(key)); }
async function put(store, val) { const db = await openDB(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val); await done(tx); return val; }
async function del(store, key) { const db = await openDB(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); await done(tx); }

export function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
const now = () => new Date().toISOString();
const str = v => String(v ?? '').trim();
const tagsOf = t => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map(x => String(x).trim().replace(/^#/, '').toLowerCase()).filter(Boolean))];

// ---- normalizers (also used on import, so bad files can't inject odd shapes)
function normLink(l) {
  return { id: l.id || uid(), name: str(l.name) || 'Untitled link', url: str(l.url), cat: str(l.cat) || 'other', desc: str(l.desc),
    custom: true, createdAt: l.createdAt || now(), updatedAt: l.updatedAt || now() };
}
function normCase(c) {
  return { id: c.id || uid(), name: str(c.name) || 'Untitled case', subject: str(c.subject), notes: str(c.notes), archived: !!c.archived,
    createdAt: c.createdAt || now(), updatedAt: c.updatedAt || now() };
}
function normFinding(f) {
  return { id: f.id || uid(), caseId: f.caseId || null, text: str(f.text), url: str(f.url), source: str(f.source), tags: tagsOf(f.tags),
    date: str(f.date) || now().slice(0, 10), createdAt: f.createdAt || now(), updatedAt: f.updatedAt || now() };
}
function normBroker(b) {
  return { id: str(b.id), status: BROKER_STATUSES.includes(b.status) ? b.status : 'not started', date: str(b.date), listingUrl: str(b.listingUrl),
    optedOutDate: dateOnly(b.optedOutDate) || (b.status === 'confirmed removed' ? dateOnly(b.date) : ''),
    recheckDate: Object.hasOwn(b, 'recheckDate') ? dateOnly(b.recheckDate) : addDays(dateOnly(b.date), 90),
    notes: str(b.notes), updatedAt: b.updatedAt || now() };
}

// v3 privacy records: explicit field allowlists also sanitize imported backups.
const dateOnly = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) && !isNaN(Date.parse(str(v))) ? str(v) : '';
export function addDays(date, days = 90) { if (!dateOnly(date)) return ''; const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
const meta = r => ({ id: str(r.id) || uid(), createdAt: str(r.createdAt) || now(), updatedAt: str(r.updatedAt) || now() });
function normAlias(r) { return { ...meta(r), address: str(r.address).slice(0,254), provider: ['Proton','Firefox Relay','SimpleLogin','other'].includes(r.provider) ? r.provider : 'other', site: str(r.site).slice(0,255), date: dateOnly(r.date), notes: str(r.notes).slice(0,4000), status: r.status === 'burned' ? 'burned' : 'active' }; }
function normPhone(r) { return { ...meta(r), number: str(r.number).slice(0,60), provider: r.provider === 'Google Voice' ? 'Google Voice' : 'other', site: str(r.site).slice(0,255), date: dateOnly(r.date), notes: str(r.notes).slice(0,4000), status: r.status === 'burned' ? 'burned' : 'active' }; }
function normPersona(r) { return { ...meta(r), firstName: str(r.firstName).slice(0,80), lastName: str(r.lastName).slice(0,80), birthday: dateOnly(r.birthday), city: str(r.city).slice(0,80), state: str(r.state).slice(0,40), interests: (Array.isArray(r.interests) ? r.interests : []).slice(0,10).map(x=>str(x).slice(0,80)), username: str(r.username).slice(0,80), aliasId: str(r.aliasId) }; }
function normChecklist(r) { return { id: str(r.id), checked: !!r.checked, updatedAt: str(r.updatedAt) || now() }; }
async function savePrivate(s, norm, r) { const old = r.id ? await get(s,r.id) : null; return put(s, norm({...old,...r,createdAt:old?.createdAt || r.createdAt,updatedAt:now()})); }
export const listAliases = () => all('aliases');
export const saveAlias = r => savePrivate('aliases',normAlias,r);
export const deleteAlias = id => del('aliases',id);
export const listPhones = () => all('phones');
export const savePhone = r => savePrivate('phones',normPhone,r);
export const deletePhone = id => del('phones',id);
export const listPersonas = () => all('personas');
export const savePersona = r => savePrivate('personas',normPersona,r);
export const deletePersona = id => del('personas',id);
export const listChecklist = () => all('checklist');
export const saveChecklist = r => put('checklist',normChecklist({...r,updatedAt:now()}));

// ---- links (user-added only; bundled tools live in data/tools.json)
export const listLinks = async () => (await all('links')).sort((a, b) => a.name.localeCompare(b.name));
export async function saveLink(l) { const old = l.id ? await get('links', l.id) : null; return put('links', normLink({ ...l, createdAt: old ? old.createdAt : l.createdAt, updatedAt: now() })); }
export const deleteLink = id => del('links', id);

// ---- cases
export const listCases = async () => (await all('cases')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
export const getCase = id => get('cases', id);
export async function saveCase(c) { const old = c.id ? await get('cases', c.id) : null; return put('cases', normCase({ ...old, ...c, createdAt: old ? old.createdAt : c.createdAt, updatedAt: now() })); }
async function touchCase(id) { const c = id && await get('cases', id); if (c) await put('cases', { ...c, updatedAt: now() }); }
export async function deleteCase(id) {
  const fs = (await all('findings')).filter(f => f.caseId === id);
  const db = await openDB(); const tx = db.transaction(['cases', 'findings', 'photos'], 'readwrite');
  tx.objectStore('cases').delete(id); for (const f of fs) tx.objectStore('findings').delete(f.id);
  // photos cascade: delete every photo whose caseId index matches, in the same transaction
  const cur = tx.objectStore('photos').index('caseId').openKeyCursor(IDBKeyRange.only(id));
  cur.onsuccess = () => { const c = cur.result; if (c) { tx.objectStore('photos').delete(c.primaryKey); c.continue(); } };
  await done(tx);
}

// ---- photos (JPEG Blobs, already downscaled by the app; never uploaded anywhere)
// record: { id, caseId, blob, thumb, type, width, height, size, caption, name, createdAt, updatedAt }
function normPhoto(p) {
  return { id: p.id || uid(), caseId: p.caseId || null, blob: p.blob, thumb: p.thumb || p.blob, type: str(p.type) || (p.blob && p.blob.type) || 'image/jpeg',
    width: +p.width || 0, height: +p.height || 0, size: +p.size || (p.blob ? p.blob.size : 0), caption: str(p.caption), name: str(p.name),
    createdAt: p.createdAt || now(), updatedAt: p.updatedAt || now() };
}
export async function listPhotos(caseId) {
  const db = await openDB();
  const rows = await wrap(db.transaction('photos').objectStore('photos').index('caseId').getAll(IDBKeyRange.only(caseId)));
  return rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}
export const getPhoto = id => get('photos', id);
export async function photoCounts() { // { caseId: n } without reading any image data
  const db = await openDB(), out = {};
  await new Promise((res, rej) => {
    const r = db.transaction('photos').objectStore('photos').index('caseId').openKeyCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return res(); out[c.key] = (out[c.key] || 0) + 1; c.continue(); };
    r.onerror = () => rej(r.error);
  });
  return out;
}
export async function addPhoto(p) { const rec = await put('photos', normPhoto({ ...p, id: null, createdAt: now(), updatedAt: now() })); await touchCase(rec.caseId); return rec; }
export async function savePhotoCaption(id, caption) {
  const old = await get('photos', id); if (!old) throw new Error('That photo no longer exists.');
  return put('photos', { ...old, caption: str(caption), updatedAt: now() });
}
export const deletePhoto = id => del('photos', id);

// Blob <-> base64 for backups (photos travel inside the JSON file)
function blobToB64(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
function b64ToBlob(s, type) {
  const bin = atob(String(s || '')), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: type || 'image/jpeg' });
}

// ---- findings
export const listFindings = async () => (await all('findings')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
export async function saveFinding(f) {
  const old = f.id ? await get('findings', f.id) : null;
  const rec = await put('findings', normFinding({ ...f, createdAt: old ? old.createdAt : f.createdAt, updatedAt: now() }));
  await touchCase(rec.caseId); return rec;
}
export const deleteFinding = id => del('findings', id);

// ---- broker removal status (keyed by broker id from data/brokers.json)
export const listBrokerStatus = () => all('brokers');
export async function saveBrokerStatus(b) { const old = await get('brokers', b.id); return put('brokers', normBroker({ ...old, ...b, updatedAt: now() })); }

// ---- settings
export async function getSettings() {
  const rec = await get('settings', 'settings');
  const s = { ...DEFAULT_SETTINGS, ...(rec ? rec.value : {}) };
  s.profile = { ...DEFAULT_SETTINGS.profile, ...(s.profile || {}) };
  if (!Array.isArray(s.favs)) s.favs = []; if (!Array.isArray(s.pins)) s.pins = [];
  return s;
}
export async function saveSettings(patch) { const value = { ...(await getSettings()), ...patch }; await put('settings', { key: 'settings', value }); return value; }

// ---- live check server (URL + API key). Kept in its own record, so it is NEVER included in
// JSON backups and never leaves this phone except as the Authorization header to that server.
export const LIVE_DEFAULT_URL = 'https://161-153-34-102.sslip.io';
export async function getLive() {
  const rec = await get('settings', 'live');
  const v = rec ? rec.value : {};
  return { url: str(v.url) || LIVE_DEFAULT_URL, key: str(v.key) };
}
export async function saveLive(patch) { const value = { ...(await getLive()), ...patch }; await put('settings', { key: 'live', value }); return value; }

// ---- backup
export async function exportAll() {
  const [links, cases, findings, brokers, settings, rawPhotos] = await Promise.all([listLinks(), listCases(), listFindings(), listBrokerStatus(), getSettings(), all('photos')]);
  const { lastCaseId, ...portable } = settings;
  const photos = [];
  for (const p of rawPhotos) {
    if (!(p.blob instanceof Blob)) continue;
    const { blob, thumb, ...meta } = p;
    photos.push({ ...meta, data: await blobToB64(blob), thumbData: thumb instanceof Blob && thumb !== blob ? await blobToB64(thumb) : '' });
  }
  const [aliases, phones, personas, checklist] = await Promise.all([listAliases(), listPhones(), listPersonas(), listChecklist()]);
  return { app: 'third-eye', schema: SCHEMA, exportedAt: now(), links, cases, findings, brokers, photos, aliases, phones, personas, checklist, settings: portable };
}
export function isBackup(d) { return !!d && d.app === 'third-eye' && ['links', 'cases', 'findings', 'brokers'].every(k => Array.isArray(d[k])) && ['photos','aliases','phones','personas','checklist'].every(k => d[k] === undefined || Array.isArray(d[k])); }

// mode: 'merge' (newer copy of each record wins, by updatedAt) or 'replace' (wipe, then load).
export async function importAll(data, mode = 'merge') {
  if (!isBackup(data)) throw new Error('This file is not a Third Eye backup.');
  const norm = { links: normLink, cases: normCase, findings: normFinding, brokers: normBroker, aliases: normAlias, phones: normPhone, personas: normPersona, checklist: normChecklist };
  const cur = {};
  for (const s of STORES) cur[s] = mode === 'replace' ? new Map() : new Map((await all(s)).map(x => [x.id, x]));
  // Photos: decode base64 BEFORE opening the transaction (an await inside it would auto-commit it).
  // Keep only photos whose case ends up existing, so nothing is orphaned.
  const caseIds = new Set([...data.cases.map(c => c && c.id), ...cur.cases.keys()].filter(Boolean));
  const oldPhotos = mode === 'replace' ? new Map() : new Map((await all('photos')).map(x => [x.id, { id: x.id, updatedAt: x.updatedAt }]));
  const newPhotos = [];
  for (const p of Array.isArray(data.photos) ? data.photos : []) {
    if (!p || !p.id || !p.data || !caseIds.has(p.caseId)) continue;
    const old = oldPhotos.get(p.id);
    if (old && !((p.updatedAt || '') > (old.updatedAt || ''))) continue;
    try {
      const blob = b64ToBlob(p.data, p.type), thumb = p.thumbData ? b64ToBlob(p.thumbData, 'image/jpeg') : blob;
      const { data: _d, thumbData: _t, ...meta } = p;
      newPhotos.push({ rec: normPhoto({ ...meta, blob, thumb, size: blob.size }), old: !!old });
    } catch { /* skip a corrupt photo, keep importing the rest */ }
  }
  const db = await openDB(); const tx = db.transaction([...STORES, 'photos'], 'readwrite');
  const counts = { added: 0, updated: 0, photos: 0 };
  for (const s of STORES) {
    const os = tx.objectStore(s); if (mode === 'replace') os.clear();
    for (const rec of data[s] || []) {
      if (!rec || !rec.id) continue;
      const old = cur[s].get(rec.id);
      if (!old || (rec.updatedAt || '') > (old.updatedAt || '')) { os.put(norm[s](rec)); old ? counts.updated++ : counts.added++; }
    }
  }
  const ps = tx.objectStore('photos'); if (mode === 'replace') ps.clear();
  for (const { rec } of newPhotos) { ps.put(rec); counts.photos++; }
  await done(tx);
  const s = data.settings || {}, c = await getSettings(), patch = {};
  if (mode === 'replace') Object.assign(patch, { favs: s.favs || [], pins: s.pins || [], theme: s.theme || c.theme, profile: { ...c.profile, ...(s.profile || {}) } });
  else {
    patch.favs = [...new Set([...c.favs, ...(s.favs || [])])]; patch.pins = [...new Set([...c.pins, ...(s.pins || [])])];
    patch.profile = { ...c.profile }; for (const [k, v] of Object.entries(s.profile || {})) if (!patch.profile[k] && v) patch.profile[k] = v;
  }
  if (s.lastBackup && (!c.lastBackup || s.lastBackup > c.lastBackup)) patch.lastBackup = s.lastBackup;
  await saveSettings(patch);
  return { ...counts, cases: data.cases.length, findings: data.findings.length };
}
