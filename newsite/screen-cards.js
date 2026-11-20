import {manifest,object,objectPath,scaleScreenMonster} from "./screen-data.js";
import {createSearchClient} from "./search-worker.js";
import {el,input,btn,notice,dialog} from "./screen-ui.js";
let search;
export async function activateNote(field){
    if(field.selectionStart!==field.selectionEnd)return;
    const token=[...field.value.matchAll(/\[\[([^\[\]]+)\]\]|\{@(\w+)\s+([^{}]+)\}/g)].find(m=>m.index<field.selectionStart && field.selectionStart<=m.index+m[0].length);
    if(!token)return;
    if(token[1]){
        const {rollDice}=await import("./screen-data.js");
        notice(token[1]+" = "+await rollDice(token[1]));return;
    }
    const [name,source]=token[3].split("|");
    if(token[2]==="link"){
        const url=new URL(source || name,location.href);
        if(["https:","http:"].includes(url.protocol))window.open(url,"_blank","noopener");return;
    }
    const m=await manifest(),meta=await object(m.monsters.searchMeta);
    const tag=token[2]==="creature"?"monster":token[2].toLowerCase();
    const page=Object.values(meta.categories).find(([,prop])=>prop?.toLowerCase()===tag)?.[2];
    if(!page){notice("未找到这个内容标签");return;}
    const scope=page==="bestiary.html"?m.monsters:page==="items.html"?m:m.pages[page.replace(".html","")];
    if(!scope?.catalogs?.full){notice("请在完整旧帷幕中打开这个标签");return;}
    const cat=await object(scope.catalogs.full);
    const preferred=source || ({monster:"MM",spell:"PHB",item:"DMG",race:"PHB",feat:"PHB",background:"PHB"})[tag];
    const rows=cat.rows.filter(r=>[r.n,r.e].some(v=>v?.toLowerCase()===name.trim().toLowerCase()));
    const row=rows.find(r=>r.s.toLowerCase()===preferred?.trim().toLowerCase()) || (!source && rows[0]);
    if(!row){notice("找不到条目："+name);return;}
    const {body}=dialog(row.n);await mountCard(body,{c:{p:page,u:row.h}});
}
function shard(key) {
    let n=2166136261;
    for(const byte of new TextEncoder().encode(key)) n=Math.imul(n^byte,16777619);
    return n & 255;
}
async function lookupCard(page,hash) {
    const m=await manifest(),key=page+"#"+hash;
    const mPage=page==="items.html"?m:page==="bestiary.html"?m.monsters:m.pages[page.replace(".html","")];
    const digest=mPage?.bookmarks?.full?.[shard(hash)];
    const match=digest && (await object(digest))[hash];
    if(match && m.screenCards){
        const patches=await object(m.screenCards),pack=patches[match[1]];
        if(pack){
            const [cards,patch]=await Promise.all([object(match[1]),object(pack)]);
            if(patch[match[0]]){
                const card=cards[match[0]];
                return {card,html:await unpackCompact(card.html,patch[match[0]])};
            }
        }
    }
    const slice=shard(key);
    for(const digest of new Set([mPage,m,m.monsters,...Object.values(m.pages)].map(t=>t?.previews?.[slice]).filter(Boolean))) {
        const compact=(await object(digest))[key];
        if(compact)return {html:compact,card:{}};
    }
    const card=match && (await object(match[1]))[match[0]];
    return card?{card,html:card.html}:null;
}
export async function cardHtml(page,hash){return (await lookupCard(page,hash))?.html;}
async function unpackCompact(fullHtml,encoded) {
    // Prepend a non-final stored DEFLATE block with the dictionary used by the builder.
    // The browser can then inflate the standard stream without an extra compression library.
    const dictionary=new TextEncoder().encode(fullHtml).slice(-32768);
    const n=dictionary.length, header=Uint8Array.of(0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);
    const delta=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const stream=new Blob([header,dictionary,delta]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    return new TextDecoder().decode(bytes.subarray(n));
}
export function cardSearch(body,select) {
    const query=input("搜索条目","",()=>{}),results=el("div","choices");query.placeholder="搜索条目";
    body.append(query,results);query.focus();
    let seq=0;
    query.oninput=async()=>{
        const ticket=++seq, text=query.value.trim();results.replaceChildren();if(!text)return;
        try{
            const m=await manifest(),meta=await object(m.monsters.searchMeta);
            search ||= createSearchClient({workerUrl:new URL("search-worker.js",import.meta.url),indexUrl:new URL(objectPath(m,m.search),import.meta.url).href});
            const labels={},props={};
            for(const [id,[label,prop]] of Object.entries(meta.categories)){labels[id]=label;props[id]=prop;}
            const found=await search("search",text,{labels,props,categories:[],sources:meta.sources,mode:"all",brew:true,ua:true,legacy:true,partnered:"all",window:{offset:0,size:75}});
            if(ticket!==seq)return;
            for(const {doc} of found.items){
                const p=meta.categories[doc.c]?.[2];if(!p || !doc.h)continue;
                results.append(btn((doc.cn||doc.n)+" · "+doc.s,()=>select({t:1,c:{p,s:doc.s,u:doc.uh||doc.u}})));
            }
        }catch(e){notice(e.message);}
    };
}
export async function mountCard(root,card) {
    const {p,u}=card.c,href=/^[a-z]+\.html$/.test(p)?p+"#"+u:null;
    if(!href)throw Error("未知条目地址");
    let result=await lookupCard(p,u);
    if(result?.card?.model && [7,71,72].includes(card.t))result=await scaledPanel(result.card,card.c);
    const link=el("a","","打开条目");link.href=href;
    if(result){
        const {decorateCard}=await import("./card-view.js");
        const content=el("article","screen-card");content.innerHTML=result.html;root.append(content);
        decorateCard(content,result.card,p.slice(0,-5),{preview:true});
        bindHeightWeight(content);
    }else{
        root.append(el("p","","这条资料还没有帷幕卡片。"));
    }
    root.append(link);
}


async function scaledPanel(card,params){
    const {prepareMonsterScale}=await import("./monster-runtime.js");
    const digest=(await manifest()).monsters.runtime;
    const {model}=await scaleScreenMonster(card,{cr:params.cr,spell:params.ssl,classLevel:params.csl},digest,object);
    const {win}=await prepareMonsterScale(digest,object);
    win.currentLegendary=card.legendary ? win.JSON.parse(JSON.stringify(card.legendary)) : null;
    const html=win.Renderer.monster.getCompactRenderedString(win.JSON.parse(JSON.stringify(model)),{
        isShowScalers:true,isScaledCr:params.cr!=null,isScaledSpellSummon:params.ssl!=null,isScaledClassSummon:params.csl!=null});
    const {renderedTable}=await import("./screen-corpus.js");
    return {card:{...card,model},html:renderedTable(html).outerHTML};
}
function bindHeightWeight(content){
    const button=content.querySelector("[data-height-weight]");if(!button)return;
    const stat=JSON.parse(button.dataset.heightWeight);
    let height,weight,busy=false;
    async function roll(part){
        if(busy)return;busy=true;
        try{
            const {rollDice}=await import("./screen-data.js");
            const both=height==null || part==="both";
            if(both || part==="height")height=await rollDice(stat.heightMod);
            if(both || part==="weight")weight=Number(stat.weightMod) || (stat.weightMod?await rollDice(stat.weightMod):1);
            const total=Number(stat.baseHeight)+height;
            const result=content.querySelector(".race__disp-result-height-weight");result.classList.remove("ve-hidden");result.hidden=false;
            content.querySelector(".race__disp-result-height").textContent=Math.floor(total/12)+"'"+(total%12?total%12+'"':"");
            content.querySelector(".race__disp-result-weight").textContent=Number(stat.baseWeight)+height*weight;
        }catch(err){notice(err.message);}finally{busy=false;}
    }
    button.onclick=()=>roll("both");
    content.querySelector("[data-height-mod]").onclick=()=>roll("height");
    content.querySelector("[data-weight-mod]").onclick=()=>roll("weight");
}
