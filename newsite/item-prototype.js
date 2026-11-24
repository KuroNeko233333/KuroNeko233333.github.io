import {rarityName} from "./item-filters.js";

const collator=new Intl.Collator("zh-Hans-CN-u-co-pinyin",{numeric:true,sensitivity:"base"});
const rarities=["none","common","uncommon","rare","very rare","legendary","artifact"];
const normalize=s=>s.toLowerCase().replaceAll("火舌","焰舌");
const nameKey=s=>normalize(s).replace(/\s+/g,"");
const variantEnglish=(generic,base)=>generic && base && generic!==base ? generic+" "+base : "";

export function variantNames(catalog,groups){
    const names=new Map();
    for(const [parent,members,summary] of groups){
        const generic=summary?.english || catalog.rows[parent].e;
        for(const [i] of members){
            const {n,e}=catalog.rows[i];
            const english=variantEnglish(generic,e);
            for(const name of new Set([n,english].filter(Boolean).map(nameKey))){
                if(!names.has(name))names.set(name,[]);
                names.get(name).push([i,english]);
            }
        }
    }
    return names;
}

export function exactVariantNames(names,query){
    return names.get(nameKey(query.split(/\s+(?:source|in|page):/i,1)[0])) || [];
}

export function prototypeBookmark(hash){
    try{
        const decoded=decodeURIComponent(hash);
        if(decoded.startsWith("火舌"))return encodeURIComponent(decoded.replace(/^火舌/,"焰舌")).toLowerCase();
    }catch{}
    return hash;
}

let worker, requestId=0;
const pending=new Map(), cache=new Map(), prepared=new Map();
function request(url,terms) {
    worker ||= new Worker(new URL("./item-effect-worker.js",import.meta.url));
    worker.onmessage=({data:{id,found,fields,effect,error}})=>{
        const entry=pending.get(id);
        if(!entry)return;
        pending.delete(id);
        if(error)entry.reject(new Error(error));else entry.resolve({hits:new Map(found),fields:new Map(fields),effect});
    };
    worker.onerror=event=>{
        for(const entry of pending.values())entry.reject(new Error(event.message));
        pending.clear();prepared.clear();worker.terminate();worker=null;
    };
    const id=++requestId;
    return new Promise((resolve,reject)=>{
        pending.set(id,{resolve,reject});worker.postMessage({id,url,terms});
    });
}

export function warmEffects(url){
    if(!prepared.has(url))prepared.set(url,request(url).catch(error=>{prepared.delete(url);throw error;}));
    return prepared.get(url);
}

export function makeItemPrototype(catalog, groups, url) {
    const groupByMember=new Map(), definitions=new Map(), summaries=new Map(), combined=new Map();
    const names=catalog.rows.map(({n,e})=>normalize(n+" "+e));
    for(const [parent, children, summary] of groups){
        definitions.set(parent,children);
        if(summary)summaries.set(parent,summary);
        groupByMember.set(parent,parent);
        for(const [id] of children){
            groupByMember.set(id,parent);
            const english=variantEnglish(summary?.english || catalog.rows[parent].e,catalog.rows[id].e);
            if(english){combined.set(id,normalize(english));names[id]+=" "+combined.get(id);}
        }
    }
    return {catalog,groupByMember,definitions,summaries,names,combined,url};
}

