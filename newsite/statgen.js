import {
    abilities,modes,entities,baseKey,choiceKey,int,cap,modifier,rule,defaultRules,
    featCount,featSetKey,loadState,saveState,scores,remaining,resetMode,
    clampPointBuy,getEntity,selectEntityAbility,
} from "./statgen-state.js";
import {readState,writeState,downloadState} from "./statgen-storage.js";
import {rail,panel,button,labels} from "./statgen-view.js";
import {openPicker} from "./statgen-picker.js";
import {evaluateRoll} from "./item-interactions.js";

const overLimit = "In general, you can't increase an ability score above 20.";
const isSave = value => value?.state && typeof value.state==="object" && !Array.isArray(value.state);
function bookmark() {
    const [tab,code]=location.hash.slice(1).split(",",2);
    let saved;
    if(code){try{saved=JSON.parse(decodeURIComponent(code));}catch{/* Ignore an incomplete bookmark. */}}
    return {mode:modes.includes(tab) ? tab : modes[0],saved};
}

function adjacentRule(state,direction){
    const ordered=state.pb_rules.map(r=>r.entity).sort((a,b)=>direction*(b.score-a.score));
    const [end,prev]=ordered;
    const delta=prev ? end.cost-prev.cost : direction;
    return rule(end.score+direction,direction<0 ? Math.max(0,end.cost+Math.min(delta,0)) : end.cost+(delta>=0?delta:1));
}

