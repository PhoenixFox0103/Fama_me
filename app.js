/* global supabase, APP_CONFIG */
const $=id=>document.getElementById(id);
async function callOverpassApi(query){
  const response=await fetch('/api/overpass',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query})});
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))throw new Error('La fonction cartographique /api/overpass n’est pas déployée');
  const data=await response.json();
  if(!response.ok){
    const value=data?.error??data?.detail??data?.message;
    const message=typeof value==='string'?value:(value?.message||value?.detail||`Erreur HTTP ${response.status}`);
    throw new Error(message);
  }
  return data;
}
const db=supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_ANON_KEY);let water=[],electricity=[],service='water',filter='all';let device=localStorage.getItem('signal-tn-device');if(!device){device=crypto.randomUUID();localStorage.setItem('signal-tn-device',device)}
const govs=['Ariana','Béja','Ben Arous','Bizerte','Gabès','Gafsa','Jendouba','Kairouan','Kasserine','Kébili','Le Kef','La Manouba','Mahdia','Médenine','Monastir','Nabeul','Sfax','Sidi Bouzid','Siliana','Sousse','Tataouine','Tozeur','Tunis','Zaghouan'];govs.forEach(g=>$('newZoneGovernorate').add(new Option(g,g)));
const configs={water:{icon:'💧',title:'Eau',subtitle:'Coupures, faible pression et retour du service.',view:'zone_status',rpc:'submit_report',filters:[['all','Toutes'],['water','Disponible'],['cut','Coupure'],['low','Pression faible']],choices:[['water','Eau disponible','Le service fonctionne'],['cut','Coupure d’eau','L’eau ne coule pas'],['low','Pression faible','L’eau coule difficilement']]},electricity:{icon:'⚡',title:'Électricité',subtitle:'Coupures, instabilité, baisse de tension et retour du courant.',view:'electricity_status',rpc:'submit_electricity_report',filters:[['all','Toutes'],['available','Disponible'],['outage','Coupure'],['unstable','Intermittent'],['low_voltage','Baisse de tension']],choices:[['available','Électricité disponible','Le courant fonctionne'],['outage','Coupure totale','Aucun courant'],['unstable','Coupures intermittentes','Le courant va et revient'],['low_voltage','Baisse de tension','Tension anormalement faible']]}};
function norm(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}function ago(v){if(!v)return'Aucun signalement';let s=Math.max(1,Math.floor((Date.now()-new Date(v))/1000));if(s<60)return`il y a ${s}s`;if(s<3600)return`il y a ${Math.floor(s/60)} min`;if(s<86400)return`il y a ${Math.floor(s/3600)} h`;return`il y a ${Math.floor(s/86400)} j`}function notify(m,e=false){$('notification').textContent=m;$('notification').className=`notice${e?' error':''}`;clearTimeout(notify.t);notify.t=setTimeout(()=>$('notification').classList.add('hidden'),5000)}
function waterState(s){if(s==='water')return['good','Eau disponible'];if(s==='cut')return['bad','Coupure d’eau'];if(s==='low')return['warn','Pression faible'];return['unknown','À renseigner']}function electricityState(s){if(s==='available')return['good','Courant disponible'];if(s==='outage')return['bad','Coupure totale'];if(s==='unstable')return['warn','Intermittent'];if(s==='low_voltage')return['warn','Baisse de tension'];return['unknown','À renseigner']}function currentData(){return service==='water'?water:electricity}function stateOf(s){return service==='water'?waterState(s):electricityState(s)}
function showPage(name){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$(`${name}Page`).classList.add('active');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('mainNav').classList.remove('open');if(name==='dashboard')updateDashboard();if(name==='zones')renderDirectory()}
function openService(name){service=name;filter='all';const c=configs[name];$('serviceIcon').textContent=c.icon;$('serviceTitle').textContent=c.title;$('serviceSubtitle').textContent=c.subtitle;renderFilters();showPage('service');renderService()}
function renderFilters(){const c=configs[service];$('statusFilters').innerHTML='';c.filters.forEach(([key,label])=>{let b=document.createElement('button');b.className=`filter${key===filter?' active':''}`;b.textContent=label;b.onclick=()=>{filter=key;renderFilters();renderService()};$('statusFilters').appendChild(b)})}
function renderService(){let q=norm($('searchInput').value),data=currentData().filter(z=>(!q||norm(`${z.name} ${z.governorate}`).includes(q))&&(filter==='all'||z.current_status===filter));$('zoneGroups').innerHTML='';$('emptyState').classList.toggle('hidden',data.length>0);let groups={};data.forEach(z=>(groups[z.governorate]??=[]).push(z));Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr')).forEach(g=>{let section=document.createElement('section');section.className='governorate';section.innerHTML='<h2 class="governorate-title"></h2><div class="zone-list"></div>';section.querySelector('h2').textContent=g;let list=section.querySelector('.zone-list');groups[g].sort((a,b)=>a.name.localeCompare(b.name,'fr')).forEach(z=>{let [kind,label]=stateOf(z.current_status),card=document.createElement('article');card.className=`zone-card ${kind}`;card.innerHTML='<div class="zone-top"><span class="zone-name"></span><span class="status"></span></div><div class="zone-meta"></div><button class="zone-update">Mettre à jour</button>';card.querySelector('.zone-name').textContent=z.name;let st=card.querySelector('.status');st.textContent=label;st.className=`status ${kind}`;card.querySelector('.zone-meta').textContent=`${Number(z.reports_count||0)} signalement(s) • ${ago(z.last_report_at)}`;card.querySelector('button').onclick=()=>openReport(z);list.appendChild(card)});$('zoneGroups').appendChild(section)});let all=currentData();$('serviceZones').textContent=all.length;$('serviceReports').textContent=all.reduce((n,z)=>n+Number(z.reports_count||0),0);$('serviceIncidents').textContent=all.filter(z=>stateOf(z.current_status)[0]==='bad'||stateOf(z.current_status)[0]==='warn').length}
async function load(){const [w,e]=await Promise.all([db.from('zone_status').select('*').order('governorate').order('name'),db.from('electricity_status').select('*').order('governorate').order('name')]);if(w.error)return notify(`Eau : ${w.error.message}`,true);if(e.error)return notify(`Électricité : ${e.error.message}. Exécutez 001_add_electricity.sql.`,true);water=w.data||[];electricity=e.data||[];updateHome();if($('servicePage').classList.contains('active'))renderService()}
function incidentCount(data,kind){return data.filter(z=>kind==='water'?['cut','low'].includes(z.current_status):['outage','unstable','low_voltage'].includes(z.current_status)).length}function updateHome(){let wr=water.reduce((n,z)=>n+Number(z.reports_count||0),0),er=electricity.reduce((n,z)=>n+Number(z.reports_count||0),0),wi=incidentCount(water,'water'),ei=incidentCount(electricity,'electricity');$('allZones').textContent=Math.max(water.length,electricity.length);$('allReports').textContent=wr+er;$('allIncidents').textContent=wi+ei;$('waterActive').textContent=`${wi} actif(s)`;$('electricityActive').textContent=`${ei} actif(s)`;updateDashboard()}
function updateDashboard(){let wr=water.reduce((n,z)=>n+Number(z.reports_count||0),0),er=electricity.reduce((n,z)=>n+Number(z.reports_count||0),0),wi=incidentCount(water,'water'),ei=incidentCount(electricity,'electricity'),max=Math.max(1,wi+ei);$('dashWaterIncidents').textContent=wi;$('dashElectricityIncidents').textContent=ei;$('dashZones').textContent=Math.max(water.length,electricity.length);$('dashReports').textContent=wr+er;$('waterBar').style.width=`${wi/max*100}%`;$('electricityBar').style.width=`${ei/max*100}%`;$('waterBarValue').textContent=wi;$('electricityBarValue').textContent=ei}
function renderDirectory(){let groups={};water.forEach(z=>(groups[z.governorate]??=[]).push(z.name));$('zonesDirectory').innerHTML='';Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr')).forEach(g=>{let s=document.createElement('section');s.innerHTML='<h2></h2>';s.querySelector('h2').textContent=g;[...new Set(groups[g])].sort((a,b)=>a.localeCompare(b,'fr')).forEach(n=>{let p=document.createElement('p');p.textContent=n;s.appendChild(p)});$('zonesDirectory').appendChild(s)})}
function openReport(z){const c=configs[service];$('reportZoneId').value=z.id;$('reportZoneName').textContent=z.name;$('dialogIcon').textContent=c.icon;$('reportHelp').textContent=`Indiquez la situation ${c.title.toLowerCase()} constatée maintenant.`;$('reportChoices').innerHTML='';c.choices.forEach(([status,title,help])=>{let b=document.createElement('button');b.className='choice';b.innerHTML='<b></b><small></small>';b.querySelector('b').textContent=title;b.querySelector('small').textContent=help;b.onclick=()=>submitReport(status);$('reportChoices').appendChild(b)});$('reportDialog').showModal()}
async function submitReport(status){$('reportDialog').close();const c=configs[service];let{error}=await db.rpc(c.rpc,{p_zone_id:$('reportZoneId').value,p_status:status,p_device_id:device});if(error)return notify(error.message,true);notify('Situation mise à jour.');await load()}
function openAdd(){if($('searchInput').value.trim())$('newZoneName').value=$('searchInput').value.trim();$('addZoneDialog').showModal()}$('addZoneForm').onsubmit=async e=>{e.preventDefault();let name=$('newZoneName').value.trim(),gov=$('newZoneGovernorate').value,existing=water.find(z=>norm(z.name)===norm(name)&&norm(z.governorate)===norm(gov));if(existing){$('addZoneDialog').close();$('searchInput').value=existing.name;renderService();return notify(`La zone « ${existing.name} » existe déjà.`,true)}$('addZoneSubmit').disabled=true;let{error}=await db.rpc('add_community_zone',{p_name:name,p_governorate:gov,p_device_id:device});$('addZoneSubmit').disabled=false;if(error)return notify(norm(error.message).includes('existe deja')?'Cette zone existe déjà.':error.message,true);$('addZoneDialog').close();$('addZoneForm').reset();notify('Zone ajoutée.');await load()};
document.querySelectorAll('[data-service]').forEach(b=>{if(!b.disabled)b.onclick=()=>openService(b.dataset.service)});document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('menuButton').onclick=()=>$('mainNav').classList.toggle('open');$('searchInput').oninput=renderService;$('refreshButton').onclick=load;$('addZoneButton').onclick=openAdd;$('emptyAddButton').onclick=openAdd;$('shareButton').onclick=async()=>{try{if(navigator.share)return navigator.share({title:'Signal TN',text:'Veille citoyenne en Tunisie',url:location.href});await navigator.clipboard.writeText(location.href);notify('Lien copié.')}catch{}};load();

/* ==================== METEO OPEN-METEO ==================== */
const weatherLocations=[
{name:'Tunis',governorate:'Tunis',lat:36.8065,lon:10.1815},{name:'Ariana',governorate:'Ariana',lat:36.8665,lon:10.1647},{name:'Ben Arous',governorate:'Ben Arous',lat:36.7531,lon:10.2189},{name:'Manouba',governorate:'La Manouba',lat:36.8080,lon:10.0965},{name:'Nabeul',governorate:'Nabeul',lat:36.4561,lon:10.7376},{name:'Zaghouan',governorate:'Zaghouan',lat:36.4029,lon:10.1429},{name:'Bizerte',governorate:'Bizerte',lat:37.2744,lon:9.8739},{name:'Béja',governorate:'Béja',lat:36.7256,lon:9.1817},{name:'Jendouba',governorate:'Jendouba',lat:36.5011,lon:8.7802},{name:'Le Kef',governorate:'Le Kef',lat:36.1742,lon:8.7049},{name:'Siliana',governorate:'Siliana',lat:36.0849,lon:9.3708},{name:'Sousse',governorate:'Sousse',lat:35.8256,lon:10.6369},{name:'Monastir',governorate:'Monastir',lat:35.7643,lon:10.8113},{name:'Mahdia',governorate:'Mahdia',lat:35.5047,lon:11.0622},{name:'Sfax',governorate:'Sfax',lat:34.7406,lon:10.7603},{name:'Kairouan',governorate:'Kairouan',lat:35.6781,lon:10.0963},{name:'Kasserine',governorate:'Kasserine',lat:35.1676,lon:8.8365},{name:'Sidi Bouzid',governorate:'Sidi Bouzid',lat:35.0382,lon:9.4849},{name:'Gabès',governorate:'Gabès',lat:33.8815,lon:10.0982},{name:'Médenine',governorate:'Médenine',lat:33.3549,lon:10.5055},{name:'Tataouine',governorate:'Tataouine',lat:32.9297,lon:10.4518},{name:'Gafsa',governorate:'Gafsa',lat:34.4311,lon:8.7757},{name:'Tozeur',governorate:'Tozeur',lat:33.9197,lon:8.1335},{name:'Kébili',governorate:'Kébili',lat:33.7044,lon:8.9690}
];
let weatherData=[];
function weatherCodeInfo(code){if(code===0)return['☀️','Ciel dégagé','sunny'];if([1,2].includes(code))return['🌤️','Partiellement nuageux','cloudy'];if(code===3)return['☁️','Couvert','cloudy'];if([45,48].includes(code))return['🌫️','Brouillard','fog'];if([51,53,55,56,57].includes(code))return['🌦️','Bruine','rainy'];if([61,63,65,66,67,80,81,82].includes(code))return['🌧️','Pluie','rainy'];if([71,73,75,77,85,86].includes(code))return['🌨️','Neige','cloudy'];if([95,96,99].includes(code))return['⛈️','Orage','storm'];return['🌡️','Conditions variables','cloudy']}
function weatherNotify(message,error=false){$('weatherNotice').textContent=message;$('weatherNotice').className=`notice${error?' error':''}`;clearTimeout(weatherNotify.t);weatherNotify.t=setTimeout(()=>$('weatherNotice').classList.add('hidden'),5000)}
async function loadWeather(){if(!$('weatherGrid'))return;$('weatherRefreshButton').disabled=true;$('weatherRefreshButton').textContent='Actualisation...';const lat=weatherLocations.map(x=>x.lat).join(','),lon=weatherLocations.map(x=>x.lon).join(',');const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FTunis&forecast_days=4`;try{const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);let payload=await response.json();if(!Array.isArray(payload))payload=[payload];weatherData=payload.map((item,i)=>({...weatherLocations[i],current:item.current,daily:item.daily,current_units:item.current_units}));$('weatherUpdatedAt').textContent=new Intl.DateTimeFormat('fr-TN',{dateStyle:'medium',timeStyle:'short'}).format(new Date());renderWeather()}catch(error){console.error(error);weatherNotify(`Météo indisponible : ${error.message}`,true)}finally{$('weatherRefreshButton').disabled=false;$('weatherRefreshButton').textContent='Actualiser la météo'}}
function renderWeather(){let q=norm($('weatherSearchInput').value),sort=$('weatherSortSelect').value,data=weatherData.filter(x=>!q||norm(`${x.name} ${x.governorate}`).includes(q));if(sort==='temperature_desc')data.sort((a,b)=>b.current.temperature_2m-a.current.temperature_2m);else if(sort==='temperature_asc')data.sort((a,b)=>a.current.temperature_2m-b.current.temperature_2m);else if(sort==='wind_desc')data.sort((a,b)=>b.current.wind_speed_10m-a.current.wind_speed_10m);else data.sort((a,b)=>a.name.localeCompare(b.name,'fr'));$('weatherGrid').innerHTML='';data.forEach(w=>{let [icon,description,kind]=weatherCodeInfo(w.current.weather_code),card=document.createElement('article');card.className=`weather-card ${kind}`;let forecast=[1,2,3].map(i=>`<div class="weather-day"><span>${new Intl.DateTimeFormat('fr-TN',{weekday:'short'}).format(new Date(w.daily.time[i]))}</span><b>${Math.round(w.daily.temperature_2m_min[i])}° / ${Math.round(w.daily.temperature_2m_max[i])}°</b></div>`).join('');card.innerHTML=`<div class="weather-card-head"><div><h2 class="weather-city"></h2><span class="weather-governorate"></span></div><span class="weather-icon">${icon}</span></div><div class="weather-current"><span class="weather-temperature">${Math.round(w.current.temperature_2m)}°</span><span class="weather-description">${description}<br>Ressenti ${Math.round(w.current.apparent_temperature)}°</span></div><div class="weather-metrics"><div class="weather-metric"><b>${Math.round(w.current.relative_humidity_2m)}%</b><span>Humidité</span></div><div class="weather-metric"><b>${Math.round(w.current.wind_speed_10m)} km/h</b><span>Vent</span></div><div class="weather-metric"><b>${Number(w.current.precipitation).toFixed(1)} mm</b><span>Pluie</span></div></div><div class="weather-forecast">${forecast}</div>`;card.querySelector('.weather-city').textContent=w.name;card.querySelector('.weather-governorate').textContent=w.governorate;$('weatherGrid').appendChild(card)})}
$('weatherRefreshButton').onclick=loadWeather;$('weatherSearchInput').oninput=renderWeather;$('weatherSortSelect').onchange=renderWeather;
const originalShowPage=showPage;showPage=function(name){originalShowPage(name);if(name==='weather'&&!weatherData.length)loadWeather()};

/* ================= DASHBOARD AVANCE ET SANTE ================= */
let approvedHealthNotices=[];
let dashboardMainChart=null,dashboardSecondaryChart=null,activeDashboard='global';
const healthCategoryLabels={blood:'Don de sang',oxygen:'Orientation oxygène médical',medicine:'Disponibilité en pharmacie',transport:'Transport médical',mobility:'Matériel de mobilité',association:'Association / structure'};
govs.forEach(g=>$('healthFormGovernorate')?.add(new Option(g,g)));
const today=new Date();$('healthFormExpires').min=today.toISOString().slice(0,10);let expiry=new Date(today);expiry.setDate(expiry.getDate()+7);$('healthFormExpires').value=expiry.toISOString().slice(0,10);

async function loadHealthNotices(){const{data,error}=await db.from('approved_health_notices').select('*').order('created_at',{ascending:false});if(error){console.warn('Migration Santé non installée',error.message);approvedHealthNotices=[]}else approvedHealthNotices=data||[];renderHealthNotices()}
function renderHealthNotices(){if(!$('healthNoticeList'))return;let q=norm($('healthNoticeSearch').value),cat=$('healthNoticeCategory').value,data=approvedHealthNotices.filter(n=>(cat==='all'||n.category===cat)&&(!q||norm(`${n.title} ${n.description} ${n.governorate} ${n.organisation||''}`).includes(q)));$('healthNoticeList').innerHTML='';if(!data.length){$('healthNoticeList').innerHTML='<div class="empty"><h2>Aucune annonce approuvée</h2><p>Les demandes apparaissent ici après validation.</p></div>';return}data.forEach(n=>{let a=document.createElement('article');a.className='health-notice';a.innerHTML='<span class="tag"></span><h3></h3><p></p><small></small>';a.querySelector('.tag').textContent=healthCategoryLabels[n.category]||n.category;a.querySelector('h3').textContent=n.title;a.querySelector('p').textContent=n.description;a.querySelector('small').textContent=`${n.governorate}${n.organisation?' • '+n.organisation:''} • expire le ${new Date(n.expires_at).toLocaleDateString('fr-TN')}`;$('healthNoticeList').appendChild(a)})}
function healthMessage(text,error=false){$('healthLocationNotice').textContent=text;$('healthLocationNotice').className=`notice${error?' error':''}`}
function distanceKm(a,b,c,d){const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(z))}
async function findNearbyHealth(){if(!navigator.geolocation){return healthMessage('La géolocalisation n’est pas disponible.',true)}$('locateHealthButton').disabled=true;$('locateHealthButton').textContent='Localisation...';navigator.geolocation.getCurrentPosition(async pos=>{const lat=pos.coords.latitude,lon=pos.coords.longitude,radius=$('healthRadius').value,amenity=$('healthAmenity').value;healthMessage('Recherche des établissements proches...');const query=`[out:json][timeout:25];(node["amenity"="${amenity}"](around:${radius},${lat},${lon});way["amenity"="${amenity}"](around:${radius},${lat},${lon});relation["amenity"="${amenity}"](around:${radius},${lat},${lon}););out center tags;`;try{const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const json=await response.json();let places=json.elements.map(e=>{let plat=e.lat??e.center?.lat,plon=e.lon??e.center?.lon;return{...e.tags,lat:plat,lon:plon,distance:distanceKm(lat,lon,plat,plon)}}).filter(x=>x.lat&&x.lon).sort((a,b)=>a.distance-b.distance).slice(0,18);renderHealthPlaces(places);healthMessage(`${places.length} établissement(s) trouvé(s) dans le rayon choisi.`)}catch(error){healthMessage(`Recherche indisponible : ${error.message}`,true)}finally{$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Utiliser ma position'}},error=>{healthMessage(error.code===1?'Autorisation de localisation refusée. Activez-la pour utiliser cette fonction.':'Position indisponible. Réessayez.',true);$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Utiliser ma position'},{enableHighAccuracy:true,timeout:12000,maximumAge:300000})}
function renderHealthPlaces(places){$('healthResults').innerHTML='';if(!places.length){$('healthResults').innerHTML='<div class="empty"><h2>Aucun établissement trouvé</h2><p>Essayez un rayon plus large.</p></div>';return}places.forEach(p=>{let card=document.createElement('article');card.className='health-place';let phone=p.phone||p['contact:phone']||'',hours=p.opening_hours||'Horaires non renseignés',address=[p['addr:housenumber'],p['addr:street'],p['addr:city']].filter(Boolean).join(' ')||'Adresse non renseignée';card.innerHTML='<h3></h3><p class="place-address"></p><p class="place-info"></p><div class="health-place-actions"><a class="route" target="_blank" rel="noopener">Itinéraire</a><a class="call">Appeler</a></div>';card.querySelector('h3').textContent=p.name||'Établissement sans nom';card.querySelector('.place-address').textContent=`${p.distance.toFixed(1)} km • ${address}`;card.querySelector('.place-info').textContent=hours;card.querySelector('.route').href=`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${p.lat}%2C${p.lon}`;let call=card.querySelector('.call');if(phone)call.href=`tel:${phone.replace(/\s+/g,'')}`;else{call.textContent='Téléphone absent';call.removeAttribute('href')} $('healthResults').appendChild(card)})}

$('locateHealthButton').onclick=findNearbyHealth;$('healthNoticeSearch').oninput=renderHealthNotices;$('healthNoticeCategory').onchange=renderHealthNotices;
document.querySelectorAll('.health-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.health-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.health-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`health${b.dataset.health[0].toUpperCase()+b.dataset.health.slice(1)}Panel`).classList.add('active')});
$('healthNoticeForm').onsubmit=async e=>{e.preventDefault();$('healthFormSubmit').disabled=true;const{error}=await db.rpc('submit_health_notice',{p_category:$('healthFormCategory').value,p_title:$('healthFormTitle').value.trim(),p_governorate:$('healthFormGovernorate').value,p_description:$('healthFormDescription').value.trim(),p_organisation:$('healthFormOrganisation').value.trim(),p_expires_at:$('healthFormExpires').value,p_device_id:device});$('healthFormSubmit').disabled=false;$('healthFormNotice').className=`notice${error?' error':''}`;$('healthFormNotice').textContent=error?`Envoi impossible : ${error.message}`:'Demande envoyée. Elle apparaîtra après validation par la modération.';if(!error)$('healthNoticeForm').reset()};

function topGovernorates(data,statuses){let counts={};data.filter(z=>statuses.includes(z.current_status)).forEach(z=>counts[z.governorate]=(counts[z.governorate]||0)+1);return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8)}
function setDashboardCards(items){$('dashboardCards').innerHTML='';items.forEach(([icon,value,label])=>{let a=document.createElement('article');a.innerHTML=`<span>${icon}</span><b>${value}</b><small>${label}</small>`;$('dashboardCards').appendChild(a)})}
function drawCharts(main,secondary){if(typeof Chart==='undefined')return;if(dashboardMainChart)dashboardMainChart.destroy();if(dashboardSecondaryChart)dashboardSecondaryChart.destroy();dashboardMainChart=new Chart($('dashboardMainChart'),main);dashboardSecondaryChart=new Chart($('dashboardSecondaryChart'),secondary)}
function dashboardBaseOptions(){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}
updateDashboard=function(){if(!$('dashboardCards'))return;let wr=water.reduce((n,z)=>n+Number(z.reports_count||0),0),er=electricity.reduce((n,z)=>n+Number(z.reports_count||0),0),waterCounts={Disponible:water.filter(z=>z.current_status==='water').length,Coupure:water.filter(z=>z.current_status==='cut').length,'Pression faible':water.filter(z=>z.current_status==='low').length,'À renseigner':water.filter(z=>!z.current_status).length},elecCounts={Disponible:electricity.filter(z=>z.current_status==='available').length,Coupure:electricity.filter(z=>z.current_status==='outage').length,Intermittent:electricity.filter(z=>z.current_status==='unstable').length,'Baisse tension':electricity.filter(z=>z.current_status==='low_voltage').length,'À renseigner':electricity.filter(z=>!z.current_status).length};let top=[];
if(activeDashboard==='water'){setDashboardCards([['💧',wr,'signalements eau'],['❌',waterCounts.Coupure,'coupures actives'],['⚠️',waterCounts['Pression faible'],'pressions faibles'],['✅',waterCounts.Disponible,'zones avec eau']]);top=topGovernorates(water,['cut','low']);$('mainChartTitle').textContent='Situation actuelle de l’eau';$('secondaryChartTitle').textContent='Gouvernorats les plus touchés';drawCharts({type:'doughnut',data:{labels:Object.keys(waterCounts),datasets:[{data:Object.values(waterCounts),backgroundColor:['#16846d','#c1122f','#d48a12','#a8afba']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}},{type:'bar',data:{labels:top.map(x=>x[0]),datasets:[{label:'Incidents',data:top.map(x=>x[1]),backgroundColor:'#168b9f'}]},options:dashboardBaseOptions()})}
else if(activeDashboard==='electricity'){setDashboardCards([['⚡',er,'signalements électricité'],['❌',elecCounts.Coupure,'coupures totales'],['⚠️',elecCounts.Intermittent,'coupures intermittentes'],['✅',elecCounts.Disponible,'zones avec courant']]);top=topGovernorates(electricity,['outage','unstable','low_voltage']);$('mainChartTitle').textContent='Situation électrique actuelle';$('secondaryChartTitle').textContent='Gouvernorats les plus touchés';drawCharts({type:'doughnut',data:{labels:Object.keys(elecCounts),datasets:[{data:Object.values(elecCounts),backgroundColor:['#16846d','#c1122f','#d48a12','#7462d1','#a8afba']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}},{type:'bar',data:{labels:top.map(x=>x[0]),datasets:[{label:'Incidents',data:top.map(x=>x[1]),backgroundColor:'#d48a12'}]},options:dashboardBaseOptions()})}
else if(activeDashboard==='weather'){let d=weatherData||[],temps=d.map(x=>Math.round(x.current.temperature_2m)),winds=d.map(x=>Math.round(x.current.wind_speed_10m)),hottest=d.length?d.reduce((a,b)=>a.current.temperature_2m>b.current.temperature_2m?a:b):null,coldest=d.length?d.reduce((a,b)=>a.current.temperature_2m<b.current.temperature_2m?a:b):null;setDashboardCards([['🌡️',d.length?Math.round(temps.reduce((a,b)=>a+b,0)/d.length)+'°':'—','température moyenne'],['🔥',hottest?hottest.name:'—','ville la plus chaude'],['❄️',coldest?coldest.name:'—','ville la plus froide'],['💨',d.length?Math.max(...winds)+' km/h':'—','vent maximal']]);$('mainChartTitle').textContent='Températures par ville';$('secondaryChartTitle').textContent='Vitesse du vent';drawCharts({type:'bar',data:{labels:d.map(x=>x.name),datasets:[{label:'°C',data:temps,backgroundColor:'#c1122f'}]},options:dashboardBaseOptions()},{type:'line',data:{labels:d.map(x=>x.name),datasets:[{label:'km/h',data:winds,borderColor:'#557892',backgroundColor:'#55789244',fill:true}]},options:dashboardBaseOptions()})}
else if(activeDashboard==='health'){let cats={};approvedHealthNotices.forEach(n=>cats[healthCategoryLabels[n.category]||n.category]=(cats[healthCategoryLabels[n.category]||n.category]||0)+1);setDashboardCards([['🏥',approvedHealthNotices.length,'annonces approuvées'],['🩸',approvedHealthNotices.filter(n=>n.category==='blood').length,'appels au don de sang'],['💊',approvedHealthNotices.filter(n=>n.category==='medicine').length,'recherches en pharmacie'],['🫁',approvedHealthNotices.filter(n=>n.category==='oxygen').length,'orientations oxygène']]);$('mainChartTitle').textContent='Annonces par catégorie';$('secondaryChartTitle').textContent='Annonces par gouvernorat';let gov={};approvedHealthNotices.forEach(n=>gov[n.governorate]=(gov[n.governorate]||0)+1);drawCharts({type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#c1122f','#168b9f','#d48a12','#7462d1','#16846d','#557892']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}},{type:'bar',data:{labels:Object.keys(gov),datasets:[{label:'Annonces',data:Object.values(gov),backgroundColor:'#16846d'}]},options:dashboardBaseOptions()})}
else{let wi=waterCounts.Coupure+waterCounts['Pression faible'],ei=elecCounts.Coupure+elecCounts.Intermittent+elecCounts['Baisse tension'];setDashboardCards([['📍',Math.max(water.length,electricity.length),'zones couvertes'],['📣',wr+er,'signalements cumulés'],['💧',wi,'incidents eau actifs'],['⚡',ei,'incidents électricité actifs']]);$('mainChartTitle').textContent='Incidents actifs par service';$('secondaryChartTitle').textContent='Volume de signalements';drawCharts({type:'doughnut',data:{labels:['Eau','Électricité'],datasets:[{data:[wi,ei],backgroundColor:['#168b9f','#d48a12']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}},{type:'bar',data:{labels:['Eau','Électricité'],datasets:[{label:'Signalements',data:[wr,er],backgroundColor:['#168b9f','#d48a12']}]},options:dashboardBaseOptions()})}}
document.querySelectorAll('.dashboard-tab').forEach(b=>b.onclick=async()=>{document.querySelectorAll('.dashboard-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeDashboard=b.dataset.dashboard;if(activeDashboard==='weather'&&!weatherData.length)await loadWeather();updateDashboard()});
const healthAwareShowPage=showPage;showPage=function(name){healthAwareShowPage(name);if(name==='health')loadHealthNotices();if(name==='dashboard')updateDashboard()};
loadHealthNotices();

/* Recherche météo dynamique pour toutes les villes tunisiennes */
let dynamicWeatherLocations=[];
async function fetchForecastForLocation(location){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FTunis&forecast_days=4`;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Prévisions HTTP ${response.status}`);
  const item=await response.json();
  return{name:location.name,governorate:location.admin1||location.admin2||'Tunisie',latitude:location.latitude,longitude:location.longitude,current:item.current,daily:item.daily,current_units:item.current_units,isDynamic:true};
}
async function searchAnyTunisianCity(){
  const query=$('weatherSearchInput').value.trim();
  if(query.length<2)return weatherNotify('Écrivez au moins 2 caractères.',true);
  $('weatherCitySearchButton').disabled=true;
  $('weatherCitySearchButton').textContent='Recherche...';
  weatherNotify(`Recherche de « ${query} » en Tunisie...`);
  try{
    const geoUrl=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=fr&format=json&countryCode=TN`;
    const geoResponse=await fetch(geoUrl);
    if(!geoResponse.ok)throw new Error(`Géocodage HTTP ${geoResponse.status}`);
    const geo=await geoResponse.json();
    const results=(geo.results||[]).filter(x=>x.country_code==='TN');
    if(!results.length){
      dynamicWeatherLocations=[];
      renderWeather();
      return weatherNotify(`Aucune ville tunisienne trouvée pour « ${query} ». Essayez une autre orthographe.`,true);
    }
    dynamicWeatherLocations=await Promise.all(results.slice(0,6).map(fetchForecastForLocation));
    renderWeather();
    weatherNotify(`${dynamicWeatherLocations.length} résultat(s) météo trouvé(s) pour « ${query} ».`);
  }catch(error){
    console.error(error);
    weatherNotify(`Recherche météo indisponible : ${error.message}`,true);
  }finally{
    $('weatherCitySearchButton').disabled=false;
    $('weatherCitySearchButton').textContent='Rechercher la ville';
  }
}
const originalRenderWeather=renderWeather;
renderWeather=function(){
  const query=norm($('weatherSearchInput').value);
  if(dynamicWeatherLocations.length&&query){
    const sort=$('weatherSortSelect').value;
    let saved=weatherData;
    weatherData=[...dynamicWeatherLocations];
    originalRenderWeather();
    weatherData=saved;
    document.querySelectorAll('.weather-card').forEach(card=>card.classList.add('weather-search-result'));
    return;
  }
  originalRenderWeather();
};
$('weatherCitySearchButton').onclick=searchAnyTunisianCity;
$('weatherSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchAnyTunisianCity()}});
$('weatherSearchInput').addEventListener('input',()=>{if(!$('weatherSearchInput').value.trim()){dynamicWeatherLocations=[];originalRenderWeather()}});

/* ===== Santé : publication immédiate, catégorie personnalisée, urgences ===== */
healthCategoryLabels.other='Autre catégorie';
$('healthFormCategory').addEventListener('change',()=>{
  const custom=$('healthFormCategory').value==='other';
  $('healthCustomCategoryLabel').classList.toggle('hidden',!custom);
  $('healthCustomCategory').required=custom;
});

const previousRenderHealthNotices=renderHealthNotices;
renderHealthNotices=function(){
  if(!$('healthNoticeList'))return;
  const q=norm($('healthNoticeSearch').value),cat=$('healthNoticeCategory').value;
  const data=approvedHealthNotices.filter(n=>(cat==='all'||n.category===cat)&&(!q||norm(`${n.title} ${n.description} ${n.governorate} ${n.organisation||''} ${n.custom_category||''}`).includes(q)));
  $('healthNoticeList').innerHTML='';
  if(!data.length){$('healthNoticeList').innerHTML='<div class="empty"><h2>Aucune annonce communautaire</h2><p>Publiez la première annonce utile de votre région.</p></div>';return}
  data.forEach(n=>{
    const a=document.createElement('article');a.className='health-notice';
    a.innerHTML='<span class="tag"></span><div class="community-warning">Annonce communautaire non vérifiée — confirmez directement auprès d’un professionnel ou d’une structure.</div><h3></h3><p></p><small></small>';
    const tag=a.querySelector('.tag');tag.textContent=n.category==='other'?(n.custom_category||'Autre catégorie'):(healthCategoryLabels[n.category]||n.category);if(n.category==='other')tag.classList.add('health-custom-tag');
    a.querySelector('h3').textContent=n.title;a.querySelector('p').textContent=n.description;a.querySelector('small').textContent=`${n.governorate}${n.organisation?' • '+n.organisation:''} • expire le ${new Date(n.expires_at).toLocaleDateString('fr-TN')}`;
    $('healthNoticeList').appendChild(a);
  });
};

$('healthNoticeForm').onsubmit=async event=>{
  event.preventDefault();
  $('healthFormSubmit').disabled=true;
  const category=$('healthFormCategory').value;
  const custom=category==='other'?$('healthCustomCategory').value.trim():'';
  const {error}=await db.rpc('submit_health_notice',{
    p_category:category,p_custom_category:custom,p_title:$('healthFormTitle').value.trim(),p_governorate:$('healthFormGovernorate').value,p_description:$('healthFormDescription').value.trim(),p_organisation:$('healthFormOrganisation').value.trim(),p_expires_at:$('healthFormExpires').value,p_device_id:device
  });
  $('healthFormSubmit').disabled=false;
  $('healthFormNotice').className=`notice${error?' error':''}`;
  $('healthFormNotice').textContent=error?`Publication impossible : ${error.message}`:'Annonce publiée immédiatement comme information communautaire non vérifiée.';
  if(!error){$('healthNoticeForm').reset();$('healthCustomCategoryLabel').classList.add('hidden');await loadHealthNotices();}
};

$('orientationButton').onclick=()=>{
  const need=$('orientationNeed').value;
  const messages={
    emergency:'Appelez immédiatement le SAMU au 190. Call SAMU immediately: 190.',
    pharmacy:'Ouvrez « Autour de moi », choisissez Pharmacies et autorisez le GPS. Appelez avant de vous déplacer.',
    hospital:'Ouvrez « Autour de moi », choisissez Hôpitaux ou Cliniques, puis autorisez le GPS.',
    medicine:'Recherchez une pharmacie proche ou publiez une demande de disponibilité. Signal TN ne permet pas la vente ou l’échange de médicaments entre particuliers.',
    oxygen:'En cas de difficulté respiratoire, appelez le SAMU au 190. Sinon, recherchez un fournisseur professionnel ou publiez une demande d’orientation.',
    transport:'Publiez une demande dans la catégorie Transport médical ou recherchez une structure proche.',
    mobility:'Publiez une demande Matériel de mobilité ou créez une catégorie personnalisée adaptée.'
  };
  $('orientationResult').textContent=messages[need]||'Choisissez un besoin pour obtenir une orientation.';
  $('orientationResult').classList.remove('hidden');
};

/* ================= SIGNAL TN ULTIMATE ================= */
const communityConfig={telecom:{title:'Télécommunications',subtitle:'Internet fixe/mobile, réseau téléphonique et qualité de service.',categories:['Internet fixe indisponible','Internet mobile indisponible','Réseau téléphonique indisponible','Débit très faible','Service intermittent','Service rétabli','Autre'],operators:true},roads:{title:'Voirie',subtitle:'Routes, trottoirs, éclairage et obstacles dangereux.',categories:['Nid-de-poule','Route dégradée','Route bloquée','Travaux non signalés','Regard dangereux','Trottoir inaccessible','Arbre tombé','Éclairage public défectueux','Autre']},cleanliness:{title:'Propreté',subtitle:'Déchets, conteneurs, égouts et zones nettoyées.',categories:['Déchets accumulés','Conteneur plein','Décharge sauvage','Égout bouché','Odeur importante','Déchets dangereux','Zone nettoyée','Autre']},traffic:{title:'Circulation',subtitle:'Perturbations récentes avec expiration automatique.',categories:['Embouteillage important','Accident signalé','Route bloquée','Travaux','Déviation','Événement','Route inondée','Circulation normale','Autre']}};
let communityIncidents=[],activeCommunity='telecom',incidentPosition={lat:null,lon:null};
govs.forEach(g=>{$('communityGovernorate').add(new Option(g,g));$('incidentGovernorate').add(new Option(g,g))});
async function loadCommunity(){const{data,error}=await db.from('public_community_incidents').select('*').order('created_at',{ascending:false});if(error){console.warn(error.message);communityIncidents=[]}else communityIncidents=data||[];renderCommunity()}
function openCommunity(serviceName){activeCommunity=serviceName;const c=communityConfig[serviceName];$('communityTitle').textContent=c.title;$('communitySubtitle').textContent=c.subtitle;showPage('community');renderCommunity()}
function renderCommunity(){if(!$('communityList'))return;const gov=$('communityGovernorate').value,sev=$('communitySeverity').value,data=communityIncidents.filter(x=>x.service===activeCommunity&&(!gov||x.governorate===gov)&&(!sev||x.severity===sev));$('communityList').innerHTML='';const high=data.filter(x=>x.severity==='high').length,confirmed=data.filter(x=>x.still_present>=2).length;setCommunityInsights([[data.length,'incidents actifs'],[high,'urgents'],[confirmed,'confirmés'],[data.filter(x=>x.latitude).length,'géolocalisés']]);if(!data.length){$('communityList').innerHTML='<div class="empty"><h2>Aucun incident actif</h2><p>Soyez la première personne à informer la communauté.</p></div>';return}data.forEach(x=>{let a=document.createElement('article');a.className=`incident-card ${x.severity==='high'?'urgent':x.severity}`;a.innerHTML='<span class="eyebrow"></span><h3></h3><p></p><div class="incident-meta"></div><div class="incident-actions"><button data-vote="still_present">Toujours présent</button><button data-vote="resolved">Résolu</button></div>';a.querySelector('.eyebrow').textContent=x.custom_category||x.category;a.querySelector('h3').textContent=x.title;a.querySelector('p').textContent=x.description;a.querySelector('.incident-meta').textContent=`${x.governorate}${x.zone_name?' • '+x.zone_name:''} • ${ago(x.created_at)} • ${x.still_present} confirmation(s)`;a.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>confirmIncident(x.id,b.dataset.vote));$('communityList').appendChild(a)})}
function setCommunityInsights(items){$('communityInsights').innerHTML='';items.forEach(([v,l])=>{let a=document.createElement('article');a.innerHTML=`<b>${v}</b><small>${l}</small>`;$('communityInsights').appendChild(a)})}
function openIncident(){const c=communityConfig[activeCommunity];$('incidentDialogTitle').textContent=`Nouveau signalement — ${c.title}`;$('incidentCategory').innerHTML='';c.categories.forEach(x=>$('incidentCategory').add(new Option(x,x==='Autre'?'other':x)));$('incidentOperatorLabel').classList.toggle('hidden',!c.operators);$('incidentDialog').showModal()}
$('incidentCategory').onchange=()=>{$('incidentCustomLabel').classList.toggle('hidden',$('incidentCategory').value!=='other')};
$('incidentUseGps').onchange=()=>{if(!$('incidentUseGps').checked){incidentPosition={lat:null,lon:null};return}navigator.geolocation.getCurrentPosition(p=>{incidentPosition={lat:p.coords.latitude,lon:p.coords.longitude};$('incidentNotice').className='notice';$('incidentNotice').textContent='Position ajoutée.'},()=>{$('incidentUseGps').checked=false;$('incidentNotice').className='notice error';$('incidentNotice').textContent='Position indisponible.'})};
$('incidentForm').onsubmit=async e=>{e.preventDefault();const{error}=await db.rpc('submit_community_incident',{p_service:activeCommunity,p_category:$('incidentCategory').value,p_custom_category:$('incidentCategory').value==='other'?$('incidentCustom').value.trim():'',p_title:$('incidentTitle').value.trim(),p_description:$('incidentDescription').value.trim(),p_governorate:$('incidentGovernorate').value,p_zone_name:$('incidentZone').value.trim(),p_operator_name:$('incidentOperator').value.trim(),p_severity:$('incidentSeverity').value,p_latitude:incidentPosition.lat,p_longitude:incidentPosition.lon,p_device_id:device});if(error){$('incidentNotice').className='notice error';$('incidentNotice').textContent=error.message;return}$('incidentDialog').close();$('incidentForm').reset();incidentPosition={lat:null,lon:null};await loadCommunity()};
async function confirmIncident(id,vote){const{error}=await db.rpc('confirm_community_incident',{p_incident_id:id,p_confirmation:vote,p_device_id:device});if(error)return alert(error.message);await loadCommunity()}
document.querySelectorAll('[data-community]').forEach(b=>b.onclick=()=>openCommunity(b.dataset.community));$('newIncidentButton').onclick=openIncident;$('communityGovernorate').onchange=renderCommunity;$('communitySeverity').onchange=renderCommunity;

/* Carte multicouche */
let nationalMap=null,mapLayers=[];
const governorateCoords=Object.fromEntries(weatherLocations.map(x=>[norm(x.governorate),[x.lat,x.lon]]));
function initMap(){if(nationalMap){setTimeout(()=>nationalMap.invalidateSize(),100);return}nationalMap=L.map('nationalMap').setView([34.5,9.5],6);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(nationalMap);setTimeout(renderNationalMap,200)}
function clearMapLayers(){mapLayers.forEach(x=>nationalMap.removeLayer(x));mapLayers=[]}
async function renderNationalMap(){if(!nationalMap)return;clearMapLayers();const selected=[...document.querySelectorAll('[data-layer]:checked')].map(x=>x.dataset.layer);const points=[];if(selected.includes('water'))water.forEach(x=>{let c=governorateCoords[norm(x.governorate)];if(c&&['cut','low'].includes(x.current_status))points.push([...c,x.current_status==='cut'?1:.55])});if(selected.includes('electricity'))electricity.forEach(x=>{let c=governorateCoords[norm(x.governorate)];if(c&&['outage','unstable','low_voltage'].includes(x.current_status))points.push([...c,x.current_status==='outage'?1:.55])});if(selected.includes('weather')){if(!weatherData.length)await loadWeather();let metric=$('mapWeatherMetric').value,vals=weatherData.map(w=>metric==='temperature'?w.current.temperature_2m:metric==='wind'?w.current.wind_speed_10m:metric==='rain'?w.current.precipitation:0),max=Math.max(...vals,1);weatherData.forEach((w,i)=>points.push([w.lat,w.lon,Math.max(.15,vals[i]/max)]))}if(points.length){let h=L.heatLayer(points,{radius:32,blur:24,maxZoom:8,gradient:{.2:'#16846d',.5:'#f1c644',.75:'#e87922',1:'#c1122f'}}).addTo(nationalMap);mapLayers.push(h)}if(selected.includes('health'))approvedHealthNotices.forEach(n=>{let c=governorateCoords[norm(n.governorate)];if(c){let m=L.circleMarker(c,{radius:6,color:'#16846d'}).bindPopup(`<b>${n.title}</b><br>${n.governorate}`).addTo(nationalMap);mapLayers.push(m)}});if(selected.includes('community'))communityIncidents.forEach(n=>{let c=n.latitude?[n.latitude,n.longitude]:governorateCoords[norm(n.governorate)];if(c){let m=L.circleMarker(c,{radius:6,color:n.severity==='high'?'#c1122f':'#d48a12'}).bindPopup(`<b>${n.title}</b><br>${n.description}`).addTo(nationalMap);mapLayers.push(m)}})}
$('refreshMapButton').onclick=renderNationalMap;document.querySelectorAll('[data-layer]').forEach(x=>x.onchange=renderNationalMap);$('mapWeatherMetric').onchange=renderNationalMap;

/* Actualités GDELT */
async function loadNews(){const q=$('newsQuery').value.trim()||'Tunisie';$('newsNotice').className='notice';$('newsNotice').textContent='Recherche des articles récents...';try{const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q+' sourcecountry:Tunisia')}&mode=ArtList&maxrecords=30&format=json&sort=HybridRel`;const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();$('newsGrid').innerHTML='';(d.articles||[]).forEach(a=>{let c=document.createElement('article');c.className='news-card';c.innerHTML='<small></small><h3></h3><p></p><a target="_blank" rel="noopener">Lire la source →</a>';c.querySelector('small').textContent=`${a.domain||'Source'} • ${a.seendate||''}`;c.querySelector('h3').textContent=a.title;c.querySelector('p').textContent=`Langue : ${a.language||'—'} • Pays source : ${a.sourcecountry||'—'}`;c.querySelector('a').href=a.url;$('newsGrid').appendChild(c)});$('newsNotice').classList.add('hidden')}catch(e){$('newsNotice').className='notice error';$('newsNotice').textContent=`Actualités indisponibles : ${e.message}. Réessayez plus tard.`}}
$('newsSearchButton').onclick=loadNews;$('newsQuery').addEventListener('keydown',e=>{if(e.key==='Enter')loadNews()});

/* Economie */
let fxData=null,economyChart=null,activeEconomy='fx';
async function loadFX(){const r=await fetch('https://open.er-api.com/v6/latest/USD');if(!r.ok)throw new Error('Taux indisponibles');fxData=await r.json();renderEconomy()}
async function loadCrypto(){const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,solana&vs_currencies=usd,eur&include_24hr_change=true');if(!r.ok)throw new Error('Crypto indisponible');window.cryptoMarket=await r.json();renderEconomy()}
async function loadInflation(){const r=await fetch('https://api.worldbank.org/v2/country/TUN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20');if(!r.ok)throw new Error('Inflation indisponible');const j=await r.json();window.inflationData=(j[1]||[]).filter(x=>x.value!==null).sort((a,b)=>a.date-b.date);renderEconomy()}
function economyCards(items){$('economyCards').innerHTML='';items.forEach(([v,l])=>{let a=document.createElement('article');a.innerHTML=`<b>${v}</b><small>${l}</small>`;$('economyCards').appendChild(a)})}
function setEconomyChart(type,labels,data,label,color){if(economyChart)economyChart.destroy();economyChart=new Chart($('economyChart'),{type,data:{labels,datasets:[{label,data,borderColor:color,backgroundColor:color+'66',fill:type==='line'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:false}}}})}
function renderEconomy(){if(activeEconomy==='fx'&&fxData){let r=fxData.rates,tnd=r.TND;economyCards([[(tnd/r.EUR).toFixed(3)+' TND','1 EUR'],[(tnd/r.USD).toFixed(3)+' TND','1 USD'],[(tnd/r.GBP).toFixed(3)+' TND','1 GBP'],[new Date(fxData.time_last_update_utc).toLocaleDateString('fr-TN'),'dernière mise à jour']]);setEconomyChart('bar',['EUR','USD','GBP'],[tnd/r.EUR,tnd,tnd/r.GBP],'TND','#c1122f');convertCurrency()}else if(activeEconomy==='crypto'&&window.cryptoMarket){let d=window.cryptoMarket,ids=['bitcoin','ethereum','tether','solana'];economyCards(ids.map(id=>['$'+Number(d[id].usd).toLocaleString('fr-FR'),id.toUpperCase()+` (${Number(d[id].usd_24h_change||0).toFixed(1)}% /24h)`]));setEconomyChart('bar',ids.map(x=>x.toUpperCase()),ids.map(x=>d[x].usd),'USD','#d48a12')}else if(activeEconomy==='inflation'&&window.inflationData){let d=window.inflationData,last=d[d.length-1];economyCards([[last.value.toFixed(1)+'%',`inflation annuelle ${last.date}`],[d.length,'années disponibles'],[Math.max(...d.map(x=>x.value)).toFixed(1)+'%','maximum de la série'],[Math.min(...d.map(x=>x.value)).toFixed(1)+'%','minimum de la série']]);setEconomyChart('line',d.map(x=>x.date),d.map(x=>x.value),'Inflation %','#7462d1')}}
function convertCurrency(){if(!fxData)return;let a=Number($('convertAmount').value||0),f=$('convertFrom').value,t=$('convertTo').value;$('convertResult').textContent=(a/fxData.rates[f]*fxData.rates[t]).toLocaleString('fr-TN',{maximumFractionDigits:3})+' '+t}
[$('convertAmount'),$('convertFrom'),$('convertTo')].forEach(x=>x.oninput=convertCurrency);document.querySelectorAll('.economy-tab').forEach(b=>b.onclick=async()=>{document.querySelectorAll('.economy-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeEconomy=b.dataset.economy;try{if(activeEconomy==='fx'&&!fxData)await loadFX();else if(activeEconomy==='crypto'&&!window.cryptoMarket)await loadCrypto();else if(activeEconomy==='inflation'&&!window.inflationData)await loadInflation();else renderEconomy()}catch(e){economyCards([['—',e.message]])}});

const ultimateShowPage=showPage;showPage=function(name){ultimateShowPage(name);if(name==='map')setTimeout(initMap,100);if(name==='news'&&!$('newsGrid').children.length)loadNews();if(name==='economy'&&!fxData)loadFX().catch(e=>economyCards([['—',e.message]]));};
loadCommunity();

/* ===== Recherche libre de tout service de santé proche ===== */
const healthSearchDictionary={
  'pharmacie':{label:'Pharmacie',selectors:['nwr["amenity"="pharmacy"]']},
  'pharmacy':{label:'Pharmacie',selectors:['nwr["amenity"="pharmacy"]']},
  'hopital':{label:'Hôpital',selectors:['nwr["amenity"="hospital"]','nwr["healthcare"="hospital"]']},
  'hospital':{label:'Hôpital',selectors:['nwr["amenity"="hospital"]','nwr["healthcare"="hospital"]']},
  'clinique':{label:'Clinique',selectors:['nwr["amenity"="clinic"]','nwr["healthcare"="clinic"]']},
  'clinic':{label:'Clinique',selectors:['nwr["amenity"="clinic"]','nwr["healthcare"="clinic"]']},
  'laboratoire':{label:'Laboratoire',selectors:['nwr["healthcare"="laboratory"]','nwr["amenity"="laboratory"]','nwr["name"~"laboratoire|laboratory|analyses",i]']},
  'analyse':{label:'Laboratoire',selectors:['nwr["healthcare"="laboratory"]','nwr["name"~"laboratoire|analyses",i]']},
  'medecin':{label:'Médecin',selectors:['nwr["amenity"="doctors"]','nwr["healthcare"="doctor"]']},
  'doctor':{label:'Médecin',selectors:['nwr["amenity"="doctors"]','nwr["healthcare"="doctor"]']},
  'dentiste':{label:'Dentiste',selectors:['nwr["amenity"="dentist"]','nwr["healthcare"="dentist"]']},
  'cardiologue':{label:'Cardiologue',selectors:['nwr["healthcare:speciality"~"cardiology",i]','nwr["name"~"cardio|cardiologue",i]']},
  'pediatre':{label:'Pédiatre',selectors:['nwr["healthcare:speciality"~"paediatrics|pediatrics",i]','nwr["name"~"pédiatr|pediatr",i]']},
  'gynecologue':{label:'Gynécologue',selectors:['nwr["healthcare:speciality"~"gynaecology|gynecology",i]','nwr["name"~"gynéco|gyneco",i]']},
  'kine':{label:'Kinésithérapeute',selectors:['nwr["healthcare"="physiotherapist"]','nwr["name"~"kiné|kine|physio",i]']},
  'physiotherapie':{label:'Kinésithérapeute',selectors:['nwr["healthcare"="physiotherapist"]']},
  'radiologie':{label:'Radiologie',selectors:['nwr["healthcare"="diagnostics"]','nwr["name"~"radiologie|radiology|imagerie",i]']},
  'dialyse':{label:'Centre de dialyse',selectors:['nwr["healthcare"="dialysis"]','nwr["name"~"dialyse|dialysis",i]']},
  'prelevement':{label:'Centre de prélèvement',selectors:['nwr["healthcare"="laboratory"]','nwr["name"~"prélèvement|prelevement",i]']},
  'oxygene':{label:'Fournisseur d’oxygène',selectors:['nwr["healthcare"="medical_supply"]','nwr["shop"="medical_supply"]','nwr["name"~"oxygène|oxygene|oxygen",i]']},
  'materiel medical':{label:'Matériel médical',selectors:['nwr["shop"="medical_supply"]','nwr["healthcare"="medical_supply"]','nwr["name"~"matériel médical|materiel medical|medical supply",i]']},
  'ambulance':{label:'Ambulance',selectors:['nwr["emergency"="ambulance_station"]','nwr["name"~"ambulance",i]']},
  'veterinaire':{label:'Vétérinaire',selectors:['nwr["amenity"="veterinary"]','nwr["healthcare"="veterinary"]']}
};
function normalizeHealthSearch(value){return norm(value).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function buildFreeHealthSelectors(raw){
  const query=normalizeHealthSearch(raw);
  for(const [keyword,config] of Object.entries(healthSearchDictionary)){
    if(query===keyword||query.includes(keyword)||keyword.includes(query))return{label:config.label,selectors:config.selectors};
  }
  const safe=raw.trim().replace(/["\\]/g,'').slice(0,60);
  return{label:safe,selectors:[`nwr["name"~"${safe}",i]`,`nwr["healthcare"~"${safe}",i]`,`nwr["amenity"~"${safe}",i]`,`nwr["shop"~"${safe}",i]`]};
}
findNearbyHealth=async function(){
  const raw=$('healthFreeSearch').value.trim();
  if(raw.length<2)return healthMessage('Écrivez au moins 2 caractères : pharmacie, laboratoire, cardiologue...',true);
  if(!navigator.geolocation)return healthMessage('La géolocalisation n’est pas disponible.',true);
  $('locateHealthButton').disabled=true;$('locateHealthButton').textContent='Localisation...';
  navigator.geolocation.getCurrentPosition(async position=>{
    const lat=position.coords.latitude,lon=position.coords.longitude,radius=$('healthRadius').value;
    const config=buildFreeHealthSelectors(raw);
    healthMessage(`Recherche de « ${config.label} » dans un rayon de ${Number(radius)/1000} km...`);
    const clauses=config.selectors.map(selector=>`${selector}(around:${radius},${lat},${lon});`).join('');
    const overpassQuery=`[out:json][timeout:30];(${clauses});out center tags;`;
    try{
      const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(overpassQuery)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const json=await response.json();
      const seen=new Set();
      const places=json.elements.map(element=>{
        const plat=element.lat??element.center?.lat,plon=element.lon??element.center?.lon;
        return{...element.tags,lat:plat,lon:plon,distance:plat&&plon?distanceKm(lat,lon,plat,plon):999};
      }).filter(place=>{
        const key=`${place.name||''}-${place.lat}-${place.lon}`;
        if(!place.lat||!place.lon||seen.has(key))return false;
        seen.add(key);return true;
      }).sort((a,b)=>a.distance-b.distance).slice(0,24);
      renderHealthPlaces(places);
      healthMessage(places.length?`${places.length} résultat(s) trouvé(s) pour « ${config.label} ».`:`Aucun résultat cartographié pour « ${config.label} » dans ce rayon. Essayez 10 ou 20 km.`,!places.length);
    }catch(error){healthMessage(`Recherche indisponible : ${error.message}. Réessayez ou élargissez le rayon.`,true)}
    finally{$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Rechercher autour de moi'}
  },error=>{healthMessage(error.code===1?'Autorisation GPS refusée. Activez la localisation dans le navigateur.':'Position indisponible. Réessayez.',true);$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Rechercher autour de moi'},{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
};
$('locateHealthButton').onclick=findNearbyHealth;
$('healthFreeSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();findNearbyHealth()}});

/* Correctif robuste */
function setModuleStatus(id,text,type=''){const el=$(id);if(el){el.textContent=text;el.className=`module-status${type?' '+type:''}`}}
window.addEventListener('error',e=>console.error('Signal TN:',e.error||e.message));window.addEventListener('unhandledrejection',e=>console.error('Signal TN promise:',e.reason));
initMap=function(){if(typeof L==='undefined'){setModuleStatus('mapStatus','Bibliothèque cartographique absente. Vérifiez le dossier vendor.','error');return}if(nationalMap){nationalMap.invalidateSize();setModuleStatus('mapStatus','Carte chargée.','ok');return}try{nationalMap=L.map('nationalMap').setView([34.5,9.5],6);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(nationalMap);setModuleStatus('mapStatus','Carte chargée. Préparation des couches…','ok');setTimeout(()=>{nationalMap.invalidateSize();renderNationalMap().catch(e=>setModuleStatus('mapStatus',e.message,'error'))},300)}catch(e){setModuleStatus('mapStatus',`Carte impossible : ${e.message}`,'error')}};
async function fetchWithFallback(direct,source,q=''){try{const r=await fetch(direct);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}catch(e){const r=await fetch(`/api/proxy?source=${source}${q?`&q=${encodeURIComponent(q)}`:''}`);if(!r.ok)throw new Error(`API directe bloquée et proxy indisponible. Sur localhost, certaines API refusent le navigateur; déployez le dossier complet sur Vercel.`);return await r.json()}}
loadFX=async function(){setModuleStatus('economyStatus','Chargement des taux…');try{fxData=await fetchWithFallback('https://open.er-api.com/v6/latest/USD','fx');setModuleStatus('economyStatus','Taux chargés.','ok');renderEconomy()}catch(e){setModuleStatus('economyStatus',e.message,'error')}};
loadCrypto=async function(){setModuleStatus('economyStatus','Chargement des cryptos…');try{window.cryptoMarket=await fetchWithFallback('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,solana&vs_currencies=usd,eur&include_24hr_change=true','crypto');setModuleStatus('economyStatus','Cryptos chargées.','ok');renderEconomy()}catch(e){setModuleStatus('economyStatus',e.message,'error')}};
loadInflation=async function(){setModuleStatus('economyStatus','Chargement de l’inflation…');try{const j=await fetchWithFallback('https://api.worldbank.org/v2/country/TUN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20','inflation');window.inflationData=(j[1]||[]).filter(x=>x.value!==null).sort((a,b)=>a.date-b.date);setModuleStatus('economyStatus','Inflation chargée.','ok');renderEconomy()}catch(e){setModuleStatus('economyStatus',e.message,'error')}};
loadNews=async function(){const q=$('newsQuery').value.trim()||'Tunisie';$('newsNotice').className='notice';$('newsNotice').textContent='Chargement…';try{const u=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q+' sourcecountry:Tunisia')}&mode=ArtList&maxrecords=30&format=json&sort=HybridRel`;const d=await fetchWithFallback(u,'news',q),articles=d.articles||[];$('newsGrid').innerHTML='';if(!articles.length)throw new Error('Aucun article trouvé.');articles.forEach(a=>{const c=document.createElement('article');c.className='news-card';c.innerHTML='<small></small><h3></h3><p></p><a target="_blank" rel="noopener">Lire la source →</a>';c.querySelector('small').textContent=`${a.domain||'Source'} • ${a.seendate||''}`;c.querySelector('h3').textContent=a.title||'Article';c.querySelector('p').textContent=`Langue : ${a.language||'—'} • Pays source : ${a.sourcecountry||'—'}`;c.querySelector('a').href=a.url;$('newsGrid').appendChild(c)});$('newsNotice').textContent=`${articles.length} article(s) chargé(s).`}catch(e){$('newsNotice').className='notice error';$('newsNotice').textContent=e.message}};
const correctedShowPage=showPage;showPage=function(name){correctedShowPage(name);if(name==='map')setTimeout(initMap,150);if(name==='news'&&!$('newsGrid').children.length)setTimeout(loadNews,100);if(name==='economy'&&!fxData)setTimeout(loadFX,100)};

