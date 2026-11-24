const root=document.documentElement;
const live=new Set(), fades=new WeakMap(), selections=new WeakMap();
// Enter: fast start, long soft landing. Leave: short and accelerating, so it gets out of the way.
const ease="cubic-bezier(.16,1,.3,1)", leave="cubic-bezier(.4,0,1,1)";
export const motionOn=()=>root.dataset.motion!=="off";
export function setMotion(on){
  root.dataset.motion=on?"on":"off";
  if(on)return;
  for(const animation of live)animation.cancel();
  themeTransition?.skipTransition();
}
function play(node,frames,options){
  if(!node || !motionOn())return null;
  const animation=node.animate(frames,{easing:ease,...options});
  live.add(animation);
  animation.finished.catch(()=>{}).finally(()=>live.delete(animation));
  return animation;
}
export function enter(node,{x=0,y=0,ms=260,from=0}={}){
  if(!node || !motionOn())return;
  fades.get(node)?.cancel();
  const animation=play(node,[{opacity:from,transform:"translate("+x+"px,"+y+"px)"},{opacity:1,transform:"none"}],{duration:ms});
  fades.set(node,animation);
}
export function entryBlocks(node){
  if(!node || !motionOn())return;
  const selector=":is(h1,h2,h3,h4,p,table,.bk-item-meta,.bk-mon-vitals,.bk-mon-abil,.bk-mon-head,.class-feature)";
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT,{
    acceptNode(el){
      if(el.hidden || el.matches("script,style,[hidden],.ve-hidden,.book-embed"))return NodeFilter.FILTER_REJECT;
      return el.matches(selector)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
    }
  });
  const blocks=new Set();
  for(let el;blocks.size<8 && (el=walker.nextNode());){
    if(el.matches("table") && !el.parentElement.closest("table"))continue;
    if(el.parentElement.closest(selector) && [...blocks].some(p=>p.contains(el)))continue;
    blocks.add(el);
  }
  [...blocks].forEach((el,i)=>play(el,[{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],
    {delay:i*26,duration:320,fill:"backwards"}));
}

export function activeBounds(parent,selector){
  if(!parent || !motionOn())return null;
  return parent.querySelector(selector)?.getBoundingClientRect() || null;
}
export function slideSelection(parent,from,to){
  if(!from || !to || !parent?.isConnected || !motionOn())return;
  const bounds=parent.getBoundingClientRect(),target=to.getBoundingClientRect();
  const dx=from.x-target.x,dy=from.y-target.y;
  if(!target.width || !from.width || Math.abs(dx)+Math.abs(dy)+Math.abs(from.width-target.width)<1)return;
  selections.get(parent)?.cancel();
  const overlay=document.createElement("span");
  overlay.className="motion-selection";
  overlay.style.cssText="left:"+(target.left-bounds.left+parent.scrollLeft)+"px;top:"+
    (target.top-bounds.top+parent.scrollTop)+"px;width:"+target.width+"px;height:"+target.height+"px";
  const style=getComputedStyle(to);
  overlay.style.background=style.backgroundColor;overlay.style.borderRadius=style.borderRadius;overlay.style.boxShadow=style.boxShadow;
  if(style.backgroundColor==="rgba(0, 0, 0, 0)" && style.boxShadow==="none")return;
  parent.append(overlay);to.classList.add("motion-sliding");
  const animation=play(overlay,[
    {transform:"translate("+dx+"px,"+dy+"px) scaleX("+from.width/target.width+")"},
    {transform:"none"},
  ],{duration:300});
  selections.set(parent,animation);
  animation.finished.catch(()=>{}).finally(()=>{overlay.remove();to.classList.remove("motion-sliding");});
}

