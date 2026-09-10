const printAt=new Date('2026-09-10T15:00:00-05:00');
const CFG=window.EARNINGS_CONFIG||{};
const BASE=CFG.supabaseUrl?CFG.supabaseUrl.replace(/\/$/,'')+'/rest/v1':null;
const CALLS_API=BASE?BASE+'/calls':null;
const EVENTS_API=BASE?BASE+'/earnings_events':null;
const REACTIONS_API=BASE?BASE+'/reaction_snapshots':null;
const APIKEY=CFG.supabaseKey||null;

let activeCall=null;
const crowdState={orcl:{total:0,beat:0,miss:0},adbe:{total:0,beat:0,miss:0}};
const RESULTS={};
const REACTIONS={};
const EVENT_STATE={};

function remaining(){return printAt-new Date()}
function isLocked(){return remaining()<=0}
function formatRemaining(d){if(d<=0)return'CALLS LOCKED';const h=Math.floor(d/36e5),m=Math.floor((d%36e5)/6e4),s=Math.floor((d%6e4)/1e3);return`${String(h).padStart(2,'0')}H ${String(m).padStart(2,'0')}M ${String(s).padStart(2,'0')}S`}
function headers(extra={}){const h={'apikey':APIKEY,'Content-Type':'application/json'};if(APIKEY&&APIKEY.startsWith('eyJ'))h.Authorization='Bearer '+APIKEY;return Object.assign(h,extra)}
function money(v,digits=2){if(v==null)return'—';return'$'+Number(v).toFixed(digits).replace(/\.00$/,'')}
function revenue(v){if(v==null)return'—';return money(v,2)+'B'}
function fmtMove(v){const n=Number(v);return`${n>0?'+':''}${n.toFixed(1)}%`}

function tick(){
  const d=remaining(),locked=isLocked();
  const el=document.getElementById('countdown'),mel=document.getElementById('modal-countdown'),status=document.getElementById('market-status'),headline=document.getElementById('market-headline'),label=document.getElementById('window-label'),ledger=document.getElementById('ledger-002');
  if(el)el.textContent=formatRemaining(d);
  if(mel)mel.textContent=locked?'CALLS LOCKED':'PRINT → '+formatRemaining(d);
  if(status)status.textContent=locked?'STATUS: CALLS LOCKED':'STATUS: OPEN';
  if(headline)headline.textContent=locked?'THE PRINT.':'NEXT PRINT.';
  if(label)label.textContent=locked?'FINAL CONSENSUS':'PRINT WINDOW';
  if(ledger)ledger.textContent=locked?'PRINTED':'OPEN';
  document.querySelectorAll('.vote').forEach(b=>b.disabled=locked);
  document.querySelectorAll('.community .eyebrow').forEach(e=>{if(locked)e.textContent='FINAL CROWD'});
  if(locked){['orcl','adbe'].forEach(m=>{const pre=document.getElementById(m+'-precall'),panel=document.getElementById(m+'-print');if(pre)pre.hidden=true;if(panel)panel.hidden=false;renderResult(m);renderReaction(m)})}
}
tick();setInterval(tick,1000);

