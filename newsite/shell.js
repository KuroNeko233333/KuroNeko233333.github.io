import {ownedPage as owned} from "./option-view.js";
import {start,currentKind,followPage,entryVisible,deckLink} from "./items.js";
import {evaluateRoll} from "./item-interactions.js";
import {createSearchClient} from "./search-worker.js";

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
  for(const option of select.options){
    const b=document.createElement("button");b.type="button";b.className=cls;b.dataset[attr]=option.value;
    b.textContent=option.text;b.onclick=()=>{
      if(select.disabled)return;
      if(id==="mode" && option.value==="manual" && select.value==="manual"){
        $("settings-panel").showPopover();$("manual").open=true;return;
      }
      if(select.value===option.value)return;
      select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));
      if(id==="mode" && option.value==="manual"){$("settings-panel").showPopover();$("manual").open=true;}
    };$(container).append(b);
  }
}
buttons("switch","mode","mode","seg");buttons("edsw","edition","ed","eds");
function paintControls(){
  const page=currentKind(), tabs=$("tabs");let extra=tabs.querySelector(".extra-tab");
  if(page && !pages.some(([k])=>k===page)){
    if(!extra){extra=document.createElement("a");extra.className="tab extra-tab";tabs.append(extra);}
    extra.dataset.page=page;extra.href=location.href;extra.textContent=document.title.split(" · ")[0];
  }else extra?.remove();
  for(const a of $("tabs").children){
    const active=a.dataset.page===currentKind();a.classList.toggle("on",active);
    if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
  }
  for(const [container,select,attr] of [["switch","mode","mode"],["edsw","edition","ed"]])
    for(const b of $(container).children){
      const on=b.dataset[attr]===$(select).value;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));
    }
  document.cookie="ours_src="+$("mode").value+"; path=/; max-age=31536000; SameSite=Lax";
}
document.addEventListener("catalog-controls",paintControls);
function setTheme(theme){
  document.documentElement.dataset.oursTheme=theme;
  localStorage.setItem("ours.theme",theme);
  $("theme").textContent=theme==="day" ? "☀ 日间" : "☾ 夜间";
}
setTheme(document.documentElement.dataset.oursTheme || "day");
$("theme").onclick=()=>{
  const old=document.documentElement.dataset.oursTheme;history.replaceState({...history.state,theme:old},"");
  const theme=old==="night"?"day":"night";
  history.pushState({...history.state,theme},"",location.href);setTheme(theme);
};
$("settings").onclick=()=>$("settings-panel").togglePopover();
$("filter-button").onclick=$("filter-menu").onclick=()=>$("more").click();
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

