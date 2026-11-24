// The old browser uses localForage's default database and its bestiary page suffix.
let library;
export async function storage(){
    if(!library)library=new Promise((resolve,reject)=>{
        if(window.localforage)return resolve(window.localforage);
        const script=document.createElement("script");script.src=new URL("../lib/localforage.js",import.meta.url);
        script.onload=()=>resolve(window.localforage);script.onerror=()=>{library=null;reject(Error("无法打开遭遇存档库"));};
        document.head.append(script);
    });
    return library;
}
const suffix="_bestiary.html";
export async function readSlot(key){
    const db=await storage(),v=await db.getItem(key+suffix);
    if(v==null && key==="sublist")return db.getItem("ENCOUNTER_STORAGE");
    return v;
}
export async function writeSlot(key,value){return (await storage()).setItem(key+suffix,value);}
const unwrap=rows=>(rows||[]).map(r=>r.entity??r);
export function readEncounter(raw={}){
    raw=structuredClone(raw||{});
    if(raw.l)Object.assign(raw,raw.l);
    if(raw.items!=null && !Array.isArray(raw.items))throw Error("遭遇文件中的怪物列表无效");
    const parties=raw.statePartyComps||{};
    const simple=unwrap(parties.custom?.state?.playersSimple || raw.playersSimple || raw.p || [{level:1,count:4}]);
    const advanced=unwrap(parties.customAdvanced?.state?.playersAdvanced || raw.playersAdvanced || raw.d?.map(r=>({name:r.n,level:r.l,extras:(r.x||[]).map(value=>({value}))})) || [{level:1,name:"",extras:[]}]);
    const columns=unwrap(parties.customAdvanced?.state?.colsExtraAdvanced || raw.colsExtraAdvanced || raw.c?.map(name=>({name})) || []);
    for(const p of [...simple,...advanced])if(!Number.isInteger(+p.level)||p.level<1||p.level>20)throw Error("玩家等级应在 1–20 之间");
    for(const p of simple)if(!Number.isInteger(+p.count)||p.count<1)throw Error("玩家人数无效");
    for(const r of raw.items||[])if(typeof r.h!=="string" || !Number.isSafeInteger(+(r.c??1)) || +(r.c??1)<1)throw Error("怪物条目或数量无效");
    const customShapeGroups=unwrap(raw.customShapeGroups);
    for(const group of customShapeGroups){
        for(const key of ["countMinMaxMin","countMinMaxMax","ratioPercentage"]){
            const value=Number(group[key]);
            if(!Number.isSafeInteger(value)||value<0)throw Error("自定义遭遇数值无效");
            group[key]=value;
        }
        if(group.ratioPercentage>100||group.countMinMaxMax<group.countMinMaxMin)throw Error("自定义遭遇数值超出范围");
    }
    const active=raw.activePartyId || (raw.isAdvanced||raw.a?"customAdvanced":"custom");
    return {...raw,items:raw.items||[],customShapeGroups,
        saveId:raw.saveId||raw.bestiaryId||crypto.randomUUID(),activePartyId:active,
        statePartyComps:{...parties,custom:{state:{playersSimple:simple}},customAdvanced:{state:{playersAdvanced:advanced,colsExtraAdvanced:columns}}}};
}
export async function namedSaves(){
    const s=await readSlot("listSaveManager");
    if(s?.state?.saves)return s;
    const legacy=await (await storage()).getItem("ENCOUNTER_SAVED_STORAGE");
    const saves=Object.entries(legacy?.savedEncounters||{}).map(([saveId,v])=>({
        id:saveId,entity:{...readEncounter(v.data),saveId,name:v.name||"(Unnamed encounter)",manager_isSaved:true}
    }));
    return {state:{saves,activeId:null,isLoadAsCopy:false}};
}
export async function saveNamed(doc){
    // Serialize named saves across new-site tabs without replacing unrelated encounters.
    const write=async()=>{
        const m=await namedSaves(),items=m.state.saves;
        let slot=items.find(x=>x.entity.saveId===doc.saveId);
        if(!slot){slot={id:crypto.randomUUID(),entity:{}};items.push(slot);}
        slot.entity={...structuredClone(doc),manager_isSaved:true};m.state.activeId=slot.id;
        await writeSlot("listSaveManager",m);
    };
    return navigator.locks?navigator.locks.request("ours-encounter-saves",write):write();
}
