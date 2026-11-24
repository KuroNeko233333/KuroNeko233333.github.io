import {el,btn,input,dialog,screenWindow} from "./screen-ui.js";
// Button labels and swatches from the tracker's condition palette.
const presets=Object.entries({"被致盲":"#525252","被魅惑":"#f01789","耳聋":"#ababab","力竭":"#947a47","恐慌":"#c9ca18",
    "受擒":"#8784a0","失能":"#3165a0","隐形":"#7ad2d6","麻痹":"#c00900","石化":"#a0a0a0","中毒":"#4dc200",
    "倒地":"#5e60a0","被束缚":"#d98000","被震慑":"#a23bcb","昏迷":"#3a40ad","专注":"#009f7a","喝醉":"#ffcc00","!!着火啦!!":"#ff6800"});
export function conditionDialog(state,row,refresh){
    const {d,body}=dialog("添加状态"),palette=el("div","condition-palette"),custom=el("div","condition-palette");
    const text=input("名称","",()=>{}), color=input("颜色","#337ab7",()=>{}), turns=input("持续回合","",()=>{});
    d.classList.add("condition-dialog");
    color.type="color";turns.placeholder="无限制";
    function values(){return {name:text.value.trim(),color:color.value,turns:Math.max(0,parseInt(turns.value)||0)||null};}
    function apply(v){(row.c||=[]).push({id:crypto.randomUUID(),entity:v});d.close();refresh();}
    function swatch(v) {
        const b=btn(v.name,e=>{
            text.value=v.name;color.value=v.color;turns.value=v.turns??"";
            if(e.ctrlKey||e.metaKey||e.shiftKey) apply({...v,turns:e.ctrlKey||e.metaKey?(e.shiftKey?10:1):null});
        });b.style.setProperty("--swatch",v.color);return b;
    }
    palette.append(...presets.map(([name,color])=>swatch({name,color,turns:null})));
    function drawCustom(){custom.replaceChildren(...state.cndc.map(c=>swatch({name:c.n,color:c.c,turns:c.t})));custom.hidden=!state.cndc.length;}
    const fields=el("div","condition-fields");
    for(const [label,node] of [["名称",text],["颜色",color],["持续时间",turns]]){const l=el("label","",label);l.append(node);fields.append(l);}
    fields.append(btn("保存为自定义状态",()=>{const v=values();state.cndc.push({id:crypto.randomUUID(),n:v.name,c:v.color,t:v.turns});drawCustom();refresh();},"\ue172"));
    d.querySelector("header button").replaceWith(btn("Manage Custom Conditions",()=>{
        manageCustomConditions(state,()=>{drawCustom();refresh();});
    },"\ue019"));
    drawCustom();body.append(palette,custom,fields,btn("设置状态",()=>apply(values()),"","blue"));
    text.onkeydown=turns.onkeydown=e=>{if(e.key==="Enter")apply(values());};
}

function manageCustomConditions(state,commit){
    const {d,body,footer}=screenWindow("Manage Custom Conditions","screen-custom-conditions",true);
    const working=structuredClone(state.cndc),rows=el("div","screen-custom-rows");
    function append(condition){
        const row=el("div","screen-custom-row");
        const name=input("名称",condition.n,value=>{condition.n=value;});
        const color=input("Color",condition.c,value=>{condition.c=value;});color.type="color";
        const turns=input("Turns",condition.t,value=>{
            const count=Number(value);
            condition.t=value.trim() && Number.isFinite(count)?Math.trunc(count):null;
        });turns.placeholder="Unlimited";
        const timing=el("div","screen-custom-timing");
        timing.append(turns,btn("Delete",()=>{
            working.splice(working.indexOf(condition),1);row.remove();
        },"\ue020","red"));
        row.append(name,color,timing);rows.append(row);
    }
    const head=el("div","screen-custom-head");
    head.append(el("span","","名称"),el("span","","Color"),el("span","","Turns"),btn("Add",()=>{
        // Match the old editor's fully saturated colors in 12-degree steps.
        const hue=Math.floor(Math.random()*31)/5;
        const channels=[5,3,1].map(offset=>{
            const position=(hue+offset)%6;
            const value=1-Math.max(0,Math.min(position,4-position,1));
            return Math.round(value*255).toString(16).padStart(2,"0");
        });
        const condition={id:crypto.randomUUID(),n:"",c:"#"+channels.join(""),t:null};
        working.push(condition);append(condition);
    },"+"));
    body.append(head,rows);working.forEach(append);
    footer.append(btn("保存",()=>{state.cndc=working;d.close();commit();},"","blue"));
}