/* ===== Anti-doublons de zones ===== */
function canonicalZoneName(value){let v=norm(value).replace(/[^a-z0-9]/g,'').replace(/^cite/,'').replace(/^(el|al)/,'').replace(/^enn?asr/,'nasr');const romans=[['viii','8'],['vii','7'],['vi','6'],['v','5'],['iv','4'],['iii','3'],['ii','2'],['i','1']];for(const[r,n]of romans){if(v.endsWith(r)){v=v.slice(0,-r.length)+n;break}}return v}
let zoneSuggestionTimer;
async function showZoneSuggestions(){clearTimeout(zoneSuggestionTimer);zoneSuggestionTimer=setTimeout(async()=>{const name=$('newZoneName').value.trim(),gov=$('newZoneGovernorate').value,box=$('zoneSuggestions');if(name.length<2||!gov){box.classList.add('hidden');return}let matches=water.filter(z=>norm(z.governorate)===norm(gov)&&(canonicalZoneName(z.name)===canonicalZoneName(name)||canonicalZoneName(z.name).includes(canonicalZoneName(name))||canonicalZoneName(name).includes(canonicalZoneName(z.name)))).slice(0,6);try{const{data}=await db.rpc('find_similar_zones',{p_name:name,p_governorate:gov});if(data?.length)matches=data}catch{}const unique=[...new Map(matches.map(x=>[x.id,x])).values()];box.innerHTML='';if(!unique.length){box.classList.add('hidden');return}box.classList.remove('hidden');unique.forEach(z=>{const row=document.createElement('div');row.className='zone-suggestion';row.innerHTML='<span></span><button type="button">Utiliser cette zone</button>';row.querySelector('span').textContent=`Zone proche déjà existante : ${z.name}`;row.querySelector('button').onclick=()=>{$('addZoneDialog').close();$('searchInput').value=z.name;renderService();notify(`Utilisation de la zone existante « ${z.name} ».`)};box.appendChild(row)})},350)}
$('newZoneName').addEventListener('input',showZoneSuggestions);$('newZoneGovernorate').addEventListener('change',showZoneSuggestions);
$('addZoneForm').onsubmit=async e=>{e.preventDefault();const name=$('newZoneName').value.trim(),gov=$('newZoneGovernorate').value,key=canonicalZoneName(name),existing=water.find(z=>norm(z.governorate)===norm(gov)&&canonicalZoneName(z.name)===key);if(existing){notify(`Impossible : cette zone existe déjà sous le nom « ${existing.name} ».`,true);showZoneSuggestions();return}$('addZoneSubmit').disabled=true;const{error}=await db.rpc('add_community_zone',{p_name:name,p_governorate:gov,p_device_id:device});$('addZoneSubmit').disabled=false;if(error){notify(error.message,true);showZoneSuggestions();return}$('addZoneDialog').close();$('addZoneForm').reset();$('zoneSuggestions').classList.add('hidden');notify('Zone ajoutée sans doublon.');await load()};