function numberEdit(raw,before,fallback){
    const text=raw.trim();
    if(!text)return fallback;
    const forced=text.startsWith("=");
    const relative=!forced && (before<0?/^[+/*^]/:/^[-+/*^]/).test(text);
    const body=forced||relative?text.slice(1).trim():text;
    if(!relative && Number.isFinite(Number(body)))return int(body);
    try{
        const value=relative?evaluateRoll(body).total:null;
        const expression=relative?String(before||0)+text[0]+String(value):body;
        return int(evaluateRoll(expression).total,fallback);
    }catch{return fallback;}
}

function randomPointBuy(state){
    resetMode(state,"pointbuy");
    clampPointBuy(state);
    const keys=abilities.map(ab=>"pb_"+ab);
    const draft=Object.fromEntries(keys.map(key=>[key,state[key]]));
    let available=[...keys];
    for(let i=0;i<10000 && available.length && remaining(state,draft)>0;i++){
        const key=available[Math.floor(Math.random()*available.length)];
        draft[key]++;
        if(!state.pb_rules.some(r=>r.entity.score===draft[key]) || remaining(state,draft)<0){
            draft[key]--;
            available=available.filter(k=>k!==key);
        }
    }
    if(remaining(state,draft)===0)Object.assign(state,draft);
}

export async function showStatgen(ctx){
    const {root,signal}=ctx;
    let data=ctx.data;
    const start=bookmark();
    let mode=start.mode;
    let storageError;
    let initial=start.saved;
    if(!isSave(initial))try{initial=await readState();}catch(error){storageError=error.message;}
    if(signal.aborted)return;
    let state=loadState(data,initial), pendingSave=0, statusTimer=0, rolling=false;
    const filters=Object.fromEntries(["races","backgrounds","feats"].map(kind=>[kind,new Map()]));
    const editStarts=new WeakMap();
    const page=document.createElement("section");
    page.className="sg-page";
    const pane=document.createElement("div");
    pane.className="sg-pane";
    const column=document.createElement("div");
    column.className="sg-body";
    const heading=document.createElement("h2");
    heading.className="sg-mode-heading";
    column.append(heading,pane);
    const tabs=document.createElement("div");
    tabs.className="sg-tabs";
    const status=document.createElement("output");
    status.className="sg-status";
    status.setAttribute("role","status");
    const file=Object.assign(document.createElement("input"),{type:"file",accept:".json,application/json",hidden:true});
    file.dataset.sg="file";
    page.append(tabs,column,status,file);
    root.replaceChildren(page);
    root.scrollTop=0;
    const rulesControl=document.createElement("label");
    rulesControl.innerHTML='属性值生成规则 <select aria-label="属性值生成规则"><option value="one">新版 (5.5e/2024)</option><option value="classic">旧版 (5e/2014)</option></select>';
    const rulesSelect=rulesControl.querySelector("select");
    rulesSelect.value=data.classicAllowed?"classic":"one";
    document.getElementById("settings-panel").append(rulesControl);

    function notice(message,error=false){
        if(signal.aborted)return;
        status.textContent=message;
        status.classList.toggle("sg-status-error",error);
        clearTimeout(statusTimer);
        statusTimer=setTimeout(()=>{status.textContent="";},3500);
    }
    function save(){
        clearTimeout(pendingSave);
        pendingSave=0;
        writeState(saveState(state,data)).catch(error=>notice(error.message,true));
    }
    function update(rebuild=true){
        if(rebuild)render();
        else refresh();
        clearTimeout(pendingSave);
        pendingSave=setTimeout(save,100);
    }
    function flush(){if(pendingSave)save();}
    signal.addEventListener("abort",()=>{flush();clearTimeout(statusTimer);rulesControl.remove();},{once:true});
    window.addEventListener("pagehide",flush,{signal});
    rulesSelect.addEventListener("change",async()=>{
        rulesSelect.disabled=true;
        try{
            const style=rulesSelect.value;
            const scope=["all","manual"].includes(ctx.mode)?"all":"rec";
            const next=await ctx.object(ctx.manifest.statgen[style==="classic"?"classic-"+scope:scope]);
            if(signal.aborted)return;
            const saved=saveState(state,data);
            const config=JSON.parse(localStorage.getItem("config"))||{};
            config.styleSwitcher={...config.styleSwitcher,style};
            localStorage.setItem("config",JSON.stringify(config));
            data=next;
            Object.values(filters).forEach(f=>f.clear());
            state=loadState(data,saved);
            update();
        }catch(error){
            rulesSelect.value=data.classicAllowed?"classic":"one";
            notice(error.message,true);
        }finally{rulesSelect.disabled=false;}
    },{signal});
    function changeMode(next){
        if(!modes.includes(next) || mode===next)return;
        history.pushState(history.state,"","#"+next);
        mode=next;
        render();
    }
    function previews(){
        for(const [ns,kind,suffix] of entities){
            const entry=getEntity(data,state,ns);
            if(!entry || !state["common_isPreview"+suffix])continue;
            const host=pane.querySelector(`[data-preview="${ns}"]`);
            renderPreview(host,kind,entry.hash);
        }
        if(state.common_isAllowTashasRules && state.common_isShowTashasRules){
            renderPreview(pane.querySelector('[data-preview="origin"]'),"variantrules","customizing%20your%20origin_tce");
        }
    }
    async function renderPreview(host,kind,hash){
        try{
            const result=await ctx.previewData(kind+".html",hash);
            if(!host.isConnected||signal.aborted)return;
            const body=result?.card?.html;
            if(body)host.innerHTML=body;
            else host.textContent=data[kind]?.find(e=>e.hash===hash)?.name||"";
        }catch(error){if(host.isConnected)host.textContent=error.message;}
    }
    function render(){
        tabs.innerHTML=rail(mode);
        heading.textContent=labels[modes.indexOf(mode)];
        pane.dataset.mode=mode;
        pane.innerHTML=panel(data,state,mode);
        refresh();
        previews();
    }
    function refresh(){
        const result=scores(data,state,mode);
        const total=pane.querySelectorAll('[data-sg="total"]'), mod=pane.querySelectorAll('[data-sg="modifier"]');
        abilities.forEach((ab,i)=>{
            const n=result[ab];
            total[i].value=n;
            total[i].classList.toggle("sg-error",n>20);
            total[i].title=n>20?overLimit:"";
            mod[i].value=modifier(n);
            state["common_export_"+ab]=n;
        });
        state.pb_points=remaining(state);
        const budget=pane.querySelector('[data-sg="remaining"]');
        if(budget){
            budget.value=state.pb_points;
            budget.classList.toggle("sg-over-budget",state.pb_points<0);
        }
        pane.querySelectorAll("[data-entity-check]").forEach(input=>{
            const {entityCheck,choice,ab,ix}=input.dataset;
            input.checked=state[choiceKey(entityCheck,choice)].some(it=>it.ability===ab&&(choice==="From"||it.ix===Number(ix)));
        });
        pane.querySelectorAll("[data-feat-check]").forEach(input=>{
            input.checked=!!state[input.dataset.featCheck+"__isActive_"+input.dataset.choiceIx];
        });
        pane.querySelectorAll('[data-sg="asi-score"]').forEach(input=>{
            if(input===document.activeElement)return;
            const [,prefix,i]=input.dataset.key.split(":");
            input.value=Number(state[prefix+"asiPointOne"]===Number(i))+Number(state[prefix+"asiPointTwo"]===Number(i));
        });
        if(mode==="rolled"||mode==="array")pane.querySelectorAll('[data-sg="base"]').forEach(input=>{
            input.value=state[input.dataset.key]??-1;
        });
    }

    function resetChoices(ns){
        state[choiceKey(ns,"From")]=[];
        state[choiceKey(ns,"Weighted")]=[];
    }
    function resetEntity(ns,suffix){
        resetChoices(ns);
        for(const key of Object.keys(state)){
            if(key.startsWith(`common_additionalFeats_${ns}_`))delete state[key];
        }
        state[featSetKey(ns)]=0;
        state["common_ixAbilityScoreSet"+suffix]=0;
    }
    function clearFeatChoices(prefix){
        for(const key of Object.keys(state))if(key.startsWith(prefix+"featAbilityChooseFrom"))delete state[key];
    }
    function changeInput(input,final){
        const {key}=input.dataset;
        if(!key)return;
        const val=input.value;
        function edit(before,fallback){
            if(!editStarts.has(input))editStarts.set(input,before);
            const result=numberEdit(val,editStarts.get(input),fallback);
            if(final)editStarts.delete(input);
            return result;
        }
        if(key.startsWith("cost:")){
            const item=state.pb_rules[Number(key.split(":")[1])].entity;
            item.cost=Math.max(0,edit(item.cost,0));
            if(final)input.value=item.cost;
        }else if(key.startsWith("asi-score:")){
            const [,prefix,i]=key.split(":"), point=Number(i);
            const p1=prefix+"asiPointOne",p2=prefix+"asiPointTwo";
            const active=[p1,p2].filter(k=>state[k]===point);
            if(+val<=0)active.forEach(k=>{state[k]=null;});
            else if(+val>=2)state[p1]=state[p2]=point;
            else if(active.length===2)state[p2]=null;
            else if(!active.length)state[state[p1]==null?p1:p2]=point;
            if(final)input.value=Number(state[p1]===point)+Number(state[p2]===point);
        }else if(key==="rolled_formula"){
            state[key]=val;
            input.classList.remove("sg-error");
        }else if(input.tagName==="SELECT"){
            const ix=Number(val);
            if((mode==="rolled"||mode==="array") && input.dataset.sg==="base"){
                abilities.forEach(ab=>{const k=baseKey(mode,ab);if(state[k]===ix)state[k]=null;});
            }
            state[key]=ix<0?null:ix;
            if(key.startsWith("common_ixAbilityScoreSet")){
                resetChoices(key.endsWith("Race")?"race":"background");
                return update();
            }
            if(key.endsWith("ixFeatAbility")){
                clearFeatChoices(key.slice(0,-"ixFeatAbility".length));
                return update();
            }
            if(key.endsWith("_ixSel"))return update();
        }else if(input.type==="checkbox"){
            state[key]=input.checked;
            if(key==="pb_isCustom" && !input.checked){
                state.pb_rules=defaultRules();
                clampPointBuy(state);
            }
            if(key==="common_isTashas")resetChoices("race");
            return update();
        }else{
            const countKey=["common_cntAsi","common_cntFeatsCustom"].includes(key);
            const n=edit(state[key],countKey?editStarts.get(input)??state[key]:0);
            state[key]=countKey?featCount(n):n;
            if(key==="rolled_rollCount")state[key]=cap(state[key],1,1000);
            if(key==="pb_budget")state[key]=Math.max(0,state[key]);
            if(key.startsWith("pb_")&&key!=="pb_budget")clampPointBuy(state);
            if(key==="common_cntAsi"||key==="common_cntFeatsCustom"){
                if(final)update();
                return;
            }
            if(final && input.value!==String(state[key]))input.value=state[key];
        }
        update(false);
    }
    function setFeatCheck(input){
        const {featCheck:key,choiceIx,choiceLength,choiceCount}=input.dataset;
        const i=Number(choiceIx),count=Number(choiceCount),len=Number(choiceLength);
        const active=Array.from({length:len},(_,j)=>j).filter(j=>state[key+"__isActive_"+j]&&j!==i);
        if(input.checked && active.length>=count)state[key+"__isActive_"+active.shift()]=false;
        state[key+"__isActive_"+i]=input.checked;
        state[key+"__length"]=len;
        state[key+"__isAcceptable"]=active.length+Number(input.checked)===count;
        update(false);
    }
    function importState(saved, persist=true){
        if(!isSave(saved))throw Error("属性存档格式无效");
        state=loadState(data,saved);
        if(persist)update();
        else render();
    }
    function pick(kind,filtered,anchor,prefix){
        const entity=entities.find(e=>e[1]===kind), suffix=entity?.[2];
        openPicker({page,data,kind,filtered,anchor,signal,selected:filters[kind],renderPreview,
            category:prefix ? anchor.closest(".sg-asi-row").dataset.category : "",
            active:prefix ? state[prefix+"ixFeat"] : state["common_ix"+suffix],
            select(index){
                if(prefix){
                    state[prefix+"ixFeat"]=index;
                    state[prefix+"ixFeatAbility"]=0;
                    clearFeatChoices(prefix);
                }else{
                    state["common_ix"+suffix]=index;
                    resetEntity(entity[0],suffix);
                }
                update();
            },
        });
    }
    function codeMenu(anchor){
        const existing=page.querySelector(".sg-code-menu");
        if(existing){existing.remove();return;}
        const el=document.createElement("div");
        el.className="sg-code-menu";
        el.innerHTML=button("code-out","导出为代码")+button("code-in","从代码导入");
        anchor.after(el);
    }
    async function pasteCode(){
        const dlg=document.createElement("dialog");
        dlg.className="sg-dialog sg-code-dialog";
        dlg.innerHTML='<form method="dialog"><h4>Enter Code</h4><textarea aria-label="Enter Code"></textarea><footer><button class="sg-btn" value="cancel">取消</button><button class="sg-btn sg-primary" value="ok">确定</button></footer></form>';
        page.append(dlg);
        dlg.showModal();
        await new Promise(resolve=>dlg.addEventListener("close",resolve,{once:true}));
        const raw=dlg.querySelector("textarea").value, ok=dlg.returnValue==="ok";
        dlg.remove();
        if(!ok)return;
        let json;
        try{json=JSON.parse(raw);}
        catch(error){return notice("Failed to decode JSON! "+error.message,true);}
        if(!Array.isArray(json)||json.length<2||!Number.isFinite(Number(json[0]))
            ||json.slice(1).some(row=>!Array.isArray(row)||row.length<2||row.slice(0,2).some(x=>x==null||!Number.isFinite(Number(x)))))return notice("Code was not valid!",true);
        state.pb_budget=Number(json[0]);
        state.pb_rules=json.slice(1).map(([score,cost])=>rule(Number(score),Number(cost)));
        state.pb_isCustom=true;
        clampPointBuy(state);
        update();
        notice("Imported!");
    }
    async function rollNow(){
        if(rolling)return;
        rolling=true;
        try{
            const [{roll},parser]=await Promise.all([import("./statgen-dice.js"),ctx.object(ctx.manifest.statgen.dice)]);
            const rolls=await roll(parser,state.rolled_formula,state.rolled_rollCount,notice,signal);
            if(signal.aborted)return;
            state.rolled_rolls=rolls;
            for(const ab of abilities){
                const key=baseKey("rolled",ab);
                if(state[key]>=rolls.length)state[key]=null;
            }
            update();
        }catch{
            if(!signal.aborted)pane.querySelector('[data-sg="formula"]')?.classList.add("sg-error");
        }finally{rolling=false;}
    }
    async function action(el,event){
        const [verb,key]=el.dataset.sgAction.split(":");
        if(verb==="mode")return changeMode(key);
        if(verb==="roll")return rollNow();
        if(verb==="upload")return file.click();
        if(verb==="download")return downloadState(saveState(state,data));
        if(verb==="share"){
            const url=new URL(location.href);
            url.hash="pointbuy,"+encodeURIComponent(JSON.stringify(saveState(state,data)));
            await navigator.clipboard.writeText(url.href);
            return notice("已复制");
        }
        if(verb==="code-menu")return codeMenu(el);
        if(verb==="count-up"||verb==="count-down"){
            state[key]=featCount(state[key]+(event.shiftKey?5:1)*(verb==="count-up"?1:-1));
            update();
            return;
        }
        if(verb==="code-out"){
            el.parentElement.remove();
            await navigator.clipboard.writeText(JSON.stringify([state.pb_budget,...state.pb_rules.map(({entity})=>[entity.score,entity.cost])]));
            return notice("已复制");
        }
        if(verb==="code-in"){el.parentElement.remove();return pasteCode();}
        if(verb==="pick"||verb==="filter")return pick(key,verb==="filter",el);
        if(verb==="pickfeat")return pick("feats",true,el,key);
        if(verb==="reset-all"){
            if(!confirm("This will reset all inputs in all tabs.\n你确定吗？"))return;
            state=loadState(data);
        }else if(verb==="reset"){
            resetMode(state,mode);
            clampPointBuy(state);
        }else if(verb==="assign"){
            const abs=[...abilities];
            for(let i=abs.length-1;i>0;i--){
                const j=Math.floor(Math.random()*(i+1));
                [abs[i],abs[j]]=[abs[j],abs[i]];
            }
            abs.forEach((ab,i)=>{state[baseKey(mode,ab)]=mode==="array"||i<state.rolled_rolls.length?i:null;});
        }else if(verb==="random-buy")randomPointBuy(state);
        else if(verb==="preview")state["common_isPreview"+key]=!state["common_isPreview"+key];
        else if(verb==="origin-note")state.common_isShowTashasRules=!state.common_isShowTashasRules;
        else if(verb==="lower"||verb==="upper"){
            const newRule=adjacentRule(state,verb==="lower"?-1:1);
            state.pb_rules[verb==="lower"?"unshift":"push"](newRule);
        }else if(verb==="remove-rule"){
            state.pb_rules.splice(Number(key),1);
            clampPointBuy(state);
        }else if(verb==="reset-rules"){
            state.pb_rules=defaultRules();
            clampPointBuy(state);
        }else if(verb==="feat"||verb==="asi")state[key+"mode"]=verb;
        update();
    }

    page.addEventListener("click",event=>{
        const el=event.target.closest("button[data-sg-action]");
        if(el)action(el,event).catch(error=>notice(error.message,true));
    });
    page.addEventListener("input",({target})=>{
        if(target.matches('input[data-key]:not([type="checkbox"])'))changeInput(target,false);
    });
    page.addEventListener("change",({target})=>{
        const {entityCheck,ab,choice,ix,amount,count,featCheck}=target.dataset;
        if(entityCheck){
            selectEntityAbility(state,entityCheck,ab,{type:choice,ix:Number(ix),amount:Number(amount),count:Number(count)});
            update(false);
        }else if(featCheck)setFeatCheck(target);
        else changeInput(target,true);
    });
    page.addEventListener("keydown",event=>{
        if(event.key==="Enter"&&["rolled_formula","rolled_rollCount"].includes(event.target.dataset.key)){
            event.preventDefault();
            rollNow();
        }
    });
    file.addEventListener("change",async()=>{
        try{if(file.files[0])importState(JSON.parse(await file.files[0].text()));}
        catch(error){notice(error.message,true);}
        file.value="";
    });
    Object.defineProperty(page,"statgen",{value:{
        load:value=>importState(value,false), mode:changeMode, save:()=>saveState(state,data),
        choices:kind=>data[kind].filter(e=>e.visible).map(e=>e.hash),
    }});
    render();
    if(isSave(start.saved)){
        history.replaceState(history.state,"","#"+mode);
        pendingSave=setTimeout(save,100);
    }
    if(storageError)notice(storageError,true);
    page.dataset.ready="true";
}
