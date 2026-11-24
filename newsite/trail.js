import {enter} from "./motion.js";
import {optionPages} from "./option-view.js";

const navigationApi=window.navigation;
const listPages=new Set(["items","bestiary","races","feats","backgrounds","spells","optionalfeatures","classes",
  "conditionsdiseases","variantrules","actions","tables","languages","deities","objects","trapshazards",
  "vehicles","rewards","cultsboons","bastions","psionics","recipes","homecrafts","decks","charcreationoptions","names"]);
const bookPages=new Set(["book","adventure","quickreference"]);
const labels={...optionPages,search:"全站搜索",terms:"规则目录",index:"大厅",items:"物品",bestiary:"怪物",classes:"职业",races:"种族",spells:"法术",feats:"专长",
  backgrounds:"背景",optionalfeatures:"职业选项",books:"书库",book:"读书",library:"全部书目",adventure:"模组阅读",
  adventures:"冒险模组",quickreference:"快速参考",dmscreen:"DM 帷幕",crcalculator:"CR 计算器",statgen:"属性值生成器",
  conditionsdiseases:"状态与疾病",variantrules:"规则术语",actions:"动作",tables:"表格",languages:"语言"};
const parentPath=location.pathname.replace(/[^/]*$/,"");
const storageKey="ours.newsite.trail";
let data, syncPending=false, signature="", steps, bar, back, forward, more, menu;
try{data=JSON.parse(sessionStorage.getItem(storageKey)) || {};}catch{data={};}

function decoded(text){
  try{return decodeURIComponent(text);}catch{return text;}
}
function route(url){
  const {pathname,hash,searchParams}=new URL(url);
  const page=pathname.slice(parentPath.length).replace(/\.html$/,"") || "index";
  const [part,chapter]=hash.slice(1).toLowerCase().split(",");
  const real=part && part!=="blankhash" ? part : "";
  return {page,part:real,key:page+(listPages.has(page) && real ? "#"+real+(searchParams.has("uid")?"@"+searchParams.get("uid"):"")
    : bookPages.has(page) && real ? "#"+real+","+(/^-?\d+$/.test(chapter)?chapter:"0") : "")};
}
function stateKey(){
  return history.state?.oursTrailFollow || route(location.href).key;
}