/* ===== Correctif ordre DOM v2 ===== */
document.documentElement.dataset.signalTnVersion='2026.07.27-final-fix';
console.info('Signal TN final fix loaded');

/* ===== Circulation live uniquement, sans saisie citoyenne ===== */
function updateNetworkState(){
  if(!$('networkState'))return;
  const online=navigator.onLine;
  $('networkState').textContent=online?'Connexion active':'Vous êtes hors ligne';
  $('networkState').style.color=online?'#16846d':'#c1122f';
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  $('networkDetails').textContent=online
    ?`Navigateur en ligne${connection?.effectiveType?' • connexion estimée : '+connection.effectiveType:''}. Ouvrez un fournisseur pour obtenir le trafic réel.`
    :'Reconnectez-vous pour consulter le trafic en direct.';
}
window.addEventListener('online',updateNetworkState);window.addEventListener('offline',updateNetworkState);
$('openNearestTraffic').onclick=()=>{
  if(!navigator.geolocation){window.open('https://www.waze.com/live-map','_blank','noopener');return}
  $('openNearestTraffic').disabled=true;$('openNearestTraffic').textContent='Localisation…';
  navigator.geolocation.getCurrentPosition(position=>{
    const {latitude,longitude}=position.coords;
    window.open(`https://www.waze.com/live-map/directions?to=ll.${latitude}%2C${longitude}`,'_blank','noopener');
    $('openNearestTraffic').disabled=false;$('openNearestTraffic').textContent='Ouvrir Waze depuis ma position';
  },()=>{
    window.open('https://www.waze.com/live-map','_blank','noopener');
    $('openNearestTraffic').disabled=false;$('openNearestTraffic').textContent='Ouvrir Waze depuis ma position';
  },{enableHighAccuracy:true,timeout:10000,maximumAge:300000});
};
const liveOnlyShowPage=showPage;showPage=function(name){liveOnlyShowPage(name);if(name==='trafficLive')updateNetworkState()};

