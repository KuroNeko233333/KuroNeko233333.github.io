import {readingPages,referencePages,optionPages,ownedPage,optionQuick,optionRow,familyRows,toggleFamily} from "./option-view.js";
import {ItemFilters, defaultFilters, rarityName} from "./item-filters.js";
import {attachInteractions} from "./item-interactions.js";

import {quickControls,monsterControls,showProficiency} from "./monster-view.js";
import {decorateCard, renderSupplement} from "./card-view.js";
const byId = id => document.getElementById(id);
const mode = byId("mode"), edition = byId("edition"), manual = byId("manual");
const search = byId("search"), list = byId("list"), rows = byId("rows"), detail = byId("detail");
const magicList=byId("magic-list"), magicRows=magicList.querySelector(".rows");
const ROW_HEIGHT=42, GROUP_HEIGHT=36;
const viewApi={visibleHashes:()=>visible.map(i=>index.rows[i].h), visibleIds:()=>visible.map(i=>index.rows[i].id), get revision(){return rootManifest?.revision;}};
let kind, rootManifest, sections=[], rawCard, currentTab="stats", scaleSettings={};
const isMonster=()=>kind==="bestiary";
export const currentKind=()=>kind;
const remembered=new Map();
const isOption=()=>Object.hasOwn(optionPages,kind);
const pageName=()=>({dmscreen:"DM 帷幕",statgen:"属性生成器",crcalculator:"CR 计算器 (5e/2014)",classes:"职业",index:"大厅",book:"读书",books:"书库",adventures:"冒险模组",adventure:"模组阅读",library:"全部书目",quickreference:"快速参考",search:"全站搜索",terms:"译名术语库"})[kind] || optionPages[kind] || (isMonster()?"怪物":"物品");
const routeKind=()=>{const key=location.pathname.split("/").at(-1).replace(".html","");return ownedPage(key)?key:"items";};
const manifestFor=page=>page==="dmscreen"?rootManifest.monsters:page==="statgen"?rootManifest.statgen:page==="crcalculator"?rootManifest.tools:readingPages.has(page)?(rootManifest.reading?.[page] || (["terms","search"].includes(page) && rootManifest.reading?.index)):page==="items"?rootManifest:page==="bestiary"?rootManifest.monsters:rootManifest.pages?.[page];
let familyRoles=new Map(), familyEnglish=new Map(), pendingFamily;
function changeFamily(name,expanded){
  pendingFamily=null;toggleFamily(name,expanded,search.value.trim());filterList();renderRows(true);
}
let readingController;
function setKind(next) {
  if(kind===next)return;
  endEncounter();
  readingController?.abort();
  document.querySelector("main").hidden=readingPages.has(next);
  byId("reading").hidden=!readingPages.has(next);
  byId("reading").replaceChildren();
  ++renderTicket; ++listTicket;
  kind=next; index=null; scope=null; selected=null; currentCard=null;rawCard=null;
  extras=null; positions.clear();ids=new Map();byHash=new Map();duplicates=new Set(); sections=[];visible=[];
  currentTab="stats";scaleSettings={};
  manifest=manifestFor(kind);
  if(!manifest) throw new Error("本版资料还没有"+pageName()+"目录");
  document.body.classList.toggle("reference-page",Object.hasOwn(referencePages,next));
  document.body.dataset.page=next;document.body.dataset.ready="false";
  document.title=pageName()+" · 我们的 5etools";
  document.querySelector(".catalog").setAttribute("aria-label",pageName()+"目录");
  byId("magic-section").hidden=kind!=="items";
  byId("mundane-section").querySelector(".group-head").hidden=kind!=="items";
  byId("family-sort").hidden=kind!=="races" && !Object.hasOwn(referencePages,kind);
  filters.configure(isMonster());
  byId("quick-second").hidden=false;
  byId("monster-tools").replaceChildren();byId("detail-tabs").replaceChildren();
  rows.replaceChildren();magicRows.replaceChildren();detail.replaceChildren();delete detail.dataset.hash;delete detail.dataset.id;
  window.optionCatalog=isOption()?viewApi:undefined;
  window.itemCatalog=kind==="items"?viewApi:undefined;
  window.monsterCatalog=isMonster()?viewApi:undefined;
  document.dispatchEvent(new Event("catalog-controls"));
}
export async function deckLink(hash){
  const group=manifestFor("decks");if(!group)return null;
  const data=await object(group.catalogs.full,catalogs,4);
  const deck=data.rows.find(r=>r.cardHashes?.includes(hash.toLowerCase()));
  if(!deck)return null;
  const url=new URL("decks.html",location.href);url.searchParams.set("card",hash);url.hash=deck.h;return url;
}
let manifest, index, extras, scope, visible = [], positions = new Map();
let ids = new Map(), byHash = new Map(), duplicates = new Set();
let selected,currentCard,renderTicket=0,listTicket=0;
let manualSources, excludedSources=new Set(), manualDrawnFor, initialized = false;
const catalogs=new Map(),objects=new Map();
const getScope = () => ["all","manual"].includes(mode.value) ? "full" : "short";
const filters = new ItemFilters(() => changeView(), loadFilters, showError);

function showError(error) {
  byId("count").textContent = "资料读取失败：" + error.message;
}

async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("找不到资料（HTTP " + r.status + "）");
  return r.json();
}