function getVisitor(){let id=localStorage.getItem('earnings_visitor_id');if(!id){id=(crypto&&crypto.randomUUID?crypto.randomUUID():'v-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem('earnings_visitor_id',id)}return id}
function getCall(m){return localStorage.getItem('earnings_vote_'+m)}
function setLocalCall(m,v){if(isLocked()||getCall(m))return false;localStorage.setItem('earnings_vote_'+m,v);return true}

async function submitCall(m,v){if(!CALLS_API||!APIKEY)return false;try{const r=await fetch(CALLS_API,{method:'POST',headers:headers({'Prefer':'return=minimal'}),body:JSON.stringify({market:2,ticker:m.toUpperCase(),call:v,visitor_id:getVisitor()})});if(r.ok||r.status===409)return true;console.error('call submit failed',r.status,await r.text());return false}catch(e){console.error('call submit error',e);return false}}

async function fetchCrowd(m){
  if(isLocked()&&EVENT_STATE[m]){renderCrowdSnapshot(m,EVENT_STATE[m]);return}
  if(!CALLS_API||!APIKEY){renderCrowd(m,[],'OFFLINE');return}
  try{const url=CALLS_API+'?select=call&market=eq.2&ticker=eq.'+encodeURIComponent(m.toUpperCase());const r=await fetch(url,{headers:headers()});if(!r.ok)throw new Error('HTTP '+r.status);renderCrowd(m,await r.json())}catch(e){console.error('crowd fetch error',e);renderCrowd(m,[],'UNAVAILABLE')}
}

function renderCrowd(m,rows,status){const total=rows.length,beats=rows.filter(x=>x.call==='BEAT').length,bp=total?Math.round(beats/total*100):0,mp=total?100-bp:0;crowdState[m]={total,beat:bp,miss:mp};paintCrowd(m,status)}
function renderCrowdSnapshot(m,e){crowdState[m]={total:Number(e.crowd_calls||0),beat:Number(e.crowd_beat_pct||0),miss:Number(e.crowd_miss_pct||0)};paintCrowd(m)}
function paintCrowd(m,status){const s=crowdState[m],b=document.getElementById(m+'-beat-pct'),mi=document.getElementById(m+'-miss-pct'),bar=document.getElementById(m+'-beat-bar'),count=document.getElementById(m+'-count');if(b)b.textContent=s.total?s.beat+'%':'—';if(mi)mi.textContent=s.total?s.miss+'%':'—';if(bar)bar.style.width=(s.total?s.beat:0)+'%';if(count)count.textContent=status?status:(s.total===0?'NO CALLS YET':s.total+' '+(s.total===1?'CALL':'CALLS'));if(activeCall&&activeCall.m===m)renderModalCrowd(m);if(isLocked())renderResult(m)}
function renderModalCrowd(m){const s=crowdState[m],main=document.getElementById('modal-crowd'),count=document.getElementById('modal-crowd-count');if(!s||!s.total){main.textContent='NO CONSENSUS YET';count.textContent='0 CALLS';return}main.textContent=s.beat+'% BEAT / '+s.miss+'% MISS';count.textContent=s.total+' '+(s.total===1?'CALL':'CALLS')}

function load(m){const v=getCall(m);document.querySelectorAll(`[data-market="${m}"]`).forEach(b=>b.classList.toggle('activeVote',b.dataset.vote===v));const out=document.getElementById(m+'-call'),share=document.getElementById(m+'-share');if(out)out.textContent=v?'YOUR CALL: '+v+' · LOCKED':'YOUR CALL: NOT CAST';if(share)share.hidden=!v}

function renderResult(m){const r=RESULTS[m],s=crowdState[m],user=getCall(m),verdict=document.getElementById(m+'-verdict'),crowd=document.getElementById(m+'-crowd-verdict'),uv=document.getElementById(m+'-user-verdict');if(!verdict)return;if(!r){verdict.textContent='AWAITING RESULT';const eps=document.getElementById(m+'-eps'),rev=document.getElementById(m+'-revenue');if(eps)eps.textContent='—';if(rev)rev.textContent='—';if(crowd)crowd.textContent=s.total?`FINAL CROWD: ${s.beat}% BEAT / ${s.miss}% MISS · ${s.total} CALLS`:'FINAL CROWD: NO CALLS';if(uv)uv.textContent=user?'YOUR CALL: '+user+' · RESULT PENDING':'YOUR CALL: NOT CAST';return}verdict.textContent=r.verdict;document.getElementById(m+'-eps').textContent=r.eps;document.getElementById(m+'-revenue').textContent=r.revenue;if(crowd)crowd.textContent=s.total?`THE CROWD ${((r.verdict==='BEAT'&&s.beat>=50)||(r.verdict==='MISS'&&s.miss>50))?'WAS RIGHT':'MISSED'} · ${s.beat}% BEAT / ${s.miss}% MISS`:'NO CROWD CALL';if(uv)uv.textContent=user?`YOUR CALL: ${user} ${user===r.verdict?'✓':'✕'}`:'YOUR CALL: NOT CAST'}

function renderReaction(m){const r=REACTIONS[m],panel=document.getElementById(m+'-reaction');if(!panel)return;if(!r){panel.hidden=true;return}panel.hidden=false;const move=document.getElementById(m+'-reaction-move'),real=document.getElementById(m+'-realized'),tag=document.getElementById(m+'-reaction-tag'),time=document.getElementById(m+'-reaction-time');if(move)move.textContent=fmtMove(r.move);if(real)real.textContent=fmtMove(r.move);if(tag)tag.textContent=r.label||'REACTION RECORDED';if(time)time.textContent=`${r.checkpoint} · ${new Date(r.observedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`}

async function fetchEventState(){
  if(!EVENTS_API||!REACTIONS_API||!APIKEY)return false;
  try{
    const er=await fetch(EVENTS_API+'?select=*&market=eq.2',{headers:headers()});
    if(!er.ok)throw new Error('events HTTP '+er.status);
    const events=await er.json();
    if(!events.length)return false;
    for(const e of events){
      const m=String(e.ticker||'').toLowerCase();if(!m)continue;
      EVENT_STATE[m]=e;
      RESULTS[m]=e.verdict?{verdict:e.verdict,eps:money(e.eps_actual,2),revenue:revenue(e.revenue_actual)}:null;
      renderCrowdSnapshot(m,e);
      const rr=await fetch(REACTIONS_API+'?select=*&event_id=eq.'+encodeURIComponent(e.id)+'&order=observed_at.desc&limit=1',{headers:headers()});
      if(rr.ok){const snaps=await rr.json();if(snaps.length){const s=snaps[0];REACTIONS[m]={move:Number(s.realized_move_pct),implied:Number(s.implied_move_pct??e.implied_move_pct??0),label:s.classification||'REACTION RECORDED',checkpoint:s.checkpoint||'SNAPSHOT',observedAt:s.observed_at}}}
      renderResult(m);renderReaction(m);
    }
    return true;
  }catch(e){console.error('event engine unavailable',e);return false}
}

function openCall(m,label,theme,vote){activeCall={m,label,theme,vote};document.getElementById('modal-ticker').textContent=label;document.getElementById('modal-vote').textContent=vote;document.getElementById('modal-theme').textContent=theme;document.getElementById('modal-lock').textContent=isLocked()?'CALLS CLOSED':'YOUR CALL IS LOCKED';document.getElementById('modal-id').textContent='E//CALL 002-'+label+'-'+vote;renderModalCrowd(m);document.getElementById('call-modal').hidden=false;document.body.style.overflow='hidden';tick()}
function closeCall(){document.getElementById('call-modal').hidden=true;document.body.style.overflow=''}
async function ensureSynced(m){const v=getCall(m);if(v&&!isLocked())await submitCall(m,v)}
function callText(){if(!activeCall)return'';const s=crowdState[activeCall.m];const crowd=s&&s.total?`The crowd: ${s.beat}% BEAT / ${s.miss}% MISS (${s.total} calls).`:'The crowd is forming.';return`THE CALL.\n\n$${activeCall.label} — ${activeCall.vote}\nMarket 002 · ${activeCall.theme}\n\n${crowd}\n\nThe print decides.\n\n@earningsdot\nearningsdot.com`}

document.querySelectorAll('.vote').forEach(b=>b.onclick=async()=>{const m=b.dataset.market,label=b.dataset.label,theme=b.dataset.theme,v=b.dataset.vote;if(!getCall(m)){setLocalCall(m,v);load(m);await submitCall(m,v);await fetchCrowd(m)}const finalVote=getCall(m);if(finalVote)openCall(m,label,theme,finalVote)});
document.querySelectorAll('.shareBtn').forEach(b=>b.onclick=()=>{const vote=getCall(b.dataset.market);const src=document.querySelector(`[data-market="${b.dataset.market}"][data-vote="${vote}"]`);if(src)openCall(b.dataset.market,src.dataset.label,src.dataset.theme,vote)});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeCall);
document.getElementById('share-x').onclick=()=>{const text=callText();if(text)window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(text),'_blank','noopener,noreferrer')};
document.getElementById('copy-call').onclick=async e=>{const text=callText();if(!text)return;try{await navigator.clipboard.writeText(text);e.target.textContent='COPIED';setTimeout(()=>e.target.textContent='COPY CALL',1300)}catch{e.target.textContent='SELECT + COPY'}};

load('orcl');load('adbe');
(async()=>{await fetchEventState();if(!isLocked()){await Promise.all([ensureSynced('orcl'),ensureSynced('adbe')]);await Promise.all([fetchCrowd('orcl'),fetchCrowd('adbe')])}})();
setInterval(async()=>{await fetchEventState();if(!isLocked()){fetchCrowd('orcl');fetchCrowd('adbe')}},30000);

const ca='3BP7SfNHCjJU1NBeCJPUFUKNpbQD7L5xwHmE39iJpump';
document.getElementById('copy').onclick=async e=>{try{await navigator.clipboard.writeText(ca);e.target.textContent='COPIED';setTimeout(()=>e.target.textContent='COPY CA',1300)}catch{e.target.textContent='SELECT CA'}};