/* ===== Télécommunications live uniquement ===== */
function runTelecomDiagnostic(){
  if(!$('telecomConnectionState'))return;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const entries=performance.getEntriesByType('navigation');
  const latency=entries.length?Math.max(0,Math.round(entries[0].responseStart-entries[0].requestStart)):null;
  const online=navigator.onLine;
  $('telecomConnectionState').textContent=online?'Connexion Internet détectée':'Connexion Internet indisponible';
  $('telecomConnectionState').style.color=online?'#16846d':'#c1122f';
  $('telecomConnectionDetails').textContent=online?'Le navigateur est en ligne. Consultez les observatoires pour connaître l’état national des opérateurs.':'Le navigateur signale une perte de connexion.';
  $('diagOnline').textContent=online?'En ligne':'Hors ligne';
  $('diagType').textContent=connection?.effectiveType?.toUpperCase()||'Non fourni';
  $('diagSpeed').textContent=connection?.downlink?`≈ ${connection.downlink} Mb/s`:'Non fourni';
  $('diagLatency').textContent=latency!==null?`${latency} ms`:'Non fournie';
}
$('telecomRetestButton').onclick=()=>{runTelecomDiagnostic();$('telecomRetestButton').textContent='Test actualisé ✓';setTimeout(()=>$('telecomRetestButton').textContent='Retester ma connexion',1600)};
window.addEventListener('online',runTelecomDiagnostic);window.addEventListener('offline',runTelecomDiagnostic);
const telecomLiveShowPage=showPage;showPage=function(name){telecomLiveShowPage(name);if(name==='telecomLive')runTelecomDiagnostic()};

/* ===== Économie enrichie et outils Santé ===== */
let economyChartView='default';
function markEconomyUpdated(){if($('economyUpdatedAt'))$('economyUpdatedAt').textContent=new Intl.DateTimeFormat('fr-TN',{dateStyle:'medium',timeStyle:'short'}).format(new Date())}
const economyRenderBase=renderEconomy;renderEconomy=function(){
  $('economyDataPanel')?.classList.toggle('hidden',['purchasing','learn'].includes(activeEconomy));
  $('purchasingPanel')?.classList.toggle('hidden',activeEconomy!=='purchasing');
  $('economyLearnPanel')?.classList.toggle('hidden',activeEconomy!=='learn');
  if(activeEconomy==='purchasing'){renderPurchasingPower();renderBasket();return}
  if(activeEconomy==='learn'){economyCards([]);setModuleStatus('economyStatus','Mini-guides pédagogiques — aucune recommandation financière.','ok');return}
  economyRenderBase();markEconomyUpdated();
  if(activeEconomy==='fx'&&fxData){const r=fxData.rates,tnd=r.TND;$('converterRate').textContent=`1 ${$('convertFrom').value} = ${(r[$('convertTo').value]/r[$('convertFrom').value]).toFixed(4)} ${$('convertTo').value}`}
};
function renderPurchasingPower(){const budget=Number($('purchaseBudget').value||0),rate=Number($('purchaseRate').value||0)/100,years=Number($('purchaseYears').value||1),future=budget*Math.pow(1+rate,years),difference=future-budget;$('purchaseResult').textContent=future.toLocaleString('fr-TN',{style:'currency',currency:'TND',maximumFractionDigits:2});$('purchaseDifference').textContent=`Soit ${difference.toLocaleString('fr-TN',{maximumFractionDigits:2})} TND de plus dans cette hypothèse.`;setModuleStatus('economyStatus','Simulation pédagogique fondée sur votre taux hypothétique.','ok')}
['purchaseBudget','purchaseRate','purchaseYears'].forEach(id=>$(id).addEventListener('input',renderPurchasingPower));
$('swapCurrencies').onclick=()=>{const a=$('convertFrom').value;$('convertFrom').value=$('convertTo').value;$('convertTo').value=a;convertCurrency();renderEconomy()};
$('economyRefreshAll').onclick=async()=>{fxData=null;window.cryptoMarket=null;window.inflationData=null;try{if(activeEconomy==='crypto')await loadCrypto();else if(activeEconomy==='inflation')await loadInflation();else if(activeEconomy==='purchasing'||activeEconomy==='learn')renderEconomy();else await loadFX()}catch(e){setModuleStatus('economyStatus',e.message,'error')}};
$('economyChartToggle').onclick=()=>{economyChartView=economyChartView==='default'?'horizontal':'default';if(economyChart){economyChart.options.indexAxis=economyChartView==='horizontal'?'y':'x';economyChart.update()}};
function getBasket(){try{return JSON.parse(localStorage.getItem('signaltn_economy_basket')||'[]')}catch{return[]}}
function renderBasket(){const data=getBasket();$('basketList').innerHTML=data.length?'':'<p class="empty">Aucun repère enregistré.</p>';data.forEach((item,index)=>{const row=document.createElement('div');row.className='basket-item';row.innerHTML='<span></span><b></b><button type="button">Supprimer</button>';row.querySelector('span').textContent=item.label;row.querySelector('b').textContent=`${Number(item.amount).toFixed(2)} TND`;row.querySelector('button').onclick=()=>{data.splice(index,1);localStorage.setItem('signaltn_economy_basket',JSON.stringify(data));renderBasket()};$('basketList').appendChild(row)})}
$('addBasketItem').onclick=()=>{const label=$('basketLabel').value.trim(),amount=Number($('basketAmount').value);if(!label||!amount)return;const data=getBasket();data.push({label,amount,date:new Date().toISOString()});localStorage.setItem('signaltn_economy_basket',JSON.stringify(data));$('basketLabel').value='';$('basketAmount').value='';renderBasket()};
// Rebind economy tabs to support new local panels reliably.
document.querySelectorAll('.economy-tab').forEach(button=>button.onclick=async()=>{document.querySelectorAll('.economy-tab').forEach(x=>x.classList.remove('active'));button.classList.add('active');activeEconomy=button.dataset.economy;try{if(activeEconomy==='fx'&&!fxData)await loadFX();else if(activeEconomy==='crypto'&&!window.cryptoMarket)await loadCrypto();else if(activeEconomy==='inflation'&&!window.inflationData)await loadInflation();else renderEconomy()}catch(e){setModuleStatus('economyStatus',e.message,'error')}});

/* Favoris et outils santé locaux */
function getHealthFavorites(){try{return JSON.parse(localStorage.getItem('signaltn_health_favorites')||'[]')}catch{return[]}}
const renderHealthPlacesBase=renderHealthPlaces;renderHealthPlaces=function(places){renderHealthPlacesBase(places);[...$('healthResults').querySelectorAll('.health-place')].forEach((card,index)=>{const place=places[index];if(!place)return;const button=document.createElement('button');button.type='button';button.className='favorite-place-button';button.textContent='☆ Favori';button.onclick=()=>{const data=getHealthFavorites(),key=`${place.name||''}-${place.lat}-${place.lon}`;if(!data.some(x=>x.key===key)){data.push({key,name:place.name||'Établissement',lat:place.lat,lon:place.lon,phone:place.phone||place['contact:phone']||''});localStorage.setItem('signaltn_health_favorites',JSON.stringify(data));healthToolMessage('Établissement ajouté aux favoris de ce navigateur.')}button.textContent='★ Enregistré'};card.querySelector('.health-place-actions')?.appendChild(button)})};
function healthToolMessage(text,error=false){$('healthToolNotice').textContent=text;$('healthToolNotice').className=`notice${error?' error':''}`}
function renderHealthFavorites(){const panel=$('healthFavoritesPanel'),data=getHealthFavorites();panel.innerHTML='';panel.classList.remove('hidden');if(!data.length){panel.innerHTML='<div class="empty">Aucun établissement favori.</div>';return}data.forEach((item,index)=>{const row=document.createElement('div');row.className='favorite-place';row.innerHTML='<span></span><div><a target="_blank" rel="noopener">Carte</a> <button type="button">×</button></div>';row.querySelector('span').textContent=item.name;row.querySelector('a').href=`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=17/${item.lat}/${item.lon}`;row.querySelector('button').onclick=()=>{data.splice(index,1);localStorage.setItem('signaltn_health_favorites',JSON.stringify(data));renderHealthFavorites()};panel.appendChild(row)})}
$('showHealthFavorites').onclick=renderHealthFavorites;
$('shareHealthLocation').onclick=()=>{if(!navigator.geolocation)return healthToolMessage('Géolocalisation indisponible.',true);navigator.geolocation.getCurrentPosition(async p=>{const url=`https://www.openstreetmap.org/?mlat=${p.coords.latitude}&mlon=${p.coords.longitude}#map=17/${p.coords.latitude}/${p.coords.longitude}`;try{if(navigator.share)await navigator.share({title:'Ma position',url});else await navigator.clipboard.writeText(url);healthToolMessage('Lien de position partagé ou copié.')}catch{healthToolMessage('Partage annulé.',true)}},()=>healthToolMessage('Position non autorisée.',true))};
$('printEmergencyCard').onclick=()=>window.print();
$('clearHealthLocalData').onclick=()=>{localStorage.removeItem('signaltn_health_favorites');if($('healthFreeSearch'))$('healthFreeSearch').value='';$('healthFavoritesPanel').innerHTML='';$('healthFavoritesPanel').classList.add('hidden');healthToolMessage('Favoris et recherches locales supprimés.')};

