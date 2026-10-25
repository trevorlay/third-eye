import * as store from './store.js';
import { BROKER_STATUSES } from './store.js';

const VERSION = '1.1.1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const state = {
  data: { categories: [], tools: [], usernames: { categories: {}, sites: [] }, brokers: [] },
  links: [], cases: [], findings: [], brokerStatus: new Map(), settings: {},
  toolQ: '', toolFilter: 'all',
  builder: { kind: 'name', q: '', place: '' },
  uc: { u: '', marks: {}, filter: 'all' },
  dork: { name: '', place: '', user: '', email: '', phone: '', site: '', ft: 'pdf', c_exact: '', c_site: '', c_intitle: '', c_inurl: '', c_intext: '', c_ft: '', c_ex: '', c_extra: '' },
  img: { url: '' },
  live: { url: store.LIVE_DEFAULT_URL, key: '' }, liveJobs: { username: null, email: null },
  caseQ: '', showArchived: false, brokerFilter: 'all', tplBroker: '', tplOpen: false,
};

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHttp = v => /^https?:\/\/[^\s/]+\.[^\s]+/i.test(String(v || '').trim());
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = d => { if (!d) return ''; const x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: x.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
const daysSince = d => { const x = new Date(d.length === 10 ? d + 'T00:00:00' : d); if (isNaN(x)) return 0; const t = new Date(); t.setHours(0, 0, 0, 0); x.setHours(0, 0, 0, 0); return Math.round((t - x) / 864e5); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
const ext = (url, label, cls = 'btn') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const caseName = id => (state.cases.find(c => c.id === id) || {}).name || 'No case';

function hl(text, ts) {
  text = String(text ?? '');
  if (!ts || !ts.length || !text) return esc(text);
  const low = text.toLowerCase(), on = new Uint8Array(text.length);
  for (const t of ts) { let i = low.indexOf(t); while (i !== -1) { on.fill(1, i, i + t.length); i = low.indexOf(t, i + 1); } }
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    if (on[i] && !open) { out += '<mark>'; open = true; } else if (!on[i] && open) { out += '</mark>'; open = false; }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(txt, label) {
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(label || 'Copied: ' + (txt.length > 40 ? txt.slice(0, 40) + '…' : txt));
}

const ICONS = {
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 3.5h6l-1 5 3.5 3.5v1.5h-11V12L10 8.5z"/><path d="M12 13.5V21"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 10.5v6M9 13.5h6"/></svg>',
};

// ---------- data ----------
async function loadStatic() {
  const get = async f => { const r = await fetch('./data/' + f); if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); };
  const [t, u, b] = await Promise.all([get('tools.json'), get('usernames.json'), get('brokers.json')]);
  state.data = { categories: t.categories, tools: t.tools, usernames: u, brokers: b.map(x => ({ ...x, id: slug(x.name) })) };
}
async function load() {
  let bs;
  [state.links, state.cases, state.findings, bs, state.settings] = await Promise.all([store.listLinks(), store.listCases(), store.listFindings(), store.listBrokerStatus(), store.getSettings()]);
  state.live = await store.getLive();
  state.brokerStatus = new Map(bs.map(x => [x.id, x]));
  updateBadge();
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t || 'dark';
  const light = t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  $('meta[name=theme-color]').content = light ? '#f5f3fb' : '#0d0b16';
}
const hasData = () => state.cases.length || state.findings.length || state.links.length || state.brokerStatus.size;
function backupDue() {
  if (!hasData()) return false;
  const lb = state.settings.lastBackup;
  return !lb || (Date.now() - new Date(lb).getTime()) > 7 * 864e5;
}
function lastBackupText() {
  const lb = state.settings.lastBackup;
  if (!lb) return 'Never';
  const days = Math.floor((Date.now() - new Date(lb).getTime()) / 864e5);
  return new Date(lb).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + (days >= 1 ? ` (${days} day${days > 1 ? 's' : ''} ago)` : ' (today)');
}
const backupBanner = () => backupDue() ? `<div class="banner" id="bk-banner"><span>🛟</span><div class="spacer">${state.settings.lastBackup ? 'It\u2019s been over a week since your last backup.' : 'You haven\u2019t backed up yet.'} Your data lives only on this phone.</div><button class="btn" data-backup type="button">Back up</button></div>` : '';
const allTools = () => [...state.data.tools, ...state.links.map(l => ({ ...l, search: {} }))];

// ---------- search URL templates ----------
// Tokens: {q} raw input (URL-encoded) · {dash}/{Dash} words joined by "-" · {First}/{Last} · {under} first_last
// {digits} 10-digit US number · {phonedash} 206-555-0100 · {plus} %2B1 + digits
function fillTemplate(tpl, raw) {
  const v = String(raw || '').trim(), words = v.split(/\s+/).filter(Boolean).map(w => w.replace(/[^\p{L}\p{N}'.-]/gu, '')).filter(Boolean);
  let d = v.replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1);
  const E = encodeURIComponent;
  const map = {
    q: E(v), dash: words.map(w => E(w.toLowerCase())).join('-'), Dash: words.map(w => E(cap(w))).join('-'),
    First: E(cap(words[0] || '')), Last: E(cap(words.length > 1 ? words[words.length - 1] : '')), under: words.map(w => E(w.toLowerCase())).join('_'),
    digits: d, phonedash: d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d, plus: '%2B1' + d,
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}
const KINDS = {
  name: { label: 'Name', ph: 'e.g. Jane Q Doe', type: 'text', hint: 'First and last name. Add a city or state below to narrow Google results.' },
  username: { label: 'Username', ph: 'e.g. janedoe42', type: 'text', hint: 'Leading @ is removed. For ~130 profile links, use the Usernames tab.' },
  email: { label: 'Email', ph: 'e.g. jane@example.com', type: 'email', hint: '' },
  phone: { label: 'Phone', ph: 'e.g. (206) 555-0100', type: 'tel', hint: 'US numbers work best (10 digits).' },
  domain: { label: 'Domain', ph: 'e.g. example.com', type: 'text', hint: 'Just the domain; https:// and paths are removed.' },
};
function cleanInput(kind, v) {
  v = String(v || '').trim();
  if (kind === 'username') v = v.replace(/^@+/, '').replace(/\s+/g, '');
  if (kind === 'domain') v = v.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
  if (kind === 'email') v = v.replace(/\s+/g, '').toLowerCase();
  return v;
}
function validInput(kind, v) {
  if (!v) return 'Type something to search for.';
  if (kind === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'That doesn\u2019t look like an email address.';
  if (kind === 'phone') { let d = v.replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); if (d.length !== 10) return 'Enter a 10-digit US phone number.'; }
  if (kind === 'domain' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return 'That doesn\u2019t look like a domain (example.com).';
  if (kind === 'name' && v.split(/\s+/).length < 2) return 'Use a first and last name for the best results.';
  return '';
}
const googleURL = q => 'https://www.google.com/search?q=' + encodeURIComponent(q);
function phoneVariants(v) {
  let d = v.replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return `"${v}"`;
  const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6);
  return `"${a}-${b}-${c}" OR "(${a}) ${b}-${c}" OR "${a}.${b}.${c}" OR "${d}"`;
}
function builderResults(kind, v, place = '') {
  const order = state.data.categories.map(c => c.id);
  const out = state.data.tools.filter(t => t.search && t.search[kind])
    .sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat))
    .map(t => ({ name: t.name, cat: t.cat, url: fillTemplate(t.search[kind], v) }));
  const gq = kind === 'name' ? `"${v}"${place ? ` "${place}"` : ''}` : kind === 'phone' ? phoneVariants(v) : `"${v}"`;
  out.unshift({ name: 'Google (exact match)', cat: 'search', url: googleURL(gq) });
  return out;
}

// ---------- save results to a case ----------
async function pickCase(title = 'Save to which case?') {
  const active = state.cases.filter(c => !c.archived);
  const last = active.find(c => c.id === state.settings.lastCaseId);
  const list = last ? [last, ...active.filter(c => c !== last)] : active;
  const choice = await choiceDialog(title, list.length ? 'Tap a case. Everything stays on this phone.' : 'You don\u2019t have a case yet. Create one first.',
    [...list.map((c, i) => ({ v: c.id, label: c.name + (c.subject ? ` · ${c.subject}` : ''), primary: i === 0 })), { v: '__new', label: '+ New case…' }]);
  if (choice !== '__new') return choice;
  const name = await promptDialog('New case', '', 'Create', 'Case name (e.g. Self-audit 2026)');
  if (!name) return null;
  const c = await store.saveCase({ name }); await load(); return c.id;
}
async function saveToCase(finding) {
  const caseId = await pickCase();
  if (!caseId) return false;
  await store.saveFinding({ ...finding, caseId, date: today() });
  await store.saveSettings({ lastCaseId: caseId });
  await load(); toast('Saved to ' + caseName(caseId) + ' ✓'); return true;
}

// ---------- TOOLS (launcher) ----------
function toolHTML(t, ts) {
  const s = state.settings, fav = s.favs.includes(t.id), pin = s.pins.includes(t.id);
  const initial = esc((t.name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
  return `<div class="tool" data-tool="${esc(t.id)}">
    <a class="open" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(t.name)}">
      <span class="ava c-${esc(t.cat)}">${initial}</span>
      <span class="tx"><span class="nm">${hl(t.name, ts)}</span>${t.custom ? ' <span class="pill mine">My link</span>' : ''}
        <span class="ds">${hl(t.desc || '', ts)}</span><span class="host">${hl(host(t.url), ts)}</span></span></a>
    <button class="iconbtn${fav ? ' on' : ''}" type="button" data-fav="${esc(t.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${ICONS.star}</button>
    <button class="iconbtn pin${pin ? ' on' : ''}" type="button" data-pin="${esc(t.id)}" aria-pressed="${pin}" aria-label="${pin ? 'Unpin' : 'Pin to top'}">${ICONS.pin}</button>
    ${t.custom ? `<button class="iconbtn" type="button" data-linkmenu="${esc(t.id)}" aria-label="Edit or delete link">${ICONS.more}</button>` : ''}
  </div>`;
}
function renderTools() {
  const s = state.settings, ts = state.toolQ.toLowerCase().split(/\s+/).filter(Boolean);
  const cats = state.data.categories;
  const tools = allTools().filter(t => !ts.length || ts.every(x => [t.name, t.desc, host(t.url), (cats.find(c => c.id === t.cat) || {}).name].join(' ').toLowerCase().includes(x)));
  const f = state.toolFilter;
  const sections = [];
  const pinned = tools.filter(t => s.pins.includes(t.id)), favs = tools.filter(t => s.favs.includes(t.id));
  if (f === 'all') {
    if (pinned.length) sections.push({ id: 'pinned', name: '📌 Pinned', items: pinned });
    if (favs.length) sections.push({ id: 'favs', name: '★ Favorites', items: favs });
    for (const c of cats) { const items = tools.filter(t => t.cat === c.id); if (items.length) sections.push({ id: c.id, name: `${c.icon} ${c.name}`, items }); }
  } else if (f === 'favs') sections.push({ id: 'favs', name: '★ Favorites', items: favs });
  else if (f === 'mine') sections.push({ id: 'mine', name: 'My links', items: tools.filter(t => t.custom) });
  else { const c = cats.find(x => x.id === f); sections.push({ id: f, name: c ? `${c.icon} ${c.name}` : f, items: tools.filter(t => t.cat === f) }); }
  const total = new Set(sections.flatMap(x => x.items.map(t => t.id))).size;
  const chip = (id, label) => `<button class="chip${f === id ? ' on' : ''}" type="button" data-tf="${esc(id)}">${esc(label)}</button>`;
  view.innerHTML = `${backupBanner()}
    <div class="searchbox">${ICONS.search}<input id="tq" type="search" placeholder="Filter ${allTools().length} tools" autocomplete="off" value="${esc(state.toolQ)}" aria-label="Filter tools"><button class="clear" id="tqclear" type="button" aria-label="Clear"${state.toolQ ? '' : ' hidden'}>×</button></div>
    <div class="filters" role="toolbar" aria-label="Tool categories">${chip('all', 'All')}${chip('favs', '★ Favorites')}${chip('mine', 'My links')}${cats.map(c => chip(c.id, c.name)).join('')}</div>
    <div class="row"><span class="resultcount spacer" id="toolcount">${total} link${total === 1 ? '' : 's'} · open in a new tab</span><button class="btn sm" id="addlink" type="button">+ Add link</button></div>
    ${sections.map(sec => `<h2 id="sec-${esc(sec.id)}">${esc(sec.name)}</h2><div class="toolgrid" data-sec="${esc(sec.id)}">${sec.items.map(t => toolHTML(t, ts)).join('')}</div>`).join('')}
    ${total ? '' : `<div class="empty"><span class="big">🔭</span>${f === 'favs' ? 'Tap ☆ on any tool to add it to favorites.' : f === 'mine' ? 'Add your own links with “+ Add link”.' : 'No tools match.'}</div>`}
    <div class="card note small">🔒 Third Eye never contacts these sites itself. Links open only when you tap them, in a new tab.</div>
    <div class="endmark" id="end"></div>`;
  const q = $('#tq');
  q.oninput = () => { state.toolQ = q.value; const pos = q.selectionStart; renderTools(); const n = $('#tq'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#tqclear').onclick = () => { state.toolQ = ''; renderTools(); };
  $$('[data-tf]').forEach(b => b.onclick = () => { state.toolFilter = b.dataset.tf; renderTools(); });
  $('#addlink').onclick = () => openLinkForm();
}
async function toggleList(key, id) {
  const cur = state.settings[key]; const on = !cur.includes(id);
  state.settings = await store.saveSettings({ [key]: on ? [...cur, id] : cur.filter(x => x !== id) });
  return on;
}
view.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-fav],[data-pin],[data-linkmenu],[data-backup],[data-copy]');
  if (!b) return;
  if (b.dataset.copy !== undefined) return copyText(b.dataset.copy);
  if (b.dataset.backup !== undefined) return doExport();
  if (b.dataset.fav) { const on = await toggleList('favs', b.dataset.fav); render(); toast(on ? 'Added to favorites ★' : 'Removed from favorites'); }
  else if (b.dataset.pin) { const on = await toggleList('pins', b.dataset.pin); render(); toast(on ? 'Pinned to top 📌' : 'Unpinned'); }
  else if (b.dataset.linkmenu) {
    const l = state.links.find(x => x.id === b.dataset.linkmenu); if (!l) return;
    const c = await choiceDialog(l.name, host(l.url), [{ v: 'edit', label: 'Edit link', primary: true }, { v: 'del', label: 'Delete link', danger: true }]);
    if (c === 'edit') openLinkForm(l);
    if (c === 'del' && await confirmDialog('Delete this link?', `“${l.name}” will be removed from this phone.`, 'Delete', true)) {
      await store.deleteLink(l.id);
      await store.saveSettings({ favs: state.settings.favs.filter(x => x !== l.id), pins: state.settings.pins.filter(x => x !== l.id) });
      await load(); render(); toast('Link deleted');
    }
  }
});
function openLinkForm(link = null) {
  const catIds = state.data.categories.map(c => c.id);
  const l = link || { name: '', url: 'https://', cat: catIds.includes(state.toolFilter) ? state.toolFilter : 'other', desc: '' };
  const root = openSheet(`<header><h2 id="sheet-title">${link ? 'Edit link' : 'Add link'}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${ICONS.x}</button></header>
    <form class="body form" id="linkform" novalidate>
      <label class="lbl" for="lk-name">Name</label><input type="text" id="lk-name" value="${esc(l.name)}" placeholder="e.g. County property records" autocomplete="off">
      <label class="lbl" for="lk-url">Link</label><input type="url" id="lk-url" value="${esc(l.url)}" inputmode="url" autocomplete="off" placeholder="https://">
      <label class="lbl" for="lk-cat">Category</label><select id="lk-cat">${state.data.categories.map(c => `<option value="${esc(c.id)}"${c.id === l.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <label class="lbl" for="lk-desc">Description <span class="opt">(optional)</span></label><input type="text" id="lk-desc" value="${esc(l.desc)}" placeholder="What it's good for">
      <div class="err" id="lk-err"></div>
    </form>
    <footer>${link ? '<button class="btn danger" type="button" id="lk-del">Delete</button>' : ''}<button class="btn primary" type="submit" form="linkform" id="lk-save">Save</button></footer>`);
  const S = s => root.querySelector(s);
  if (S('#lk-del')) S('#lk-del').onclick = async () => {
    if (!await confirmDialog('Delete this link?', `“${link.name}” will be removed from this phone.`, 'Delete', true)) return;
    await store.deleteLink(link.id); closeSheet(); await load(); render(); toast('Link deleted');
  };
  S('#linkform').onsubmit = async e => {
    e.preventDefault();
    const name = S('#lk-name').value.trim(); let url = S('#lk-url').value.trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    if (!name) { S('#lk-err').textContent = 'Give the link a name.'; return S('#lk-name').focus(); }
    if (!isHttp(url)) { S('#lk-err').textContent = 'Enter a full web address (https://…).'; return S('#lk-url').focus(); }
    await store.saveLink({ ...(link || {}), name, url, cat: S('#lk-cat').value, desc: S('#lk-desc').value });
    closeSheet(); await load(); render(); toast(link ? 'Link saved' : 'Link added ✓');
  };
  setTimeout(() => root.isConnected && S('#lk-name').focus(), 60);
}

// ---------- SEARCH ----------
const STABS = [['builder', 'Builder'], ['usernames', 'Usernames'], ['dorks', 'Dorks'], ['image', 'Image']];
function renderSearch(tab) {
  if (!STABS.some(t => t[0] === tab)) tab = 'builder';
  view.innerHTML = `<nav class="tabs" aria-label="Search tools">${STABS.map(([id, l]) => `<a href="#/search/${id}" class="${id === tab ? 'on' : ''}" data-stab="${id}">${l}</a>`).join('')}</nav>
    <div id="spane"></div>
    <details class="card note small" id="cors-note"><summary><b>Why doesn’t Third Eye check sites automatically?</b></summary>
      <p>Browsers block web pages from reading other sites’ responses (CORS), so a phone-only app can’t run live Sherlock- or Holehe-style checks. Live checks need a small server: set yours up in Settings → Live check server to get “Run live check” buttons for usernames (Sherlock) and emails (Holehe). Without it, each link opens the real site and you mark what you see. Nothing is sent anywhere until you tap a link or start a live check.</p></details>
    <div class="endmark" id="end"></div>`;
  ({ builder: paneBuilder, usernames: paneUsernames, dorks: paneDorks, image: paneImage })[tab]($('#spane'));
}

function paneBuilder(el) {
  const b = state.builder, k = KINDS[b.kind];
  const v = cleanInput(b.kind, b.q), err = b.q ? validInput(b.kind, v) : '';
  const res = v && !err ? builderResults(b.kind, v, b.place.trim()) : [];
  el.innerHTML = `<h1>Search builder</h1><p class="muted small">Builds ready-to-open searches across the toolkit. Nothing is fetched until you tap Open.</p>
    <div class="chips" role="radiogroup" aria-label="Search type">${Object.entries(KINDS).map(([id, x]) => `<button class="chip${id === b.kind ? ' on' : ''}" type="button" role="radio" aria-checked="${id === b.kind}" data-kind="${id}">${x.label}</button>`).join('')}</div>
    <form class="form" id="bform" novalidate>
      <label class="lbl" for="bq">${k.label}</label><input type="${k.type === 'email' ? 'email' : k.type === 'tel' ? 'tel' : 'text'}" id="bq" value="${esc(b.q)}" placeholder="${esc(k.ph)}" autocomplete="off" autocapitalize="${b.kind === 'name' ? 'words' : 'off'}" spellcheck="false">
      ${b.kind === 'name' ? `<label class="lbl" for="bplace">City or state <span class="opt">(optional, Google only)</span></label><input type="text" id="bplace" value="${esc(b.place)}" placeholder="e.g. Denver CO" autocomplete="off">` : ''}
      ${k.hint ? `<p class="tiny muted">${esc(k.hint)}</p>` : ''}
      <div class="row"><button class="btn primary" type="submit" id="bgo">${ICONS.search} Build searches</button></div>
      <div class="err" id="berr">${esc(err)}</div>
    </form>
    ${b.kind === 'email' && v && !err ? liveEmailCard(v) : ''}
    ${res.length ? `<div class="row"><span class="resultcount spacer" id="bcount">${res.length} searches for <b>${esc(v)}</b></span><button class="btn sm" type="button" id="bsave">${ICONS.save} Save to case</button></div>
    <div class="reslist" id="bres">${res.map((r, i) => `<div class="res" data-res="${i}"><div class="tx"><div class="nm">${esc(r.name)}</div><div class="u mono">${esc(host(r.url))}</div></div>
      <button class="btn sm ghost" type="button" data-copy="${esc(r.url)}" aria-label="Copy ${esc(r.name)} link">${ICONS.copy}</button>${ext(r.url, 'Open ' + ICONS.open, 'btn sm')}</div>`).join('')}</div>` : ''}`;
  $$('[data-kind]', el).forEach(c => c.onclick = () => { b.kind = c.dataset.kind; b.q = ''; paneBuilder(el); $('#bq').focus(); });
  $('#bform').onsubmit = e => { e.preventDefault(); b.q = $('#bq').value; b.place = $('#bplace') ? $('#bplace').value : ''; paneBuilder(el); const r = $('#bres'); if (r) r.scrollIntoView({ block: 'nearest' }); };
  wireLiveEmail(v);
  if ($('#bsave')) $('#bsave').onclick = () => saveToCase({
    text: `${k.label} search: ${v}${b.place ? ` (${b.place.trim()})` : ''}\n` + res.map(r => `• ${r.name}: ${r.url}`).join('\n'),
    url: res[0].url, source: 'Search builder', tags: [b.kind],
  });
}

function paneUsernames(el) {
  const uc = state.uc, U = state.data.usernames;
  const u = cleanInput('username', uc.u);
  const sites = U.sites.map((s, i) => ({ ...s, i, url: s.url.replace(/\{u\}/g, encodeURIComponent(u)) }));
  const counts = { found: 0, notfound: 0, unsure: 0 };
  Object.values(uc.marks).forEach(m => counts[m]++);
  const marked = counts.found + counts.notfound + counts.unsure;
  const shown = sites.filter(s => uc.filter === 'all' || (uc.filter === 'unmarked' ? !uc.marks[s.i] : uc.marks[s.i] === uc.filter));
  const groups = Object.entries(U.categories).map(([id, name]) => ({ id, name, items: shown.filter(s => s.cat === id) })).filter(g => g.items.length);
  const chip = (id, label) => `<button class="chip${uc.filter === id ? ' on' : ''}" type="button" data-ucf="${id}">${label}</button>`;
  el.innerHTML = `<h1>Username checker</h1><p class="muted small">${U.sites.length} sites. Open each profile link and mark what you see. Many sites show a page even when no account exists, so check the content.</p>
    <form class="form" id="uform" novalidate><label class="lbl" for="uq">Username</label>
      <div class="row nowrap"><input type="text" id="uq" class="spacer" value="${esc(uc.u)}" placeholder="e.g. janedoe42" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" id="ugo" type="submit">Check</button></div>
      <div class="err" id="uerr"></div></form>
    ${u ? `${liveUserCard(u)}<div class="stickybar"><div class="tally" id="tally"><span class="f">✓ <b>${counts.found}</b> found</span><span>✗ <b>${counts.notfound}</b> not found</span><span>? <b>${counts.unsure}</b> unsure</span><span class="muted">${U.sites.length - marked} left</span></div>
      <div class="row"><button class="btn sm primary" id="usave" type="button"${marked ? '' : ' disabled'}>${ICONS.save} Save results</button><button class="btn sm ghost" id="uclear" type="button"${marked ? '' : ' disabled'}>Clear marks</button></div></div>
    <div class="filters">${chip('all', 'All')}${chip('unmarked', 'Unmarked')}${chip('found', 'Found')}${chip('unsure', 'Unsure')}${chip('notfound', 'Not found')}</div>
    <div id="ulist">${groups.map(g => `<h2>${esc(g.name)}</h2><div class="reslist">${g.items.map(s => siteRow(s, uc.marks[s.i])).join('')}</div>`).join('') || '<div class="empty">No sites in this filter.</div>'}</div>` : ''}`;
  $('#uform').onsubmit = e => {
    e.preventDefault(); const nv = cleanInput('username', $('#uq').value);
    if (!nv) { $('#uerr').textContent = 'Type a username.'; return; }
    if (nv !== u) { uc.marks = {}; uc.filter = 'all'; }
    uc.u = nv; paneUsernames(el);
  };
  if (!u) return;
  wireLiveUser(u);
  $$('[data-ucf]', el).forEach(c => c.onclick = () => { uc.filter = c.dataset.ucf; paneUsernames(el); });
  $('#uclear').onclick = async () => { if (await confirmDialog('Clear all marks?', 'This resets found / not found / unsure for every site.', 'Clear')) { uc.marks = {}; paneUsernames(el); } };
  $('#usave').onclick = () => {
    const by = m => sites.filter(s => uc.marks[s.i] === m);
    const f = by('found'), un = by('unsure'), nf = by('notfound');
    const text = `Username “${u}”: ${f.length} found, ${un.length} unsure, ${nf.length} not found (of ${U.sites.length} sites checked by hand)`
      + (f.length ? '\nFound:\n' + f.map(s => `• ${s.name}: ${s.url}`).join('\n') : '')
      + (un.length ? '\nUnsure:\n' + un.map(s => `• ${s.name}: ${s.url}`).join('\n') : '')
      + (nf.length ? '\nNot found: ' + nf.map(s => s.name).join(', ') : '');
    saveToCase({ text, url: f[0] ? f[0].url : '', source: 'Username checker', tags: ['username', u.toLowerCase()] });
  };
  $('#ulist').onclick = e => {
    const m = e.target.closest('[data-mark]'); if (!m) return;
    const i = +m.closest('[data-site]').dataset.site, v = m.dataset.mark;
    if (uc.marks[i] === v) delete uc.marks[i]; else uc.marks[i] = v;
    if (uc.filter !== 'all') return paneUsernames(el);
    const row = m.closest('[data-site]'); row.outerHTML = siteRow(sites[i], uc.marks[i]);
    const c = { found: 0, notfound: 0, unsure: 0 }; Object.values(uc.marks).forEach(x => c[x]++); const n = c.found + c.notfound + c.unsure;
    $('#tally').innerHTML = `<span class="f">✓ <b>${c.found}</b> found</span><span>✗ <b>${c.notfound}</b> not found</span><span>? <b>${c.unsure}</b> unsure</span><span class="muted">${U.sites.length - n} left</span>`;
    $('#usave').disabled = $('#uclear').disabled = !n;
  };
}
function siteRow(s, mark) {
  const mk = (v, sym, l) => `<button class="mk ${v}${mark === v ? ' on' : ''}" type="button" data-mark="${v}" aria-pressed="${mark === v}" aria-label="${l}">${sym}</button>`;
  return `<div class="res${mark ? ' st-' + mark : ''}" data-site="${s.i}"><div class="tx"><div class="nm">${esc(s.name)}</div><div class="u mono">${esc(host(s.url))}</div></div>
    ${ext(s.url, 'Open', 'btn sm')}<div class="marks">${mk('found', '✓', 'Found')}${mk('notfound', '✗', 'Not found')}${mk('unsure', '?', 'Unsure')}</div></div>`;
}

function dorkList(d) {
  const q = s => `"${s.trim()}"`, L = [];
  const name = d.name.trim(), place = d.place.trim(), user = cleanInput('username', d.user), email = cleanInput('email', d.email), phone = d.phone.trim(), site = cleanInput('domain', d.site), ft = d.ft;
  if (name) {
    const p = place ? ` ${q(place)}` : '';
    L.push(['Exact name' + (place ? ' + place' : ''), `${q(name)}${p}`]);
    L.push(['Name on social sites', `${q(name)}${p} (site:linkedin.com OR site:facebook.com OR site:instagram.com OR site:x.com OR site:tiktok.com)`]);
    L.push(['Name in documents', `${q(name)}${p} (filetype:pdf OR filetype:doc OR filetype:docx OR filetype:xls OR filetype:xlsx)`]);
    L.push(['Resume / CV', `${q(name)} (intitle:resume OR intitle:cv OR inurl:resume)`]);
    L.push(['Obituaries & relatives', `${q(name)}${p} (obituary OR "survived by" OR relatives)`]);
    L.push(['News mentions', `${q(name)}${p} (site:patch.com OR news OR arrested OR court)`]);
    L.push(['People-search listings', `${q(name)}${p} (site:whitepages.com OR site:fastpeoplesearch.com OR site:truepeoplesearch.com OR site:spokeo.com)`]);
  }
  if (user) {
    L.push(['Username anywhere', q(user)]);
    L.push(['Username in profile URLs', `inurl:${user}`]);
    L.push(['Username on forums', `${q(user)} (site:reddit.com OR forum OR "member since")`]);
    L.push(['Username in pastes / code', `${q(user)} (site:pastebin.com OR site:github.com OR site:gist.github.com)`]);
  }
  if (email) {
    L.push(['Exact email', q(email)]);
    L.push(['Email in documents', `${q(email)} (filetype:pdf OR filetype:xls OR filetype:xlsx OR filetype:csv OR filetype:txt)`]);
    L.push(['Email in pastes / code', `${q(email)} (site:pastebin.com OR site:github.com)`]);
    const local = email.split('@')[0];
    if (local) L.push(['Email username elsewhere', `${q(local)} -${q(email)}`]);
  }
  if (phone) {
    L.push(['Phone formats', phoneVariants(phone)]);
    L.push(['Phone + listings', `${phoneVariants(phone)} (owner OR name OR address)`]);
  }
  if (site) {
    L.push(['Pages on site', `site:${site}`]);
    L.push(['Files on site', `site:${site} filetype:${ft}`]);
    L.push(['Login / admin pages', `site:${site} (inurl:login OR inurl:admin OR intitle:login)`]);
    L.push(['Open directories', `site:${site} intitle:"index of"`]);
    L.push(['Subdomains (excluding www)', `site:*.${site} -site:www.${site}`]);
    L.push(['Mentions elsewhere', `${q(site)} -site:${site}`]);
    if (name) L.push(['Name on this site', `site:${site} ${q(name)}`]);
  }
  return L.map(([label, query]) => ({ label, query }));
}
function customDork(d) {
  const parts = [];
  if (d.c_exact.trim()) parts.push(`"${d.c_exact.trim()}"`);
  if (d.c_site.trim()) parts.push('site:' + cleanInput('domain', d.c_site));
  if (d.c_intitle.trim()) parts.push(`intitle:"${d.c_intitle.trim()}"`);
  if (d.c_inurl.trim()) parts.push('inurl:' + d.c_inurl.trim().replace(/\s+/g, ''));
  if (d.c_intext.trim()) parts.push(`intext:"${d.c_intext.trim()}"`);
  if (d.c_ft.trim()) parts.push('filetype:' + d.c_ft.trim().replace(/^\./, ''));
  d.c_ex.split(/[,\s]+/).filter(Boolean).forEach(w => parts.push('-' + w.replace(/^-/, '')));
  if (d.c_extra.trim()) parts.push(d.c_extra.trim());
  return parts.join(' ');
}
const FILETYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx', 'sql', 'log', 'env', 'xml', 'json'];
function paneDorks(el) {
  const d = state.dork;
  const field = (k, label, ph, type = 'text') => `<label class="lbl" for="dk-${k}">${label}</label><input type="${type}" id="dk-${k}" data-dk="${k}" value="${esc(d[k])}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`;
  el.innerHTML = `<h1>Google dork builder</h1><p class="muted small">Fill in what you know. Queries update as you type. Copy them or open them in Google.</p>
    <div class="form card" id="dform">
      ${field('name', 'Full name', 'Jane Doe')}${field('place', 'City / state', 'Denver CO')}${field('user', 'Username', 'janedoe42')}
      ${field('email', 'Email', 'jane@example.com', 'email')}${field('phone', 'Phone', '206-555-0100', 'tel')}${field('site', 'Domain', 'example.com')}
      <label class="lbl" for="dk-ft">File type for domain search</label><select id="dk-ft" data-dk="ft">${FILETYPES.map(f => `<option${f === d.ft ? ' selected' : ''}>${f}</option>`).join('')}</select>
    </div>
    <div id="dlist"></div>
    <h2>Custom composer</h2>
    <div class="form card" id="cform">
      ${field('c_exact', 'Exact phrase', 'Jane Doe')}${field('c_site', 'site:', 'example.com')}${field('c_intitle', 'intitle:', 'resume')}
      ${field('c_inurl', 'inurl:', 'profile')}${field('c_intext', 'intext:', 'phone')}${field('c_ft', 'filetype:', 'pdf')}
      ${field('c_ex', 'Exclude words', 'jobs, ads')}${field('c_extra', 'Anything else', 'OR "J. Doe"')}
      <div class="query mono" id="cq" aria-live="polite"></div>
      <div class="row"><button class="btn sm" type="button" id="ccopy">${ICONS.copy} Copy</button><a class="btn sm primary" id="copen" target="_blank" rel="noopener noreferrer" href="#">Open in Google ${ICONS.open}</a></div>
    </div>`;
  const drawList = () => {
    const L = dorkList(d);
    $('#dlist').innerHTML = L.length ? `<div class="row"><h2 class="spacer" id="dcount">${L.length} queries</h2><button class="btn sm" type="button" id="dsave">${ICONS.save} Save to case</button></div>
      ${L.map((x, i) => `<div class="card" data-dork="${i}"><div class="small muted">${esc(x.label)}</div><div class="query mono">${esc(x.query)}</div>
        <div class="row"><button class="btn sm" type="button" data-copy="${esc(x.query)}">${ICONS.copy} Copy</button>${ext(googleURL(x.query), 'Open in Google ' + ICONS.open, 'btn sm primary')}</div></div>`).join('')}`
      : '<div class="empty small">Fill in at least one field above to generate queries.</div>';
    if ($('#dsave')) $('#dsave').onclick = () => saveToCase({ text: 'Google dorks:\n' + L.map(x => `• ${x.label}: ${x.query}`).join('\n'), url: googleURL(L[0].query), source: 'Dork builder', tags: ['dork'] });
  };
  const drawCustom = () => {
    const q = customDork(d);
    $('#cq').textContent = q || 'Your query appears here.';
    $('#copen').href = q ? googleURL(q) : 'https://www.google.com/';
    $('#ccopy').disabled = !q;
  };
  $$('[data-dk]', el).forEach(i => i.addEventListener('input', () => { d[i.dataset.dk] = i.value; i.dataset.dk.startsWith('c_') ? drawCustom() : drawList(); }));
  $('#ccopy').onclick = () => { const q = customDork(d); if (q) copyText(q); };
  drawList(); drawCustom();
}

function paneImage(el) {
  const im = state.img, url = im.url.trim(), ok = isHttp(url);
  const engines = state.data.tools.filter(t => t.search && t.search.image);
  el.innerHTML = `<h1>Reverse image search</h1><p class="muted small">Paste a link to an image that’s already online. Third Eye builds search links for ${engines.length} engines.</p>
    <form class="form" id="iform" novalidate><label class="lbl" for="iq">Image URL</label>
      <div class="row nowrap"><input type="url" id="iq" class="spacer" value="${esc(im.url)}" placeholder="https://…/photo.jpg" inputmode="url" autocomplete="off" spellcheck="false"><button class="btn primary" id="igo" type="submit">Build</button></div>
      <div class="err" id="ierr">${im.url && !ok ? 'Enter a full image link starting with https://' : ''}</div></form>
    ${ok ? `<div class="row"><span class="resultcount spacer">${engines.length} engines</span><button class="btn sm" type="button" id="isave">${ICONS.save} Save to case</button></div>
    <div class="reslist" id="ires">${engines.map(t => { const u = fillTemplate(t.search.image, url); return `<div class="res" data-engine="${esc(t.id)}"><div class="tx"><div class="nm">${esc(t.name)}</div><div class="u mono">${esc(host(u))}</div></div><button class="btn sm ghost" type="button" data-copy="${esc(u)}" aria-label="Copy link">${ICONS.copy}</button>${ext(u, 'Open ' + ICONS.open, 'btn sm')}</div>`; }).join('')}</div>` : ''}
    <div class="card note small" id="upload-note"><b>Photo on your phone?</b> Third Eye can’t upload it for you (that would need a server). Open an engine below and use its own upload button, or in Chrome long-press any web image and choose “Search image with Google”.
      <div class="row">${engines.map(t => ext(t.url, esc(t.name), 'btn sm ghost')).join('')}</div></div>`;
  $('#iform').onsubmit = e => { e.preventDefault(); im.url = $('#iq').value.trim(); paneImage(el); };
  if ($('#isave')) $('#isave').onclick = () => saveToCase({ text: `Reverse image search: ${url}\n` + engines.map(t => `• ${t.name}: ${fillTemplate(t.search.image, url)}`).join('\n'), url, source: 'Reverse image', tags: ['image'] });
}

// ---------- CASES ----------
function findingHTML(f, ts = [], showCase = false) {
  return `<div class="card finding" data-fid="${esc(f.id)}">
    <div class="meta"><span class="date">${esc(fmtDate(f.date))}</span>${f.source ? `<span class="src">${hl(f.source, ts)}</span>` : ''}${showCase ? `<a class="casename" href="#/case/${esc(f.caseId)}">${esc(caseName(f.caseId))}</a>` : ''}</div>
    <div class="what">${hl(f.text, ts)}</div>
    ${f.url ? `<div class="link"><span class="u mono">${hl(f.url, ts)}</span><button class="btn sm ghost" type="button" data-copy="${esc(f.url)}" aria-label="Copy link">${ICONS.copy}</button>${ext(f.url, 'Open ' + ICONS.open, 'btn sm')}</div>` : ''}
    ${f.tags.length ? `<div class="tags">${f.tags.map(t => `<span class="tag">#${hl(t, ts)}</span>`).join('')}</div>` : ''}
    <div class="acts"><button class="btn sm ghost" type="button" data-fedit="${esc(f.id)}">Edit</button><button class="btn sm ghost danger" type="button" data-fdel="${esc(f.id)}">Delete</button></div>
  </div>`;
}
const caseMatches = (c, ts) => ts.every(t => [c.name, c.subject, c.notes].join(' ').toLowerCase().includes(t));
const findingMatches = (f, ts) => ts.every(t => [f.text, f.url, f.source, f.tags.join(' '), f.tags.map(x => '#' + x).join(' ')].join(' ').toLowerCase().includes(t));
function renderCases() {
  const ts = state.caseQ.toLowerCase().split(/\s+/).filter(Boolean);
  const active = state.cases.filter(c => !c.archived), archived = state.cases.filter(c => c.archived);
  const nFind = id => state.findings.filter(f => f.caseId === id).length;
  const card = c => `<a class="card casecard${c.archived ? ' archived' : ''}" href="#/case/${esc(c.id)}" data-case="${esc(c.id)}">
      <div class="top"><span class="name">${hl(c.name, ts)}</span>${c.archived ? '<span class="pill">Archived</span>' : ''}${ICONS.chev}</div>
      ${c.subject ? `<div class="subject">Subject: ${hl(c.subject, ts)}</div>` : ''}
      <div class="sub">${nFind(c.id)} finding${nFind(c.id) === 1 ? '' : 's'} · updated ${esc(fmtDate(c.updatedAt))}</div></a>`;
  let body;
  if (ts.length) {
    const cs = state.cases.filter(c => caseMatches(c, ts)), fs = state.findings.filter(f => findingMatches(f, ts));
    body = `<div class="resultcount" id="casecount">${cs.length} case${cs.length === 1 ? '' : 's'} · ${fs.length} finding${fs.length === 1 ? '' : 's'} match</div>
      ${cs.length ? `<h2>Cases</h2>${cs.map(card).join('')}` : ''}${fs.length ? `<h2>Findings</h2>${fs.map(f => findingHTML(f, ts, true)).join('')}` : ''}
      ${cs.length || fs.length ? '' : '<div class="empty"><span class="big">🔍</span>Nothing matches.</div>'}`;
  } else {
    body = `<div class="resultcount" id="casecount">${active.length} active case${active.length === 1 ? '' : 's'} · ${state.findings.length} finding${state.findings.length === 1 ? '' : 's'}</div>
      ${active.map(card).join('') || '<div class="empty"><span class="big">🗂️</span>No cases yet. A case groups findings about one subject: yourself, a family member, an account.</div>'}
      ${archived.length ? `<button class="btn ghost block" type="button" id="togglearch">${state.showArchived ? 'Hide' : 'Show'} archived (${archived.length})</button>${state.showArchived ? archived.map(card).join('') : ''}` : ''}`;
  }
  view.innerHTML = `${backupBanner()}<div class="row"><h1 class="spacer">Cases</h1><button class="btn primary sm" type="button" id="newcase">+ New case</button></div>
    <div class="searchbox">${ICONS.search}<input id="cq" type="search" placeholder="Search all cases and findings" autocomplete="off" value="${esc(state.caseQ)}" aria-label="Search cases"><button class="clear" id="cqclear" type="button" aria-label="Clear"${state.caseQ ? '' : ' hidden'}>×</button></div>
    ${body}<div class="endmark" id="end"></div>`;
  const q = $('#cq');
  q.oninput = () => { state.caseQ = q.value; const p = q.selectionStart; renderCases(); const n = $('#cq'); n.focus(); n.setSelectionRange(p, p); };
  $('#cqclear').onclick = () => { state.caseQ = ''; renderCases(); };
  $('#newcase').onclick = () => openCaseForm();
  if ($('#togglearch')) $('#togglearch').onclick = () => { state.showArchived = !state.showArchived; renderCases(); };
}
function renderCase(id) {
  const c = state.cases.find(x => x.id === id);
  if (!c) { view.innerHTML = `<div class="empty"><span class="big">🗂️</span>That case doesn’t exist any more.<br><a class="btn" href="#/cases">Back to cases</a></div><div class="endmark" id="end"></div>`; return; }
  const fs = state.findings.filter(f => f.caseId === id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  view.innerHTML = `<div class="detailhead"><a class="iconbtn" href="#/cases" aria-label="Back to cases">${ICONS.back}</a><h1 id="casetitle">${esc(c.name)}</h1></div>
    ${c.archived ? '<div class="banner"><span>📦</span><div class="spacer">This case is archived.</div></div>' : ''}
    ${c.subject ? `<div class="subject">Subject: <b>${esc(c.subject)}</b></div>` : ''}
    ${c.notes ? `<p class="muted small">${esc(c.notes)}</p>` : ''}
    <div class="acts"><button class="btn sm primary" type="button" id="addf">+ Add finding</button><button class="btn sm" type="button" id="editcase">Edit</button>
      <button class="btn sm" type="button" id="archcase">${c.archived ? 'Unarchive' : 'Archive'}</button><button class="btn sm danger" type="button" id="delcase">Delete</button></div>
    <h2 id="fcount">${fs.length} finding${fs.length === 1 ? '' : 's'}</h2>
    ${fs.map(f => findingHTML(f)).join('') || '<div class="empty small">No findings yet. Save results from the Search tools or tap + to add one.</div>'}
    <div class="endmark" id="end"></div>`;
  $('#addf').onclick = () => openFinding(null, c.id);
  $('#editcase').onclick = () => openCaseForm(c);
  $('#archcase').onclick = async () => { await store.saveCase({ ...c, archived: !c.archived }); await load(); render(); toast(c.archived ? 'Case restored' : 'Case archived'); };
  $('#delcase').onclick = async () => {
    if (!await confirmDialog('Delete this case?', `“${c.name}” and its ${fs.length} finding${fs.length === 1 ? '' : 's'} will be deleted from this phone.`, 'Delete', true)) return;
    await store.deleteCase(c.id); await load(); location.hash = '#/cases'; toast('Case deleted');
  };
}
view.addEventListener('click', async e => {
  const ed = e.target.closest('[data-fedit]'), del = e.target.closest('[data-fdel]');
  if (ed) { const f = state.findings.find(x => x.id === ed.dataset.fedit); if (f) openFinding(f); }
  if (del) {
    const f = state.findings.find(x => x.id === del.dataset.fdel); if (!f) return;
    if (!await confirmDialog('Delete this finding?', f.text.slice(0, 120), 'Delete', true)) return;
    await store.deleteFinding(f.id); await load(); render(); toast('Finding deleted');
  }
});
function openCaseForm(c = null) {
  const root = openSheet(`<header><h2 id="sheet-title">${c ? 'Edit case' : 'New case'}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${ICONS.x}</button></header>
    <form class="body form" id="caseform" novalidate>
      <label class="lbl" for="cs-name">Case name</label><input type="text" id="cs-name" value="${esc(c ? c.name : '')}" placeholder="e.g. Self-audit 2026" autocomplete="off">
      <label class="lbl" for="cs-subject">Subject <span class="opt">(who or what this is about)</span></label><input type="text" id="cs-subject" value="${esc(c ? c.subject : '')}" placeholder="e.g. Me, @handle, jane@example.com" autocomplete="off">
      <label class="lbl" for="cs-notes">Notes <span class="opt">(optional)</span></label><textarea id="cs-notes" rows="3">${esc(c ? c.notes : '')}</textarea>
      <div class="err" id="cs-err"></div></form>
    <footer><button class="btn primary" type="submit" form="caseform" id="cs-save">${c ? 'Save' : 'Create case'}</button></footer>`);
  const S = s => root.querySelector(s);
  S('#caseform').onsubmit = async e => {
    e.preventDefault(); const name = S('#cs-name').value.trim();
    if (!name) { S('#cs-err').textContent = 'Give the case a name.'; return S('#cs-name').focus(); }
    const saved = await store.saveCase({ ...(c || {}), name, subject: S('#cs-subject').value, notes: S('#cs-notes').value });
    await store.saveSettings({ lastCaseId: saved.id });
    await closeSheet(); await load();
    if (c) { render(); toast('Case saved'); } else { location.hash = '#/case/' + saved.id; toast('Case created ✓'); }
  };
  setTimeout(() => root.isConnected && S('#cs-name').focus(), 60);
}
const SOURCES = ['Manual', 'Search builder', 'Username checker', 'Dork builder', 'Reverse image', 'Data broker', 'Social media', 'Public records', 'News'];
function openFinding(f = null, caseId = null) {
  const active = state.cases.filter(c => !c.archived || (f && c.id === f.caseId));
  const sel = f ? f.caseId : caseId || (active.find(c => c.id === state.settings.lastCaseId) || active[0] || {}).id || '__new';
  const root = openSheet(`<header><h2 id="sheet-title">${f ? 'Edit finding' : 'Add finding'}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${ICONS.x}</button></header>
    <form class="body form" id="fform" novalidate>
      <label class="lbl" for="ff-case">Case</label><select id="ff-case">${active.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new"${sel === '__new' ? ' selected' : ''}>+ New case…</option></select>
      <input type="text" id="ff-newcase" placeholder="New case name"${sel === '__new' ? '' : ' hidden'} autocomplete="off">
      <label class="lbl" for="ff-text">What did you find?</label><textarea id="ff-text" rows="4" placeholder="e.g. Old Spokeo listing shows current address">${esc(f ? f.text : '')}</textarea>
      <label class="lbl" for="ff-url">Link <span class="opt">(optional)</span></label><input type="url" id="ff-url" value="${esc(f ? f.url : '')}" placeholder="https://" inputmode="url" autocomplete="off">
      <label class="lbl" for="ff-source">Source tool</label><input type="text" id="ff-source" list="ff-sources" value="${esc(f ? f.source : 'Manual')}" autocomplete="off"><datalist id="ff-sources">${SOURCES.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="lbl" for="ff-tags">Tags <span class="opt">(comma separated)</span></label><input type="text" id="ff-tags" value="${esc(f ? f.tags.join(', ') : '')}" placeholder="address, broker" autocomplete="off" autocapitalize="off">
      <label class="lbl" for="ff-date">Date</label><input type="date" id="ff-date" value="${esc(f ? f.date : today())}">
      <div class="err" id="ff-err"></div></form>
    <footer>${f ? '<button class="btn danger" type="button" id="ff-del">Delete</button>' : ''}<button class="btn primary" type="submit" form="fform" id="ff-save">Save</button></footer>`);
  const S = s => root.querySelector(s);
  S('#ff-case').onchange = () => { S('#ff-newcase').hidden = S('#ff-case').value !== '__new'; if (!S('#ff-newcase').hidden) S('#ff-newcase').focus(); };
  if (S('#ff-del')) S('#ff-del').onclick = async () => {
    if (!await confirmDialog('Delete this finding?', f.text.slice(0, 120), 'Delete', true)) return;
    await store.deleteFinding(f.id); await closeSheet(); await load(); render(); toast('Finding deleted');
  };
  S('#fform').onsubmit = async e => {
    e.preventDefault();
    const text = S('#ff-text').value.trim(); let url = S('#ff-url').value.trim();
    if (!text) { S('#ff-err').textContent = 'Describe what you found.'; return S('#ff-text').focus(); }
    if (url && !/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    if (url && !isHttp(url)) { S('#ff-err').textContent = 'That link doesn’t look right.'; return S('#ff-url').focus(); }
    let cid = S('#ff-case').value;
    if (cid === '__new') {
      const n = S('#ff-newcase').value.trim();
      if (!n) { S('#ff-err').textContent = 'Name the new case.'; return S('#ff-newcase').focus(); }
      cid = (await store.saveCase({ name: n })).id;
    }
    await store.saveFinding({ ...(f || {}), caseId: cid, text, url, source: S('#ff-source').value.trim() || 'Manual', tags: S('#ff-tags').value.split(','), date: S('#ff-date').value || today() });
    await store.saveSettings({ lastCaseId: cid });
    closeSheet(); await load(); render(); toast(f ? 'Finding saved' : 'Finding added to ' + caseName(cid) + ' ✓');
  };
  setTimeout(() => root.isConnected && S('#ff-text').focus(), 60);
}

// ---------- REMOVAL ----------
const stOf = id => state.brokerStatus.get(id) || { id, status: 'not started', date: '', listingUrl: '', notes: '' };
const isDue = s => (s.status === 'submitted' || s.status === 'confirmed removed') && s.date && daysSince(s.date) >= 90;
function updateBadge() {
  const n = state.data.brokers.filter(b => isDue(stOf(b.id))).length;
  const el = $('#removal-badge'); if (!el) return;
  el.hidden = !n; el.textContent = n; el.setAttribute('aria-label', `${n} broker${n === 1 ? '' : 's'} due for a recheck`);
}
const PROFILE = [['name', 'Full legal name', 'Jane Q Doe'], ['aliases', 'Other names / maiden names', 'Jane Smith'], ['address', 'Current address', '123 Main St, Denver CO 80202'],
  ['pastAddresses', 'Past addresses', 'Old address, city'], ['emails', 'Emails to remove', 'jane@example.com'], ['phones', 'Phones to remove', '206-555-0100'], ['contactEmail', 'Contact email for replies', 'jane.optout@example.com']];
function optOutText(b) {
  const p = state.settings.profile || {}, st = b ? stOf(b.id) : {};
  const line = (l, v) => v && v.trim() ? `${l}: ${v.trim()}\n` : '';
  return `Subject: Request to remove my personal information${b ? ' from ' + b.name : ''}

To the ${b ? b.name : '[company]'} privacy team,

I am requesting that you remove all records about me from ${b ? b.name : 'your site'}${b && b.covers && b.covers.length ? ` and affiliated sites (${b.covers.join(', ')})` : ''}, stop selling or sharing my personal information, and suppress it from future collection. This request is made under applicable privacy laws, including state consumer privacy laws where they apply.

${line('Name', p.name)}${line('Other names', p.aliases)}${line('Current address', p.address)}${line('Past addresses', p.pastAddresses)}${line('Email(s)', p.emails)}${line('Phone(s)', p.phones)}${st.listingUrl ? `Listing URL: ${st.listingUrl}\n` : ''}
Please confirm in writing when my information has been removed. You may contact me at ${p.contactEmail && p.contactEmail.trim() ? p.contactEmail.trim() : '[your email]'}.

Thank you,
${p.name && p.name.trim() ? p.name.trim() : '[your name]'}
${today()}`;
}
const stSlug = s => slug(s);
function brokerHTML(b) {
  const s = stOf(b.id), due = isDue(s);
  return `<div class="card broker" data-broker="${esc(b.id)}">
    <div class="top"><div class="spacer"><div class="name">${esc(b.name)}</div>${b.parent ? `<div class="parent">${esc(b.parent)}</div>` : ''}</div>
      <span class="st st-${stSlug(s.status)}" data-stlabel>${esc(cap(s.status))}</span></div>
    ${due ? `<div class="due">⟳ Recheck due · ${daysSince(s.date)} days since ${esc(s.status)}</div>` : ''}
    ${s.date && !due ? `<div class="tiny muted">${esc(cap(s.status))} ${esc(fmtDate(s.date))}${s.status !== 'reappeared' ? ` · recheck in ${Math.max(0, 90 - daysSince(s.date))} days` : ''}</div>` : ''}
    <dl class="facts"><dt>Requires</dt><dd>${b.requires && b.requires.length ? esc(b.requires.join(', ')) : '<span class="muted">not listed</span>'}</dd>
      <dt>Turnaround</dt><dd>${b.turnaround ? esc(b.turnaround) : '<span class="muted">unknown</span>'}</dd>
      ${b.covers && b.covers.length ? `<dt>Also covers</dt><dd>${esc(b.covers.join(', '))}</dd>` : ''}</dl>
    <div class="row">${b.opt_out_url ? ext(b.opt_out_url, 'Open opt-out page ' + ICONS.open, 'btn sm primary') : '<span class="infoonly">Info only · no opt-out form</span>'}
      <button class="btn sm" type="button" data-tplfor="${esc(b.id)}">${ICONS.copy} Copy request</button></div>
    <div class="statusrow" role="radiogroup" aria-label="Status for ${esc(b.name)}">${BROKER_STATUSES.map(x => `<button class="chip st-c-${stSlug(x)}${s.status === x ? ' on' : ''}" type="button" role="radio" aria-checked="${s.status === x}" data-setst="${esc(x)}">${esc(cap(x))}</button>`).join('')}</div>
    <details${s.listingUrl || s.notes ? '' : ''}><summary>Details &amp; notes</summary>
      <div class="form">
        <label class="lbl" for="bd-${esc(b.id)}">Status date</label><input type="date" id="bd-${esc(b.id)}" data-bdate value="${esc(s.date)}">
        <label class="lbl" for="bl-${esc(b.id)}">Your listing URL</label><input type="url" id="bl-${esc(b.id)}" data-blist value="${esc(s.listingUrl)}" placeholder="https://" inputmode="url" autocomplete="off">
        <label class="lbl" for="bn-${esc(b.id)}">Notes</label><textarea id="bn-${esc(b.id)}" data-bnotes rows="2" placeholder="Confirmation number, email used…">${esc(s.notes)}</textarea>
        ${s.status !== 'not started' ? '<button class="btn sm ghost" type="button" data-rechecked>Rechecked today (reset 90-day timer)</button>' : ''}
        <p class="tiny muted">${esc(b.notes || '')}${b.checked_at ? ` · link checked ${esc(b.checked_at)}` : ''}</p>
      </div></details>
  </div>`;
}
function renderRemoval() {
  const B = state.data.brokers, counts = Object.fromEntries(BROKER_STATUSES.map(s => [s, 0]));
  B.forEach(b => counts[stOf(b.id).status]++);
  const due = B.filter(b => isDue(stOf(b.id)));
  const f = state.brokerFilter;
  const shown = B.filter(b => f === 'all' || (f === 'due' ? isDue(stOf(b.id)) : stOf(b.id).status === f));
  const p = state.settings.profile || {};
  const chip = (id, l) => `<button class="chip${f === id ? ' on' : ''}" type="button" data-bf="${esc(id)}">${esc(l)}</button>`;
  view.innerHTML = `${backupBanner()}<h1>Data broker removal</h1>
    <div class="stats" id="bstats">${BROKER_STATUSES.map(s => `<div class="stat st-${stSlug(s)}"><b>${counts[s]}</b><span>${esc(cap(s))}</span></div>`).join('')}</div>
    ${due.length ? `<div class="banner" id="duebanner"><span>⟳</span><div class="spacer"><b>${due.length}</b> broker${due.length === 1 ? '' : 's'} due for a recheck (90+ days). Listings often come back.</div><button class="btn sm" type="button" data-bf="due">Show</button></div>` : ''}
    <div class="card note small">🛡️ Third Eye <b>never sends anything</b> to brokers. Open each opt-out page yourself, then record the status here. Your details below stay on this phone.</div>
    <details class="card" id="tplcard"${state.tplOpen ? ' open' : ''}><summary><b>Opt-out request template</b></summary>
      <div class="form">${PROFILE.map(([k, l, ph]) => `<label class="lbl" for="pf-${k}">${l}</label><input type="text" id="pf-${k}" data-pf="${k}" value="${esc(p[k] || '')}" placeholder="${esc(ph)}" autocomplete="off">`).join('')}
        <label class="lbl" for="tpl-broker">Broker</label><select id="tpl-broker"><option value="">Generic</option>${B.map(b => `<option value="${esc(b.id)}"${b.id === state.tplBroker ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <pre class="tpl" id="tpl"></pre>
      <button class="btn primary sm" type="button" id="tplcopy">${ICONS.copy} Copy request</button></details>
    <div class="filters">${chip('all', `All (${B.length})`)}${chip('due', `Due (${due.length})`)}${BROKER_STATUSES.map(s => chip(s, `${cap(s)} (${counts[s]})`)).join('')}</div>
    <div id="blist">${shown.map(brokerHTML).join('') || '<div class="empty small">No brokers in this filter.</div>'}</div>
    <div class="endmark" id="end"></div>`;
  const drawTpl = () => { $('#tpl').textContent = optOutText(B.find(b => b.id === state.tplBroker)); };
  drawTpl();
  $('#tplcard').ontoggle = () => { state.tplOpen = $('#tplcard').open; };
  let t;
  $$('[data-pf]').forEach(i => i.oninput = () => {
    state.settings.profile = { ...(state.settings.profile || {}), [i.dataset.pf]: i.value }; drawTpl();
    clearTimeout(t); t = setTimeout(() => store.saveSettings({ profile: state.settings.profile }), 400);
  });
  $('#tpl-broker').onchange = () => { state.tplBroker = $('#tpl-broker').value; drawTpl(); };
  $('#tplcopy').onclick = () => copyText($('#tpl').textContent, 'Request copied ✓');
  $$('[data-bf]').forEach(c => c.onclick = () => { state.brokerFilter = c.dataset.bf; renderRemoval(); });
  const list = $('#blist');
  list.onclick = async e => {
    const card = e.target.closest('[data-broker]'); if (!card) return;
    const id = card.dataset.broker, b = B.find(x => x.id === id);
    const sb = e.target.closest('[data-setst]');
    if (sb) {
      const status = sb.dataset.setst; if (status === stOf(id).status) return;
      await saveBroker(id, { status, date: status === 'not started' ? '' : today() });
      toast(`${b.name}: ${status}`);
      if (state.brokerFilter !== 'all') renderRemoval(); else refreshRemovalStats();
    }
    if (e.target.closest('[data-tplfor]')) { await store.saveSettings({ profile: state.settings.profile }); copyText(optOutText(b), `Request for ${b.name} copied ✓`); }
    if (e.target.closest('[data-rechecked]')) { await saveBroker(id, { date: today() }); toast('Timer reset'); refreshRemovalStats(); }
  };
  list.onchange = async e => {
    const card = e.target.closest('[data-broker]'); if (!card) return;
    const id = card.dataset.broker, i = e.target;
    if (i.matches('[data-bdate]')) { await saveBroker(id, { date: i.value }); refreshRemovalStats(); }
    if (i.matches('[data-blist]')) await saveBroker(id, { listingUrl: i.value.trim() }, false);
    if (i.matches('[data-bnotes]')) await saveBroker(id, { notes: i.value }, false);
  };
}
async function saveBroker(id, patch, redraw = true) {
  // Update in-memory state first so quick successive edits (URL, then notes) never overwrite each other.
  const next = { ...stOf(id), ...patch, id }; state.brokerStatus.set(id, next);
  const rec = await store.saveBrokerStatus(next);
  if (state.brokerStatus.get(id) === next) state.brokerStatus.set(id, rec);
  updateBadge();
  if (redraw) {
    const old = $(`[data-broker="${CSS.escape(id)}"]`), b = state.data.brokers.find(x => x.id === id);
    if (old && b) { const wasOpen = old.querySelector('details').open; old.outerHTML = brokerHTML(b); if (wasOpen) $(`[data-broker="${CSS.escape(id)}"] details`).open = true; }
  }
}
function refreshRemovalStats() { const y = scrollY; renderRemoval(); scrollTo(0, y); }


// ---------- LIVE CHECKS (optional server running Sherlock + Holehe) ----------
// The app works fully offline without this. The server URL and API key live only in IndexedDB
// on this phone (not in backups). Requests go only to that server (CSP connect-src allows only it).
const LIVE_NOISY = ['f3.cool', 'tiktok', 'pinterest', 'venmo', 'cashapp', 'snapchat', 'periscope', 'clubhouse', 'vero', 'trello', 'threads', 'blogger', 'tumblr', 'omg.lol'];
const LIVE_WARN = 'Results can include false positives, and many sites block the server: open each link to confirm.';
const liveReady = () => !!(state.live.key && state.live.url);
function liveOrigin(u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.origin : ''; } catch { return ''; } }
async function liveFetch(path, { method = 'GET', body = null, auth = true, timeout = 15000 } = {}) {
  const origin = liveOrigin(state.live.url);
  if (!origin) throw new Error('The server URL must start with https://');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  const headers = {};
  if (auth) headers.Authorization = 'Bearer ' + state.live.key;
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(origin + path, { method, headers, body: body ? JSON.stringify(body) : undefined, mode: 'cors', credentials: 'omit',
      cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The server took too long to answer.' : 'Can\u2019t reach the live check server. Check the URL and your connection.');
  } finally { clearTimeout(t); }
  let data = null; try { data = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) {
    const d = data && typeof data.detail === 'string' ? data.detail : '';
    const err = new Error(r.status === 422 ? 'The server can\u2019t check that value. Check the spelling.' : r.status === 401 ? 'The server rejected the API key. Check it in Settings.' : r.status === 429 ? (d || 'Too many checks right now.') + ' Try again later.' : d || `Server error (${r.status}).`);
    err.status = r.status; throw err;
  }
  return data;
}
async function liveNeedsKey() {
  const v = await choiceDialog('Set up live checks', 'Live checks run Sherlock and Holehe on your own server. To use them, open Settings \u2192 Live check server, paste the API key from your server, and tap Test connection. Without a server, everything else in Third Eye keeps working offline.',
    [{ v: 'settings', label: 'Open Settings', primary: true }]);
  if (v === 'settings') location.hash = '#/settings';
}
function wireLiveUser(u) {
  if ($('#ulive')) $('#ulive').onclick = () => startLive('username', u);
  if ($('#ulive-save')) $('#ulive-save').onclick = () => saveLiveResults(state.liveJobs.username);
}
function wireLiveEmail(v) {
  if ($('#elive')) $('#elive').onclick = () => startLive('email', v);
  if ($('#elive-save')) $('#elive-save').onclick = () => saveLiveResults(state.liveJobs.email);
}
// Progress updates replace only the live card, so typing elsewhere on the page is never interrupted.
// When a check finishes, the whole pane re-renders (to show new marks) unless you're typing.
function liveRerender(full = false) {
  const el = $('#spane'); if (!el || route().a !== 'search') return;
  const isU = !!$('#ulive-card'), isE = !!$('#elive-card');
  if (!isU && !isE) return;
  const ae = document.activeElement, typing = ae && el.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
  if (full && !typing) { const y = scrollY; (isU ? paneUsernames : paneBuilder)(el); scrollTo(0, y); return; }
  if (isU) { const u = cleanInput('username', state.uc.u); $('#ulive-card').outerHTML = liveUserCard(u); wireLiveUser(u); }
  else { const v = cleanInput('email', state.builder.q); $('#elive-card').outerHTML = liveEmailCard(v); wireLiveEmail(v); }
}
async function startLive(kind, query) {
  if (!liveReady()) return liveNeedsKey();
  if (kind === 'username' && !/^[A-Za-z0-9._-]{1,40}$/.test(query)) return alertDialog('Can\u2019t live-check this', 'Live checks accept usernames of up to 40 letters, digits, dots, dashes and underscores.');
  const cur = state.liveJobs[kind];
  if (cur && cur.query === query && ['starting', 'queued', 'running'].includes(cur.status)) return;
  const job = { kind, query, status: 'starting', progress: { done: 0, total: null, counts: {} }, results: [], error: '', applied: false, t0: Date.now() };
  state.liveJobs[kind] = job; liveRerender();
  try {
    const r = await liveFetch('/api/' + kind, { method: 'POST', body: kind === 'username' ? { username: query } : { email: query } });
    job.id = r.job_id; job.status = r.status || 'queued';
  } catch (e) { job.status = 'error'; job.error = e.message; liveRerender(); return; }
  liveRerender();
  let fails = 0;
  while (state.liveJobs[kind] === job) {
    await new Promise(r => setTimeout(r, 2000));
    if (state.liveJobs[kind] !== job) return;
    try {
      const j = await liveFetch('/api/jobs/' + encodeURIComponent(job.id)); fails = 0;
      Object.assign(job, { status: j.status, progress: j.progress || job.progress, results: Array.isArray(j.results) ? j.results : [], error: j.error || '', duration: j.duration_s, position: j.position });
    } catch (e) {
      if (e.status === 401 || e.status === 404 || ++fails >= 4) { job.status = 'error'; job.error = e.message; }
    }
    if (job.status === 'done' || job.status === 'error') {
      if (kind === 'username') applyLiveMarks(job);
      liveRerender(true); toast(job.status === 'done' ? 'Live check finished \u2713' : 'Live check failed'); return;
    }
    liveRerender();
  }
}
function liveFound(job) { return job.results.filter(r => job.kind === 'username' ? r.status === 'found' : r.exists); }
const isNoisy = r => LIVE_NOISY.some(n => (r.site || '').toLowerCase().includes(n) || host(r.url || '').includes(n));
function siteHost(u) { return host(u).replace(/^(m|mobile)\./, ''); }
function applyLiveMarks(job) {
  // Mark sites from the existing checklist that Sherlock reported: found, or unsure for noisy sites. Never overrides a hand mark.
  const uc = state.uc; if (job.applied || cleanInput('username', uc.u) !== job.query) return;
  const U = state.data.usernames.sites, u = encodeURIComponent(job.query);
  const byName = new Map(U.map((s, i) => [s.name.toLowerCase().replace(/[^a-z0-9]/g, ''), i]));
  const byUrl = new Map(U.map((s, i) => [siteHost(s.url.replace(/\{u\}/g, u)) + '|' + s.url.replace(/\{u\}/g, u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), i]));
  let n = 0;
  for (const r of liveFound(job)) {
    const k = String(r.url || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    let i = byUrl.get(siteHost(r.url) + '|' + k);
    if (i === undefined) i = byName.get(String(r.site).toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (i === undefined || uc.marks[i]) continue;
    uc.marks[i] = isNoisy(r) ? 'unsure' : 'found'; n++;
  }
  job.applied = true; job.marked = n;
}
function liveStatusHTML(job, what) {
  if (!job) return '';
  if (job.status === 'error') return `<div class="err live-err" id="${what}-lerr">${esc(job.error || 'The live check failed.')}</div>`;
  if (job.status !== 'done') {
    const p = job.progress || {};
    const msg = job.status === 'starting' ? 'Starting\u2026' : job.status === 'queued' ? `Queued${job.position ? ` (#${job.position})` : ''}\u2026`
      : p.total ? `Checked ${p.done} of ${p.total} ${what === 'u' ? 'sites' : 'modules'}\u2026` : 'Running\u2026';
    return `<div class="liveprog" id="${what}-lprog" role="status"><progress max="${p.total || 1}" value="${p.total ? p.done : 0}" aria-label="Live check progress"></progress><span class="small muted">${esc(msg)} ${Math.round((Date.now() - job.t0) / 1000)} s</span></div>`;
  }
  return '';
}
function liveUserCard(u) {
  const job = state.liveJobs.username, mine = job && job.query === u ? job : null;
  const running = mine && !['done', 'error'].includes(mine.status);
  let out = '';
  if (mine && mine.status === 'done') {
    const f = liveFound(mine), c = mine.progress.counts || {};
    out = `<p class="small" id="ulive-sum"><b>${f.length}</b> possible accounts on ${mine.progress.total || '?'} sites in ${mine.duration ?? '?'} s. ${c.blocked || 0} blocked the server, ${c.error || 0} errors.${mine.marked ? ` Marked ${mine.marked} in the list below.` : ''}</p>
      ${f.length ? `<div class="reslist" id="ulive-res">${f.map(r => `<div class="res st-${isNoisy(r) ? 'unsure' : 'found'}" data-live="${esc(r.site)}"><div class="tx"><div class="nm">${esc(r.site)}${isNoisy(r) ? ' <span class="tiny muted">often a false positive</span>' : ''}</div><div class="u mono">${esc(host(r.url))}</div></div>${isHttp(r.url) ? ext(r.url, 'Open', 'btn sm') : ''}</div>`).join('')}</div>
      <div class="row"><button class="btn sm" type="button" id="ulive-save">${ICONS.save} Save live results</button></div>` : '<p class="small muted">No accounts reported.</p>'}`;
  }
  return `<div class="card live" id="ulive-card"><div class="row nowrap"><div class="spacer"><b>Live check</b> <span class="tiny muted">Sherlock on your server</span></div>
      <button class="btn sm primary" type="button" id="ulive"${running ? ' disabled' : ''}>${running ? 'Checking\u2026' : mine ? 'Run again' : 'Run live check'}</button></div>
    <p class="tiny muted">${liveReady() ? 'Sends this username to your live check server only.' : 'Needs your server\u2019s API key (Settings).'} ${LIVE_WARN}</p>
    ${liveStatusHTML(mine, 'u')}${out}</div>`;
}
function liveEmailCard(v) {
  const job = state.liveJobs.email, mine = job && job.query === v ? job : null;
  const running = mine && !['done', 'error'].includes(mine.status);
  let out = '';
  if (mine && mine.status === 'done') {
    const f = liveFound(mine), c = mine.progress.counts || {};
    const hint = r => [r.emailrecovery && `recovery: ${r.emailrecovery}`, r.phoneNumber && `phone: ${r.phoneNumber}`].filter(Boolean).join(' · ');
    out = `<p class="small" id="elive-sum">Used on <b>${f.length}</b> of ${mine.results.length} sites checked in ${mine.duration ?? '?'} s. ${c.rate_limited || 0} were blocked or rate-limited, so “not used” is not certain.</p>
      ${f.length ? `<div class="reslist" id="elive-res">${f.map(r => `<div class="res st-found" data-live="${esc(r.site)}"><div class="tx"><div class="nm">${esc(r.site)}</div>${hint(r) ? `<div class="u mono">${esc(hint(r))}</div>` : ''}</div>${/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(r.site) ? ext('https://' + r.site, 'Open', 'btn sm') : ''}</div>`).join('')}</div>
      <div class="row"><button class="btn sm" type="button" id="elive-save">${ICONS.save} Save live results</button></div>` : '<p class="small muted">No sites reported this email as used.</p>'}`;
  }
  return `<div class="card live" id="elive-card"><div class="row nowrap"><div class="spacer"><b>Live check</b> <span class="tiny muted">Holehe on your server</span></div>
      <button class="btn sm primary" type="button" id="elive"${running ? ' disabled' : ''}>${running ? 'Checking\u2026' : mine ? 'Run again' : 'Run live check'}</button></div>
    <p class="tiny muted">${liveReady() ? 'Sends this email to your live check server only. Holehe runs without its password-reset modules, so no reset emails are triggered.' : 'Needs your server\u2019s API key (Settings).'} ${LIVE_WARN}</p>
    ${liveStatusHTML(mine, 'e')}${out}</div>`;
}
function saveLiveResults(job) {
  const f = liveFound(job);
  if (job.kind === 'username') {
    const c = job.progress.counts || {};
    return saveToCase({ text: `Live Sherlock check for “${job.query}”: ${f.length} possible accounts (${job.progress.total} sites, ${c.blocked || 0} blocked, ${c.error || 0} errors). Unverified: may include false positives.\n` + f.map(r => `• ${r.site}: ${r.url}${isNoisy(r) ? ' (often a false positive)' : ''}`).join('\n'),
      url: f[0] ? f[0].url : '', source: 'Live check (Sherlock)', tags: ['username', 'live', job.query.toLowerCase()] });
  }
  const c = job.progress.counts || {};
  return saveToCase({ text: `Live Holehe check for ${job.query}: used on ${f.length} sites (${job.results.length} checked, ${c.rate_limited || 0} blocked or rate-limited). Unverified.\n` + f.map(r => `• ${r.site}${r.emailrecovery ? ` (recovery ${r.emailrecovery})` : ''}${r.phoneNumber ? ` (phone ${r.phoneNumber})` : ''}`).join('\n'),
    url: '', source: 'Live check (Holehe)', tags: ['email', 'live'] });
}
function liveSettingsHTML() {
  const L = state.live;
  return `<h2>Live check server</h2>
    <div class="card" id="live-settings">
      <p class="small muted">Optional. Your own server runs Sherlock (usernames) and Holehe (emails) for the “Run live check” buttons. The key is stored only in this browser on this phone and is not included in backups.</p>
      <form class="form" id="liveform" novalidate autocomplete="off">
        <label class="lbl" for="live-url">Server URL</label><input type="url" id="live-url" value="${esc(L.url)}" placeholder="${esc(store.LIVE_DEFAULT_URL)}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url">
        <label class="lbl" for="live-key">API key</label><input type="password" id="live-key" value="" placeholder="${L.key ? '•••••••• saved (type to replace)' : 'Paste the key from your server'}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <p class="tiny muted" id="live-keystate">${L.key ? 'A key is saved on this phone.' : 'No key saved: live checks are off.'}</p>
        <div class="row"><button class="btn primary" type="submit" id="live-save">Save</button><button class="btn" type="button" id="live-test">Test connection</button>${L.key ? '<button class="btn ghost danger" type="button" id="live-forget">Remove key</button>' : ''}</div>
        <div class="small" id="live-result" role="status"></div>
      </form>
    </div>`;
}
function wireLiveSettings() {
  const saveForm = async () => {
    const url = $('#live-url').value.trim() || store.LIVE_DEFAULT_URL, key = $('#live-key').value.trim();
    if (!liveOrigin(url)) { $('#live-result').textContent = 'The server URL must start with https://'; return false; }
    if (key && !/^[\x20-\x7E]{16,200}$/.test(key)) { $('#live-result').textContent = 'That key doesn\u2019t look right. Use 16 or more regular keyboard characters (letters, numbers, symbols and spaces are fine).'; return false; }
    state.live = await store.saveLive(key ? { url: liveOrigin(url), key } : { url: liveOrigin(url) });
    return true;
  };
  $('#liveform').onsubmit = async e => { e.preventDefault(); if (await saveForm()) { renderSettings(); toast('Live check server saved \u2713'); } };
  $('#live-test').onclick = async () => {
    const out = $('#live-result');
    if (!await saveForm()) return;
    $('#live-key').value = ''; $('#live-keystate').textContent = state.live.key ? 'A key is saved on this phone.' : 'No key saved: live checks are off.';
    out.className = 'small'; out.textContent = 'Testing\u2026';
    try {
      const h = await liveFetch('/api/health', { auth: false });
      if (!h || !h.ok) throw new Error('The server answered, but not like a Third Eye server.');
      if (!state.live.key) { out.textContent = `Server reachable (v${h.version || '?'}), but no API key is saved.`; return; }
      try { await liveFetch('/api/jobs/connection-test-0000'); } catch (e) { if (e.status !== 404) throw e; }
      out.className = 'small ok'; out.textContent = `Connected \u2713 Server v${h.version || '?'}, key accepted. ${h.running || 0} running, ${h.queued || 0} queued.`;
    } catch (e) { out.className = 'small err'; out.textContent = e.message; }
  };
  if ($('#live-forget')) $('#live-forget').onclick = async () => {
    if (!await confirmDialog('Remove API key?', 'Live checks will be off on this phone until you add a key again.', 'Remove', true)) return;
    state.live = await store.saveLive({ key: '' }); renderSettings(); toast('Key removed');
  };
}

// ---------- SETTINGS ----------
function renderSettings() {
  const s = state.settings, th = s.theme || 'dark';
  const U = state.data.usernames.sites.length;
  view.innerHTML = `<h1>Settings</h1>
    <h2>Theme</h2><div class="seg" role="radiogroup" aria-label="Theme">${[['dark', '🌌 Eye (dark)'], ['light', 'Light'], ['system', 'System']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${th === v}" class="${th === v ? 'on' : ''}" data-theme-set="${v}">${l}</button>`).join('')}</div>
    <h2>Backup</h2>
    <div class="card">
      ${backupDue() ? '<div class="banner"><span>🛟</span><div class="spacer">Backup recommended: your data lives only on this phone.</div></div>' : ''}
      <div class="kv"><span class="muted">Last backup</span><span id="lastbk">${esc(lastBackupText())}</span></div>
      <p class="small muted">Export saves a JSON file with your cases, findings, custom links, favorites, pins, broker statuses and opt-out details. Keep it somewhere private.</p>
      <div class="row"><button class="btn primary" type="button" id="export">Export JSON</button><button class="btn" type="button" id="import">Import JSON</button></div>
      <input type="file" id="importfile" accept="application/json,.json" hidden>
    </div>
    ${liveSettingsHTML()}
    <h2>Privacy</h2>
    <div class="card small">No accounts, analytics, trackers, external scripts or fonts. Everything is stored in this browser (IndexedDB) on this phone. The only network requests are the links you tap, which open in a new tab, and live checks you start yourself, which go only to your own live check server. Third Eye never contacts data brokers.</div>
    <h2>About</h2>
    <div class="card small">
      <div class="kv"><span class="muted">Version</span><span id="version">${VERSION}</span></div>
      <div class="kv"><span class="muted">Built-in tools</span><span id="n-tools">${state.data.tools.length}</span></div>
      <div class="kv"><span class="muted">Username sites</span><span id="n-sites">${U}</span></div>
      <div class="kv"><span class="muted">Data brokers</span><span id="n-brokers">${state.data.brokers.length}</span></div>
      <div class="kv"><span class="muted">My links</span><span>${state.links.length}</span></div>
      <div class="kv"><span class="muted">Cases / findings</span><span>${state.cases.length} / ${state.findings.length}</span></div>
      <p class="tiny muted">Use only for lawful purposes: auditing your own exposure, protecting family, or authorized research.</p>
    </div>
    <div class="endmark" id="end"></div>`;
  $$('[data-theme-set]').forEach(b => b.onclick = async () => { state.settings = await store.saveSettings({ theme: b.dataset.themeSet }); applyTheme(state.settings.theme); renderSettings(); });
  wireLiveSettings();
  $('#export').onclick = doExport;
  $('#import').onclick = () => $('#importfile').click();
  $('#importfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); };
}
async function doExport() {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `third-eye-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  state.settings = await store.saveSettings({ lastBackup: new Date().toISOString() });
  toast('Backup downloaded ✓'); render();
}
async function doImport(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return alertDialog('Can’t read that file', 'It isn’t valid JSON.'); }
  if (!store.isBackup(data)) return alertDialog('Not a Third Eye backup', 'Choose a file exported from Third Eye’s Settings.');
  const mode = await choiceDialog('Import backup', `${data.cases.length} cases, ${data.findings.length} findings, ${data.links.length} links, ${data.brokers.length} broker statuses.`,
    [{ v: 'merge', label: 'Merge with this phone', primary: true }, { v: 'replace', label: 'Replace everything', danger: true }]);
  if (!mode) return;
  if (mode === 'replace' && !await confirmDialog('Replace all data?', 'Everything currently in Third Eye on this phone will be deleted first.', 'Replace', true)) return;
  try { await store.importAll(data, mode); } catch (e) { return alertDialog('Import failed', String(e.message || e)); }
  await load(); applyTheme(state.settings.theme); render();
  toast(`Imported ${data.cases.length} cases, ${data.findings.length} findings ✓`);
}

// ---------- dialogs & sheets ----------
const mroot = $('#modal-root');
function modal(html, cls = 'dialog') {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'overlay center';
    ov.innerHTML = `<div class="${cls}" role="dialog" aria-modal="true">${html}</div>`;
    mroot.appendChild(ov);
    const done = v => { ov.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', key);
    ov.onclick = e => { if (e.target === ov) done(null); const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '__cancel' ? null : b.dataset.v); };
    ov.done = done;
    const f = ov.querySelector('input,[data-v]'); if (f) setTimeout(() => f.focus(), 30);
    modal.last = ov;
  });
}
const choiceDialog = (title, msg, opts) => modal(`<h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}<div class="stack">${opts.map(o => `<button class="btn block${o.primary ? ' primary' : ''}${o.danger ? ' danger' : ''}" type="button" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}<button class="btn block ghost" type="button" data-v="__cancel">Cancel</button></div>`);
const confirmDialog = async (title, msg, ok = 'OK', danger = false) => (await modal(`<h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="row"><span class="spacer"></span><button class="btn ghost" type="button" data-v="__cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" id="dlg-ok" data-v="ok">${esc(ok)}</button></div>`)) === 'ok';
const alertDialog = (title, msg) => modal(`<h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="row"><span class="spacer"></span><button class="btn primary" type="button" data-v="ok">OK</button></div>`);
function promptDialog(title, value = '', ok = 'OK', placeholder = '') {
  const p = modal(`<h3>${esc(title)}</h3><form id="dlg-form" class="form"><input type="text" id="dlg-in" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></form><div class="row"><span class="spacer"></span><button class="btn ghost" type="button" data-v="__cancel">Cancel</button><button class="btn primary" type="button" id="dlg-ok">${esc(ok)}</button></div>`);
  const ov = modal.last, submit = () => ov.done(ov.querySelector('#dlg-in').value.trim() || null);
  ov.querySelector('#dlg-ok').onclick = submit;
  ov.querySelector('#dlg-form').onsubmit = e => { e.preventDefault(); submit(); };
  return p;
}
let sheetEl = null;
function openSheet(html) {
  closeSheet(true);
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${html}</div>`;
  ov.onclick = e => { if (e.target === ov || e.target.closest('[data-close]')) closeSheet(); };
  mroot.appendChild(ov); sheetEl = ov;
  history.pushState({ sheet: true }, '');
  return ov;
}
function closeSheet(silent = false) {
  if (!sheetEl) return Promise.resolve();
  sheetEl.remove(); sheetEl = null;
  if (silent || !(history.state && history.state.sheet)) return Promise.resolve();
  return new Promise(res => { closeSheet.skip = res; history.back(); setTimeout(() => { if (closeSheet.skip === res) { closeSheet.skip = null; res(); } }, 600); });
}
addEventListener('popstate', () => { if (closeSheet.skip) { const r = closeSheet.skip; closeSheet.skip = null; r(); return; } if (sheetEl) { sheetEl.remove(); sheetEl = null; } });
addEventListener('keydown', e => { if (e.key === 'Escape' && sheetEl && !mroot.querySelector('.center')) closeSheet(); });

// ---------- router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  return { a: a || 'tools', b: b ? decodeURIComponent(b) : '' };
}
function render() {
  const { a, b } = route();
  const nav = a === 'case' ? 'cases' : a;
  $$('.bottomnav a').forEach(x => { const on = x.dataset.nav === nav; x.classList.toggle('active', on); on ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'); });
  const titles = { tools: 'Tools', search: 'Search', cases: 'Cases', case: 'Case', removal: 'Removal', settings: 'Settings' };
  document.title = 'Third Eye · ' + (titles[a] || 'Tools');
  if (a === 'search') renderSearch(b);
  else if (a === 'cases') renderCases();
  else if (a === 'case') renderCase(b);
  else if (a === 'removal') renderRemoval();
  else if (a === 'settings') renderSettings();
  else renderTools();
}
let lastRoute = '';
addEventListener('hashchange', () => {
  if (location.hash === '#/add') { history.replaceState(null, '', lastRoute || '#/tools'); render(); openFinding(); return; }
  if (location.hash !== lastRoute) { lastRoute = location.hash; scrollTo(0, 0); }
  render();
});
$('#fab').onclick = () => { const r = route(); openFinding(null, r.a === 'case' && state.cases.some(c => c.id === r.b) ? r.b : null); };
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(state.settings.theme));

(async function start() {
  try { await loadStatic(); } catch (e) { view.innerHTML = `<div class="empty"><span class="big">⚠️</span>Couldn’t load toolkit data (${esc(e.message)}). Reconnect once so it can be saved for offline use.</div>`; return; }
  await load(); applyTheme(state.settings.theme);
  if (location.hash === '#/add') { history.replaceState(null, '', '#/cases'); render(); openFinding(); }
  else { if (!location.hash) history.replaceState(null, '', '#/tools'); render(); }
  lastRoute = location.hash;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
