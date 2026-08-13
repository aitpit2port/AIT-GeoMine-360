(function(){
'use strict';
const loadedPages=new Set(['overview','map']);

let leafletPromise=null;
function ensureLeaflet(){
  if(window.L)return Promise.resolve(window.L);
  if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise((resolve,reject)=>{
    if(!document.getElementById('leafletCss')){
      const link=document.createElement('link');link.id='leafletCss';link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(link);
    }
    const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.async=true;s.onload=()=>resolve(window.L);s.onerror=()=>reject(new Error('تعذر تحميل مكتبة الخرائط'));document.head.appendChild(s);
  });
  return leafletPromise;
}
window.GeoMineDeps={ensureLeaflet};
const pageSpecs={
  geology:[
    {key:'excel_occurrences'},
    {key:'gdb_ore_points'},
    {key:'excel_reports'}
  ],
  samples:[
    {key:'au_cu_samples'},
    {key:'talc_xrf'},
    {key:'talc_sites'}
  ],
  mines:[{key:'mines'},{key:'blocks'}],
  documents:[{key:'pdf_documents'},{key:'excel_reports'}],
  data:[{key:'archives'},{key:'file_inventory'}]
};
const initialSpecs=[
  {key:'summary'},
  {key:'mines'},
  {key:'geological_layers'},
  {key:'au_cu_samples',fields:['Au_ppm']},
  {key:'gdb_ore_points',fields:['Ore_Name','centroid_lat','centroid_lon']},
  {key:'excel_occurrences',fields:['Ore_Name','latitude','longitude']},
  {key:'file_inventory',fields:['archive','file_type','ext','name','relative_path','size_mb','sha256']},
  {key:'excel_reports',fields:['ReportNumber','Report_Date','Report_Title','Author','AreaName','source_path','source_workbook']},
  {key:'pdf_documents',fields:['text_pages_nonempty','title_ar','title_original','file_name','primary_path','page_count','year','review_summary']},
  {key:'key_findings'}
];
function overlay(){let el=document.getElementById('aitBootOverlay');if(el)return el;el=document.createElement('div');el.id='aitBootOverlay';el.innerHTML='<div><img src="assets/branding/ait_logo.svg" alt="AIT"><h2>AIT GeoMine 360</h2><p id="aitBootMessage">جاري الاتصال بالنظام...</p><div class="ait-loader"></div></div>';document.body.appendChild(el);return el}
function message(t){overlay();const p=document.getElementById('aitBootMessage');if(p)p.textContent=t}
function fail(err){message('تعذر تشغيل النظام: '+(err&&err.message?err.message:String(err)));document.getElementById('aitBootOverlay')?.classList.add('error')}
function waitLogin(){return new Promise(resolve=>window.addEventListener('ait:login',()=>resolve(true),{once:true}))}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('تعذر تحميل '+src));document.body.appendChild(s)})}
function parseJson(v,fallback){if(Array.isArray(v)||v&&typeof v==='object')return v;try{return JSON.parse(v)}catch(e){return fallback}}
function normalizeLayers(rows){
  return (rows||[]).map(function(row){
    const l=Object.assign({},row);
    l.bounds=parseJson(l.bounds_json||l.bounds,null);
    l.asset_path=l.asset||'';
    l.asset_name=String(l.asset_path||'').replace(/\\/g,'/').split('/').pop();
    // GitHub package intentionally does not contain the map assets. The real
    // asset is resolved through the authenticated backend only when needed.
    l.asset='';
    return l;
  });
}
function applyAliases(D){
  D.html_mines=D.mines||[];
  D.html_blocks=D.blocks||[];
  D.assays=D.au_cu_samples||[];
  D.key_results=D.key_findings||[];
  if(D.summary)D.summary.archives=D.archives||[];
}
async function ensurePage(page){
  if(loadedPages.has(page)||!pageSpecs[page])return window.GEOMINE_DATA;
  const datasets=await AITBackend.datasetBundle(pageSpecs[page]);
  const D=window.GEOMINE_DATA||{};
  Object.keys(datasets).forEach(k=>{D[k]=datasets[k]});
  applyAliases(D);loadedPages.add(page);
  window.dispatchEvent(new CustomEvent('geomine-data-ready',{detail:{page:page}}));
  return D;
}
async function boot(){
  try{
    overlay();message('جاري فتح قناة اتصال سريعة...');await AITBackend.ensureBridge();
    if(!(await AITBackend.verify())){message('سجّل الدخول للمتابعة');AITBackend.login();await waitLogin()}
    message('جاري تحميل البيانات الأساسية فقط...');
    const initial=await AITBackend.datasetBundle(initialSpecs);
    const D={summary:initial.summary||{counts:{}}};
    Object.keys(initial).forEach(k=>{if(k!=='summary')D[k]=initial[k]});
    D.geological_layers=normalizeLayers(D.geological_layers||[]);
    applyAliases(D);window.GEOMINE_DATA=D;
    window.GeoMineDataLoader={ensurePage,isLoaded:page=>loadedPages.has(page)};
    message('جاري تشغيل الواجهة...');
    await loadScript('i18n-theme.js');await loadScript('app.js');await loadScript('downloads.js');
    const role=String(AITBackend.state()?.user?.roleId||'OWNER').toLowerCase().includes('geo')?'geologist':'owner';
    document.querySelector('.role-switch button[data-role="'+role+'"]')?.click();
    document.getElementById('aitBootOverlay')?.remove();
    document.querySelector('.status-dot')?.classList.add('online');
    document.body.classList.remove('app-boot-pending');
  }catch(err){console.error(err);fail(err)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
