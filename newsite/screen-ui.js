import {retireDialog,enter,exitLayer} from "./motion.js";
export const $ = (q, root=document) => root.querySelector(q);
export function el(tag, cls, text) {
    const node=document.createElement(tag);
    if (cls) node.className=cls;
    if (text != null) node.textContent=text;
    return node;
}
export function btn(label, fn, icon="", color="") {
    const node=el("button",color); node.type="button"; node.title=label; node.setAttribute("aria-label",label);
    if (icon) node.append(el("span","glyph",icon)); else node.textContent=label;
    node.onclick=e=>Promise.resolve().then(()=>fn(e)).catch(e=>notice(e.message));
    return node;
}
export function input(label,value,change) {
    const node=el("input"); node.value=value ?? "";node.title=label;node.setAttribute("aria-label",label);
    node.autocomplete="off";node.onchange=()=>change(node.value,node);
    node.onkeydown=e=>{if(e.key==="Enter")node.blur();};
    return node;
}
export function notice(text) {
    const out=$("#message");if(!out)return;out.textContent=text;out.hidden=false;
}
export function dialog(title) {
    const d=el("dialog","screen-dialog"),head=el("header"),body=el("section");
    head.append(el("h2","",title),btn("关闭",()=>d.close(),"×"));
    d.append(head,body);
    d.onclose=()=>retireDialog(d);d.addEventListener("click",e=>{if(e.target===d)d.close();});
    (document.querySelector(".screen-workspace") || document.body).append(d);
    d.showModal();return {d,body};
}
export function screenWindow(title, className, withFooter=false) {
    const {d,body}=dialog(title);
    d.classList.add("screen-window",className);
    d.querySelector("header button").remove();
    const footer=withFooter?d.appendChild(el("footer")):null;
    return {d,body,footer};
}
export function screenMenu(anchor, actions) {
    const container=anchor.closest("dialog") || anchor.closest(".screen-workspace");
    container.querySelector(".screen-context-menu:not([inert])")?.dispatchEvent(new Event("dismiss-menu"));
    const menu=el("div","screen-context-menu"),lifetime=new AbortController(),{signal}=lifetime;
    menu.setAttribute("role","menu");
    const close=restore=>{
        lifetime.abort();exitLayer(menu);
        if(restore && anchor.isConnected)anchor.focus({preventScroll:true});
    };
    menu.addEventListener("dismiss-menu",()=>close(false),{once:true});
    for(const [label,choose] of actions){
        const item=btn(label,()=>{close(false);return choose();});
        item.setAttribute("role","menuitem");menu.append(item);
    }
    container.append(menu);
    const r=anchor.getBoundingClientRect();
    menu.style.left=Math.max(4,Math.min(r.left,innerWidth-menu.offsetWidth-4))+"px";
    menu.style.top=Math.max(4,r.bottom+menu.offsetHeight+4>innerHeight?r.top-menu.offsetHeight:r.bottom)+"px";
    enter(menu,{y:8});
    document.addEventListener("pointerdown",e=>{if(!menu.contains(e.target))close(false);},{signal,capture:true});
    document.addEventListener("keydown",e=>{
        if(!menu.isConnected){close(false);return;}
        if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true);}
        if(e.key==="ArrowDown" || e.key==="ArrowUp"){
            e.preventDefault();
            const buttons=[...menu.children],i=buttons.indexOf(document.activeElement);
            buttons[(i+(e.key==="ArrowUp"?-1:1)+buttons.length)%buttons.length]?.focus();
        }
    },{signal,capture:true});
    container.addEventListener("close",()=>close(false),{signal,once:true});
    menu.firstElementChild?.focus({preventScroll:true});
}
export function download(doc) {
    const url=URL.createObjectURL(new Blob([JSON.stringify({...doc,fileType:"dm-screen"},null,2)],{type:"application/json"}));
    Object.assign(el("a"),{href:url,download:"dm-screen.json"}).click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function fileInput(label,load) {
    const node=el("input");node.type="file";node.accept=".json,application/json";node.setAttribute("aria-label",label);
    node.onchange=async()=>{try {if(node.files.length) await load(JSON.parse(await node.files[0].text()));}catch(e){notice(e.message);}};
    return node;
}
export function theme() {
    document.documentElement.dataset.oursTheme=localStorage.getItem("ours.theme") || "day";
}