// Explicit list settings may change the default selected entry. The step belongs
// to the footprint the reader changed the settings on.
export function sameTrail(){
  return {oursTrailFollow:stateKey()};
}
export function describeTrail(page,name,english="",bookIdentity="",category=""){
  if(!navigationApi || !bar)return;
  const entry=navigationApi.currentEntry;
  if(!entry || route(location.href).page!==page)return;
  const key=history.state?.oursTrailFollow || bookIdentity || route(location.href).key;
  const next={key,page,name,english,category,url:entry.url};
  const prev=data[entry.key];
  if(prev && Object.keys(next).every(prop=>next[prop]===prev[prop]))return;
  data[entry.key]=next;
  persist();
  queuePaint();
}
function persist(){
  if(!navigationApi)return;
  const keys=new Set(navigationApi.entries().map(entry=>entry.key));
  for(const key in data)if(!keys.has(key))delete data[key];
  try{sessionStorage.setItem(storageKey,JSON.stringify(data));}catch{}
}
function fallback(){
  const key="oursTrailPosition",endKey="ours.newsite.trailEnd";
  const push=history.pushState.bind(history),replace=history.replaceState.bind(history);
  let end=0;
  try{if(history.state?.[key]!=null)end=Number(sessionStorage.getItem(endKey))||0;}catch{}
  if(history.state?.[key]==null)replace({...history.state,[key]:0},"");
  history.pushState=(state,...args)=>{
    const position=(history.state?.[key]||0)+1;
    push({...state,[key]:position},...args);end=position;
    try{sessionStorage.setItem(endKey,String(end));}catch{}
    queuePaint();
  };
  history.replaceState=(state,...args)=>replace({...state,[key]:history.state?.[key]||0},...args);
  addEventListener("popstate",queuePaint);
  return ()=>[history.state?.[key]||0,end];
}
function queuePaint(){
  if(syncPending || !bar)return;
  syncPending=true;
  queueMicrotask(()=>{syncPending=false;paint();});
}
function here(entry){
  return entry.url && new URL(entry.url).pathname.startsWith(parentPath);
}
function mergeEntries(entries){
  const footprints=[];
  for(const entry of entries){
    const candidate=route(entry.url),saved=data[entry.key];
    const key=saved?.url===entry.url ? saved.key : candidate.key;
    const label=(saved?.url===entry.url && saved.category) || labels[candidate.page] || (candidate.page===document.body.dataset.page ? document.title.split(" · ")[0] : candidate.page);
    const item={key,label,name:saved?.name || (listPages.has(candidate.page)&&candidate.part ? decoded(candidate.part.replace(/_[^_]+$/,"")) : label),
      english:saved?.english || "",first:entry.index,last:entry.index,target:entry.key};
    const previous=footprints.at(-1);
    if(previous?.key===key)Object.assign(previous,{name:item.name,english:item.english,last:item.last,target:item.target});
    else footprints.push(item);
  }
  return footprints;
}
function label(target,group){
  const to=target.querySelector(".trail-to"),verb=target.querySelector(".trail-verb");
  verb.textContent=target===back?"返回":"前进";
  const cat=document.createElement("small");cat.textContent=group.label;
  to.replaceChildren(...(group.label!==group.name?[cat]:[]),document.createTextNode(group.name));
  target.title=(target===back?"返回到 ":"前进到 ")+group.label+" · "+group.name+(group.english?"（"+group.english+"）":"");
}
function row(group,active){
  const button=document.createElement("button");
  button.type="button";button.className="trail-step";
  button.dataset.trailKey=group.target;
  if(group===active){button.classList.add("current");button.setAttribute("aria-current","true");}
  if(group.first>active.first){button.classList.add("future");button.dataset.future="";}
  button.title=group.label+(group.english?" · "+group.english:"");
  const cat=document.createElement("small");cat.textContent=group.label;
  const name=document.createElement("span");name.className="trail-name";name.textContent=group.name;
  button.append(cat,name);
  if(group===active){const tag=document.createElement("em");tag.textContent="正在看";button.append(tag);}
  button.onclick=()=>{
    if(menu.matches(":popover-open"))menu.hidePopover();
    go(group);
  };
  return button;
}
function go(group){
  if(group && navigationApi.currentEntry.key!==group.target)navigationApi.traverseTo(group.target).finished.catch(()=>{});
}
let backGroup,forwardGroup,shownBack,oldPosition;
function paint(){
  if(!navigationApi){
    const [position,end]=steps();
    bar.hidden=end===0;back.disabled=position===0;forward.hidden=false;forward.disabled=position>=end;return;
  }
  const all=navigationApi.entries(),current=navigationApi.currentEntry;
  if(!current || !here(current))return;
  let start=current.index,end=current.index;
  while(start>0 && here(all[start-1]))start--;
  while(end+1<all.length && here(all[end+1]))end++;
  const groups=mergeEntries(all.slice(start,end+1));
  const at=groups.findIndex(group=>group.first<=current.index && current.index<=group.last);
  if(at<0)return;
  const active=groups[at];
  oldPosition=active.first;
  backGroup=groups[at-1];forwardGroup=groups[at+1];
  bar.hidden=groups.length<2;
  if(bar.hidden){signature="";return;}
  const id=JSON.stringify([groups,current.index]);
  if(signature===id)return;
  signature=id;
  back.hidden=!backGroup;forward.hidden=!forwardGroup;
  if(backGroup)label(back,backGroup);
  if(forwardGroup)label(forward,forwardGroup);
  more.hidden=false;
  more.querySelector("small").textContent=groups.length;
  menu.replaceChildren(...groups.slice().reverse().map(group=>row(group,active)));
  const backId=backGroup?.target||"";
  if(shownBack!==undefined && shownBack!==backId && backGroup)enter(back,{x:-10,ms:280});
  shownBack=backId;
}

export function setupTrail(){
  bar=document.getElementById("footsteps");
  back=document.getElementById("trail-back");forward=document.getElementById("trail-forward");
  more=document.getElementById("trail-more");menu=document.getElementById("trail-menu");
  more.onclick=()=>menu.togglePopover();
  if(!navigationApi){
    back.onclick=()=>history.back();forward.onclick=()=>history.forward();
    steps=fallback();paint();return;
  }
  back.onclick=()=>go(backGroup);forward.onclick=()=>go(forwardGroup);
  let last;
  navigationApi.addEventListener("currententrychange",()=>{
    const cur=navigationApi.currentEntry,stay=history.state?.oursTrailFollow;
    if(!cur)return;
    const key=cur.key+"|"+cur.url+"|"+(stay||"");
    if(last===key)return;
    last=key;
    const previous=data[cur.key];
    if(stay && (!previous || previous.url!==cur.url)){
      const source=previous || data[oldPosition==null?"":navigationApi.entries()[cur.index-1]?.key];
      data[cur.key]={...source,key:stay,url:cur.url};
    }
    queuePaint();
  });
  paint();
}
