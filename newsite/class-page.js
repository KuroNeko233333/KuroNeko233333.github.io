import {mediaUrl, tryImageMirror} from "./card-media.js";

const labels = {off24:"官方 · 2024",off14:"官方 · 2014",ours:"我们的扩充",brew:"第三方",third:"第三方","3p":"第三方"};
const element = (tag, cls, text) => {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!=null)el.textContent=text;
    return el;
};
const button = (cls,text,action) => {
    const b=element("button",cls,text);b.type="button";b.onclick=action;return b;
};
const fragment = (tag,cls,html) => {const el=element(tag,cls);el.innerHTML=html;return el;};
const section = (cls,title) => {
    const el=element("section","ntc-sec "+cls),head=element("div","ntc-sec__head");
    head.append(element("h2","ntc-h",title));el.append(head);return el;
};
const dec = value => {try{return decodeURIComponent(value);}catch{return value;}};
const searchText = value => dec(value).trim().toLowerCase();
function splitState() {
    const [hash,...parts]=location.hash.slice(1).toLowerCase().split(",");
    const params=new Map(parts.filter(p=>p.startsWith("state:")).flatMap(p=>p.slice(6).split("~").map(k=>k.split("="))));
    return {hash,params};
}
function classUrl(hash,keys=[],feature="") {
    const u=new URL(location.href);
    for(const k of ["ours-feature","ours-feature-kind","ours-search","ours-source","title"])u.searchParams.delete(k);
    const parts=[...keys].map(k=>k+"=b1");
    if(feature)parts.push("feature=s"+feature);
    u.hash=hash+(parts.length?",state:"+parts.join("~"):"");return u;
}
function anchor(cls,text,href){const a=element("a",cls,text);a.href=href;return a;}
const breathe=()=>globalThis.scheduler?.yield?scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
const painted=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
const cache=new Map();
function get(ctx,key){return ctx.object(key,cache,36);}
const sourceEdition = {off24:"24",off14:"14"};
function sourceTag(tag,source,kind,sourceStyle=sourceEdition[kind]||kind){
    const badge=element(tag,"nt-tag nt-tag--"+sourceStyle,source.ab);
    const ink=kind==="ours"||kind==="3p"?kind:/^UA/i.test(source.s)?"ua":
        ["XPHB","XDMG","XMM"].includes(source.s)?"off24":"off14";
    badge.style.setProperty("--src","var(--v3-k-"+ink+")");
    return badge;
}
function subclassEditionTag(edition){
    return element("span","nt-tag nt-tag--"+edition.slice(2)+" bk-sc-edition",edition);
}
const subclassGroups = modern => [...(modern?["off24","off14"]:["off14","off24"]),"ours","3p"];

function displayTagline(sc, sourceAllowed, showVariants){
    function remains(node){
        if(node==null)return false;
        if(node===true)return true;
        return (!node.sources || node.sources.some(sourceAllowed) && (showVariants || !node.variant)) &&
            (!node.entries || node.entries.some(remains));
    }
    return sc.lead?.find(remains)?.tag || "";
}