async function readObject(digest) {
  const path = "data/objects/" + digest + ".json";
  if (rootManifest?.objectEncoding !== "gzip") return json(path);
  const response = await fetch(path + ".gz");
  if (!response.ok) throw new Error("找不到资料（HTTP " + response.status + "）");
  // Some static hosts transparently decode .gz responses. Check the actual bytes.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

// 内容寻址文件不可变。缓存有限个卡包，索引和筛选另按范围缓存。
function object(digest, cache = objects, max = 8) {
  if (!digest) return Promise.resolve({});
  let value = cache.get(digest);
  if (!value) value = readObject(digest).catch(e => {
    if (cache.get(digest) === value) cache.delete(digest);
    throw e;
  });
  cache.delete(digest);
  cache.set(digest,value);
  if (cache.size > max) cache.delete(cache.keys().next().value);
  return value;
}

function shard(key) {
  let n = 2166136261;
  for (const c of new TextEncoder().encode(key)) n=Math.imul(n^c,16777619);
  return n & 255;
}

const catalogMetadata=new WeakMap();
const yieldTask=()=>globalThis.scheduler?.yield ? scheduler.yield() : new Promise(done=>setTimeout(done,0));
async function selectCatalog(next,ticket) {
  if(scope===next)return;
  const data=await object(manifest.catalogs[next],catalogs,2);
  if(ticket!==listTicket)return;
  let meta=catalogMetadata.get(data);
  if(!meta){
    // JSON 解码、查找表和列表绘制分别交回浏览器一次。慢 CPU 也可处理下一次输入。
    await yieldTask();
    if(ticket!==listTicket)return;
    const ids=new Map(),hashes=new Map(),duplicates=new Set(),sizes=new Set();
    let lastYield=performance.now();
    for(let i=0;i<data.rows.length;i++){
      const row=data.rows[i];
      ids.set(row.id,i);
      if(hashes.has(row.h))duplicates.add(row.h);else hashes.set(row.h,i);
      for(const size of row.size || [])sizes.add(size);
      if((i&1023)===1023 && performance.now()-lastYield>12){
        await yieldTask();if(ticket!==listTicket)return;lastYield=performance.now();
      }
    }
    meta={ids,hashes,duplicates,sizes:["T","S","M","L","H","G","V"].filter(k=>sizes.has(k))};
    catalogMetadata.set(data,meta);
  }
  if(ticket!==listTicket)return;
  scope=next;index=data;extras=null;
  ids=meta.ids;byHash=meta.hashes;duplicates=meta.duplicates;
  if(!manualSources && next==="full"){
    manualSources=new Set(Object.keys(data.sources).filter(key=>data.sources[key].defaultOn));
  }
  if(isOption())filters.configure(false,index.sortNames);
  if(kind==="races"){
    byId("family-sort").replaceChildren(...Object.entries(filters.sortNames).map(([key,label])=>{
      const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.sort=key;
      b.onclick=()=>filters.sortBy(key,key!=="catalog" && key===filters.state.sort && !filters.state.desc);
      return b;
    }));
  }
  if(index.columns){
    const bar=byId("family-sort");
    document.querySelector(".catalog").style.setProperty("--reference-columns",index.columns.map(c=>c.width+"fr").join(" "));
    bar.replaceChildren(...index.headers.map(h=>{
      if(!h.sort)return document.createElement("span");
      const b=document.createElement("button");b.textContent=h.label;b.dataset.sort=h.sort;
      b.onclick=()=>filters.sortBy(h.sort,h.sort===filters.state.sort && !filters.state.desc);return b;
    }));
  }
  filters.setCatalog(index);
  filters.sizes=meta.sizes;
  if(kind==="races") {familyEnglish=new Map();for(const r of data.rows)if(r.rep && r.e)familyEnglish.set(r.family,(familyEnglish.get(r.family)||"")+" "+r.e);}
  await yieldTask();
}

let fieldWorker,nextFieldRequest=0;
const fieldRequests=new Map(),fieldViews=new WeakMap(),crRangesByCatalog=new WeakMap();
function readFields(options) {
  if(!fieldWorker){
    fieldWorker=new Worker(new URL("./monster-filter-worker.js",import.meta.url));
    fieldWorker.onmessage=({data:{id,result,error}})=>{
      const task=fieldRequests.get(id);if(!task)return;
      fieldRequests.delete(id);
      if(error)task.reject(new Error(error));else task.resolve(result);
    };
    fieldWorker.onerror=event=>{
      fieldWorker.terminate();fieldWorker=null;
      for(const task of fieldRequests.values())task.reject(new Error(event.message || "筛选资料读取失败"));
      fieldRequests.clear();
    };
  }
  const suffix=rootManifest.objectEncoding==="gzip"?".json.gz":".json";
  const url=new URL("data/objects/"+manifest.filters[scope]+suffix,location.href);
  return new Promise((resolve,reject)=>{
    const id=++nextFieldRequest;fieldRequests.set(id,{resolve,reject});
    fieldWorker.postMessage({id,url:url.href,...options});
  });
}
async function loadQuickCr() {
  const catalog=index;
  if(!isMonster() || !filters.state.cr || filters.fastCr)return;
  let pending=crRangesByCatalog.get(catalog);
  if(!pending){
    pending=readFields({crRanges:true}).then(result=>new Map(result.ranges))
      .catch(error=>{crRangesByCatalog.delete(catalog);throw error;});
    crRangesByCatalog.set(catalog,pending);
  }
  const ranges=await pending;
  if(index===catalog){filters.extraCrByRow=ranges;filters.fastCr=true;}
}
async function loadFilters() {
  const catalog=index;if(!catalog)return;
  let view=fieldViews.get(catalog);
  if(!view){view={fields:null,columns:{},jobs:new Map()};fieldViews.set(catalog,view);}
  const needed=new Set(filters.state.rules.map(rule=>rule.key));
  if(filters.state.sort==="source")needed.add("sortPage");
  if(filters.state.sort==="weight")needed.add("weight");
  if(filters.state.sort==="cost"){needed.add("sortCost");needed.add("cost");}
  const columns=[...needed].filter(key=>!Object.hasOwn(view.columns,key)).sort();
  if(columns.length || !view.fields){
    const key=JSON.stringify([!view.fields,columns]);let job=view.jobs.get(key);
    if(!job){
      job=readFields({fields:!view.fields,columns}).then(result=>{
        if(result.fields)view.fields=result.fields;
        Object.assign(view.columns,result.columns);
      }).finally(()=>view.jobs.delete(key));
      view.jobs.set(key,job);
    }
    await job;
  }
  if(index===catalog){
    extras=view;filters.extras=view;
    if(byId("filters").open)filters.paintFields();
  }
}

function sourcePass(row,catalog,page,selectedMode) {
  if(catalog.fixedSources)return true;
  const source = catalog.sources[row.s];
  switch (selectedMode) {
    case "official": return source.official;
    case "rec": return source.official || source.good;
    case "brew": return !source.official && source.good;
    case "manual": {
      const secondary = Object.hasOwn(optionPages,page) ? [] : row.sources;
      if (excludedSources.has(row.s) || secondary?.some(s => excludedSources.has(s))) return false;
      return !manualSources?.size || manualSources.has(row.s) || secondary?.some(s => manualSources.has(s));
    }
    case "all": return page!=="bestiary" || source.defaultOn;
    default: return true;
  }
}

// 列表、搜索结果及悬停都经相同的来源、同版去重与跨版本判定。
function allowedRows(catalog,page,accept,order=catalog.order) {
  const data=catalog.rows;
  const selectedMode=mode.value;
  const candidates=data.map((r,i)=>sourcePass(r,catalog,page,selectedMode) && accept(r,i));
  const base=data.map((r,i)=>candidates[i] && !r.same?.some(t=>candidates[t]));
  const rel=edition.value==="24" ? "newer" : edition.value==="14" ? "older" : null;
  return order[edition.value || "24"].filter(i=>base[i] && !(rel && data[i][rel]?.some(t=>base[t])));
}
const membership=new Map();
export async function entryVisible(page,hash,uid) {
  page=page?.replace(/\.html$/,"");
  if(page==="classes" && rootManifest?.reading?.classes && hash){
    const {classVisible}=await import("./class-page.js");
    return classVisible({object,manifest:rootManifest,mode:mode.value,edition:edition.value,manualSources,excludedSources},hash);
  }
  if(!ownedPage(page) || readingPages.has(page) || !rootManifest)return null;
  const revision=listTicket;
  let cached=membership.get(page);
  if(!cached || cached.revision!==revision){
    const pending=(async()=>{
      const group=manifestFor(page);
      if(!group)return new Set();
      const current=page===kind && index!=null;
      const catalog=current?index:await object(group.catalogs[getScope()],catalogs,4);
      const allowed=current?visible:allowedRows(catalog,page,r=>!r.hidden);
      const set=new Set();
      for(const i of allowed){const row=catalog.rows[i];set.add(row.id);set.add(row.h);
        if(row.e)set.add(encodeURIComponent(row.e.toLowerCase()).toLowerCase()+"_"+row.s.toLowerCase());}
      return set;
    })();
    cached={revision,pending};membership.set(page,cached);
  }
  const set=await cached.pending;
  return uid ? set.has(uid) : set.has(hash?.toLowerCase());
}
function filterList() {
  const terms=search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const data=index.rows;membership.clear();
  let result=allowedRows(index,kind,filters.predicate(),terms.length && index.searchOrder || index.order);
  if(terms.length)result=result.filter(i=>{
    const r=data[i];
    const names = [r.n,r.e,r.family,r.family && familyEnglish.get(r.family)].filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every(term => names.includes(term));
  });
  visible = filters.sort(result);
  let projection=visible;
  if(kind==="races"){const family=familyRows(index,visible,search.value.trim(),pendingFamily);familyRoles=family.roles;projection=family.entries;}
  positions = new Map();
  const mundane=[],magic=[];
  let previous, groupCount;
  visible.forEach((i,pos)=>positions.set(i,pos));
  projection.forEach(i=>{
    const r=data[i];
    const section=isMonster() || r.m ? mundane : magic;
    const title=isMonster()?"CR "+r.cr:r.g;
    if (title && !terms.length && filters.state.sort==="catalog" && title!==previous) {
      groupCount={title,count:0};section.push(groupCount);previous=title;
    }
    if(groupCount)groupCount.count++;
    section.push(i);
  });
  sections=[makeSection(mundane,list,rows),makeSection(magic,magicList,magicRows)];
  const count=byId("count");count.textContent=visible.length+"/"+data.length;count.title="可见条目 / 目录条目";
  if(isOption())optionQuick(index,filters,changeView);
  else {byId("quick-second").hidden=false;quickControls(filters,isMonster(),changeView);}
  document.dispatchEvent(new Event("catalog-controls"));
}

function readFilters(params) {
  try { return Object.assign(defaultFilters(), JSON.parse(params.get("filters") || "{}")); }
  catch { return defaultFilters(); }
}

function stateUrl(hash, uid) {
  const url = new URL(location.href);
  url.searchParams.delete("ours-source"); url.searchParams.delete("ours-search");
  url.searchParams.set("mode", mode.value); url.searchParams.set("ed", edition.value);
  for (const [k,v] of [["q",search.value],["sources",mode.value === "manual" ? JSON.stringify([...manualSources || []]) : ""],
    ["excludeSources",mode.value === "manual" && excludedSources.size ? JSON.stringify([...excludedSources]) : ""],
    ["filters",JSON.stringify(filters.state) === JSON.stringify(defaultFilters()) ? "" : JSON.stringify(filters.state)],["uid",uid]]) {
    if (v) url.searchParams.set(k,v); else url.searchParams.delete(k);
  }
  url.hash = hash || "";
  return url;
}

function makeSection(entries,viewport,host) {
  const offsets=[0],groupOffsets=[],groups=[];
  for(const e of entries){
    if(typeof e!=="number"){groupOffsets.push(offsets.at(-1));groups.push(e);}
    offsets.push(offsets.at(-1)+(typeof e==="number"?(index.columns?30:kind==="races"?38:ROW_HEIGHT):GROUP_HEIGHT));
  }
  viewport.querySelector(".space").style.height=offsets.at(-1)+"px";
  let sticky=viewport.querySelector(".sticky");
  if(groupOffsets.length && !sticky){sticky=document.createElement("div");sticky.className="sticky";viewport.prepend(sticky);}
  if(sticky){sticky.replaceChildren();sticky.hidden=!groupOffsets.length;}
  return {entries,offsets,groupOffsets,groups,sticky,viewport,host,start:-1,end:-1,group:-1};
}
function indexAt(offsets,y) {
  let lo=0,hi=offsets.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>>1;if(offsets[mid]<=y)lo=mid;else hi=mid-1;}
  return lo;
}
function renderRows(force=false) {
  if(!index)return;
  const url=stateUrl("",null);
  for(const sec of sections){
    const {entries,offsets,viewport,host}=sec;
    if(sec.groups.length && sec.sticky){
      const n=indexAt(sec.groupOffsets,viewport.scrollTop),top=sec.groupOffsets[n];
      if(sec.group!==n){
        const h=document.createElement("div"),count=document.createElement("span");
        h.className="group-head";h.textContent=sec.groups[n].title;count.textContent=sec.groups[n].count+" 个";h.append(count);sec.sticky.replaceChildren(h);sec.group=n;
      }
      sec.sticky.hidden=viewport.scrollTop<=top;
      sec.sticky.firstChild.style.transform="translateY("+Math.min(0,(sec.groupOffsets[n+1] ?? Infinity)-viewport.scrollTop-GROUP_HEIGHT)+"px)";
    }
    const start=Math.max(0,indexAt(offsets,viewport.scrollTop)-3);
    const end=Math.min(entries.length,indexAt(offsets,viewport.scrollTop+viewport.clientHeight)+4);
    if(!force && start===sec.start && end===sec.end)continue;
    const focused=host.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    const frag=document.createDocumentFragment();
    for(let pos=start;pos<end;pos++){
      const i=entries[pos];
      if(typeof i!=="number"){
        const h=document.createElement("div"),n=document.createElement("span");h.className="group-head";h.textContent=i.title;n.textContent=i.count+" 个";h.append(n);frag.append(h);continue;
      }
      const r=index.rows[i],a=document.createElement("a"),name=document.createElement("span"),meta=document.createElement("span"),source=document.createElement("span");
      if(duplicates.has(r.h))url.searchParams.set("uid",r.id);else url.searchParams.delete("uid");
      url.hash=r.h;a.href=url.href;a.dataset.id=r.id;a.dataset.page=kind+".html";a.dataset.position=positions.get(i);
      if(rowSelected(i))a.setAttribute("aria-current","true");
      name.className="row-name";name.textContent=r.n;
      if(r.e){const en=document.createElement("small");en.className="english";en.textContent=r.e;name.append(en);}
      meta.className="rarity";meta.textContent=isMonster() ? r.type+" · "+r.cr : rarityName(r.rarity);
      if(kind==="items"){
        meta.dataset.rarity=r.rarity || "";
        if (/^(?:需要?同调|需要?由.*同调|Requires? Attunement(?: By.*)?)$/i.test(r.attunement || "")){const tag=document.createElement("small");tag.textContent="调";meta.append(tag);}
      }
      source.className="source";const tag=document.createElement("span");tag.textContent=index.sources[r.s].abv;source.title=index.sources[r.s].full;
      const sourceKind=/^ours/i.test(r.s)?"ours":!index.sources[r.s].official?"3p":/^ua/i.test(r.s)?"ua":["XPHB","XDMG","XMM"].includes(r.s)?"off24":"off14";
      tag.style.setProperty("--tag","var(--v3-k-"+sourceKind+")");
      source.append(tag);
      if(index.columns){
        for(const [col,column] of index.columns.entries()){
          const cell=column.role==="source"?source:document.createElement("span");
          if(column.role==="name"){cell.className="row-name";cell.textContent=r.n;}
          else if(column.role==="value")cell.textContent=r.cells?.[col] || "";
          cell.style.textAlign=column.align;a.append(cell);
        }
        frag.append(a);continue;
      }
      if(encounterOpen()){
        const add=document.createElement("button");add.type="button";add.className="enc-add";add.textContent="＋";add.title="加入遭遇";
        add.onclick=e=>{e.preventDefault();e.stopPropagation();encounterView?.adjust(r.h,e.shiftKey?5:1);};name.prepend(add);
      }
      a.append(name);
      if(isOption())optionRow(a,name,meta,r,index,kind==="races"?familyRoles.get(i):null,changeFamily);
      a.append(meta,source);frag.append(a);
    }
    host.style.transform="translateY("+offsets[start]+"px)";host.replaceChildren(frag);
    if(focused)host.querySelector('[data-id="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
    sec.start=start;sec.end=end;
  }
}

function showManual(sourceIndex=index) {
  manual.hidden = mode.value !== "manual";
  if (manual.hidden) { manual.open=false; return; }
  if (manualDrawnFor !== sourceIndex) {
    const labels = [];
    for (const [key,s] of Object.entries(sourceIndex.sources).sort((a,b)=>a[1].abv.localeCompare(b[1].abv,"zh-CN"))) {
      const line=document.createElement("div"), label=document.createElement("label"), box=document.createElement("input");
      const exclude=document.createElement("button");
      box.type="checkbox"; box.value=key; label.title=s.full;
      exclude.type="button"; exclude.dataset.exclude=key; exclude.textContent="排除";
      exclude.setAttribute("aria-label","排除 "+s.abv);
      label.append(box," " + s.abv + (s.abv === key ? "" : " · "+key));
      line.append(label,exclude);labels.push(line);
    }
    byId("sources").replaceChildren(...labels); manualDrawnFor=sourceIndex;
  }
  for (const box of byId("sources").querySelectorAll("input")) box.checked = manualSources.has(box.value);
  for (const b of byId("sources").querySelectorAll("button")) b.setAttribute("aria-pressed",String(excludedSources.has(b.dataset.exclude)));
}

const objectForRow = r => ({id:r.id,hash:r.h,pack:index.packs[r.p]});
async function resolveItem(hash,uid = null) {
  const i = ids.get(uid) ?? byHash.get(hash);
  if (i != null && (!duplicates.has(hash) || uid === index.rows[i].id)) return objectForRow(index.rows[i]);
  // 当前范围没收录的底材组合也能从旧书签打开；列表范围仍取当前位置的设置。
  for (const group of [...new Set([scope || getScope(),"full"])]) {
    const lookup = await object(manifest.bookmarks[group][shard(hash)]);
    const match = lookup[hash];
    if (match) {
      const local=ids.get(match[0]);
      return local==null ? {id:match[0],hash,pack:match[1]} : objectForRow(index.rows[local]);
    }
  }
  // The native router indexes English aliases for magic items only. Also
  // accept an unambiguous English name from a mundane card, after trying all
  // actual legacy targets so their established landing always takes priority.
  let decoded;
  try { decoded=decodeURIComponent(hash); } catch { return null; }
  const englishMatch = catalog => {
    const matches=catalog.rows.filter(r=>r.m && r.e && (r.e+"_"+r.s).toLowerCase()===decoded);
    if (matches.length!==1) return null;
    const r=matches[0];
    return {id:r.id,hash:r.h,pack:catalog.packs[r.p]};
  };
  const local=index && englishMatch(index);
  if (local || scope==="full") return local;
  return englishMatch(await object(manifest.catalogs.full,catalogs,2));
}

async function cardData(ref) {
  const cards = await object(ref.pack);
  const card = cards[ref.id];
  if (!card?.html) throw new Error("此条目的详情缺失");
  return card;
}

async function previewData(page, hash, uid) {
  if (!readingPages.has(kind) && (page === kind+".html" || page === kind)) {
    const ref = await resolveItem(hash,uid);
    if (!ref) return null;
    return {card:await cardData(ref),kind,outside:!await entryVisible(page,hash,ref.id)};
  }
  const otherKind=page.replace(/\.html$/,"");
  if(ownedPage(otherKind) && !readingPages.has(otherKind)){
    const other=manifestFor(otherKind);
    if(!other)return null;
    for(const group of new Set([getScope(),"full"])){
      const match=(await object(other.bookmarks[group][shard(hash)]))[hash];
      if(match){
        const card=(await object(match[1]))[match[0]];
        return card ? {card,kind:otherKind,
          outside:!await entryVisible(page,hash,match[0])} : null;
      }
    }
  }
  const key=page+"#"+hash;
  if(rootManifest.reading?.classes){
    const classes=await object(rootManifest.reading.classes);
    const bucket=classes.previews?.[shard(key)];
    if(bucket){const result=(await object(bucket))[key];if(result)return result;}
    if(["classes.html","classes","classfeature","subclassfeature"].includes(page)){
      const {classPreview}=await import("./class-page.js");
      const preview=await classPreview({object,manifest:rootManifest},page,hash);if(preview)return preview;
    }
  }
  for (const m of [manifest,rootManifest,rootManifest.monsters,...Object.values(rootManifest.pages || {})]){
    if(!m?.previews)continue;
    const found=(await object(m.previews[shard(key)]))[key];if(found)return found;
  }
  return null;
}

function rowSelected(i) {
  if(i==null || !selected)return false;
  if(index.rows[i].id===selected)return true;
  const role=familyRoles.get(i);
  return kind==="races" && role?.head && !role.expanded && index.rows[ids.get(selected)]?.family===index.rows[i].family;
}
function syncSelected() {
  for (const a of document.querySelectorAll(".rows a")) {
    if (rowSelected(ids.get(a.dataset.id))) a.setAttribute("aria-current","true");
    else a.removeAttribute("aria-current");
  }
}

function ensureVisible(i) {
  for(const {entries,offsets,viewport} of sections){
    const n=entries.indexOf(i);if(n<0)continue;
    if(offsets[n]<viewport.scrollTop)viewport.scrollTop=offsets[n];
    else if(offsets[n+1]>viewport.scrollTop+viewport.clientHeight)viewport.scrollTop=kind==="races"?offsets[n+1]-viewport.clientHeight:offsets[n];
    renderRows();return;
  }
}
let presentationJob=0;
async function paintPresentation() {
  const job=++presentationJob, raw=rawCard;if(!raw)return;
  const tabs=byId("detail-tabs");
  const available=[["stats",isMonster()?"数据卡":(["backgrounds","races","feats"].includes(kind)?"特质":pageName())]];
  if(raw.info || raw.fluff || raw.fluffHtml) available.push(["info",isMonster() || isOption()?"简介":"信息"]);
  if(raw.images?.length || raw.token) available.push(["images","图片"]);
  if(!available.some(([k])=>k===currentTab))currentTab="stats";
  tabs.replaceChildren(...(available.length === 1 ? [] : available).map(([k,t])=>{
    const b=document.createElement("button");b.dataset.detailTab=k;b.textContent=t;b.setAttribute("aria-pressed",String(k===currentTab)); b.onclick=()=>switchTab(k);return b;
  }));
  if(kind==="optionalfeatures") { const badge=document.createElement("span");badge.className="feature-badge";badge.textContent=index?.rows[ids.get(currentCard.id)]?.g || "";tabs.prepend(badge); }
  if(isMonster() && rootManifest.tools){
    const launch=document.createElement("button");launch.textContent="遭遇构筑器";launch.className="enc-launch";
    launch.onclick=()=>toggleEncounter(true);tabs.append(launch);
    const add=document.createElement("button");add.textContent="＋ 加入遭遇";add.onclick=()=>{
      const m=raw.model,scaled=[scaleSettings.cr,scaleSettings.spell,scaleSettings.classLevel];
      const custom=m&&scaled.some(v=>v!=null)?[m.name,m.source,...scaled.map((v,i)=>i===0 && String(v).includes("/")?String(v).split("/").reduce((a,b)=>a/b):v??"")].join("__").toLowerCase():null;
      toggleEncounter(true,{h:currentCard.hash,customHashId:custom});
    };tabs.append(add);
  }
  const applyScaling=(k,v)=>{
    const next={...scaleSettings};
    if(["cr","spell","classLevel"].includes(k))for(const other of ["cr","spell","classLevel"])delete next[other];
    if(v===""||v===false)delete next[k];else next[k]=v;
    savePosition();history.pushState({...history.state,scale:next},"",detailUrl(currentTab,next));
    scaleSettings=next;paintPresentation().catch(showError);
  };
  let card=raw;
  if(isMonster() && currentTab==="stats" && ["cr","spell","classLevel"].some(k=>scaleSettings[k]!=null)){
    detail.textContent="正在调整数据…";
    const {scaleMonster}=await import("./monster-runtime.js");
    card=await scaleMonster(raw,scaleSettings,manifest.runtime,readObject);
    if(job!==presentationJob)return;
  }
  detail.replaceChildren();
  if(currentTab==="images" || currentTab==="info"){
    renderSupplement(detail,card,kind,currentTab);
  }else{
    detail.innerHTML=card.html;
    decorateCard(detail,card,kind,{openImages:()=>switchTab("images")});
    if(isMonster()){
      showProficiency(detail,!!scaleSettings.prof);
      monsterControls(detail,raw,scaleSettings,applyScaling);
    }
  }
  for(const a of detail.querySelectorAll("a[href]")){
    const link=new URL(a.href);if(link.origin===location.origin && ownedPage(link.pathname.split("/").at(-1).replace(".html",""))){
      const page=link.pathname.split("/").at(-1);
      a.href=new URL(page+link.search+link.hash,location.href).href;
    }
  }
  if(kind==="decks"){
    const key=new URL(location.href).searchParams.get("card");
    const deck=index?.rows[ids.get(currentCard?.id)];
    detail.querySelectorAll(".decks__wrp-row").forEach((row,i)=>{
      const hash=deck?.cardHashes?.[i];if(!hash)return;
      const title=row.querySelector(".entry-title-inner");if(!title)return;
      const link=document.createElement("a"),url=new URL(location.href);url.searchParams.set("card",hash);link.href=url.href;
      link.textContent=title.textContent;title.replaceChildren(link);
      if(hash===key)row.scrollIntoView({block:"start"});
    });
  }
  for(const die of detail.querySelectorAll("[data-roll]")){die.tabIndex=0;die.setAttribute("role","button");}
  for(const target of detail.querySelectorAll("[data-hover-page]:not(a),[data-hover-html]:not(a)"))target.tabIndex=0;
  detail.dataset.hash=currentCard.hash;detail.dataset.id=currentCard.id;
}
function detailUrl(tab,settings) {
  const u=new URL(location.href); for(const k of ["tab","cr","spell","classLevel","prof"])u.searchParams.delete(k);
  if(tab!=="stats")u.searchParams.set("tab",tab);
  for(const [k,v] of Object.entries(settings))u.searchParams.set(k,v);
  return u;
}
function switchTab(tab) {
  if(tab===currentTab)return;
  savePosition();history.pushState({...history.state,tab,detailTop:0},"",detailUrl(tab,scaleSettings));currentTab=tab;detail.scrollTop=0;paintPresentation().catch(showError);
}
function paintCard(ref,card) {
  currentCard=ref;rawCard=card;
  return paintPresentation();
}
function markOutsideRange(ref) {
  let note=detail.querySelector("[data-outside-range]");
  if (positions.has(ids.get(ref.id))) { note?.remove(); return; }
  if (note) return;
  note=document.createElement("p");
  note.className="source";note.dataset.outsideRange="";
  note.textContent="此"+pageName()+"在当前列表范围外。"; detail.prepend(note);
}

async function openCard(hash, {uid=null, reveal=false,scroll=0,keepPresentation=false} = {}) {
  const job = ++renderTicket;
  let ref;
  if (!hash && visible.length) ref = objectForRow(index.rows[visible[0]]);
  else if (hash) ref = await resolveItem(hash,uid);
  if (job !== renderTicket) return;
  selected = ref?.id;
  syncSelected();
  if(reveal && kind==="races" && selected && !familyRoles.has(ids.get(selected))){pendingFamily=ref.hash;filterList();pendingFamily=null;renderRows(true);}
  if (reveal) ensureVisible(ids.get(selected));
  if (!ref) {
    delete detail.dataset.hash; currentCard = null;
    detail.textContent = hash ? "目录中没有这个"+pageName()+"。" : "没有符合条件的"+pageName()+"。";
    return;
  }
  if (currentCard?.id === ref.id && currentCard.pack === ref.pack && detail.dataset.id === ref.id) {
    if(!keepPresentation)await paintPresentation();
    markOutsideRange(ref);return;
  }
  if(!scroll)detail.parentElement.scrollTop=0;
  delete detail.dataset.hash;
  detail.textContent="正在读取"+pageName()+"…";
  try {
    const card=await cardData(ref);
    if (job !== renderTicket) return;
    await paintCard(ref,card);
    markOutsideRange(ref);
    if(scroll)detail.parentElement.scrollTop=scroll;
  } catch(e) {
    if (job !== renderTicket) return;
    detail.textContent = e.message + " ";
    const retry=document.createElement("button"); retry.textContent="重新读取";
    retry.onclick=()=>openCard(ref.hash,{uid:ref.id}); detail.append(retry);
  }
}

// 冷开书签时先取一个地址分片 + 一个卡包，小带宽下也能先读正文。
// 完整目录随后负责范围判定、同名落点和列表定位。
async function readBookmarkFirst() {
  const hash=routeHash(), url=location.href;
  if (!hash || hash==="blankhash") return;
  restoreControls();
  for (const group of [...new Set([getScope(),"full"])]) {
    const lookup=await object(manifest.bookmarks[group][shard(hash)]);
    const match=lookup[hash];
    if (!match) continue;
    const uid=new URL(url).searchParams.get("uid");
    if (uid && uid!==match[0]) return;
    const ref={id:match[0],hash,pack:match[1]};
    const card=await cardData(ref);
    if (url===location.href && !index) await paintCard(ref,card);
    return;
  }
}

function savePosition() {
  if (!initialized) return;
  history.replaceState({...history.state, listTop:list.scrollTop, magicTop:magicList.scrollTop, detailTop:detail.parentElement.scrollTop},"");
}

function routeHash() {
  let hash=location.hash.slice(1).replace(/^\/?(?:newsite\/)?(?:items|bestiary|spells|feats|backgrounds|optionalfeatures|races)\.html#/i,"");
  return hash.split(",",1)[0].toLowerCase();
}

function restoreControls() {
  const url=new URL(location.href),p=new URLSearchParams(history.state?.preferences ?? location.search);
  currentTab=history.state?.tab || url.searchParams.get("tab") || "stats";
  scaleSettings=history.state?.scale || Object.fromEntries(["cr","spell","classLevel","prof"].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)]));
  const nativeScale={scaled:"cr",scaledspellsummon:"spell",scaledclasssummon:"classLevel"};
  for(const part of url.hash.split(",").slice(1)){const [k,v]=part.split(":");if(nativeScale[k] && v)scaleSettings[nativeScale[k]]=v;}
  const choose=(el,val,def) => { el.value=[...el.options].some(o=>o.value===val) ? val : def; };
  choose(mode,p.get("mode") ?? localStorage.getItem("ours.srcMode2"),"rec");
  choose(edition,p.get("ed") ?? localStorage.getItem("ours.edMode2"),"24");
  try {
    const saved=p.get("sources") ?? localStorage.getItem("ours.newsite.itemSources");
    manualSources = saved == null ? undefined : new Set(JSON.parse(saved));
  } catch { manualSources=undefined; }
  try { excludedSources=new Set(JSON.parse(p.get("excludeSources") ?? localStorage.getItem("ours.newsite.itemSourcesExcluded") ?? "[]")); }
  catch { excludedSources=new Set(); }
  search.value=p.get("q") || "";
  filters.state=readFilters(p);
  if (!Array.isArray(filters.state.rules)) filters.state.rules=[];
  if (history.state?.preferences == null) restoreLegacyConditions();
}