let manifest,request,searchMeta,timer,ticket=0,offset=0;
const pageSize=30;
const dialog=$("global-search"),query=$("global-query"),results=$("global-results");
document.addEventListener("catalog-manifest",e=>{manifest=e.detail;});
function objectUrl(digest){
  return new URL("data/objects/"+digest+".json"+(manifest.objectEncoding==="gzip"?".gz":""),location.href).href;
}
async function metadata(){
  if(!searchMeta){
    searchMeta=(async()=>{
      const digest=manifest?.monsters?.searchMeta || manifest?.searchMeta;
      if(!digest) return fallbackMeta;
      const r=await fetch(objectUrl(digest));if(!r.ok)throw new Error("查找来源资料失败");
      const bytes=new Uint8Array(await r.arrayBuffer());
      return bytes[0]===31 && bytes[1]===139
        ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
        : JSON.parse(new TextDecoder().decode(bytes));
    })().catch(e=>{searchMeta=null;throw e;});
  }
  return searchMeta;
}
async function search(){
  const n=++ticket,text=query.value.trim();results.replaceChildren();
  if(!text){$("global-status").textContent="";return;}
  $("global-status").textContent="搜索中…";
  try {
    const meta=await metadata();
    if(!manifest)throw new Error("目录正在读取");
    request ||= createSearchClient({workerUrl:new URL("./search-worker.js",import.meta.url),indexUrl:objectUrl(manifest.search)});
    const labels={},props={},groups=new Map();
    for(const [id,[label,prop,page]] of Object.entries(meta.categories)){
      labels[id]=label;props[id]=prop;
      for(const key of [label,prop,page?.replace(/\.html$/,"")].filter(Boolean)){
        const k=key.toLowerCase();groups.set(k,[...new Set([...groups.get(k)||[],+id])]);
      }
    }
    const options={labels,props,categories:[...groups].sort((a,b)=>b[0].length-a[0].length),
      sources:meta.sources || {},mode:$("mode").value,classic:$("edition").value==="14",
      brew:true,ua:true,legacy:true,partnered:"all",window:{size:pageSize,offset}};
    const matches=await request("search",text,options);
    if(n!==ticket)return;
    const status=$("global-status");
    status.textContent=matches.total+" 条结果";
    if(matches.total>pageSize){
      const pageButton=(label,pos,enabled)=>{
        const b=document.createElement("button");b.type="button";b.textContent=label;b.disabled=!enabled;
        b.onclick=()=>{offset=pos;search();};return b;
      };
      status.append("　",pageButton("上一页",Math.max(0,offset-pageSize),offset>0),
        "　"+(Math.floor(offset/pageSize)+1)+" / "+Math.ceil(matches.total/pageSize)+"　",
        pageButton("下一页",offset+pageSize,offset+pageSize<matches.total));
    }
    const marked=await Promise.all(matches.items.map(async({doc})=>{
      const page=meta.categories[doc.c]?.[2];
      const inRange=await entryVisible(page,doc.uh || doc.u);
      return {...doc,_oursOutside:inRange==null ? doc._oursOutside : !inRange};
    }));
    if(n!==ticket)return;
    for(const doc of marked){
      const [label,,page,hover]=meta.categories[doc.c] || [];
      const cardUrl=page==="card" ? await deckLink(doc.u) : null;
      if(n!==ticket)return;
      const faux=page && !page.endsWith(".html") && !cardUrl;
      const a=document.createElement(faux ? "button":"a");a.className="result";
      if(cardUrl)a.href=cardUrl.href;
      else if(!faux){
        const path=doc.c===45 ? doc.u : page;
        if(!path || /^\w+:|^\/\//.test(path))continue;
        const local=owned(path.split(/[?#]/)[0].split("/").at(-1).replace(".html",""));const u=new URL((local ? "" : "../")+path,location.href);
        if(doc.c!==45)u.hash=doc.uh || doc.u;
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
      a.dataset.hoverPage=hover || page || "";a.dataset.hoverHash=doc.u || "";a.dataset.hoverSource=doc.s || "";
      a.textContent=(label || "")+"　"+(doc.cn || doc.n);
      if(doc._oursOutside){const note=document.createElement("span");note.className="outside";note.textContent="当前范围外";a.append(note);}
      const source=document.createElement("small");source.textContent=[doc.sA || doc.s,doc.p && "p. "+doc.p].filter(Boolean).join(" · ");a.append(source);
      results.append(a);
    }
  } catch(e){if(n===ticket)$("global-status").textContent="搜索资料读取失败："+e.message;}
}
function openSearch(){if(!dialog.open)dialog.showModal();query.focus();query.select();if(query.value.trim())search();}
$("sbsearch").onclick=openSearch;
query.oninput=()=>{offset=0;clearTimeout(timer);ticket++;timer=setTimeout(search,100);};
dialog.addEventListener("close",()=>{ticket++;});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="k"){e.preventDefault();openSearch();}
  if(e.key==="ArrowDown" && e.target===query){e.preventDefault();results.firstElementChild?.focus();}
});
window.addEventListener("popstate",()=>setTheme(history.state?.theme || localStorage.getItem("ours.theme") || "day"));
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
const fallbackMeta={categories:{1:["怪物","monster","bestiary.html"],2:["法术","spell","spells.html"],4:["物品","item","items.html"]},sources:{}};
if(bootRoute())start().catch(e=>{$("count").textContent="资料读取失败："+e.message;});
