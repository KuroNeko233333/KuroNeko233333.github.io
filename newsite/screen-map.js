import {el,btn,input,dialog} from "./screen-ui.js";
import {manifest,object} from "./screen-data.js";

function imageUrl(path){
    const base=new URL("../",location.href),url=new URL(path,base);
    if(url.protocol!=="http:" && url.protocol!=="https:")throw Error("地图图片网址无效");
    // Renderer paths refer to the site root, including when Pages is mounted below a prefix.
    if(path.startsWith("/"))return new URL(path.replace(/^\/+/, ""),base);
    if(url.origin!==location.origin && ["localhost","127.0.0.1"].includes(url.hostname))return new URL(url.pathname.slice(1)+url.search,base);
    return url;
}
export async function pickMap(root,select){
    const m=await manifest(),hash=m.reading.screenMaps;
    if(!hash){root.append(el("p","","当前资料版本没有地图目录。"));return;}
    const docs=await object(hash),search=input("搜索地图所属书籍","",()=>{}),list=el("div","choices");
    root.append(search,list);
    function show(){
        list.replaceChildren(...docs.filter(r=>(r.name+" "+r.id).toLowerCase().includes(search.value.trim().toLowerCase())).map(r=>
            btn(r.name,async()=>{const maps=await object(r.maps);list.replaceChildren(btn("返回",show),...maps.map(map=>btn(map.name,()=>select({t:21,s:{state:map}}))));})));
    }
    search.oninput=show;show();
}
export async function mountMap(root,saved){
    const map=saved.state || saved;
    const space=el("div","screen-map"),tools=el("div","map-controls"),stage=el("div","map-stage");
    const svgNS="http://www.w3.org/2000/svg",svg=document.createElementNS(svgNS,"svg"),under=document.createElementNS(svgNS,"image");
    svg.setAttribute("viewBox",`0 0 ${map.width} ${map.height}`);svg.setAttribute("role","group");svg.setAttribute("aria-label",map.name || "Map Viewer");
    under.setAttribute("href",imageUrl(map.href).href);under.setAttribute("width",map.width);under.setAttribute("height",map.height);svg.append(under);
    let x=0,y=0,zoom=1,drag,moved=false;
    function draw(){svg.style.transform=`translate(${x}px,${y}px) scale(${zoom})`;}
    function resize(delta){zoom=Math.max(.1,Math.min(8,zoom*delta));draw();}
    async function region(area){
        const kind=map.page?.startsWith("adventure")?"adventure":"book",m=await manifest(),id=String(map.hash||map.source||"").toLowerCase();
        let target=map.targets?.[area];
        if(!target && m.reading.screenMaps){
            const index=await object(m.reading.screenMaps),doc=index.find(r=>r.kind===kind && r.id===id);
            if(doc){const maps=await object(doc.maps);target=maps.find(r=>r.href===map.href)?.targets?.[area];}
        }
        const {body}=dialog(target?.name || String(area)),link=el("a","","打开书章");
        link.href=kind+".html#"+id+","+(target?.chapter??map.chapter??0)+(target?","
            +encodeURIComponent(target.name.toLowerCase()):"");body.append(link);
        if(!target){body.dataset.ready="true";return;}
        const index=await object(m.reading[kind]),book=await object(index[id]),ch=book.chapters[target.chapter];
        const wrap=document.createElement("template");wrap.innerHTML=(await object(ch.body)).join("");
        const title=[...wrap.content.querySelectorAll("[data-heading]")].find(e=>e.dataset.heading===target.name);
        const section=title?.closest(".ve-rd__b,.ve-rd__b-special") || title?.parentElement;
        if(section)body.prepend(section.cloneNode(true));body.dataset.ready="true";
    }
    for(const r of map.regions || []){
        if(!Array.isArray(r.points))continue;
        const poly=document.createElementNS(svgNS,"polygon");poly.setAttribute("points",r.points.map(pt=>pt.join(",")).join(" "));
        poly.setAttribute("tabindex","0");poly.setAttribute("aria-label",map.targets?.[r.area]?.name || String(r.area));
        poly.onclick=()=>{if(!moved)region(r.area).catch(e=>{const {body}=dialog("地图区域");body.append(e.message);});};
        poly.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();moved=false;poly.onclick();}};svg.append(poly);
    }
    stage.onpointerdown=e=>{if(e.button!==0)return;moved=false;drag=[e.clientX,e.clientY,x,y];};
    stage.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag[0],dy=e.clientY-drag[1];
        if(Math.abs(dx)+Math.abs(dy)>3){if(!moved)stage.setPointerCapture(e.pointerId);moved=true;x=drag[2]+dx;y=drag[3]+dy;draw();}};
    stage.onpointerup=stage.onpointercancel=()=>drag=null;
    stage.onwheel=e=>{e.preventDefault();resize(e.deltaY<0?1.2:1/1.2);};
    tools.append(btn("缩小",()=>resize(1/1.2),"−"),btn("放大",()=>resize(1.2),"+"),btn("复位",()=>{zoom=1;x=y=0;draw();}));
    stage.append(svg);space.append(stage,tools);root.append(space);
}