/* ===== Toutes les devises, sans limitation EUR/USD/GBP ===== */
const currencyNames={AED:'Dirham des Émirats',AUD:'Dollar australien',CAD:'Dollar canadien',CHF:'Franc suisse',CNY:'Yuan chinois',DZD:'Dinar algérien',EGP:'Livre égyptienne',EUR:'Euro',GBP:'Livre sterling',JPY:'Yen japonais',KWD:'Dinar koweïtien',LYD:'Dinar libyen',MAD:'Dirham marocain',QAR:'Riyal qatari',SAR:'Riyal saoudien',TND:'Dinar tunisien',TRY:'Livre turque',USD:'Dollar américain'};
let watchedCurrencies=JSON.parse(localStorage.getItem('signaltn_watched_currencies')||'["EUR","USD","GBP"]');
function currencyLabel(code){return `${code}${currencyNames[code]?' — '+currencyNames[code]:''}`}
function populateCurrencySelectors(){
  if(!fxData?.rates)return;
  const codes=Object.keys(fxData.rates).sort();
  ['currencyFromList','currencyToList'].forEach(id=>{const list=$(id);list.innerHTML='';codes.forEach(code=>{const option=document.createElement('option');option.value=code;option.label=currencyLabel(code);list.appendChild(option)})});
  renderCurrencyWatch(codes);
}
function syncCurrencyInputs(){
  const from=$('convertFromSearch').value.trim().toUpperCase(),to=$('convertToSearch').value.trim().toUpperCase();
  if(fxData?.rates?.[from]&&fxData?.rates?.[to]){
    $('convertFrom').innerHTML=`<option>${from}</option>`;$('convertTo').innerHTML=`<option>${to}</option>`;
    $('convertFrom').value=from;$('convertTo').value=to;convertCurrency();
    const rate=fxData.rates[to]/fxData.rates[from];$('converterRate').textContent=`1 ${from} = ${rate.toLocaleString('fr-TN',{maximumFractionDigits:6})} ${to}`;
  }else{$('convertResult').textContent='Code devise invalide';$('converterRate').textContent='Choisissez un code proposé dans la liste.'}
}
function renderCurrencyWatch(codes=Object.keys(fxData?.rates||{}).sort()){
  const box=$('currencyWatchChoices');if(!box)return;box.innerHTML='';
  const priority=['EUR','USD','GBP','CAD','CHF','AED','SAR','QAR','KWD','JPY','CNY','TRY','DZD','MAD','LYD','EGP'];
  priority.filter(code=>codes.includes(code)).forEach(code=>{const button=document.createElement('button');button.type='button';button.className=`currency-chip${watchedCurrencies.includes(code)?' active':''}`;button.textContent=code;button.title=currencyLabel(code);button.onclick=()=>{if(watchedCurrencies.includes(code))watchedCurrencies=watchedCurrencies.filter(x=>x!==code);else if(watchedCurrencies.length<6)watchedCurrencies.push(code);else return setModuleStatus('economyStatus','Vous pouvez comparer jusqu’à 6 devises à la fois.','error');localStorage.setItem('signaltn_watched_currencies',JSON.stringify(watchedCurrencies));renderCurrencyWatch(codes);if(activeEconomy==='fx')renderEconomy()};box.appendChild(button)});
}
const renderEconomyAllCurrenciesBase=renderEconomy;renderEconomy=function(){
  if(activeEconomy==='fx'&&fxData){populateCurrencySelectors();const r=fxData.rates,tnd=r.TND;const selected=watchedCurrencies.filter(code=>r[code]&&code!=='TND');economyCards(selected.map(code=>[`${(tnd/r[code]).toLocaleString('fr-TN',{maximumFractionDigits:4})} TND`,`1 ${currencyLabel(code)}`]));$('economyChartTitle').textContent='Valeur de 1 unité en dinars tunisiens';setEconomyChart('bar',selected,selected.map(code=>tnd/r[code]),'TND','#c1122f');syncCurrencyInputs();markEconomyUpdated();$('economyDataPanel')?.classList.remove('hidden');$('purchasingPanel')?.classList.add('hidden');$('economyLearnPanel')?.classList.add('hidden');return}
  renderEconomyAllCurrenciesBase();
};
$('convertFromSearch').addEventListener('input',syncCurrencyInputs);$('convertToSearch').addEventListener('input',syncCurrencyInputs);$('convertAmount').addEventListener('input',syncCurrencyInputs);
$('swapCurrencies').onclick=()=>{const from=$('convertFromSearch').value;$('convertFromSearch').value=$('convertToSearch').value;$('convertToSearch').value=from;syncCurrencyInputs()};
$('resetCurrencyWatch').onclick=()=>{watchedCurrencies=['EUR','USD','GBP'];localStorage.setItem('signaltn_watched_currencies',JSON.stringify(watchedCurrencies));renderCurrencyWatch();if(activeEconomy==='fx')renderEconomy()};

/* ===== Correctif comparaison devises v2 ===== */
function activateEconomyTab(tabName){
  activeEconomy=tabName;
  document.querySelectorAll('.economy-tab').forEach(button=>button.classList.toggle('active',button.dataset.economy===tabName));
}

renderCurrencyWatch=function(codes=Object.keys(fxData?.rates||{}).sort()){
  const box=$('currencyWatchChoices');
  if(!box)return;
  box.innerHTML='';
  const priority=['EUR','USD','GBP','CAD','CHF','AED','SAR','QAR','KWD','JPY','CNY','TRY','DZD','MAD','LYD','EGP'];
  priority.filter(code=>codes.includes(code)).forEach(code=>{
    const button=document.createElement('button');
    button.type='button';
    button.className=`currency-chip${watchedCurrencies.includes(code)?' active':''}`;
    button.textContent=code;
    button.title=currencyLabel(code);
    button.onclick=()=>{
      if(watchedCurrencies.includes(code)){
        if(watchedCurrencies.length===1){
          setModuleStatus('economyStatus','Gardez au moins une devise à comparer.','error');
          return;
        }
        watchedCurrencies=watchedCurrencies.filter(item=>item!==code);
      }else{
        if(watchedCurrencies.length>=6){
          setModuleStatus('economyStatus','Vous pouvez comparer jusqu’à 6 devises à la fois. Retirez-en une avant d’en ajouter une autre.','error');
          return;
        }
        watchedCurrencies.push(code);
      }
      localStorage.setItem('signaltn_watched_currencies',JSON.stringify(watchedCurrencies));
      activateEconomyTab('fx');
      renderEconomy();
      setModuleStatus('economyStatus',`${watchedCurrencies.length} devise(s) affichée(s) face au TND. Cliquez à nouveau sur une devise pour la retirer.`,'ok');
    };
    box.appendChild(button);
  });
};

const renderEconomyCompareFixedBase=renderEconomy;
renderEconomy=function(){
  const watchPanel=$('currencyWatchPanel');
  if(watchPanel)watchPanel.classList.toggle('hidden',activeEconomy!=='fx');
  renderEconomyCompareFixedBase();
  if(activeEconomy==='fx'&&watchPanel)watchPanel.classList.remove('hidden');
};

// Les puces de comparaison ne doivent être visibles que dans l'onglet Devises.
document.querySelectorAll('.economy-tab').forEach(button=>{
  const previousHandler=button.onclick;
  button.onclick=async event=>{
    if(previousHandler)await previousHandler.call(button,event);
    const watchPanel=$('currencyWatchPanel');
    if(watchPanel)watchPanel.classList.toggle('hidden',button.dataset.economy!=='fx');
  };
});

// État initial cohérent.
if($('currencyWatchPanel'))$('currencyWatchPanel').classList.toggle('hidden',activeEconomy!=='fx');

/* ================= DÉMARCHES, CARTE ADMINISTRATIVE, AGRICULTURE, LANGUES ================= */
const proceduresCatalog=[
 {id:'passport',keywords:['passeport','passport','جواز'],title:'Passeport',summary:'Préparer et vérifier une demande ou un renouvellement de passeport.',where:'Poste de police',steps:['Consulter les conditions officielles','Vérifier les pièces justificatives actualisées','Préparer les photos et justificatifs demandés','Identifier le poste compétent','Vérifier les frais et horaires','Conserver le reçu de dépôt'],source:'https://services.interieur.gov.tn/wap/fr/docs/demarches/02.html'},
 {id:'cin',keywords:['cin','identite','identité','identity','بطاقة'],title:'Carte d’identité nationale',summary:'Orientation pour une première demande ou un renouvellement de CIN.',where:'Poste de police',steps:['Consulter la fiche officielle','Vérifier les conditions selon votre situation','Préparer les justificatifs','Identifier le poste compétent','Vérifier les horaires avant déplacement'],source:'https://services.interieur.gov.tn/wap/fr/docs/demarches/01.html'},
 {id:'b3',keywords:['bulletin 3','bulletin n 3','casier','criminal record','السوابق'],title:'Bulletin n°3',summary:'Le portail officiel propose notamment une demande en ligne du bulletin n°3.',where:'Poste de police',steps:['Ouvrir la fiche officielle','Vérifier l’éligibilité au service en ligne','Remplir les informations demandées','Effectuer le paiement sur le canal officiel','Conserver le reçu et suivre la délivrance'],source:'https://services.gov.tn/interieur/'},
 {id:'tax',keywords:['recette','finance','impot','impôt','tax','ضريبة'],title:'Démarche fiscale',summary:'Orientation vers une recette des finances ou le service officiel approprié.',where:'Recette des finances',steps:['Identifier la démarche fiscale exacte','Consulter la fiche officielle','Préparer les références et justificatifs','Localiser la recette compétente','Vérifier les heures d’accueil'],source:'https://www.cnam.nat.tn/espace_assure.jsp'},
 {id:'cnam',keywords:['cnam','soin','remboursement','health reimbursement','كنام'],title:'CNAM et remboursement de soins',summary:'Orientation vers les services de santé et de couverture sociale.',where:'CNAM',steps:['Identifier le type de prestation','Consulter les conditions officielles','Préparer les justificatifs médicaux et administratifs','Localiser le bureau compétent','Conserver une copie du dossier'],source:'https://services.gov.tn/'},
 {id:'social',keywords:['cnss','cnrps','retraite','social','ضمان'],title:'Affaires sociales',summary:'Orientation vers la CNSS, la CNRPS ou le service social concerné.',where:'CNSS',steps:['Choisir l’organisme concerné','Vérifier la liste officielle des documents','Préparer votre identifiant et justificatifs','Localiser le bureau proche','Vérifier les horaires'],source:'https://www.cnss.tn/fr/'},
 {id:'justice',keywords:['tribunal','justice','court','محكمة'],title:'Démarche auprès d’un tribunal',summary:'Orientation géographique vers les tribunaux et les services de justice.',where:'Tribunal',steps:['Identifier le type de juridiction','Consulter les informations officielles','Préparer les références du dossier','Localiser le tribunal compétent','Vérifier l’accueil et les horaires'],source:'https://services.gov.tn/services-par-domaine/'},
 {id:'postal',keywords:['poste','postal','courrier','بريد'],title:'Service postal',summary:'Localiser un bureau de poste pour vos opérations postales et financières.',where:'Bureau de poste',steps:['Définir l’opération souhaitée','Préparer la pièce d’identité si nécessaire','Localiser le bureau proche','Vérifier les horaires'],source:'https://services.gov.tn/'}
];
proceduresCatalog.forEach(p=>{const o=document.createElement('option');o.value=p.title;$('procedureSuggestions').appendChild(o)});
let activeProcedure=null;
function findProcedure(){const q=norm($('procedureSearch').value);activeProcedure=proceduresCatalog.find(p=>p.keywords.some(k=>q.includes(norm(k)))||norm(p.title).includes(q));if(!activeProcedure){$('procedureResult').innerHTML='<div class="empty">Démarche non reconnue. Essayez : passeport, CIN, bulletin n°3, CNAM, CNSS, recette des finances ou tribunal.</div>';$('procedureChecklist').innerHTML='<div class="empty">Aucune checklist.</div>';return}$('procedureResult').innerHTML=`<div class="procedure-card"><span class="eyebrow">ORIENTATION</span><h3>${activeProcedure.title}</h3><p>${activeProcedure.summary}</p><p><b>Où commencer :</b> ${activeProcedure.where}</p><a href="${activeProcedure.source}" target="_blank" rel="noopener">Vérifier sur la source officielle →</a></div>`;$('adminFreeSearch').value=activeProcedure.where;renderProcedureChecklist()}
function renderProcedureChecklist(){const saved=JSON.parse(localStorage.getItem('signaltn_procedure_checks')||'{}'),values=saved[activeProcedure.id]||[];$('procedureChecklist').innerHTML='';activeProcedure.steps.forEach((step,i)=>{const row=document.createElement('label');row.className='check-item';row.innerHTML=`<input type="checkbox" ${values.includes(i)?'checked':''}><span></span>`;row.querySelector('span').textContent=step;row.querySelector('input').onchange=()=>{let d=JSON.parse(localStorage.getItem('signaltn_procedure_checks')||'{}'),arr=d[activeProcedure.id]||[];if(row.querySelector('input').checked)arr=[...new Set([...arr,i])];else arr=arr.filter(x=>x!==i);d[activeProcedure.id]=arr;localStorage.setItem('signaltn_procedure_checks',JSON.stringify(d))};$('procedureChecklist').appendChild(row)})}
$('procedureSearchButton').onclick=findProcedure;$('procedureSearch').addEventListener('keydown',e=>{if(e.key==='Enter')findProcedure()});

