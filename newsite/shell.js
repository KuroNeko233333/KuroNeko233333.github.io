import {ownedPage as owned} from "./option-view.js";
import {start,currentKind,followPage,entryVisible,deckLink,searchScopeSettings,prototypeRequested,prototypeSearchDocs} from "./items.js";
import {rarityName} from "./item-filters.js";
import {evaluateRoll} from "./item-interactions.js";
import {createSearchClient} from "./search-worker.js";
import {scopeNotes,editionNotes} from "./manual-sources.js";
import {activeBounds,slideSelection,setMotion,changeTheme} from "./motion.js";
import {setupTrail,sameTrail} from "./trail.js";

const $=id=>document.getElementById(id);
const pages=[["index","大厅"],["races","种族"],["classes","职业"],["spells","法术"],["feats","专长"],["backgrounds","背景"],["optionalfeatures","职业选项"],["items","物品"],["bestiary","怪物"],["books","书库"]];

function bootRoute(){
  const u=new URL(location.href);
  if(u.hash.match(/^#\/?(?:newsite\/)?[^#?]+\.html/) || !owned(u.pathname.split("/").at(-1).replace(".html",""))){
    const match=/^#\/?(?:newsite\/)?([^#?]+\.html)(.*)$/.exec(u.hash);
    if(match && !owned(match[1].replace(".html",""))){
      location.replace(new URL("../"+match[1]+match[2],u));return false;
    }
    const next=new URL(match?.[1] || "index.html",u);
    next.search=u.search;next.hash=match ? match[2] : u.hash;
    history.replaceState(history.state,"",next);
  }
  return true;
}
for(const [page,label] of pages){
  const a=document.createElement("a");a.className="tab";a.textContent=label;a.dataset.page=page;
  a.href=owned(page) ? page+".html" : "../#"+page+".html";$("tabs").append(a);
}
function buttons(container,id,attr,cls){
  const select=$(id);
  const notes=id==="mode"?scopeNotes:editionNotes;
  for(const option of select.options){
    const b=document.createElement("button");b.type="button";b.className=cls;b.dataset[attr]=option.value;
    b.title=option.title=notes[option.value];
    b.textContent=option.text;b.onclick=()=>{
      if(select.disabled)return;
      if(id==="mode" && option.value==="manual" && select.value==="manual"){
        openManual();return;
      }
      if(select.value===option.value)return;
      select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));
      if(id==="mode" && option.value==="manual")openManual();
    };$(container).append(b);
  }
}
function openManual(){
  $("manual").hidden=false;$("manual").open=true;
  if(!$("settings-panel").matches(":popover-open"))$("settings-panel").showPopover();
}
buttons("switch","mode","mode","seg");buttons("edsw","edition","ed","eds");
function paintControls(){
  const page=currentKind(), tabs=$("tabs");let extra=tabs.querySelector(".extra-tab");
  const switched=paintedTab!==page, before=switched&&paintedTab ? activeBounds(tabs,".tab.on") : null;
  if(page && !pages.some(([k])=>k===page)){
    if(!extra){extra=document.createElement("a");extra.className="tab extra-tab";tabs.append(extra);}
    extra.dataset.page=page;extra.href=location.href;extra.textContent=document.title.split(" · ")[0];
  }else extra?.remove();
  for(const a of tabs.querySelectorAll(".tab")){
    const active=a.dataset.page===currentKind();a.classList.toggle("on",active);
    if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
  }
  if(switched){paintedTab=page;slideSelection(tabs,before,tabs.querySelector(".tab.on"));}
  for(const [container,select,attr] of [["switch","mode","mode"],["edsw","edition","ed"]]){
    const group=$(container),value=$(select).value;
    const old=group.querySelector(".on");
    const from=old?.dataset[attr]!==value ? activeBounds(group,".on") : null;
    for(const b of group.querySelectorAll("button")){
      const on=b.dataset[attr]===$(select).value;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));
    }
    slideSelection(group,from,group.querySelector(".on"));
  }
  document.cookie="ours_src="+$("mode").value+"; path=/; max-age=31536000; SameSite=Lax";
  $("scope-note").textContent=$("range-note").textContent=scopeNotes[$("mode").value];
  $("range-mode").textContent=$("switch").querySelector(".on")?.textContent || "";
  $("range-ed").textContent=$("edsw").querySelector(".on")?.textContent || "";
  $("mode").title=scopeNotes[$("mode").value];$("edition").title=editionNotes[$("edition").value];
}
let paintedTab;
document.addEventListener("catalog-controls",paintControls);
function setTheme(theme){
  document.documentElement.dataset.oursTheme=theme;
  localStorage.setItem("ours.theme",theme);
  $("theme").innerHTML='<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    (theme==="day" ? '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>'
      : '<path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z"/>')+"</svg>";
  $("theme").title=theme==="day" ? "现在是日间，点一下换成夜间" : "现在是夜间，点一下换成日间";
  $("theme").dataset.theme=theme;
}
setTheme(document.documentElement.dataset.oursTheme || "day");
// 简洁版：存在本机；在大厅切换时重新打开大厅（其他页面暂时不受影响）。
{
  const box=$("plain");
  if(box){
    box.checked=document.documentElement.dataset.oursPlain==="1";
    box.onchange=()=>{
      try{localStorage.setItem("ours.plain",box.checked?"1":"0");}catch(e){}
      if(box.checked)document.documentElement.dataset.oursPlain="1";else delete document.documentElement.dataset.oursPlain;
      if(currentKind()==="index")location.reload();
    };
  }
}
{
  const box=$("motion");
  try{box.checked=localStorage.getItem("ours.motion")!=="0";}catch{}
  setMotion(box.checked);
  box.onchange=()=>{
    try{localStorage.setItem("ours.motion",box.checked?"1":"0");}catch{}
    setMotion(box.checked);
  };
}
$("theme").onclick=()=>{
  const old=document.documentElement.dataset.oursTheme;history.replaceState({...history.state,theme:old},"");
  const theme=old==="night"?"day":"night";
  history.pushState({...history.state,...sameTrail(),theme},"",location.href);changeTheme(()=>setTheme(theme));
};
$("settings").onclick=()=>$("settings-panel").togglePopover();
$("reset-list").onclick=()=>{$("search").value="";$("reset").click();};
$("hide-list").onclick=()=>{document.body.classList.add("hide-list");$("show-list").hidden=false;};
$("show-list").onclick=()=>{document.body.classList.remove("hide-list");$("show-list").hidden=true;};

