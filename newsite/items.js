import {readingPages,referencePages,optionPages,ownedPage,optionQuick,optionRow,familyRows,toggleFamily} from "./option-view.js";
import {ItemFilters, defaultFilters, rarityName} from "./item-filters.js";
import {attachInteractions} from "./item-interactions.js";
import {activeBounds,slideSelection,enter,entryBlocks,rowPositions,moveRows} from "./motion.js";
import {describeTrail,sameTrail} from "./trail.js";

import {quickControls,monsterControls,showProficiency} from "./monster-view.js";
import {decorateCard, renderSupplement} from "./card-view.js";
import {bookInPreset,bookInScope,manualPanel,presetModes} from "./manual-sources.js";
const byId = id => document.getElementById(id);
const mode = byId("mode"), edition = byId("edition"), manual = byId("manual");
const search = byId("search"), list = byId("list"), rows = byId("rows"), detail = byId("detail");
const ROW_HEIGHT=42, GROUP_HEIGHT=36;
const visibleRows=()=>visible.map(i=>visibleCatalog.rows[i]);
const viewApi={
  visibleHashes:()=>visible.map(i=>visibleCatalog.rows[i].h),
  visibleIds:()=>visible.map(i=>visibleCatalog.rows[i].id),
  get revision(){return rootManifest?.revision;},
  get rowCount(){return prototypeView?.entries.length ?? visible.length;},
  variantRows:()=>prototypeView?.entries.map(i=>{
    const group=prototypeView.groups.get(i);
    return {hash:index.rows[group.target].h,id:index.rows[group.target].id,
      parent:index.rows[group.parent].h,members:group.ids.map(i=>index.rows[i].id),
      tier:prototypeView.effect ? (group.rank===0?1:group.rank<3?2:3) : null};
  }) ?? [],
};
let kind,rootManifest,listLayout,rawCard,currentTab="stats",scaleSettings={},paintedPage,paintedDetail;
let selectionPinned=false;
const foldedItems=new Set();
const prototypeCache=new WeakMap();
let prototypeModule, prototypeData, prototypeView, mentionedOpen=false;
const variantNamesCache=new WeakMap();
export const prototypeRequested=(url=new URL(location.href))=>url.searchParams.get("proto")==="1";
// The native global index only contains generic variants. Add exact concrete
// names to this query once the reader has explicitly enabled the prototype.
export async function prototypeSearchDocs(query){
  const selectedScope=getScope(), data=rootManifest.itemPrototype?.[selectedScope];
  if(!data || !prototypeRequested() || query.length<2)return [];
  const catalog=kind==="items" && scope===selectedScope ? index
    : await object(rootManifest.catalogs[selectedScope],catalogs,4);
  if(!catalog)return [];
  const module=prototypeModule || await import("./item-prototype.js");
  let names=variantNamesCache.get(catalog);
  if(!names){
    names=object(data.groups).then(groups=>module.variantNames(catalog,groups)).catch(error=>{
      variantNamesCache.delete(catalog);throw error;
    });
    variantNamesCache.set(catalog,names);
  }
  const candidates=module.exactVariantNames(await names,query);
  if(!candidates.length)return [];
  const indices=new Set(candidates.map(([i])=>i)), inRange=new Set(allowedRows(catalog,"items",r=>!r.hidden));
  // Named duplicates keep their native bookmark landing.
  const rows=catalog.order[edition.value || "24"].filter(i=>indices.has(i));
  const originalNames=new Map(candidates);
  return rows.map((i,rank)=>{
    const row=catalog.rows[i],source=catalog.sources[row.s];
    return {id:100000000+rank,c:4,cn:row.n,n:originalNames.get(i) || row.n,u:row.h,s:row.s,sA:source.abv,
      _prototypeOutside:!inRange.has(i),_traits:[row.rarity]};
  });
}
function prototypeGroup(i){
  const anchor=prototypeView?.aliases.get(i);
  return prototypeView?.groups.get(anchor);
}
function updatePrototypeFlag(){
  const requested=kind==="items" && prototypeRequested();
  document.body.classList.toggle("item-prototype",requested && !!rootManifest.itemPrototype);
  search.placeholder=document.body.classList.contains("item-prototype")
    ? "搜名称或效果，如：AC、火焰抗性、飞行" : "搜名称（中英文都行）";
  return requested && rootManifest.itemPrototype?.[scope];
}
function prototypeEffectUrl(digest){
  const suffix=rootManifest.objectEncoding==="gzip" ? ".json.gz" : ".json";
  return new URL("data/objects/"+digest+suffix,location.href).href;
}
async function loadItemPrototype(ticket){
  const data=updatePrototypeFlag();
  if(!data){prototypeData=prototypeView=null;return;}
  const catalog=index;
  let pending=prototypeCache.get(catalog);
  if(!pending){
    pending=Promise.all([import("./item-prototype.js"),object(data.groups)]).then(([module,groups])=>{
      prototypeModule=module;
      return module.makeItemPrototype(catalog,groups,prototypeEffectUrl(data.effects));
    }).catch(error=>{prototypeCache.delete(catalog);throw error;});
    prototypeCache.set(catalog,pending);
  }
  const prepared=await pending;
  if(ticket===listTicket)prototypeData=prepared;
}
const isMonster=()=>kind==="bestiary";
export const currentKind=()=>kind;
const remembered=new Map();
const isOption=()=>Object.hasOwn(optionPages,kind);
const pageName=()=>({dmscreen:"DM 帷幕",statgen:"属性生成器",crcalculator:"CR 计算器 (5e/2014)",classes:"职业",index:"大厅",book:"读书",books:"书库",adventures:"冒险模组",adventure:"模组阅读",library:"全部书目",quickreference:"快速参考",search:"全站搜索",terms:"译名术语库"})[kind] || optionPages[kind] || (isMonster()?"怪物":"物品");
const routeKind=()=>{const key=location.pathname.split("/").at(-1).replace(".html","");return ownedPage(key)?key:"items";};
const manifestFor=page=>page==="dmscreen"?rootManifest.monsters:page==="statgen"?rootManifest.statgen:page==="crcalculator"?rootManifest.tools:readingPages.has(page)?(rootManifest.reading?.[page] || (["terms","search"].includes(page) && rootManifest.reading?.index)):page==="items"?rootManifest:page==="bestiary"?rootManifest.monsters:rootManifest.pages?.[page];
let familyRoles=new Map(), familyEnglish=new Map(), pendingFamily;
function changeFamily(name,expanded){
  if(index!==visibleCatalog)return;
  const before=rowPositions(list,"#rows > a");
  pendingFamily=null;toggleFamily(name,expanded,search.value.trim());layoutRows();renderRows(true);
  moveRows(list,before,"#rows > a");
}
let readingController;
let reviews, reviewsLoading, reviewTarget;
const hasReviews=()=>kind==="feats" || kind==="classes";
function paintReview(target=null) {
  reviewTarget=target;
  reviews?.show(target,hasReviews());
}
function setKind(next) {
  if(kind===next)return;
  endEncounter();
  readingController?.abort();
  document.querySelector("main").hidden=readingPages.has(next);
  byId("reading").hidden=!readingPages.has(next);
  byId("reading").replaceChildren();
  ++renderTicket; ++listTicket;
  prototypeData=prototypeView=null;mentionedOpen=false;
  kind=next; index=null; scope=null; selected=null; currentCard=null;rawCard=null;
  paintReview();
  extras=null; positions.clear();ids=new Map();byHash=new Map();duplicates=new Set();listLayout=null;visible=[];visibleCatalog=null;
  selectionPinned=false;paintedDetail=null;
  currentTab="stats";scaleSettings={};
  manifest=manifestFor(kind);
  if(!manifest) throw new Error("本版资料还没有"+pageName()+"目录");
  document.body.classList.toggle("reference-page",Object.hasOwn(referencePages,next));
  document.body.dataset.page=next;document.body.dataset.ready="false";
  updatePrototypeFlag();
  document.title=pageName()+" · 5e全书";
  document.querySelector(".catalog").setAttribute("aria-label",pageName()+"目录");
  byId("family-sort").hidden=kind!=="races" && !Object.hasOwn(referencePages,kind);
  filters.configure(isMonster());
  byId("quick-first").hidden=byId("quick-second").hidden=false;
  byId("monster-tools").replaceChildren();byId("detail-tabs").replaceChildren();
  rows.replaceChildren();detail.replaceChildren();delete detail.dataset.hash;delete detail.dataset.id;
  byId("list-outside").hidden=true;
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
let manifest, index, extras, scope, visibleCatalog, visible = [], positions = new Map();
let ids = new Map(), byHash = new Map(), duplicates = new Set();
let selected,currentCard,renderTicket=0,listTicket=0;
let manualSources, excludedSources=new Set(), manualPreset, seededManual=false, appliedMode="rec", initialized=false;
let sourceBooks, sourceBookIndex, pendingSourceBooks, paintManualPanel;
const catalogs=new Map(),objects=new Map();
const effectiveMode=()=>mode.value==="manual" && presetModes.has(manualPreset) ? manualPreset : mode.value;
const getScope=()=>effectiveMode()==="manual" ? (manualPreset==="custom-short"?"short":"full")
  : effectiveMode()==="all"?"full":"short";
const sourceCode=key=>sourceBookIndex?.get(key.toLowerCase())?.code || key;
const coreBookLabels={PHB:"PHB'14",DMG:"DMG'14",MM:"MM'14",XPHB:"PHB'24",XDMG:"DMG'24",XMM:"MM'25"};
const sourceAbbreviation=key=>sourceBookIndex?.get(key.toLowerCase())?.abv || index?.sources[key]?.abv || coreBookLabels[key.toUpperCase()] || key;
const normalizeSources=values=>new Set((Array.isArray(values)?values:[]).map(code=>String(code).toLowerCase()));
const sourcePresetKey="ours.newsite.itemSourcePreset";
const sourceIncludeKey="ours.newsite.itemSources",sourceExcludeKey="ours.newsite.itemSourcesExcluded";
const validPreset=key=>presetModes.has(key) || ["custom-short","custom-full"].includes(key);
function scopeContext(){
  return {mode:effectiveMode(),edition:edition.value,manualSources,excludedSources,
    strictManual:!!manualPreset,sourceCode};
}
const filters = new ItemFilters(() => changeView(), loadFilters, showError);

function showError(error) {
  byId("count").textContent = "资料读取失败：" + error.message;
}

async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("找不到资料（HTTP " + r.status + "）");
  return r.json();
}

