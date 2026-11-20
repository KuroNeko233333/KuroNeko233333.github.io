// Work directly with the compact keys used by the DM screen's JSON files.
export function trackerState(saved = {}) {
    const state=Object.assign({s:"NUMBER", d:"DESC", ri:true, m:false, rg:false, rri:false,
        wId:false, g:true, p:true, a:false, k:false, piHp:false, piHm:false, piV:true, piO:false,
        c:[], cndc:[], r:[], rdp:[], n:1}, saved);
    for(const row of [...state.r,...state.rdp]){
        if(row.n && typeof row.n==="object"){
            const name=row.n;
            Object.assign(row,{n:name.n,n_d:name.d,n_scr:name.scr,n_ssp:name.ssp,n_scl:name.scl,n_m:name.m});
        }
        row.id ||= crypto.randomUUID();
        row.c=(row.c||[]).map(c=>c.entity?c:{id:crypto.randomUUID(),entity:c});
        for(const key of ["n_scr","n_ssp","n_scl","h","g","i","o"]){
            if(row[key]==null)continue;
            if(Number.isFinite(Number(row[key])))row[key]=Number(row[key]);else delete row[key];
        }
    }
    return state;
}
export function newRow(fields = {}) {
    return {id:crypto.randomUUID(), v:true, c:[], k:[], ...fields};
}
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export const sameGroup = (a,b) => ["n","n_m","s","n_scr","n_ssp","n_scl"].every(key => (a[key] ?? null) === (b[key] ?? null));
function activate(state, target) {
    for (const r of state.r) r.a = sameGroup(r,target) && (state.s === "ALPHA" || r.i === target.i);
}
export function ordered(state) {
    const dir = state.d === "DESC" ? -1 : 1;
    state.r.sort((a,b) => {
        const byName = dir * compare(String(a.n_m || a.n || "").toLowerCase(), String(b.n_m || b.n || "").toLowerCase());
        const byScore = dir * ((+a.i || 0) - (+b.i || 0));
        const ordinal = (a.o || 0) - (b.o || 0);
        return (state.s === "ALPHA" ? byName || ordinal || byScore : byScore || byName || ordinal) || compare(a.id,b.id);
    });
    if (state.r.length && !state.r.some(r => r.a)) activate(state,state.r[0]);
    return state.r;
}
export function shift(state, direction) {
    const rows = ordered(state).slice();
    if (!rows.length) return false;
    if (direction < 0) rows.reverse();
    const active = rows.filter(r => r.a);
    if (direction > 0) for (const r of active) {
        r.c = (r.c || []).filter(c => c.entity.turns == null || --c.entity.turns > 0);
    }
    activate(state, rows[(rows.indexOf(active.at(-1)) + 1) % rows.length]);
    if (direction > 0 && rows[0].a) { state.n++; return true; }
    return false;
}
export function sortBy(state, field) {
    state.d = field === state.s ? (state.d === "ASC" ? "DESC" : "ASC") : (field === "ALPHA" ? "ASC" : "DESC");
    state.s = field;
    ordered(state);
}
export function wound(state,r) {
    const pct = Math.round(Math.max(0,Math.min(100,100 * (state.wId ? r.g-r.h : r.h) / r.g)));
    return pct === 100 ? 0 : pct > 50 ? 1 : pct > 0 ? 2 : pct === 0 ? 3 : -1;
}
// Only the public projection leaves the GM window, including on same-device connections.
export function playerMessage(state) {
    const cols = state.c.filter(c => c.v);
    const rows = state.r.filter(r => r.v).map(r => {
        const row = {name:r.n || "", initiative:r.i ?? null, isActive:!!r.a, conditions:r.c || [],
            hpWoundLevel:wound(state,r), rowStatColData:[]};
        if (r.n_m) row.customName = r.n_m;
        if (state.piO && r.o != null && state.r.some(other => other !== r && sameGroup(r,other))) row.ordinal = r.o;
        if (r.s ? state.piHm : state.piHp) Object.assign(row,{hpCurrent:r.h, hpMax:r.g});
        for (const col of cols) {
            const cell = r.k?.find(c => c.id === col.id) || {};
            const entity = r.s && col.v !== 1 ? {isUnknown:true} :
                col.p==="image" ? {type:"image",tokenUrl:cell.urlt,imageHref:cell.hrefi} :
                {value:col.p==="legendaryActions" ? (cell.cur || 0)+"/"+(cell.max || 0) : cell.v};
            row.rowStatColData.push({id:col.id,entity});
        }
        return row;
    });
    return {type:"state",payload:{round:state.n,rows,statsCols:cols.map(c=>({id:c.id,abbreviation:c.a}))}};
}
export function initiativeBonus(mon) {
    if (typeof mon.initiative === "number") return mon.initiative;
    if (typeof mon.initiative?.initiative === "number") return mon.initiative.initiative;
    const cr = mon.cr?.cr ?? mon.cr;
    const proficiency = typeof cr === "number" || /^\d+(?:\/\d+)?$/.test(cr) ?
        Math.max(2,Math.ceil(Number(String(cr).split("/")[0]) / 4) + 1) : 0;
    return (Number.isFinite(mon.dex) ? Math.floor((mon.dex-10)/2) : 0) + (mon.initiative?.proficiency || 0)*proficiency;
}