function toggleDice(show){
  $("dice-box").hidden=!show;$("dice-open").hidden=show;
  $("dice-open").setAttribute("aria-expanded",String(show));
  if(show)$("dice-input").focus();else $("dice-open").focus();
}
function addDiceLine(text){
  const p=document.createElement("p");p.textContent=text;$("dice-log").append(p);
  $("dice-log").scrollTop=$("dice-log").scrollHeight;
}
$("dice-open").onclick=()=>toggleDice(true);
$("dice-close").onclick=()=>toggleDice(false);
document.addEventListener("catalog-roll",e=>addDiceLine(e.detail));
$("dice-form").onsubmit=e=>{
  e.preventDefault();const input=$("dice-input"),expr=input.value.trim();if(!expr)return;
  input.value="";
  if(expr==="/clear"){$("dice-log").replaceChildren();return;}
  if(expr==="/help"){addDiceLine("输入骰式后按回车，例如 1d20+5。/clear 清空记录。");return;}
  try{const {total,details}=evaluateRoll(expr);addDiceLine(expr+" = "+total+(details.length?"　"+details.join("，"):""));}
  catch(e){addDiceLine(expr+" · "+e.message);}
};

let manifest,request,searchMeta,ticket=0,offset=0,selected=-1,relaxed=false,deferredMatches;
let buttonsInResults=[];
const pageSize=30;
const dialog=$("global-search"),query=$("global-query"),results=$("global-results"),status=$("global-status");
const preferredPages=new Set(["bestiary","spells","items","feats","backgrounds","races","classes",
  "optionalfeatures","conditionsdiseases","variantrules","actions"]);
const fallbackMeta={categories:{1:["怪物","monster","bestiary.html"],2:["法术","spell","spells.html"],4:["物品","item","items.html"]},sources:{}};

