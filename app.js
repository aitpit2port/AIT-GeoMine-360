(() => {
  'use strict';
  const D = window.GEOMINE_DATA || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, digits = 0) => new Intl.NumberFormat((window.GeoMineI18N?.lang==='ar'?'ar-EG':window.GeoMineI18N?.lang==='zh'?'zh-CN':'en-US'), {maximumFractionDigits: digits}).format(Number(n) || 0);
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const compact = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return (n/1e9).toFixed(1).replace('.0','') + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1).replace('.0','') + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1).replace('.0','') + 'K';
    return fmt(n);
  };
  const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const median = (arr) => {
    if (!arr.length) return 0;
    const a = [...arr].sort((x,y)=>x-y), m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
  };
  const groupCount = (arr, keyFn) => arr.reduce((o,r)=>{const k=keyFn(r); if(k) o[k]=(o[k]||0)+1; return o;},{});
  const colors = ['#ff5b2e','#d8a62c','#23a5e6','#23bd78','#9b5df1','#ef5350','#42c7bd','#f08f3d','#7f9cff','#a1c65a'];
  const counts = D.summary?.counts || {};
  let activePage = 'overview';
  let roleMode = 'owner';
  let currentTableData = [];

  function showToast(msg){
    const el = $('toast'); if(!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(showToast.t); showToast.t = setTimeout(()=>el.classList.remove('show'),2200);
  }
  function openOverlay(id){ const el=$(id); if(el){el.classList.add('open');el.setAttribute('aria-hidden','false');} }
  function closeOverlay(id){ const el=$(id); if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');} }
  $$('[data-close]').forEach(x=>x.addEventListener('click',()=>closeOverlay(x.dataset.close)));
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape') ['searchDrawer','detailsModal','insightsPanel'].forEach(closeOverlay);
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('globalSearch')?.focus();}
  });

  const pageTitles={overview:'نظرة عامة',map:'الخريطة والطبقات',geology:'الجيولوجيا والخامات',samples:'العينات والتحاليل',mines:'المناجم والبلوكات',documents:'الخرائط والوثائق',data:'مكتبة البيانات',downloads:'تنزيل الملفات'};
  const initializedPages=new Set(['overview']);
  async function ensurePageReady(page){
    if(initializedPages.has(page))return;
    try{
      if(page!=='map'&&page!=='downloads')showToast('جاري تحميل القسم...');
      await window.GeoMineDataLoader?.ensurePage(page);
      if(page==='geology')refreshDerivedData();
      if(page==='map')await initMainMap();
      else if(page==='geology')initGeology();
      else if(page==='samples')initSamples();
      else if(page==='mines')initMines();
      else if(page==='documents')initDocuments();
      else if(page==='data')initData();
      else if(page==='downloads')window.dispatchEvent(new CustomEvent('geomine-downloads-open'));
      initializedPages.add(page);
      window.GeoMineI18N?.apply($(page));
    }catch(err){console.error(err);showToast('تعذر تحميل القسم: '+(err?.message||err));throw err}
  }
  async function goPage(page){
    activePage=page;
    $$('.nav,.page').forEach(x=>x.classList.remove('active'));
    $(`.nav[data-page="${page}"]`)?.classList.add('active');
    $(page)?.classList.add('active');
    $('pageTitle').textContent=window.GeoMineI18N?.translate(pageTitles[page]||page)||page;
    if(window.innerWidth<621) $('sidebar')?.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
    try{await ensurePageReady(page)}catch(e){return false}
    if(page==='map')setTimeout(()=>geoMap?.invalidateSize(),60);
    return true;
  }
  $$('.nav').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.page)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.go)));
  $('menuToggle')?.addEventListener('click',()=>$('sidebar')?.classList.toggle('open'));

  function setRole(role){
    roleMode=role;
    document.body.dataset.role=role;
    $$('.role-switch button').forEach(b=>b.classList.toggle('active',b.dataset.role===role));
    $('roleSideLabel').textContent=window.GeoMineI18N?.translate(role==='owner'?'صاحب الشركة':'جيولوجي');
    $('scopeText').textContent=window.GeoMineI18N?.translate(role==='owner'?'لوحة قرار لصاحب الشركة':'مساحة تحليل للجيولوجي');
    showToast(role==='owner'?'تم تفعيل عرض صاحب الشركة':'تم تفعيل عرض الجيولوجي');
  }
  $$('.role-switch button').forEach(b=>b.addEventListener('click',()=>setRole(b.dataset.role)));
  $('generatedAt').textContent=(D.summary?.generated_at||'').replace('T',' ').slice(0,16);

  function openDetails(kicker,title,obj){
    $('modalKicker').textContent=kicker||'';
    $('modalTitle').textContent=title||'التفاصيل';
    const rows=Object.entries(obj||{}).filter(([,v])=>v!==null&&v!==''&&v!==undefined&&typeof v!=='object');
    $('modalBody').innerHTML=`<div class="detail-grid">${rows.map(([k,v])=>`<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>`;
    openOverlay('detailsModal');
  }
  window.__openDetails=openDetails;

  function splitOreNames(v){
    return String(v||'').split(/[,;،/]+/).map(x=>x.trim()).filter(x=>x&&x.length<55&&x.toLowerCase()!=='none');
  }
  function buildOreCounts(){
    const out={};
    [...(D.gdb_ore_points||[]),...(D.excel_occurrences||[])].forEach(r=>splitOreNames(r.Ore_Name).forEach(o=>out[o]=(out[o]||0)+1));
    return out;
  }
  let oreCounts=buildOreCounts();

  function renderBars(id, entries, options={}){
    const el=$(id); if(!el) return;
    const list=entries.filter(x=>Number(x[1])>0).slice(0,options.limit||10);
    const max=Math.max(1,...list.map(x=>Number(x[1])));
    el.innerHTML=list.map((x,i)=>`<div class="bar-chart-row"><div class="bar-chart-label" title="${esc(x[0])}">${esc(x[0])}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,Number(x[1])/max*100)}%;--bar-color:${options.colors?.[i]||colors[i%colors.length]}"></div></div><div class="bar-chart-value">${options.format?options.format(x[1]):fmt(x[1],options.digits||0)}</div></div>`).join('')||'<div class="inspector-placeholder">لا توجد قيم رقمية متاحة</div>';
  }
  function renderDonut(id, entries, centerLabel){
    const el=$(id); if(!el) return;
    const list=entries.filter(x=>Number(x[1])>0).slice(0,7), total=list.reduce((s,x)=>s+Number(x[1]),0)||1;
    let p=0, seg=[];
    list.forEach((x,i)=>{const start=p,end=p+Number(x[1])/total*100;seg.push(`${colors[i%colors.length]} ${start}% ${end}%`);p=end;});
    el.innerHTML=`<div class="donut" style="--segments:conic-gradient(${seg.join(',')})"><div class="donut-center"><b>${compact(total)}</b><span>${esc(centerLabel)}</span></div></div><div class="donut-legend">${list.map((x,i)=>`<div class="donut-legend-row"><i style="background:${colors[i%colors.length]}"></i><span title="${esc(x[0])}">${esc(x[0])}</span><b>${fmt(x[1])}</b></div>`).join('')}</div>`;
  }
  function renderSvgBars(id, labels, values){
    const el=$(id); if(!el) return;
    const w=520,h=180,pad={t:12,r:10,b:28,l:28},max=Math.max(1,...values),bw=(w-pad.l-pad.r)/Math.max(1,values.length);
    const grid=[0,.25,.5,.75,1].map(t=>`<line class="grid" x1="${pad.l}" x2="${w-pad.r}" y1="${pad.t+(1-t)*(h-pad.t-pad.b)}" y2="${pad.t+(1-t)*(h-pad.t-pad.b)}"/>`).join('');
    const bars=values.map((v,i)=>{const bh=(v/max)*(h-pad.t-pad.b),x=pad.l+i*bw+bw*.18,y=h-pad.b-bh;return `<rect class="bar-rect" x="${x}" y="${y}" width="${bw*.64}" height="${bh}" rx="3"><title>${esc(labels[i])}: ${v}</title></rect><text x="${x+bw*.32}" y="${h-10}" text-anchor="middle">${esc(labels[i])}</text>`}).join('');
    el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="barGradient" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d8a62c"/><stop offset="1" stop-color="#ff6d3c"/></linearGradient></defs>${grid}<line class="axis" x1="${pad.l}" x2="${w-pad.r}" y1="${h-pad.b}" y2="${h-pad.b}"/>${bars}</svg>`;
  }
  function renderTimeline(id, yearCounts){
    const years=Object.keys(yearCounts).map(Number).filter(Boolean).sort((a,b)=>a-b);const el=$(id);if(!el)return;
    if(!years.length){el.innerHTML='<div class="inspector-placeholder">لا توجد سنوات قابلة للرسم</div>';return;}
    const minY=Math.min(...years),maxY=Math.max(...years),w=560,h=190,p={t:16,r:15,b:28,l:28},max=Math.max(...Object.values(yearCounts),1);
    const pts=years.map((y,i)=>{const x=years.length===1?w/2:p.l+i*(w-p.l-p.r)/(years.length-1), val=yearCounts[y], yy=h-p.b-(val/max)*(h-p.t-p.b);return [x,yy,y,val]});
    const path=pts.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' '),area=`${path} L ${pts[pts.length-1][0]} ${h-p.b} L ${pts[0][0]} ${h-p.b} Z`;
    const labels=pts.filter((_,i)=>i%Math.ceil(pts.length/8)===0||i===pts.length-1).map(p=>`<text x="${p[0]}" y="${h-9}" text-anchor="middle">${p[2]}</text>`).join('');
    const dots=pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#ff6b3b"><title>${p[2]}: ${p[3]}</title></circle>`).join('');
    const grid=[0,.25,.5,.75,1].map(t=>`<line class="grid" x1="${p.l}" x2="${w-p.r}" y1="${p.t+(1-t)*(h-p.t-p.b)}" y2="${p.t+(1-t)*(h-p.t-p.b)}"/>`).join('');
    el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5b2e" stop-opacity=".35"/><stop offset="1" stop-color="#ff5b2e" stop-opacity="0"/></linearGradient></defs>${grid}<path class="area" d="${area}"/><path class="line" d="${path}"/>${dots}${labels}</svg>`;
  }

  // Overview
  function renderOverview(){
    const kpis=[
      ['الملفات الفريدة',counts.unique_files,'ملف','▣','#ff5b2e'],
      ['نقاط الخامات',counts.gdb_ore_points,'نقطة','⌖','#23bd78'],
      ['تواجدات Excel',counts.excel_ore_occurrences,'سجل','▦','#23a5e6'],
      ['الخرائط الجيولوجية',counts.geological_raster_layers,'خريطة','◇','#9b5df1'],
      ['وثائق PDF',counts.unique_pdf_documents,'وثيقة','PDF','#ef5350'],
      ['المناجم',counts.html_mines,'منجم','⛏','#d8a62c'],
      ['البلوكات',counts.html_blocks,'بلوك','▱','#42c7bd']
    ];
    $('kpis').innerHTML=kpis.map(x=>`<div class="kpi" style="--kpi-color:${x[4]}"><div class="kpi-icon">${x[3]}</div><div class="kpi-copy"><span>${x[0]}</span><b>${compact(x[1])}</b><small>${x[2]} من الملفات</small></div></div>`).join('');
    $('mineQuickCount').textContent=counts.html_mines||0;
    $('mineQuick').innerHTML=(D.html_mines||[]).slice(0,5).map((m,i)=>`<button class="quick-mine" data-quick-mine="${i}"><span class="mine-thumb">${esc(m.code)}</span><div><b>${esc(m.name)}</b><small>${esc(m.gov)} · ${esc(m.mat)}</small></div><span class="status-dot"></span></button>`).join('');
    $$('[data-quick-mine]').forEach(b=>b.addEventListener('click',()=>{goPage('mines').then(ok=>{if(!ok)return;const card=$(`[data-mine-index="${b.dataset.quickMine}"]`);card?.scrollIntoView({behavior:'smooth',block:'center'});}).catch(()=>{})}));
    const raster=(D.geological_layers||[]).filter(l=>l.layer_type==='raster');
    $('rasterCountBadge').textContent=`${fmt(raster.length)} خريطة`;
    $('geoPreviewSelect').innerHTML=raster.map(l=>`<option value="${esc(l.layer_id)}">${esc(l.title)}</option>`).join('');
    async function updatePreview(){
      const l=raster.find(x=>x.layer_id===$('geoPreviewSelect').value)||raster[0];if(!l)return;
      const img=$('geoPreviewImage');img.removeAttribute('src');img.classList.add('is-loading');
      $('geoPreviewTitle').textContent=l.title;$('geoPreviewQuality').textContent=l.bounds_quality||'';$('geoPreviewSource').textContent=l.source_file||l.asset_path||'';
      $('showPreviewOnMap').dataset.layer=l.layer_id;if($('downloadPreviewMap'))$('downloadPreviewMap').dataset.layer=l.layer_id;
      try{await ensureLayerData(l);if(l.asset)img.src=l.asset;else throw new Error('لا يوجد ملف صورة مرتبط');img.classList.remove('is-error');}
      catch(e){console.warn(e);img.classList.add('is-error');img.alt='تعذر تحميل الخريطة';}
      finally{img.classList.remove('is-loading')}
    }
    $('geoPreviewSelect').onchange=updatePreview;updatePreview();
    $('showPreviewOnMap').onclick=()=>{const id=$('showPreviewOnMap').dataset.layer;goPage('map').then(ok=>{if(ok)activateLayerById(id,true)}).catch(()=>{})};
    $('downloadPreviewMap').onclick=()=>window.GeoMineDownloads?.downloadLayer($('downloadPreviewMap').dataset.layer);
    const au=(D.assays||[]).map(r=>num(r.Au_ppm)).filter(v=>v!==null);
    $('auNumericCount').textContent=fmt(au.length);
    const bins=[0,.01,.1,.5,1,2,5,10,Infinity],labels=['0-.01','.01-.1','.1-.5','.5-1','1-2','2-5','5-10','>10'],vals=labels.map(()=>0);
    au.forEach(v=>{for(let i=0;i<bins.length-1;i++)if(v>=bins[i]&&v<bins[i+1]){vals[i]++;break;}});renderSvgBars('auHistogram',labels,vals);
    $('auStats').innerHTML=[['أعلى قيمة',au.length?Math.max(...au):0],['المتوسط',avg(au)],['الوسيط',median(au)]].map(x=>`<div class="mini-stat"><span>${x[0]}</span><b>${fmt(x[1],3)} ppm</b></div>`).join('');
    const geoAll=[...(D.gdb_ore_points||[]),...(D.excel_occurrences||[])],coordOk=geoAll.filter(r=>num(r.centroid_lat??r.latitude)!==null&&num(r.centroid_lon??r.longitude)!==null).length;
    const layers=D.geological_layers||[],ready=layers.filter(l=>String(l.status||'').includes('جاهز')).length,precise=layers.filter(l=>String(l.bounds_quality||'').includes('دقيق')).length;
    const q1=counts.source_file_instances?counts.unique_files/counts.source_file_instances*100:0,q2=geoAll.length?coordOk/geoAll.length*100:0,q3=layers.length?ready/layers.length*100:0,q4=counts.unique_pdf_documents?counts.searchable_pdf_documents/counts.unique_pdf_documents*100:0;
    const quality=Math.round(avg([q1,q2,q3,q4]));$('qualityPct').textContent=quality+'%';$('qualityGauge').style.setProperty('--pct',quality);
    $('qualityList').innerHTML=[['ملفات فريدة بدون تكرار',Math.round(q1)+'%'],['سجلات بإحداثيات',Math.round(q2)+'%'],['طبقات جاهزة للعرض',Math.round(q3)+'%'],['PDF بنص مضمّن',Math.round(q4)+'%'],['طبقات دقيقة الإحداثيات',`${precise}/${layers.length}`]].map(x=>`<div class="quality-row"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    renderBars('oreOverviewBars',Object.entries(oreCounts).sort((a,b)=>b[1]-a[1]),{limit:8});
    const typeCounts=groupCount(D.file_inventory||[],r=>r.file_type||r.ext||'أخرى');
    const tiles=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    $('libraryTiles').innerHTML=tiles.map((x,i)=>`<div class="library-tile"><i style="background:${colors[i%colors.length]}">${['DB','GIS','PDF','XLS','IMG','FILE'][i]||'FILE'}</i><b>${fmt(x[1])}</b><span>${esc(x[0])}</span></div>`).join('');
    const reports=[...(D.excel_reports||[])].sort((a,b)=>(Number(b.Report_Date)||0)-(Number(a.Report_Date)||0)).slice(0,8);
    $('reportHighlights').innerHTML=reports.map(r=>`<div class="timeline-item"><div class="timeline-year">${esc(r.Report_Date||'—')}</div><div><b>${esc(r.Report_Title||r.ReportNumber||r.source_workbook)}</b><small>${esc(r.AreaName||'')} · ${esc(r.Author||'')}</small></div><em>${esc(r.ReportNumber||'')}</em></div>`).join('');
    renderInsights();
  }
  function updateOverviewScope(){
    const scope=$('overviewScope')?.value||'all';
    const matchArchive=a=>scope==='all'||String(a||'').toLowerCase().includes(scope.toLowerCase());
    const inv=(D.file_inventory||[]).filter(r=>matchArchive(r.archive));
    const typeCounts=groupCount(inv,r=>r.file_type||r.ext||'أخرى');
    const tiles=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    $('libraryTiles').innerHTML=tiles.map((x,i)=>`<div class="library-tile"><i style="background:${colors[i%colors.length]}">${['DB','GIS','PDF','XLS','IMG','FILE'][i]||'FILE'}</i><b>${fmt(x[1])}</b><span>${esc(x[0])}</span></div>`).join('')||'<div class="inspector-placeholder">لا توجد ملفات ضمن النطاق المختار</div>';
    const reports=(D.excel_reports||[]).filter(r=>scope==='all'||String(r.source_path||r.source_workbook||'').toLowerCase().includes(scope.toLowerCase())).sort((a,b)=>(Number(b.Report_Date)||0)-(Number(a.Report_Date)||0)).slice(0,8);
    $('reportHighlights').innerHTML=reports.map(r=>`<div class="timeline-item"><div class="timeline-year">${esc(r.Report_Date||'—')}</div><div><b>${esc(r.Report_Title||r.ReportNumber||r.source_workbook)}</b><small>${esc(r.AreaName||'')} · ${esc(r.Author||'')}</small></div><em>${esc(r.ReportNumber||'')}</em></div>`).join('')||'<div class="inspector-placeholder">لا توجد سجلات تقارير ضمن النطاق المختار</div>';
    showToast(scope==='all'?'تم عرض جميع المصادر':`تم تطبيق نطاق ${scope}`);
  }
  $('overviewScope')?.addEventListener('change',updateOverviewScope);
  $('refreshOverview')?.addEventListener('click',()=>{renderOverview();updateOverviewScope();showToast('تم تحديث العرض من حزمة البيانات المحلية')});

  // Map assets are resolved only when needed. This keeps the first dashboard
  // paint independent of the 97 map/image files stored in Drive.
  async function ensureLayerData(l){
    if(!l)throw new Error('الطبقة غير موجودة');
    if(l.layer_type==='vector'&&l.geojson)return l;
    if(l.layer_type==='raster'&&l.asset)return l;
    if(l._dataPromise)return l._dataPromise;
    l._dataPromise=AITBackend.mapLayerData(l.layer_id).then(detail=>{
      Object.assign(l,detail||{});
      if(l.layer_type==='raster')l.asset=detail?.asset_data_url||'';
      if(l.layer_type==='raster'&&!l.asset){
        if(detail?.inline_error==='RASTER_TOO_LARGE')throw new Error('حجم الخريطة أكبر من حد المعاينة السريعة');
        throw new Error('ملف الخريطة غير موجود أو غير مرتبط على Drive');
      }
      if(l.layer_type==='vector'&&!l.geojson)throw new Error('ملف GeoJSON غير موجود أو غير مرتبط على Drive');
      return l;
    }).finally(()=>{l._dataPromise=null});
    return l._dataPromise;
  }

  // Overview map
  let overviewMap=null;
  async function initOverviewMap(){
    await window.GeoMineDeps?.ensureLeaflet?.();
    if(typeof L==='undefined'||!$('overviewMap')||overviewMap)return;
    overviewMap=L.map('overviewMap',{center:[26,33.5],zoom:6,zoomControl:true,attributionControl:false,scrollWheelZoom:false});
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18}).addTo(overviewMap);
    const addGeo=async(id,style,point)=>{try{const l=(D.geological_layers||[]).find(x=>x.layer_id===id);await ensureLayerData(l);L.geoJSON(l.geojson,{style,pointToLayer:(f,ll)=>L.circleMarker(ll,point||style)}).addTo(overviewMap)}catch(e){console.warn(e)}};
    // Run independently so one missing layer does not block the others.
    await Promise.allSettled([
      addGeo('VECTOR-GDB-BOUNDARY',{color:'#d8a62c',weight:1,fillOpacity:.02}),
      addGeo('VECTOR-GDB-ORE-POINT',{}, {radius:2.5,color:'#0a4027',fillColor:'#23bd78',fillOpacity:.85,weight:1}),
      addGeo('VECTOR-MINES',{}, {radius:4,color:'#0b3250',fillColor:'#23a5e6',fillOpacity:.95,weight:1.5})
    ]);
  }

  // Main map
  let geoMap=null, activeBase='sat', layerFilter='all', selectedLayerId=null;
  const activeLayers={};
  const baseMaps={};
  const layerStyles={
    'VECTOR-GDB-BOUNDARY':{color:'#d8a62c',weight:2,fillOpacity:.04},
    'VECTOR-GDB-ORE-BOUNDARY':{color:'#ef5350',weight:1.5,fillOpacity:.12},
    'VECTOR-GDB-ORE-POINT':{radius:4,color:'#06351f',fillColor:'#23bd78',fillOpacity:.9,weight:1},
    'VECTOR-EXCEL-OCC':{radius:3,color:'#064357',fillColor:'#23a5e6',fillOpacity:.8,weight:1},
    'VECTOR-ASSAYS':{radius:4,color:'#4c1554',fillColor:'#d96ef0',fillOpacity:.9,weight:1},
    'VECTOR-TALC-SITES':{radius:5,color:'#3c176b',fillColor:'#a06cf1',fillOpacity:.9,weight:1},
    'VECTOR-MINES':{radius:6,color:'#06324b',fillColor:'#35b8ef',fillOpacity:.95,weight:1.5},
    'VECTOR-GOLD':{color:'#e7c52c',weight:1.1,fillColor:'#e7c52c',fillOpacity:.13},
    'VECTOR-TALC':{color:'#a06cf1',weight:1.1,fillColor:'#a06cf1',fillOpacity:.15},
    'VECTOR-KAOLIN':{color:'#44ce79',weight:1.1,fillColor:'#44ce79',fillOpacity:.15},
    'VECTOR-PHOSPHATE':{color:'#f38a39',weight:1.1,fillColor:'#f38a39',fillOpacity:.15}
  };
  function layerColor(l){return l.color||layerStyles[l.layer_id]?.color||layerStyles[l.layer_id]?.fillColor||'#fff'}
  function qualityClass(l){return String(l.bounds_quality||'').includes('دقيق')?'precise':'estimated'}
  async function addLayer(l,fit=false){
    if(!geoMap||activeLayers[l.layer_id]){if(fit&&activeLayers[l.layer_id]?.getBounds)geoMap.fitBounds(activeLayers[l.layer_id].getBounds(),{padding:[20,20]});return activeLayers[l.layer_id];}
    try{
      let layer;await ensureLayerData(l);
      if(l.layer_type==='raster'){
        if(!Array.isArray(l.bounds))throw new Error('حدود الخريطة غير متاحة');
        layer=L.imageOverlay(l.asset,l.bounds,{opacity:Number(l.default_opacity)||.55,interactive:true});
        layer.on('click',()=>inspectLayer(l));
      }else{
        const gj=l.geojson,st=layerStyles[l.layer_id]||{color:layerColor(l),weight:1.5,fillOpacity:.15,radius:4,fillColor:layerColor(l)};
        layer=L.geoJSON(gj,{style:st,pointToLayer:(f,ll)=>L.circleMarker(ll,st),onEachFeature:(f,ly)=>{const p=f.properties||{};ly.on('click',()=>{inspectLayer(l,p);const rows=Object.entries(p).filter(([,v])=>v!==null&&v!==''&&v!==undefined&&typeof v!=='object').slice(0,12).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');ly.bindPopup(`<table>${rows}</table>`).openPopup();});}});
      }
      layer.addTo(geoMap);activeLayers[l.layer_id]=layer;
      renderLayerList();updateLayerUi();if(fit&&layer.getBounds)geoMap.fitBounds(layer.getBounds(),{padding:[20,20]});
      return layer;
    }catch(e){console.error(e);showToast('تعذر تحميل الطبقة: '+l.title);}
  }
  function removeLayer(l){if(activeLayers[l.layer_id]){geoMap.removeLayer(activeLayers[l.layer_id]);delete activeLayers[l.layer_id];renderLayerList();updateLayerUi();}}
  function inspectLayer(l,props){
    selectedLayerId=l.layer_id;
    $('layerInspector').innerHTML=`<div class="inspector-title" style="color:${layerColor(l)}">${esc(l.title)}</div><div class="inspector-meta"><span>النوع</span><span>${esc(l.layer_type)}</span><span>المصدر</span><span>${esc(l.source_file||l.asset)}</span><span>التقرير</span><span>${esc(l.report_code||'—')}</span><span>جودة الحدود</span><span>${esc(l.bounds_quality||'—')}</span><span>الحالة</span><span>${esc(l.status||'—')}</span>${props?Object.entries(props).filter(([,v])=>v!==null&&v!==''&&typeof v!=='object').slice(0,5).map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v)}</span>`).join(''):''}</div>`;
    renderLayerList();
  }
  function updateLayerUi(){
    const list=(D.geological_layers||[]).filter(l=>activeLayers[l.layer_id]);
    $('activeLayersCounter').textContent=`${fmt(list.length)} طبقة ظاهرة`;
    $('mapLegend').classList.toggle('visible',list.length>0);
    $('mapLegend').innerHTML=list.slice(0,10).map(l=>`<div class="legend-row"><i class="legend-swatch" style="background:${layerColor(l)}"></i><span>${esc(l.title)}</span></div>`).join('');
  }
  function layerMatchesFilter(l){
    if(layerFilter==='all')return true;
    if(layerFilter==='vector'||layerFilter==='raster')return l.layer_type===layerFilter;
    return qualityClass(l)===layerFilter;
  }
  function renderLayerList(){
    const q=($('layerSearch')?.value||'').toLowerCase();
    const layers=(D.geological_layers||[]).filter(l=>layerMatchesFilter(l)&&(`${l.title} ${l.report_code||''} ${l.source_file||''}`).toLowerCase().includes(q));
    const groups=[['طبقات Vector',layers.filter(l=>l.layer_type==='vector')],['الخرائط الجيولوجية Raster',layers.filter(l=>l.layer_type==='raster')]];
    $('layerList').innerHTML=groups.map(([title,ls])=>ls.length?`<div class="layer-group-title">${title} · ${fmt(ls.length)}</div>${ls.map(l=>{const on=!!activeLayers[l.layer_id];return `<div class="layer-item ${on||selectedLayerId===l.layer_id?'active':''}" data-layer-row="${esc(l.layer_id)}"><div class="layer-top"><input class="layer-toggle" type="checkbox" data-layer-toggle="${esc(l.layer_id)}" ${on?'checked':''}><i class="layer-color" style="background:${layerColor(l)}"></i><button class="layer-name" data-layer-inspect="${esc(l.layer_id)}">${esc(l.title)}</button><span class="layer-type">${l.layer_type==='vector'?'VECTOR':'RASTER'}</span></div><div class="layer-meta"><span>${esc(l.report_code||l.source_archive||'')}</span><span>${esc(l.bounds_quality||'')}</span></div><div class="layer-opacity-wrap"><input data-layer-opacity="${esc(l.layer_id)}" type="range" min="0" max="1" step=".05" value="${activeLayers[l.layer_id]?activeLayers[l.layer_id].options?.opacity??l.default_opacity:l.default_opacity||.55}"><span>${Math.round((l.default_opacity||.55)*100)}%</span></div></div>`}).join('')}`:'').join('');
    $$('[data-layer-toggle]',$('layerList')).forEach(x=>x.onchange=()=>{const l=(D.geological_layers||[]).find(a=>a.layer_id===x.dataset.layerToggle);x.checked?addLayer(l):removeLayer(l)});
    $$('[data-layer-inspect]',$('layerList')).forEach(x=>x.onclick=()=>inspectLayer((D.geological_layers||[]).find(a=>a.layer_id===x.dataset.layerInspect)));
    $$('[data-layer-opacity]',$('layerList')).forEach(x=>x.oninput=()=>{const l=activeLayers[x.dataset.layerOpacity];const pct=x.parentElement.querySelector('span');pct.textContent=Math.round(Number(x.value)*100)+'%';if(l?.setOpacity)l.setOpacity(Number(x.value));else if(l?.setStyle)l.setStyle({opacity:Number(x.value),fillOpacity:Number(x.value)*.25});});
  }
  function activateLayerById(id,fit=false){const l=(D.geological_layers||[]).find(x=>x.layer_id===id);if(l){inspectLayer(l);addLayer(l,fit);}}
  async function initMainMap(){
    await window.GeoMineDeps?.ensureLeaflet?.();
    if(typeof L==='undefined'||!$('geoMap')||geoMap)return geoMap;
    geoMap=L.map('geoMap',{center:[26,33.6],zoom:6,zoomControl:true});
    baseMaps.sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19});
    baseMaps.street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});
    baseMaps.topo=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17});
    baseMaps.sat.addTo(geoMap);
    geoMap.on('mousemove',e=>$('mapCoordinate').textContent=`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} · WGS 84`);
    (D.geological_layers||[]).filter(l=>l.default_visible).forEach(l=>addLayer(l));
    renderLayerList();
  }
  $('layerSearch')?.addEventListener('input',renderLayerList);
  $$('#layerChips button').forEach(b=>b.onclick=()=>{$$('#layerChips button').forEach(x=>x.classList.remove('active'));b.classList.add('active');layerFilter=b.dataset.layerFilter;renderLayerList();});
  $$('[data-base]').forEach(b=>b.onclick=()=>{if(!geoMap)return;geoMap.removeLayer(baseMaps[activeBase]);activeBase=b.dataset.base;baseMaps[activeBase].addTo(geoMap);$$('[data-base]').forEach(x=>x.classList.toggle('active',x===b));});
  $('clearLayers')?.addEventListener('click',()=>{Object.values(activeLayers).forEach(l=>geoMap.removeLayer(l));Object.keys(activeLayers).forEach(k=>delete activeLayers[k]);renderLayerList();updateLayerUi();});
  $('showCoreLayers')?.addEventListener('click',()=>['VECTOR-GDB-BOUNDARY','VECTOR-GDB-ORE-POINT','VECTOR-MINES'].forEach(id=>activateLayerById(id)));
  $('fitEgypt')?.addEventListener('click',()=>geoMap?.fitBounds([[22,25],[31.8,36.8]]));
  $('fitActive')?.addEventListener('click',()=>{const group=L.featureGroup(Object.values(activeLayers));if(group.getLayers().length)geoMap.fitBounds(group.getBounds(),{padding:[20,20]});else geoMap.fitBounds([[22,25],[31.8,36.8]]);});
  $('mapFullscreen')?.addEventListener('click',()=>{const el=$('map')?.querySelector('.map-stage');if(!el)return;if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.();setTimeout(()=>geoMap?.invalidateSize(),150)});
  $('collapseLayers')?.addEventListener('click',()=>{const p=document.querySelector('.layer-panel');p.classList.toggle('collapsed');document.querySelector('.map-workspace').style.gridTemplateColumns=p.classList.contains('collapsed')?'62px 1fr':'';setTimeout(()=>geoMap?.invalidateSize(),260)});

  // Geology
  let geoRows=[
    ...(D.gdb_ore_points||[]).map(r=>({...r,_source:'gdb',_sourceLabel:'File GDB',_lat:r.centroid_lat,_lon:r.centroid_lon})),
    ...(D.excel_occurrences||[]).map(r=>({...r,_source:'excel',_sourceLabel:'Excel',_lat:r.latitude,_lon:r.longitude}))
  ];
  function refreshDerivedData(){
    oreCounts=buildOreCounts();
    geoRows=[
      ...(D.gdb_ore_points||[]).map(r=>({...r,_source:'gdb',_sourceLabel:'File GDB',_lat:r.centroid_lat,_lon:r.centroid_lon})),
      ...(D.excel_occurrences||[]).map(r=>({...r,_source:'excel',_sourceLabel:'Excel',_lat:r.latitude,_lon:r.longitude}))
    ];
  }
  function initGeology(){
    const oreOptions=[...new Set(geoRows.flatMap(r=>splitOreNames(r.Ore_Name)))].sort((a,b)=>a.localeCompare(b,'ar'));
    $('oreFilter').innerHTML='<option value="">كل الخامات</option>'+oreOptions.map(x=>`<option>${esc(x)}</option>`).join('');
    const years=[...new Set(geoRows.map(r=>Number(r.Report_Date)).filter(Boolean))].sort((a,b)=>b-a);
    $('yearFilter').innerHTML='<option value="">كل السنوات</option>'+years.map(x=>`<option>${x}</option>`).join('');
    $('geoSummaryPills').innerHTML=[['إجمالي السجلات',geoRows.length],['File GDB',counts.gdb_ore_points],['Excel',counts.excel_ore_occurrences],['حدود خامات',counts.gdb_ore_boundaries]].map(x=>`<div class="summary-pill"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('');
    renderDonut('oreDonut',Object.entries(oreCounts).sort((a,b)=>b[1]-a[1]).slice(0,7),'سجلات خامات');
    const yc=groupCount(D.excel_reports||[],r=>Number(r.Report_Date)||null);renderTimeline('reportTimelineChart',yc);
    const gdbCoord=(D.gdb_ore_points||[]).filter(r=>num(r.centroid_lat)!==null&&num(r.centroid_lon)!==null).length,excelCoord=(D.excel_occurrences||[]).filter(r=>num(r.latitude)!==null&&num(r.longitude)!==null).length;
    $('coordinateQuality').innerHTML=[['File GDB',gdbCoord,counts.gdb_ore_points,'#23bd78'],['Excel',excelCoord,counts.excel_ore_occurrences,'#23a5e6'],['الإجمالي',gdbCoord+excelCoord,geoRows.length,'#ff5b2e']].map(x=>`<div class="stack-item"><div class="stack-head"><span>${x[0]}</span><b>${fmt(x[1])} / ${fmt(x[2])}</b></div><div class="stack-track"><i style="width:${x[2]?x[1]/x[2]*100:0}%;background:${x[3]}"></i></div></div>`).join('');
    renderGeoTable();
  }
  function filteredGeo(){
    const q=($('geoSearch').value||'').toLowerCase(),ore=$('oreFilter').value,year=$('yearFilter').value,source=$('geoSourceFilter').value;
    return geoRows.filter(r=>(!source||r._source===source)&&(!year||String(r.Report_Date)===year)&&(!ore||splitOreNames(r.Ore_Name).includes(ore))&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
  }
  function renderGeoTable(){
    const rows=filteredGeo();currentTableData=rows;const shown=Math.min(rows.length,400);$('geoTableCount').textContent=rows.length>shown?`${fmt(rows.length)} سجل · عرض أول ${fmt(shown)}`:`${fmt(rows.length)} سجل`;
    $('geoTable').innerHTML=rows.slice(0,400).map((r,i)=>`<tr><td><span class="source-pill ${r._source}">${r._sourceLabel}</span></td><td>${esc(r.Ore_Name)}</td><td>${esc(r.Ore_Locality||r.AreaName||'')}</td><td>${esc(r.ReportNumber||r.report_code||'')}</td><td>${esc(r.Report_Date||'')}</td><td dir="ltr">${r._lat??''}${r._lat!=null?', ':''}${r._lon??''}</td><td>${esc(r.Ore_Grade||r.Comment||'')}</td><td><button class="table-action" data-geo-detail="${i}">⋯</button></td></tr>`).join('');
    $$('[data-geo-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.geoDetail)];openDetails(r._sourceLabel,r.Ore_Name||'سجل خام',r)});
  }
  ['geoSearch','oreFilter','yearFilter','geoSourceFilter'].forEach(id=>$(id)?.addEventListener(id==='geoSearch'?'input':'change',renderGeoTable));
  $('geoReset')?.addEventListener('click',()=>{['geoSearch','oreFilter','yearFilter','geoSourceFilter'].forEach(id=>$(id).value='');renderGeoTable()});

  // Samples
  const assayElements=['Au_ppm','Ag_ppm','Cu_ppm','Pb_ppm','Zn_ppm','Ni_ppm','Li_ppm'];
  function initSamples(){
    const assays=D.assays||[],reports=[...new Set(assays.map(r=>r['التقرير']).filter(Boolean))].sort();
    $('assayReportFilter').innerHTML='<option value="">كل التقارير</option>'+reports.map(x=>`<option>${esc(x)}</option>`).join('');
    const elementCounts=assayElements.map(k=>[k.replace('_ppm',''),assays.filter(r=>num(r[k])!==null).length]);
    $('assayKpis').innerHTML=[['إجمالي العينات',assays.length],['تقارير',reports.length],['عينات بإحداثيات',assays.filter(r=>num(r.Latitude)!==null&&num(r.Longitude)!==null).length],['قيم Au رقمية',elementCounts[0][1]],['قيم Cu رقمية',elementCounts[2][1]],['مواقع التلك',counts.legacy_talc_sites]].map(x=>`<div class="mini-kpi"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('');
    renderBars('assayElementBars',elementCounts,{limit:10});
    const top=assays.filter(r=>num(r.Au_ppm)!==null).sort((a,b)=>b.Au_ppm-a.Au_ppm).slice(0,8);
    $('topAuSamples').innerHTML=top.map((r,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><div><b>${esc(r.Sample_ID||'—')}</b><small>${esc(r['المنطقة']||'')} · ${esc(r['التقرير']||'')}</small></div><span class="rank-value">${fmt(r.Au_ppm,3)} ppm</span></div>`).join('')||'<div class="inspector-placeholder">لا توجد قيم Au رقمية</div>';
    renderAssayTable();
    const talc=D.talc_xrf||[],tReports=[...new Set(talc.map(r=>r['التقرير']).filter(Boolean))].sort();
    $('talcReportFilter').innerHTML='<option value="">كل التقارير</option>'+tReports.map(x=>`<option>${esc(x)}</option>`).join('');
    const comps=['SiO2','TiO2','Al2O3','Fe2O3','MnO','MgO','CaO','Na2O','K2O','P2O5','SO3','LOI'];
    $('talcKpis').innerHTML=[['تحاليل XRF',talc.length],['تقارير',tReports.length],['مناطق',new Set(talc.map(r=>r['المنطقة']).filter(Boolean)).size],['مكونات رقمية',comps.reduce((s,k)=>s+talc.filter(r=>num(r[k])!==null).length,0)],['مواقع بإحداثيات',counts.legacy_talc_sites],['نتائج رئيسية',D.key_results?.length||0]].map(x=>`<div class="mini-kpi"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('');
    const avgs=comps.map(k=>[k,avg(talc.map(r=>num(r[k])).filter(v=>v!==null))]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);renderBars('talcAverageBars',avgs,{limit:12,digits:2,format:v=>fmt(v,2)+'%'});
    $('talcSiteList').innerHTML=(D.talc_sites||[]).slice().sort((a,b)=>(Number(b['الاحتياطي المعلن طن'])||0)-(Number(a['الاحتياطي المعلن طن'])||0)).slice(0,8).map((r,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><div><b>${esc(r['المنطقة'])}</b><small>${esc(r['الوصول']||'')}</small></div><span class="rank-value">${r['الاحتياطي المعلن طن']?compact(r['الاحتياطي المعلن طن'])+' طن':'—'}</span></div>`).join('');
    renderTalcTable();
  }
  function filteredAssays(){const q=($('assaySearch').value||'').toLowerCase(),rep=$('assayReportFilter').value;return (D.assays||[]).filter(r=>(!rep||r['التقرير']===rep)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));}
  function renderAssayTable(){const rows=filteredAssays();$('assayTableCount').textContent=`${fmt(rows.length)} عينة`;$('assayTable').innerHTML=rows.map((r,i)=>`<tr><td>${esc(r.Sample_ID)}</td><td>${esc(r['التقرير'])}</td><td>${esc(r['المنطقة'])}</td><td>${esc(r['نوع العينة'])}</td><td>${r.Au_raw??r.Au_ppm??''}</td><td>${r.Ag_raw??r.Ag_ppm??''}</td><td>${r.Cu_raw??r.Cu_ppm??''}</td><td>${r.Pb_raw??r.Pb_ppm??''}</td><td>${r.Zn_raw??r.Zn_ppm??''}</td><td dir="ltr">${r.Latitude??''}${r.Latitude!=null?', ':''}${r.Longitude??''}</td><td><button class="table-action" data-assay-detail="${i}">⋯</button></td></tr>`).join('');$$('[data-assay-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.assayDetail)];openDetails('عينة تحليل',r.Sample_ID||'Sample',r)});}
  ['assaySearch','assayReportFilter'].forEach(id=>$(id)?.addEventListener(id==='assaySearch'?'input':'change',renderAssayTable));
  $('assayReset')?.addEventListener('click',()=>{$('assaySearch').value='';$('assayReportFilter').value='';renderAssayTable()});
  function filteredTalc(){const q=($('talcSearch').value||'').toLowerCase(),rep=$('talcReportFilter').value;return (D.talc_xrf||[]).filter(r=>(!rep||r['التقرير']===rep)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));}
  function renderTalcTable(){const rows=filteredTalc();$('talcTableCount').textContent=`${fmt(rows.length)} تحليل`;$('talcTable').innerHTML=rows.map((r,i)=>`<tr><td>${esc(r['التقرير'])}</td><td>${esc(r['المنطقة'])}</td><td>${esc(r['العينة/مرحلة المعالجة'])}</td><td>${r.SiO2_raw??r.SiO2??''}</td><td>${r.Al2O3_raw??r.Al2O3??''}</td><td>${r.Fe2O3_raw??r.Fe2O3??''}</td><td>${r.MgO_raw??r.MgO??''}</td><td>${r.CaO_raw??r.CaO??''}</td><td>${r.LOI_raw??r.LOI??''}</td><td>${esc(r['صفحة المصدر'])}</td><td><button class="table-action" data-talc-detail="${i}">⋯</button></td></tr>`).join('');$$('[data-talc-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.talcDetail)];openDetails('تحليل XRF',r['المنطقة']||'Talc XRF',r)});}
  ['talcSearch','talcReportFilter'].forEach(id=>$(id)?.addEventListener(id==='talcSearch'?'input':'change',renderTalcTable));
  $('talcReset')?.addEventListener('click',()=>{$('talcSearch').value='';$('talcReportFilter').value='';renderTalcTable()});
  $$('[data-sample-tab]').forEach(b=>b.onclick=()=>{$$('[data-sample-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('.sample-tab').forEach(x=>x.classList.remove('active'));$(b.dataset.sampleTab==='assays'?'assaysTab':'talcTab').classList.add('active')});

  // Mines & blocks
  const matColors={magnetite:'#23bd78',hematite:'#ef5350',limonite:'#d8a62c'};
  function initMines(){
    const mines=D.html_mines||[],blocks=D.html_blocks||[],prod=mines.reduce((s,m)=>s+(Number(m.qty)||0),0),registered=mines.filter(m=>m.status==='registered').length;
    $('mineSummaryPills').innerHTML=[['المناجم',mines.length],['المسجل',registered],['طن/شهر',compact(prod)],['البلوكات',blocks.length]].map(x=>`<div class="summary-pill"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    renderDonut('mineMaterialDonut',Object.entries(groupCount(mines,r=>r.mat)).sort((a,b)=>b[1]-a[1]),'مناجم');
    renderBars('mineProductionBars',mines.map(m=>[m.name,Number(m.qty)||0]).sort((a,b)=>b[1]-a[1]),{limit:8,format:v=>compact(v)});
    renderBars('blockTypeBars',Object.entries(groupCount(blocks,r=>r.ore)).sort((a,b)=>b[1]-a[1]),{limit:8});
    renderMineCards();renderBlocks();
  }
  function filteredMines(){const q=($('mineSearch').value||'').toLowerCase(),mat=$('mineMatFilter').value,st=$('mineStatusFilter').value;return (D.html_mines||[]).filter(m=>(!mat||m.mat===mat)&&(!st||m.status===st)&&(!q||JSON.stringify(m).toLowerCase().includes(q)));}
  function renderMineCards(){const rows=filteredMines();$('mineCards').innerHTML=rows.map(m=>{const original=(D.html_mines||[]).indexOf(m),c=matColors[m.mat]||'#23a5e6';return `<article class="mine-card" style="--mine-color:${c}" data-mine-index="${original}"><div class="mine-head"><span class="mine-code">${esc(m.code)}</span><div><b>${esc(m.name)}</b><small>${esc(m.gov)} · ${esc(m.region)}</small></div><span class="status-badge ${m.status==='registered'?'':'off'}">${m.status==='registered'?'مسجل':'غير مسجل'}</span></div><div class="mine-grid"><div class="mine-metric"><span>الخامة</span><b>${esc(m.mat)}</b></div><div class="mine-metric"><span>Fe</span><b>${fmt((Number(m.fe)||0)*100,1)}%</b></div><div class="mine-metric"><span>طن/شهر</span><b>${compact(m.qty)}</b></div><div class="mine-metric"><span>البلوك</span><b>${esc(m.block)}</b></div></div><div class="mine-owner">المالك: ${esc(m.owner||'—')} · العقد: ${esc(m.contract||'—')}</div><button class="text-btn" data-mine-detail="${original}">عرض التفاصيل</button></article>`}).join('');$$('[data-mine-detail]').forEach(b=>b.onclick=()=>{const m=(D.html_mines||[])[Number(b.dataset.mineDetail)];openDetails('منجم',m.name,m)});}
  ['mineSearch','mineMatFilter','mineStatusFilter'].forEach(id=>$(id)?.addEventListener(id==='mineSearch'?'input':'change',renderMineCards));
  $('mineReset')?.addEventListener('click',()=>{['mineSearch','mineMatFilter','mineStatusFilter'].forEach(id=>$(id).value='');renderMineCards()});
  function renderBlocks(){const ore=$('blockOreFilter')?.value||'',rows=(D.html_blocks||[]).filter(r=>!ore||r.ore===ore);$('blockTableCount').textContent=fmt(rows.length);$('blockTable').innerHTML=rows.slice(0,1200).map(r=>{let n=0;try{n=JSON.parse(r.coordinates_json||'[]').length}catch(e){}return `<tr><td>${esc(r.id)}</td><td>${esc(r.ore)}</td><td>${esc(r.area??'')}</td><td>${esc(r.block_set)}</td><td>${esc((r.pages||[]).join(', '))}</td><td>${n}</td></tr>`}).join('');}
  $('blockOreFilter')?.addEventListener('change',renderBlocks);

  // Documents and maps
  function initDocuments(){
    const docs=D.pdf_documents||[],rasters=(D.geological_layers||[]).filter(l=>l.layer_type==='raster'),reports=D.excel_reports||[];
    $('docSummaryPills').innerHTML=[['PDF',docs.length],['خرائط Raster',rasters.length],['تقارير Excel',reports.length],['صفحات PDF',compact(counts.pdf_pages)]].map(x=>`<div class="summary-pill"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    const docYears=[...new Set(docs.map(r=>Number(r.year)).filter(Boolean))].sort((a,b)=>b-a);$('docYear').innerHTML='<option value="">كل السنوات</option>'+docYears.map(x=>`<option>${x}</option>`).join('');
    const reportYears=[...new Set(reports.map(r=>Number(r.Report_Date)).filter(Boolean))].sort((a,b)=>b-a);$('reportYear').innerHTML='<option value="">كل السنوات</option>'+reportYears.map(x=>`<option>${x}</option>`).join('');
    renderDocs();renderMapGallery();renderReportTable();
  }
  function filteredDocs(){const q=($('docSearch').value||'').toLowerCase(),s=$('docText').value,y=$('docYear').value;return (D.pdf_documents||[]).filter(r=>(!y||String(r.year)===y)&&(!s||(s==='searchable'?Number(r.text_pages_nonempty)>0:Number(r.text_pages_nonempty)===0))&&(!q||JSON.stringify(r).toLowerCase().includes(q)));}
  function renderDocs(){const rows=filteredDocs();$('docGrid').innerHTML=rows.map((r,i)=>`<article class="doc-card"><div class="doc-icon">PDF</div><div class="doc-top-actions"><button class="table-action" data-doc-download="${i}" title="تنزيل">⇩</button><button class="table-action" data-doc-detail="${i}">⋯</button></div><h4>${esc(r.title_ar||r.title_original||r.file_name)}</h4><p>${esc(r.review_summary||r.primary_path||'')}</p><div class="doc-pills"><span class="pill">${fmt(r.page_count)} صفحة</span><span class="pill">${Number(r.text_pages_nonempty)>0?'نص مضمّن':'مسح ضوئي'}</span>${r.year?`<span class="pill">${r.year}</span>`:''}</div></article>`).join('');$$('[data-doc-download]').forEach(b=>b.onclick=()=>window.GeoMineDownloads?.downloadByAsset(rows[Number(b.dataset.docDownload)].file_name||rows[Number(b.dataset.docDownload)].primary_path));$$('[data-doc-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.docDetail)];openDetails('وثيقة PDF',r.title_ar||r.title_original||r.file_name,r)});}
  ['docSearch','docText','docYear'].forEach(id=>$(id)?.addEventListener(id==='docSearch'?'input':'change',renderDocs));
  $('docReset')?.addEventListener('click',()=>{['docSearch','docText','docYear'].forEach(id=>$(id).value='');renderDocs()});
  function filteredMaps(){const q=($('mapGallerySearch').value||'').toLowerCase(),quality=$('mapQualityFilter').value;return (D.geological_layers||[]).filter(l=>l.layer_type==='raster'&&(!quality||qualityClass(l)===quality)&&(!q||JSON.stringify(l).toLowerCase().includes(q)));}
  function renderMapGallery(){
    const rows=filteredMaps();
    $('mapGallery').innerHTML=rows.map((l,i)=>`<article class="map-thumb"><div class="map-thumb-image"><img loading="lazy" data-raster-thumb="${esc(l.layer_id)}" alt="${esc(l.title)}"><span>${esc(l.bounds_quality||'')}</span></div><div class="map-thumb-copy"><b>${esc(l.title)}</b><small>${esc(l.source_file||l.asset_path||'')}</small><div class="map-thumb-actions three"><button data-map-layer="${esc(l.layer_id)}">عرض على الخريطة</button><button data-map-download="${i}">تنزيل</button><button data-map-detail="${i}">التفاصيل</button></div></div></article>`).join('');
    const loadThumb=async img=>{const l=rows.find(x=>x.layer_id===img.dataset.rasterThumb);if(!l||img.dataset.loaded)return;img.dataset.loaded='1';img.classList.add('is-loading');try{await ensureLayerData(l);img.src=l.asset;img.classList.remove('is-error')}catch(e){img.classList.add('is-error');img.alt='تعذر تحميل المعاينة'}finally{img.classList.remove('is-loading')}};
    const imgs=$$('[data-raster-thumb]',$('mapGallery'));
    if('IntersectionObserver' in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);loadThumb(e.target)}}),{rootMargin:'300px'});imgs.forEach(img=>io.observe(img));}else imgs.slice(0,8).forEach(loadThumb);
    $$('[data-map-layer]').forEach(b=>b.onclick=()=>{goPage('map').then(ok=>{if(ok)activateLayerById(b.dataset.mapLayer,true)}).catch(()=>{})});
    $$('[data-map-download]').forEach(b=>b.onclick=()=>window.GeoMineDownloads?.downloadLayer(rows[Number(b.dataset.mapDownload)].layer_id));
    $$('[data-map-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.mapDetail)];openDetails('خريطة جيولوجية',r.title,r)});
  }
  ['mapGallerySearch','mapQualityFilter'].forEach(id=>$(id)?.addEventListener(id==='mapGallerySearch'?'input':'change',renderMapGallery));
  function filteredReports(){const q=($('reportSearch').value||'').toLowerCase(),y=$('reportYear').value;return (D.excel_reports||[]).filter(r=>(!y||String(r.Report_Date)===y)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));}
  function renderReportTable(){const rows=filteredReports();$('reportTable').innerHTML=rows.map((r,i)=>`<tr><td>${esc(r.ReportNumber)}</td><td>${esc(r.Report_Date)}</td><td>${esc(r.Report_Title)}</td><td>${esc(r.Author)}</td><td>${esc(r.AreaName)}</td><td>${esc(r.Study_Scale)}</td><td><button class="table-action" data-report-detail="${i}">⋯</button></td></tr>`).join('');$$('[data-report-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.reportDetail)];openDetails('سجل تقرير',r.ReportNumber,r)});}
  ['reportSearch','reportYear'].forEach(id=>$(id)?.addEventListener(id==='reportSearch'?'input':'change',renderReportTable));
  $$('[data-doc-tab]').forEach(b=>b.onclick=()=>{$$('[data-doc-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('.doc-tab').forEach(x=>x.classList.remove('active'));$({pdf:'pdfDocTab',maps:'mapDocTab',reports:'reportDocTab'}[b.dataset.docTab]).classList.add('active')});

  // Data library
  function initData(){
    const inv=D.file_inventory||[],types=Object.entries(groupCount(inv,r=>r.file_type||'Other')).sort((a,b)=>b[1]-a[1]);
    $('dataSummaryPills').innerHTML=[['الأرشيفات',counts.source_archives],['ملفات مستخرجة',counts.source_file_instances],['ملفات فريدة',counts.unique_files],['Excel',counts.excel_workbooks]].map(x=>`<div class="summary-pill"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('');
    $('dataTypeCards').innerHTML=types.slice(0,7).map((x,i)=>`<div class="data-type-card"><i style="background:${colors[i%colors.length]}">${['DB','PDF','GIS','XLS','IMG','ZIP','FILE'][i]}</i><b>${fmt(x[1])}</b><span>${esc(x[0])}</span></div>`).join('');
    const exts=[...new Set(inv.map(r=>r.ext).filter(Boolean))].sort(),archives=[...new Set(inv.map(r=>r.archive).filter(Boolean))].sort();
    $('fileExt').innerHTML='<option value="">كل الامتدادات</option>'+exts.map(x=>`<option>${esc(x)}</option>`).join('');$('fileArchive').innerHTML='<option value="">كل الأرشيفات</option>'+archives.map(x=>`<option>${esc(x)}</option>`).join('');renderFiles();
  }
  function filteredFiles(){const q=($('fileSearch').value||'').toLowerCase(),ext=$('fileExt').value,arc=$('fileArchive').value;return (D.file_inventory||[]).filter(r=>(!ext||r.ext===ext)&&(!arc||r.archive===arc)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));}
  function renderFiles(){const rows=filteredFiles();$('fileTableCount').textContent=`${fmt(rows.length)} ملف`;$('fileTable').innerHTML=rows.slice(0,2500).map((r,i)=>`<tr><td>${esc(r.archive)}</td><td>${esc(r.name)}</td><td>${esc(r.file_type)}</td><td>${esc(r.size_mb)}</td><td>${esc(r.ext)}</td><td>${esc(r.relative_path)}</td><td title="${esc(r.sha256)}">${esc(String(r.sha256||'').slice(0,12))}…</td><td><div class="row-actions"><button class="download-mini" data-file-download="${i}" title="تنزيل">⇩</button><button class="table-action" data-file-detail="${i}">⋯</button></div></td></tr>`).join('');$$('[data-file-download]').forEach(b=>b.onclick=()=>window.GeoMineDownloads?.downloadInventoryRow(rows[Number(b.dataset.fileDownload)]));$$('[data-file-detail]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.fileDetail)];openDetails('ملف مصدر',r.name,r)});}
  ['fileSearch','fileExt','fileArchive'].forEach(id=>$(id)?.addEventListener(id==='fileSearch'?'input':'change',renderFiles));
  $('fileReset')?.addEventListener('click',()=>{['fileSearch','fileExt','fileArchive'].forEach(id=>$(id).value='');renderFiles()});

  // Search
  function runGlobalSearch(q){
    q=String(q||'').trim().toLowerCase();if(q.length<2){closeOverlay('searchDrawer');return;}
    const sets=[
      ['المناجم','⛏',(D.html_mines||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,10),r=>r.name,r=>`${r.gov||''} · ${r.mat||''}`,'mines'],
      ['سجلات الخامات','◆',geoRows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,12),r=>r.Ore_Name||'خام',r=>`${r.Ore_Locality||''} · ${r.ReportNumber||''}`,'geology'],
      ['التقارير','▤',(D.excel_reports||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,10),r=>r.Report_Title||r.ReportNumber,r=>`${r.ReportNumber||''} · ${r.Report_Date||''}`,'documents'],
      ['الوثائق','PDF',(D.pdf_documents||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,10),r=>r.title_ar||r.title_original||r.file_name,r=>r.primary_path||'','documents'],
      ['الملفات','FILE',(D.file_inventory||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,10),r=>r.name,r=>r.relative_path||'','data']
    ];
    const total=sets.reduce((s,x)=>s+x[2].length,0);$('searchResultCount').textContent=`${fmt(total)} نتيجة سريعة`;
    $('searchResults').innerHTML=sets.filter(x=>x[2].length).map(set=>`<div class="search-group-title">${set[0]}</div>${set[2].map((r,i)=>`<div class="search-result" data-search-page="${set[6]}" data-search-set="${esc(set[0])}" data-search-index="${i}"><i>${set[1]}</i><div><b>${esc(set[3](r))}</b><small>${esc(set[4](r))}</small></div><em>${set[0]}</em></div>`).join('')}`).join('')||'<div class="inspector-placeholder">لا توجد نتائج مطابقة</div>';
    $$('.search-result').forEach(x=>x.onclick=()=>{goPage(x.dataset.searchPage);closeOverlay('searchDrawer')});openOverlay('searchDrawer');
  }
  let searchTimer;$('globalSearch')?.addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>runGlobalSearch(e.target.value),180)});

  // Smart insights (data-derived only)
  function renderInsights(){
    const mines=D.html_mines||[],prod=[...mines].sort((a,b)=>(Number(b.qty)||0)-(Number(a.qty)||0)),au=(D.assays||[]).map(r=>num(r.Au_ppm)).filter(v=>v!==null),topOre=Object.entries(oreCounts).sort((a,b)=>b[1]-a[1])[0],scanned=(D.pdf_documents||[]).filter(r=>Number(r.text_pages_nonempty)===0).length;
    const items=[
      ['أعلى إنتاج شهري معلن',prod[0]?`${prod[0].name}: ${compact(prod[0].qty)} طن/شهر`:'لا توجد قيمة إنتاجية رقمية.'],
      ['أكثر خام تكرارًا في السجلات',topOre?`${topOre[0]} بعدد ${fmt(topOre[1])} ظهورًا بعد تقسيم أسماء الخامات المركبة.`:'لا توجد أسماء خامات.'],
      ['عينات الذهب الرقمية',au.length?`توجد ${fmt(au.length)} قيمة Au رقمية؛ الأعلى ${fmt(Math.max(...au),3)} ppm والوسيط ${fmt(median(au),3)} ppm.`:'لا توجد قيم Au رقمية قابلة للحساب.'],
      ['جاهزية وثائق PDF',`${fmt(counts.searchable_pdf_documents)} وثيقة بها نص مضمّن، و${fmt(scanned)} وثيقة ممسوحة أو بلا نص مضمّن.`],
      ['الخرائط الجيولوجية',`الحزمة تحتوي على ${fmt(counts.geological_raster_layers)} خريطة Raster و${fmt(counts.vector_layers)} طبقة Vector؛ مستوى دقة حدود كل خريطة مسجل داخل bounds_quality.`]
    ];
    $('insightsContent').innerHTML=items.map(x=>`<div class="insight-item"><b>${x[0]}</b><p>${x[1]}</p></div>`).join('');
  }
  $('insightsBtn')?.addEventListener('click',()=>openOverlay('insightsPanel'));

  // CSV Export
  function rowsToCSV(rows){
    if(!rows?.length)return '';
    const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
    const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    return '\ufeff'+keys.map(q).join(',')+'\n'+rows.map(r=>keys.map(k=>q(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(',')).join('\n');
  }
  function downloadCSV(name,rows){const csv=rowsToCSV(rows);if(!csv){showToast('لا توجد بيانات للتصدير');return;}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);showToast('تم إنشاء ملف CSV');}
  $('exportGeo')?.addEventListener('click',()=>downloadCSV('AIT_Geology_Records.csv',filteredGeo()));
  $('exportAssays')?.addEventListener('click',()=>downloadCSV('AIT_Au_Cu_Assays.csv',filteredAssays()));
  $('exportTalc')?.addEventListener('click',()=>downloadCSV('AIT_Talc_XRF.csv',filteredTalc()));
  $('exportBlocks')?.addEventListener('click',()=>downloadCSV('AIT_Mining_Blocks.csv',(D.html_blocks||[]).filter(r=>!$('blockOreFilter').value||r.ore===$('blockOreFilter').value)));
  $('exportFiles')?.addEventListener('click',()=>downloadCSV('AIT_File_Inventory.csv',filteredFiles()));
  $('exportBtn')?.addEventListener('click',()=>{
    const map={overview:D.key_results||[],geology:filteredGeo(),samples:document.querySelector('#assaysTab.active')?filteredAssays():filteredTalc(),mines:filteredMines(),documents:filteredDocs(),data:filteredFiles()};
    downloadCSV(`AIT_GeoMine360_${activePage}.csv`,map[activePage]||D.key_results||[]);
  });

  window.addEventListener('geomine-language-change',()=>{
    const tr=window.GeoMineI18N?.translate||((x)=>x);
    $('pageTitle').textContent=tr(pageTitles[activePage]||activePage);
    $('roleSideLabel').textContent=tr(roleMode==='owner'?'صاحب الشركة':'جيولوجي');
    $('scopeText').textContent=tr(roleMode==='owner'?'لوحة قرار لصاحب الشركة':'مساحة تحليل للجيولوجي');
  });


  // Logout
  $('logoutBtn')?.addEventListener('click',async()=>{
    if(!confirm('هل تريد تسجيل الخروج؟')) return;
    try{await AITBackend.logout();}catch(e){}
    location.reload();
  });

  // Assay mineral filter (was missing event listener)
  $('assayMineralFilter')?.addEventListener('change',renderAssayTable);

  // Show user name in sidebar after boot
  window.addEventListener('ait:login',()=>{
    const s=AITBackend.state();
    if(s?.user){
      const av=$('userAvatar');if(av)av.textContent=String(s.user.Name||s.user.User_ID||'U').slice(0,2).toUpperCase();
      const lbl=$('roleSideLabel');if(lbl)lbl.textContent=window.GeoMineI18N?.translate(s.user.Role_ID==='GEOLOGIST'?'جيولوجي':'صاحب الشركة')||lbl.textContent;
    }
  });

  // Theme toggle
  $('themeToggle')?.addEventListener('click',()=>{
    const next=document.body.dataset.theme==='dark'?'light':'dark';
    document.body.dataset.theme=next;
    document.documentElement.dataset.theme=next;
    const icon=$('themeToggle')?.querySelector('.theme-icon');
    if(icon)icon.textContent=next==='dark'?'☾':'☀';
    try{localStorage.setItem('ait_theme',next)}catch(e){}
  });
  try{const t=localStorage.getItem('ait_theme');if(t){document.body.dataset.theme=t;document.documentElement.dataset.theme=t;const icon=$('themeToggle')?.querySelector('.theme-icon');if(icon)icon.textContent=t==='dark'?'☾':'☀';}}catch(e){}

  // Initialisation
  function init(){
    renderOverview();
    const startMap=()=>initOverviewMap().catch(e=>console.warn('Overview map:',e));
    if('requestIdleCallback' in window)requestIdleCallback(startMap,{timeout:1200});else setTimeout(startMap,250);
  }
  init();
})();
