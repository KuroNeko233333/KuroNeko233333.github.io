import {el,btn,dialog,fileInput} from "./screen-ui.js";
import {manifest,object} from "./screen-data.js";

export async function selectPinned(db,apply){
    const m=await manifest(),sources={items:m,bestiary:m.monsters,...m.pages};
    const {body,d}=dialog("Pinned List Entries"),page=el("select"),layout=el("select");
    page.setAttribute("aria-label","Select Page");
    for(const [key,scope] of Object.entries(sources).sort(([a],[b])=>a.localeCompare(b))){
        if(scope.catalogs?.full)page.add(new Option(scope.title || key,key));
    }
    layout.add(new Option("One per Panel","panels"));layout.add(new Option("Stacked Tabs","tabs"));
    layout.setAttribute("aria-label","排列方式");
    const named=el("select"),error=el("output");named.setAttribute("aria-label","已保存的列表");
    let serial=0;
    async function refresh(){
        const id=++serial,pageId=page.value;
        const store=await db.getItem("listSaveManager_"+pageId+".html");
        if(id!==serial)return;
        named.replaceChildren();
        for(const row of store?.state?.saves || []){
            const entity=row.entity || row;
            if(entity.manager_isSaved===false)continue;
            const option=new Option(entity.name || "(Unnamed)",row.id);option.snapshot=entity;named.add(option);
        }
    }
    async function load(data){
        error.textContent="";
        const key=page.value,pageId=key+".html",items=data?.items ?? data?.l?.items;
        if(!Array.isArray(items)||!items.length){error.textContent="这个列表没有固定条目。";return;}
        const cat=await object(sources[key].catalogs.full),byHash=new Map(cat.rows.map(row=>[row.h,row])),tabs=[];
        for(const it of items){
            const row=byHash.get(it.h);
            if(!row){error.textContent="在所选资料页找不到固定条目："+it.h;return;}
            const c={p:pageId,u:row.h,s:row.s};
            let t=1;
            if(key==="bestiary" && it.customHashId){
                const [,,cr,spell,level]=it.customHashId.split("__");
                if(cr){c.cr=Number(cr);t=7;}else if(spell){c.ssl=Number(spell);t=71;}else if(level){c.csl=Number(level);t=72;}
            }
            tabs.push({t,c,r:row.n});
        }
        if(layout.value==="panels" && !confirm("将每个条目放在独立面板中？格子不足时会增加一行。"))return;
        apply(tabs,layout.value==="tabs");d.close();
    }
    page.onchange=()=>refresh().catch(e=>error.textContent=e.message);
    body.append(page,layout,btn("从当前列表载入",async()=>load(await db.getItem("sublist_"+page.value+".html"))),
        named,btn("从已保存列表载入",()=>load(named.selectedOptions[0]?.snapshot)),fileInput("从文件载入",load),error);
    await refresh();
}