function objectUrl(digest){
  return new URL("data/objects/"+digest+".json"+(manifest.objectEncoding==="gzip"?".gz":""),location.href).href;
}
function readySearch(){
  if(!request)request=createSearchClient({workerUrl:new URL("./search-worker.js",import.meta.url),indexUrl:objectUrl(manifest.search)});
  if(!searchMeta)searchMeta=(async()=>{
    const digest=manifest.monsters?.searchMeta || manifest.searchMeta;
    if(!digest)return fallbackMeta;
    const response=await fetch(objectUrl(digest));
    if(!response.ok)throw new Error("查找来源资料失败");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const meta=bytes[0]===31 && bytes[1]===139
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
      : JSON.parse(new TextDecoder().decode(bytes));
    const labels={},props={},groups=new Map(),preferred={};
    for(const [id,[label,prop,page]] of Object.entries(meta.categories)){
      const kind=page?.replace(/\.html$/,"");
      labels[id]=label;props[id]=prop;
      if(preferredPages.has(kind))(preferred[kind] ||= []).push(+id);
      for(const key of new Set([label,prop,kind].filter(Boolean))){
        const k=key.toLowerCase();if(!groups.has(k))groups.set(k,[]);
        if(!groups.get(k).includes(+id))groups.get(k).push(+id);
      }
    }
    return {...meta,labels,props,preferred,groups:[...groups].sort((a,b)=>b[0].length-a[0].length)};
  })().catch(e=>{searchMeta=null;throw e;});
  return searchMeta;
}
document.addEventListener("catalog-manifest",e=>{
  manifest=e.detail;
  if(!manifest.search)return;
  readySearch().catch(()=>{});
  request("warm").catch(()=>{});
  if(dialog.open && query.value.trim())search();
});