export function findEffects(proto,terms){
    if(!terms.length)return Promise.resolve({hits:new Map(),fields:new Map()});
    const key=JSON.stringify([proto.url,terms]);
    if(!cache.has(key)){
        cache.set(key,request(proto.url,terms).catch(error=>{cache.delete(key);throw error;}));
        if(cache.size>12)cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
}

function hasName(text,word){
    if(word!=="ac")return text.includes(word);
    return /(?:^|[^a-z])ac(?:$|[^a-z])/.test(text);
}

export function groupItems(proto,eligible,terms,{hits,fields,effect},catalogSort=true) {
    const {groupByMember,definitions,summaries,names,combined,catalog}=proto;
    const words=terms.map(normalize),query=words.join(" ");
    const byGroup=new Map();
    for(let position=0;position<eligible.length;position++){
        const i=eligible[position];
        const parent=groupByMember.get(i) ?? i;
        let group=byGroup.get(parent);
        if(!group)byGroup.set(parent,group={parent,first:i,target:i,ids:[],rank:Infinity});
        group.ids.push(i);
        const summary=summaries.get(parent);
        let ownName=false,genericName=false;
        let rank,hit,target=i,fromBase=false;
        if(effect){
            const common=fields.get(summary ? ~parent : parent);
            const fitted=fields.get(i);
            hit=common || fitted || hits.get(parent);
            if(!hit){
                const item=catalog.rows[i];
                const mark=effect.words.find(word=>hasName(normalize(item.n),word));
                if(mark){
                    const offset=normalize(item.n).indexOf(mark);
                    hit=[3,"",item.n,[[offset,offset+mark.length]]];
                }
            }
            rank=hit?.[0] ?? Infinity;
            fromBase=rank===0 && !common && (parent!==i || !!summary);
            if(!fromBase)target=parent;
        }else{
            const parentName=summary ? normalize(summary.name+" "+summary.english) : names[parent];
            ownName=words.every(word=>hasName(names[i],word));
            genericName=parent!==i && words.every(word=>hasName(parentName,word));
            hit=hits.get(parent);
            rank=!words.length || ownName || genericName ? 0 : hit?.[0] ?? Infinity;
            if(rank===0)hit=null;
        }
        if(rank===Infinity)continue;
        const exact=!effect && ownName && query && (combined.get(i)===query ||
            [catalog.rows[i].n,catalog.rows[i].e].some(name=>normalize(name)===query));
        const score=effect ? Number(!fromBase) : Number(rank===0 && !!exact);
        if(rank<group.rank)group.order=position;
        if(rank<group.rank || (rank===group.rank && score>group.score)){
            group.rank=rank;group.target=target;group.score=score;group.effect=hit;group.fromBase=fromBase;
        }
        if(!effect && rank===0 && genericName && !ownName && !group.score)group.target=parent;
    }
    const groups=new Map(),aliases=new Map(),entries=[],ranks=[[],[],[],[],[]];
    for(const group of byGroup.values()){
        if(group.rank===Infinity)continue;
        const def=definitions.get(group.parent);
        if(def){
            const members=new Set(group.ids);
            group.options=def.filter(([i])=>members.has(i));
            if(group.options.length){
                group.summary=countTypes(group.options);
                const values=[...new Set(group.options.map(([i])=>catalog.rows[i].rarity))];
                values.sort((a,b)=>(rarities.indexOf(a)<0?99:rarities.indexOf(a))-(rarities.indexOf(b)<0?99:rarities.indexOf(b)));
                group.rarity=(values.length>1 && values.every(value=>rarities.includes(value)) ? [values[0],values.at(-1)] : values).map(rarityName).join("～");
                group.form=summaries.get(group.parent);
                if(effect){
                    group.generic=!!group.form && !group.fromBase;
                    if(group.fromBase)group.baseEvidence=group.options.find(([id])=>id===group.target)?.[1];
                }else{
                    const genericName=group.form ? normalize(group.form.name+" "+group.form.english) : names[group.parent];
                    if(!words.length || group.rank>0 || words.every(word=>hasName(genericName,word))){
                        group.target=group.parent;group.generic=!!group.form;
                    }
                }
            }
        }
        const id=group.first;
        groups.set(id,group);
        for(const i of group.ids)aliases.set(i,id);
        if(group.options?.length)aliases.set(group.parent,id);
        ranks[group.rank].push(group);
    }
    const layer=group=>catalog.sources[catalog.rows[group.parent].s].layer;
    for(const band of ranks){
        if(words.length)band.sort((a,b)=>{
            // Effect results share one list, so the usual source layers apply
            // across the old ordinary/magic split. A definition-wide effect
            // is stronger evidence than a bonus supplied by just one base.
            if(effect && catalogSort && a.rank===0){
                const scope=Number(a.fromBase)-Number(b.fromBase);
                if(scope)return scope;
            }
            return (effect && catalogSort && a.rank<3 ? layer(a)-layer(b) : 0) || a.order-b.order;
        });
        for(const group of band)entries.push(group.first);
    }
    const mentioned=effect ? ranks[3].concat(ranks[4]).map(g=>g.first) : [];
    return {groups,aliases,entries,mentioned,effect,
        stated:effect ? ranks[0].length : 0, granted:effect ? ranks[1].length+ranks[2].length : 0};
}

function countTypes(options) {
    const types=new Map();
    for(const [,name,source,kind] of options){
        if(!types.has(kind))types.set(kind,new Set());
        types.get(kind).add(name+"|"+source);
    }
    return "可用于 "+[...types].map(([kind,values])=>values.size+" 种"+kind).join(" / ");
}

export function effectExcerpt(effect,base){
    const [,via,line,raw,field]=effect;
    if(field){
        const output=document.createElement("small");
        output.className="item-effect-hit";
        output.dataset.effectField=field;
        output.textContent=line+(base ? " · 底材："+base : "");
        output.title=output.textContent;
        return output;
    }
    const ranges=raw.slice().sort((a,b)=>a[0]-b[0] || b[1]-a[1]);
    const merged=[];
    for(const [a,b] of ranges){
        const last=merged.at(-1);
        if(last && a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);
    }
    const node=document.createElement("small");
    node.className="item-effect-hit";
    if(via)node.append("通过 "+via+"：");
    node.title=(via?"通过 "+via+"：":"")+line;
    const start=line.length<=92 ? 0 : Math.max(0,Math.min(line.length-92,merged[0][0]-19));
    const end=Math.min(line.length,Math.max(start+92,merged[0][1]));
    if(start)node.append("…");
    let from=start;
    for(const [a,b] of merged){
        if(a>=end)break;
        node.append(line.slice(from,a));
        const mark=document.createElement("mark");
        mark.textContent=line.slice(a,b);
        node.append(mark);from=b;
    }
    node.append(line.slice(from,end)+(end<line.length?"…":""));
    return node;
}

export function addVariantPicker(root,group,index,selected,generic,sourceAbbreviation,choose) {
    if(!group?.options?.length)return;
    const section=document.createElement("div");
    section.className="item-base-picker";
    const label=document.createElement("label"),select=document.createElement("select");
    label.textContent="底材";select.setAttribute("aria-label","底材");
    select.append(new Option("通用正文",group.form ? "generic" : String(group.parent)));
    const families=new Map(), names=new Map();
    for(const [i,name,source,kind,sub] of group.options){
        const title=kind===sub ? kind : kind+" · "+sub;
        if(!families.has(title))families.set(title,[]);
        families.get(title).push([i,name,source]);
        names.set(name,(names.get(name) || 0)+1);
    }
    for(const [title,options] of [...families].sort(([a],[b])=>collator.compare(a,b))){
        const optgroup=document.createElement("optgroup");optgroup.label=title;
        for(const [i,name,source] of options.sort((a,b)=>collator.compare(a[1],b[1]) || collator.compare(a[2],b[2]))){
            const option=new Option(names.get(name)>1 ? name+" · "+sourceAbbreviation(source) : name,String(i));
            option.dataset.id=index.rows[i].id;optgroup.append(option);
        }
        select.append(optgroup);
    }
    select.value=generic ? "generic" : String(selected);
    if(select.selectedIndex<0){
        const option=new Option(index.rows[selected]?.n || "当前底材",String(selected),true,true);
        option.disabled=true;select.add(option,1);
    }
    select.onchange=()=>choose(select.value==="generic" ? group.parent : Number(select.value),select.value==="generic");
    const summary=document.createElement("small");summary.textContent=group.summary;
    label.append(select);section.append(label,summary);root.prepend(section);
    if(generic || !group.form && selected===group.parent){
        for(const title of root.querySelectorAll(".entry-title-inner")){
            if(title.textContent.trim()==="基础物品 Base items.")title.closest(".ve-rd__b--named")?.remove();
        }
    }
}
