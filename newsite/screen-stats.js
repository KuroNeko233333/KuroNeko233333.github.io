import {manifest,object,monsters,scaleScreenMonster} from "./screen-data.js";
import {prepareMonsterScale} from "./monster-runtime.js";
import {el,input} from "./screen-ui.js";

// Use the native column definitions for names, defaults and serialized cell values.
// The existing renderer frame supplies Parser and the other data libraries in its own realm.
let loading;
async function library(){
    if(!loading)loading=(async()=>{
        const m=await manifest(),{win}=await prepareMonsterScale(m.monsters.runtime,object);
        const base=new URL("../js/dmscreen/panels/initiativetracker/",location.href);
        const script=win.document.createElement("script");
        script.type="module";
        const ready=new Promise((resolve,reject)=>{win.screenColumnsLoaded=resolve;script.onerror=()=>reject(Error("附加列规则未能载入"));});
        script.textContent="import {InitiativeTrackerStatColumnFactory as factory,GROUP_DISPLAY_NAMES as groups} from "+JSON.stringify(base+"dmscreen-initiativetracker-statcolumns.js")+";import {InitiativeTrackerRowStatsColDataSerializer as serializer} from "+JSON.stringify(base+"dmscreen-initiativetracker-serial.js")+";window.screenColumnsLoaded({factory,groups,serializer});";
        win.document.head.append(script);return ready;
    })().catch(e=>{loading=null;throw e;});
    return loading;
}
export async function columnOptions(select){
    const {factory,groups}=await library();
    for(const list of factory.getGroupedByUi()){
        const group=el("optgroup");group.label=groups[list[0].GROUP];
        for(const cls of list){
            const opt=new Option(cls.NAME,cls.POPULATE_WITH);opt.dataset.abbreviation=cls.ABV_DEFAULT;group.append(opt);
        }
        select.append(group);
    }
}
export async function fillColumns(columns,row,mon){
    if(!columns.length)return;
    const {factory,serializer}=await library();row.k||=[];
    for(const col of columns){
        if(row.k.some(cell=>cell.id===col.id))continue;
        const definition=factory.fromStateData({dataSerial:col});
        const cell=definition.getInitialCellStateData({mon});
        row.k.push(serializer.toSerial(cell));
    }
}
export async function modelFor(row){
    if(!row.s)return null;
    const cat=await monsters(),entry=cat.rows.find(r=>r.s===row.s && r.n===row.n);
    if(!entry)return null;
    const card=(await object(cat.packs[entry.p]))[entry.id];
    return (await scaleScreenMonster(card,{cr:row.n_scr,spell:row.n_ssp,classLevel:row.n_scl},(await manifest()).monsters.runtime,object)).model;
}
export async function rerollModifier(state,row){
    if(!state.c.length)return 0;
    const {factory,serializer}=await library();
    let priority=0,modifier=0;
    for(const col of state.c){
        const cell=row.k?.find(c=>c.id===col.id);if(!cell)continue;
        const {initiative,applicability}=factory.fromStateData({dataSerial:col}).getInitiativeInfo({state:serializer.fromSerial(cell)});
        if(!applicability || applicability<priority)continue;
        modifier=applicability>priority?initiative:Math.max(modifier,initiative);
        priority=applicability;
    }
    return modifier;
}
export function renderCell(col,row,save){
    const cell=(row.k||=[]).find(c=>c.id===col.id) || {id:col.id};
    if(!row.k.includes(cell))row.k.push(cell);
    const disabled=!!row.s && !col.e;
    if(col.p?.startsWith("cb")){
        const box=el("input","stat");box.type="checkbox";box.setAttribute("aria-label",col.a||"勾选框");
        box.checked=!!cell.v;box.disabled=disabled;box.onchange=()=>{cell.v=box.checked;save();};return box;
    }
    if(col.p==="image"){
        const image=el("img","stat-token");image.alt="Token图";
        if(cell.urlt)image.src=new URL(cell.urlt,new URL("../",location.href));return image;
    }
    if(col.p==="legendaryActions"){
        const pair=el("span","stat-resource");
        for(const key of ["cur","max"]){
            if(key==="max")pair.append("/");
            const field=input(col.a,cell[key],v=>{cell[key]=v===""?null:Number(v);save();});
            field.type="number";field.disabled=disabled;pair.append(field);
        }
        return pair;
    }
    const field=input(col.a,cell.v,v=>{cell.v=v;save();});field.className="stat";field.disabled=disabled;return field;
}
export function advanceColumns(state,newRound){
    for(const row of state.r){
        for(const cell of row.k||[]){
            const p=state.c.find(c=>c.id===cell.id)?.p;
            if(newRound && p==="legendaryActions")cell.cur=cell.max;
            if(newRound && p?.startsWith("cbAutoRound"))cell.v=p==="cbAutoRoundHigh";
            if(row.a && ["cbAutoHigh","cbAutoLow"].includes(p))cell.v=p==="cbAutoHigh";
        }
    }
}