function setSelected(index,scroll=false){
  buttonsInResults[selected]?.setAttribute("aria-selected","false");
  selected=index;
  const row=buttonsInResults[selected];
  query.setAttribute("aria-expanded",String(!!row));
  if(!row){query.removeAttribute("aria-activedescendant");return;}
  row.setAttribute("aria-selected","true");
  query.setAttribute("aria-activedescendant",row.id);
  if(scroll)row.scrollIntoView({block:"nearest"});
}
function resultText(doc){
  const feature=doc.c===30 || doc.c===41;
  const name=doc._zh || doc.cn || doc.n;
  const english=doc._originalName || doc._en || doc.n;
  const [first,second]=doc._traits || [];
  let detail="";
  if(doc.c===1)detail=first ? first+(second && second!=="Unknown" ? " · CR "+second : " · CR 未知") : "类型与 CR 暂无";
  if(doc.c===2)detail=first!=null ? (first===0 ? "戏法" : first+"环")+(second ? " · "+second : "") : "环阶与学派暂无";
  if(doc.c===4)detail="稀有度："+rarityName(first || "unknown");
  if(feature){
    const prefix=(doc.cn || doc.n || "").split("; ")[0];
    detail=prefix.replace(/\s+(\d+)$/," · $1级");
  }
  return {name,english:english!==name && /\p{Script=Latin}/u.test(english || "") ? english : "",detail};
}
function span(className,text){
  const el=document.createElement("span");el.className=className;el.textContent=text;return el;
}
async function resultRow(doc,meta,index){
  const [label,,page,hover]=meta.categories[doc.c] || [];
  const cardUrl=page==="card" ? await deckLink(doc.u) : null;
  const faux=page && !page.endsWith(".html") && !cardUrl;
  const a=document.createElement(faux ? "button":"a");a.className="result";
  if(cardUrl)a.href=cardUrl.href;
  else if(!faux){
    const path=doc.c===45 ? doc.u : page;
    if(!path || /^\w+:|^\/\//.test(path))return null;
    const local=owned(path.split(/[?#]/)[0].split("/").at(-1).replace(".html",""));const u=new URL((local ? "" : "../")+path,location.href);
    if(doc.c!==45)u.hash=doc.uh || doc.u;
    if(local && prototypeRequested())u.searchParams.set("proto","1");
    if((!local || path==="classes.html") && ["classes.html","races.html","feats.html","backgrounds.html","optionalfeatures.html","spells.html"].includes(path))
      u.searchParams.set("ours-search",(u.hash.slice(1).split(",")[0]));
    if(path==="classes.html" || (!local && (doc._oursOutside || doc._target))){
      const sources=[doc.s,doc._target];
      if(path==="classes.html")sources.push(u.hash.slice(1).split(",")[0].split("_").at(-1));
      if(doc.c===41)sources.push(doc.u.split("_")[4]);
      for(const src of new Set(sources.filter(Boolean).map(v=>v.toLowerCase())))u.searchParams.append("ours-source",src);
    }
    if([30,41].includes(doc.c)){
      u.searchParams.set("ours-feature",doc.u);u.searchParams.set("ours-feature-kind",doc.c===30?"classfeature":"subclassfeature");
    }
    a.href=u.href;
  }
  a.id="global-result-"+index;a.setAttribute("role","option");a.setAttribute("aria-selected","false");
  a.dataset.hoverPage=hover || page || "";a.dataset.hoverHash=doc.u || "";a.dataset.hoverSource=doc.s || "";
  const {name,english,detail}=resultText(doc);
  const content=span("result-content",""),heading=span("result-heading","");
  heading.append(span("result-kind",label || ""),span("result-name",name));
  if(english)heading.append(span("result-english",english));
  content.append(heading);if(detail)content.append(span("result-detail",detail));
  const tail=span("result-tail","");
  if(doc._oursOutside)tail.append(span("outside","当前范围外"));
  const acronym=meta.sources[doc.s?.toLowerCase()]?.abv || doc.sA || doc.s;
  tail.append(span("result-source",[acronym,doc.p && "p. "+doc.p].filter(Boolean).join(" · ")));
  const enter=span("result-enter","↵");enter.setAttribute("aria-hidden","true");
  a.append(content,tail,enter);
  a.addEventListener("pointermove",()=>setSelected(buttonsInResults.indexOf(a)));
  a.addEventListener("focus",()=>setSelected(buttonsInResults.indexOf(a)));
  return a;
}
function noResults(text){
  status.textContent="没找到「"+text+"」";
  const tips=document.createElement("div");tips.className="search-tips";
  tips.append(span("", "试试英文名或换个说法。"));
  if(!relaxed){
    const button=document.createElement("button");button.type="button";
    button.textContent="在全部资料范围、两个版本里再搜一次";
    button.onclick=()=>{relaxed=true;offset=0;query.focus();search();};tips.append(button);
  }else tips.append(span("", "已在全部资料范围、两个版本里搜索。"));
  results.replaceChildren(tips);
}
function paging(total){
  if(total<=pageSize)return;
  const pageButton=(label,pos,enabled)=>{
    const b=document.createElement("button");b.type="button";b.textContent=label;b.disabled=!enabled;
    b.onclick=()=>{offset=pos;query.focus();search();};return b;
  };
  status.append("　",pageButton("上一页",Math.max(0,offset-pageSize),offset>0),
    "　"+(Math.floor(offset/pageSize)+1)+" / "+Math.ceil(total/pageSize)+"　",
    pageButton("下一页",offset+pageSize,offset+pageSize<total));
}
async function scopedMatches(matches,meta){
  const inside=[],outside=[];
  const observed=await Promise.all(matches.items.map(async item=>{
    const {doc}=item;
    const page=meta.categories[doc.c]?.[2];
    const featureSource=doc.c===30 || doc.c===41 ? doc.s : undefined;
    let inRange=await entryVisible(page,doc.uh || doc.u,null,{scopeOnly:true,featureSource});
    // With no explicit bookshelf selection, the legacy manual book list is “all”.
    if(inRange==null && doc._scope!=null && (page==="book.html" || page==="adventure.html"))
      inRange=!!(doc._scope & 0b111000000);
    return {...item,doc:{...doc,_oursOutside:inRange==null ? doc._oursOutside : !inRange}};
  }));
  for(const item of observed)(item.doc._oursOutside ? outside : inside).push(item);
  return {items:inside.concat(outside),total:observed.length,outside:outside.length};
}
async function search(){
  const n=++ticket,text=query.value.trim();
  buttonsInResults=[];setSelected(-1);results.replaceChildren();results.scrollTop=0;
  results.removeAttribute("role");
  if(!text){status.textContent="";return;}
  status.textContent="搜索中…";
  try {
    if(!manifest?.search)return;
    const meta=await readySearch();
    if(n!==ticket)return;
    const mode=$("mode").value,edition=$("edition").value;
    const deferred=mode==="manual" || !manifest.searchScope;
    const catalog={edition,preferred:meta.preferred?.[currentKind()],deferred,relaxed,...searchScopeSettings()};
    const options={labels:meta.labels || {},props:meta.props || {},categories:meta.groups || [],
      sources:meta.sources || {},mode,classic:edition==="14",catalog,
      brew:true,ua:true,legacy:true,partnered:"all",window:deferred ? {size:Infinity} : {size:pageSize,offset}};
    const lookup=prototypeRequested() ? text.replaceAll("火舌","焰舌") : text;
    if(prototypeRequested()){
      options.additional=await prototypeSearchDocs(lookup);
      if(n!==ticket)return;
    }
    let matches;
    if(deferred){
      const key=JSON.stringify([lookup,mode,catalog]);
      if(deferredMatches?.key!==key)
        deferredMatches={key,pending:request("search",lookup,options).then(found=>scopedMatches(found,meta))};
      matches=await deferredMatches.pending;
      matches={...matches,items:matches.items.slice(offset,offset+pageSize)};
    }else matches=await request("search",lookup,options);
    if(n!==ticket)return;
    if(!matches.total){noResults(text);return;}
    const rows=await Promise.all(matches.items.map(({doc},i)=>resultRow(doc,meta,i)));
    if(n!==ticket)return;
    status.textContent=(matches.outside===matches.total ? "当前范围内没有，下面是范围外的结果。 " : "")+matches.total+" 条结果";
    paging(matches.total);
    let marked=false;
    const content=document.createDocumentFragment();
    for(const [i,row] of rows.entries()){
      if(!row)continue;
      if(matches.items[i].doc._oursOutside && !marked){
        const separator=document.createElement("div");separator.className="search-outside";separator.setAttribute("role","presentation");
        separator.textContent="以下 "+matches.outside+" 条不在当前资料范围或版本内";
        content.append(separator);marked=true;
      }
      buttonsInResults.push(row);content.append(row);
    }
    results.setAttribute("role","listbox");results.replaceChildren(content);
    setSelected(0);
  } catch(e){
    if(n===ticket){deferredMatches=null;status.textContent="搜索资料读取失败："+e.message;}
  }
}
function openSearch(){if(!dialog.open)dialog.showModal();relaxed=false;offset=0;query.focus();query.select();if(query.value.trim())search();}
$("sbsearch").onclick=openSearch;
query.oninput=()=>{offset=0;relaxed=false;search();};
dialog.addEventListener("close",()=>{ticket++;setSelected(-1);});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="k"){e.preventDefault();openSearch();}
  if(!dialog.open || e.isComposing || e.keyCode===229 || (e.target!==query && !results.contains(e.target)))return;
  if(e.key==="ArrowDown" || e.key==="ArrowUp"){
    if(!buttonsInResults.length)return;
    e.preventDefault();const delta=e.key==="ArrowDown" ? 1 : -1;
    setSelected(Math.max(0,Math.min(buttonsInResults.length-1,selected+delta)),true);
  }
  if(e.key==="Enter" && (e.target===query || e.target.classList.contains("result"))){
    e.preventDefault();buttonsInResults[selected]?.click();
  }
});
// Any modal window closes when both the press and the release land outside its box,
// so a text selection that ends outside the window does not close it.
let pressOutside=null;
const outsideOf=(d,e)=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
document.addEventListener("pointerdown",e=>{const d=e.target;pressOutside=d instanceof HTMLDialogElement && d.open && d.matches(":modal") && !d.hasAttribute("data-keep-open") && outsideOf(d,e)?d:null;},true);
document.addEventListener("click",e=>{const d=pressOutside;pressOutside=null;if(d && e.target===d && d.open && outsideOf(d,e))d.close();},true);
window.addEventListener("popstate",()=>{
  const theme=history.state?.theme || localStorage.getItem("ours.theme") || "day";
  if(theme!==document.documentElement.dataset.oursTheme)changeTheme(()=>setTheme(theme));
});
document.addEventListener("click",e=>{
  if(e.defaultPrevented || e.button!==0 || e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  const a=e.target.closest("a[href]");if(!a)return;
  const u=new URL(a.href);
  if(u.origin!==location.origin)return;
  const name=u.pathname.split("/").at(-1).replace(".html","");
  if(!owned(name) || !(u.pathname.startsWith(new URL(".",location.href).pathname)))return;
  const tab=a.classList.contains("tab");
  if(!tab && name===currentKind() && !dialog.contains(a))return;
  e.preventDefault();
  if(dialog.open)dialog.close();
  if(tab && name===currentKind())return;
  followPage(name,tab ? null : u).catch(e=>{$("count").textContent=e.message;});
},true);
if(bootRoute()){setupTrail();start().catch(e=>{$("count").textContent="资料读取失败："+e.message;});}
