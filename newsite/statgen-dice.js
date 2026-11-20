// Keep the reusable grammar and its compatibility bindings inside a worker.
const prelude = `
const Renderer = {dice:{}};
const Parser = {_decimalSeparator:"."};
const SortUtil = {ascSortProp:(key,a,b)=>a[key]-b[key]};
const RollerUtil = {randomise:faces=>1+Math.floor(Math.random()*faces)};
const JqueryUtil = {doToast:message=>postMessage({warning:message.content})};
Object.defineProperty(Array.prototype,"sum",{value:function(){return this.reduce((a,b)=>a+b,0)}});
Object.defineProperty(Array.prototype,"last",{value:function(){return this[this.length-1]}});
Object.defineProperty(Array.prototype,"partition",{value:function(predicate){
    const groups=[[],[]];
    this.forEach((value,index)=>groups[predicate(value,index)?0:1].push(value));return groups;
}});
Object.defineProperty(Array.prototype,"mergeMap",{value:function(fn){return Object.assign({},...this.map(fn));}});
`;
const entry = `
onmessage=({data:{formula,count,options}})=>{
    try {
        const parsed=Renderer.dice.lang.getTree3(formula);
        if(!parsed)throw Error();
        if(options?.inspect){postMessage({rolls:parsed.meta});return;}
        const rolls=Array.from({length:count},()=>{
            const meta={...options?.variables};
            const total=parsed.tree.evl(meta),txt=(meta.text||[]).join("");
            if(!options?.details)return {total,txt};
            return {total,txt,html:(meta.html||[]).join(""),formula:parsed.tree.toString(),max:!!meta.allMax?.length && meta.allMax.every(Boolean),
                min:!!meta.allMin?.length && meta.allMin.every(Boolean)};
        });
        if(rolls.some(roll=>!Number.isFinite(roll.total)))throw Error();
        postMessage({rolls:options?.ordered?rolls:rolls.sort((a,b)=>b.total-a.total)});
    }catch{postMessage({invalid:true});}
};
`;

export async function roll(source, formula, count, notify, signal, options) {
    const url = URL.createObjectURL(new Blob([prelude, source, entry], {type:"text/javascript"}));
    const worker = new Worker(url);
    let stop;
    try {
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error("Invalid dice formula")), 1800);
            const finish = (fn, value) => { clearTimeout(timer); fn(value); };
            worker.onmessage = ({data}) => {
                if (data.warning) return notify(data.warning);
                if (data.invalid) return finish(reject, Error("Invalid dice formula"));
                finish(resolve, data.rolls);
            };
            worker.onerror = () => finish(reject, Error("Invalid dice formula"));
            stop=()=>finish(reject, signal.reason);
            if(signal.aborted){stop();return;}
            signal.addEventListener("abort",stop,{once:true});
            worker.postMessage({formula, count, options});
        });
    } finally {
        signal.removeEventListener("abort",stop);
        worker.terminate();
        URL.revokeObjectURL(url);
    }
}