// 原站从筛选器复制的地址形如 #blankhash,flstrarity:rare=1~uncommon=2。
function restoreLegacyConditions() {
  const oldKeys = {"property":"property","weapon damage dice":"dice","weapon damage type":"damageType",
    "armor class":"ac","spellcasting focus":"focus","miscellaneous":"misc","recharge type":"recharge",
    "base item":"base","base source":"baseSource","attached spells":"spells","poison type":"poison",
    "class feature":"classFeature","optional feature":"optionalFeature"};
  for (const part of location.hash.split(",").slice(1)) {
    let field, values;
    try {
      const separator=part.indexOf(":");
      field=decodeURIComponent(part.slice(0,separator)).toLowerCase();
      values=decodeURIComponent(part.slice(separator+1)).split("~");
    } catch { continue; }
    if (field==="fbse") {search.value=values.join(" "); continue;}
    if (!field.startsWith("flst")) continue;
    field=field.slice(4).replace(/%20/g," ");
    if (field==="source") {
      const on=values.filter(v=>v.endsWith("=1")).map(v=>v.slice(0,-2));
      const off=values.filter(v=>v.endsWith("=2")).map(v=>v.slice(0,-2));
      if (on.length || off.length) {
        mode.value="manual"; excludedSources=new Set(off);
        // 旧地址的来源统一小写；实际来源代码在目录加载后恢复大小写。
        manualSources=new Set(on);
      }
      continue;
    }
    const key=isOption()?field:oldKeys[field] || field;
    const native=isOption()?{legacy:true}:{};
    const range={key,...native};
    for (const part of values) {
      const pos=part.lastIndexOf("=");
      if (pos<0) continue;
      const value=part.slice(0,pos), state=part.slice(pos+1);
      if (["min","max"].includes(value)) {if (Number.isFinite(+state)) range[value]=+state;}
      else if (state==="1" || state==="2") filters.state.rules.push({key,value,exclude:state==="2",...native});
    }
    if (range.min!=null || range.max!=null) filters.state.rules.push(range);
  }
}