function browseDialog(available,modern,selected,choose,close,total){
    const panel=element("div","n4-pop");panel.setAttribute("role","dialog");panel.setAttribute("aria-label","浏览子职业");
    const bar=element("div","n4-pop__bar"),q=element("input","n4-pop__q"),kinds=element("div","n4-kinds");
    q.type="search";q.placeholder="搜索子职业、来源…";
    const away=total-available.length;
    const note=away>0?"另有 "+away+" 个没有列出：被顶部的资料范围或版本开关收起了。":"";
    const list=element("div","n4-pop__list"),foot=element("div","n4-pop__foot","点一个子职业 = 只看它；点右边的 ＋ = 同时显示多个，方便对比。"+note);
    bar.append(q,kinds,button("n4-pop__btn","清除选择",()=>choose("",false)),button("n4-pop__btn","收起",close));panel.append(bar,list,foot);
    const groups=Map.groupBy(available,s=>s.group);
    const order=subclassGroups(modern);
    const listed=order.filter(g=>groups.has(g));
    let group="";
    function paint(){
        kinds.replaceChildren();list.replaceChildren();
        for(const g of ["",...listed]){
            const tab=button("n4-kind"+(g===group?" on":""),g?labels[g]:"全部",()=>{group=g;paint();});
            if(g)tab.dataset.g=g;
            tab.append(element("span","",g?groups.get(g).length:available.length));kinds.append(tab);
        }
        const needle=q.value.trim().toLowerCase();
        for(const g of listed){
            const entries=groups.get(g);
            if(group && group!==g)continue;
            const hits=entries.filter(s=>[s.n,s.short,s.e,s.ab,s.full].join(" ").toLowerCase().includes(needle));
            if(!hits.length)continue;
            const wrap=element("div","n4-g"),grid=element("div","n4-cards"),title=element("div","n4-g__h",labels[g]||g);
            wrap.dataset.g=g;title.append(element("span","",hits.length));wrap.append(title,grid);
            for(const sc of hits){
                const on=selected.has(sc.k),card=element("div","n4-card"+(on?" on":""));card.dataset.g=g;card.dataset.key=sc.k;card.tabIndex=0;
                card.setAttribute("role","button");card.setAttribute("aria-pressed",on);card.title=sc.n+" · "+(sc.full||sc.s);
                const n=element("span","n4-card__n",sc.n);if(sc.e)n.append(element("small","",sc.e));
                const tags=element("span","n4-card__tags");if(sc.edition)tags.append(subclassEditionTag(sc.edition));
                tags.append(sourceTag("span",sc,sc.group));
                card.onclick=()=>choose(sc.k,false);card.onkeydown=e=>{if(e.target===card&&["Enter"," "].includes(e.key)){e.preventDefault();choose(sc.k,false);}};
                const add=button("n4-card__add",on?"－":"＋",e=>{e.stopPropagation();choose(sc.k,true);});
                add.setAttribute("aria-label",(on?"取消 ":"同时显示 ")+sc.n);card.append(n,tags,element("span","n4-card__t",sc.tag),add);grid.append(card);
            }
            list.append(wrap);
        }
        if(!list.childElementCount)list.append(element("div","n4-empty","没有名字或来源里带“"+q.value.trim()+"”的子职业。换个词，或者点上面的“全部”。"));
    }
    q.oninput=paint;panel.onkeydown=e=>{if(e.key==="Escape")close();};paint();return {panel,paint,q};
}
function decorateImage(head,tableSection,table,card,modern,signal){
    if(!card.image)return;
    const fig=element("figure","bk-class-art"),img=element("img");fig.dataset.edition=modern?"24":"14";
    for(const prop of ["--bk-art-ratio","--bk-avatar-x","--bk-avatar-y","--bk-avatar-zoom"]){
        const value=card.artStyle?.match(new RegExp(prop+":\\s*([^;]+)"))?.[1];if(value)fig.style.setProperty(prop,value);
    }
    img.alt=card.imageAlt||"职业插图";img.src=mediaUrl(card.image);img.decoding="async";
    const status=element("span","bk-img-status","正在加载插图…");fig.dataset.bkImg="loading";
    img.onerror=()=>{if(!tryImageMirror(img)){fig.dataset.kind="placeholder";fig.dataset.bkImg="failed";status.textContent="图片暂时不可用";}};
    img.onload=()=>{fig.dataset.kind="ready";fig.dataset.bkImg="ready";status.hidden=true;};
    const enlarge=()=>{const d=element("dialog","class-image"),copy=img.cloneNode();d.append(copy);document.body.append(d);d.onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();};
    fig.addEventListener("click",enlarge);fig.tabIndex=0;fig.onkeydown=e=>{if(e.key==="Enter")enlarge();};fig.append(img,status);
    const row=head.querySelector(".ntc-head__row");
    let tableWidth=0,sectionWidth=0;
    function layout(entries){
        for(const e of entries){
            if(e.target===table)tableWidth=e.borderBoxSize[0].inlineSize;
            else sectionWidth=e.contentRect.width;
        }
        if(!tableWidth||!sectionWidth)return;
        const room=sectionWidth-tableWidth-24,side=innerWidth>=900 && room>=200;
        const target=side?tableSection:head;if(fig.parentNode!==target)target.append(fig);
        fig.dataset.layout=side?"side":"avatar";row.classList.toggle("bk-class-avatar-row",!side);
        Object.assign(fig.style,side?{top:"0",left:(tableWidth+24)+"px",width:Math.min(340,room)+"px"}:{top:"0",left:"0",width:"60px"});
    }
    const observer=new ResizeObserver(layout);observer.observe(table);observer.observe(tableSection);
    signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
}
function manualProjection(base,rules,ctx){
    const includes=new Set([...(ctx.manualSources||[])].map(s=>s.toLowerCase())),excludes=new Set([...(ctx.excludedSources||[])].map(s=>s.toLowerCase()));
    const accepts=r=>!(r.exclude||r.sources.slice(0,1)).some(s=>excludes.has(s.toLowerCase()))&&(!includes.size||r.sources.some(s=>includes.has(s.toLowerCase())));
    const enabled=new Set(),classesById=new Map(),sourcesByClass=new Map();
    for(const [i,subs] of base){
        const c=rules.classes[i],children=subs.filter(j=>accepts(c.subs[j]));
        sourcesByClass.set(i,children);
        if(accepts(c)||rules.showParent&&children.length)enabled.add(c.i);
        for(const j of children)enabled.add(c.subs[j].i);
        classesById.set(c.i,c);
    }
    const preferred=r=>(ctx.edition==="24"?r.newer:ctx.edition==="14"?r.old:[]).find(i=>enabled.has(i));
    const result=[];
    for(const [i] of base){
        const c=rules.classes[i];if(!enabled.has(c.i))continue;
        const subs=sourcesByClass.get(i).filter(j=>preferred(c.subs[j])===undefined);
        const twin=classesById.get(preferred(c));
        if(twin){
            const names=new Set(twin.subs.flatMap(s=>s.names));
            if(!subs.some(j=>(ctx.edition!=="14"||c.subs[j].classic)&&!c.subs[j].names.some(n=>names.has(n))))continue;
        }
        result.push([i,subs]);
    }
    return result;
}
async function readScope(ctx){
    const index=await get(ctx,ctx.manifest.reading.classes);
    const custom=ctx.mode==="manual"&&(ctx.manualSources!=null||ctx.excludedSources?.size);
    const key=(custom?"all":ctx.mode)+"/"+(custom&&index.manual?"":ctx.edition);
    let projection=await get(ctx,index.combos[key]);
    if(custom&&index.manual)projection=manualProjection(projection,await get(ctx,index.manual),ctx);
    const keys=index.sourceScopes?.[ctx.mode];
    const sourceSet=custom?ctx.manualSources:keys&&ctx.mode!=="all"?new Set(await get(ctx,keys)):null;
    const permitted=sourceSet&&new Set([...sourceSet].map(s=>s.toLowerCase()));
    const excluded=custom?new Set([...(ctx.excludedSources||[])].map(s=>s.toLowerCase())):null;
    const sourceAllowed=s=>!s||!excluded?.has(s.toLowerCase())&&(!permitted?.size||permitted.has(s.toLowerCase()));
    // Renderer checks feature sources as literal IDs. A reference can carry
    // different casing from its parent subclass, even when both are the same book.
    const introSourceAllowed=s=>!s||!(custom&&ctx.excludedSources?.has(s))&&(!sourceSet?.size||sourceSet.has(s));
    return {index,members:new Map(projection),choices:projection.map(([i])=>index.classes[i]),sourceAllowed,introSourceAllowed};
}
let lastScope;
function classScope(ctx){
    const keys=[ctx.manifest.reading.classes,ctx.mode,ctx.edition,ctx.manualSources,ctx.excludedSources];
    if(!lastScope||keys.some((k,i)=>k!==lastScope.keys[i])){
        const value=readScope(ctx).catch(error=>{if(lastScope?.value===value)lastScope=null;throw error;});
        lastScope={keys,value};
    }
    return lastScope.value;
}
export async function classVisible(ctx,hash){
    const {choices,members,index}=await classScope(ctx),[h,...parts]=hash.toLowerCase().split(",");
    const cls=choices.find(c=>searchText(c.h)===searchText(h));if(!cls)return false;
    const keys=parts.filter(p=>p.startsWith("state:")).flatMap(p=>p.slice(6).split("~")).filter(p=>p.startsWith("sub_")&&p.endsWith("=b1")).map(p=>p.slice(0,-3));
    if(!keys.length)return true;
    const card=await get(ctx,cls.card),visible=members.get(index.classes.indexOf(cls));
    return keys.every(k=>visible.some(i=>card.subs[i].k===k));
}
export async function classPreview(ctx,page,hash){
    const index=await get(ctx,ctx.manifest.reading.classes);
    const feature=page.endsWith("feature"),parts=hash.split("_").map(searchText);
    const h=feature?parts[1]+"_"+parts[2]:hash.split(",")[0];
    const cls=index.classes.find(c=>searchText(c.h)===searchText(h));if(!cls)return null;
    const card=await get(ctx,cls.card);
    if(!feature)return "<h3>"+card.title+"</h3>"+card.facts+card.props;
    const sc=page==="subclassfeature"?card.subs.find(s=>searchText(s.short)===parts[3]&&searchText(s.s)===parts[4]):null;
    const rows=await get(ctx,sc?.body||card.body);
    for(const r of rows){
        if(!sc&&r.l!==Number(parts[3]))continue;
        const content=fragment("div","",r.html);
        const title=[...content.querySelectorAll(".entry-title-inner")].find(e=>searchText(e.textContent).includes(parts[0]));
        if(title)return title.closest(".ve-rd__b")?.outerHTML||r.html;
    }
    return null;
}
export async function showClasses(ctx,media){
    const {root,edition,signal}=ctx;
    // Read the previous viewport before replacing its document, while layout is current.
    if(root.scrollTop && !history.state?.classScroll)root.scrollTop=0;
    const {index,members,choices:scopeChoices,sourceAllowed:inScope,introSourceAllowed}=await classScope(ctx);
    const choices=[...scopeChoices];
    if(signal.aborted)return;
    const {hash,params}=splitState(),requested=index.classes.find(c=>searchText(c.h)===searchText(hash));
    const route=new URL(location.href);
    const pinned=requested && searchText(route.searchParams.get("ours-search")||"")===searchText(requested.h);
    if(pinned&&!choices.includes(requested))choices.push(requested);
    const cls=requested||choices[0];
    const layout=element("div","class-page"),side=element("aside","class-list"),doc=element("article","ntc");
    layout.append(side,doc);
    if(!cls){doc.textContent="当前设置下没有职业。";root.replaceChildren(layout);return;}
    const card=await get(ctx,cls.card);
    const id=index.classes.indexOf(cls),visible=members.get(id)||[],available=visible.map(i=>card.subs[i]).filter(Boolean);
    const selected=new Set(card.subs.filter(s=>params.get(s.k)==="b1").map(s=>s.k));
    const extraSources=new Set(route.searchParams.getAll("ours-source").map(s=>s.toLowerCase()));
    if(pinned)for(const sc of card.subs.filter(s=>selected.has(s.k))){
        if(!available.includes(sc))available.push(sc);
        extraSources.add(sc.s.toLowerCase());
    }
    const sourceAllowed=s=>inScope(s)||!!s&&pinned&&extraSources.has(s.toLowerCase());
    const base=await get(ctx,card.body);
    if(signal.aborted)return;
    if(!requested||requested!==cls)history.replaceState(history.state,"",classUrl(cls.h));
    const tabs=element("div","n4-ltabs"),rows=element("div","class-links"),query=element("input","class-query");
    query.type="search";query.autocomplete="off";query.setAttribute("aria-label","搜索职业");
    const listTools=element("div","class-toolbar"),searchBox=element("div","class-search-box");
    searchBox.append(query);
    listTools.append(button("","筛选",()=>{sourceFilter.hidden=!sourceFilter.hidden;}),searchBox);
    const sourceFilter=element("select","class-query");sourceFilter.hidden=true;sourceFilter.setAttribute("aria-label","筛选职业来源");
    for(const value of ["",...new Set(choices.map(c=>c.s))]){const option=element("option","",value||"全部来源");option.value=value;sourceFilter.append(option);}
    side.append(listTools,sourceFilter,tabs,rows);let core=cls.core;
    const merged=new Map();
    for(const c of choices.filter(c=>c.core)){
        const twin=merged.get(c.n);
        if(!twin||c===cls||twin!==cls&&c.modern===(edition!=="14"))merged.set(c.n,c);
    }
    const listed=choices.filter(c=>!c.core||merged.get(c.n)===c);
    function paintList(){
        tabs.replaceChildren();rows.replaceChildren();
        for(const group of [true,false]){
            const b=button(group===core?"on":"",group?"核心职业":"其他职业",()=>{core=group;query.value="";paintList();});
            b.append(element("span","",listed.filter(c=>c.core===group).length));tabs.append(b);
        }
        const q=searchText(query.value);
        let previousGroup;
        for(const c of listed.filter(c=>q?[c.n,c.e,c.s].some(v=>searchText(v).includes(q)):c.core===core).filter(c=>!sourceFilter.value||c.s===sourceFilter.value)){
            const group=c.core?"core":c.featured?"featured":"other";
            if(group!=="core"&&group!==previousGroup){
                const heading=element("div","class-list-group",group==="featured"?"不全书收录的第三方职业":"其他第三方职业");
                heading.dataset.group=group;rows.append(heading);
            }
            previousGroup=group;
            const a=anchor("class-link"+(c===cls?" current":""),"",classUrl(c.h));
            const mergedRow=c.core&&choices.filter(v=>v.core&&v.n===c.n).length===2;
            a.dataset.group=group;a.classList.toggle("class-link-merged",mergedRow);
            a.append(element("span","class-list-name",c.n+(c.e?" "+c.e:"")));
            a.dataset.hash=c.h;
            if(!mergedRow){
                const type=/^ours/i.test(c.s)?"ours":/['’]24$/.test(c.ab)||["XPHB","XDMG","XMM"].includes(c.s)?"24":/^UA/i.test(c.s)?"ua":c.group==="3p"?"3p":"14";
                const cell=element("span","class-list-source");
                cell.append(sourceTag("span",c,c.group,type));a.append(cell);
            }
            rows.append(a);
        }
    }
    sourceFilter.onchange=paintList;query.oninput=paintList;paintList();
    await breathe();if(signal.aborted)return;
    const head=element("header","ntc-head bk-hero"),line=element("div","ntc-head__row"),title=fragment("h1","ntc-title",card.title);
    const ed=element("div","n4-ed"),source=sourceTag("span",cls,cls.group);source.title=card.full;
    const twins=choices.filter(c=>c.n===cls.n&&c.core&&c!==cls);
    if(twins.length){
        const sw=element("div","n4-edsw");sw.setAttribute("role","group");sw.setAttribute("aria-label","规则版本");
        for(const c of [cls,...twins].sort((a,b)=>b.modern-a.modern)){
            const tab=anchor(c===cls?"on":"",c.modern?"2024":"2014",classUrl(c.h));
            tab.dataset.ed=c.modern?"24":"14";
            if(c===cls)tab.setAttribute("aria-current","page");
            sw.append(tab);
        }
        ed.append(sw);
    }
    if(!twins.length){const tag=(cls.group==="off14"||cls.group==="off24"||cls.core)?(cls.modern?"2024 规则":"2014 规则"):(cls.s.toLowerCase().startsWith("ours")?"我们的扩充":"第三方");ed.append(element("span","nt-tag nt-tag--"+(sourceEdition[cls.group]||cls.group),tag));}ed.append(source);const facts=fragment("div","n4-facts bk-facts",card.facts),props=fragment("div","ntc-props",card.props);
    const details=button("n4-more","详情",()=>{
        const open=head.classList.toggle("n4-open");
        details.textContent=open?"收起详情":"详情";details.setAttribute("aria-expanded",open);
    });
    details.setAttribute("aria-expanded","false");facts.append(details);
    const actions=element("div","ntc-actions");
    const openView=view=>{
        const u=classUrl(cls.h,selected);
        u.hash+=(u.hash.includes(",state:")?"~":",state:")+view+"=b1";
        history.pushState({...history.state,classScroll:root.scrollTop},"",u);
        showView(view,true);
    };
    const actionGroup=element("div","class-actions-group");
    actionGroup.append(button("class-compare","子职对比",()=>openView("isviewactivesccomp")),
        button("class-original","查看原文",()=>openView("isviewactivebook")));actions.append(actionGroup);
    line.append(title,ed,facts,actions);head.append(line,props);
    const subSec=section("ntc-sec--sub bk-subs","子职业"),pins=element("div","class-pins");
    subSec.firstElementChild.append(element("span","ntc-count",available.length+" 个"));
    const tableSec=section("ntc-sec--table","成长表"),tableWrap=element("div","class-growth"),table=fragment("table","ve-cls-tbl",card.table);
    if(card.tableClass?.includes("bk-full-caster"))table.classList.add("bk-full-caster");
    const colCount=Math.max(...[...table.rows].map(r=>r.cells.length));
    for(const cell of table.querySelectorAll('[colspan="999"]'))cell.colSpan=colCount;
    tableWrap.append(table);tableSec.append(tableWrap);subSec.append(pins);
    const bodySec=section("ntc-sec--body","职业特性"),body=element("div","class-body"),toc=element("nav","class-toc"),outline=element("div","class-outline");
    toc.append(element("div","class-toc-title","概要"),outline);const bodyGrid=element("div","class-columns");bodyGrid.append(body,toc);bodySec.append(bodyGrid);
    const filters=element("div","class-body-filters"),show={features:true,variant:true,fluff:false};
    for(const [key,name] of [["features","特性"],["variant","变体"],["fluff","简介"]]){
        const b=button(show[key]?"on":"",name,()=>{show[key]=!show[key];b.classList.toggle("on",show[key]);paintSelection();});filters.append(b);
    }
    bodySec.firstChild.append(filters);doc.append(head,subSec);
    media(head);root.replaceChildren(layout);
    // Let the browser lay out the identity strip before it measures the intrinsic
    // widths of a wide spell-slot table. Both stages use their final widths.
    await painted();if(signal.aborted)return;
    media(table);doc.append(tableSec);
    await painted();if(signal.aborted)return;
    if(card.more){const more=fragment("div","ntc-props ntc-props--more",card.more);media(more);doc.append(more);}
    doc.append(bodySec);decorateImage(head,tableSec,table,card,cls.modern,signal);
    let dialog=null,serial=0,bodySerial=0,observer,allRows=[];
    const nodeByRow=new Map(),levels=new Map([...table.rows].map(tr=>[parseInt(tr.querySelector("td.ve-cls-tbl__col-level")?.textContent),tr.cells[2]]));
    function close(){dialog?.panel.remove();dialog=null;
        const trigger=subSec.querySelector(".n4-browse");
        trigger?.classList.remove("on");trigger?.setAttribute("aria-expanded","false");}
    function showView(view,openedHere){
        const comparison=view==="isviewactivesccomp",modal=element("dialog","class-reading-dialog");
        const title=element("header","class-modal-head"),content=element("div",comparison?"class-comparison":"class-original-text");
        title.append(element("h2","",comparison?"子职对比":cls.n),button("","关闭",()=>modal.close()));
        if(comparison){
            const active=card.subs.filter(sc=>selected.has(sc.k));
            if(!active.length)content.append(element("p","","请先选择要对比的子职业。"));
            for(const sc of active){
                const col=element("article","");col.append(element("h3","",sc.n));
                for(const r of allRows.filter(r=>r.sc===sc.k&&!r.fluff))col.append(fragment("section","class-feature",r.html));
                content.append(col);
            }
        }else{
            content.append(fragment("div","ntc-props",card.props));
            for(const r of allRows.filter(r=>!r.none&&(!r.extra||body.querySelector('[data-level="'+r.l+'"][data-sub]'))))
                content.append(fragment("section","class-feature",r.html));
        }
        media(content);modal.append(title,content);document.body.append(modal);modal.showModal();
        modal.addEventListener("close",()=>{
            modal.remove();
            if(signal.aborted)return;
            if(openedHere)history.back();
            else history.replaceState(history.state,"",classUrl(cls.h,selected));
        },{once:true});
        signal.addEventListener("abort",()=>modal.remove(),{once:true});
    }
    const visibleSubs=new Set(available),groups=subclassGroups(cls.modern);
    const slots=card.buttons || card.subs.map((sc,i)=>({sub:i,card:i,label:sc.short}))
        .sort((a,b)=>(card.subs[a.sub].order||0)-(card.subs[b.sub].order||0));
    const menuSlots=slots.filter(slot=>slot.card!=null && visibleSubs.has(card.subs[slot.sub]));
    const tagline=sc=>sc.lead
        ? displayTagline(sc,s=>introSourceAllowed(s)||pinned&&extraSources.has(s?.toLowerCase()),show.variant)
        : sc.tag;
    function paintPins(){
        pins.replaceChildren();let count=0;
        for(const slot of slots){
            const sc=card.subs[slot.sub],view=card.subs[slot.card],active=selected.has(sc.k);
            if(!visibleSubs.has(sc))continue;
            const group=view?.group||"3p";
            const pin=view&&(view.s===cls.s||(card.official ?? cls.core)&&cls.modern&&group==="off24");
            if(!(pin&&++count<=12)&&!active)continue;
            const b=button("class-pin"+(active?" on":""),slot.label,()=>choose(sc.k,true));
            b.style.order=groups.indexOf(group);b.dataset.g=group;b.dataset.key=sc.k;
            b.title=[sc.n,view?.note,view&&tagline(view)].filter(Boolean).join("\n");
            b.append(element("span","class-pin-source","("+sc.ab+")"));
            if(view?.edition)b.append(subclassEditionTag(view.edition));pins.append(b);
        }
        const browse=button("n4-browse","浏览全部",()=>{
            if(dialog){close();return;}
            const entries=menuSlots.map(({card:at})=>{
                const sc=card.subs[at];
                return {...sc,tag:tagline(sc)};
            });
            dialog=browseDialog(entries,cls.modern,selected,choose,close,card.subs.length);
            subSec.append(dialog.panel);browse.classList.add("on");browse.setAttribute("aria-expanded","true");dialog.q.focus();
        });
        browse.hidden=!menuSlots.length;browse.setAttribute("aria-haspopup","dialog");browse.setAttribute("aria-expanded",!!dialog);browse.classList.toggle("on",!!dialog);
        browse.append(element("span","n4-browse__n",menuSlots.length+" 个"),element("span","n4-caret"));
        subSec.querySelector(".n4-browse")?.remove();
        subSec.insertBefore(browse,dialog?.panel||null);
    }
    async function choose(key,add){
        if(!add)selected.clear();
        if(key){if(add&&selected.has(key))selected.delete(key);else selected.add(key);}
        history.pushState({...history.state,classScroll:root.scrollTop},"",classUrl(cls.h,selected));
        if(!add)close();else dialog?.paint();paintPins();await paintSelection();
    }
    function jump(target,record=true){
        if(!target)return;
        const marker=target.dataset.oursScTitle||target.closest(".ve-rd__h")?.querySelector("[data-ours-sc-title]")?.dataset.oursScTitle;
        target=target.closest(".ve-rd__h")||target;
        const row=target.closest(".class-feature");if(row)row.style.contentVisibility="visible";
        if(record){const u=classUrl(cls.h,selected,row?.dataset.scrollId);if(marker)u.searchParams.set("title",marker);
            history.pushState({...history.state,classScroll:null},"",u);}
        target.scrollIntoView({block:"center"});target.classList.add("class-focus");target.addEventListener("animationend",()=>target.classList.remove("class-focus"),{once:true});
    }
    async function paintBody(){
        const ticket=++bodySerial;
        observer?.disconnect();const newOutline=document.createDocumentFragment();
        let last=performance.now();
        const gains=new Set(allRows.filter(r=>r.sc&&!r.fluff&&sourceAllowed(r.source)&&(!r.variant||show.variant)).map(r=>r.l)),visible=[];
        for(const r of allRows){
            if(!sourceAllowed(r.source)||r.extra&&!gains.has(r.l)||r.none&&(selected.size||r.extra)||
               r.fluff&&!show.fluff||r.variant&&!show.variant||!r.sc&&!r.fluff&&!show.features)continue;
            let node=nodeByRow.get(r.i);
            if(!node){node=fragment("section","class-feature",r.html);media(node);nodeByRow.set(r.i,node);}
            for(const block of node.querySelectorAll('[data-class-source],[class*="cls__feature-variant"]')){
                block.hidden=!sourceAllowed(block.dataset.classSource)||!show.variant&&block.className.includes("cls__feature-variant");
            }
            if(r.sc)for(const prefix of node.querySelectorAll("[data-subclass-name-prefix]"))prefix.classList.toggle("ve-hidden",selected.size<=1);
            node.dataset.level=r.l;if(r.id)node.dataset.scrollId=r.id;if(r.sc)node.dataset.sub=r.sc;
            visible.push(node);
            if(performance.now()-last>12){await breathe();if(ticket!==bodySerial||signal.aborted)return;last=performance.now();}
        }
        const wanted=new Set(visible);
        for(const node of [...body.children])if(!wanted.has(node))node.remove();
        let next=body.firstChild;
        for(const node of visible){if(node===next)next=next.nextSibling;else body.insertBefore(node,next);}
        if(performance.now()-last>12){await breathe();if(ticket!==bodySerial||signal.aborted)return;}
        const links=new Map();
        for(const node of visible)for(const heading of node.querySelectorAll(".ve-rd__h--1,.ve-rd__h--2")){
            const label=heading.querySelector(".entry-title-inner");if(!label||heading.closest("[hidden]"))continue;
            const link=button("class-outline-link",label.textContent.trim().replace(/^等级\s*\d+\s*[:：]\s*/,""),()=>jump(label));newOutline.append(link);links.set(heading,link);
        }
        outline.replaceChildren(newOutline);
        observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){
            const current=outline.querySelector(".current"),link=links.get(e.target);
            current?.classList.remove("current");current?.removeAttribute("aria-current");
            link?.classList.add("current");link?.setAttribute("aria-current","location");}},{root,rootMargin:"0px 0px -65%"});
        for(const h of links.keys())observer.observe(h);
    }
    signal.addEventListener("abort",()=>observer?.disconnect(),{once:true});
    async function paintSelection(){
        const seq=++serial,active=card.subs.filter(s=>selected.has(s.k));
        const packs=await Promise.all(active.map(sc=>get(ctx,sc.body)));
        if(seq!==serial||signal.aborted)return;

        table.classList.toggle("n4-has-sc",!!active.length);
        for(const c of table.querySelectorAll("[data-table-owner]")){c.classList.remove("ve-hidden");c.hidden=!selected.has(c.dataset.tableOwner);}
        const groupRow=table.rows[2];
        if(groupRow && !groupRow.querySelector("td"))groupRow.classList.toggle("class-empty-group",![...groupRow.cells].some(c=>!c.hidden&&!c.classList.contains("ve-hidden")&&!c.classList.contains("ve-cls-tbl__cell-spell-points")&&c.textContent.trim()));
        for(const n of table.querySelectorAll(".n4-scfs"))n.remove();
        for(const sc of active)for(const f of sc.features){
            const cell=levels.get(f.l);if(!cell)continue;
            let box=cell.querySelector(".n4-scfs");if(!box){box=element("span","n4-scfs");cell.append(box);}
            const chip=button("n4-scf"+(f.replaced?" bk-sc-replaced":""),"",()=>jump(body.querySelector('[data-ours-sc-title="'+CSS.escape(f.k)+'"]')));
            chip.dataset.g=sc.group;chip.dataset.titleKey=f.k;if(active.length>1)chip.append(element("i","n4-scf__of",sc.short));
            chip.append(element("span","bk-sc-chip-name",f.n));if(f.marker)chip.append(element("span","bk-sc-chip-level",f.marker));box.append(chip);
        }
        allRows=[...base,...packs.flatMap((pack,i)=>pack.map(r=>({...r,sc:active[i].k})))].sort((a,b)=>a.i-b.i);
        await paintBody();if(seq!==serial||signal.aborted)return;
        for(const chip of table.querySelectorAll(".n4-scf")){
            const marker=body.querySelector('[data-ours-sc-title="'+CSS.escape(chip.dataset.titleKey)+'"]');
            chip.hidden=!marker||!!marker.closest("[hidden]");
        }
        const omitted=new Set(base.filter(r=>r.id&&(!sourceAllowed(r.source)||r.variant&&!show.variant)).map(r=>r.id));
        for(const a of table.querySelectorAll(".ve-inline-block a")){
            const id=a.hash?.match(/feature=s(\d+--?\d+)/)?.[1];
            a.parentElement.hidden=!!id&&omitted.has(id);
        }
        layout.dataset.ready=cls.h;layout.dataset.selection=[...selected].join("~");
    }
    table.addEventListener("click",e=>{
        const a=e.target.closest("a");if(!a)return;
        const match=a.hash.match(/feature=s(\d+--?\d+)/);
        if(match){e.preventDefault();jump(body.querySelector('[data-scroll-id="'+match[1]+'"]'));}
    });
    document.addEventListener("click",e=>{if(dialog&&!e.target.closest(".n4-pop,.n4-browse"))close();},{signal});
    paintPins();await paintSelection();if(signal.aborted)return;
    for(const view of ["isviewactivesccomp","isviewactivebook"])if(params.get(view)==="b1")showView(view,false);
    const url=new URL(location.href),feature=url.searchParams.get("ours-feature"),titleKey=url.searchParams.get("title");
    const rowId=params.get("feature")?.slice(1);
    let target=titleKey?body.querySelector('[data-ours-sc-title="'+CSS.escape(titleKey)+'"]'):null;
    if(feature){
        const [name,,,sub,source]=feature.split("_").map(searchText),subclass=url.searchParams.get("ours-feature-kind")==="subclassfeature";
        const key=subclass?card.subs.find(s=>searchText(s.short)===sub&&searchText(s.s)===source)?.k:null;
        const matches=[...body.querySelectorAll(".entry-title-inner")].filter(e=>!key||e.closest("[data-sub]")?.dataset.sub===key);
        const normalized=e=>{
            const prefix=e.querySelector("[data-subclass-name-prefix]")?.textContent||"";
            return searchText(e.textContent.trimStart().slice(prefix.length)).replace(/^等级\s*\d+\s*[:：]\s*/,"").replace(/[.。]$/,"");
        };
        const nameMatch=e=>normalized(e)===name||normalized(e).startsWith(name+" ")||normalized(e).startsWith(name+"（");
        target=matches.find(nameMatch)||matches.find(e=>normalized(e).includes(name))||target;
        if(target)target.dataset.oursSearchTarget=feature;
    }
    if(!target&&rowId)target=body.querySelector('[data-scroll-id="'+CSS.escape(rowId)+'"]');
    if(target)jump(target,false);else if(history.state?.classScroll)root.scrollTop=history.state.classScroll;
    root.addEventListener("scroll",()=>history.replaceState({...history.state,classScroll:root.scrollTop},""),{signal,passive:true});
}
