
import {btn,dialog,el,input} from "./screen-ui.js";
import {storage} from "./encounter-store.js";
import {manifest,object} from "./screen-data.js";
import {roll} from "./statgen-dice.js";

const macroKey="ROLLER_MACRO_STORAGE";
const helpLines=[
    ["Keep highest","4d6kh3"],["Drop lowest","4d6dl1"],["Drop highest","3d4dh1"],["Keep lowest","3d4kl1"],
    ["Reroll equal","2d4r1"],["Reroll less","2d4r<2"],["Reroll less or equal","2d4r<=2"],
    ["Reroll greater","2d4r>2"],["Reroll greater equal","2d4r>=3"],
    ["Explode equal","2d4x4"],["Explode less","2d4x<2"],["Explode less or equal","2d4x<=2"],
    ["Explode greater","2d4x>2"],["Explode greater equal","2d4x>=3"],
    ["Count Successes equal","2d4cs=4"],["Count Successes less","2d4cs<2"],["Count Successes less or equal","2d4cs<=2"],
    ["Count Successes greater","2d4cs>2"],["Count Successes greater equal","2d4cs>=3"],
    ["Margin of Success","2d4ms=4"],["Dice pools","{2d8, 1d6}"],["Dice pools with modifiers","{1d20+7, 10}kh1"],
    ["Rounding","floor(1.5), ceil(1.5), round(1.5)"],["Average","avg(8d6)"],["Maximize dice","dmax(8d6)"],
    ["Minimize dice","dmin(8d6)"],["Other functions","sign(1d6-3), abs(1d6-3), ...etc."]
];

function askNumber(title,value){
    return new Promise(resolve=>{
        const {d,body}=dialog(title),field=input(title,value,()=>{});
        field.type="number";field.min=0;
        let result;
        d.addEventListener("close",()=>resolve(result),{once:true});
        body.append(field,btn("确定",()=>{result=Math.max(0,Math.trunc(Number(field.value)||0));d.close();}));
        field.onkeydown=e=>{if(e.key==="Enter")body.lastChild.click();};field.focus();
    });
}
function appendDiceDetail(target,html){
    // Keep the grammar's dropped/success/min/max marks. Render labels and any
    // other text as text nodes, and copy no attributes from the parsed fragment.
    const allowed=new Set(["rll__dropped","rll__exploded","rll__success","rll__max--muted","rll__min--muted"]);
    const fragment=el("template");fragment.innerHTML=html;
    function copy(out,node){
        if(node.nodeType===Node.TEXT_NODE){out.append(node.data);return;}
        const span=node.nodeName==="SPAN" && allowed.has(node.className)?el("span",node.className):out;
        if(span!==out)out.append(span);
        for(const child of node.childNodes)copy(span,child);
    }
    for(const node of fragment.content.childNodes)copy(target,node);
}