async function refresh(ticket) {
  await selectCatalog(getScope(),ticket);
  if (listTicket !== ticket) return false;
  if (mode.value==="manual") {
    const codes=new Map(Object.keys(index.sources).map(k=>[k.toLowerCase(),k]));
    const normalize = labels=>new Set([...labels || []].map(k=>codes.get(String(k).toLowerCase()) || k));
    manualSources=normalize(manualSources ?? Object.keys(index.sources).filter(s=>index.sources[s].defaultOn));
    excludedSources=normalize(excludedSources);
  }
  if(isOption() && filters.state.rules.some(r=>r.legacy)){
    await loadFilters();
    if(ticket!==listTicket)return false;
    const resolved=[];
    for(const r of filters.state.rules){
      if(!r.legacy){resolved.push(r);continue;}
      const field=extras.fields.find(f=>f.key.toLowerCase()===r.key);
      if(!field)continue;
      if(r.value==null){resolved.push({key:field.key,min:r.min,max:r.max});continue;}
      const opt=field.options.find(o=>String(o.value).toLowerCase()===r.value.toLowerCase());
      if(opt)resolved.push({key:field.key,value:opt.value,exclude:r.exclude});
    }
    filters.state.rules=resolved;
  }
  await loadQuickCr();
  if (listTicket !== ticket) return false;
  if (filters.needsExtras() || byId("filters").open) await loadFilters();
  if (listTicket !== ticket) return false;
  showManual(); filters.sync(); filterList();
  return true;
}