/* Carte des administrations proches */
let administrationMap=null,administrationMarkers=[];
function adminSelectors(raw){const q=norm(raw);if(q.includes('recette')||q.includes('finance'))return['nwr["office"="tax"]','nwr["name"~"recette.*finance|قباضة مالية",i]'];if(q.includes('poste')||q.includes('postal'))return['nwr["amenity"="post_office"]'];if(q.includes('police'))return['nwr["amenity"="police"]'];if(q.includes('garde'))return['nwr["amenity"="police"]["name"~"garde|حرس",i]'];if(q.includes('tribunal')||q.includes('court'))return['nwr["amenity"="courthouse"]'];if(q.includes('municip'))return['nwr["office"="government"]["government"="local_authority"]','nwr["name"~"municip|بلدية",i]'];if(q.includes('cnss'))return['nwr["name"~"CNSS",i]'];if(q.includes('cnrps'))return['nwr["name"~"CNRPS",i]'];if(q.includes('cnam'))return['nwr["name"~"CNAM",i]'];if(q.includes('emploi'))return['nwr["office"="employment_agency"]','nwr["name"~"emploi|تشغيل",i]'];if(q.includes('consulat'))return['nwr["office"="diplomatic"]'];const safe=raw.replace(/["\\]/g,'').slice(0,50);return[`nwr["name"~"${safe}",i]`]}
function initAdministrationMap(lat=36.8065,lon=10.1815){if(!administrationMap){administrationMap=L.map('administrationMap').setView([lat,lon],12);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(administrationMap)}else administrationMap.setView([lat,lon],13);setTimeout(()=>administrationMap.invalidateSize(),100)}
async function findAdministrations(){const raw=$('adminFreeSearch').value.trim();if(raw.length<2)return setModuleStatus('adminMapStatus','Écrivez un service à rechercher.','error');if(!navigator.geolocation)return setModuleStatus('adminMapStatus','Géolocalisation indisponible.','error');setModuleStatus('adminMapStatus','Localisation puis recherche des établissements…');navigator.geolocation.getCurrentPosition(async pos=>{const lat=pos.coords.latitude,lon=pos.coords.longitude,radius=$('adminRadius').value;initAdministrationMap(lat,lon);administrationMarkers.forEach(m=>administrationMap.removeLayer(m));administrationMarkers=[];const clauses=adminSelectors(raw).map(s=>`${s}(around:${radius},${lat},${lon});`).join('');try{const j=await callOverpassApi(`[out:json][timeout:30];(${clauses});out center tags;`),seen=new Set();const places=j.elements.map(e=>({...e.tags,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon})).filter(x=>x.lat&&x.lon&&!seen.has(`${x.lat}-${x.lon}`)&&seen.add(`${x.lat}-${x.lon}`)).slice(0,30);$('administrationResults').innerHTML='';places.forEach((x,i)=>{const name=x.name||x['name:fr']||x['name:ar']||raw,m=L.marker([x.lat,x.lon]).bindPopup(`<b>${name}</b>`).addTo(administrationMap);administrationMarkers.push(m);const c=document.createElement('article');c.className='admin-card';c.innerHTML='<h3></h3><p></p><a target="_blank" rel="noopener">Itinéraire →</a>';c.querySelector('h3').textContent=name;c.querySelector('p').textContent=[x['addr:street'],x['addr:city'],x.phone].filter(Boolean).join(' • ')||'Coordonnées cartographiques disponibles';c.querySelector('a').href=`https://www.openstreetmap.org/directions?to=${x.lat},${x.lon}`;$('administrationResults').appendChild(c)});setModuleStatus('adminMapStatus',places.length?`${places.length} résultat(s) cartographié(s). Vérifiez l’adresse et les horaires avant de partir.`:'Aucun résultat cartographié dans ce rayon. Essayez 10 ou 20 km.',places.length?'ok':'error')}catch(e){setModuleStatus('adminMapStatus',`Recherche indisponible : ${e.message}`,'error')}},()=>setModuleStatus('adminMapStatus','Position refusée ou indisponible.','error'),{enableHighAccuracy:true,timeout:12000,maximumAge:300000})}
$('findAdminButton').onclick=findAdministrations;

/* Agriculture */
let currentAgriLocation=null,agriChart=null;
async function loadAgriculture(lat,lon,label){currentAgriLocation={lat,lon,label};setModuleStatus('agriStatus',`Chargement des prévisions pour ${label}…`);const vars='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,et0_fao_evapotranspiration';const hourly='soil_moisture_0_to_1cm,soil_moisture_9_to_27cm,soil_temperature_6cm,relative_humidity_2m';try{const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${vars}&hourly=${hourly}&timezone=auto&forecast_days=7`);if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json(),daily=d.daily,soil=d.hourly.soil_moisture_9_to_27cm.filter(v=>v!=null),humid=d.hourly.relative_humidity_2m.filter(v=>v!=null);const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(a.length,1),max=Math.max(...daily.temperature_2m_max),rain=daily.precipitation_sum.reduce((a,b)=>a+b,0),wind=Math.max(...daily.wind_speed_10m_max),moist=avg(soil);$('agriKpis').innerHTML='';[[`${max.toFixed(1)} °C`,'Max 7 jours'],[`${rain.toFixed(1)} mm`,'Pluie cumulée'],[`${wind.toFixed(0)} km/h`,'Vent max'],[`${moist.toFixed(3)} m³/m³`,'Humidité moyenne du sol']].forEach(([v,l])=>{const a=document.createElement('article');a.innerHTML=`<b>${v}</b><small>${l}</small>`;$('agriKpis').appendChild(a)});if(agriChart)agriChart.destroy();agriChart=new Chart($('agriChart'),{type:'line',data:{labels:daily.time,datasets:[{label:'Temp. max °C',data:daily.temperature_2m_max,borderColor:'#c1122f'},{label:'Pluie mm',data:daily.precipitation_sum,borderColor:'#16846d'}]},options:{responsive:true,maintainAspectRatio:false}});const alerts=[];if(max>=38)alerts.push(['danger','🔥 Forte chaleur prévue : maximum ≥ 38 °C.']);if(wind>=45)alerts.push(['warning','💨 Vent fort prévu : rafales/modèle ≥ 45 km/h.']);if(rain>=25)alerts.push(['warning','🌧️ Cumul de pluie notable sur 7 jours.']);if(moist<0.15)alerts.push(['warning','💧 Humidité modélisée du sol faible. Vérifiez sur le terrain.']);if(!alerts.length)alerts.push(['','✅ Aucun seuil d’alerte local dépassé.']);$('agriAlerts').innerHTML=alerts.map(([c,t])=>`<div class="agri-alert ${c}">${t}</div>`).join('');setModuleStatus('agriStatus',`Données agricoles chargées pour ${label}.`,'ok');renderParcels()}catch(e){setModuleStatus('agriStatus',`Données indisponibles : ${e.message}`,'error')}}
$('agriSearchButton').onclick=async()=>{const q=$('agriLocationSearch').value.trim();if(!q)return;setModuleStatus('agriStatus','Recherche de la localité…');try{const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=fr&format=json&countryCode=TN`),d=await r.json(),x=d.results?.[0];if(!x)throw new Error('Localité tunisienne introuvable');loadAgriculture(x.latitude,x.longitude,x.name)}catch(e){setModuleStatus('agriStatus',e.message,'error')}};$('agriGpsButton').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>loadAgriculture(p.coords.latitude,p.coords.longitude,'Ma position'),()=>setModuleStatus('agriStatus','Position indisponible.','error'));
function renderParcels(){const data=JSON.parse(localStorage.getItem('signaltn_parcels')||'[]');$('parcelList').innerHTML=data.length?'':'<div class="empty">Aucune parcelle enregistrée.</div>';data.forEach((x,i)=>{const c=document.createElement('article');c.className='parcel-card';c.innerHTML='<b></b><p></p><button class="ghost-button">Charger</button> <button class="ghost-button">Supprimer</button>';c.querySelector('b').textContent=x.name;c.querySelector('p').textContent=x.crop||'Culture non précisée';c.querySelectorAll('button')[0].onclick=()=>loadAgriculture(x.lat,x.lon,x.name);c.querySelectorAll('button')[1].onclick=()=>{data.splice(i,1);localStorage.setItem('signaltn_parcels',JSON.stringify(data));renderParcels()};$('parcelList').appendChild(c)})}
$('saveParcelButton').onclick=()=>{if(!currentAgriLocation)return setModuleStatus('agriStatus','Chargez d’abord une localité.','error');const name=$('parcelName').value.trim();if(!name)return;const d=JSON.parse(localStorage.getItem('signaltn_parcels')||'[]');d.push({...currentAgriLocation,name,crop:$('parcelCrop').value.trim()});localStorage.setItem('signaltn_parcels',JSON.stringify(d));$('parcelName').value='';$('parcelCrop').value='';renderParcels()};renderParcels();

/* Pharmacies de garde : recherche proche + avertissement */
$('findOnCallPharmacy').onclick=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(async p=>{const radius=10000,q=`[out:json][timeout:25];(nwr["amenity"="pharmacy"](around:${radius},${p.coords.latitude},${p.coords.longitude}););out center tags;`;$('onCallNotice').className='notice';$('onCallNotice').textContent='Recherche des pharmacies proches…';try{const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)}),j=await r.json();const places=j.elements.map(e=>({...e.tags,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon})).filter(x=>x.lat).slice(0,15);$('onCallResults').innerHTML='';places.forEach(x=>{const c=document.createElement('article');c.className='health-place';const phone=x.phone||x['contact:phone'];c.innerHTML='<h3></h3><p>Pharmacie proche — garde non confirmée. Appelez avant de partir.</p><div class="health-place-actions"></div>';c.querySelector('h3').textContent=x.name||'Pharmacie';const actions=c.querySelector('div');if(phone){const a=document.createElement('a');a.href=`tel:${phone}`;a.textContent='📞 Appeler pour confirmer';actions.appendChild(a)}const m=document.createElement('a');m.href=`https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lon}#map=17/${x.lat}/${x.lon}`;m.target='_blank';m.rel='noopener';m.textContent='Itinéraire';actions.appendChild(m);$('onCallResults').appendChild(c)});$('onCallNotice').textContent=`${places.length} pharmacie(s) proche(s). La garde n’est pas confirmée automatiquement.`}catch(e){$('onCallNotice').className='notice error';$('onCallNotice').textContent=e.message}},()=>{$('onCallNotice').className='notice error';$('onCallNotice').textContent='Position indisponible.'})};

/* Traductions principales FR / EN / AR */
const i18n={fr:{navProcedures:'Mes démarches',navAgriculture:'Agriculture',navMap:'Carte nationale',proceduresShort:'Assistant et administrations proches',agricultureShort:'Météo agricole et parcelles',proceduresEyebrow:'ASSISTANT ADMINISTRATIF TUNISIEN',proceduresTitle:'Mes démarches',proceduresIntro:'Recherchez une démarche, créez votre checklist et trouvez où la réaliser autour de vous.',assistantTitle:'Que souhaitez-vous faire ?',search:'Rechercher',myChecklist:'Ma checklist',chooseProcedure:'Choisissez une démarche.',whereEyebrow:'OÙ FAIRE CETTE DÉMARCHE ?',findAdministration:'Trouver une administration proche',mapPrivacy:'La localisation est utilisée uniquement dans votre navigateur.',nearMe:'Autour de moi',adminMapReady:'Choisissez un service puis autorisez la localisation.',officialInfo:'Information administrative :',officialDisclaimer:'vérifiez toujours les documents et conditions sur le portail officiel avant de vous déplacer.',agriEyebrow:'AGRICULTURE & MÉTÉO AGRICOLE',agriTitle:'Tableau de bord agricole',agriIntro:'Prévisions météo, humidité du sol, évapotranspiration et alertes transparentes.',searchLocation:'Rechercher',useGps:'Utiliser ma position',agriReady:'Choisissez une localité pour charger les données agricoles.',agriForecast:'Prévisions sur 7 jours',agriAlerts:'Alertes explicables',myParcels:'Mes parcelles',parcelPrivacy:'Enregistrées uniquement dans ce navigateur.',saveParcel:'Enregistrer la position courante',agriDisclaimer:'Prévisions modélisées, non conseils agronomiques.',onCallEyebrow:'PHARMACIES DE GARDE',onCallTitle:'Trouver et vérifier avant de partir',onCallWarning:'La liste officielle disponible peut être ancienne. Appelez toujours avant de partir.',findPharmacy:'Trouver autour de moi',officialList:'Consulter la liste officielle'},en:{navProcedures:'My procedures',navAgriculture:'Agriculture',navMap:'National map',proceduresShort:'Assistant and nearby offices',agricultureShort:'Farm weather and plots',proceduresEyebrow:'TUNISIAN ADMINISTRATIVE ASSISTANT',proceduresTitle:'My procedures',proceduresIntro:'Search for a procedure, create a checklist and find nearby offices.',assistantTitle:'What do you need to do?',search:'Search',myChecklist:'My checklist',chooseProcedure:'Choose a procedure.',whereEyebrow:'WHERE CAN I DO THIS?',findAdministration:'Find a nearby public office',mapPrivacy:'Your location is used only in your browser.',nearMe:'Near me',adminMapReady:'Choose a service and allow location access.',officialInfo:'Administrative information:',officialDisclaimer:'always verify documents and conditions on the official portal.',agriEyebrow:'AGRICULTURE & FARM WEATHER',agriTitle:'Agricultural dashboard',agriIntro:'Weather forecasts, soil moisture, evapotranspiration and transparent alerts.',searchLocation:'Search',useGps:'Use my location',agriReady:'Choose a location to load agricultural data.',agriForecast:'7-day forecast',agriAlerts:'Explainable alerts',myParcels:'My plots',parcelPrivacy:'Saved only in this browser.',saveParcel:'Save current location',agriDisclaimer:'Modelled forecasts, not agronomic advice.',onCallEyebrow:'ON-CALL PHARMACIES',onCallTitle:'Find and verify before leaving',onCallWarning:'The available official list may be outdated. Always call before leaving.',findPharmacy:'Find near me',officialList:'Official list'},ar:{navProcedures:'إجراءاتي',navAgriculture:'الفلاحة',navMap:'الخريطة الوطنية',proceduresShort:'مساعد وإدارات قريبة',agricultureShort:'الطقس الفلاحي والضيعات',proceduresEyebrow:'المساعد الإداري التونسي',proceduresTitle:'إجراءاتي الإدارية',proceduresIntro:'ابحث عن إجراء وأنشئ قائمة وتعرّف على أقرب إدارة.',assistantTitle:'ما هو الإجراء المطلوب؟',search:'بحث',myChecklist:'قائمتي',chooseProcedure:'اختر إجراءً.',whereEyebrow:'أين أقوم بهذا الإجراء؟',findAdministration:'العثور على إدارة قريبة',mapPrivacy:'يتم استعمال موقعك داخل المتصفح فقط.',nearMe:'بالقرب مني',adminMapReady:'اختر خدمة ثم اسمح بتحديد الموقع.',officialInfo:'معلومة إدارية:',officialDisclaimer:'تحقق دائماً من الوثائق والشروط في البوابة الرسمية.',agriEyebrow:'الفلاحة والطقس الفلاحي',agriTitle:'لوحة المتابعة الفلاحية',agriIntro:'توقعات الطقس ورطوبة التربة والتبخر وتنبيهات واضحة.',searchLocation:'بحث',useGps:'استعمال موقعي',agriReady:'اختر منطقة لتحميل البيانات الفلاحية.',agriForecast:'توقعات 7 أيام',agriAlerts:'تنبيهات مفسّرة',myParcels:'ضيعاتي',parcelPrivacy:'محفوظة في هذا المتصفح فقط.',saveParcel:'حفظ الموقع الحالي',agriDisclaimer:'توقعات نموذجية وليست نصائح فلاحية.',onCallEyebrow:'صيدليات المناوبة',onCallTitle:'ابحث واتصل قبل التنقل',onCallWarning:'قد تكون القائمة الرسمية المتاحة قديمة. اتصل دائماً قبل التنقل.',findPharmacy:'البحث بالقرب مني',officialList:'القائمة الرسمية'}};
function setLanguage(lang){localStorage.setItem('signaltn_lang',lang);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));document.querySelectorAll('[data-i18n]').forEach(el=>{const v=i18n[lang]?.[el.dataset.i18n];if(v)el.textContent=v})}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>setLanguage(b.dataset.lang));setLanguage(localStorage.getItem('signaltn_lang')||'fr');

const proceduresAgriShowPage=showPage;showPage=function(name){proceduresAgriShowPage(name);if(name==='procedures'&&administrationMap)setTimeout(()=>administrationMap.invalidateSize(),150);if(name==='agriculture')renderParcels()};

/* ===== Actualités mobile : proxy Vercel same-origin obligatoire ===== */
loadNews=async function(){
  const q=$('newsQuery').value.trim()||'Tunisie';
  $('newsNotice').className='notice';
  $('newsNotice').textContent='Chargement des actualités…';
  $('newsGrid').innerHTML='';
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    const response=await fetch(`/api/news?q=${encodeURIComponent(q)}`,{signal:controller.signal,headers:{Accept:'application/json'}});
    clearTimeout(timer);
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.includes('application/json'))throw new Error('La fonction Vercel /api/news n’est pas déployée. Importez le dossier complet, avec api et vercel.json.');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||`Erreur HTTP ${response.status}`);
    const articles=data.articles||[];
    if(!articles.length)throw new Error('Aucun article trouvé pour cette recherche.');
    articles.forEach(article=>{
      const card=document.createElement('article');card.className='news-card';
      card.innerHTML='<small></small><h3></h3><p></p><a target="_blank" rel="noopener">Lire la source →</a>';
      card.querySelector('small').textContent=`${article.domain||'Source'} • ${article.seendate||''}`;
      card.querySelector('h3').textContent=article.title||'Article';
      card.querySelector('p').textContent=`Source agrégée : ${data.source||'Actualités'}`;
      card.querySelector('a').href=article.url;
      $('newsGrid').appendChild(card);
    });
    $('newsNotice').className='notice';
    $('newsNotice').textContent=`${articles.length} article(s) chargé(s) via ${data.source||'le serveur'}.`;
  }catch(error){
    $('newsNotice').className='notice error';
    $('newsNotice').textContent=error.name==='AbortError'?'Le chargement est trop long. Réessayez dans quelques secondes.':error.message;
  }
};
$('newsSearchButton').onclick=loadNews;

/* ===== Recherche santé via serveur Vercel : compatible mobile et production ===== */
async function fetchOverpassFromServer(query){
  const response=await fetch('/api/overpass',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query})});
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))throw new Error('La fonction /api/overpass n’est pas déployée. Redéployez le dossier complet.');
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Erreur HTTP ${response.status}`);
  return data;
}

findNearbyHealth=async function(){
  const raw=$('healthFreeSearch').value.trim();
  if(raw.length<2)return healthMessage('Écrivez au moins 2 caractères.',true);
  if(!navigator.geolocation)return healthMessage('La géolocalisation n’est pas disponible.',true);
  $('locateHealthButton').disabled=true;$('locateHealthButton').textContent='Localisation…';
  navigator.geolocation.getCurrentPosition(async position=>{
    const lat=position.coords.latitude,lon=position.coords.longitude,radius=$('healthRadius').value,config=buildFreeHealthSelectors(raw);
    healthMessage(`Recherche de « ${config.label} » dans un rayon de ${Number(radius)/1000} km…`);
    const clauses=config.selectors.map(selector=>`${selector}(around:${radius},${lat},${lon});`).join('');
    const query=`[out:json][timeout:25];(${clauses});out center tags;`;
    try{
      const json=await fetchOverpassFromServer(query),seen=new Set();
      const places=(json.elements||[]).map(element=>{const plat=element.lat??element.center?.lat,plon=element.lon??element.center?.lon;return{...element.tags,lat:plat,lon:plon,distance:plat&&plon?distanceKm(lat,lon,plat,plon):999}}).filter(place=>{const key=`${place.name||''}-${place.lat}-${place.lon}`;if(!place.lat||!place.lon||seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>a.distance-b.distance).slice(0,24);
      renderHealthPlaces(places);
      healthMessage(places.length?`${places.length} résultat(s) trouvé(s) pour « ${config.label} ».`:`Aucun résultat cartographié. Essayez 10 ou 20 km.`,!places.length);
    }catch(error){healthMessage(`Recherche indisponible : ${error.message}`,true)}
    finally{$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Rechercher autour de moi'}
  },()=>{healthMessage('Position refusée ou indisponible.',true);$('locateHealthButton').disabled=false;$('locateHealthButton').textContent='Rechercher autour de moi'},{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
};
$('locateHealthButton').onclick=findNearbyHealth;

$('findOnCallPharmacy').onclick=()=>{
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(async position=>{
    const lat=position.coords.latitude,lon=position.coords.longitude;
    const query=`[out:json][timeout:25];(nwr["amenity"="pharmacy"](around:10000,${lat},${lon}););out center tags;`;
    $('onCallNotice').className='notice';$('onCallNotice').textContent='Recherche des pharmacies proches…';
    try{
      const json=await fetchOverpassFromServer(query);
      const places=(json.elements||[]).map(element=>({...element.tags,lat:element.lat??element.center?.lat,lon:element.lon??element.center?.lon})).filter(place=>place.lat&&place.lon).slice(0,15);
      $('onCallResults').innerHTML='';
      places.forEach(place=>{const card=document.createElement('article');card.className='health-place';const phone=place.phone||place['contact:phone'];card.innerHTML='<h3></h3><p>Pharmacie proche — garde non confirmée. Appelez avant de partir.</p><div class="health-place-actions"></div>';card.querySelector('h3').textContent=place.name||'Pharmacie';const actions=card.querySelector('.health-place-actions');if(phone){const call=document.createElement('a');call.href=`tel:${phone}`;call.textContent='📞 Appeler pour confirmer';actions.appendChild(call)}const map=document.createElement('a');map.href=`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;map.target='_blank';map.rel='noopener';map.textContent='Itinéraire';actions.appendChild(map);$('onCallResults').appendChild(card)});
      $('onCallNotice').textContent=`${places.length} pharmacie(s) proche(s). La garde n’est pas confirmée automatiquement.`;
    }catch(error){$('onCallNotice').className='notice error';$('onCallNotice').textContent=`Recherche indisponible : ${error.message}`}
  },()=>{$('onCallNotice').className='notice error';$('onCallNotice').textContent='Position refusée ou indisponible.'});
};

