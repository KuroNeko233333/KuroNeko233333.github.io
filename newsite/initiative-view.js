import {renderCell,advanceColumns,fillColumns,rerollModifier} from "./screen-stats.js";
import {defaultParty,statColumns} from "./screen-party.js";
import {conditionDialog} from "./screen-conditions.js";
import {el,btn,input,dialog,fileInput,notice} from "./screen-ui.js";
import {newRow,ordered,shift,sortBy,sameGroup,wound} from "./initiative-state.js";
import {monsters,monsterModel,monsterRow,importEncounter,d20,scaleScreenMonster} from "./screen-data.js";
import {publish,configurePlayers} from "./screen-player.js";
import {readSlot,namedSaves} from "./encounter-store.js";

const locked=new WeakSet();
const glyph={add:"+",monster:"\ue045",prev:"\ue069",next:"\ue077",alpha:"\ue151",number:"\ue153",players:"\ue008",
    lock:"\ue033",settings:"\ue019",load:"\ue027",trash:"\ue020",flag:"\ue034",visible:"\ue105",hidden:"\ue106",rename:"\u270f"};
const settingLabels={ri:"掷先攻",m:"掷生命值",rg:"按组掷骰",rri:"每轮重掷先攻",wId:"反转伤势方向",piHp:"玩家显示精确玩家 HP",
    piHm:"玩家显示精确怪物 HP",piV:"隐藏新增怪物",piO:"显示怪物编号",p:"导入玩家",g:"导入时按组掷骰",a:"追加到现有遭遇"};