function usePublishedPage(page){
  if(manifestFor(page))return true;
  // During an upgrade the last good revision can predate this page altogether.
  const prior=new URL("../"+page+".html",location.href);
  prior.search=location.search;prior.hash=location.hash;
  if(page==="library")prior.pathname=prior.pathname.replace(/library\.html$/,"__ours/library.html");
  if(page==="index"){prior.pathname=prior.pathname.replace(/index\.html$/,"");prior.hash="index.html";}
  location.replace(prior);
  return false;
}
async function restoreRoute() {
  if(!usePublishedPage(routeKind()))return;
  const samePage=kind===routeKind(),previousTop=samePage?list.scrollTop:0;
  setKind(routeKind());
  const ticket=++listTicket;
  const restore=history.state || {};
  try {
    restoreControls();
    pendingFamily=kind==="races"?routeHash():null;
    localStorage.setItem("ours.srcMode2",mode.value);localStorage.setItem("ours.edMode2",edition.value);
    if(readingPages.has(kind)){
      readingController?.abort();readingController=new AbortController();
      const signal=readingController.signal, view=await import("./reading.js");
      if(signal.aborted)return;
      const root=byId("reading");
      await view.show({kind,root,manifest:rootManifest,object,previewData,mode:mode.value,edition:edition.value,manualSources,excludedSources,signal});
      if(!signal.aborted){
        markReady();document.dispatchEvent(new Event("catalog-controls"));
        if(kind==="classes" && mode.value==="manual"){
          const sourceIndex=await object(rootManifest.catalogs.full,catalogs,4);
          if(signal.aborted)return;
          manualSources??=new Set(Object.keys(sourceIndex.sources).filter(s=>sourceIndex.sources[s].defaultOn));
          showManual(sourceIndex);
        }else{manual.hidden=true;manual.open=false;}
      }
      return;
    }
    if (!await refresh(ticket)) return;
    list.scrollTop=restore.listTop ?? (kind==="races"?previousTop:0);magicList.scrollTop=restore.magicTop || 0;
    renderRows(true);
    if (restore.preferences == null) history.replaceState({...restore,preferences:stateUrl(null,null).search},"");
    if(encounterOpen()){
      await mountEncounter(ticket);if(ticket===listTicket)markReady();return;
    }
    endEncounter();
    let hash=routeHash();
    if((!hash || hash==="blankhash") && visible.length){
      // These native pages establish their initial bookmark in name order before V5 paints the book order.
      const landing=["feats","backgrounds","races"].includes(kind) ? index.sortOrder.name.find(i=>positions.has(i)) : visible[0];
      const first=index.rows[landing];hash=first.h;
      history.replaceState(history.state,"",stateUrl(hash,duplicates.has(hash) ? first.id : null));
    }
    const opening=openCard(hash==="blankhash" ? "" : hash,{uid:new URL(location.href).searchParams.get("uid"),reveal:kind==="races" && restore.listTop==null,scroll:restore.detailTop || 0});
    markReady();
    await opening;
    if (ticket===listTicket && restore.detailTop!=null) detail.parentElement.scrollTop=restore.detailTop;
  } catch(e) { showError(e); }
}

