// Merge independent edits against the last common snapshot under a same-origin Web Lock.
// A conflicting edit to the same field leaves the persisted board and the editing tab intact.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function keyFor(value,field){
    if(!value || typeof value!=="object")return null;
    if(value.id!=null)return String(value.id);
    if(field==="ps" && Number.isInteger(value.x) && Number.isInteger(value.y))return value.x+","+value.y;
    return null;
}
export function mergeBoard(base,local,remote,field=""){
    if(equal(local,remote) || equal(base,remote))return local;
    if(equal(base,local))return remote;
    if([base,local,remote].every(Array.isArray)){
        const makeMap=arr=>new Map(arr.map(v=>[keyFor(v,field),v]));
        const maps=[base,local,remote].map(makeMap);
        if(maps.every((m,i)=>!m.has(null) && m.size===[base,local,remote][i].length)){
            const out=[];
            for(const id of new Set([...maps[2].keys(),...maps[1].keys()])){
                const item=mergeBoard(...maps.map(m=>m.get(id)),field+"[]");
                if(item!==undefined)out.push(item);
            }
            return out;
        }
        if(base.length===local.length && base.length===remote.length)
            return local.map((v,i)=>mergeBoard(base[i],v,remote[i],field+"[]"));
    }else if([base,local,remote].every(v=>v && typeof v==="object" && !Array.isArray(v))){
        const entries=[];
        for(const k of new Set([...Object.keys(remote),...Object.keys(local)])){
            const v=mergeBoard(base[k],local[k],remote[k],k);if(v!==undefined)entries.push([k,v]);
        }
        return Object.fromEntries(entries);
    }
    throw Error("另一窗口已修改同一项（"+field+"）。本窗口保留当前内容，可导出文件；刷新可读已保存的布局。");
}