function group(...nodes) {const w=el("div","tool-group");w.append(...nodes);return w;}
function numberValue(value, previous) {
    if (!value.trim()) return null;
    if (/^[+-]\d+(?:\.\d+)?$/.test(value)) return (+previous || 0)+Number(value);
    return Number.isFinite(Number(value)) ? Number(value) : previous;
}
export function mountTracker(root,state,save) {
    const wrap=el("section","tracker"),list=el("div","tracker-list"),top=el("div","tracker-top"),foot=el("footer","tracker-controls");
    const cached=new Map();
    const header=el("div","tracker-header"),cols=el("div","tracker-cols");
    header.append(el("span","name-head","生物/状态"),cols,el("span","hp-head","HP"),el("span","score-head","#"),el("span","actions-head"));
    top.append(header,list);wrap.append(top,foot);root.append(wrap);
    const refresh=(persist=true)=>{
        const activate=state.r.length && !state.r.some(r=>r.a);
        const rows=ordered(state);
        if(activate && state.c.length)advanceColumns(state,true);
        for(const [id,node] of cached) if (!rows.some(r=>r.id===id)){node.remove();cached.delete(id);}
        rows.forEach((r,index)=>{
            let node=cached.get(r.id);
            if(!node){node=makeRow(r);cached.set(r.id,node);}
            node.sync();
            if(list.children[index]!==node)list.insertBefore(node,list.children[index] || null);
        });
        round.value=state.n;
        for(const [button,sort] of [[alpha,"ALPHA"],[number,"NUMBER"]]){
            const selected=state.s===sort;
            button.classList.toggle("selected",selected);
            button.setAttribute("aria-pressed",String(selected));
        }
        lock.classList.toggle("green",locked.has(state));[add,addMon,load,reset].forEach(n=>n.disabled=locked.has(state));
        cols.replaceChildren(...(state.k?state.c:[]).map(c=>el("span","stat",c.a)));
        if(persist){publish(state);root.dispatchEvent(new CustomEvent("screen-turn",{bubbles:true,detail:state}));save();}
    };
    async function reroll(update=true) {
        const rolls=new Map();
        for(const r of state.r) {
            const modifier=await rerollModifier(state,r);
            const key=JSON.stringify([r.n,r.s,r.n_m,r.n_scr,r.n_ssp,r.n_scl,modifier]);
            if (!state.rg || !rolls.has(key)) rolls.set(key,d20(modifier));
            r.i=rolls.get(key);
        }
        if(update)refresh();
    }
    async function advance(dir) {
        const newRound=shift(state,dir);
        if(dir>0)advanceColumns(state,newRound);
        if(newRound && state.rri){
            await reroll(false);state.r.forEach(r=>r.a=false);ordered(state);advanceColumns(state,false);
        }
        refresh();
    }
    function makeRow(r) {
        const row=el("div","tracker-row");row.dataset.id=r.id;
        const left=el("div","row-name"),stats=el("div","tracker-cols"),marks=el("div","marks");
        const name=input("名称",r.n,v=>{r.n=v;refresh();});name.placeholder="名称";name.className="row-input";
        if(r.s) {
            const title=el("a");title.href="bestiary.html#"+encodeURIComponent(r.n.toLowerCase())+"_"+encodeURIComponent(r.s.toLowerCase());
            left.append(title,el("span","mon-ordinal"),btn("重命名",e=>{if(e.shiftKey){delete r.n_m;refresh();return;}const {d,body}=dialog("重命名"),text=input("名称",r.n_m || r.n,()=>{});body.append(text,btn("确定",()=>{r.n_m=text.value;d.close();refresh();}));},glyph.rename),
                btn("添加另一个",()=>{const copy=structuredClone(r);copy.id=crypto.randomUUID();copy.h=copy.g;copy.c=[];copy.o=Math.max(...state.r.filter(x=>sameGroup(r,x)).map(x=>x.o||1))+1;state.r.push(copy);refresh();},glyph.add,"green"));
        } else left.append(name);
        const flag=btn("添加状态",()=>conditionDialog(state,r,refresh),glyph.flag,"amber row-button");
        left.append(marks,flag);
        const fields=["h","g","i"].map((key,index)=>{
            const field=input(["当前生命值","最大生命值","先攻值"][index],r[key],v=>{r[key]=numberValue(v,r[key]);refresh();});
            field.className="row-input "+key;return field;
        });
        const eye=btn("玩家可见",()=>{r.v=!r.v;refresh();}," ", "row-button");
        const del=btn("删除 (按住SHIFT删除相似的)",e=>{
            state.r=state.r.filter(v=>e.shiftKey?!sameGroup(v,r):v!==r);refresh();
        },glyph.trash,"red row-button");
        const health=el("div","health-fields");health.append(fields[0],el("span","slash","/"),fields[1]);
        row.append(left,stats,health,fields[2],eye,del);
        row.sync=()=>{
            row.classList.toggle("active",!!r.a);
            if(r.s){
                left.firstChild.textContent=r.n_m||r.n_d||r.n;
                left.children[1].hidden=!state.r.some(x=>x!==r&&sameGroup(x,r));
                left.children[1].textContent="("+(r.o||1)+")";
            }
            else name.value=r.n||"";
            name.disabled=fields[2].disabled=del.disabled=locked.has(state);
            for(const b of left.querySelectorAll("button:not(.row-button)")) b.disabled=locked.has(state);
            ["h","g","i"].forEach((k,i)=>fields[i].value=r[k]??"");
            fields[0].dataset.wound=wound(state,r);
            eye.firstChild.textContent=r.v?glyph.visible:glyph.hidden;eye.classList.toggle("blue",!!r.v);
            eye.title=r.v?"玩家视图中显示":"玩家视图中隐藏";
            marks.replaceChildren(...(r.c||[]).map(c=>{
                const b=btn(c.entity.name || "状态",e=>{
                    if(e.ctrlKey || e.metaKey)r.c=r.c.filter(x=>x!==c);else c.entity.turns=(c.entity.turns||0)+1;
                    refresh();
                });b.className="condition";b.textContent="";b.style.backgroundColor=c.entity.color;
                b.title=c.entity.name+(c.entity.turns?" (剩余 "+c.entity.turns+" 回合; CTRL+左键点击清除)":"");
                b.oncontextmenu=e=>{e.preventDefault();if(!c.entity.turns || --c.entity.turns<=0)r.c=r.c.filter(x=>x!==c);refresh();};
                return b;
            }));
            stats.replaceChildren(...(state.k?state.c:[]).map(col=>renderCell(col,r,refresh)));
        };
        return row;
    }
    const add=btn("添加玩家",async()=>{const row=newRow();if(state.c.length)await fillColumns(state.c,row,null);state.r.push(row);refresh();},glyph.add,"blue");
    const addMon=btn("添加生物",async()=>{
        const {d,body}=dialog("添加生物"),q=input("搜索生物","",()=>{}),results=el("div","choices");
        const count=input("数量",1,()=>{});count.type="number";count.min=1;q.placeholder="搜索生物";body.append(q,count,results);q.focus();
        const cat=await monsters();
        function search(){
            const query=q.value.trim().toLowerCase();
            const rows=[];for(const r of cat.rows) {if((r.n+" "+r.e+" "+r.s).toLowerCase().includes(query))rows.push(r);if(rows.length===75)break;}
            results.replaceChildren(...rows.map(r=>{
                const line=el("div","monster-choice");
                async function addCreature(options={},alias){
                    const {object,manifest}=await import("./screen-data.js");
                    const card=(await object(cat.packs[r.p]))[r.id];
                    const mon=(await scaleScreenMonster(card,options,(await manifest()).monsters.runtime,object)).model;
                    const n=Number(count.value),extra=[];if(!Number.isSafeInteger(n)||n<1)throw Error("请输入有效数量");
                    let scores={};
                    for(let i=0;i<n;i++){
                        const row=await monsterRow(state,mon,[...state.r,...extra],scores);
                        if(alias)row.n_m=alias;
                        extra.push(row);if(state.rg)scores={i:row.i,hp:row.g};
                    }
                    state.r.push(...extra);d.close();refresh();
                }
                line.append(btn(r.n+" · "+r.s,()=>addCreature()),btn("自定义生物",async()=>{
                    const mon=await monsterModel(cat,r),modal=dialog("自定义生物 — "+r.n);
                    const alias=input("自定义名字","",()=>{}),base=mon.cr?.cr ?? mon.cr,fields=new Map();
                    modal.body.append(el("label","","自定义名字"),alias);
                    function choice(key,label,values){
                        const sel=el("select");fields.set(key,sel);sel.setAttribute("aria-label",label);sel.add(new Option("—",""));
                        for(const v of values)sel.add(new Option(v,v));
                        sel.onchange=()=>{if(sel.value)for(const other of fields.values())if(other!==sel)other.value="";};
                        modal.body.append(el("label","",label),sel);
                    }
                    if(/^(?:0|1\/[248]|[1-9]\d*)$/.test(String(base)))choice("cr","挑战等级",["0","1/8","1/4","1/2",...Array.from({length:30},(_,i)=>String(i+1))]);
                    if(mon.summonedBySpellLevel!=null)choice("spell","法术环阶",Array.from({length:10-mon.summonedBySpellLevel},(_,i)=>i+mon.summonedBySpellLevel));
                    if(mon.summonedByClass || mon.summonedScaleByPlayerLevel)choice("classLevel","职业等级",Array.from({length:20},(_,i)=>i+1));
                    modal.body.append(btn("确定",async()=>{
                        const options=Object.fromEntries([...fields].filter(([,f])=>f.value).map(([key,f])=>[key,f.value]));
                        await addCreature(options,alias.value.trim());modal.d.close();
                    }));
                },"\ue019"));return line;
            }));
        }
        q.oninput=search;search();
    },glyph.monster,"green");
    const round=input("回合",state.n,v=>{state.n=Math.max(1,Math.trunc(Number(v))||1);refresh();});round.className="round-input";
    const alpha=btn("按字母排序",()=>{sortBy(state,"ALPHA");refresh();},glyph.alpha),
        number=btn("按先攻值排序",()=>{sortBy(state,"NUMBER");refresh();},glyph.number);
    const lock=btn("锁定追踪器",()=>{if(locked.has(state))locked.delete(state);else locked.add(state);refresh(false);},glyph.lock,"red");
    const settings=btn("配置",()=>{
        const {body}=dialog("设置");
        for(const [key,label] of Object.entries(settingLabels)){
            const line=el("label"),c=el("input");c.type="checkbox";c.checked=state[key];
            c.onchange=()=>{state[key]=c.checked;refresh();};line.append(c,document.createTextNode(label));body.append(line);
        }
        body.append(btn("默认队伍",()=>defaultParty(state,refresh)),btn("附加列",()=>statColumns(state,refresh)),btn("重新掷先攻",reroll));
    },glyph.settings);
    function chooseColumns(){
            return new Promise(resolve=>{
                const modal=dialog("Overwrite Additional Columns");
                let choice="cancel";
                for(const label of ["Yes","No","Cancel"])modal.body.append(btn(label,()=>{choice=label.toLowerCase();modal.d.close();}));
                modal.d.addEventListener("close",()=>resolve(choice),{once:true});
            });
        }
    async function importAndRefresh(raw){
        if(locked.has(state))throw Error("追踪器已锁定");
        if(!raw)throw Error("没有保存的遭遇");
        if(await importEncounter(state,raw,chooseColumns)===false)return false;
        refresh();return true;
    }
    root.addEventListener("clock-encounter",e=>{e.detail.result=importAndRefresh(e.detail.raw);});
    const load=btn("从怪物图鉴导入遭遇",async()=>{
        const {d,body}=dialog("从怪物图鉴导入遭遇");
        async function use(raw){if(await importAndRefresh(raw))d.close();}
        body.append(btn("当前遭遇",async()=>use(await readSlot("sublist"))),fileInput("遭遇文件",use));
        for(const {entity} of (await namedSaves()).state.saves.filter(r=>r.entity.manager_isSaved))body.append(btn(entity.name,()=>use(entity)));
    },glyph.load,"green");
    const reset=btn("重置追踪器",()=>{if(confirm("重置追踪器？")){state.r=structuredClone(state.rdp);state.n=1;state.s="NUMBER";state.d="DESC";refresh();}},glyph.trash,"red");
    const foundry=btn("Send to Foundry",async()=>{
        if(locked.has(state))return;
        const {body,d}=dialog("Encounter Actor Name"),name=input("Encounter Actor Name","",()=>{});
        body.append(name,btn("发送",async()=>{
            const cat=await monsters(),groups=new Map();
            for(const row of state.r.filter(r=>r.s)){
                const key=JSON.stringify([row.n,row.s,row.n_scr,row.n_ssp,row.n_scl]);
                if(groups.has(key)){groups.get(key).count++;continue;}
                const entry=cat.rows.find(e=>e.n===row.n && e.s===row.s);
                if(!entry)throw Error("找不到怪物："+row.n);
                const {object,manifest}=await import("./screen-data.js");
                const card=(await object(cat.packs[entry.p]))[entry.id];
                let creature=card.model;
                if([row.n_scr,row.n_ssp,row.n_scl].some(x=>x!=null)){
                    creature=(await scaleScreenMonster(card,{cr:row.n_scr,spell:row.n_ssp,classLevel:row.n_scl},(await manifest()).monsters.runtime,object)).model;
                }
                groups.set(key,{count:1,creature});
            }
            window.dispatchEvent(new CustomEvent("rivet.send",{detail:{type:"5etools.encounterbuilder.encounter",data:{
                encounterActorName:name.value,creatureMetasSerial:Array.from(groups.values())}}}));
            d.close();
        }));
    },"\ue171");
    const left=el("div","control-cluster"),right=el("div","control-cluster");
    left.append(group(add,addMon),group(btn("上一回合",()=>advance(-1),glyph.prev),btn("下一回合",()=>advance(1),glyph.next)),round);
    const players=btn("配置玩家视图",e=>configurePlayers(state,e),glyph.players,"blue");
    players.title='配置玩家视图 (按住SHIFT打开"标准"视图配置)';
    right.append(players,group(lock,settings),group(load,foundry,reset));
    foot.append(left,group(alpha,number),right);
    refresh(false);
}