let active=false;
export function enableScreenDice(){
    if(active)return;
    active=true;
    const f=document.getElementById("dice-form"),field=document.getElementById("dice-input"),log=document.getElementById("dice-log");
    const history=[];
    let draft="",position=0,grammar,queue=Promise.resolve();
    const signal=new AbortController().signal;
    async function loader(){
        if(!grammar)grammar=manifest().then(m=>object(m.statgen.dice)).then(data=>{
            const source=data.source??data;
            // The legacy help lists abs(), but its evaluator omits ABS from the Math dispatch.
            return source.replace(
                /(case Renderer\.dice\.tk\.SIGN\.type:\s*)(?=case Renderer\.dice\.tk\.CBRT\.type:)/,
                "$1case Renderer.dice.tk.ABS.type:\n"
            );
        })
            .catch(e=>{grammar=null;throw e;});
        return grammar;
    }
    function out(...parts){
        const p=el("p","screen-dice-output");p.append(...parts);log.append(p);log.scrollTop=log.scrollHeight;return p;
    }
    log.addEventListener("click",event=>{
        const code=event.target.closest("code");
        if(code){field.value=code.textContent;field.focus();}
    });
    const invalid=()=>out('Invalid input! Try "/help"');
    function help(){
        const list=el("ul");for(const [label,formula] of helpLines){
            const li=el("li");li.append(label+"; ",el("code","",formula));list.append(li);
        }
        const p=el("p");
        const lines=[
            "Up and down arrow keys cycle input history.",
            "Anything before a colon is treated as a label (Fireball: 8d6)",
            "Use /macro list to list saved macros.",
            "Use /macro add myName 1d2+3 to add (or update) a macro. Macro names should not contain spaces or hashes.",
            "Use /macro remove myName to remove a macro.",
            "Use #myName to roll a macro.",
            "Use /iterroll roll count [target] to roll multiple times, optionally against a target.",
            "Use /clear to clear the roller."
        ];
        lines.forEach((line,i)=>{if(i)p.append(el("br"));p.append(line);});out(list,p);
    }
    async function dice(formula,label,count=1,target){
        const source=await loader(),notify=message=>out(message);
        const variables={};
        const flags=/\b(?:pb(?=\b|d\d)|(?:summonspelllevel|summonclasslevel)\b)/i.test(formula) ?
            await roll(source,formula,1,notify,signal,{inspect:true}):{};
        for(const [flag,key,title,value] of [["hasPb","pb","Enter Proficiency Bonus",2],
            ["hasSummonSpellLevel","summonSpellLevel","输入法术环阶",1],["hasSummonClassLevel","summonClassLevel","输入职业等级",1]]){
            if(!flags[flag])continue;
            const number=await askNumber(title,value);if(number==null)return;variables[key]=number;
        }
        const results=await roll(source,formula,count,notify,signal,{details:true,ordered:true,variables});
        for(const {total,txt,html,formula,max,min} of results){
            const rollText=el("span","screen-dice-result"+(max?" max":min?" min":""),String(total)),expression=el("i","screen-dice-formula",formula);
            const copy=btn("Copy to Input",()=>{field.value=formula.replace(/\s+/g,"");field.focus();},"\u270f","screen-dice-copy");
            const targetText=target==null?"":total>=target?" ≥"+target:" <"+target;
            const result=el("span","screen-dice-expression");
            const detail=el("span","screen-dice-detail");
            if(html)appendDiceDetail(detail,html);else detail.textContent=txt;
            result.append(...(label?[label+": "]:[]),rollText,targetText+" ",expression," ⇒ ",detail);
            const row=out(result,copy);row.classList.add("screen-dice-roll");
        }
    }
    async function macro(parts,invoke){
        const db=await storage(),saved=Object.assign(Object.create(null),await db.getItem(macroKey));
        const [mode,name,formula]=parts;
        if(invoke)return saved[name]?dice(saved[name],name):out("Macro #"+name+" not found");
        if(mode==="list" && parts.length===1){
            for(const [key,value] of Object.entries(saved))out(el("code","","#"+key)," — "+value);
        }else if(mode==="add" && parts.length===3 && !name.includes("#")){
            saved[name]=formula;await db.setItem(macroKey,{...saved});out("Saved macro #"+name);
        }else if(mode==="remove" && parts.length===2){
            if(!(name in saved))return out("Macro #"+name+" not found");
            delete saved[name];await db.setItem(macroKey,{...saved});out("Removed macro #"+name);
        }else if(mode!=="clear")invalid();
    }
    async function submit(line){
        if(line.startsWith("#"))return macro(["",line.slice(1)],true);
        if(!line.startsWith("/")){
            const divider=line.indexOf(":");
            return divider<0?dice(line):dice(line.slice(divider+1),line.slice(0,divider).trim());
        }
        out(el("code","",line));
        const [command,...parts]=line.split(/\s+/);
        if(["/c","/cls","/clear"].includes(command)){log.replaceChildren();return;}
        if(command==="/h" || command==="/help"){help();return;}
        if(command==="/macro")return macro(parts,false);
        if(command==="/iterroll" && parts.length){
            const [formula,raw,target]=parts,count=Number(raw ?? 1);
            if(!Number.isFinite(count) || count<0 || count>100)return invalid();
            if(count>0)return dice(formula,null,Math.ceil(count),target!=null && Number.isFinite(Number(target))?Number(target):undefined);
            return;
        }
        invalid();
    }
    f.onsubmit=e=>{
        e.preventDefault();
        const line=field.value.trim().replace(/\/r(?:oll)? /gi,"").trim();
        if(!line)return;
        history.push(line);position=history.length;draft="";field.value="";
        queue=queue.then(()=>submit(line)).catch(invalid);
    };
    field.onkeydown=e=>{
        if((e.key!=="ArrowUp" && e.key!=="ArrowDown") || !history.length)return;
        e.preventDefault();
        if(position===history.length)draft=field.value;
        position=Math.max(0,Math.min(history.length,position+(e.key==="ArrowUp"?-1:1)));
        field.value=history[position]??draft;
    };
}
