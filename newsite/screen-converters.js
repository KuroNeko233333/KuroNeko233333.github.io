import {el,btn,input,dialog} from "./screen-ui.js";
const units=[
    ["英寸","2.54","厘米","0.394"],["英尺",".305","米","3.28"],["英里","1.61","公里","0.620"],
    ["磅","0.454","千克","2.20"],["加仑","3.79","升","0.264"],["加仑","8","品脱","0.125"]
];
function arithmetic(text){
    // Evaluate only arithmetic. Tokenize the complete input, including exponent notation.
    const parts=text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\*\*|[()+*/-]/g)||[];
    if(parts.join("")!==text.replace(/\s/g,""))throw Error();
    let i=0;
    function atom(){
        const t=parts[i++];
        if(t==="+" || t==="-")return (t==="-"?-1:1)*atom();
        if(t==="("){const n=sum();if(parts[i++]!==")")throw Error();return n;}
        if(!t || !/^[.\d]/.test(t))throw Error();return Number(t);
    }
    function pow(){const x=atom();if(parts[i]!=="**")return x;i++;return x**pow();}
    function product(){let x=pow();while(["*","/"].includes(parts[i])){const op=parts[i++],y=pow();x=op==="*"?x*y:x/y;}return x;}
    function sum(){let x=product();while(["+","-"].includes(parts[i])){const op=parts[i++],y=product();x=op==="+"?x+y:x-y;}return x;}
    const result=sum();if(i!==parts.length)throw Error();return result;
}
export function unitPanel(root,s,save){
    const table=el("table","unit-table"),fields=el("div","unit-fields");
    s.c=Number(s.c)||0;s.d=Number(s.d)||0;
    for(const [i,row] of units.entries()){
        const tr=table.insertRow();
        row.forEach((v,k)=>{const td=tr.insertCell();td.textContent=k%2?"×"+v.padStart(5):v;td.onclick=()=>{s.c=i;s.d=k<2?0:1;render();save();};});
    }
    const source=el("textarea"),out=el("textarea"),a=el("label"),b=el("label");out.disabled=true;source.value=s.i||"";
    const from=el("b"),to=el("b");a.append(from,source);b.append(to,out);fields.append(a,btn("⇆",()=>{s.d=1-s.d;render();save();}),b);root.append(table,fields);
    function render(){
        const row=units[s.c]||units[0];from.textContent=row[s.d*2];to.textContent=row[(1-s.d)*2];
        source.removeAttribute("aria-invalid");
        try{out.value=source.value.trim()?Number((arithmetic(source.value.trim())*Number(row[s.d*2+1])).toFixed(5)):"";}
        catch{source.setAttribute("aria-invalid","true");out.value="";}
    }
    source.oninput=()=>{s.i=source.value;render();save();};render();
}
const money=[
    ["铜币",1,"cp"],["银币",10,"sp"],["银金币",50,"ep"],["金币",100,"gp"],["铂金币",1000,"pp"],
    ["尖儿 (WDH)",1,"nib"],["碎子 (WDH)",10,"shard"],["陶尔 (WDH)",200,"taol"],["龙 (WDH)",100,"dgn"],["太阳 (WDH)",1000,"sun"],["湾月 (WDH)",5000,"moon"]
];
export function coinPanel(root,s,save){
    const rows=el("div","coin-rows"),ctrl=el("div","coin-controls"),result=input("换算结果","",()=>{});
    result.readOnly=true;result.onclick=()=>navigator.clipboard.writeText(result.value);
    s.d ||= {};s.r ||= [];s.c??="3";
    function select(value,out,change){
        const box=el("select");if(out)box.add(new Option("(未指定)","-1"));
        money.forEach(([name],i)=>box.add(new Option(name,i)));box.value=String(value);
        box.onchange=()=>{change(box.value);update();save();};return box;
    }
    const split=input("分成...份",s.s,v=>{s.s=v;update();save();});split.type="number";split.min=1;split.placeholder="分成...份";
    const currency=select(s.c,true,v=>s.c=v);
    function update(){
        money.forEach((_,i)=>currency.options[i+1].hidden=!!s.d[i]);
        if(s.d[s.c])currency.value=s.c="-1";
        const share=Number(s.s)||1,totals=money.map(()=>0),parts=[];
        s.r.forEach(r=>{if(money[r.c])totals[r.c]+=Number(r.n)||0;});
        let copper=Math.floor(totals.reduce((a,n,i)=>a+n*money[i][1],0)/share),weight=0;
        for(let i=money.length-1;i>=0;i--){
            const [,mult,abbr]=money[i];let count=totals[i];
            if(Number(s.c)!==-1){
                if(s.d[i] || i>Number(s.c) || copper<mult)continue;
                count=Math.floor(copper/mult);copper%=mult;
            }else if(share>1){
                let rest=(count%share)*mult;count=Math.floor(count/share);
                for(let j=i-1;j>=0;j--)if(!s.d[j] && rest>=money[j][1]){totals[j]+=Math.floor(rest/money[j][1]);rest%=money[j][1];}
            }
            if(count){weight+=count*.02;parts.push(count.toLocaleString()+" "+abbr);}
        }
        result.value=parts.join("; ")+(weight?" ("+weight.toLocaleString()+" lb.)":"");
    }
    function draw(){
        rows.replaceChildren(...s.r.map(row=>{
            const line=el("div","coin-row"),amount=input("数量",row.n,v=>{row.n=v;update();save();});
            amount.type="number";amount.placeholder="数量";line.append(amount,select(row.c,false,v=>row.c=v),btn("Remove Row",()=>{s.r.splice(s.r.indexOf(row),1);draw();save();},"\ue020"));return line;
        }));update();
    }
    ctrl.append(btn("添加一行",()=>{s.r.push({c:"3",n:""});draw();save();},"+"),btn("设置",()=>{
        const {body}=dialog("设置");money.forEach(([name],i)=>{
            const lab=el("label","","在输出中禁用 "+name),cb=el("input");cb.type="checkbox";cb.checked=!!s.d[i];
            cb.onchange=()=>{s.d[i]=cb.checked;update();save();};lab.prepend(cb);body.append(lab);
        });
    },"\ue019"),split,currency,result);root.append(rows,ctrl);draw();
}