let encounterView;
const encounterOpen=()=>isMonster() && rootManifest.tools && (new URL(location.href).searchParams.has("encounter") || /,encounterbuilder:true/i.test(location.hash));
function endEncounter(){
  encounterView=null;byId("encounter-workspace")?.remove();document.body.classList.remove("enc-open");
}
function toggleEncounter(on,add){
  const url=new URL(location.href);url.hash=url.hash.replace(/,encounterbuilder:true/i,"");
  if(on)url.searchParams.set("encounter","1");else url.searchParams.delete("encounter");
  history.pushState({theme:document.documentElement.dataset.oursTheme}, "",url);
  restoreRoute().then(()=>{if(add)encounterView?.add(add);});
}
async function mountEncounter(ticket){
  endEncounter();const root=document.createElement("section");root.id="encounter-workspace";
  detail.parentElement.append(root);document.body.classList.add("enc-open");
  const [{showEncounter},table]=await Promise.all([import("./encounter.js"),object(rootManifest.tools)]);
  const catalog=index,fullCatalog=()=>object(manifest.catalogs.full,catalogs,4);
  if(ticket!==listTicket)return;
  const scaleInput=h=>Promise.all([
    import("./monster-runtime.js").then(async mod=>{await mod.prepareMonsterScale(manifest.runtime,readObject);return mod;}),
    resolveItem(h).then(ref=>ref && cardData(ref))
  ]);
  const warmScale=h=>{scaleInput(h).catch(()=>{});};
  const scaled=async item=>{
    const [{scaleMonster},base]=await scaleInput(item.h);if(!base)return null;
    const [, , cr,spell,cl]=item.customHashId.split("__");
    const opts={cr:cr||null,spell:spell||null,classLevel:cl||null};
    const {model}=await scaleMonster(base,opts,manifest.runtime,readObject,false);
    const value=model.cr?.cr??model.cr;
    return {n:model._displayName||model.name,cr:value,xp:model.cr?.xp??Number(String(table.cr.find(x=>x._cr===String(value))?.xp||0).replaceAll(",","")),hp:model.hp?.average,ac:model.ac?.[0]?.ac??model.ac?.[0]};
  };
  const picture=async(item,token)=>{
    const ref=await resolveItem(item.h);if(!ref)return null;
    const card=await cardData(ref);return token?card.token:card.images?.[0];
  };
  const view=await showEncounter({root,table,catalog,fullCatalog,picture,visible:()=>visible.map(i=>index.rows[i]),close:()=>toggleEncounter(false),scaled,warmScale});
  if(ticket===listTicket)encounterView=view;
}

