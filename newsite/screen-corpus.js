import {el,btn,input,notice} from "./screen-ui.js";
import {manifest,object} from "./screen-data.js";
import {prepareMonsterScale} from "./monster-runtime.js";

let rules;
function ruleData(){
    rules ||= fetch("../data/generated/bookref-dmscreen.json").then(r=>{
        if(!r.ok)throw Error("规则参考加载失败");return r.json();
    }).catch(error=>{rules=null;throw error;});
    return rules;
}
async function books(kind){
    const m=await manifest();
    return object(m.reading[kind]);
}
export async function corpusMenu(view,type,select){
    const search=input("搜索","",()=>{}),list=el("div","choices");search.placeholder="搜索";view.append(search,list);search.focus();
    const entries=[];
    if(type===4){
        const corpus=await ruleData();
        for(const [id,chapters] of Object.entries(corpus.data))chapters.forEach((chapter,c)=>{
            for(const entry of chapter.entries || [])if(entry.name)entries.push({name:entry.name,group:chapter.name,content:{t:type,c:{b:id,c,h:entry.name}}});
        });
    }else{
        const prop=type===13?"a":"b",kind=type===13?"adventure":"book";
        const m=await manifest(),shelf=await object(m.reading[kind==="book"?"books":"adventures"]);
        const ids=await books(kind);
        for(const row of shelf.rows ?? shelf){
            if(!ids[row.id.toLowerCase()])continue;
            entries.push({name:row.n || row.name,id:row.id,group:row.s || "",prop});
        }
        async function chapters(entry){
            const book=await object(ids[entry.id.toLowerCase()]);
            list.replaceChildren(btn("返回",update),...book.chapters.map((ch,c)=>btn(ch.name,()=>select({t:type,c:{[prop]:entry.id,c}}))));
        }
        for(const entry of entries)entry.open=()=>chapters(entry);
    }
    function update(){
        const q=search.value.toLowerCase().trim();
        list.replaceChildren(...entries.filter(r=>(r.name+" "+r.group+" "+(r.id || "")).toLowerCase().includes(q)).map(r=>btn(r.name+" · "+r.group,r.open || (()=>select(r.content)))));
    }
    search.oninput=update;update();
}
// The renderer returns card markup. Its legacy inline handlers belong to the old document.
export function renderedTable(html){
    const table=el("table","ve-w-100 ve-stats");table.innerHTML=html;
    for(const node of table.querySelectorAll("script,iframe,object,embed,style"))node.remove();
    for(const node of table.querySelectorAll("*")){
        for(const attr of [...node.attributes])if(/^on/i.test(attr.name) || attr.name==="srcdoc")node.removeAttribute(attr.name);
        if(node.dataset.packedDice){const roll=JSON.parse(node.dataset.packedDice);node.dataset.roll=roll.toRoll;node.dataset.rollEntry=JSON.stringify(roll);}
        if(node.dataset.vetPage){node.dataset.hoverPage=node.dataset.vetPage;node.dataset.hoverHash=node.dataset.vetHash;node.dataset.hoverSource=node.dataset.vetSource;}
        if(node.matches("a[href]") && !/^(https?:|mailto:)/.test(node.href))node.removeAttribute("href");
    }
    return table;
}
export async function mountCorpus(root,panel,save,signal){
    const m=await manifest(),meta=panel.c;
    if(panel.t===4){
        const corpus=await ruleData();
        const rule=corpus.data[meta.b]?.[meta.c]?.entries.find(r=>r.name===meta.h);
        if(!rule)throw Error("找不到规则："+meta.h);
        const {win}=await prepareMonsterScale(m.monsters.runtime,object);
        const article=el("article","screen-card");article.append(renderedTable(win.Renderer.rule.getCompactRenderedString(win.JSON.parse(JSON.stringify(rule)))));root.append(article);return;
    }
    const kind=panel.t===13?"adventure":"book",id=String(meta.a ?? meta.b).toLowerCase(),map=await books(kind);
    if(!map[id])throw Error("找不到书或模组："+id);
    const book=await object(map[id]),wrap=el("article","screen-chapter"),nav=el("nav","chapter-controls");
    const {media,bookEmbeds}=await import("./reading.js");
    if(signal?.aborted)return;
    root.append(wrap,nav);
    const embeds=bookEmbeds(wrap,object,signal);
    let ticket=0;
    async function go(index){
        const ch=book.chapters[index];if(!ch)return;
        const order=++ticket,parts=await object(ch.body);if(order!==ticket || signal?.aborted)return;
        const fragment=document.createDocumentFragment();
        for(const html of parts){const div=el("div","book-part");div.innerHTML=html;media(div);fragment.append(div);}
        embeds.disconnect();wrap.replaceChildren(fragment);wrap.scrollTop=0;
        wrap.querySelectorAll("[data-book-embed]").forEach(slot=>embeds.observe(slot));
        const prev=btn("Previous Chapter",()=>go(index-1),"\ue079"),next=btn("Next Chapter",()=>go(index+1),"\ue080");
        prev.disabled=!index;next.disabled=index===book.chapters.length-1;
        nav.replaceChildren(el("span","",book.chapters[index-1]?.name),prev,next,el("span","",book.chapters[index+1]?.name));
        if(meta.c!==index){meta.c=index;save();}
    }
    await go(Number(meta.c)||0);
}
