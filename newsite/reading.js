import {foldElement,entryBlocks,activeBounds,slideSelection} from "./motion.js";
import {describeTrail} from "./trail.js";
import {ownedPage} from "./option-view.js";
import {mediaUrl,tryImageMirror} from "./card-media.js";
import {showHall} from "./hall.js";
import {bookInScope,sourceSections as labels} from "./manual-sources.js";

const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const anchor=(text,href,cls)=>{const a=make("a",cls,text);a.href=href;return a;};
const button=(text,cls,fn)=>{const b=make("button",cls,text);b.type="button";b.onclick=fn;return b;};
function route(href){
    const url=new URL(href,location.href);if(url.origin!==location.origin)return url.href;
    const page=url.pathname.split("/").at(-1);
    if(!page.endsWith(".html"))return url.href;
    return new URL((ownedPage(page.slice(0,-5))?"":"../")+page+url.search+url.hash,location.href).href;
}
export function media(container){
    for(const img of container.querySelectorAll("img[src]")){
        const src=img.getAttribute("src");img.src=mediaUrl(src.startsWith("/")?".."+src:src);
        img.addEventListener("error",()=>tryImageMirror(img),{once:true});
    }
    for(const a of container.querySelectorAll("a[href]"))a.href=route(a.getAttribute("href"));
}
export function bookEmbeds(scroller,object,signal){
    const embeds=new IntersectionObserver(entries=>{
        for(const {target,isIntersecting} of entries)if(isIntersecting){
            embeds.unobserve(target);
            object(target.dataset.bookEmbed).then(html=>{
                if(signal?.aborted || !target.isConnected)return;
                target.innerHTML=html;media(target);
                const header=target.querySelector(".ve-rd__data-embed-header");
                if(header)header.onclick=()=>{
                    const panel=target.querySelector(".ve-rd__wrp-embedded-data-table");
                    panel?.classList.toggle("expanded");header.setAttribute("aria-expanded",String(panel?.classList.contains("expanded")));
                };
            }).catch(()=>{const retry=button("重新读取卡片",null,()=>{retry.remove();embeds.observe(target);});target.append(retry);});
        }
    },{root:scroller,rootMargin:"160px"});
    signal?.addEventListener("abort",()=>embeds.disconnect(),{once:true});
    return embeds;
}
function memo(k,v){history.replaceState({...history.state,[k]:v},"");}
function shelf(ctx,rows){
    const {root,kind,signal}=ctx;
    const section=make("div","bk5"),head=make("div","bk5-head"),count=make("span","bk5-n"),wrap=make("label","bk5-search");
    const search=make("input","shelf-query");search.type="search";search.placeholder="搜索书名…";
    search.value=history.state?.shelfQuery || "";wrap.append(search);head.append(make("h1","bk5-title",kind==="books"?"书库":"冒险模组"),count,wrap);
    const chips=make("div","bk5-chips motion-segments"),groups=make("div","bk5-sections");
    section.append(head,chips,groups);root.replaceChildren(section);
    const covers=new WeakMap();
    const observer=new IntersectionObserver(entries=>{
        for(const {target,isIntersecting} of entries){
            if(!isIntersecting || !target.isConnected)continue;
            observer.unobserve(target);
            const template=document.createElement("template");template.innerHTML=covers.get(target);
            const card=template.content.firstElementChild;media(card);target.replaceChildren(...card.childNodes);
            target.classList.remove("pending-cover");
        }
    },{root,rootMargin:"90px"});
    signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
    let selected=history.state?.shelfSection || "";
    function paint(){
        const q=search.value.trim().toLowerCase();
        const visible=rows.filter(b=>bookInScope(b,ctx)
            && [b.n,b.e,b.s].some(v=>v?.toLowerCase().includes(q)));
        const by=Map.groupBy(visible,r=>r.section);
        if(!by.has(selected))selected="";
        const draw=(key,label,n)=>{const b=button(label,"bk5-chip"+(selected===key?" on":""),()=>{
            const from=activeBounds(chips,".on");selected=key;memo("shelfSection",key);paint();slideSelection(chips,from,chips.querySelector(".on"));
        });
            b.dataset.sec=key;b.setAttribute("aria-pressed",String(selected===key));b.append(make("b",null,n));return b;};
        observer.disconnect();chips.replaceChildren(draw("","全部",visible.length));groups.replaceChildren();
        for(const [key,label] of Object.entries(labels)){
            const set=by.get(key);if(!set?.length)continue;
            chips.append(draw(key,label,set.length));if(selected && selected!==key)continue;
            const sec=make("section","bk5-sec"),title=make("h2","bk5-h",label),s=make("div","bk5-shelf");
            title.append(make("span",null,set.length+" 本"));sec.dataset.sec=key;
            for(const book of set){
                const card=anchor("",(kind==="books"?"book":"adventure")+".html#"+book.id,"bk5-book pending-cover");
                card.setAttribute("aria-label",book.n);covers.set(card,book.html);s.append(card);observer.observe(card);
            }
            sec.append(title,s);groups.append(sec);
        }
        count.textContent=(selected?by.get(selected).length:visible.length)+" 本";
    }
    search.oninput=()=>{memo("shelfQuery",search.value);paint();};paint();
}
const pause=()=>globalThis.scheduler?.yield ? scheduler.yield() : new Promise(done=>setTimeout(done,0));
const decoded=s=>{try{return decodeURIComponent(s);}catch{return s;}};
function bookSearch(ctx,book,toc,crumbs){
    let worker,seq=0;const input=make("input","reader-query");input.type="search";input.placeholder="整书查找";input.setAttribute("aria-label","整书查找");
    const status=make("p","find-count"),result=make("div","reader-results");toc.append(input,status,result);
    input.hidden=true;
    const open=()=>{input.hidden=false;input.focus();};crumbs.append(button("整书查找",null,open));
    let values=[],offset=0;
    function more(){
        const page=values.slice(offset,offset+40);offset+=page.length;
        for(const [c,h,line,i] of page){const url=new URL(location.href);url.searchParams.set("findrow",i);url.hash=book.id+","+c+(h?","+h:"");result.append(anchor(book.chapters[c].name+" · "+line,url.href));}
        if(offset<values.length){const b=button("更多结果",null,()=>{b.remove();more();});result.append(b);}
    }
    input.oninput=()=>{
        result.replaceChildren();status.textContent="";const id=++seq;if(!input.value.trim())return;
        worker ||= new Worker(new URL("./book-search-worker.js",import.meta.url));
        worker.onmessage=({data})=>{if(seq!==data.id)return;
            if(data.error){status.textContent=data.error;return;}
            values=data.results;offset=0;status.textContent=values.length+" 处结果";more();};
        const src=new URL("data/objects/"+book.search+".json"+(ctx.manifest.objectEncoding==="gzip"?".gz":""),location.href).href;
        worker.postMessage({id,src,query:input.value});
    };
    document.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="f" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.matches("input,textarea")){e.preventDefault();open();}},{signal:ctx.signal});
    ctx.signal.addEventListener("abort",()=>worker?.terminate(),{once:true});
}
let lastChapter;
async function reader(ctx){
    const {root,kind,object,manifest,signal}=ctx,ids=await object(manifest.reading[kind]);
    const [idArg,chapterArg,...rest]=location.hash.slice(1).split(",");
    const id=(idArg || (kind==="quickreference"?"bookref-quick":"")).toLowerCase(),shelfName=kind==="adventure"?"adventures":"books";
    if(!ids[id]){
        if(signal.aborted)return;root.replaceChildren(anchor(id?"本书未收录，返回书库":"选择要读的书",shelfName+".html"));return;
    }
    const book=await object(ids[id]);if(signal.aborted)return;
    const full=chapterArg==="-1";let c=Math.max(0,Math.min(Number(chapterArg)||0,book.chapters.length-1));
    let requested=rest.filter(x=>!/^page:/i.test(x)).join(",");
    const pageKey=[chapterArg,...rest].find(x=>/^page:/i.test(x||""));
    let pageHit;
    if(pageKey && /^\d+$/.test(pageKey.slice(5))){
        const wanted=Number(pageKey.slice(5));let below=-Infinity,above=Infinity;
        for(const ch of book.chapters)for(const key of Object.keys(ch.pages||{})){
            const n=Number(key);if(n<=wanted)below=Math.max(below,n);if(n>=wanted)above=Math.min(above,n);
        }
        // BookUtil checks the nearest lower and upper page within each chapter, in book order.
        for(const [i,ch] of book.chapters.entries()){
            pageHit=[below,above].find(n=>Number.isFinite(n) && Object.hasOwn(ch.pages||{},n));
            if(pageHit!==undefined){c=i;requested=ch.pages[pageHit]||"";break;}
        }
    }
    if(full && requested){const ci=book.chapters.findIndex(ch=>ch.headers.some(h=>h.hash===requested));if(ci>=0)c=ci;}
    const ch=book.chapters[c],frame=make("div","reader-layout"),toc=make("aside","reader-toc"),scroller=make("div","reader-scroll");
    const crumbs=make("div","bk5-crumbs"),section=make("span","bk5-crumbs__sec"),article=make("article","bk5-doc"),pn=make("div","bk5-pn");
    toc.append(anchor(kind==="adventure"?"← 冒险模组":"← 书库",shelfName+".html"));
    const abv=ctx.sourceAbbreviation(book.s);
    const head=make("div","bk5-tochead"),icon=make("span","bk5-tochead__gen",abv),title=make("span","bk5-tochead__t",book.n);
    const tree=make("div","reader-chapters");
    let treeOpen=true;
    const collapse=button("▾","bk5-car open",()=>{treeOpen=!treeOpen;foldElement(tree,treeOpen);collapse.classList.toggle("open",treeOpen);});
    collapse.setAttribute("aria-pressed","true");
    collapse.addEventListener("click",()=>collapse.setAttribute("aria-pressed",String(treeOpen)));
    head.append(collapse,icon,title,make("small","bk5-tochead__s",abv+" · "+(book.listedCount ?? book.chapters.length)+" 章"));toc.append(head);
    if(kind!=="quickreference"){
        object(manifest.reading[shelfName]).then(rows=>{if(signal.aborted)return;
            const row=rows.find(b=>b.id===id);if(!row)return;
            const template=document.createElement("template");template.innerHTML=row.html;
            const src=template.content.querySelector("img")?.getAttribute("src");
            if(src){const img=make("img","bk5-tochead__img");img.src=mediaUrl(src);icon.replaceWith(img);}
            else{const gen=template.content.querySelector(".bk5-gen");if(gen){icon.style.cssText=gen.style.cssText;icon.textContent=abv;}}
        }).catch(()=>{});
    }
    toc.append(tree);
    const base="#"+id+",",links=new Map();
    const plain=document.createElement("template");
    for(const ch of book.chapters){if(ch.label.includes("<")){plain.innerHTML=ch.label;ch.label=plain.content.textContent;}}
    book.chapters.slice(0,book.listedCount ?? book.chapters.length).forEach((row,i)=>{
        const line=make("div","reader-chapter"),head=make("div",i===c?"bk5-cur":"");
        const children=make("div","reader-headings");
        function expand(open,animate=false){
            toggle.classList.toggle("open",open);toggle.setAttribute("aria-expanded",String(open));
            if(open && !children.childElementCount)for(const h of row.headers){
                const a=anchor(h.text,base+i+","+h.hash);a.dataset.header=h.text;
                if(h.depth)a.style.paddingLeft="1.4em";children.append(a);if(i===c)links.set(h.hash.toLowerCase(),a);
            }
            if(animate)foldElement(children,open);else children.hidden=!open;
        }
        const toggle=button("▸","bk5-car",()=>expand(toggle.getAttribute("aria-expanded")!=="true",true));toggle.setAttribute("aria-label","展开或收起目录");
        const chapter=anchor(row.label,base+i);
        if(i===c)chapter.setAttribute("aria-current","page");
        head.append(toggle,chapter);line.append(head,children);tree.append(line);expand(i===c || kind==="quickreference");
    });
    const current=make("span","bk5-crumbs__ch",ch?.label);
    crumbs.append(anchor(book.n,"#"+id,"bk5-crumbs__book")," › ",current," › ",section,make("span","bk5-crumbs__sp"),anchor(full?"按章阅读":"查看完整书籍",base+(full?c:-1)));
    bookSearch(ctx,book,toc,crumbs);toc.insertBefore(toc.querySelector(".reader-query"),tree);toc.insertBefore(toc.querySelector(".find-count"),tree);toc.insertBefore(toc.querySelector(".reader-results"),tree);
    scroller.append(crumbs,article,pn);frame.append(toc,scroller);root.replaceChildren(frame);
    const identity=kind+"#"+id+","+c;
    if(!ch?.body){
        article.textContent="书库中只有本章目录。";
        describeTrail(kind,ch?.label || book.n,book.e || "",identity,book.n);
        return;
    }
    const embeds=bookEmbeds(scroller,object,signal);
    async function appendChapter(ci){
        const parts=await object(book.chapters[ci].body);if(signal.aborted)return;
        const wrap=make("section","book-chapter");wrap.dataset.chapter=ci;article.append(wrap);
        let last=performance.now();
        for(const html of parts){
            const part=make("div","book-part");part.innerHTML=html;media(part);wrap.append(part);
            for(const slot of part.querySelectorAll("[data-book-embed]"))embeds.observe(slot);
            if(performance.now()-last>6){await pause();if(signal.aborted)return;last=performance.now();}
        }
        return wrap;
    }
    const wrap=await appendChapter(c);if(!wrap || signal.aborted)return;
    let active;
    const targets=new Map(),positions=[],occurrences=new Map();
    for(const el of wrap.querySelectorAll("[data-heading],[data-statblock-hash]")){
        const key=el.dataset.statblockHash?"stathash-"+el.dataset.statblockHash:encodeURIComponent(el.dataset.heading.trim().toLowerCase()).toLowerCase();
        const n=occurrences.get(key)||0;occurrences.set(key,n+1);el.dataset.occurrence=String(n);targets.set(key+(n?","+n:""),el);
        const link=links.get(key+(n?","+n:""));if(link)positions.push({el,link});
    }
    function highlight(link){
        if(active===link)return;
        active?.classList.remove("bk5-cur-sec");active=link;link?.classList.add("bk5-cur-sec");
        section.textContent=link?.dataset.header||"";
        if(link){
            const bounds=toc.getBoundingClientRect(),row=link.getBoundingClientRect();
            if(row.top<bounds.top || row.bottom>bounds.bottom)toc.scrollTop+=row.top-bounds.top-bounds.height/3;
        }
    }
    const req=requested.toLowerCase().replace(/,0$/,"");let target=targets.get(req);
    if(!target && req)target=[...targets].find(([key])=>decoded(key)===decoded(req))?.[1];
    if(pageHit!==undefined && req){
        const same=[...targets].filter(([key])=>key.replace(/,\d+$/,"")===req);
        const matching=same.find(([,el])=>el.querySelector(".ve-rd__title-link")?.textContent.trim()===("p"+pageHit));
        if(matching)target=matching[1];
    }
    const pos=new URL(location.href).searchParams.get("findrow");
    if(pos!==null){const hits=[...wrap.querySelectorAll(".ve-rd__h,p,tr,caption,li,figcaption")].filter(el=>(el.matches("tr") || !el.querySelector("p,tr,li")) && el.textContent.trim());target=hits[Number(pos)] || target;}
    if(target){
        // Resolve layout before jumping over intrinsically sized chapter fragments.
        const part=target.closest(".book-part");
        for(let node=part;node;node=node.previousElementSibling)node.classList.add("laid-out");
        target.scrollIntoView({block:"start"});highlight(links.get(req));
    }
    else if(!pageKey)scroller.scrollTop=history.state?.readerTop || 0;
    let ticking=false;
    scroller.onscroll=()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{
        ticking=false;if(signal.aborted)return;memo("readerTop",scroller.scrollTop);
        const top=crumbs.getBoundingClientRect().bottom+25;let lo=0,hi=positions.length;
        while(lo<hi){const mid=(lo+hi)>>1;if(positions[mid].el.getBoundingClientRect().top<=top)lo=mid+1;else hi=mid;}
        if(lo)highlight(positions[lo-1].link);
    });};
    for(const [i,cls,label] of [[c-1,"prev","← 上一章"],[c+1,"next","下一章 →"]]){
        if(!book.chapters[i]){pn.append(make("span"));continue;}
        const a=anchor("",base+i,"bk5-pn__"+cls);a.append(make("small",null,label),make("span",null,book.chapters[i].label));pn.append(a);
    }
    if(pos!==null){const u=new URL(location.href);u.searchParams.delete("findrow");history.replaceState(history.state,"",u);}
    if(full && c+1<book.chapters.length){
        pn.replaceChildren();const end=make("div","reader-end");scroller.append(end);let next=c+1;
        const io=new IntersectionObserver(async es=>{if(!es.some(e=>e.isIntersecting))return;io.unobserve(end);
            if(next<book.chapters.length)await appendChapter(next++);if(!signal.aborted && next<book.chapters.length)io.observe(end);
        },{root:scroller,rootMargin:"300px"});io.observe(end);signal.addEventListener("abort",()=>io.disconnect(),{once:true});
    }
    article.dataset.chapter=c;
    if(pageHit!==undefined){
        const url=new URL(location.href);
        url.hash=id+","+c+(requested?","+requested+","+(target?.dataset.occurrence||"0"):"");
        history.replaceState(history.state,"",url);
    }
    describeTrail(kind,ch.label,book.e || "",identity,book.n);
    if(lastChapter && lastChapter!==identity)entryBlocks(wrap);
    lastChapter=identity;
}
export async function show(ctx){
    const {root,kind,manifest,object,signal}=ctx;
    if(kind==="dmscreen"){
        const {showScreen}=await import("./dmscreen.js");
        if(!signal.aborted)await showScreen(ctx);
        return;
    }
    if(kind==="statgen"){
        let scope=["all","manual"].includes(ctx.mode)?"all":"rec";
        // Statgen used the separate rules-style preference, even when the shell was showing 5e.
        try{
            if(JSON.parse(localStorage.getItem("config"))?.styleSwitcher?.style==="classic" && manifest.statgen["classic-"+scope])scope="classic-"+scope;
        }catch{/* Retain the legacy default when preferences are unreadable. */}
        const [{showStatgen},data]=await Promise.all([import("./statgen.js"),object(manifest.statgen[scope])]);
        if(!signal.aborted)await showStatgen({...ctx,data});
        return;
    }
    if(kind==="crcalculator"){
        const [{showCr},rules]=await Promise.all([import("./cr-calculator.js"),object(manifest.tools)]);
        if(!signal.aborted){root.scrollTop=0;showCr(root,rules);}return;
    }
    if(kind==="classes"){
        const {showClasses}=await import("./class-page.js");
        if(!signal.aborted)await showClasses(ctx,media);return;
    }
    root.replaceChildren();root.scrollTop=0;
    if(["book","adventure","quickreference"].includes(kind))return reader(ctx);
    if(kind==="terms"){
        const {showTerms}=await import("./terms.js");if(!signal.aborted)await showTerms(ctx);return;
    }
    if(kind==="search"){
        const box=make("div","bk5");box.append(make("h1","bk5-title","全站搜索"));
        box.append(button("搜索",null,()=>document.getElementById("sbsearch").click()));root.append(box);
        document.getElementById("global-query").value=new URLSearchParams(location.search).get("q") || decoded(location.hash.slice(1));
        document.getElementById("sbsearch").click();return;
    }
    const data=await object(manifest.reading[kind]);if(signal.aborted)return;
    if(kind==="index")showHall(root,data,route,signal);
    else if(kind==="library"){
        const {showLibrary}=await import("./source-library.js");
        if(!signal.aborted)showLibrary(root,data,await object(manifest.reading.index),signal);
    }else shelf(ctx,data);
}