function markReady() {
  initialized=true;
  mode.disabled=edition.disabled=search.disabled=false;
  document.body.dataset.ready="true";
}

async function changeView({replace=false} = {}) {
  if (!initialized) return;
  if(readingPages.has(kind)){
    const url=new URL(location.href);url.searchParams.set("mode",mode.value);url.searchParams.set("ed",edition.value);
    history.pushState({}, "",url);await restoreRoute();return;
  }
  pendingFamily=null;
  savePosition();
  const original = currentCard, ticket=++listTicket;
  try {
    if (!await refresh(ticket)) return;
    const pos=positions.get(ids.get(original?.id));
    const r=pos!=null ? index.rows[visible[pos]] : index.rows[visible[0]];
    const hash=r?.h || "", uid=r && duplicates.has(hash) ? r.id : null;
    history[replace ? "replaceState" : "pushState"]({listTop:0,detailTop:0,theme:document.documentElement.dataset.oursTheme},"",stateUrl(hash,uid));
    list.scrollTop=0;magicList.scrollTop=0; renderRows(true);
    if(encounterOpen()){
      if(!encounterView)await mountEncounter(ticket);
      if(ticket===listTicket)markReady();
      return;
    }
    await openCard(hash,{uid:r?.id,keepPresentation:true});
  } catch(e) { if (ticket===listTicket) showError(e); }
}

function navigate(hash,uid=null) {
  if(encounterOpen()){encounterView?.adjust(hash,1);return;}
  savePosition();
  currentTab="stats";scaleSettings={};
  const url=stateUrl(hash,uid);for(const k of ["tab","cr","spell","classLevel","prof"])url.searchParams.delete(k);
  history.pushState({theme:document.documentElement.dataset.oursTheme},"",url);
  openCard(hash,{uid,reveal:true});
}

