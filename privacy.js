// Privacy UI: all tracker/persona/checklist records stay in IndexedDB.
import * as store from './store.js';
const FIRST = ['Alex','Casey','Morgan','Taylor','Jordan','Riley','Jamie','Avery','Robin','Cameron','Sam','Quinn','Drew','Reese','Blake','Skyler'];
const LAST = ['Bennett','Parker','Brooks','Hayes','Reed','Miller','Collins','Rivera','Morgan','Ellis','Walker','Carter','Sullivan','Bell','Foster','Cooper'];
const PLACES = [['Denver','CO'],['Portland','OR'],['Madison','WI'],['Austin','TX'],['Raleigh','NC'],['Boise','ID'],['Spokane','WA'],['Tucson','AZ'],['Burlington','VT'],['Columbus','OH']];
const INTERESTS = ['gardening','pottery','hiking','board games','birdwatching','baking','astronomy','woodworking','painting','cycling','puzzles','photography'];
function random(n) { const a = new Uint32Array(1), max = Math.floor(4294967296/n)*n; do { crypto.getRandomValues(a); } while(a[0]>=max); return a[0]%n; }
const pick = a => a[random(a.length)];
export function generatePersona() {
  const firstName=pick(FIRST), lastName=pick(LAST), [city,state]=pick(PLACES), now=new Date();
  // 19..70 calendar years back, day 1..28: valid dates, always over 18.
  const birthday=`${now.getFullYear()-19-random(52)}-${String(1+random(12)).padStart(2,'0')}-${String(1+random(28)).padStart(2,'0')}`;
  const interests=[]; while(interests.length<3){const x=pick(INTERESTS);if(!interests.includes(x))interests.push(x);}
  return {firstName,lastName,birthday,city,state,interests,username:(firstName+lastName).toLowerCase()+String(1000+random(9000)),aliasId:''};
}
export function createPrivacyUI(h) {
  const {$,$$,view,esc,ext,today,toast,copyText,liveFetch,liveReady,confirmDialog,backupBanner,onChanged} = h;
  let data, section='aliases', query='', filter='all', providers=null, providerMessage='', draft=null;
  let aliases=[],phones=[],personas=[],checks=[];
  const link=(id,label)=>{const l=data.links.find(x=>x.id===id);return ext(l.url,label||l.name,'btn sm');};
  const button=(id,text)=>`<button type="button" class="btn sm" id="${id}">${text}</button>`;
  const field=(id,label,type='text',value='',required=false)=>`<label class="lbl" for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="${type==='email'?254:255}">`;
  const options=(items,value)=>items.map(v=>`<option${v===value?' selected':''}>${esc(v)}</option>`).join('');
  async function reload(){[aliases,phones,personas,checks]=await Promise.all([store.listAliases(),store.listPhones(),store.listPersonas(),store.listChecklist()]);}
  async function changed(){await reload();await onChanged();draw();}
  function error(el,e){el.textContent=e.message||'Could not save. Try again.';}
  function tracker(kind) {
    const isAlias=kind==='aliases', rows=isAlias?aliases:phones, singular=isAlias?'alias':'number', valueKey=isAlias?'address':'number';
    const matches=rows.filter(r=>(filter==='all'||r.status===filter)&&[r[valueKey],r.provider,r.site,r.notes].join(' ').toLowerCase().includes(query.toLowerCase()));
    return `<h2>${isAlias?'Email aliases':'Secondary phone numbers'}</h2><p class="small muted">Record which site received which ${singular}. Marking burned is a local label only: disable forwarding or retire the number with its provider yourself.</p>
      <div class="row">${isAlias?['proton','relay','simplelogin'].map(x=>link(x)).join(''):link('voice')}</div>
      <details class="card" id="tracker-add"><summary><b>+ Add ${singular} manually</b></summary><form class="form" id="tracker-form">
      ${field('tr-value',isAlias?'Alias address':'Secondary number',isAlias?'email':'tel','',true)}
      <label class="lbl" for="tr-provider">Provider</label><select id="tr-provider">${options(isAlias?['Proton','Firefox Relay','SimpleLogin','other']:['Google Voice','other'])}</select>
      ${field('tr-site','Site / service')}${field('tr-date','Date','date',today())}<label class="lbl" for="tr-notes">Notes</label><textarea id="tr-notes" rows="2" maxlength="4000"></textarea><button class="btn primary" type="submit">Save ${singular}</button><p id="tr-message" role="status" class="small"></p></form></details>
      ${isAlias?creation():''}
      <div class="form"><label class="lbl" for="privacy-query">Search ${isAlias?'aliases':'numbers'}</label><input id="privacy-query" type="search" value="${esc(query)}" placeholder="Address, provider, site or notes"><label class="lbl" for="privacy-filter">Status</label><select id="privacy-filter">${options(['all','active','burned'],filter)}</select></div>
      <div id="tracker-list">${matches.map(r=>`<article class="card privacy-record" data-record="${esc(r.id)}"><b>${esc(r[valueKey])}</b><div class="small muted">${esc(r.provider)} · ${esc(r.status)} · ${esc(r.date)}</div><p>${esc(r.site||'No site recorded')}</p>${r.notes?`<p class="small">${esc(r.notes)}</p>`:''}<div class="row"><button class="btn sm" type="button" data-record-copy="${esc(r.id)}">Copy</button><button class="btn sm" type="button" data-record-edit="${esc(r.id)}">Edit</button><button class="btn sm" type="button" data-burn="${esc(r.id)}">${r.status==='burned'?'Mark active':'Mark burned'}</button><button class="btn sm ghost" type="button" data-record-delete="${esc(r.id)}">Delete</button></div></article>`).join('')||'<p class="empty small">No matching records. Add one above.</p>'}</div>`;
  }
  function creation(){return `<details class="card" id="alias-create-card"><summary><b>Create an alias online</b></summary><p class="small muted">Only this action contacts your server and chosen provider. Site and note are sent to that provider. Free plan quotas apply. Never put provider keys in this app.</p>
    <p class="small" id="provider-state" role="status">${esc(providerMessage||'Tap Check providers to see what is configured.')}</p>${button('check-providers','Check providers')}
    <form class="form" id="alias-create-form"><label class="lbl" for="alias-provider">Provider</label><select id="alias-provider"><option value="simplelogin"${providers&&!providers.simplelogin?' disabled':''}>SimpleLogin</option><option value="firefox-relay"${providers&&!providers['firefox-relay']?' disabled':''}>Firefox Relay</option></select>
    ${field('alias-site','Site / service')}${field('alias-note','Note')}<button class="btn primary" id="alias-create" type="submit"${providers&&!Object.values(providers).some(Boolean)?' disabled':''}>Create &amp; save alias</button><p id="alias-result" role="status" class="small"></p></form>
    <p class="tiny muted">Not configured? Add SIMPLELOGIN_API_KEY or FIREFOX_RELAY_API_KEY securely to /etc/thirdeye/thirdeye.env on your server, then restart thirdeye.service. Connect this app in Settings → Live check server first.</p></details>`;}
  function personaCard(r,draftCard=false){return `<article class="card privacy-record" ${draftCard?'id="persona-draft"':`data-persona="${esc(r.id)}"`}><h3>${esc(r.firstName)} ${esc(r.lastName)}</h3><dl class="facts">${[['birthday','Birthday',r.birthday],['city','City / state',r.city+', '+r.state],['interests','Interests',r.interests.join(', ')],['username','Username',r.username]].map(([k,l,v])=>`<dt>${l}</dt><dd>${esc(v)} <button class="btn sm ghost" type="button" data-persona-copy="${esc(draftCard?'draft':r.id)}" data-field="${k}">Copy</button></dd>`).join('')}</dl>
    <button class="btn sm" type="button" data-persona-copy="${esc(draftCard?'draft':r.id)}" data-field="all">Copy all</button>
    <label class="lbl" for="pa-${draftCard?'draft':esc(r.id)}">Link to an alias</label><select id="pa-${draftCard?'draft':esc(r.id)}" data-persona-alias="${esc(draftCard?'draft':r.id)}"><option value="">No linked alias</option>${aliases.map(a=>`<option value="${esc(a.id)}"${r.aliasId===a.id?' selected':''}>${esc(a.address)} · ${esc(a.status)}</option>`).join('')}</select>
    ${r.aliasId&&!aliases.some(a=>a.id===r.aliasId)?'<p class="small muted">Linked alias was deleted or not restored.</p>':''}
    ${draftCard?button('save-persona','Save persona'):`<button class="btn sm ghost" type="button" data-persona-delete="${esc(r.id)}">Delete persona</button>`}</article>`;}
  function device(){return `<h2>Android device checklist</h2><p class="small muted">Manual steps, not automatic changes. Tick each after you review it. Menus vary by phone maker and Android version. Sources checked ${esc(data.checkedAt)}.</p><div id="device-list">${data.checklist.map(x=>`<article class="card"><label class="privacy-check"><input type="checkbox" data-device="${x.id}"${checks.find(c=>c.id===x.id)?.checked?' checked':''}><b>${esc(x.title)}</b></label><p class="small">${esc(x.text)}</p>${ext(x.url,'Google instructions','btn sm')}</article>`).join('')}</div>`;}
  function guide(){return `<h2>Browser protection &amp; noise</h2><div class="card"><h3>Start with blocking</h3><p class="small">Chrome on Android does not run browser extensions. Use Firefox for Android with uBlock Origin to block ads and trackers. It reduces collection; it does not create behavioral noise or make you anonymous.</p><div class="row">${link('firefox')}${link('ublock')}</div></div><div class="card"><h3>Optional: AdNauseam</h3><p class="small">AdNauseam is currently listed for Firefox for Android (Android Firefox 120 or later, checked ${esc(data.checkedAt)}). Install from Mozilla Add-ons in Firefox. It includes ad blocking and can visit hidden ads to add noise to an advertising profile.</p><p class="small">Use it <b>instead of</b> uBlock Origin, not alongside another ad blocker: other blockers can prevent ad collection. Review its settings and permissions first. Ad visiting can use extra data/battery and is not a guarantee of privacy. This app does not install it, click ads, or automate browsing.</p><div class="row">${link('adnauseam')}${link('adnauseam-official')}${link('adnauseam-faq')}</div></div>`;}
  function draw(){
    if(!location.hash.startsWith('#/privacy'))return;
    const due=h.overdue(), removed=h.removed(), total=h.brokerTotal();
    view.innerHTML=`${backupBanner()}<h1>Privacy</h1><p class="muted small">A quieter footprint. Your records stay on this device.</p><a href="#/removal" class="card privacy-summary"><b>${due} overdue broker re-check${due===1?'':'s'}</b><span class="small">${removed}/${total} confirmed removed · Open broker tracker →</span><progress value="${removed}" max="${total}" aria-label="Broker opt-out progress"></progress></a><div class="filters" role="tablist" aria-label="Privacy sections">${[['aliases','Aliases'],['phones','Numbers'],['device','Device'],['browser','Browser'],['personas','Personas']].map(([id,label])=>`<button class="chip${section===id?' on':''}" type="button" role="tab" aria-selected="${section===id}" data-privacy-tab="${id}">${label}</button>`).join('')}</div><section id="privacy-pane">${section==='aliases'||section==='phones'?tracker(section):section==='device'?device():section==='browser'?guide():`<h2>Offline persona generator</h2><p class="card note small">For low-stakes sign-ups you do yourself. Do not use for banking, government, impersonation, or anything requiring real identity. Random details may coincide with a real person. No automated sign-ups.</p>${button('generate-persona','Generate persona')}${draft?personaCard(draft,true):''}<h3>Saved personas (${personas.length})</h3>${personas.map(r=>personaCard(r)).join('')}`}</section><div class="endmark" id="end"></div>`;
    $$('[data-privacy-tab]').forEach(b=>b.onclick=()=>{section=b.dataset.privacyTab;query='';filter='all';draw();});
    if(section==='aliases'||section==='phones')wireTracker();
    $$('[data-device]').forEach(i=>i.onchange=async()=>{try{await store.saveChecklist({id:i.dataset.device,checked:i.checked});await reload();await onChanged();toast('Checklist saved');}catch(e){i.checked=!i.checked;toast('Could not save checklist');}});
    if($('#generate-persona'))$('#generate-persona').onclick=()=>{draft=generatePersona();draw();};
    if($('#save-persona'))$('#save-persona').onclick=async()=>{try{await store.savePersona(draft);draft=null;await changed();toast('Persona saved');}catch(e){toast('Could not save persona');}};
    $$('[data-persona-alias]').forEach(i=>i.onchange=async()=>{const id=i.dataset.personaAlias;if(id==='draft')draft.aliasId=i.value;else{try{await store.savePersona({...personas.find(p=>p.id===id),aliasId:i.value});await reload();toast('Alias linked');}catch(e){toast('Could not link alias');}}});
    $$('[data-persona-copy]').forEach(b=>b.onclick=()=>{const r=b.dataset.personaCopy==='draft'?draft:personas.find(x=>x.id===b.dataset.personaCopy),k=b.dataset.field;const text=k==='all'?`${r.firstName} ${r.lastName}\n${r.birthday}\n${r.city}, ${r.state}\n${r.interests.join(', ')}\n${r.username}`:k==='interests'?r.interests.join(', '):k==='city'?r.city+', '+r.state:r[k];copyText(text,'Persona detail copied');});
    $$('[data-persona-delete]').forEach(b=>b.onclick=async()=>{if(await confirmDialog('Delete persona?','Remove this saved persona from this device?','Delete',true)){await store.deletePersona(b.dataset.personaDelete);await changed();}});
  }
  function wireTracker(){
    const isAlias=section==='aliases',rows=isAlias?aliases:phones,key=isAlias?'address':'number',save=isAlias?store.saveAlias:store.savePhone;
    let editId=null;
    $('#tracker-form').onsubmit=async e=>{e.preventDefault();try{await save({id:editId,[key]:$('#tr-value').value,provider:$('#tr-provider').value,site:$('#tr-site').value,date:$('#tr-date').value,notes:$('#tr-notes').value,status:editId?rows.find(x=>x.id===editId).status:'active'});await changed();toast('Record saved');}catch(e){error($('#tr-message'),e);}};
    $('#privacy-query').oninput=e=>{query=e.target.value;const pos=e.target.selectionStart;draw();$('#privacy-query').focus();$('#privacy-query').setSelectionRange(pos,pos);};
    $('#privacy-filter').onchange=e=>{filter=e.target.value;draw();};
    $$('[data-record-copy]').forEach(b=>b.onclick=()=>copyText(rows.find(r=>r.id===b.dataset.recordCopy)[key],'Copied'));
    $$('[data-record-edit]').forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.id===b.dataset.recordEdit);editId=r.id;$('#tracker-add').open=true;for(const [id,k]of [['tr-value',key],['tr-provider','provider'],['tr-site','site'],['tr-date','date'],['tr-notes','notes']])$('#'+id).value=r[k];$('#tr-value').focus();});
    $$('[data-burn]').forEach(b=>b.onclick=async()=>{const r=rows.find(x=>x.id===b.dataset.burn);try{await save({...r,status:r.status==='burned'?'active':'burned'});await changed();toast('Local status updated');}catch(e){toast('Could not update record');}});
    $$('[data-record-delete]').forEach(b=>b.onclick=async()=>{if(await confirmDialog('Delete record?','Only the local record is removed. This does not disable the alias or number.','Delete',true)){await(isAlias?store.deleteAlias:store.deletePhone)(b.dataset.recordDelete);await changed();}});
    if(!isAlias)return;
    $('#check-providers').onclick=async()=>{
      if(!liveReady()){$('#provider-state').textContent='Connect this app in Settings → Live check server first. Provider keys stay on the server.';return;}
      const b=$('#check-providers');b.disabled=true;
      try{const r=await liveFetch('/api/aliases/providers');providers=r.providers;providerMessage=Object.values(providers).some(Boolean)?'Configured: '+Object.entries(providers).filter(([,v])=>v).map(([k])=>k).join(', '):'No provider configured. Add your key on the server (instructions below).';draw();$('#alias-create-card').open=true;const first=Object.keys(providers).find(k=>providers[k]);if(first)$('#alias-provider').value=first;}
      catch(e){if($('#provider-state'))error($('#provider-state'),e);}finally{if($('#check-providers'))$('#check-providers').disabled=false;}
    };
    $('#alias-create-form').onsubmit=async e=>{
      e.preventDefault();const result=$('#alias-result');if(!liveReady()){result.textContent='Connect this app in Settings → Live check server first.';return;}
      const provider=$('#alias-provider').value,site=$('#alias-site').value,note=$('#alias-note').value,b=$('#alias-create');
      b.disabled=true;
      if(!await confirmDialog('Create alias online?',`Create one alias with ${provider==='simplelogin'?'SimpleLogin':'Firefox Relay'}? Your site / service and note will be sent to that provider. This may use a free-plan alias slot.`,'Create alias')){b.disabled=false;return;}
      b.disabled=true;result.textContent='Creating…';
      let r;
      try{r=await liveFetch('/api/aliases/create',{method:'POST',body:{provider,site,note},timeout:25000});}
      catch(e){error(result,e);b.disabled=false;return;}
      try{await store.saveAlias({address:r.address,provider:r.provider,site,date:today(),notes:note,status:'active'});await changed();$('#alias-create-card').open=true;$('#alias-result').textContent='Alias created and saved to your tracker.';toast('Alias created & saved');}
      catch(e){ // If local storage fails, retain the created address rather than inviting a duplicate creation.
        result.textContent=`Created ${r.address}, but saving failed. Copy it now and add manually. Do not create another alias.`;
        const copy=document.createElement('button');copy.type='button';copy.className='btn';copy.textContent='Copy created alias';copy.onclick=()=>copyText(r.address,'Alias copied');result.append(copy);b.disabled=true;
      }
    };
  }
  return {async render(){if(!data){const r=await fetch('./data/privacy.json');if(!r.ok)throw new Error('Privacy data could not load');data=await r.json();}await reload();draw();}};
}
