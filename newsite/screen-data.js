import {newRow, sameGroup, initiativeBonus} from "./initiative-state.js";
import {readEncounter} from "./encounter-store.js";
const promises = new Map();
function json(path) {
    if (!promises.has(path)) promises.set(path,fetch(path).then(r=>{
        if (!r.ok) throw Error("资料暂时无法读取，请重试");
        return path.endsWith(".gz") ? r.arrayBuffer().then(buf=>{
            const bytes=new Uint8Array(buf);
            return bytes[0]===31 && bytes[1]===139 ? new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).json() : JSON.parse(new TextDecoder().decode(bytes));
        }) : r.json();
    }).catch(e=>{promises.delete(path);throw e;}));
    return promises.get(path);
}
export const manifest = () => json("data/index.json");
export const objectPath=(m,hash)=>"data/objects/"+hash+".json"+(m.objectEncoding==="gzip"?".gz":"");
export const object = async hash => {
    const path=objectPath(await manifest(),hash), value=json(path);
    if(promises.size>28) for(const key of promises.keys()) {
        if(key.startsWith("data/objects/") && key!==path){promises.delete(key);break;}
    }
    return value;
};
export async function monsters() { return object((await manifest()).monsters.catalogs.full); }
export async function monsterModel(cat,row) { return (await object(cat.packs[row.p]))[row.id].model; }
export async function scaleScreenMonster(card,options,digest,readObject){
    const {scaleMonster,prepareMonsterScale}=await import("./monster-runtime.js");
    if(options.spell==null)return scaleMonster(card,options,digest,readObject,false);
    // The DM panel uses the native compact summoning stat block, including printed formulas.
    const {win}=await prepareMonsterScale(digest,readObject);
    const model=await win.ScaleSpellSummonedCreature.scale(win.JSON.parse(JSON.stringify(card.model)),Number(options.spell));
    return {model};
}
export async function rollDice(formula) {
    const {roll} = await import("./statgen-dice.js");
    const meta=(await manifest()).statgen;
    const dice = await object(meta.dice);
    return (await roll(dice.source ?? dice, formula,1,()=>{},new AbortController().signal))[0].total;
}
export const d20 = (modifier=0) => 1 + Math.floor(Math.random()*20) + modifier;
export async function monsterRow(state, mon, previous, scores = {}) {
    const hp = scores.hp ?? (state.m && mon.hp?.formula ? await rollDice(mon.hp.formula) : mon.hp?.average ?? null);
    const row = newRow({n:mon.name,s:mon.source,v:!state.piV,h:state.wId ? 0 : hp,g:hp,
        i:scores.i ?? (state.ri ? d20(initiativeBonus(mon)) : null)});
    Object.assign(row,{n_d:mon._displayName,n_scr:mon._scaledCr,n_ssp:mon._scaledSpellSummonLevel ?? mon._summonedBySpell_level,n_scl:mon._scaledClassSummonLevel ?? mon._summonedByClass_level});
    row.o=1+Math.max(0,...previous.filter(r=>sameGroup(row,r)).map(r=>r.o ?? 1));
    if(state.c.length)await (await import("./screen-stats.js")).fillColumns(state.c,row,mon);
    return row;
}
export async function importEncounter(state, raw, chooseColumns) {
    const enc = readEncounter(raw), rows = [], cat = await monsters();
    const party=enc.statePartyComps[enc.activePartyId]?.state;
    let columns;
    if (state.p && !state.rdp.length && party) {
        if (enc.activePartyId === "customAdvanced") {
            const extras=party.colsExtraAdvanced || [];
            columns=extras.map(c=>c.name?.toLowerCase()==="hp" ? null : {id:crypto.randomUUID(),a:c.name,v:2,e:true,p:""});
            for (const p of party.playersAdvanced) {
                const row=newRow({n:p.name||""});
                extras.forEach((_,i)=>{
                    const v=p.extras?.[i]?.value;
                    if (columns[i]) row.k.push({id:columns[i].id,v:v || ""});
                    else if (v != null && String(v).trim()) {
                        const n=Number(String(v).split("/")[0]);
                        if (Number.isFinite(n)) row.h=row.g=n; // The upstream converter uses current for both.
                    }
                });
                rows.push(row);
            }
        } else for (const p of party.playersSimple || []) for (let i=0;i<p.count;i++) rows.push(newRow());
    }
    for (const group of enc.items) {

        const found=cat.rows.find(r=>r.h===group.h);
        if (!found) throw Error("书库中找不到遭遇条目："+group.h);
        const card=(await object(cat.packs[found.p]))[found.id];
        let mon=card.model;
        if(group.customHashId){
            const [, , cr,spell,cl]=group.customHashId.split("__");
            mon=(await scaleScreenMonster(card,{cr:cr||null,spell:spell||null,classLevel:cl||null},(await manifest()).monsters.runtime,object)).model;
        }
        let scores={};
        for (let i=0;i<Number(group.c || 1);i++) {
            const row=await monsterRow(state,mon,rows,scores);
            rows.push(row);
            if (state.g) scores={hp:row.g,i:row.i};
        }
    }
    if (columns?.some(Boolean)) {
        const choice=await chooseColumns();
        if(choice==="cancel")return false;
        if(choice==="yes"){state.c=columns.filter(Boolean);state.k=true;}
    }
    if(state.c.length){
        const {fillColumns}=await import("./screen-stats.js");
        for(const row of rows.filter(r=>!r.s))await fillColumns(state.c,row,null);
    }
    if(!state.a){state.s="NUMBER";state.d="DESC";state.n=1;}
    state.r=[...(state.a ? state.r : structuredClone(state.rdp).map(r=>({...r,id:crypto.randomUUID()}))),...rows];
}