export async function followPage(next, url) {
  savePosition();
  remembered.set(kind,{url:location.href,state:history.state});
  let state={};
  if(!url && remembered.has(next)){
    const saved=remembered.get(next);url=new URL(saved.url);state={...saved.state};delete state.preferences;
    url.searchParams.set("mode",mode.value);url.searchParams.set("ed",edition.value);
  }
  url ||= new URL(next+".html",location.href);
  history.pushState({...state,theme:document.documentElement.dataset.oursTheme},"",url);
  await restoreRoute();
}
function activate() {
  byId("detail").parentElement.addEventListener("scroll",savePosition,{passive:true});
  mode.onchange=()=>{localStorage.setItem("ours.srcMode2",mode.value); changeView();};
  edition.onchange=()=>{localStorage.setItem("ours.edMode2",edition.value); changeView();};
  let editingQuery=false;
  search.oninput=()=>{
    if(!editingQuery){
      // 在发起异步筛选前创建输入会话的历史，后续字符不会抢走这一次 push。
      savePosition();
      history.pushState({theme:document.documentElement.dataset.oursTheme},"",stateUrl(currentCard?.hash,null));
      editingQuery=true;
    }
    changeView({replace:true});
  };
  search.onkeydown=e=>{if(e.key==="Enter")editingQuery=false;};
  window.addEventListener("popstate",()=>{editingQuery=false;});
  search.onblur=()=>{editingQuery=false;};
  byId("sources").onchange=({target})=>{
    if (target.checked) {manualSources.add(target.value);excludedSources.delete(target.value);} else manualSources.delete(target.value);
    saveManual();
  };
  function saveManual() {
    localStorage.setItem("ours.newsite.itemSources",JSON.stringify([...manualSources]));
    localStorage.setItem("ours.newsite.itemSourcesExcluded",JSON.stringify([...excludedSources]));changeView();
  }
  byId("sources").onclick=({target})=>{
    const key=target.dataset.exclude;if(!key)return;
    if(excludedSources.has(key))excludedSources.delete(key);
    else {excludedSources.add(key);manualSources.delete(key);}
    saveManual();
  };
  byId("clear").onclick=()=>{
    manualSources.clear(); excludedSources.clear(); saveManual();
  };
  for(const viewport of [list,magicList])viewport.addEventListener("scroll",()=>{renderRows();savePosition();},{passive:true});
  detail.addEventListener("scroll",savePosition,{passive:true});
  window.addEventListener("pagehide",savePosition);
  history.scrollRestoration="manual";
  window.addEventListener("popstate",restoreRoute);
  // Browser-internal hash assignments also dispatch popstate. Delegation preserves
  // modifier clicks, the context menu and middle-click's native new-tab behavior.
  document.addEventListener("click",e=>{
    if (!initialized || e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a=e.target.closest("a[href]");
    if (!a) return;
    const url=new URL(a.href);
    if (url.origin!==location.origin || url.pathname!==location.pathname || !url.hash) return;
    if(kind==="decks" && url.searchParams.has("card")){e.preventDefault();followPage(kind,url).catch(showError);return;}
    if(readingPages.has(kind)){e.preventDefault();followPage(kind,url).catch(showError);return;}
    e.preventDefault();
    if(url.hash.includes(",flst")){followPage(kind,url).catch(showError);return;}
    navigate(url.hash.slice(1).split(",")[0].toLowerCase(),a.dataset.id || url.searchParams.get("uid"));
  });
  for(const viewport of [list,magicList])viewport.addEventListener("keydown",e=>{
    if(kind==="races" && visible.length){
      const i=ids.get(selected || e.target.closest("[data-id]")?.dataset.id);
      if(["ArrowRight","ArrowLeft"].includes(e.key) && i!=null){e.preventDefault();changeFamily(index.rows[i].family,e.key==="ArrowRight");return;}
      if(["ArrowDown","ArrowUp","j","k"].includes(e.key)){
        e.preventDefault();const order=sections[0].entries, step=["ArrowDown","j"].includes(e.key)?1:-1;
        const next=order[order.indexOf(i)+step];if(next!=null){ensureVisible(next);navigate(index.rows[next].h,index.rows[next].id);}return;
      }
    }
    if (!["Home","End","ArrowDown","ArrowUp"].includes(e.key) || !visible.length) return;
    e.preventDefault();
    const pos=Number(e.target.closest("a")?.dataset.position ?? -1);
    const next=e.key==="Home" ? 0 : e.key==="End" ? visible.length-1 :
      Math.min(visible.length-1,Math.max(0,pos + (e.key==="ArrowDown" ? 1 : -1)));
    ensureVisible(visible[next]); document.querySelector('[data-position="'+next+'"]')?.focus({preventScroll:true});
  });
  const resize=new ResizeObserver(()=>renderRows());resize.observe(list);resize.observe(magicList);
  attachInteractions(previewData);
}

async function start() {
  const statusInfo=byId("version-info");
  let lastStatus;
  function showStatus(s) {
    lastStatus=s;
    const current=rootManifest?.revision || manifest?.revision || s.active;
    const short=current?.slice(0,12) || "—";
    byId("revision").textContent="本页版本 "+short;
    byId("revision").title=current || "";
    let alert="";
    if (s.error || ["failed","fallback"].includes(s.state)) alert="资料生成失败，当前使用版本 "+short;
    else if (["building","pending","checking","stale"].includes(s.state)) alert="正在核对或更新资料，当前版本 "+short;
    else if (s.active && current && s.active!==current) alert="新资料已就绪，刷新可读新版";
    byId("status-alert").textContent=alert;
    byId("status-note").textContent=s.error || alert || "资料已就绪。";
  }
  const fetchStatus=()=>json("status.json").then(showStatus).catch(()=>{});
  fetchStatus();
  statusInfo.addEventListener("toggle",()=>{if(statusInfo.open)fetchStatus();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)fetchStatus();});
  // The first local build has no previous revision to serve. Wait only while
  // the server is actively preparing it. Static and ready pages never poll.
  for (;;) {
    const response=await fetch("data/index.json");
    if (response.ok) { manifest=await response.json(); break; }
    if (response.status!==503) throw new Error("找不到新版目录（HTTP "+response.status+"）");
    const status=await response.json();
    showStatus(status);
    // No published manifest exists. Existing local revisions are returned with 200 even during a rebuild.
    const previous=new URL("../"+routeKind()+".html",location.href);previous.hash=location.hash;previous.search=location.search;
    if(routeKind()==="index"){previous.pathname=previous.pathname.replace(/index\.html$/,"");previous.hash="index.html";}
    if(routeKind()==="library")previous.pathname=previous.pathname.replace(/library\.html$/,"__ours/library.html");
    location.replace(previous);return;
  }
  if (!manifest.catalogs) throw new Error("请生成新版物品目录");
  if(lastStatus)showStatus(lastStatus);
  else byId("revision").textContent="本页版本 "+manifest.revision.slice(0,12);
  rootManifest=manifest;
  if(!usePublishedPage(routeKind()))return;
  setKind(routeKind());activate();
  document.dispatchEvent(new CustomEvent("catalog-manifest",{detail:rootManifest}));
  // 书签失败时仍用完整目录解析；省略书签的首次打开直接取目录。
  if (!readingPages.has(kind) && !encounterOpen() && routeHash()) await readBookmarkFirst().catch(()=>{});
  await restoreRoute();
}
export {start};

