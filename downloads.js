(()=>{
'use strict';
const D=window.GEOMINE_DATA||{},$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0);let files=[],filesPromise=null,uiInitialized=false;
function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2500)}
async function loadFiles(){if(files.length)return files;if(filesPromise)return filesPromise;filesPromise=(async()=>{let page=1,r;const out=[];do{r=await AITBackend.listFiles({page:page,pageSize:500});out.push(...(r.rows||[]));page++}while(page<=Number(r.totalPages||1));files=out;return files})().finally(()=>{filesPromise=null});return filesPromise}
function normalizedFile(r){return {id:r.File_ID,name:r.File_Name,category:r.Category,archive:r.Source_Archive,size_mb:Number(r.Size_Bytes||0)/1048576,sha:r.SHA256,type:r.File_Type,status:r.Sync_Status,driveId:r.Drive_File_ID}}
function filtered(){const q=($('downloadSearch')?.value||'').toLowerCase(),cat=$('downloadCategory')?.value||'',arc=$('downloadArchive')?.value||'';return files.map(normalizedFile).filter(r=>(!cat||r.category===cat)&&(!arc||r.archive===arc)&&(!q||JSON.stringify(r).toLowerCase().includes(q)))}
async function downloadId(id){try{await AITBackend.download(id)}catch(e){toast(e.message||String(e))}}
function renderSummary(){if(!$('downloadSummaryPills'))return;const rows=files.map(normalizedFile);$('downloadSummaryPills').innerHTML=[['إجمالي الملفات',rows.length],['مرتبط بـDrive',rows.filter(x=>x.status==='Linked').length],['أرشيفات المصدر',rows.filter(x=>x.type==='Source archive').length],['خرائط وصور',rows.filter(x=>String(x.category).includes('Maps')).length]].map(x=>`<div class="summary-pill"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('')}
function renderArchives(){if(!$('archiveDownloadGrid'))return;const rows=files.map(normalizedFile).filter(x=>x.type==='Source archive');$('archiveDownloadGrid').innerHTML=rows.map(r=>`<article class="archive-download-card"><div class="archive-icon">ZIP</div><div><b>${esc(r.name)}</b><small>${fmt(r.size_mb)} MB · ${esc(String(r.sha||'').slice(0,12))}…</small></div><button data-drive-download="${esc(r.id)}">⇩ <span>فتح/تنزيل</span></button></article>`).join('');document.querySelectorAll('[data-drive-download]').forEach(b=>b.onclick=()=>downloadId(b.dataset.driveDownload))}
function renderTable(){if(!$('downloadTable'))return;const rows=filtered();$('downloadTableCount').textContent=`${fmt(rows.length)} ملف`;$('downloadTable').innerHTML=rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${esc(r.archive)}</td><td>${fmt(r.size_mb)}</td><td title="${esc(r.sha)}">${esc(String(r.sha||'').slice(0,14))}…</td><td>${esc(r.status||'')}</td><td><button class="download-file-btn" data-drive-download="${esc(r.id)}" ${r.status==='Linked'?'':'title="الملف غير مربوط على Drive"'}>⇩ <span>فتح/تنزيل</span></button></td></tr>`).join('');document.querySelectorAll('[data-drive-download]').forEach(b=>b.onclick=()=>downloadId(b.dataset.driveDownload))}
function initFilters(){const rows=files.map(normalizedFile),cats=[...new Set(rows.map(x=>x.category).filter(Boolean))].sort(),arcs=[...new Set(rows.map(x=>x.archive).filter(Boolean))].sort();$('downloadCategory').innerHTML='<option value="">كل الأنواع</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join('');$('downloadArchive').innerHTML='<option value="">كل الأرشيفات</option>'+arcs.map(x=>`<option>${esc(x)}</option>`).join('');['downloadSearch','downloadCategory','downloadArchive'].forEach(id=>$(id)?.addEventListener(id==='downloadSearch'?'input':'change',renderTable));$('downloadReset')?.addEventListener('click',()=>{['downloadSearch','downloadCategory','downloadArchive'].forEach(id=>$(id).value='');renderTable()})}
function findByInventory(row){return files.find(f=>String(f.SHA256||'')===String(row?.sha256||''))||files.find(f=>String(f.File_Name||'')===String(row?.name||''))}
async function downloadInventoryRow(row){await loadFiles();const f=findByInventory(row);if(!f)return toast('الملف غير موجود في فهرس Google Drive.');downloadId(f.File_ID)}
async function downloadByAsset(asset){await loadFiles();const name=String(asset||'').replace(/\\/g,'/').split('/').pop();const f=files.find(x=>x.File_Name===name);if(!f)return toast('لم يتم ربط الملف بGoogle Drive.');downloadId(f.File_ID)}
function dataUrlDownload(name,url){const a=document.createElement('a');a.href=url;a.download=name||'map-image';a.click()}
function blobDownload(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function downloadLayer(layerId){
  try{
    const l=(D.geological_layers||[]).find(x=>x.layer_id===layerId);if(!l)return;
    if(l.layer_type==='raster'&&l.asset?.startsWith('data:'))return dataUrlDownload(l.asset_name||'map.jpg',l.asset);
    if(l.layer_type==='vector'&&l.geojson)return blobDownload(l.asset_name||`${layerId}.geojson`,JSON.stringify(l.geojson),'application/geo+json');
    const detail=await AITBackend.mapLayerData(layerId);Object.assign(l,detail||{});
    if(detail.asset_data_url){l.asset=detail.asset_data_url;return dataUrlDownload(detail.asset_name||'map.jpg',detail.asset_data_url)}
    if(detail.geojson){l.geojson=detail.geojson;return blobDownload(detail.asset_name||`${layerId}.geojson`,JSON.stringify(detail.geojson),'application/geo+json')}
    if(detail.drive_view_url)return window.open(detail.drive_view_url,'_blank','noopener');
    toast('ملف الخريطة غير موجود أو غير مرتبط على Drive.');
  }catch(e){toast(e.message||String(e))}
}
function csvText(rows){const keys=['File_ID','File_Name','Category','Source_Archive','Size_Bytes','SHA256','Sync_Status'];const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;return '\ufeff'+keys.map(q).join(',')+'\n'+rows.map(r=>keys.map(k=>q(r[k])).join(',')).join('\n')}
async function init(){if(uiInitialized||!$('downloads'))return;uiInitialized=true;document.querySelector('.release-config-card')?.remove();try{await loadFiles();renderSummary();renderArchives();initFilters();renderTable();$('downloadManifestJson').onclick=()=>blobDownload('AIT_GeoMine360_Drive_Files.json',JSON.stringify(files,null,2),'application/json');$('downloadManifestCsv').onclick=()=>blobDownload('AIT_GeoMine360_Drive_Files.csv',csvText(files),'text/csv;charset=utf-8')}catch(e){uiInitialized=false;toast(e.message||String(e))}}
window.GeoMineDownloads={downloadInventoryRow,downloadByAsset,downloadLayer,ensureFiles:loadFiles};window.addEventListener('geomine-downloads-open',init);
})();
