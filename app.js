const $ = id => document.getElementById(id);
const MODELS = [
  {id:'meteoswiss_icon_ch1',name:'ICON-CH1 · 1 km',color:'#007e87'},
  {id:'meteofrance_arome_france',name:'AROME · 2,5 km',color:'#bc640a'},
  {id:'icon_seamless',name:'ICON',color:'#665bb7'},
  {id:'gfs_seamless',name:'GFS',color:'#287ec0'},
  {id:'ecmwf_ifs025',name:'IFS · 0,25°',color:'#bd4f71'}
];
let spots=[],live={stations:{}},forecasts={spots:{}},spot,unit='kn',hours=168,index=0;
let selected=new Set(MODELS.map(m=>m.id)),loadVersion=0;
const TZ='Europe/Zurich';
const fmt=(time,options={})=>new Intl.DateTimeFormat('fr-CH',{timeZone:TZ,...options}).format(new Date(time*1000));
const n=v=>Number.isFinite(v)?(v*(unit==='kmh'?1.852:1)).toFixed(1):'—';
const unitLabel=()=>unit==='kn'?'nd':'km/h';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const directions=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
const dir=v=>Number.isFinite(v)?directions[Math.round(v/22.5)%16]:'—';
const age=t=>Math.max(0,Math.round((Date.now()/1000-t)/60));
function stored(key,fallback){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,value);}catch{}}
function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;return (6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2))).toFixed(1);}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
function status(o,error){if(!o)return ['off','Indisponible'];if(error||age(o.time)>30)return ['stale','Ancienne'];return ['','Récente'];}
function renderLive(){
  $('live-cards').innerHTML=spot.stations.map(id=>{
    const s=live.stations[id];if(!s)return `<div class="live-card"><p class="empty">Station indisponible.</p></div>`;
    const o=s.latest,[cls,label]=status(o,s.error);
    return `<article class="live-card"><div class="card-header"><span>${esc(s.name)}</span><span class="status ${cls}">${label}</span></div><div class="mini-compass">N<i style="transform:rotate(${Number.isFinite(o?.direction)?o.direction:0}deg)">↑</i></div><div class="measure">${n(o?.speed)} <small>${unitLabel()}</small></div><div class="stats"><span>Rafale<b>${n(o?.gust)} ${unitLabel()}</b></span><span>Vient du<b>${dir(o?.direction)} ${Number.isFinite(o?.direction)?Math.round(o.direction)+'°':''}</b></span></div><p class="muted">${o?`Relevé ${fmt(o.time,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · il y a ${age(o.time)} min`:'Aucun relevé reçu'}<br>${esc(o?.averaging||'')}<br>${distance(spot,s)} km du spot${id==='yvbeach'?' environ':''} · ${esc(s.note)}</p><a class="text-link" href="${esc(s.source)}" target="_blank" rel="noopener">Consulter la station</a>${s.error?'<p class="muted error">La dernière collecte a échoué.</p>':''}</article>`;
  }).join('');
}
function stationWidgets(){
  $('station-embeds').innerHTML=spot.stations.map(id=>{
    const s=live.stations[id];if(!s)return '';
    if(s.holfuy)return `<div class="station-widget"><h4>${esc(s.name)} · widget direct</h4><iframe title="Vent en direct ${esc(s.name)}" loading="lazy" src="https://widget.holfuy.com/?station=${s.holfuy}&su=${unit==='kn'?'knots':'kmh'}&t=C&lang=fr&mode=detailed"></iframe><a href="${esc(s.source)}" target="_blank" rel="noopener">Ouvrir la source</a></div>`;
    return `<div class="station-widget"><a href="${esc(s.source)}" target="_blank" rel="noopener">YvBeach : données & graphe original sur 72 h</a></div>`;
  }).join('');
}
function renderCameras(){
  $('cameras').innerHTML=spot.cameras.map((c,i)=>`<article class="camera-card">${c.type==='iframe'?`<iframe title="Webcam ${esc(c.name)}" src="${esc(c.url)}" loading="lazy" allowfullscreen></iframe>`:c.type==='image'?`<img id="cam-${i}" src="${esc(c.url)}&t=${Date.now()}" alt="Vue actuelle ${esc(c.name)}" loading="lazy">`:`<div class="camera-empty"><p>La caméra est disponible sur le site du fournisseur.</p><a href="${esc(c.url)}" target="_blank" rel="noopener">Voir la webcam</a></div>`}<div class="camera-info"><h4>${esc(c.name)}</h4><a class="text-link" href="${esc(c.source||c.url)}" target="_blank" rel="noopener">Ouvrir le lecteur d’origine</a><p>© ${esc(c.credit)} · heure du relevé à vérifier dans la source</p></div></article>`).join('');
  $('cameras').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{const p=document.createElement('div');p.className='camera-empty';p.textContent='Image temporairement indisponible. Ouvre la source ci-dessous.';img.replaceWith(p);},{once:true}));
}
function windguru(){
  $('wg-link').href=`https://www.windguru.cz/${spot.windguru}`;
  $('wg-note').textContent=spot.forecastNote||'';
  const q=new URLSearchParams({s:spot.windguru,m:3,uid:'wg'+spot.windguru,wj:unit==='kn'?'knots':'kmh',tj:'c',odh:0,doh:23,fhours:168,lng:'fr',params:'WINDSPD,GUST,SMER,TMP',wrap:1});
  $('wg-widget').innerHTML=`<iframe title="Prévision Windguru GFS pour ${esc(spot.name)}" src="https://www.windguru.cz/widget-fcst-iframe.php?${q}" loading="lazy"></iframe>`;
}
function chart(target,times,series,{cursor=null,gap=0,start,end}={}){
  if(!times.length||!series.some(s=>s.values.some(Number.isFinite))){$(target).innerHTML='<p class="empty">Pas encore de données à tracer. Les relevés apparaissent au fil des collectes.</p>';return;}
  const w=700,h=255,p={l:40,r:20,t:15,b:38};
  const t0=start??times[0],t1=end??times.at(-1),span=Math.max(1,t1-t0);
  const values=series.flatMap(s=>s.values).filter(Number.isFinite).map(v=>v*(unit==='kmh'?1.852:1));
  const max=Math.max(10,Math.ceil(Math.max(...values)/5)*5),x=t=>p.l+(t-t0)/span*(w-p.l-p.r),y=v=>h-p.b-v/max*(h-p.t-p.b);
  let svg=`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Graphe du vent en ${unitLabel()}">`;
  for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line class="grid" x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${p.l-7}" y="${y(v)+4}" text-anchor="end">${Math.round(v)}</text>`;}
  for(let i=0;i<=6;i++){const t=t0+span*i/6;svg+=`<text x="${x(t)}" y="${h-12}" text-anchor="${i===0?'start':i===6?'end':'middle'}">${fmt(t,{weekday:'short',hour:'2-digit',minute:'2-digit'})}</text>`;}
  series.forEach(s=>{
    let path='',previous=null;
    times.forEach((t,i)=>{const v=s.values[i];if(!Number.isFinite(v)){previous=null;return;}const command=previous===null||(gap&&t-previous>gap)?'M':'L';path+=`${command}${x(t).toFixed(1)},${y(v*(unit==='kmh'?1.852:1)).toFixed(1)} `;previous=t;});
    svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dashed?'stroke-dasharray="5 4"':''}/>`;
    if(times.length===1)svg+=`<circle cx="${x(times[0])}" cy="${y(s.values[0]*(unit==='kmh'?1.852:1))}" r="4" fill="${s.color}"/>`;
  });
  if(cursor!==null)svg+=`<line class="cursor" x1="${x(cursor)}" x2="${x(cursor)}" y1="${p.t}" y2="${h-p.b}"/>`;
  svg+=`<text x="${p.l}" y="12">${unitLabel()}</text></svg>`;
  $(target).innerHTML=`<div class="chart-container">${svg}</div>`;
}
function renderHistory(){
  const s=live.stations[$('history-station').value];const end=Date.now()/1000,start=end-Number($('history-hours').value)*3600;
  const hist=(s?.history||[]).filter(o=>o.time>=start&&o.time<=end);
  chart('live-chart',hist.map(o=>o.time),[{color:'#007e87',values:hist.map(o=>o.speed)},{color:'#bc640a',values:hist.map(o=>o.gust),dashed:true}],{start,end,gap:35*60});
}
function renderForecast(){
  const f=forecasts.spots[spot.id];
  if(!f||f.time.at(-1)<Date.now()/1000-3600){$('forecast-chart').innerHTML='<p class="empty">Prévisions complémentaires indisponibles ou expirées. Consulte Windguru ci-dessus.</p>';$('forecast-readout').innerHTML='';$('hour-slider').disabled=true;$('selected-hour').textContent='';$('forecast-age').textContent='Aucune prévision à jour reçue.';return;}
  const first=f.time.findIndex(t=>t>=Date.now()/1000-3600),offset=Math.max(0,first),end=offset+hours;
  const times=f.time.slice(offset,end);index=Math.min(index,Math.max(0,times.length-1));
  const metric=$('metric').value;
  const series=MODELS.filter(m=>selected.has(m.id)&&f.models[m.id]).map(m=>({...m,values:f.models[m.id][metric].slice(offset,end)}));
  chart('forecast-chart',times,series,{cursor:times[index]});
  $('hour-slider').disabled=!times.length;$('hour-slider').max=Math.max(0,times.length-1);$('hour-slider').value=index;
  $('selected-hour').textContent=times.length?fmt(times[index],{weekday:'long',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Prévision expirée';
  $('forecast-readout').innerHTML=MODELS.filter(m=>selected.has(m.id)).map(m=>{const fmodel=f.models[m.id],v=fmodel?.[metric]?.[offset+index],d=fmodel?.direction?.[offset+index];return `<span style="--color:${m.color}">${esc(m.name)} <b>${n(v)} ${unitLabel()}</b> ${Number.isFinite(v)?dir(d):'hors horizon'}</span>`;}).join('');
  const a=age(forecasts.generatedAt);$('forecast-age').textContent=`Données récupérées le ${fmt(forecasts.generatedAt,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${a>240?' · anciennes, actualisation en attente':''}.`;
}
function renderSpot(){
  document.title=`${spot.name} · Wind Forcast Lake`;
  $('spots').innerHTML=spots.map(s=>`<button data-spot="${s.id}" class="${s.id===spot.id?'active':''}" aria-pressed="${s.id===spot.id}">${esc(s.name)}</button>`).join('');
  $('spots').querySelectorAll('button').forEach(b=>b.onclick=()=>choose(b.dataset.spot));
  $('spot-name').textContent=spot.name;$('lake').textContent='LAC DE '+spot.lake.toUpperCase();
  $('map-link').href=`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
  renderLive();windguru();renderCameras();
  $('history-station').innerHTML=spot.stations.map(id=>`<option value="${id}">${esc(live.stations[id]?.name||id)}</option>`).join('');
  renderHistory();stationWidgets();renderForecast();
  $('source-links').innerHTML=spot.stations.map(id=>live.stations[id]?`<a href="${esc(live.stations[id].source)}" target="_blank" rel="noopener">${esc(live.stations[id].name)}</a>`:'').join('')+'<a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo</a>';
}
function choose(id){spot=spots.find(s=>s.id===id)||spots[3];save('lake-spot',spot.id);history.replaceState(null,'','#'+spot.id);index=0;renderSpot();}
async function load(){
  const version=++loadVersion;$('refresh').disabled=true;$('connection').textContent='Actualisation…';
  const results=await Promise.allSettled([json('./data/live.json?t='+Date.now()),json('./data/forecast.json?t='+Date.now())]);
  if(version!==loadVersion)return;
  if(results[0].status==='fulfilled')live=results[0].value;
  if(results[1].status==='fulfilled')forecasts=results[1].value;
  const ok=results.every(r=>r.status==='fulfilled');document.body.classList.toggle('offline',!ok||!navigator.onLine);
  $('connection').textContent=ok?'Mesures datées · collecte ≈ 15 min':'Connexion indisponible · données précédentes conservées';
  $('refresh').disabled=false;renderSpot();
}
$('unit').value=unit=stored('lake-unit','kn');
$('unit').onchange=()=>{unit=$('unit').value;save('lake-unit',unit);renderSpot();};
$('refresh').onclick=load;
$('range').querySelectorAll('button').forEach(b=>b.onclick=()=>{hours=Number(b.dataset.hours);index=0;$('range').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderForecast();});
$('metric').onchange=renderForecast;$('hour-slider').oninput=()=>{index=Number($('hour-slider').value);renderForecast();};
$('history-station').onchange=renderHistory;$('history-hours').onchange=renderHistory;
$('model-toggles').innerHTML=MODELS.map(m=>`<button data-model="${m.id}" aria-pressed="true"><span class="swatch" style="--color:${m.color}"></span>${esc(m.name)}</button>`).join('');
$('model-toggles').querySelectorAll('button').forEach(b=>b.onclick=()=>{const id=b.dataset.model;if(selected.has(id)&&selected.size===1)return;selected.has(id)?selected.delete(id):selected.add(id);b.setAttribute('aria-pressed',String(selected.has(id)));renderForecast();});
try{spots=await json('./data/spots.json');spot=spots.find(s=>s.id===(location.hash.slice(1)||stored('lake-spot','portalban')))||spots[3];await load();}catch{ $('connection').textContent='Impossible de charger les spots. Recharge la page avec une connexion Internet.';}
setInterval(()=>{if(!document.hidden&&spot)load();},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&spot)load();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