async function gzipJson(response) {
  // Some static hosts transparently decode .gz responses. Check the actual bytes.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

async function readObject(digest) {
  const path = "data/objects/" + digest + ".json";
  if (rootManifest?.objectEncoding !== "gzip") return json(path);
  const response = await fetch(path + ".gz");
  if (!response.ok) throw new Error("找不到资料（HTTP " + response.status + "）");
  return gzipJson(response);
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
  if(catalog.fixedSources && !(selectedMode==="manual" && manualPreset))return true;
  const source = catalog.sources[row.s];
  switch (selectedMode) {
    case "official": return source.official;
    case "rec": return source.official || source.good;
    case "brew": return !source.official && source.good;
    case "manual": {
      const primary=row.s.toLowerCase(), secondary=Object.hasOwn(optionPages,page)?null:row.sources;
      if (excludedSources.has(primary) || secondary?.some(s=>excludedSources.has(s.toLowerCase()))) return false;
      return !manualPreset && !manualSources?.size || manualSources?.has(primary)
        || secondary?.some(s=>manualSources?.has(s.toLowerCase()));
    }
    case "all": return page!=="bestiary" || source.defaultOn;
    default: return true;
  }
}

// 列表、搜索结果及悬停都经相同的来源、同版去重与跨版本判定。
function allowedRows(catalog,page,accept,order=catalog.order) {
  const data=catalog.rows;
  const selectedMode=effectiveMode();
  const candidates=data.map((r,i)=>sourcePass(r,catalog,page,selectedMode) && accept(r,i));
  const base=data.map((r,i)=>candidates[i] && !r.same?.some(t=>candidates[t]));
  const rel=edition.value==="24" ? "newer" : edition.value==="14" ? "older" : null;
  return order[edition.value || "24"].filter(i=>base[i] && !(rel && data[i][rel]?.some(t=>base[t])));
}
const membership=new Map();
export function searchScopeSettings() {
  return {
    included:[...(manualSources || [])],excluded:[...excludedSources],
    includeNone:!!manualPreset && !manualSources?.size,
  };
}
export async function entryVisible(page,hash,uid,{scopeOnly=false,featureSource}={}) {
  page=page?.replace(/\.html$/,"");
  if(page==="classes" && rootManifest?.reading?.classes && hash){
    const {classVisible}=await import("./class-page.js");
    return classVisible({object,manifest:rootManifest,...scopeContext()},hash,featureSource);
  }
  if(scopeOnly && manualPreset && mode.value==="manual" && ["book","adventure"].includes(page)){
    const id=hash.split(",")[0].toLowerCase();
    const books=await object(rootManifest.reading[page+"s"]);
    return books.some(book=>book.id.toLowerCase()===id && bookInScope(book,scopeContext()));
  }
  if(scopeOnly && page==="card"){
    const url=await deckLink(hash);
    return url ? entryVisible("decks",url.hash.slice(1),null,{scopeOnly}) : false;
  }
  if(!ownedPage(page) || readingPages.has(page) || !rootManifest)return null;
  const revision=listTicket;
  const key=scopeOnly?page+" scope":page;
  let cached=membership.get(key);
  if(!cached || cached.revision!==revision){
    const pending=(async()=>{
      const group=manifestFor(page);
      if(!group)return new Set();
      const current=page===kind && index!=null;
      const useDisplayed=current && !scopeOnly && visibleCatalog;
      const catalog=useDisplayed?visibleCatalog:current?index:await object(group.catalogs[getScope()],catalogs,4);
      const allowed=useDisplayed?visible:allowedRows(catalog,page,r=>!r.hidden);
      const set=new Set();
      for(const i of allowed){const row=catalog.rows[i];set.add(row.id);set.add(row.h);
        if(row.e)set.add(encodeURIComponent(row.e.toLowerCase()).toLowerCase()+"_"+row.s.toLowerCase());}
      return set;
    })();
    cached={revision,pending};membership.set(key,cached);
  }
  const set=await cached.pending;
  return uid ? set.has(uid) : set.has(hash?.toLowerCase());
}
async function filterList(ticket) {
  const terms=search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const data=index.rows;membership.clear();
  let result=allowedRows(index,kind,filters.predicate(),terms.length && index.searchOrder || index.order);
  if(prototypeData){
    const prepared=prototypeData,matches=await prototypeModule.findEffects(prepared,terms);
    if(ticket!==listTicket)return false;
    result=filters.sort(result);
    prototypeView=prototypeModule.groupItems(prepared,result,terms,matches,filters.state.sort==="catalog");
    visible=terms.length ? result.filter(i=>prototypeView.aliases.has(i)) : result;
  }else if(terms.length)result=result.filter(i=>{
    const r=data[i];
    const names = [r.n,r.e,r.family,r.family && familyEnglish.get(r.family)].filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every(term => names.includes(term));
  });
  if(!prototypeData)visible=filters.sort(result);
  visibleCatalog=index;
  positions.clear();
  visible.forEach((i,pos)=>positions.set(i,pos));
  for(const [i,anchor] of prototypeView?.aliases || [])positions.set(i,positions.get(anchor));
  layoutRows(!!terms.length);
  byId("count").textContent=prototypeView?.effect
    ? `效果 ${prototypeView.stated+prototypeView.granted} 行 · 提及 ${prototypeView.mentioned.length} 行`
    : prototypeView
    ? `显示 ${prototypeView.entries.length} 行 · ${visible.length} 条物品`
    : `显示 ${visible.length} 条 · 本页共 ${data.length} 条`;
  if(isOption())optionQuick(index,filters,changeView);
  else {byId("quick-first").hidden=byId("quick-second").hidden=false;quickControls(filters,isMonster(),changeView);}
  document.dispatchEvent(new Event("catalog-controls"));
  return true;
}

function layoutRows(searching=!!search.value.trim()){
  if(kind==="items"){
    if(prototypeView && searching){
      const {effect,entries,stated,granted,mentioned}=prototypeView;
      if(!effect){listLayout=makeLayout(entries);return;}
      const groups=[];
      if(stated)groups.push({title:"数据明确给出",count:stated},...entries.slice(0,stated));
      if(granted)groups.push({title:"正文说明效果",count:granted},...entries.slice(stated,stated+granted));
      if(mentioned.length){
        const about=effect.id==="ac"?"（多为物件或目标的 AC）":"";
        const text="另有 "+mentioned.length+" 条只是提到「"+search.value.trim()+"」"+about;
        groups.push({key:"effects-mentioned",title:text+(mentionedOpen?"，点此收起":"，点开查看"),mentioned:true});
        if(mentionedOpen)groups.push(...mentioned);
      }
      listLayout=makeLayout(groups);return;
    }
    const mundane=[],magic=[];
    for(const i of prototypeView?.entries || visible)(index.rows[i].m ? mundane : magic).push(i);
    const entries=[];
    for(const [key,title,group] of [["mundane","普通物品",mundane],["magic","魔法物品",magic]]){
      entries.push({key,title,count:group.length});
      if(!foldedItems.has(key))for(const i of group)entries.push(i);
    }
    listLayout=makeLayout(entries);
    return;
  }
  if(kind==="races"){
    const family=familyRows(index,visible,search.value.trim(),pendingFamily);
    familyRoles=family.roles;
    listLayout=makeLayout(family.entries);
    return;
  }
  const entries=[];
  let previous, groupCount;
  for(const i of visible){
    const r=index.rows[i],title=isMonster()?"CR "+r.cr:r.g;
    if (title && !searching && filters.state.sort==="catalog" && title!==previous) {
      groupCount={title,count:0};entries.push(groupCount);previous=title;
    }
    if(groupCount)groupCount.count++;
    entries.push(i);
  }
  listLayout=makeLayout(entries);
}

function readFilters(params) {
  try { return Object.assign(defaultFilters(), JSON.parse(params.get("filters") || "{}")); }
  catch { return defaultFilters(); }
}

function stateUrl(hash, uid, generic=false) {
  const url = new URL(location.href);
  url.searchParams.delete("ours-source"); url.searchParams.delete("ours-search");
  url.searchParams.set("mode", mode.value); url.searchParams.set("ed", edition.value);
  writeManualParams(url);
  for (const [k,v] of [["q",search.value],
    ["filters",JSON.stringify(filters.state) === JSON.stringify(defaultFilters()) ? "" : JSON.stringify(filters.state)],["uid",uid]]) {
    if (v) url.searchParams.set(k,v); else url.searchParams.delete(k);
  }
  if(kind==="items" && prototypeRequested(url)){
    if(generic)url.searchParams.set("variant","generic");else url.searchParams.delete("variant");
  }
  url.hash = hash || "";
  return url;
}

function writeManualParams(url){
  for(const key of ["sources","excludeSources","sourceScope"])url.searchParams.delete(key);
  if(mode.value!=="manual")return;
  if(manualSources)url.searchParams.set("sources",JSON.stringify([...manualSources].map(sourceCode)));
  if(excludedSources.size)url.searchParams.set("excludeSources",JSON.stringify([...excludedSources].map(sourceCode)));
  if(manualPreset)url.searchParams.set("sourceScope",manualPreset);
}

function makeLayout(entries) {
  const offsets=[0],groupOffsets=[],groups=[];
  for(const e of entries){
    if(typeof e!=="number"){groupOffsets.push(offsets.at(-1));groups.push(e);}
    offsets.push(offsets.at(-1)+(typeof e==="number"
      ? prototypeView?.groups.get(e)?.effect ? 64 : index.columns ? 30 : kind==="races" ? 38 : ROW_HEIGHT
      : GROUP_HEIGHT));
  }
  byId("space").style.height=offsets.at(-1)+"px";
  let sticky=list.querySelector(".sticky");
  if(groupOffsets.length && !sticky){sticky=document.createElement("div");sticky.className="sticky";list.prepend(sticky);}
  if(sticky){sticky.replaceChildren();sticky.hidden=!groupOffsets.length;}
  return {entries,offsets,groupOffsets,groups,sticky,query:prototypeView ? search.value : null,start:-1,end:-1,group:-1};
}
function groupHeading(group,inSticky=false) {
  const h=document.createElement(group.key?"button":"div"), count=document.createElement("span");
  h.className="group-head";h.textContent=group.title;
  if(!group.mentioned){count.textContent=group.count+" 个";h.append(count);}
  if(group.key){
    h.type="button";h.dataset.itemGroup=group.key;
    h.setAttribute("aria-expanded",String(group.mentioned ? mentionedOpen : !foldedItems.has(group.key)));
    if(inSticky)h.tabIndex=-1;
    h.onclick=()=>{
      if(index!==visibleCatalog)return;
      const wasFocused=document.activeElement===h && !inSticky;
      const before=rowPositions(list,"#rows > a,#rows > button");
      if(group.mentioned)mentionedOpen=!mentionedOpen;
      else if(!foldedItems.delete(group.key))foldedItems.add(group.key);
      layoutRows();
      list.scrollTop=listLayout.groupOffsets[listLayout.groups.findIndex(g=>g.key===group.key)];
      renderRows(true);moveRows(list,before,"#rows > a,#rows > button");
      if(wasFocused)rows.querySelector('[data-item-group="'+group.key+'"]')?.focus({preventScroll:true});
    };
  }
  return h;
}
function indexAt(offsets,y) {
  let lo=0,hi=offsets.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>>1;if(offsets[mid]<=y)lo=mid;else hi=mid-1;}
  return lo;
}
function renderRows(force=false) {
  if(!index || index!==visibleCatalog || !listLayout)return;
  const sec=listLayout,{entries,offsets}=sec;
  const viewport=list,host=rows, addToEncounter=encounterOpen();
  if(sec.groups.length && sec.sticky){
    const n=indexAt(sec.groupOffsets,viewport.scrollTop),top=sec.groupOffsets[n];
    if(sec.group!==n){
      sec.sticky.replaceChildren(groupHeading(sec.groups[n],true));sec.group=n;
    }
    sec.sticky.hidden=viewport.scrollTop<=top;
    sec.sticky.firstChild.style.transform="translateY("+Math.min(0,(sec.groupOffsets[n+1] ?? Infinity)-viewport.scrollTop-GROUP_HEIGHT)+"px)";
  }
  const start=Math.max(0,indexAt(offsets,viewport.scrollTop)-3);
  const end=Math.min(entries.length,indexAt(offsets,viewport.scrollTop+viewport.clientHeight)+4);
  if(!force && start===sec.start && end===sec.end)return;
  const url=stateUrl("",null);
  const focused=host.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  const frag=document.createDocumentFragment();
  for(let pos=start;pos<end;pos++){
    const i=entries[pos];
    if(typeof i!=="number"){
      frag.append(groupHeading(i));continue;
    }
    const group=prototypeView?.groups.get(i);
    const r=index.rows[group?.options?.length ? group.parent : i], target=index.rows[group?.target ?? i];
    const a=document.createElement("a"),name=document.createElement("span"),meta=document.createElement("span"),source=document.createElement("span");
    if(duplicates.has(target.h))url.searchParams.set("uid",target.id);else url.searchParams.delete("uid");
    if(prototypeView){
      if(group?.generic)url.searchParams.set("variant","generic");else url.searchParams.delete("variant");
    }
    url.hash=target.h;a.href=url.href;a.dataset.id=target.id;a.dataset.page=kind+".html";a.dataset.position=positions.get(i);
    if(rowSelected(i))a.setAttribute("aria-current","true");
    name.className="row-name";name.textContent=group?.form?.name || r.n;
    const english=group?.form?.english || r.e;
    if(english){const en=document.createElement("small");en.className="english";en.textContent=english;name.append(en);}
    if(group?.effect){
      a.classList.add("item-effect-row");
      if(prototypeView.effect)a.dataset.effectTier=group.rank===0?"1":group.rank<3?"2":"3";
      name.append(prototypeModule.effectExcerpt(group.effect,group.baseEvidence));
    }
    meta.className="rarity";meta.textContent=group?.rarity || (isMonster() ? r.type+" · "+r.cr : rarityName(r.rarity));
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
    if(addToEncounter){
      const add=document.createElement("button");add.type="button";add.className="enc-add";add.textContent="＋";add.title="加入遭遇";
      add.onclick=e=>{e.preventDefault();e.stopPropagation();encounterView?.adjust(r.h,e.shiftKey?5:1);};name.prepend(add);
    }
    a.append(name);
    if(group?.summary){
      const note=document.createElement("small");note.className="item-base-summary";
      note.textContent=group.summary;note.title=group.summary;source.append(note);
      a.classList.add("item-variant-row");
    }
    if(isOption())optionRow(a,name,meta,r,index,kind==="races"?familyRoles.get(i):null,changeFamily);
    a.append(meta,source);frag.append(a);
  }
  host.style.transform="translateY("+offsets[start]+"px)";host.replaceChildren(frag);
  if(sec.query!=null)host.dataset.query=sec.query;else delete host.dataset.query;
  if(focused)host.querySelector('[data-id="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
  sec.start=start;sec.end=end;
}

function readSourceBooks(){
  if(!pendingSourceBooks)pendingSourceBooks=(async()=>{
    let books;
    if(rootManifest.manualSources)books=await object(rootManifest.manualSources);
    else {
      // A pinned revision may predate the compact book list.
      const [catalog,shelf,adventures]=await Promise.all([
        object(rootManifest.catalogs.full,catalogs,4),
        object(rootManifest.reading?.books),object(rootManifest.reading?.adventures),
      ]);
      const layers={0:"core",2:"supplement",3:"setting",4:"partner",5:"ours",6:"thirdparty"};
      const map=new Map(Object.entries(catalog.sources).map(([code,meta])=>[code.toLowerCase(),
        {...meta,code,name:meta.full,english:"",section:layers[meta.layer] || "other"}]));
      for(const book of [...(Array.isArray(shelf)?shelf:[]),...(Array.isArray(adventures)?adventures:[])]){
        const key=book.s.toLowerCase();
        map.set(key,{code:book.s,abv:book.s,...map.get(key),name:book.n,english:book.e,
          section:book.section,official:book.official,good:book.good});
      }
      books=[...map.values()];
    }
    sourceBooks=books;
    sourceBookIndex=new Map(books.map(book=>[book.code.toLowerCase(),book]));
    return books;
  })().catch(e=>{pendingSourceBooks=null;throw e;});
  return pendingSourceBooks;
}

const presetSelection=key=>new Set(sourceBooks.filter(book=>bookInPreset(book,key)).map(book=>book.code.toLowerCase()));
function startManual(key){
  manualPreset=presetModes.has(key)?key:"rec";
  manualSources=presetSelection(manualPreset);excludedSources=new Set();seededManual=true;
}
function customManualScope(){
  return getScope()==="short"?"custom-short":"custom-full";
}
async function prepareManual(previous){
  if(mode.value!=="manual")return;
  await readSourceBooks();
  if(mode.value!=="manual")return;
  if(manualSources==null || seededManual && presetModes.has(previous))startManual(previous);
  else if(presetModes.has(manualPreset)){
    const expected=presetSelection(manualPreset);
    if(excludedSources.size || expected.size!==manualSources.size || [...expected].some(key=>!manualSources.has(key)))
      manualPreset=customManualScope();
  }
  showManual();
}
function showManual() {
  manual.hidden = mode.value !== "manual";
  if (manual.hidden) { manual.open=false; return; }
  if(!sourceBooks || !manualSources)return;
  byId("manual-loading").hidden=true;
  byId("manual-controls").disabled=false;
  byId("manual-legacy-note").hidden=!!manualPreset || !!manualSources.size;
  paintManualPanel(sourceBooks,manualSources,excludedSources);
}

const objectForRow = r => ({id:r.id,hash:r.h,pack:index.packs[r.p]});
const firstIndex=()=>listLayout.entries.find(Number.isInteger);
const firstGroup=()=>prototypeView?.groups.get(firstIndex());
const firstRow=()=>index.rows[firstGroup()?.target ?? firstIndex()];
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
  if(prototypeView){
    const a=prototypeView.aliases.get(i),b=prototypeView.aliases.get(ids.get(selected));
    return a!=null && a===b;
  }
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
  const {entries,offsets,groupOffsets}=listLayout;
  const n=entries.indexOf(prototypeView?.aliases.get(i) ?? i);if(n<0)return;
  const top=offsets[n],bottom=offsets[n+1],stickyHeight=groupOffsets.length?GROUP_HEIGHT:0;
  if(top<list.scrollTop+(list.scrollTop?stickyHeight:0) || bottom>list.scrollTop+list.clientHeight)
    list.scrollTop=Math.max(0,top-stickyHeight);
  renderRows();
}
let presentationJob=0;
async function paintPresentation() {
  const job=++presentationJob, raw=rawCard;if(!raw)return;
  const tabs=byId("detail-tabs");
  const item=ids.get(currentCard.id),row=index?.rows[item];
  const tracked=paintedDetail?.page===kind && paintedDetail.id===currentCard.id;
  const tabChanged=tracked && paintedDetail.tab!==currentTab;
  const changedEntry=!tracked && (paintedDetail || paintedPage);
  const previous=tabChanged ? activeBounds(tabs,".view-seg button[aria-pressed=true]") : null;
  const available=[["stats",isMonster()?"数据卡":(["backgrounds","races","feats"].includes(kind)?"特质":pageName())]];
  if(raw.info || raw.fluff || raw.fluffHtml) available.push(["info",isMonster() || isOption()?"简介":"信息"]);
  if(raw.images?.length || raw.token) available.push(["images","图片"]);
  if(!available.some(([k])=>k===currentTab))currentTab="stats";
  const seg=document.createElement("span");seg.className="view-seg";
  seg.append(...(available.length === 1 ? [] : available).map(([k,t])=>{
    const b=document.createElement("button");b.type="button";b.dataset.detailTab=k;b.textContent=t;b.setAttribute("aria-pressed",String(k===currentTab)); b.onclick=()=>switchTab(k);return b;
  }));
  tabs.replaceChildren(...(seg.childElementCount?[seg]:[]));
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
    decorateCard(detail,card,kind,{openImages:()=>switchTab("images"),sourceAbbreviation});
    if(kind==="feats")paintReview({anchor:detail,key:`feats|${currentCard.hash}`,metadata:{
      kind,name:row?.n || detail.querySelector(".ve-stats__h-name")?.textContent.trim() || decodeURIComponent(currentCard.hash.split("_")[0]),
      source:row?.s || currentCard.hash.split("_").at(-1).toUpperCase(),
    }});
    if(isMonster()){
      showProficiency(detail,!!scaleSettings.prof);
      monsterControls(detail,raw,scaleSettings,applyScaling);
    }
  }
  if(kind==="feats" && currentTab!=="stats")paintReview();
  for(const a of detail.querySelectorAll("a[href]")){
    const link=new URL(a.href);if(link.origin===location.origin && ownedPage(link.pathname.split("/").at(-1).replace(".html",""))){
      const page=link.pathname.split("/").at(-1);
      const next=new URL(page+link.search+link.hash,location.href);
      if(prototypeRequested())next.searchParams.set("proto","1");
      a.href=next.href;
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
  if(prototypeData){
    const i=ids.get(currentCard.id);
    const group=prototypeGroup(i) || prototypeGroup(prototypeData.groupByMember.get(i));
    prototypeModule.addVariantPicker(detail,group,index,i,!!currentCard.generic,sourceAbbreviation,(next,generic)=>{
      const {h,id}=index.rows[next];navigate(h,duplicates.has(h)?id:null,generic);
    });
  }
  detail.dataset.hash=currentCard.hash;detail.dataset.id=currentCard.id;
  describeTrail(kind,row?.n || detail.querySelector(".ve-stats__h-name,.bk-mon-name")?.textContent.trim() || pageName(),
    row?.e || detail.querySelector(".ve-stats__eh-name,.bk-mon-en")?.textContent.trim());
  if(changedEntry&&paintedPage===kind && paintedDetail){enter(detail,{y:6,ms:220,from:.3});entryBlocks(detail);}
  if(tabChanged)enter(detail,{y:8,ms:280});
  slideSelection(tabs.querySelector(".view-seg"),previous,tabs.querySelector(".view-seg button[aria-pressed=true]"));
  paintedDetail={page:kind,id:currentCard.id,tab:currentTab};
}
function detailUrl(tab,settings) {
  const u=new URL(location.href); for(const k of ["tab","cr","spell","classLevel","prof"])u.searchParams.delete(k);
  if(tab!=="stats")u.searchParams.set("tab",tab);
  for(const [k,v] of Object.entries(settings))u.searchParams.set(k,v);
  return u;
}
function switchTab(tab) {
  if(tab===currentTab)return;
  if(reviews?.canLeave()===false)return;
  savePosition();history.pushState({...history.state,tab,detailTop:0},"",detailUrl(tab,scaleSettings));currentTab=tab;detail.scrollTop=0;paintPresentation().catch(showError);
}
function paintCard(ref,card) {
  currentCard=ref;rawCard=card;
  return paintPresentation();
}
function markOutsideRange(ref,card) {
  const note=byId("list-outside"),i=ids.get(ref.id),row=index.rows[i];
  note.hidden=positions.has(i);
  if(note.hidden)return;
  const inScope=i!=null && allowedRows(index,kind,()=>true).includes(i);
  const name=row?.n || card.model?.name || detail.querySelector(".ve-stats__th-name[data-name]")?.dataset.name
    || detail.querySelector(".ve-stats__h-name, .bk-mon-name")?.textContent.trim()
    || decodeURIComponent(ref.hash.split("_")[0]);
  const clearable=inScope && !row.hidden;
  const reason=inScope?"当前筛选结果里":"当前资料范围内";
  note.dataset.outsideRange=inScope?"filter":"scope";
  note.textContent=`正在看的『${name}』不在${reason}`;
  if(clearable){
    const clear=document.createElement("button");clear.type="button";clear.textContent="清除筛选";
    clear.onclick=()=>{
      search.value="";
      const {sort,desc}=filters.state;
      filters.state={...defaultFilters(),sort,desc};
      changeView();
    };
    note.append(" ",clear);
  }else{
    note.append(inScope?"。可在「筛选」中调整此类条目的显示条件。":"。请在顶栏切换资料范围或版本。");
  }
}

async function openCard(hash, {uid=null,reveal=false,scroll=0,keepPresentation=false,generic=false} = {}) {
  const job = ++renderTicket;
  const first=!hash && firstRow();
  const normalized=prototypeData && hash ? prototypeModule.prototypeBookmark(hash) : hash;
  const ref=hash ? await resolveItem(normalized,uid) : first && objectForRow(first);
  if (job !== renderTicket) return;
  const summary=ref && (hash ? generic : firstGroup()?.generic) && prototypeData?.summaries.get(ids.get(ref.id));
  if(summary)ref.generic=true;
  selected = ref?.id;
  const i=ids.get(selected);
  if(reveal && positions.has(i)){
    if(kind==="races" && !familyRoles.has(i)){
      pendingFamily=ref.hash;layoutRows();pendingFamily=null;renderRows(true);
    }
    if(kind==="items" && foldedItems.delete(index.rows[i].m?"mundane":"magic")){
      layoutRows();renderRows(true);
    }
  }
  syncSelected();
  if(reveal && positions.has(i))ensureVisible(i);
  byId("list-outside").hidden=true;
  if (!ref) {
    ++presentationJob;
    delete detail.dataset.hash;delete detail.dataset.id;currentCard=rawCard=null;
    byId("detail-tabs").replaceChildren();
    if(kind==="feats")paintReview();
    detail.textContent = hash ? "目录中没有这个"+pageName()+"。"
      : prototypeView?.mentioned.length ? "当前范围没有明确给予这个效果的物品。可以展开列表末尾的提及条目。"
      : "没有符合条件的"+pageName()+"。";
    return;
  }
  if (currentCard?.id === ref.id && currentCard.pack === ref.pack && currentCard.generic===ref.generic && detail.dataset.id === ref.id) {
    if(!keepPresentation || prototypeData)await paintPresentation();
    markOutsideRange(ref,rawCard);return;
  }
  if(!scroll)detail.parentElement.scrollTop=0;
  if(kind==="feats")paintReview();
  delete detail.dataset.hash;delete detail.dataset.id;
  detail.textContent="正在读取"+pageName()+"…";
  try {
    const card=summary?.card || await cardData(ref);
    if (job !== renderTicket) return;
    await paintCard(ref,card);
    markOutsideRange(ref,card);
    if(scroll)detail.parentElement.scrollTop=scroll;
  } catch(e) {
    if (job !== renderTicket) return;
    detail.textContent = e.message + " ";
    const retry=document.createElement("button"); retry.textContent="重新读取";
    retry.onclick=()=>openCard(ref.hash,{uid:ref.id,generic}); detail.append(retry);
  }
}

// 冷开书签时先取一个地址分片 + 一个卡包，小带宽下也能先读正文。
// 完整目录随后负责范围判定、同名落点和列表定位。
async function readBookmarkFirst() {
  const hash=routeHash(), url=location.href;
  if (!hash || hash==="blankhash" || prototypeRequested() && new URL(url).searchParams.get("variant")==="generic") return;
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
  history.replaceState({...history.state, listTop:list.scrollTop, detailTop:detail.parentElement.scrollTop},"");
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
  const hasManualParams=["sources","excludeSources","sourceScope"].some(key=>p.has(key));
  choose(mode,p.get("mode") ?? (hasManualParams?"manual":localStorage.getItem("ours.srcMode2")),"rec");
  choose(edition,p.get("ed") ?? localStorage.getItem("ours.edMode2"),"24");
  seededManual=false;
  const storedPreset=hasManualParams?p.get("sourceScope"):localStorage.getItem(sourcePresetKey);
  manualPreset=validPreset(storedPreset)?storedPreset:null;
  const storedSources=hasManualParams?p.get("sources"):localStorage.getItem(sourceIncludeKey);
  try {
    const saved=JSON.parse(storedSources);
    manualSources=Array.isArray(saved)?normalizeSources(saved):hasManualParams?new Set():undefined;
  } catch { manualSources=undefined; }
  try { excludedSources=normalizeSources(JSON.parse(hasManualParams?p.get("excludeSources"):localStorage.getItem(sourceExcludeKey))); }
  catch { excludedSources=new Set(); }
  search.value=p.get("q") || "";
  filters.state=readFilters(p);
  if (!Array.isArray(filters.state.rules)) filters.state.rules=[];
  if (history.state?.preferences == null) restoreLegacyConditions();
  appliedMode=mode.value;
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
        mode.value="manual";manualPreset=null;
        excludedSources=normalizeSources(off);manualSources=normalizeSources(on);
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
  const next=getScope();
  const effects=kind==="items" && prototypeRequested() && rootManifest.itemPrototype?.[next]?.effects;
  if(effects && scope!==next){
    import("./item-prototype.js").then(module=>module.warmEffects(prototypeEffectUrl(effects))).catch(()=>{});
  }
  await selectCatalog(next,ticket);
  if (listTicket !== ticket) return false;
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
  await loadItemPrototype(ticket);
  if (listTicket !== ticket) return false;
  showManual();filters.sync();
  return filterList(ticket);
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
  setKind(routeKind());
  const ticket=++listTicket;
  const restore=history.state || {};
  try {
    restoreControls();
    if(mode.value==="manual")await prepareManual(localStorage.getItem("ours.srcMode2"));
    if(ticket!==listTicket)return;
    pendingFamily=kind==="races"?routeHash():null;
    localStorage.setItem("ours.srcMode2",mode.value);localStorage.setItem("ours.edMode2",edition.value);
    if(readingPages.has(kind)){
      readingController?.abort();readingController=new AbortController();
      if(kind==="classes")paintReview();
      const signal=readingController.signal;
      const [view]=await Promise.all([import("./reading.js"),
        ["book","adventure"].includes(kind)?readSourceBooks().catch(()=>{}):null]);
      if(signal.aborted)return;
      const root=byId("reading");
      await view.show({kind,root,manifest:rootManifest,object,previewData,sourceAbbreviation,...scopeContext(),signal,
        paintReview,canLeaveReview:()=>reviews?.canLeave()!==false});
      if(!signal.aborted){
        showManual();markReady();document.dispatchEvent(new Event("catalog-controls"));
      }
      return;
    }
    if (!await refresh(ticket)) return;
    list.scrollTop=restore.listTop ?? 0;
    renderRows(true);
    if (restore.preferences == null) history.replaceState({...restore,preferences:stateUrl(null,null).search},"");
    if(encounterOpen()){
      await mountEncounter(ticket);if(ticket===listTicket)markReady();return;
    }
    endEncounter();
    const bookmark=routeHash(), hash=bookmark==="blankhash"?"":bookmark;
    selectionPinned=restore.selectionPinned ?? !!hash;
    const first=!hash && firstRow();
    if(first)history.replaceState({...history.state,selectionPinned},"",stateUrl(first.h,duplicates.has(first.h)?first.id:null,firstGroup()?.generic));
    const params=new URL(location.href).searchParams;
    const opening=openCard(hash,{uid:params.get("uid"),generic:params.get("variant")==="generic",reveal:restore.listTop==null,scroll:restore.detailTop || 0});
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
  const view=await showEncounter({root,table,catalog,fullCatalog,picture,visible:visibleRows,close:()=>toggleEncounter(false),scaled,warmScale});
  if(ticket===listTicket)encounterView=view;
}

function markReady() {
  initialized=true;
  mode.disabled=edition.disabled=search.disabled=false;
  document.body.dataset.ready="true";
  if(hasReviews() && !reviewsLoading){
    reviewsLoading=Promise.resolve().then(()=>import("./reviews.js")).then(module=>{
      reviews=module;reviews.show(reviewTarget,hasReviews());
    }).catch(()=>{});
  }
  if(paintedPage && paintedPage!==kind)enter(readingPages.has(kind)?byId("reading"):document.querySelector("main"),{y:14,ms:380});
  if(readingPages.has(kind) && !["classes","book","adventure","quickreference"].includes(kind))describeTrail(kind,pageName());
  paintedPage=kind;
}

async function changeView({replace=false} = {}) {
  if (!initialized) return;
  if(reviews?.canLeave()===false){restoreControls();return;}
  if(readingPages.has(kind)){
    const url=new URL(location.href);url.searchParams.set("mode",mode.value);url.searchParams.set("ed",edition.value);
    writeManualParams(url);
    history.pushState(sameTrail(), "",url);await restoreRoute();return;
  }
  pendingFamily=null;
  savePosition();
  const original = currentCard, ticket=++listTicket;
  try {
    if (!await refresh(ticket)) return;
    const keepSelected=selectionPinned && original;
    const row=keepSelected?index.rows[ids.get(original.id)]:firstRow();
    const hash=keepSelected?original.hash:row?.h || "", uid=row && duplicates.has(hash)?row.id:null;
    const generic=keepSelected ? original.generic : firstGroup()?.generic;
    history[replace ? "replaceState" : "pushState"]({...sameTrail(),detailTop:0,selectionPinned,theme:document.documentElement.dataset.oursTheme},"",stateUrl(hash,uid,generic));
    list.scrollTop=0;renderRows(true);
    if(encounterOpen()){
      if(!encounterView)await mountEncounter(ticket);
      if(ticket===listTicket)markReady();
      return;
    }
    await openCard(keepSelected?hash:"",{uid:keepSelected?original.id:null,generic,reveal:true,keepPresentation:true});
  } catch(e) { if (ticket===listTicket) showError(e); }
}

function navigate(hash,uid=null,generic=false) {
  if(encounterOpen()){encounterView?.adjust(hash,1);return;}
  if((hash!==currentCard?.hash || (uid && uid!==currentCard?.id) || currentTab!=="stats") && reviews?.canLeave()===false)return;
  savePosition();
  selectionPinned=true;
  currentTab="stats";scaleSettings={};
  const url=stateUrl(hash,uid,generic);for(const k of ["tab","cr","spell","classLevel","prof"])url.searchParams.delete(k);
  history.pushState({selectionPinned,theme:document.documentElement.dataset.oursTheme},"",url);
  openCard(hash,{uid,generic,reveal:true});
}

export async function followPage(next, url) {
  if(reviews?.canLeave()===false)return;
  savePosition();
  remembered.set(kind,{url:location.href,state:history.state});
  const takeSourceSettings=!url || !["sources","excludeSources","sourceScope"].some(key=>url.searchParams.has(key));
  let state={};
  if(!url && remembered.has(next)){
    const saved=remembered.get(next);url=new URL(saved.url);state={...saved.state};delete state.preferences;
    url.searchParams.set("mode",mode.value);url.searchParams.set("ed",edition.value);
  }
  url ||= new URL(next+".html",location.href);
  delete state.oursTrailFollow;
  if(takeSourceSettings && (!url.searchParams.has("mode") || url.searchParams.get("mode")===mode.value))writeManualParams(url);
  if(prototypeRequested() && !url.searchParams.has("proto"))url.searchParams.set("proto","1");
  history.pushState({...state,theme:document.documentElement.dataset.oursTheme},"",url);
  await restoreRoute();
}
function activate() {
  byId("detail").parentElement.addEventListener("scroll",savePosition,{passive:true});
  let scopeTicket=0;
  mode.onchange=async()=>{
    const before=appliedMode, after=mode.value, ticket=++scopeTicket;
    appliedMode=after;localStorage.setItem("ours.srcMode2",after);
    try{
      if(after==="manual")await prepareManual(before);
      if(ticket!==scopeTicket || mode.value!==after)return;
      showManual();await changeView();
    }catch(e){showError(e);}
  };
  edition.onchange=()=>{localStorage.setItem("ours.edMode2",edition.value); changeView();};
  let editingQuery=false;
  search.oninput=()=>{
    if(prototypeData){selectionPinned=false;mentionedOpen=false;}
    if(!editingQuery){
      // 在发起异步筛选前创建输入会话的历史，后续字符不会抢走这一次 push。
      savePosition();
      history.pushState({...sameTrail(),theme:document.documentElement.dataset.oursTheme},"",stateUrl(currentCard?.hash,null));
      editingQuery=true;
    }
    changeView({replace:true});
  };
  search.onkeydown=e=>{if(e.key==="Enter")editingQuery=false;};
  window.addEventListener("popstate",()=>{editingQuery=false;});
  search.onblur=()=>{editingQuery=false;};
  function saveManual() {
    seededManual=false;
    localStorage.setItem(sourceIncludeKey,JSON.stringify([...manualSources].map(sourceCode)));
    localStorage.setItem(sourceExcludeKey,JSON.stringify([...excludedSources].map(sourceCode)));
    if(manualPreset)localStorage.setItem(sourcePresetKey,manualPreset);else localStorage.removeItem(sourcePresetKey);
    showManual();changeView();
  }
  paintManualPanel=manualPanel(manual,({codes,checked,exclude})=>{
    const next=new Set(manualSources), skipped=new Set(excludedSources);
    if(exclude){
      if(skipped.has(exclude))skipped.delete(exclude);
      else{skipped.add(exclude);next.delete(exclude);}
    }else for(const code of codes){
      if(checked){next.add(code);skipped.delete(code);}else next.delete(code);
    }
    // A legacy empty selection means unrestricted. Excluding one book from it
    // keeps that meaning until the reader chooses an explicit checklist.
    if(manualPreset || manualSources.size || !exclude){
      manualPreset=customManualScope();
      if(manualPreset==="custom-short" && checked && codes.some(code=>{
        const book=sourceBookIndex.get(code);
        return book && !book.official && !book.good;
      }))manualPreset="custom-full";
    }
    manualSources=next;excludedSources=skipped;
    saveManual();
  },preset=>{
    if(preset==="none"){
      manualPreset=customManualScope();
      manualSources=new Set();excludedSources=new Set();
    }else startManual(preset);
    saveManual();
  });
  list.addEventListener("scroll",()=>{renderRows();savePosition();},{passive:true});
  detail.addEventListener("scroll",savePosition,{passive:true});
  window.addEventListener("pagehide",savePosition);
  history.scrollRestoration="manual";
  window.addEventListener("popstate",()=>{if(reviews?.allowPopstate()!==false)restoreRoute();});
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
    navigate(url.hash.slice(1).split(",")[0].toLowerCase(),a.dataset.id || url.searchParams.get("uid"),url.searchParams.get("variant")==="generic");
  });
  list.addEventListener("keydown",e=>{
    if(!listLayout || !visible.length || index!==visibleCatalog)return;
    if(kind==="races" && visible.length){
      const i=ids.get(selected || e.target.closest("[data-id]")?.dataset.id);
      if(["ArrowRight","ArrowLeft"].includes(e.key) && i!=null){e.preventDefault();changeFamily(index.rows[i].family,e.key==="ArrowRight");return;}
      if(["ArrowDown","ArrowUp","j","k"].includes(e.key)){
        e.preventDefault();const order=listLayout.entries, step=["ArrowDown","j"].includes(e.key)?1:-1;
        const next=order[order.indexOf(i)+step];if(next!=null){ensureVisible(next);navigate(index.rows[next].h,index.rows[next].id);}return;
      }
    }
    if (!["Home","End","ArrowDown","ArrowUp"].includes(e.key) || !visible.length) return;
    e.preventDefault();
    const current=ids.get(e.target.closest("a")?.dataset.id);
    const order=listLayout.entries, pos=order.indexOf(prototypeView?.aliases.get(current) ?? current);
    const step=["End","ArrowUp"].includes(e.key)?-1:1;
    let next=e.key==="End"?order.length-1:e.key==="Home" || pos<0?0:pos+step;
    while(next>=0 && next<order.length && !Number.isInteger(order[next]))next+=step;
    if(!Number.isInteger(order[next]))return;
    const i=order[next];ensureVisible(i);rows.querySelector('[data-position="'+positions.get(i)+'"]')?.focus({preventScroll:true});
  });
  const resize=new ResizeObserver(()=>{
    if(kind==="races")byId("family-sort").style.setProperty("--race-scrollbar",list.offsetWidth-list.clientWidth+"px");
    renderRows();
  });
  resize.observe(list);
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
  let compressedIndex=document.querySelector('meta[name="catalog-index"]')?.content==="gzip";
  for (;;) {
    const response=await fetch(compressedIndex?"data/index.json.gz":"data/index.json");
    if (response.ok) { manifest=await (compressedIndex?gzipJson(response):response.json()); break; }
    if (compressedIndex && response.status===404) { compressedIndex=false; continue; }
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
  readSourceBooks().catch(()=>{});
  document.dispatchEvent(new CustomEvent("catalog-manifest",{detail:rootManifest}));
  // 书签失败时仍用完整目录解析；省略书签的首次打开直接取目录。
  if (!readingPages.has(kind) && !encounterOpen() && routeHash()) await readBookmarkFirst().catch(()=>{});
  await restoreRoute();
}
export {start};

