// store.js: the ONLY module that touches storage. Everything stays on this device (IndexedDB).
// Async API: links, cases, findings, broker statuses, settings, exportAll, importAll.
const DB_NAME = 'third-eye';
const DB_VERSION = 1;
const SCHEMA = 1;
const STORES = ['links', 'cases', 'findings', 'brokers'];
export const BROKER_STATUSES = ['not started', 'submitted', 'confirmed removed', 'reappeared'];
const DEFAULT_SETTINGS = {
  theme: 'dark', lastBackup: null, favs: [], pins: [], lastCaseId: null,
  profile: { name: '', aliases: '', address: '', pastAddresses: '', emails: '', phones: '', contactEmail: '' },
};

let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    notes: str(b.notes), updatedAt: b.updatedAt || now() };
}

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
  const db = await openDB(); const tx = db.transaction(['cases', 'findings'], 'readwrite');
  tx.objectStore('cases').delete(id); for (const f of fs) tx.objectStore('findings').delete(f.id);
  await done(tx);
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
  const [links, cases, findings, brokers, settings] = await Promise.all([listLinks(), listCases(), listFindings(), listBrokerStatus(), getSettings()]);
  const { lastCaseId, ...portable } = settings;
  return { app: 'third-eye', schema: SCHEMA, exportedAt: now(), links, cases, findings, brokers, settings: portable };
}
export function isBackup(d) { return !!d && d.app === 'third-eye' && ['links', 'cases', 'findings', 'brokers'].every(k => Array.isArray(d[k])); }

// mode: 'merge' (newer copy of each record wins, by updatedAt) or 'replace' (wipe, then load).
export async function importAll(data, mode = 'merge') {
  if (!isBackup(data)) throw new Error('This file is not a Third Eye backup.');
  const norm = { links: normLink, cases: normCase, findings: normFinding, brokers: normBroker };
  const cur = {};
  for (const s of STORES) cur[s] = mode === 'replace' ? new Map() : new Map((await all(s)).map(x => [x.id, x]));
  const db = await openDB(); const tx = db.transaction(STORES, 'readwrite');
  const counts = { added: 0, updated: 0 };
  for (const s of STORES) {
    const os = tx.objectStore(s); if (mode === 'replace') os.clear();
    for (const rec of data[s]) {
      if (!rec || !rec.id) continue;
      const old = cur[s].get(rec.id);
      if (!old || (rec.updatedAt || '') > (old.updatedAt || '')) { os.put(norm[s](rec)); old ? counts.updated++ : counts.added++; }
    }
  }
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