export function rowPositions(container,selector){
  if(!motionOn())return null;
  const rows=new Map(),view=container.getBoundingClientRect();
  for(const node of container.querySelectorAll(selector)){
    const y=node.getBoundingClientRect().top;
    if(y>view.bottom)break;
    if(y+56<view.top)continue;
    const key=node.dataset.id || node.dataset.itemGroup;
    if(key)rows.set(key,y);
  }
  return rows;
}
export function moveRows(container,previous,selector){
  if(!previous || !motionOn())return;
  const view=container.getBoundingClientRect();
  for(const node of container.querySelectorAll(selector)){
    const key=node.dataset.id || node.dataset.itemGroup,old=previous.get(key);
    if(old==null){
      const bounds=node.getBoundingClientRect();
      if(bounds.bottom>view.top && bounds.top<view.bottom)enter(node,{y:8,ms:260});
      continue;
    }
    const delta=old-node.getBoundingClientRect().top;
    if(Math.abs(delta)>1 && Math.abs(delta)<300)play(node,[{transform:"translateY("+delta+"px)"},{transform:"none"}],{duration:300});
  }
}
export function foldElement(node,open){
  if(!motionOn()){node.hidden=!open;return;}
  // Closing changes hit-testing immediately while the visual height settles.
  const before=node.hidden?0:node.getBoundingClientRect().height;
  fades.get(node)?.cancel();
  if(open)node.hidden=false;
  const after=open?node.getBoundingClientRect().height:0;
  if(before===after){node.hidden=!open;node.inert=false;node.style.removeProperty("overflow");return;}
  node.inert=!open;
  node.style.overflow="clip";
  const animation=play(node,[{height:before+"px",opacity:open ? 0 : 1},{height:after+"px",opacity:open?1:0}],{duration:open?280:200});
  fades.set(node,animation);
  animation.finished.catch(()=>{}).finally(()=>{
    if(fades.get(node)!==animation)return;
    node.hidden=!open;node.inert=false;node.style.removeProperty("overflow");
  });
}

export function sectionSnapshot(container){
  if(!motionOn())return null;
  const saved=new Map(),height=innerHeight;
  for(const node of container.children){
    const bounds=node.getBoundingClientRect();
    if(bounds.top>=height || saved.size>=8)break;
    if(bounds.bottom>42)saved.set(node,bounds);
  }
  return saved;
}
export function animateSections(container,saved){
  if(!saved || !motionOn())return;
  const view=container.closest("#reading")?.getBoundingClientRect();
  for(const [node,bounds] of saved){
    if(container.contains(node)){
      const delta=bounds.top-node.getBoundingClientRect().top;
      if(Math.abs(delta)>1 && Math.abs(delta)<240)play(node,[{transform:"translateY("+delta+"px)"},{transform:"none"}],{duration:300});
      continue;
    }
    if(!view || bounds.top<view.top || bounds.bottom>view.bottom || bounds.height>220)continue;
    const ghost=node.cloneNode(true);
    for(const el of [ghost,...ghost.querySelectorAll("[id]")])el.removeAttribute("id");
    ghost.inert=true;ghost.classList.add("motion-ghost");
    ghost.style.cssText="top:"+bounds.top+"px;left:"+bounds.left+"px;width:"+bounds.width+"px";
    document.body.append(ghost);
    const fading=play(ghost,[{opacity:.85},{opacity:0,transform:"translateY(-6px)"}],{duration:170,easing:leave});
    fading.finished.catch(()=>{}).finally(()=>ghost.remove());
  }
  const fresh=[...container.children].filter(node=>!saved.has(node) && node.dataset.sub && node.getBoundingClientRect().top<innerHeight);
  fresh.slice(0,6).forEach((node,i)=>enter(node,{y:10,ms:300+i*30}));
}

let themeTransition;
export function changeTheme(update){
  if(!motionOn() || !document.startViewTransition){update();return;}
  themeTransition?.skipTransition();
  const t=document.startViewTransition(update);
  themeTransition=t;
  t.finished.catch(()=>{}).finally(()=>{if(themeTransition===t)themeTransition=null;});
}

export function retireDialog(dialog){
  if(dialog.open || dialog.matches(":popover-open"))return;
  if(!motionOn()){dialog.remove();return;}
  const animations=dialog.getAnimations();
  if(!animations.length){dialog.remove();return;}
  Promise.allSettled(animations.map(a=>a.finished)).then(()=>{
    if(!dialog.open && !dialog.matches(":popover-open"))dialog.remove();
  });
}

export function exitLayer(node){
  if(!node || node.inert)return;
  if(!motionOn()){node.remove();return;}
  node.inert=true;
  const animation=play(node,[{opacity:1,scale:1},{opacity:0,scale:.97}],{duration:160,easing:leave});
  animation.finished.catch(()=>{}).finally(()=>node.remove());
}

export function showImageDialog(dialog,thumbnail){
  const start=motionOn() ? thumbnail?.getBoundingClientRect() : null;
  dialog.showModal();
  const image=dialog.querySelector("img");
  if(!start?.width || !image?.complete)return;
  const goal=image.getBoundingClientRect();
  if(!goal.width || !goal.height)return;
  image.style.transformOrigin="50% 50%";
  const dx=start.x+start.width/2-goal.x-goal.width/2,dy=start.y+start.height/2-goal.y-goal.height/2;
  play(image,[{opacity:.5,transform:"translate("+dx+"px,"+dy+"px) scale("+Math.max(.08,start.width/goal.width)+")"},
    {opacity:1,transform:"none"}],{duration:340});
}
