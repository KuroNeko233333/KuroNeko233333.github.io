import {retireDialog} from "./motion.js";
import {mediaUrl,tryImageMirror} from "./card-media.js";
import {crNumber,encounterResult,fitCrBudget,formatCr,MCDM} from "./encounter-rules.js";
import {readEncounter,readSlot,writeSlot,namedSaves,saveNamed} from "./encounter-store.js";
const fmt=n=>n.toLocaleString("en-US");
const elem=(tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;return el;};
const button=(text,fn)=>{const b=elem("button",text);b.type="button";b.onclick=fn;return b;};
const iconButton=(code,label,act)=>{
    const el=button("",act),icon=elem("span");
    icon.dataset.glyph=String.fromCharCode(parseInt(code,16));
    el.title=label;el.setAttribute("aria-label",label);icon.className="enc-glyph";icon.setAttribute("aria-hidden","true");el.append(icon);return el;
};
const selector=(pairs,v,fn)=>{const s=elem("select");for(const [key,name] of pairs)s.add(new Option(name,key));s.value=v;s.onchange=()=>fn(s.value);return s;};
const integer=n=>Array.from({length:n},(_,i)=>[i+1,i+1]);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function downloadJson(name,data){
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    const link=elem("a");link.href=url;link.download=name+".json";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function showEncounter({root,table,catalog,fullCatalog,picture,visible,close,scaled,warmScale}){
    const [current,preferences,rosterHeight]=await Promise.all([
        readSlot("sublist"),readSlot("encounterBuilderUiStateState"),readSlot("SUBLIST_RESIZE")
    ]);
    if(!root.isConnected)return;
    let shape,randomTier,adjustTier,sortKey="name",descending=false;
    const ruleOptions=[["one","现代 (5.5e/2024)"],["classic","经典 (5e/2014)"]];
    // A tab pinned to the previous release only has that release's two tables.
    if(table[MCDM])ruleOptions.push([MCDM,"MCDM 'Flee, Mortals!'"]);
    const pref=preferences||{};
    pref.state??={};pref.stateRulesComps??={};
    const supportsRule=id=>ruleOptions.some(([key])=>key===id);
    let doc=readEncounter(current),rules=supportsRule(pref.state.activeRulesId)?pref.state.activeRulesId:"one";
    const shapeHashes=table.shapeHashes||{
        random:encodeURIComponent("随机_无来源").toLowerCase(),
        custom:encodeURIComponent("自定义_无来源").toLowerCase()
    };
    const standardXp=new Map(table.cr.map(row=>[crNumber(row._cr),Number(String(row.xp).replaceAll(",",""))]));
    let lookup=new Map(catalog.rows.map(r=>[r.h,r]));
    const modelCache=new Map();
    function visibleChoices(){
        const rows=visible();
        // A new source filter can expose monsters outside the catalogue used at mount.
        for(const row of rows)if(!lookup.has(row.h))lookup.set(row.h,row);
        return rows;
    }
    function group(item){
        const r=modelCache.get(item.customHashId)||lookup.get(item.h),cr=crNumber(r?.cr);
        return {name:r?.n||decodeURIComponent(item.h),count:+(item.c??1),cr,xp:r?.xp??0,standardXp:standardXp.get(cr)||0,hp:r?.hp,ac:r?.ac};
    }
    const advanced=()=>doc.activePartyId==="customAdvanced";
    const party=()=>doc.statePartyComps[doc.activePartyId].state;
    const players=()=>advanced()?party().playersAdvanced.map(p=>({level:+p.level,count:1})):party().playersSimple.map(p=>({level:+p.level,count:+p.count}));
    const calc=(items=doc.items)=>encounterResult(rules,table,players(),items.map(group));
    const status=elem("output");status.className="enc-status";status.setAttribute("aria-live","polite");
    const warn=e=>status.textContent=e.message;
    let pending=Promise.resolve(),drawTicket=0;
    let preferenceWrite=Promise.resolve();
    function syncPreferences(){
        const entry=pref.stateRulesComps[rules]??={state:{}};
        Object.assign(entry.state,{tierRandom:randomTier,tierAdjust:adjustTier,shapeHashRandom:shapeHashes[shape]});
        pref.state.activeRulesId=rules;
        pref.state.activePartyId=doc.activePartyId;
        const snapshot=structuredClone(pref);
        preferenceWrite=preferenceWrite.catch(()=>{}).then(()=>writeSlot("encounterBuilderUiStateState",snapshot));
        preferenceWrite.catch(warn);
    }
    function restoreRule(){
        const defaultTier=({one:"moderate",classic:"medium",[MCDM]:"standard"})[rules];
        const saved=pref.stateRulesComps[rules]?.state;
        randomTier=Object.hasOwn(table[rules],saved?.tierRandom)?saved.tierRandom:defaultTier;
        adjustTier=Object.hasOwn(table[rules],saved?.tierAdjust)?saved.tierAdjust:defaultTier;
        shape=saved?.shapeHashRandom===shapeHashes.custom?"custom":"random";
    }
    restoreRule();
    const exportEncounter=()=>({...doc,activeRulesId:rules,stateRulesComps:structuredClone(pref.stateRulesComps)});
    function persist(){
        doc.sources=[...new Set(doc.items.map(i=>lookup.get(i.h)?.s||doc.sources?.find(s=>i.h.endsWith("_"+s.toLowerCase()))).filter(Boolean))];
        const snapshot=structuredClone(doc);
        pending=pending.catch(()=>{}).then(()=>writeSlot("sublist",snapshot));pending.catch(warn);
    }
    root.innerHTML='<div class="enc-page"><section class="enc-settings"><div class="enc-rules"><h4>设置</h4><label><strong>规则</strong></label><p></p></div><div class="enc-random"></div><div class="enc-shape"></div></section><section class="enc-roster" hidden><div class="enc-mon-head"></div><div class="enc-roster-scroll" tabindex="0" aria-label="遭遇怪物列表"></div><div class="enc-roster-grip" role="separator" tabindex="0" aria-label="调整遭遇列表高度" aria-orientation="horizontal">...</div></section><div class="enc-named" hidden></div><section class="enc-group"><h4>小队信息</h4><label><strong>模式:</strong></label><hr><div class="enc-cols"><div class="enc-party"></div><div class="enc-budget"></div></div></section><section class="enc-difficulty"></section><footer></footer></div>';
    const $=s=>root.querySelector(s);
    const roster=$(".enc-roster"),grip=$(".enc-roster-grip");
    if(Number.isFinite(rosterHeight)&&rosterHeight>0)roster.style.height=rosterHeight+"px";
    let drag;
    grip.onpointerdown=e=>{
        if(e.button!==0)return;
        e.preventDefault();
        drag={y:e.clientY,height:e.clientY-roster.getBoundingClientRect().top+grip.getBoundingClientRect().height};
        grip.setPointerCapture(e.pointerId);
    };
    grip.onpointermove=e=>{if(drag)roster.style.height=Math.max(75,drag.height+e.clientY-drag.y)+"px";};
    function saveRosterHeight(){
        writeSlot("SUBLIST_RESIZE",Math.round(roster.getBoundingClientRect().height)).catch(warn);
    }
    grip.onlostpointercapture=()=>{if(drag){drag=null;saveRosterHeight();}};
    grip.onkeydown=e=>{
        if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;
        e.preventDefault();
        roster.style.height=Math.max(75,roster.getBoundingClientRect().height+(e.key==="ArrowUp"?-10:10))+"px";
        saveRosterHeight();
    };
    const rulesSelect=selector(ruleOptions,rules,v=>{rules=v;restoreRule();syncPreferences();draw();});
    $(".enc-settings label").append(rulesSelect);
    const mode=selector([["custom","基础"],["customAdvanced","Advanced"]],doc.activePartyId,v=>{doc.activePartyId=v;draw();persist();syncPreferences();});
    $(".enc-group label").append(mode);
    function renderResult(){
        const r=calc(),classic=rules==="classic",mcdm=rules===MCDM,box=$(".enc-budget");box.replaceChildren();
        updateShapeBudget(r.budget[randomTier]);
        const score=mcdm?formatCr:fmt;
        for(const [t,xp] of Object.entries(r.budget)){
            const line=elem("div"),label=elem("span",table.tiers[t]+":");
            if(mcdm)label.title=table.mcdmTitles[t];
            line.append(label," "+(r.count?(score(xp)||"?"):"?")+(mcdm?" CR":" XP"));
            if(t===r.tier)line.style.fontWeight="bold";
            box.append(line);
        }
        const meter=elem("div");meter.className="enc-meter";const fill=elem("i");
        const max=classic?2*r.budget.absurd-r.budget.deadly:(r.budget.extreme??r.budget.absurd);
        const colors=classic?{easy:"#00bb20",medium:"#c5ca00",hard:"#f7a100",deadly:"#cc0000",absurd:"#9b1d20"}:
            mcdm?{easy:"#00bb20",standard:"#c5ca00",hard:"#f7a100",extreme:"#cc0000"}:{low:"#00bb20",moderate:"#c5ca00",high:"#f7a100",absurd:"#cc0000"};
        fill.style.backgroundColor=colors[r.tier]||"transparent";
        fill.style.width=Math.min(100,100*r.adjusted/(max||1))+"%";
        fill.classList.toggle("full",r.adjusted>=max);
        meter.append(fill);
        let left=0;
        const thresholds=Object.entries(r.budget);
        thresholds.forEach(([t,xp],i)=>{
            const end=i===thresholds.length-1?100:Math.max(0,Math.min(100,100*(classic?thresholds[i+1][1]-1:xp)/(max||1)));
            if(i<thresholds.length-1 && r.count){
                const notch=elem("b");notch.style.left=end+"%";meter.append(notch);
                const zone=button("",e=>generate(t,!(e.ctrlKey||e.metaKey)));
                zone.setAttribute("aria-label",table.tiers[t]+"难度");zone.title=table.tiers[t]+"难度遭遇。点击调整，Ctrl + 点击随机生成。"+(mcdm?" "+table.mcdmTitles[t]:"");
                zone.style.left=left+"%";zone.style.width=Math.max(0,end-left)+"%";meter.append(zone);
            }
            left=end;
        });
        const ttk=elem("div"),rounds=elem("span","rnd.");rounds.className="enc-rounds";
        ttk.append(elem("span","TTK:"),r.count?" "+r.turns.toFixed(2)+" ":" ?");
        if(r.count)ttk.append(rounds);
        box.append(meter,elem("hr"),ttk,elem("hr"));
        const nextLevel=elem("div","升级所需XP: "+(r.xpNext?fmt(r.xpNext):"?")+" XP");
        if(classic)box.append(elem("div","每日XP: "+(r.daily?fmt(r.daily):"?")+" XP"));
        if(mcdm){
            const daily=elem("div"),label=elem("span","每日XP:");
            label.title="Daily encounter points budget. To give the characters a good but survivable challenge, fill each adventuring day with encounters that total 6 to 8 points over the course of the day.";
            daily.className="enc-daily";daily.append(label," 6-8");
            const xp=elem("div");xp.className="enc-mcdm-xp";
            xp.append(elem("div","Encounter XP: "+(r.standardXp?fmt(r.standardXp):"?")+" XP"),nextLevel);
            box.append(elem("div","Encounter Points: "+(table.mcdmPoints[r.tier]||"?")),daily,xp);
        }else box.append(nextLevel);
        const d=$(".enc-difficulty");d.replaceChildren();d.hidden=!r.relevant;
        if(r.relevant){
            const right=elem("div");right.append(elem("h4",(mcdm?"合计CR: ":"合计XP: ")+score(r.base)));
            const per=r.count?(mcdm?formatCr(r.base/r.count):fmt(Math.floor(r.base/r.count))):"";
            if(per)right.append(elem("i",mcdm?"每位玩家("+per+")":classic?"每位玩家 ("+per+")":"(每位玩家"+per+")"));
            if(classic){right.append(elem("h4","Adjusted XP (×"+r.mult+") : "+fmt(r.adjusted)));if(per)right.append(elem("i","(每位玩家"+fmt(Math.floor(r.adjusted/r.count))+")"));}
            const title=elem("h4");
            const tier=elem("span",table.tiers[r.tier]);tier.className="enc-help";
            title.append("难度: ",tier);if(mcdm)title.title=table.mcdmTitles[r.tier]||"";
            d.append(title,right);
        }
    }
    async function add(item){
        if(!lookup.has(item.h))lookup=new Map((await fullCatalog()).rows.map(r=>[r.h,r]));
        if(item.customHashId && !modelCache.has(item.customHashId)){const r=await scaled(item);if(r)modelCache.set(item.customHashId,r);}
        adjust(item.h,1,item.customHashId);
    }
    function adjust(h,delta,customHashId){
        if(!lookup.has(h)){const row=visible().find(r=>r.h===h);if(row)lookup.set(h,row);}

        const i=doc.items.find(item=>item.h===h && (item.customHashId||null)===(customHashId||null));
        if(i){i.c=String(+(i.c??1)+delta);if(+i.c<=0)doc.items.splice(doc.items.indexOf(i),1);}
        else if(delta>0)doc.items.push({h,c:String(delta),...(customHashId?{customHashId}:{})});
        drawRoster();renderResult();persist();
    }
    function drawRoster(){
        const list=$(".enc-roster-scroll"),header=$(".enc-mon-head");
        const scroll=list.scrollTop;list.replaceChildren();header.replaceChildren();
        roster.hidden=!doc.items.length;
        const bar=$(".enc-named");bar.hidden=!doc.items.length;
        const resetSaved=bar.querySelector("button:last-child");
        if(resetSaved)resetSaved.disabled=!doc.manager_isSaved;
        const nameInput=bar.querySelector("input");if(nameInput && nameInput!==document.activeElement)nameInput.value=doc.name||"";
        const pins=bar.querySelector("output");if(pins)pins.textContent=doc.items.length;
        if(!doc.items.length)return;
        for(const [key,label] of [["name","名称"],[""," "],["cr","CR"],["count","数量"]]){
            const b=button(label,()=>{descending=key===sortKey?!descending:false;sortKey=key;drawRoster();});
            b.disabled=!key;if(key===sortKey)b.dataset.direction=descending?"down":"up";header.append(b);
        }
        const compare=(a,b)=>a>b?1:a<b?-1:0;
        const ordered=doc.items.map(item=>({item,g:group(item)})).sort((a,b)=>(descending?-1:1)*(compare(a.g[sortKey],b.g[sortKey])||compare(a.g.name,b.g.name)));
        for(const {item,g} of ordered){
            const row=elem("div");row.className="enc-mon";
            const buttons=elem("span");
            const shuffle=iconButton("e110","随机怪物",()=>{if(item.l)return;const pool=visibleChoices().filter(r=>crNumber(r.cr)===g.cr && !doc.items.some(i=>i.h===r.h));
                if(!pool.length)return;item.h=pick(pool).h;delete item.customHashId;drawRoster();renderResult();persist();});
            shuffle.title="随机怪物";
            const lock=iconButton("e033","锁定怪物防止被随机/调整",()=>{item.l=!item.l;drawRoster();persist();});lock.title="锁定怪物防止被随机/调整";lock.setAttribute("aria-pressed",String(!!item.l));
            buttons.append(iconButton("002b","新增 (按住SHIFT加5个)",e=>adjust(item.h,e.shiftKey?5:1,item.customHashId)),iconButton("2212","减少 (按住SHIFT减5个)",e=>adjust(item.h,e.shiftKey?-5:-1,item.customHashId)),shuffle,lock);
            row.append(buttons,elem("span",g.name));
            for(const [label,tab] of [["数据卡","stats"],["Token","images"],["图片","images"]]){
                const a=elem("a",label),url=new URL("bestiary.html",location.href);url.hash=item.h;
                url.searchParams.set("tab",tab);a.href=url.href;
                if(label==="数据卡"){a.dataset.hoverPage="bestiary.html";a.dataset.hoverHash=item.h;}
                a.onclick=e=>e.stopPropagation();
                if(label!=="数据卡"){
                    let preview;
                    const hide=()=>{preview?.remove();preview=null;};
                    a.onmouseenter=a.onfocus=async()=>{
                        hide();const image=elem("img");preview=image;image.className="enc-preview";image.alt=label;
                        const path=await picture(item,label==="Token");if(!path||preview!==image||!a.isConnected)return;
                        image.onerror=()=>{if(!tryImageMirror(image))hide();};image.src=mediaUrl(path);
                        const rect=a.getBoundingClientRect();image.style.left=Math.min(innerWidth-230,rect.left)+"px";image.style.top=Math.min(innerHeight-230,rect.bottom)+"px";a.append(image);
                    };
                    a.onmouseleave=a.onblur=hide;
                }
                row.append(a);
            }
            const cr=elem("input"),count=elem("input");
            cr.setAttribute("aria-label","CR");const r=lookup.get(item.h);
            cr.onfocus=cr.onpointerenter=()=>warmScale(item.h);
            cr.value=(modelCache.get(item.customHashId)||r)?.cr??"—";
            cr.onchange=async()=>{
                const v=crNumber(cr.value.trim());if(v==null||!table.cr.some(entry=>crNumber(entry._cr)===v)){drawRoster();return;}
                const custom=v===crNumber(r.cr)?null:[r.n,r.s,v,"",""].join("__").toLowerCase();
                if(custom&&!modelCache.has(custom)){const updated=await scaled({...item,customHashId:custom});if(updated)modelCache.set(custom,updated);}
                const other=doc.items.find(i=>i!==item && i.h===item.h && (i.customHashId||null)===custom);
                if(other){other.c=String(+(other.c??1)+g.count);doc.items.splice(doc.items.indexOf(item),1);}else item.customHashId=custom;
                drawRoster();renderResult();persist();
            };
            count.value=g.count;count.setAttribute("aria-label","数量");
            count.onchange=()=>{const v=Number(count.value);if(Number.isSafeInteger(v) && v>=0)adjust(item.h,v-g.count,item.customHashId);else count.value=g.count;};
            const crCell=elem("span"),countCell=elem("span");
            if(g.cr==null)crCell.textContent=r?.cr??"—";
            else crCell.append(cr);
            countCell.append(count);row.append(crCell,countCell);list.append(row);
        }
        list.scrollTop=scroll;
    }
    function partyRows(){
        const host=$(".enc-party"),state=party(),adv=advanced();host.replaceChildren();
        const rows=adv?state.playersAdvanced:state.playersSimple,cols=state.colsExtraAdvanced||[];host.classList.toggle("enc-advanced",adv);
        const hdr=elem("div");hdr.className="enc-party-row enc-party-head";hdr.append(elem("span",adv?"Name":"玩家:"),elem("span",adv?"Level":"等级:"));host.append(hdr);
        const input=(value,fn)=>{const i=elem("input");i.value=value||"";i.oninput=()=>{fn(i.value);persist();};return i;};
        const removeCols=[];
        if(adv){
            for(const [j,c] of cols.entries()){
                const name=input(c.name,v=>c.name=v);
                const remove=iconButton("e020","删除列",()=>{cols.splice(j,1);for(const player of rows)player.extras?.splice(j,1);partyRows();persist();});
                removeCols.push(remove);hdr.append(name);
            }
            hdr.append(iconButton("e056","Add Column",()=>{cols.push({name:""});partyRows();persist();}));
        }
        rows.forEach((r,i)=>{
            const line=elem("div");line.className="enc-party-row";
            const change=(key,val)=>{r[key]=+val;renderResult();persist();};
            let level;
            if(adv){
                level=elem("input");level.type="number";level.min=1;level.max=20;level.value=r.level;
                level.onchange=()=>{if(level.value && level.validity.valid)change("level",level.value);else level.value=r.level;};
            }else level=selector(integer(20),r.level,v=>change("level",v));
            line.append(adv?input(r.name,v=>r.name=v):selector(integer(Math.max(12,+r.count)),r.count,v=>change("count",v)),level);
            if(adv)cols.forEach((_,j)=>{r.extras||=[];line.append(input(r.extras[j]?.value,v=>{r.extras[j]={value:v};}));});
            if(rows.length>1)line.append(iconButton("e020",adv?"删除玩家":"删除玩家组",()=>{rows.splice(i,1);partyRows();renderResult();persist();}));host.append(line);
        });
        const addPlayer=iconButton("002b",adv?"＋ Add Player":"＋ 新增玩家",()=>{
            rows.push(adv?{name:"",level:rows.at(-1)?.level||1,extras:cols.map(()=>({value:""}))}:{count:1,level:rows.at(-1)?.level||1});
            partyRows();renderResult();persist();
        });
        addPlayer.append(adv?" Add Player":" 新增玩家");
        const actions=elem("div");actions.className="enc-party-actions";
        const addCell=elem("div");addCell.append(addPlayer);
        actions.append(addCell,...removeCols);host.append(actions);
        if(adv)host.append(elem("i","Additional columns will be imported into the DM Screen."));
    }
    function updateShapeBudget(budget){
        const total=$(".enc-shape-total");
        if(!total)return;
        const groups=doc.customShapeGroups,score=rules===MCDM?formatCr:fmt,unit=rules===MCDM?"CR":"XP";
        const spent=pct=>budget*(pct/100);
        function display(output,pct,label){
            output.replaceChildren(elem("span",pct+"%"),elem("small",label));
        }
        const percent=groups.reduce((sum,g)=>sum+g.ratioPercentage,0);
        display(total,percent,"("+score(spent(percent))+"/"+score(budget)+" "+unit+")");
        total.classList.toggle("enc-incomplete",percent!==100);
        root.querySelectorAll(".enc-shape-row").forEach((row,i)=>{
            const g=groups[i],max=g.countMinMaxMax,min=g.countMinMaxMin,pct=g.ratioPercentage;
            row.querySelector("[type=range]").value=pct;
            const value=spent(pct);
            const highest=min?score(value/min):"0",lowest=max?score(value/max):"0";
            display(row.querySelector("output"),pct,"("+(min===max||!pct?highest:highest+"–"+lowest)+" "+unit+" ea.)");
        });
    }
    function drawShape(){
        const box=$(".enc-shape");box.replaceChildren();if(shape!=="custom")return;
        const groups=doc.customShapeGroups;
        const refresh=()=>{drawShape();persist();};
        const add=iconButton("002b","Add Creature Group",()=>{
            if(groups.length>=50)return;
            groups.push({countMinMaxMin:0,countMinMaxMax:1,ratioPercentage:0});refresh();
        });
        add.append(" Add Creature Group");
        const clear=iconButton("e020","Delete All Groups",()=>{if(groups.length&&confirm("Delete all creature groups?")){groups.length=0;refresh();}});
        const file=elem("input");file.type="file";file.accept=".json";file.hidden=true;
        file.onchange=async()=>{
            try{
                const template=JSON.parse(await file.files[0].text());
                const loaded=template.groups?.map(({count,ratio})=>({
                    countMinMaxMin:count.exact??count.min,countMinMaxMax:count.exact??count.max,ratioPercentage:Math.round(ratio.exact*100)
                }));
                if(!loaded?.length||loaded.length>50||loaded.some(g=>Object.values(g).some(v=>!Number.isSafeInteger(v)||v<0)||g.countMinMaxMin>g.countMinMaxMax||g.ratioPercentage>100))throw Error("Invalid creature groups");
                doc.customShapeGroups=loaded;refresh();
            }catch(e){warn(e);}
        };
        const down=iconButton("e026","Export Creature Group Configuration",()=>downloadJson("custom-encounter-config",{
            fileType:"encounterbuilder-custom-shape-template",groups:groups.map(g=>({
                count:{min:g.countMinMaxMin,max:g.countMinMaxMax},
                ratio:{exact:g.ratioPercentage/100}
            }))
        }));
        const up=iconButton("e027","Import Creature Group Configuration",()=>file.click());
        const top=elem("div");top.className="enc-shape-top";top.append(elem("h4","Custom Encounter"),add,clear,down,up,file);
        const head=elem("div");head.className="enc-shape-head";
        const auto=iconButton("e210","Auto-Distribute Remaining Budget",event=>{
            const bySize=event.ctrlKey||event.metaKey,all=bySize||event.shiftKey;
            const weights=groups.map(g=>bySize?(g.countMinMaxMin+g.countMinMaxMax)/2:1);
            const total=weights.reduce((sum,w)=>sum+w,0);
            if(all)groups.forEach((g,i)=>{g.ratioPercentage=total?Math.floor(100*weights[i]/total):0;});
            let rest=100-groups.reduce((sum,g)=>sum+g.ratioPercentage,0);
            for(let i=0;rest&&groups.length;i=(i+1)%groups.length){
                const g=groups[i];
                if(rest>0&&g.ratioPercentage<100){g.ratioPercentage++;rest--;}
                else if(rest<0&&g.ratioPercentage>0){g.ratioPercentage--;rest++;}
            }
            updateShapeBudget(calc().budget[randomTier]);persist();
        });
        auto.disabled=!groups.length;
        const subtotal=elem("output");subtotal.className="enc-shape-total";
        head.append(elem("span","Creatures"),elem("span","Budget Allocation"),auto,subtotal);
        box.append(top,head);
        for(const [i,group] of groups.entries()){
            const row=elem("div");row.className="enc-shape-row";
            const range=elem("div");range.className="enc-shape-count";
            const makeCount=(key,min,title)=>{
                const input=elem("input");input.type="number";input.min=min;input.value=group[key];input.title=title;
                input.onchange=()=>{
                    group[key]=Math.max(min,Math.floor(Number(input.value)||min));
                    if(group.countMinMaxMin>group.countMinMaxMax)[group.countMinMaxMin,group.countMinMaxMax]=[group.countMinMaxMax,group.countMinMaxMin];
                    refresh();
                };
                return input;
            };
            range.append(makeCount("countMinMaxMin",0,"Minimum Number of Creatures"),"–",makeCount("countMinMaxMax",1,"Maximum Number of Creatures"));
            const ratio=elem("input");ratio.type="range";ratio.min=0;ratio.max=100;ratio.setAttribute("aria-label","Budget Allocation");
            ratio.oninput=()=>{
                group.ratioPercentage=Number(ratio.value);
                let excess=groups.reduce((sum,g)=>sum+g.ratioPercentage,0)-100;
                while(excess>0){
                    for(const other of groups){
                        if(excess>0&&other!==group&&other.ratioPercentage>0){other.ratioPercentage--;excess--;}
                    }
                }
                updateShapeBudget(calc().budget[randomTier]);
            };
            ratio.onchange=persist;
            const remove=iconButton("e020","Delete",()=>{groups.splice(i,1);refresh();});
            row.append(range,ratio,elem("output"),remove);box.append(row);
        }
        if(!groups.length)box.append(elem("i","Add a Custom Creature Group to begin."));
        box.append(elem("hr"));updateShapeBudget(calc().budget[randomTier]);
    }
    function generate(t,adjustExisting){
        const {budget}=calc(),goal=budget[t],tiers=Object.keys(table[rules]),classic=rules==="classic",mcdm=rules===MCDM;
        const previous=budget[tiers[tiers.indexOf(t)-1]];
        const low=classic?goal:previous==null?0:Math.min(goal,previous+(mcdm?1/16:1));
        const high=classic?budget[tiers[tiers.indexOf(t)+1]||"absurd"]-1:goal;
        function finish(items){
            if(!items){status.textContent="当前条件下没有生成指定难度的遭遇";return;}
            doc.items=items;status.textContent="";drawRoster();renderResult();persist();
        }
        if(mcdm&&adjustExisting){finish(fitCrBudget(doc.items,group,high));return;}
        if(shape==="custom"&&!adjustExisting){
            if(!doc.customShapeGroups.length){
                status.textContent="Your custom encounter does not contain any creature groups! Please add a creature group first.";
                return;
            }
            if(doc.customShapeGroups.reduce((sum,g)=>sum+g.ratioPercentage,0)!==100){
                status.textContent="Your custom encounter has un-allocated budget! Please allocate the full budget first.";
                return;
            }
        }
        const cost=r=>mcdm?crNumber(r.cr):r.xp;
        const candidates=(adjustExisting?doc.items.filter(i=>!i.l).map(i=>lookup.get(i.h)).filter(Boolean):visibleChoices())
            .filter(r=>mcdm?cost(r)!=null&&cost(r)<=high:r.xp>0&&r.xp<=Math.max(high*2,1));
        const locked=doc.items.filter(i=>i.l);
        if(!candidates.length){status.textContent="当前筛选下没有可用怪物";return;}
        let best=null,error=Infinity;
        for(let attempt=0;attempt<75;attempt++){
            let items=structuredClone(locked);
            if(shape==="custom" && !adjustExisting && doc.customShapeGroups?.length){
                let complete=true;
                for(const g of doc.customShapeGroups){
                    const min=Math.max(0,g.countMinMaxMin),max=Math.max(min,g.countMinMaxMax);
                    const count=min+Math.floor(Math.random()*(max-min+1));if(!count)continue;
                    const target=high*g.ratioPercentage/100/count;
                    const choices=candidates.filter(r=>cost(r)>=target*.25 && cost(r)<=target*1.2 && !items.some(i=>i.h===r.h));
                    if(!choices.length){complete=false;break;}
                    items.push({h:pick(choices).h,c:String(count)});
                }
                if(!complete)continue;
                const result=calc(items);
                if(inBudget(result.adjusted) && high-result.adjusted<error){best=items;error=high-result.adjusted;}
                continue;
            }
            for(let n=0;n<25;n++){
                const r=pick(candidates),next=items.map(i=>({...i})),slot=next.find(i=>i.h===r.h&&!i.l);
                if(slot)slot.c=String(+slot.c+1);else if(!locked.some(i=>i.h===r.h))next.push({h:r.h,c:"1"});
                const spend=calc(next).adjusted;
                if(spend>high)continue;items=next;
                if(inBudget(spend) && high-spend<error){best=items;error=high-spend;}
                if(error===0)break;
            }
            if(error===0)break;
        }
        if(!best&&mcdm&&shape==="random"){
            // With a narrow filter the old builder can spend the budget on a
            // single low-CR species, including encounters larger than 25.
            const byCost=new Map();
            const lockedHashes=new Set(locked.map(i=>i.h));
            for(const row of candidates){
                if(lockedHashes.has(row.h))continue;
                const key=cost(row),bucket=byCost.get(key)||[];
                bucket.push(row);byCost.set(key,bucket);
            }
            for(const bucket of byCost.values()){
                const candidate=fitCrBudget([...locked,{h:pick(bucket).h,c:"1"}],group,high);
                if(!candidate)continue;
                const spend=calc(candidate).adjusted;
                if(inBudget(spend)&&high-spend<error){best=candidate;error=high-spend;}
                if(error===0)break;
            }
        }
        finish(best);
        function inBudget(spend){return spend>=low&&spend<=high;}
    }
    function draw(){
        const modern=rules==="one";mode.value=doc.activePartyId;rulesSelect.value=rules;
        const book=elem("a",modern?"地下城城主指南(2024)":"地下城主指南");book.href=modern?"book.html#xdmg,3,战斗遭遇难度":"book.html#dmg,3,创建战斗遭遇";
        const note=$(".enc-settings p");
        if(rules===MCDM)note.innerHTML=table.mcdmNote;
        else{
            const explanation=elem("i");
            explanation.append("基于",book,modern?"第114页的“遭遇构筑”规则":"第81页的“遭遇构筑”规则");
            note.replaceChildren(explanation);
        }
        const choices=Object.keys(table[rules]).map(t=>[t,table.tiers[t]]);
        const tier=selector(choices,randomTier,v=>{randomTier=v;syncPreferences();updateShapeBudget(calc().budget[v]);});
        const shapePicker=selector([["random","随机"],["custom","自定义"]],shape,v=>{shape=v;syncPreferences();draw();});
        const adj=button("",()=>generate(adjustTier,true));adj.className="enc-adjust";
        const updateAdjust=()=>{
            adj.textContent="调整至"+table.tiers[adjustTier]+"难度";
            adj.title="调整当前遭遇至"+table.tiers[adjustTier]+"难度";
        };
        updateAdjust();
        const menu=elem("div");menu.className="enc-adjust-menu";menu.hidden=true;
        const toggle=button("",()=>{menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));});
        toggle.title="调整难度";toggle.setAttribute("aria-label","调整难度");toggle.setAttribute("aria-expanded","false");toggle.className="enc-adj-tier";
        for(const [key,label] of choices)menu.append(button("调整至"+label+"难度",()=>{
            adjustTier=key;syncPreferences();updateAdjust();toggle.click();generate(key,true);toggle.focus();
        }));
        const actions=elem("div");actions.className="enc-adjust-actions";actions.append(adj,toggle,menu);
        actions.onfocusout=e=>{if(!actions.contains(e.relatedTarget)&&!menu.hidden)toggle.click();};
        actions.onkeydown=e=>{if(e.key==="Escape"&&!menu.hidden){toggle.click();toggle.focus();}};
        const gen=iconButton("e072","Generate Encounter",()=>generate(randomTier,false));gen.title="Generate Encounter";
        $(".enc-random").replaceChildren(tier,shapePicker,gen,actions);drawShape();partyRows();drawRoster();renderResult();
    }
    async function load(raw,{restoreRules=true}={}){
        const next=readEncounter(raw),ticket=++drawTicket;
        if(next.items.some(i=>!lookup.has(i.h)))lookup=new Map((await fullCatalog()).rows.map(r=>[r.h,r]));
        await Promise.all(next.items.filter(i=>i.customHashId&&!modelCache.has(i.customHashId)).map(async i=>{const r=await scaled(i);if(r)modelCache.set(i.customHashId,r);}));
        if(ticket!==drawTicket||!root.isConnected)return;
        doc=next;
        if(restoreRules&&supportsRule(next.activeRulesId)){
            rules=next.activeRulesId;
            for(const [id,state] of Object.entries(next.stateRulesComps||{})){
                if(supportsRule(id)&&state?.state)pref.stateRulesComps[id]=state;
            }
            restoreRule();syncPreferences();
        }
        draw();persist();
    }
    const upload=elem("input");upload.type="file";upload.className="enc-file";upload.accept=".json";upload.hidden=true;
    upload.onchange=async()=>{try{if(upload.files[0]){
        const raw=JSON.parse(await upload.files[0].text());
        if(!Array.isArray(raw?.items) && !Array.isArray(raw?.l?.items))throw Error("请选择从遭遇构筑器导出的 JSON 文件");
        await load(raw);
    }}catch(e){warn(e);}upload.value="";};
    const footer=$("footer");footer.append(button("保存遭遇",async()=>{const name=prompt("列表名",doc.name||"");if(name){doc.name=name;await saveNamed(exportEncounter());doc.manager_isSaved=true;drawRoster();persist();status.textContent="已保存 "+name;}}),
        button("载入遭遇",async()=>{try{const m=await namedSaves(),dialog=elem("dialog");
            for(const s of m.state.saves.filter(x=>x.entity.manager_isSaved))dialog.append(button(s.entity.name,async()=>{await load(s.entity);dialog.close();}));
            dialog.append(button("关闭",()=>dialog.close()));dialog.onclose=()=>retireDialog(dialog);root.append(dialog);dialog.showModal();}catch(e){warn(e);}}),
        button("保存到URL",async()=>{const u=new URL(location.href);u.searchParams.set("encounter",JSON.stringify(exportEncounter()));try{await navigator.clipboard.writeText(u.href);status.textContent="已复制链接";}catch{prompt("遭遇链接",u.href);}}),
        button("保存到文件",()=>downloadJson(doc.name||"encounter",{...exportEncounter(),fileType:"encounter"})),
        button("从文件加载",()=>upload.click()),upload,button("复制为文本",()=>navigator.clipboard.writeText(doc.items.map(i=>group(i).name+" ×"+(i.c??1)).join("\n")).catch(warn)),
        button("重置",()=>{if(confirm("重置遭遇？"))load({...doc,items:[],saveId:crypto.randomUUID(),name:""},{restoreRules:false});}),button("回到数据卡",close),status);
    const [saveBtn,loadBtn,shareBtn,downloadBtn,uploadBtn,copyBtn,resetBtn]=footer.querySelectorAll("button");
    shareBtn.className="enc-share";
    downloadBtn.className="enc-download";
    uploadBtn.className="enc-upload";
    copyBtn.className="enc-copy";
    resetBtn.className="enc-reset";
    const back=status.previousElementSibling;back.className="enc-back";
    const second=elem("div");second.className="enc-footer-secondary";second.append(back,loadBtn);footer.insertBefore(second,status);
    // The old sublist toolbar appears between the roster and party once a creature is added.
    const bar=$(".enc-named"),name=elem("input");name.placeholder="(未命名列表)";
    name.onchange=()=>{doc.name=name.value;persist();};
    const pins=elem("output");pins.title="已固定的怪物种类";
    const nameGroup=elem("div");nameGroup.className="enc-name-group";
    nameGroup.append(elem("span","表:"),name,pins);
    const persistNamed=saveBtn.onclick,showNamed=loadBtn.onclick;
    const exportFile=[...footer.querySelectorAll("button")].find(b=>b.textContent==="保存到文件");
    const newDoc=()=>load({items:[],name:"",statePartyComps:doc.statePartyComps,activePartyId:doc.activePartyId});
    function discard(fn){if(confirm("放弃当前未保存的改动？"))fn();}
    saveBtn.remove();loadBtn.className="enc-load-empty";
    bar.append(nameGroup,
        iconButton("e022","新建固定列表",()=>discard(newDoc)),
        iconButton("e224","拷贝固定列表",()=>load({...doc,saveId:crypto.randomUUID(),name:(doc.name||"(未命名列表)")+" (副本)"},{restoreRules:false})),
        iconButton("e172","保存遭遇",persistNamed),iconButton("e118","载入遭遇",showNamed),
        iconButton("e026","下载固定列表",()=>exportFile.click()),iconButton("e027","上传固定列表",()=>upload.click()),
        iconButton("e031","重置固定列表",async()=>{const saved=(await namedSaves()).state.saves.find(x=>x.entity.saveId===doc.saveId);if(saved)discard(()=>load(saved.entity));}));
    const encoded=new URL(location.href).searchParams.get("encounter");
    const isLink=encoded?.startsWith("{");
    await load(isLink?JSON.parse(encoded):doc,{restoreRules:isLink});
    return {adjust,add};
}
