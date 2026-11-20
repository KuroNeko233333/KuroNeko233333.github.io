import {esc,icon} from "./statgen-view.js";

const chooserNames={races:"种族",backgrounds:"背景",feats:"专长"};

const sortCols=["name","category","ability","prerequisite","source"];
const heads=["名称","分类","属性值","先决条件","来源"];
const sourceClass=source=>"ve-source__"+source.replace(/[^A-Za-z0-9_-]/g,"_");

export function openPicker({page,data,kind,filtered,anchor,category,active,select,signal,selected,renderPreview}){
    page.querySelector(".sg-picker")?.close();
    const dlg=document.createElement("dialog");
    dlg.className="sg-dialog sg-picker"+(filtered?" sg-picker-modal":" sg-picker-dropdown");
    dlg.dataset.kind=kind;
    const name=chooserNames[kind];
    const rows=data[kind];
    const facets=data.fields[kind];
    const editor=filtered&&kind!=="feats";
    const columns=filtered&&!editor;
    let index=active ?? null, sort="name", reverse=false;
    const categoryField=facets.findIndex(field=>field.label.toLowerCase()==="category");
    dlg.classList.toggle("sg-feat-picker",columns);
    dlg.innerHTML=`${filtered?`<h4>筛选/搜索 ${name}</h4>`:""}<div class="sg-picker-top">
        ${columns?`<button type="button" class="sg-btn sg-picker-facets-toggle">筛选</button>
            <button type="button" class="sg-btn sg-picker-pills-toggle" aria-label="切换筛选摘要">${icon("resize")}</button>`:""}
        <div class="sg-picker-query">
            ${columns?icon("search"):""}<input type="search" class="sg-input sg-picker-search" aria-label="搜索${name}" placeholder="${columns?"Search...":""}" spellcheck="false">
            ${columns?'<output></output>':filtered?"":icon("caret")}
        </div>
        ${filtered?'<button type="button" class="sg-btn sg-picker-reset" title="重置">重置</button>':""}
        ${editor?'<button type="button" class="sg-btn sg-xs sg-picker-close" aria-label="关闭">×</button>':""}
        </div>
        ${filtered?`<div class="sg-picker-facets"${editor?"":" hidden"}>${facets.map(({label,options},i)=>`<details${editor?" open":""}><summary>${esc(label)}</summary>
            <div>${options.map(([value,label])=>{
                const mode=selected.get(i)?.get(value)||0;
                return `<button type="button" class="sg-btn sg-xs" data-facet="${i}" data-value="${esc(value)}" data-mode="${mode}" aria-pressed="${mode!==0}">${esc(label)}</button>`;
            }).join("")}</div></details>`).join("")}</div>`:""}
        ${columns?`<div class="sg-picker-summary" hidden></div><div class="sg-picker-head"><span class="sg-btn"></span><button type="button" class="sg-btn sg-xs" data-preview-all>[+]</button>
            ${sortCols.map((key,i)=>`<button type="button" class="sg-btn sg-xs" data-sort="${key}">${heads[i]}<span class="sg-sort-caret" aria-hidden="true"></span></button>`).join("")}</div>`:""}
        <div class="sg-picker-list" role="listbox" aria-label="${name}"${editor?" hidden":""}></div>
        ${filtered?'<footer><button type="button" class="sg-btn sg-picker-confirm">确认</button></footer>':""}`;
    page.append(dlg);
    const search=dlg.querySelector("input"),list=dlg.querySelector(".sg-picker-list");
    const footer=dlg.querySelector("footer");
    const count=dlg.querySelector(".sg-picker-query output");
    const summary=dlg.querySelector(".sg-picker-summary");
    const sortButtons=dlg.querySelectorAll("[data-sort]");
    const controller=new AbortController();
    let frame=0;
    const listen={signal:controller.signal};
    const observer=new IntersectionObserver(entries=>{
        for(const {target,isIntersecting} of entries){
            if(!isIntersecting)continue;
            observer.unobserve(target);
            renderPreview(target,kind,rows[Number(target.dataset.for)].hash);
        }
    },{root:list});
    const remove=()=>{
        controller.abort();
        observer.disconnect();
        cancelAnimationFrame(frame);
        signal.removeEventListener("abort",remove);
        dlg.remove();
    };
    signal.addEventListener("abort",remove,{once:true});
    dlg.addEventListener("close",remove,{once:true});
    const collator=new Intl.Collator("zh-CN");
    const ixOrder=new Map((data.featOrder||[]).map((id,pos)=>[id,pos]));
    const entries=rows.map((e,i)=>({e,i,search:[e.name,e.english,e.source,e.shortSource,...(e.columns||[])].join(" ").toLocaleLowerCase()}));
    function showPreview(anchor,i){
        const next=anchor.nextElementSibling;
        if(next?.dataset.for===String(i)){next.remove();return;}
        const preview=document.createElement("div");
        preview.className="sg-picker-preview";
        preview.dataset.for=i;
        anchor.after(preview);
        observer.observe(preview);
    }
    function render(){
        cancelAnimationFrame(frame);
        observer.disconnect();
        const tokens=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const visible=entries.filter(({e,search:haystack})=>{
            if(!selected.has(categoryField)
                && (category==="!EB" ? e.category?.includes("EB") : category&&!category.split(",").includes(e.category)))return false;
            if(!e.visible && !selected.has(0))return false;
            if(!tokens.every(t=>haystack.includes(t)))return false;
            return Array.from(selected).every(([i,values])=>{
                const actual=e.facets[i]||[];
                const includes=[...values].filter(([,mode])=>mode===1);
                if(includes.length&&!includes.some(([v])=>actual.includes(v)))return false;
                return actual.every(v=>values.get(v)!==-1);
            });
        });
        if(columns){
            sortButtons.forEach(button=>{
                const key=button.dataset.sort;
                const label=heads[sortCols.indexOf(key)];
                button.dataset.direction=key===sort?(reverse?"desc":"asc"):"";
                button.setAttribute("aria-label",key===sort?label+(reverse?"，降序":"，升序"):label);
            });
            visible.sort((a,b)=>{
                const col=sortCols.indexOf(sort);
                const cmp=sort==="name"&&ixOrder.size ? ixOrder.get(a.i)-ixOrder.get(b.i)
                    : collator.compare(a.e.columns?.[col]||a.e.name,b.e.columns?.[col]||b.e.name);
                return (reverse?-1:1)*cmp || a.i-b.i;
            });
        }
        const html=({e,i})=>columns?`<div class="sg-picker-row" tabindex="0" data-option="${i}" data-hash="${esc(e.hash)}" role="option" aria-selected="${i===index}">
                <span><input type="radio" name="sg-feat-radio"${i===index?" checked":""} tabindex="-1" aria-hidden="true"></span>
                <div class="sg-picker-row-preview"><button type="button" data-preview="${i}" aria-label="预览 ${esc(e.name)}">[+]</button></div>
                ${(e.columns||[e.name,e.category||"—","—","—",e.shortSource]).map((val,c)=>{
                    const cls=c===4?"sg-picker-source "+sourceClass(e.source)
                        : (c===1&&!e.category || c>1&&["无","None"].includes(val))?"sg-picker-none":"";
                    return `<span class="${cls}" title="${esc(c===4?e.fullSource:c===1?e.categoryTitle:"")}">${esc(val)}</span>`;
                }).join("")}</div>`:
                `<button type="button" class="sg-picker-row" data-option="${i}" data-hash="${esc(e.hash)}" role="option" aria-selected="${i===index}">${esc(e.label)}</button>`;
        if(!editor){
            list.innerHTML=!filtered?`<button type="button" class="sg-picker-row sg-picker-empty" data-option="-1" role="option" aria-selected="${index==null}">—</button>`:"";
            delete list.dataset.complete;
            const chunkSize=72;
            function append(start){
                if(!list.isConnected)return;
                const end=start+chunkSize;
                list.insertAdjacentHTML("beforeend",visible.slice(start,end).map(html).join(""));
                if(end<visible.length)frame=requestAnimationFrame(()=>append(end));
                else list.dataset.complete="true";
            }
            append(0);
        }
        if(count){
            count.textContent=`${visible.length}/${rows.length}`;
            summary.textContent=Array.from(selected.values()).flatMap(values=>Array.from(values.keys())).join(" · ");
        }
    }
    const accept=i=>{remove();select(i);};
    dlg.addEventListener("click",event=>{
        if(event.target===dlg){
            const r=dlg.getBoundingClientRect();
            if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)remove();
            return;
        }
        const target=event.target.closest("button,[data-option]");
        if(!target)return;
        if(target.classList.contains("sg-picker-close"))return remove();
        if(target.classList.contains("sg-picker-reset")){
            selected.clear();
            search.value="";
            dlg.querySelectorAll("[data-facet]").forEach(b=>{b.removeAttribute("data-mode");b.setAttribute("aria-pressed","false");});
            return render();
        }
        if(target.classList.contains("sg-picker-facets-toggle")){
            const region=dlg.querySelector(".sg-picker-facets");
            region.hidden=!region.hidden;
            return;
        }
        if(target.classList.contains("sg-picker-pills-toggle")){summary.hidden=!summary.hidden;return;}
        if(target.classList.contains("sg-picker-confirm"))return editor||index==null?remove():accept(index);
        if(target.dataset.preview!=null){
            const row=target.closest("[data-option]");
            showPreview(row,Number(target.dataset.preview));
            return;
        }
        if(target.hasAttribute("data-preview-all")){
            const expanded=target.textContent==="[−]";
            target.textContent=expanded?"[+]":"[−]";
            if(expanded){list.querySelectorAll(".sg-picker-preview").forEach(e=>e.remove());return;}
            for(const row of list.querySelectorAll("[data-option]")){
                if(row.nextElementSibling?.dataset.for!==row.dataset.option)showPreview(row,Number(row.dataset.option));
            }
            return;
        }
        if(target.dataset.option!=null){
            const next=Number(target.dataset.option);
            if(!filtered || event.detail>1)return accept(next>=0?next:null);
            const previous=list.querySelector('[aria-selected="true"]');
            if(previous){previous.setAttribute("aria-selected","false");previous.querySelector("input").checked=false;}
            index=next;
            target.setAttribute("aria-selected","true");
            target.querySelector("input").checked=true;
            footer.querySelector("button").disabled=false;
            return;
        }
        if(target.dataset.sort){
            reverse=sort===target.dataset.sort&&!reverse;
            sort=target.dataset.sort;
            return render();
        }
        if(target.dataset.facet){
            const i=Number(target.dataset.facet),key=target.dataset.value;
            if(!selected.has(i))selected.set(i,new Map());
            const values=selected.get(i);
            const before=values.get(key)||0, next=before===0?1:before===1?-1:0;
            if(next)values.set(key,next);else values.delete(key);
            if(!values.size)selected.delete(i);
            target.dataset.mode=next;
            target.setAttribute("aria-pressed",String(next!==0));
            render();
        }
    },listen);
    search.addEventListener("input",render,listen);
    dlg.addEventListener("keydown",event=>{
        if(event.key==="Escape"&&!filtered){event.preventDefault();remove();anchor.focus();return;}
        if(event.key==="Enter"&&event.target===search&&!editor){
            event.preventDefault();
            const chosen=filtered&&index!=null?index:+(list.querySelector('[data-option]:not([data-option="-1"])')?.dataset.option ?? -1);
            if(chosen>=0)accept(chosen);
        }
        if(event.key==="ArrowDown"&&event.target===search){event.preventDefault();list.querySelector("[data-option]")?.focus();}
        if(event.target.closest(".sg-picker-list") && ["ArrowUp","ArrowDown"].includes(event.key)){
            event.preventDefault();
            (event.key==="ArrowDown"?event.target.nextElementSibling:event.target.previousElementSibling||search)?.focus();
        }
    },listen);
    if(filtered)dlg.showModal();
    else{
        const r=anchor.getBoundingClientRect();
        Object.assign(dlg.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px"});
        list.style.maxHeight=Math.min(200,Math.max(48,innerHeight-r.bottom))+"px";
        dlg.show();
        document.addEventListener("pointerdown",e=>{if(!dlg.contains(e.target)&&!anchor.contains(e.target))remove();},listen);
    }
    render();
    search.focus();
}