/* ================= MES DEMARCHES INTELLIGENTES V2 ================= */
const procedureCategoriesV2=[['identity','🪪','Identité','CIN, passeport, naissance'],['family','👶','Famille','Naissance, mariage, enfants'],['vehicle','🚗','Véhicule','Permis, carte grise, visite'],['health','🏥','Santé & social','CNAM, CNSS, retraite'],['justice','⚖️','Justice','Bulletin n°3, tribunal'],['finance','💰','Finances','Impôts, recettes, entreprise']];
const procedureCatalogV2=[
{id:'passport',category:'identity',title:'Passeport tunisien',keywords:['passeport','passport','جواز'],icon:'🛂',where:'Poste de police',source:'https://services.gov.tn/interieur/',questions:[{id:'request',label:'Quel est votre cas ?',options:[['first','Première demande'],['renew','Renouvellement'],['lost','Perte ou vol'],['damaged','Passeport détérioré']]},{id:'age',label:'Pour qui ?',options:[['adult','Personne majeure'],['minor','Personne mineure']]},{id:'residence',label:'Lieu de résidence',options:[['tn','En Tunisie'],['abroad','À l’étranger']]}],documents:['Pièce d’identité ou justificatif d’identité','Formulaire ou demande requis par l’administration','Photographies d’identité conformes','Justificatif de situation professionnelle ou scolaire, si demandé','Ancien passeport en cas de renouvellement','Déclaration ou justificatif spécifique en cas de perte/vol'],steps:['Identifier exactement le type de demande','Vérifier la liste actualisée des pièces selon votre situation','Préparer les originaux et copies nécessaires','Identifier le poste de police ou consulat compétent','Vérifier les horaires, frais et présence obligatoire','Déposer le dossier et conserver le reçu','Suivre la demande et récupérer le passeport'],facts:[['Administration','Police / Garde / Consulat'],['Délai indicatif','15 jours'],['Photos','4 — 3,5 × 4,5 cm'],['Timbre','Selon profil et résidence']]},
{id:'cin',category:'identity',title:'Carte d’identité nationale',keywords:['cin','identité','identite','بطاقة'],icon:'🪪',where:'Poste de police',source:'https://services.gov.tn/interieur/',questions:[{id:'request',label:'Type de demande',options:[['first','Première demande'],['renew','Renouvellement'],['lost','Perte / duplicata']]},{id:'age',label:'Situation',options:[['adult','Personne majeure'],['young','Jeune demandeur']]},{id:'residence',label:'Résidence',options:[['tn','En Tunisie'],['abroad','À l’étranger']]}],documents:['Justificatif d’identité ou d’état civil','Photographies conformes','Justificatif de résidence, si demandé','Justificatif professionnel ou scolaire, selon la situation','Ancienne carte pour un renouvellement','Déclaration de perte pour un duplicata'],steps:['Choisir première demande, renouvellement ou duplicata','Vérifier les conditions correspondant à votre situation','Préparer les pièces et copies','Localiser le service compétent','Déposer personnellement le dossier si exigé','Conserver le reçu et suivre la délivrance'],facts:[['Administration','Police / Garde'],['Délai indicatif','15 jours'],['Photos','3 photos 3 × 4 cm'],['Extrait naissance','Moins de 3 mois']]},
{id:'b3',category:'justice',title:'Bulletin n°3 / Casier judiciaire',keywords:['bulletin 3','bulletin n°3','casier','b3','السوابق'],icon:'📄',where:'Poste de police',source:'https://b3.interieur.gov.tn/demande',questions:[{id:'channel',label:'Comment souhaitez-vous procéder ?',options:[['online','Demande en ligne'],['desk','Auprès d’un service']]},{id:'residence',label:'Où résidez-vous ?',options:[['tn','En Tunisie'],['abroad','À l’étranger']]},{id:'beneficiary',label:'Pour qui ?',options:[['self','Pour moi-même'],['info','Je vérifie les conditions']]}],documents:['Informations d’identité exactes du demandeur','Moyen de paiement électronique pour la demande en ligne','Adresse et coordonnées de remise','Reçu de paiement à conserver'],steps:['Remplir le formulaire officiel','Vérifier soigneusement les informations déclarées','Payer les droits du service sur le canal officiel','Imprimer ou conserver le reçu','Suivre l’émission de la carte n°3','Réception par le titulaire selon les conditions officielles'],facts:[['Service','Demande en ligne'],['Parcours','4 étapes'],['Paiement','Carte ou e-Dinar'],['Exemplaires','1 à 3']]},
{id:'cnam',category:'health',title:'Remboursement de soins CNAM',keywords:['cnam','remboursement','soins','كنام'],icon:'🏥',where:'CNAM',source:'https://services.gov.tn/services-par-domaine/',questions:[{id:'scheme',label:'Votre régime',options:[['private','Salarié du privé'],['public','Agent public'],['other','Autre situation']]},{id:'care',label:'Type de demande',options:[['refund','Remboursement de soins'],['card','Carte de soins'],['info','Information / suivi']]},{id:'person',label:'Bénéficiaire',options:[['self','Assuré'],['family','Ayant droit / famille']]}],documents:['Carte ou identifiant de l’assuré','Feuille ou justificatif de soins','Ordonnances et factures selon le dossier','Coordonnées bancaires si requises','Justificatifs du bénéficiaire ou ayant droit'],steps:['Identifier le type exact de prestation','Vérifier le régime et l’éligibilité','Faire compléter les documents médicaux nécessaires','Rassembler factures, ordonnances et justificatifs','Déposer auprès du bureau compétent ou canal disponible','Conserver une copie et suivre le traitement'],facts:[['Organisme','CNAM'],['Remboursement','Dépôt sous 60 jours'],['Filières','Publique / privée / remboursement'],['Suivi','Disponible en ligne']]},
{id:'social',category:'health',title:'Affiliation CNSS / CNRPS',keywords:['cnss','cnrps','affiliation','social','ضمان'],icon:'🧾',where:'CNSS',source:'https://services.gov.tn/services-par-domaine/',questions:[{id:'sector',label:'Votre secteur',options:[['private','Secteur privé'],['public','Secteur public'],['independent','Indépendant']]},{id:'request',label:'Votre besoin',options:[['affiliate','Première affiliation'],['certificate','Attestation'],['update','Mise à jour du dossier']]},{id:'person',label:'Dossier',options:[['self','Personnel'],['employer','Employeur']] }],documents:['Pièce d’identité','Justificatif professionnel ou contrat','Formulaire de l’organisme concerné','Documents de l’employeur, si applicables','Justificatifs complémentaires selon le statut'],steps:['Identifier l’organisme compétent : CNSS ou CNRPS','Vérifier la procédure liée à votre statut','Préparer les documents personnels et professionnels','Localiser le bureau compétent','Déposer la demande et conserver la preuve','Suivre l’affiliation ou récupérer l’attestation'],facts:[['Organisme','CNSS / CNRPS'],['Public','Selon le secteur'],['Frais','À vérifier'],['Délai','Variable']]},
{id:'retirement',category:'health',title:'Préparer ma retraite',keywords:['retraite','pension','تقاعد'],icon:'👵',where:'CNRPS',source:'https://affilie.cnrps.nat.tn/login',questions:[{id:'sector',label:'Votre secteur',options:[['private','Privé'],['public','Public'],['independent','Indépendant']]},{id:'stage',label:'Votre besoin',options:[['prepare','Préparer le dossier'],['estimate','Vérifier ma carrière'],['claim','Déposer la demande']]},{id:'timing',label:'Échéance',options:[['soon','Moins d’un an'],['later','Plus d’un an']]}],documents:['Pièce d’identité','Relevé ou justificatifs de carrière','Attestations de travail ou de cotisations','Coordonnées bancaires, si requises','Documents d’état civil selon la situation'],steps:['Identifier la caisse compétente','Vérifier les périodes de cotisation enregistrées','Signaler et documenter les périodes manquantes','Vérifier les conditions d’âge et de carrière','Préparer le dossier avant l’échéance','Déposer la demande et suivre son traitement'],facts:[['Organisme','CNSS / CNRPS'],['Anticipation','Recommandée'],['Calcul','Selon carrière'],['Délai','À vérifier']]},
{id:'driver',category:'vehicle',title:'Permis de conduire',keywords:['permis','conduire','driver'],icon:'🚘',where:'Bureau de poste',source:'https://services.gov.tn/services-par-domaine/',questions:[{id:'request',label:'Type de demande',options:[['first','Premier permis'],['renew','Renouvellement'],['duplicate','Duplicata']]},{id:'license',label:'Catégorie',options:[['car','Voiture'],['motorcycle','Moto'],['other','Autre']]},{id:'status',label:'Situation',options:[['ready','Dossier à préparer'],['exam','Examen / formation']]}],documents:['Pièce d’identité','Formulaire correspondant à la demande','Photographies conformes','Justificatif médical si exigé','Ancien permis pour renouvellement','Déclaration de perte pour duplicata'],steps:['Choisir la catégorie et le type de demande','Vérifier les conditions d’âge et d’aptitude','Préparer les pièces et examens requis','Identifier le service ou organisme compétent','Effectuer le dépôt et paiement sur le canal indiqué','Conserver le reçu et suivre la délivrance'],facts:[['Domaine','Transport'],['Examen','Selon la demande'],['Frais','À vérifier'],['Délai','Variable']]},
{id:'tax',category:'finance',title:'Démarche fiscale',keywords:['impôt','impot','taxe','recette','finance','ضريبة'],icon:'💳',where:'Recette des finances',source:'https://services.gov.tn/services-par-domaine/',questions:[{id:'person',label:'Vous agissez comme',options:[['individual','Particulier'],['business','Entreprise'],['independent','Indépendant']]},{id:'request',label:'Votre besoin',options:[['pay','Paiement'],['certificate','Attestation'],['declare','Déclaration / régularisation']]},{id:'channel',label:'Canal souhaité',options:[['online','En ligne si disponible'],['desk','Sur place']]}],documents:['Pièce d’identité ou identifiant fiscal','Références de la déclaration ou taxe','Justificatifs liés à l’opération','Moyen de paiement accepté','Mandat ou documents de l’entreprise, si applicables'],steps:['Identifier précisément l’impôt, taxe ou attestation','Vérifier le service et la recette compétente','Préparer les références fiscales','Vérifier si un service en ligne existe','Effectuer la déclaration ou le paiement','Conserver le reçu et la preuve de l’opération'],facts:[['Administration','Recette des finances'],['En ligne','Selon le service'],['Frais','Selon opération'],['Reçu','À conserver']]},
{id:'employment',category:'finance',title:'Inscription au bureau de l’emploi',keywords:['emploi','aneti','travail','chômage'],icon:'💼',where:"Bureau de l'emploi",source:'https://services.gov.tn/services-selon-les-evenements-de-la-vie/',questions:[{id:'status',label:'Votre situation',options:[['graduate','Jeune diplômé'],['search','Demandeur d’emploi'],['change','Changement professionnel']]},{id:'request',label:'Votre besoin',options:[['register','Première inscription'],['update','Actualiser le dossier'],['program','Programme / formation']]},{id:'channel',label:'Préférence',options:[['online','Commencer en ligne'],['desk','Me déplacer']] }],documents:['Pièce d’identité','Diplômes et attestations','CV à jour','Justificatifs d’expérience','Documents demandés pour le programme choisi'],steps:['Créer ou actualiser votre profil','Préparer CV, diplômes et attestations','Identifier le bureau territorialement compétent','Vérifier les programmes adaptés','Effectuer l’inscription ou le dépôt','Conserver les identifiants et suivre les convocations'],facts:[['Organisme','Emploi / ANETI'],['Profil','À actualiser'],['Frais','Généralement aucun'],['Suivi','Régulier']]},
{id:'birth',category:'family',title:'Extrait de naissance',keywords:['naissance','extrait','état civil','etat civil','ولادة'],icon:'👶',where:'Municipalité',source:'https://services.gov.tn/services-par-domaine/',questions:[{id:'person',label:'Pour qui ?',options:[['self','Pour moi'],['child','Pour mon enfant'],['other','Pour un proche']]},{id:'format',label:'Format souhaité',options:[['paper','Document papier'],['online','Service en ligne si disponible']]},{id:'use',label:'Utilisation',options:[['local','En Tunisie'],['abroad','À l’étranger']] }],documents:['Informations exactes d’état civil','Pièce d’identité du demandeur','Justificatif du lien ou mandat si nécessaire','Références complémentaires selon l’usage'],steps:['Vérifier l’orthographe exacte des informations','Identifier la municipalité ou le service d’état civil','Choisir le format et le nombre d’exemplaires','Déposer ou effectuer la demande disponible','Vérifier immédiatement les informations du document','Conserver une copie numérique si utile'],facts:[['Administration','Municipalité'],['Domaine','État civil'],['Frais','À vérifier'],['Délai','Souvent court']]},
{id:'court',category:'justice',title:'Trouver le tribunal compétent',keywords:['tribunal','justice','affaire','محكمة'],icon:'⚖️',where:'Tribunal',source:'https://services.gov.tn/justice/',questions:[{id:'matter',label:'Nature générale',options:[['civil','Affaire civile'],['family','Famille'],['administrative','Administratif'],['other','Autre']]},{id:'stage',label:'Votre besoin',options:[['locate','Localiser le tribunal'],['follow','Suivre une affaire'],['document','Obtenir un document']]},{id:'role',label:'Votre situation',options:[['person','Particulier'],['business','Organisation']] }],documents:['Pièce d’identité','Références de l’affaire si elle existe','Convocation ou jugement disponible','Documents justificatifs liés à la demande','Mandat si vous agissez pour une autre personne'],steps:['Identifier la nature générale de l’affaire','Repérer le type de juridiction concerné','Vérifier la compétence territoriale','Préparer les références et documents','Vérifier l’accueil et les horaires','Se renseigner auprès d’un professionnel si la situation l’exige'],facts:[['Domaine','Justice'],['Juridiction','Selon affaire'],['Conseil','Selon complexité'],['Horaires','À vérifier']]}
];
let advancedProcedure=null,advancedAnswers={},advancedChecked=[];
function renderProcedureDiscovery(){const cats=$('procedureCategories'),popular=$('procedurePopular');if(!cats||!popular)return;cats.innerHTML='';procedureCategoriesV2.forEach(([id,icon,title,sub])=>{const b=document.createElement('button');b.className='procedure-category';b.innerHTML=`<span>${icon}</span><b>${title}</b><small>${sub}</small>`;b.onclick=()=>{document.querySelectorAll('.procedure-category').forEach(x=>x.classList.toggle('active',x===b));renderProcedurePopular(id)};cats.appendChild(b)});renderProcedurePopular();$('procedureSuggestions').innerHTML='';procedureCatalogV2.forEach(p=>{const o=document.createElement('option');o.value=p.title;$('procedureSuggestions').appendChild(o)})}
function renderProcedurePopular(category=''){const box=$('procedurePopular');box.innerHTML='';procedureCatalogV2.filter(p=>!category||p.category===category).forEach(p=>{const b=document.createElement('button');b.textContent=`${p.icon} ${p.title}`;b.onclick=()=>startAdvancedProcedure(p);box.appendChild(b)})}
function searchAdvancedProcedure(){const q=norm($('procedureSearch').value);const p=procedureCatalogV2.find(x=>norm(x.title).includes(q)||x.keywords.some(k=>q.includes(norm(k))||norm(k).includes(q)));if(!p){$('procedureWizard').classList.remove('hidden');$('wizardTitle').textContent='Démarche non reconnue';$('wizardSubtitle').textContent='Essayez : passeport, CIN, bulletin n°3, CNAM, emploi, retraite, permis ou impôts.';$('wizardQuestions').innerHTML='';$('generateProcedureButton').classList.add('hidden');return}startAdvancedProcedure(p)}
function startAdvancedProcedure(p){advancedProcedure=p;advancedAnswers={};advancedChecked=[];$('procedureSearch').value=p.title;$('procedureWizard').classList.remove('hidden');$('procedureWorkspace').classList.add('hidden');$('generateProcedureButton').classList.remove('hidden');$('wizardTitle').textContent=`${p.icon} ${p.title}`;$('wizardSubtitle').textContent='Répondez aux questions pour adapter la fiche à votre situation.';const box=$('wizardQuestions');box.innerHTML='';p.questions.forEach((q,qi)=>{const card=document.createElement('div');card.className='wizard-question';card.innerHTML=`<label>${q.label}</label><div class="wizard-options"></div>`;q.options.forEach(([value,label],i)=>{const row=document.createElement('label');row.className='wizard-option';row.innerHTML=`<input type="radio" name="proc-${q.id}" value="${value}" ${i===0?'checked':''}><span>${label}</span>`;row.querySelector('input').onchange=e=>advancedAnswers[q.id]=e.target.value;card.querySelector('.wizard-options').appendChild(row);if(i===0)advancedAnswers[q.id]=value});box.appendChild(card)});$('procedureWizard').scrollIntoView({behavior:'smooth',block:'start'})}
function answerLabels(){if(!advancedProcedure)return[];return advancedProcedure.questions.map(q=>{const opt=q.options.find(x=>x[0]===advancedAnswers[q.id]);return opt?opt[1]:''}).filter(Boolean)}
function personalizedDocuments(){let docs=[...advancedProcedure.documents];if(advancedAnswers.request==='first')docs.unshift('Justificatif requis pour une première demande');if(advancedAnswers.request==='renew')docs.unshift('Ancien document à renouveler');if(advancedAnswers.request==='lost')docs.unshift('Déclaration de perte ou de vol');if(advancedAnswers.age==='minor')docs.splice(1,0,'Pièces et autorisation du représentant légal');if(advancedAnswers.residence==='abroad')docs.push('Justificatifs et modalités du consulat compétent');return [...new Set(docs)]}
function generateAdvancedProcedure(){if(!advancedProcedure)return;const docs=personalizedDocuments();$('procedureWizard').classList.add('hidden');$('procedureWorkspace').classList.remove('hidden');$('procedureBadge').textContent=procedureCategoriesV2.find(x=>x[0]===advancedProcedure.category)?.[2].toUpperCase()||'DÉMARCHE';$('procedureDetailTitle').textContent=`${advancedProcedure.icon} ${advancedProcedure.title}`;$('procedureSituation').textContent=`Votre situation : ${answerLabels().join(' • ')}`;$('procedureFacts').innerHTML=advancedProcedure.facts.map(([l,v])=>`<div class="procedure-fact"><small>${l}</small><b>${v}</b></div>`).join('');$('procedureDocumentsPanel').innerHTML=docs.map((d,i)=>`<label class="document-item"><input type="checkbox" data-doc="${i}"><div><b>${d}</b><small>Préparez l’original et une copie si l’administration le demande.</small><span class="verification-tag">À VÉRIFIER SUR LA SOURCE OFFICIELLE</span></div></label>`).join('');$('procedureStepsPanel').innerHTML=advancedProcedure.steps.map((s,i)=>`<div class="procedure-step"><span class="step-number">${i+1}</span><div><b>${s}</b><p>${i===0?'Cette étape permet d’éviter un déplacement inutile.':'Conservez toute preuve ou référence obtenue.'}</p></div></div>`).join('');$('procedurePracticalPanel').innerHTML=`<div class="procedure-step"><span class="step-number">i</span><div><b>Administration généralement concernée</b><p>${advancedProcedure.where}. La compétence exacte peut dépendre de votre résidence et de votre situation.</p></div></div><div class="procedure-step"><span class="step-number">!</span><div><b>Frais et délais</b><p>Ces informations évoluent. Vérifiez-les sur la source officielle juste avant votre dépôt.</p></div></div><div class="procedure-step"><span class="step-number">✓</span><div><b>Conseil Signal TN</b><p>Appelez ou vérifiez les horaires avant de vous déplacer, puis conservez une copie complète du dossier.</p></div></div>`;$('procedureOfficialLink').href=advancedProcedure.source;$('adminFreeSearch').value=advancedProcedure.where;$('procedureNextAction').textContent=`Commencez par : ${advancedProcedure.steps[0]}.`;renderAdvancedChecklist(docs);document.querySelectorAll('[data-doc]').forEach(c=>c.onchange=()=>{advancedChecked=[...document.querySelectorAll('[data-doc]:checked')].map(x=>Number(x.dataset.doc));updateProcedureProgress(docs.length)});updateProcedureProgress(docs.length);$('procedureWorkspace').scrollIntoView({behavior:'smooth',block:'start'})}
function renderAdvancedChecklist(docs){$('procedureChecklist').innerHTML=docs.slice(0,6).map((d,i)=>`<label class="check-item"><input type="checkbox" data-side-doc="${i}"><span>${d}</span></label>`).join('');document.querySelectorAll('[data-side-doc]').forEach(c=>c.onchange=()=>{const target=document.querySelector(`[data-doc="${c.dataset.sideDoc}"]`);if(target){target.checked=c.checked;target.dispatchEvent(new Event('change'))}})}
function updateProcedureProgress(total){const pct=total?Math.round(advancedChecked.length/total*100):0;$('procedureProgressValue').textContent=`${pct}%`;$('procedureProgressBar').style.width=`${pct}%`}
function getSavedProcedures(){try{return JSON.parse(localStorage.getItem('signaltn_procedures_v2')||'[]')}catch{return[]}}
function saveCurrentProcedure(){if(!advancedProcedure)return;const data=getSavedProcedures(),entry={id:advancedProcedure.id,title:advancedProcedure.title,icon:advancedProcedure.icon,answers:advancedAnswers,checked:advancedChecked,notes:$('procedureNotes').value,updatedAt:new Date().toISOString()};const i=data.findIndex(x=>x.id===entry.id);if(i>=0)data[i]=entry;else data.unshift(entry);localStorage.setItem('signaltn_procedures_v2',JSON.stringify(data));renderSavedProcedures();notify('Démarche enregistrée dans ce navigateur.')}
function renderSavedProcedures(){const box=$('savedProcedures');if(!box)return;const data=getSavedProcedures();box.innerHTML=data.length?'':'<div class="empty">Aucun dossier enregistré. Créez une fiche personnalisée puis enregistrez-la.</div>';data.forEach((x,i)=>{const proc=procedureCatalogV2.find(p=>p.id===x.id),total=proc?.documents.length||1,pct=Math.min(100,Math.round((x.checked?.length||0)/total*100));const c=document.createElement('article');c.className='saved-procedure';c.innerHTML=`<span class="procedure-badge">DOSSIER LOCAL</span><h3>${x.icon} ${x.title}</h3><p>${pct}% préparé • mis à jour ${new Date(x.updatedAt).toLocaleDateString('fr-TN')}</p><progress max="100" value="${pct}"></progress><div class="saved-procedure-actions"><button data-open>Ouvrir</button><button data-delete>Supprimer</button></div>`;c.querySelector('[data-open]').onclick=()=>{startAdvancedProcedure(proc);advancedAnswers=x.answers||{};generateAdvancedProcedure();$('procedureNotes').value=x.notes||''};c.querySelector('[data-delete]').onclick=()=>{data.splice(i,1);localStorage.setItem('signaltn_procedures_v2',JSON.stringify(data));renderSavedProcedures()};box.appendChild(c)})}
function resetAdvancedProcedure(){advancedProcedure=null;$('procedureSearch').value='';$('procedureWizard').classList.add('hidden');$('procedureWorkspace').classList.add('hidden');document.querySelectorAll('.procedure-category').forEach(x=>x.classList.remove('active'));window.scrollTo({top:0,behavior:'smooth'})}
if($('procedureCategories')){renderProcedureDiscovery();renderSavedProcedures();$('procedureSearchButton').onclick=searchAdvancedProcedure;$('procedureSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchAdvancedProcedure()}};$('generateProcedureButton').onclick=generateAdvancedProcedure;$('resetProcedureButton').onclick=resetAdvancedProcedure;$('saveProcedureButton').onclick=saveCurrentProcedure;$('clearProceduresButton').onclick=()=>{localStorage.removeItem('signaltn_procedures_v2');renderSavedProcedures()};$('procedureNotes').oninput=()=>{if(advancedProcedure)localStorage.setItem(`signaltn_proc_note_${advancedProcedure.id}`,$('procedureNotes').value)};$('printProcedureButton').onclick=()=>window.print();$('shareProcedureButton').onclick=async()=>{const text=advancedProcedure?`${advancedProcedure.title} — ${answerLabels().join(', ')}`:'Mes démarches';try{if(navigator.share)await navigator.share({title:'Signal TN — Mes démarches',text,url:location.href});else{await navigator.clipboard.writeText(`${text} ${location.href}`);notify('Résumé copié.')}}catch{}};$('addReminderButton').onclick=()=>{const date=prompt('Date du rappel (AAAA-MM-JJ) :');if(date&&advancedProcedure){localStorage.setItem(`signaltn_proc_reminder_${advancedProcedure.id}`,date);notify(`Rappel enregistré pour le ${date}.`)}};document.querySelectorAll('[data-procedure-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-procedure-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.procedure-tab-panel').forEach(x=>x.classList.toggle('active',x.id.toLowerCase().includes(b.dataset.procedureTab)))})}
const originalFindAdminButtonV2=$('findAdminButton')?.onclick;if($('findAdminButton'))$('findAdminButton').onclick=()=>{$('adminMapStatus').className='module-status';$('adminMapStatus').textContent='Localisation puis recherche en cours…';$('administrationMap').classList.remove('hidden');if(originalFindAdminButtonV2)originalFindAdminButtonV2()};

/* Sources officielles complémentaires pour l'assistant */
if(typeof procedureCatalogV2!=='undefined'){
  const socialCare={id:'socialcare',category:'health',title:'Carte de soins gratuite ou à tarif réduit',keywords:['carte soins','amen social','soins gratuits','tarif reduit'],icon:'🤝',where:'Unité locale de promotion sociale',source:'https://www.social.gov.tn/fr/attribution-de-cartes-de-soins-gratuites-et-soins-%C3%A0-tarif-r%C3%A9duit',questions:[{id:'profile',label:'Votre situation',options:[['individual','Personne seule'],['family','Famille'],['disability','Situation de handicap']]},{id:'request',label:'Votre besoin',options:[['free','Carte de soins gratuite'],['reduced','Soins à tarif réduit'],['info','Vérifier les conditions']]},{id:'status',label:'Couverture sociale',options:[['none','Sans régime social'],['check','Je dois vérifier']]}],documents:['Demande remplie au bénéfice du programme Amen Social','Acte de naissance de chaque membre de la famille','Copie de la CIN de chaque membre âgé de plus de 18 ans','Attestations scolaires ou de formation des enfants concernés','Photo du chef de famille et du conjoint','Copies des dernières factures d’eau et d’électricité','Documents complémentaires selon maladie, handicap, logement ou situation familiale'],steps:['Vérifier les conditions d’éligibilité du programme Amen Social','Préparer la demande et les documents de tous les membres du foyer','Déposer auprès de l’Unité Locale de Promotion Sociale','Obtenir l’identifiant unique du dossier','Attendre l’étude documentaire et l’enquête terrain','Recevoir la décision du comité régional','Exercer une opposition si nécessaire selon la procédure'],facts:[['Service','Non disponible à distance'],['Dépôt','Unité locale sociale'],['Décision','Comité régional'],['Public','Faible revenu / sans revenu']]};
  if(!procedureCatalogV2.some(x=>x.id===socialCare.id))procedureCatalogV2.push(socialCare);
}

/* ================= DEMARCHES VERIFIEES UNIQUEMENT =================
   Cette liste remplace le catalogue précédent. Chaque information
   ci-dessous provient explicitement d'une source officielle fournie.
   ================================================================ */
if(typeof procedureCatalogV2!=='undefined'){
  const verifiedProcedures=[
    {
      id:'passport',category:'identity',title:'Passeport tunisien',keywords:['passeport','passport','جواز'],icon:'🛂',where:'Poste de police ou de garde nationale',source:'https://services.interieur.gov.tn/wap/fr/docs/demarches/02.html',
      questions:[
        {id:'request',label:'Type de demande',options:[['first','Première demande'],['renew','Renouvellement'],['change','Modification / passeport non valable'],['lost','Duplicata après perte, vol ou détérioration']]},
        {id:'age',label:'Situation du demandeur',options:[['adult','Personne majeure'],['minor','Personne mineure'],['student','Élève ou étudiant']]},
        {id:'residence',label:'Lieu de résidence',options:[['tn','En Tunisie'],['abroad','À l’étranger']]}
      ],
      documents:[
        'Imprimé d’obtention d’un passeport ordinaire lisible à la machine, rempli et signé',
        'Copie de la carte d’identité nationale avec présentation de l’original, ou extrait de naissance pour un mineur',
        '4 photos d’identité sur fond blanc au format 3,5 × 4,5 cm',
        'Justificatif de scolarisation pour un élève ou un étudiant',
        'Autorisation du tuteur accompagnée d’une copie de sa CIN pour un mineur',
        'Quittance de paiement du droit de timbre fiscal',
        'Ancien passeport en cas de renouvellement',
        'Document prouvant la résidence régulière à l’étranger pour un résident à l’étranger'
      ],
      steps:[
        'Choisir le type exact de demande et la situation de résidence',
        'Remplir et signer l’imprimé officiel',
        'Préparer les pièces correspondant à la situation',
        'Payer le droit de timbre fiscal applicable',
        'Déposer le dossier auprès du service territorialement compétent ou du consulat',
        'Conserver la preuve de dépôt'
      ],
      facts:[['Dépôt en Tunisie','Police ou garde nationale compétente'],['Dépôt à l’étranger','Ambassade, consulat ou représentation'],['Délai indiqué','15 jours hors duplicata'],['Duplicata','Après enquête et procédures nécessaires']]
    },
    {
      id:'cin',category:'identity',title:'Carte d’identité nationale',keywords:['cin','identité','identite','بطاقة'],icon:'🪪',where:'Poste de police ou de garde nationale',source:'https://services.interieur.gov.tn/wap/fr/docs/demarches/01.html',
      questions:[
        {id:'request',label:'Type de demande',options:[['first','Première demande'],['renew','Renouvellement'],['change','Modification de données'],['lost','Vol, perte ou détérioration']]},
        {id:'age',label:'Situation',options:[['adult','18 ans ou plus'],['minor','Moins de 18 ans avec motif autorisé']]},
        {id:'residence',label:'Résidence',options:[['tn','En Tunisie'],['abroad','À l’étranger']]}
      ],
      documents:[
        'Extrait de naissance établi des registres originaux et datant de 3 mois au plus pour une première demande',
        'Attestation de travail ou de présence scolaire ou universitaire pour une première demande',
        '3 photos d’identité de format 3 × 4 cm sur fond blanc ou clair',
        'Quittance de paiement du droit de timbre fiscal',
        'Copie de la carte de résidence et de la carte consulaire pour un résident à l’étranger',
        'Autorisation légalisée et motivée du tuteur pour un mineur de moins de 18 ans',
        'Ancienne carte avec présentation de l’original pour un renouvellement',
        'Justificatif du changement d’état civil, de résidence ou de profession lorsque cela s’applique'
      ],
      steps:[
        'Identifier première demande, renouvellement, modification ou duplicata',
        'Préparer les documents correspondant au motif',
        'Payer le droit de timbre fiscal',
        'Déposer la demande auprès du service compétent',
        'Remettre l’ancienne carte lors de l’obtention de la nouvelle en cas de renouvellement'
      ],
      facts:[['Première demande','Extrait de naissance ≤ 3 mois'],['Photos','3 photos 3 × 4 cm'],['Délai indiqué','15 jours'],['Groupe sanguin','Certificat facultatif']]
    },
    {
      id:'b3',category:'justice',title:'Bulletin n°3 en ligne',keywords:['bulletin 3','bulletin n°3','casier','b3','السوابق'],icon:'📄',where:'Service en ligne',source:'https://b3.interieur.gov.tn/demande',
      questions:[
        {id:'language',label:'Langue du bulletin',options:[['fr','Français'],['ar','Arabe']]},
        {id:'identity',label:'Pièce d’identification',options:[['cin','Carte d’identité nationale'],['passport','Passeport']]},
        {id:'copies',label:'Nombre d’exemplaires',options:[['1','1 exemplaire'],['2','2 exemplaires'],['3','3 exemplaires']]}
      ],
      documents:[
        'Informations d’identité complètes et exactes',
        'Numéro et date d’émission de la CIN ou du passeport',
        'Numéro de téléphone mobile avec indicatif international',
        'Adresse e-mail',
        'Adresse complète de livraison',
        'Moyen de paiement par carte bancaire ou e-Dinar'
      ],
      steps:[
        'Remplir le formulaire en ligne',
        'Confirmer les informations saisies',
        'Effectuer le paiement électronique',
        'Conserver l’accusé de réception de la demande'
      ],
      facts:[['Demande','Entièrement en ligne'],['Étapes','4 étapes'],['Paiement','Carte bancaire ou e-Dinar'],['Exemplaires','De 1 à 3']]
    },
    {
      id:'cnam',category:'health',title:'CNAM — remboursement et filières de soins',keywords:['cnam','remboursement','soins','filière','كنام'],icon:'🏥',where:'Centre CNAM',source:'https://www.cnam.nat.tn/espace_assure.jsp',
      questions:[
        {id:'care',label:'Votre besoin',options:[['refund','Remboursement de soins'],['path','Comprendre les filières'],['hospital','Prise en charge / hospitalisation'],['forms','Trouver un imprimé']]},
        {id:'path',label:'Filière concernée',options:[['public','Filière publique'],['refund','Système de remboursement'],['private','Filière privée']]},
        {id:'account',label:'Espace en ligne',options:[['access','Suivre mes dossiers'],['password','Obtenir mon mot de passe']]}
      ],
      documents:[
        'Bulletin de soins dûment rempli pour une demande de remboursement',
        'Pièces justificatives correspondant aux soins',
        'Pièce d’identité et carte de soins pour demander le mot de passe de l’espace en ligne',
        'Formulaire officiel correspondant à la prise en charge recherchée'
      ],
      steps:[
        'Identifier la filière de soins choisie',
        'Télécharger l’imprimé officiel adapté si nécessaire',
        'Faire compléter le bulletin et réunir les pièces justificatives',
        'Déposer le bulletin de soins dans le délai applicable',
        'Suivre le dossier via les services en ligne lorsque l’accès est activé'
      ],
      facts:[['Filières','Publique, remboursement, privée'],['Remboursement','Dépôt sous 60 jours'],['Suivi','Dossiers suivis en ligne'],['Mot de passe','Délivré personnellement par la CNAM']]
    },
    {
      id:'cnrps',category:'health',title:'Espace affilié CNRPS',keywords:['cnrps','affilié cnrps','retraite public'],icon:'🏛️',where:'CNRPS',source:'https://affilie.cnrps.nat.tn/login',
      questions:[
        {id:'access',label:'Votre besoin',options:[['register','Créer un compte'],['login','Se connecter'],['reset','Mot de passe oublié']]}
      ],
      documents:['Informations demandées par le formulaire officiel d’inscription ou d’authentification'],
      steps:['Choisir l’inscription si aucun compte n’existe','Utiliser l’espace d’authentification pour accéder aux prestations en ligne','Utiliser la procédure officielle de réinitialisation en cas d’oubli du mot de passe'],
      facts:[['Public','Affiliés CNRPS'],['Accès','Inscription ou connexion'],['Prestations','Services en ligne'],['Mot de passe','Réinitialisation disponible']]
    },
    {
      id:'cnss',category:'health',title:'Services CNSS',keywords:['cnss','sécurité sociale','salarie','employeur','independant'],icon:'🧾',where:'CNSS',source:'https://www.cnss.tn/fr/',
      questions:[
        {id:'profile',label:'Votre profil',options:[['employee','Salarié'],['employer','Employeur'],['independent','Indépendant'],['other','Autre catégorie']]},
        {id:'sector',label:'Secteur',options:[['nonagri','Non agricole'],['agri','Agricole'],['fishery','Pêche']]},
        {id:'service',label:'Service recherché',options:[['career','Relevé de carrière'],['pension','Pension'],['family','Prestations familiales'],['forms','Formulaires']]}
      ],
      documents:['Formulaire officiel correspondant au profil et au service sélectionnés','Informations et justificatifs demandés dans la rubrique officielle correspondante'],
      steps:['Choisir la rubrique Employeur, Salarié ou Indépendant','Choisir le secteur ou la catégorie correspondant à la situation','Ouvrir le service ou le formulaire officiel recherché','Suivre les instructions affichées par la CNSS'],
      facts:[['Profils','Employeurs, salariés, indépendants'],['Secteurs','Non agricole, agricole, pêche'],['En ligne','Relevé de carrière, pension et autres services'],['Téléchargement','Formulaires et brochures']]
    },
    {
      id:'socialcare',category:'health',title:'Carte de soins gratuite ou à tarif réduit',keywords:['carte soins','amen social','soins gratuits','tarif réduit'],icon:'🤝',where:'Unité locale de promotion sociale',source:'https://www.social.gov.tn/fr/attribution-de-cartes-de-soins-gratuites-et-soins-%C3%A0-tarif-r%C3%A9duit',
      questions:[
        {id:'request',label:'Besoin',options:[['free','Carte de soins gratuite'],['reduced','Carte de soins à tarif réduit'],['conditions','Vérifier les conditions']]},
        {id:'profile',label:'Situation',options:[['individual','Personne'],['family','Famille'],['disability','Membre avec handicap profond']]}
      ],
      documents:[
        'Demande remplie pour bénéficier du programme Amen Social',
        'Acte de naissance de chaque membre de la famille',
        'Copie de la CIN de chaque membre de plus de 18 ans',
        'Attestation de présence ou certificat d’inscription des enfants concernés',
        'Photo du chef de famille et du conjoint',
        'Copies des dernières factures d’eau et d’électricité',
        'Copie de la carte de traitement, le cas échéant',
        'Documents supplémentaires correspondant à la maladie, au handicap, au logement ou à la situation familiale'
      ],
      steps:[
        'Déposer la demande auprès de l’Unité Locale de Promotion Sociale',
        'Obtenir l’identifiant unique du dossier',
        'Attendre l’étude documentaire et la recherche terrain',
        'Attendre les vérifications et la saisie dans le système',
        'Recevoir la décision finale du comité régional',
        'Être informé de la décision par courrier',
        'Exercer une opposition à la décision finale si nécessaire'
      ],
      facts:[['Service','Non disponible à distance'],['Dépôt','Unité locale sociale'],['Étude','Documentaire et terrain'],['Décision','Comité régional']]
    }
  ];
  procedureCatalogV2.splice(0,procedureCatalogV2.length,...verifiedProcedures);
  if($('procedureCategories')){renderProcedureDiscovery();renderSavedProcedures();}
}


/* ===== Catégories visibles : uniquement celles avec démarches officielles vérifiées ===== */
if(typeof procedureCategoriesV2!=='undefined'){
  procedureCategoriesV2.splice(
    0,
    procedureCategoriesV2.length,
    ['identity','🪪','Identité','Passeport et carte d’identité'],
    ['health','🏥','Santé & protection sociale','CNAM, CNSS, CNRPS et Amen Social'],
    ['justice','⚖️','Justice','Bulletin n°3 en ligne']
  );
  if(document.getElementById('procedureCategories')){
    renderProcedureDiscovery();
    renderSavedProcedures();
  }
}
