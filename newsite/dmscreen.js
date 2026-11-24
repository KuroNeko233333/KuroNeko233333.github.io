import {el,btn,input,dialog,screenWindow,screenMenu,fileInput,notice,download} from "./screen-ui.js";
import {trackerState} from "./initiative-state.js";
import {mountTracker} from "./initiative-view.js";
import {disconnect,startPlayer} from "./screen-player.js";
import {cardSearch,mountCard} from "./screen-cards.js";

export async function showScreen({root,signal}) {
    if(!document.querySelector("link[data-screen-style]")){
        const style=el("link");style.rel="stylesheet";style.href="dmscreen.css";style.dataset.screenStyle="";document.head.append(style);
    }
    const space=el("div","screen-workspace"),work=el("main","screen-work"),tools=el("aside"),grid=el("section"),message=el("output");
    grid.id="grid";tools.id="tools";message.id="message";message.hidden=true;message.setAttribute("role","status");
    work.append(tools,grid);space.append(work,message);root.replaceChildren(space);
    const slotKey="DMSCREEN_STORAGE";
    const names={0:"空面板",1:"数据卡",3:"Notes",5:"Initiative Tracker",15:"Initiative Tracker Player View (Standard)",151:"Initiative Tracker Player View (Manual/Legacy)",16:"Counter",99:"Blank Space"};
    const focus=new URL(location.href).searchParams.get("panel")?.split(",");
    let panelLifetime,menuTab="内容";
    let doc,db,pending,dragging,draggedTab;
    let lastLocal,editCount=0,conflict=false;
    const changes=new BroadcastChannel("ours-dmscreen-layout");
    signal.addEventListener("abort",()=>changes.close(),{once:true});
    changes.onmessage=async()=>{
        await pending;
        if(signal.aborted || conflict)return;
        const seen=editCount,remote=await db.getItem(slotKey);
        if(seen!==editCount || !remote || JSON.stringify(remote)===JSON.stringify(lastLocal))return;
        const copy=structuredClone(remote),ticks=[];
        for(const [id,slot] of Object.entries(copy.sls || {})){
            for(const panel of slot.ps || []){
                const local=doc.sls[id]?.ps?.find(p=>p.x===panel.x && p.y===panel.y);
                const pairs=[[panel,local],...(panel.a || []).map((tab,i)=>[tab,local?.a?.[i]])];
                for(const [a,b] of pairs)if(a.t===8 && b?.t===8 && a.s?.state && b.s?.state){
                    ticks.push([b.s.state,a.s.state.time]);a.s.state.time=b.s.state.time;
                }
            }
        }
        if(ticks.length && JSON.stringify(copy)===JSON.stringify(doc)){
            for(const [state,time] of ticks)state.time=time;
            grid.querySelectorAll(".clock-face").forEach(face=>face.dispatchEvent(new Event("clock-sync")));
        }else openDoc(remote,true);
        lastLocal=structuredClone(doc);
    };
    const live=new Set();
    const active=()=>doc.sls[focus?.[0]] || doc.sls[doc.sla];
    const content=p=>p.a?.[p.b || 0] || p.a?.[0] || p;
    const blank=(x,y)=>({x,y,w:1,h:1,t:0});
    const embeds=el("div");embeds.hidden=true;space.append(embeds);
    const parkedEmbeds=new Map();
    function clearEmbeds(id){
        if(id==null){embeds.replaceChildren();parkedEmbeds.clear();return;}
        for(const frame of parkedEmbeds.get(id)?.values() || [])frame.remove();
        parkedEmbeds.delete(id);
    }
    function parkEmbeds(id){
        if(!doc.pe || !embeds.moveBefore || focus)return;
        clearEmbeds(id);
        const frames=new Map();
        for(const frame of grid.querySelectorAll("iframe.screen-embed[data-panel-key]")){
            frames.set(frame.dataset.panelKey,frame);embeds.moveBefore(frame,null);
        }
        if(frames.size)parkedEmbeds.set(id,frames);
    }
    function displayTab(panel,tab){
        for(const key of ["s","c","r"])delete panel[key];
        Object.assign(panel,tab);
    }
    function save(){
        // IndexedDB snapshots synchronously when setItem is issued. Serialize writes so the latest edit wins.
        for(const sl of Object.values(doc.sls))for(const p of sl.ps || [])if(p.a?.length) displayTab(p,content(p));
        if(conflict)return;
        const snapshot=structuredClone(doc),base=lastLocal,edit=++editCount;
        lastLocal=snapshot;
        async function persist(){
            if(conflict)return;
            const remote=await db.getItem(slotKey);
            const {mergeBoard}=await import("./screen-storage.js");
            let merged;
            try{merged=remote && base?mergeBoard(base,snapshot,remote):snapshot;}
            catch(e){conflict=true;throw e;}
            await db.setItem(slotKey,merged);
            if(signal.aborted)return;
            if(edit===editCount && JSON.stringify(merged)!==JSON.stringify(snapshot)){
                openDoc(merged,true);lastLocal=structuredClone(doc);
            }
            changes.postMessage("changed");
        }
        pending=(pending || Promise.resolve()).catch(()=>{}).then(()=>navigator.locks?navigator.locks.request(slotKey,persist):persist());
        pending.catch(e=>notice("布局未保存："+e.message));
    }
    function openDoc(value,keepConnections=false) {
        if(!value || typeof value!=="object")throw Error("无法识别布局文件");
        if(!value.sls && Array.isArray(value.ps)){value.sla="1";value.sls={"1":{ps:value.ps,ex:value.ex||[]}};value.mv=1;delete value.ps;delete value.ex;}
        if(!value.sls?.[value.sla] || ![value.w,value.h].every(v=>Number.isSafeInteger(v)&&v>0))throw Error("布局尺寸或当前槽位无效");
        for(const slot of Object.values(value.sls)){
            if(!Array.isArray(slot.ps || []))throw Error("面板列表无效");
            for(const p of slot.ps || [])if(!p || ![p.x,p.y,p.w,p.h].every(Number.isSafeInteger)||p.x<0||p.y<0||p.w<1||p.h<1)throw Error("面板位置无效");
        }
        if(keepConnections && doc){
            for(const [key,slot] of Object.entries(value.sls))for(const panel of slot.ps || []){
                const old=doc.sls[key]?.ps?.find(p=>p.x===panel.x && p.y===panel.y);
                const before=old && content(old),after=content(panel);
                if(before?.t===5 && after.t===5 && live.has(before.s)){
                    Object.assign(before.s,trackerState(after.s));after.s=before.s;
                }
            }
        }else{live.forEach(disconnect);live.clear();clearEmbeds();}
        if(keepConnections && doc?.sla!==value.sla && doc?.pe && value.pe)parkEmbeds(doc.sla);
        if(!value.pe)clearEmbeds();
        else for(const id of parkedEmbeds.keys())if(!value.sls[id])clearEmbeds(id);
        doc=value;draw();
    }
    function oldLink(){
        const a=el("a","","在完整旧帷幕中打开");
        const sync=()=>{a.href="../dmscreen.html#"+encodeURIComponent(JSON.stringify(doc));};
        // Notes and counters can change without remounting this neighbouring panel.
        for(const event of ["pointerdown","focus","click","contextmenu"])a.addEventListener(event,sync);
        sync();return a;
    }
    function populate(panel,node){
        const c=content(panel);
        if(c.t===0)return;
        if(c.t===5) {
            if(!live.has(c.s)){c.s=trackerState(c.s);live.add(c.s);}
            mountTracker(node,c.s,save);return;
        }
        if(c.t===8){
            async function encounter(raw){
                const trackers=[...grid.querySelectorAll('.panel[data-kind="5"] .panel-body')];
                // V4 records the encounter as used when no tracker is open.
                if(!trackers.length)return true;
                let target=trackers[0];
                if(trackers.length>1){
                    const {body,d}=dialog("选择先攻表");target=await new Promise(resolve=>{
                        trackers.forEach((t,i)=>body.append(btn("Initiative Tracker "+(i+1),()=>{resolve(t);d.close();})));
                        d.onclose=()=>{d.remove();resolve(null);};
                    });
                }
                if(!target)return false;
                const detail={raw};target.dispatchEvent(new CustomEvent("clock-encounter",{detail}));return await detail.result;
            }
            const lifetime=panelLifetime.signal;
            import("./screen-clock.js").then(m=>m.mountClock(node,c.s||={},save,lifetime,(focus?.[0] || doc.sla)+":"+panel.x+","+panel.y+":"+(panel.b||0),encounter)).catch(e=>notice(e.message));return;
        }
        if(c.t===6 || c.t===9){
            import("./screen-converters.js").then(m=>(c.t===6?m.unitPanel:m.coinPanel)(node,c.s||={},save)).catch(e=>notice(e.message));return;
        }
        if(c.t===21){import("./screen-map.js").then(m=>m.mountMap(node,c.s || {})).catch(e=>notice(e.message));return;}
        if([10,11,12,20,90].includes(c.t)){
            const id=focus?.[0] || doc.sla;
            const key=JSON.stringify([panel.x,panel.y,panel.b || 0,c.t,(c.s || c.c)?.u]);
            const frames=parkedEmbeds.get(id),frame=frames?.get(key);
            if(frame){
                frames.delete(key);
                if(!frames.size)parkedEmbeds.delete(id);
                // Wait until draw() has attached the destination to the same document.
                queueMicrotask(()=>{if(node.isConnected)node.moveBefore(frame,null);else frame.remove();});
            }else import("./screen-media.js").then(m=>{
                if(!node.isConnected)return;
                m.mountMedia(node,c);
                const mounted=node.querySelector("iframe.screen-embed");if(mounted)mounted.dataset.panelKey=key;
            }).catch(e=>notice(e.message));
            return;
        }
        if(c.t===2){
            const box=document.getElementById("dice-box");
            const home=box.parentElement,after=box.nextSibling;
            node.append(box);box.hidden=false;box.classList.add("pinned-dice");
            import("./screen-dice.js").then(m=>m.enableScreenDice()).catch(e=>notice(e.message));
            panelLifetime.signal.addEventListener("abort",()=>{home.insertBefore(box,after);box.hidden=true;box.classList.remove("pinned-dice");},{once:true});return;
        }
        if(c.t===51){
            const lifetime=panelLifetime.signal;
            queueMicrotask(async()=>{
                if(lifetime.aborted)return;
                const states=[...live];if(!states.length){node.textContent="No Initiative Tracker available.";return;}
                let linked,last,sequence=0;
                async function update(){
                    if(!linked || lifetime.aborted)return;
                    const row=linked.r.find(r=>r.a),key=JSON.stringify([row?.n,row?.s,row?.n_scr,row?.n_ssp,row?.n_scl]);
                    if(last===key)return;last=key;const ticket=++sequence;
                    if(!row?.s){node.textContent="No active creature.";return;}
                    const {monsters}=await import("./screen-data.js"),cat=await monsters();
                    const entry=cat.rows.find(r=>r.s===row.s && r.n===row.n);
                    if(!entry)return;
                    const scratch=el("div");await mountCard(scratch,{t:row.n_scr!=null?7:row.n_ssp!=null?71:row.n_scl!=null?72:1,c:{p:"bestiary.html",s:row.s,u:entry.h,cr:row.n_scr,ssl:row.n_ssp,csl:row.n_scl}});
                    if(ticket===sequence && !lifetime.aborted)node.replaceChildren(scratch);
                }
                grid.addEventListener("screen-turn",()=>update().catch(e=>notice(e.message)),{signal:lifetime});
                if(states.length===1){linked=states[0];await update().catch(e=>notice(e.message));}
                else states.forEach((s,i)=>node.append(btn("Connect to Tracker "+(i+1),()=>{linked=s;return update();})));
            });return;
        }
        if(c.t===15 || c.t===151){
            const viewer=el("div","embedded-player");node.append(viewer);
            startPlayer(viewer,{embedded:true,legacy:c.t===151,tracker:()=>[...live],signal:panelLifetime.signal});return;
        }
        if(c.t===3){
            const t=el("textarea","note");t.placeholder="支持文本内掷骰和内容标签（将光标置于标签内，按 Ctrl+Q）。例如 [[1d20+2]]、{@creature 地精}、{@spell 火球术}。";t.value=c.s?.x || "";
            t.onkeydown=async e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="q"){e.preventDefault();try{const {activateNote}=await import("./screen-cards.js");await activateNote(t);}catch(err){notice(err.message);}}};
            t.oninput=()=>{(c.s||={}).x=t.value;save();};node.append(t);return;
        }
        if(c.t===16){
            const s=c.s||={};s.rowState ||= [];
            const frame=el("div","counter-panel"),rows=el("div","counters");
            let moving=null;
            function update(){
                rows.replaceChildren(...s.rowState.map(r=>{
                    const v=r.state||={},line=el("div","counter"),values=el("div","counter-values"),controls=el("div","tool-group");
                    const cur=input("current",v.current,x=>{v.current=Number(x)||0;update();save();});
                    cur.className=v.current>=v.max?"at-max":v.current<=0?"at-min":"";
                    values.append(cur,el("span","","/"),input("max",v.max,x=>{v.max=Number(x)||0;update();save();}));
                    for(const delta of [-1,1])controls.append(btn(delta>0?"+":"−",()=>{v.current=(v.current||0)+delta;update();save();},delta>0?"+":"\u2212",delta>0?"green":"red"));
                    const grip=el("span","counter-grip","⠿");grip.title="拖动排序";grip.draggable=true;
                    grip.ondragstart=e=>{moving=r;e.stopPropagation();};grip.ondragend=()=>moving=null;
                    line.ondragover=e=>{if(moving)e.preventDefault();};
                    line.ondrop=e=>{
                        if(!moving)return;
                        e.preventDefault();e.stopPropagation();
                        const from=s.rowState.indexOf(moving),to=s.rowState.indexOf(r);
                        s.rowState.splice(from,1);s.rowState.splice(to,0,moving);moving=null;update();save();
                    };
                    line.append(input("名称",v.name,x=>{v.name=x;save();}),values,controls,grip,
                        btn("删除",()=>{s.rowState.splice(s.rowState.indexOf(r),1);update();save();},"\ue020","red"));
                    return line;
                }));
            }
            const add=btn("添加计数器",()=>{s.rowState.push({state:{name:"",current:0,max:1}});update();save();},"+","blue");
            add.append(document.createTextNode(" 添加计数器"));frame.append(rows,add);node.append(frame);update();return;
        }
        if([4,13,14].includes(c.t)){
            const lifetime=panelLifetime.signal;
            import("./screen-corpus.js").then(m=>m.mountCorpus(node,c,save,lifetime)).catch(e=>notice(e.message));return;
        }
        if([1,7,71,72].includes(c.t)){mountCard(node,c).catch(e=>notice(e.message));return;}
        if(c.t!==99)node.append(oldLink());
    }
    function addMenu(p,tab=false){
        const {d,body}=dialog("添加面板");
        function select(c){
            if(c.t===2 && active().ps.some(q=>q!==p && ([q,...(q.a||[])].some(t=>t.t===2))))throw Error("骰盘已固定到其他面板");
            if(tab && content(p).t){if(!p.a){const {x,y,w,h,...old}=p;p.a=[old];}p.a.push(c);p.b=p.a.length-1;}
            else displayTab(p,c);
            d.close();draw();save();
        }
        async function pins(){
            const {selectPinned}=await import("./screen-pins.js");
            await selectPinned(db,(cards,stack)=>{
                if(stack){
                    if(!p.a && p.t){const {x,y,w,h,...old}=p;p.a=[old];}
                    p.a||=[];p.b=p.a.length;p.a.push(...cards);displayTab(p,cards[0]);
                }else{
                    const slot=active(),empty=slot.ps.filter(x=>!x.t && x!==p);
                    if(!p.t)empty.unshift(p);
                    for(const card of cards){
                        if(!empty.length){const y=doc.h++;for(let x=0;x<doc.w;x++){const cell=blank(x,y);empty.push(cell);slot.ps.push(cell);}}
                        displayTab(empty.shift(),card);
                    }
                }
                d.close();draw();save();
            });
        }
        const tabs=el("nav","screen-menu-tabs"),view=el("div","screen-menu-view");
        d.classList.add("add-dialog");body.append(tabs,view);
        function show(label){
            menuTab=label;view.replaceChildren();
            for(const b of tabs.children)b.setAttribute("aria-pressed",String(b.textContent===label));
            if(label==="内容"){cardSearch(view,select);return;}
            if(label==="图片" || label==="内嵌"){
                import("./screen-media.js").then(m=>m.mediaMenu(view,label,select)).catch(e=>notice(e.message));
                if(label==="图片")view.append(btn("动态地图查看器",async()=>{view.replaceChildren();const {pickMap}=await import("./screen-map.js");await pickMap(view,select);}));return;
            }
            if(["规则 (5e/2014)","书籍","模组"].includes(label)){
                import("./screen-corpus.js").then(m=>m.corpusMenu(view,label==="书籍"?14:label==="模组"?13:4,select)).catch(e=>notice(e.message));return;
            }
            if(label==="特殊"){
                for(const [type,name,group,detail] of [
                    [2,"Dice Roller",true," (pins the existing dice roller to a panel)"],
                    [5,names[5]],[51,"Initiative Tracker Creature Viewer"],[15,names[15]],[151,names[151],true],
                    [null,"Pinned List Entries",true],[3,"Basic Text Box",true," (for a feature-rich editor, embed a Google Doc or similar)"],
                    [6,"Unit Converter"],[9,"Coin Converter"],[16,"Counter",true],[8,"In-Game Clock/Calendar",true],[99,names[99]]]){
                    const line=el("div","menu-option"),label=el("span","",name);
                    if(detail && type===3){const i=el("i");i.append(" (for a feature-rich editor, ",btn("embed",()=>show("内嵌"),"","embed-shortcut")," a Google Doc or similar)");label.append(i);}
                    else if(detail)label.append(el("i","",detail));
                    const action=btn(name,()=>type?select({t:type,s:{}}):pins(),"","blue");
                    action.textContent=type===2?"Pin":"Add";
                    line.append(label,action);view.append(line);
                    if(group)view.append(el("hr"));
                }
            }
        }
        for(const label of ["内容","规则 (5e/2014)","模组","书籍","图片","内嵌","特殊"]){
            const tab=btn(label,()=>show(label));if(label==="规则 (5e/2014)")tab.replaceChildren("规则 ",el("small","","(5e/2014)"));tabs.append(tab);
        }
        show(menuTab);
    }
    function editSize(p){
        const {d,body}=dialog("面板大小"),w=input("宽",p.w,()=>{}),h=input("高",p.h,()=>{});
        body.append(w,h,btn("弹出面板窗口",async()=>{
            const url=new URL(location.href);url.searchParams.set("panel",[focus?.[0] || doc.sla,p.x,p.y].join(","));
            const popup=window.open("about:blank","_blank");
            if(!popup)throw Error("浏览器阻止了面板窗口");
            popup.opener=null;
            try{await pending;popup.location.replace(url.href);d.close();}catch(error){popup.close();throw error;}
        }),btn("确定",()=>{
            const n={...p,w:Number(w.value),h:Number(h.value)};
            if(![n.w,n.h].every(v=>Number.isInteger(v)&&v>0)||n.x+n.w>doc.w||n.y+n.h>doc.h || active().ps.some(o=>o!==p && o.t && overlap(n,o)))throw Error("这个范围有其他面板或超出帷幕");
            Object.assign(p,n);d.close();draw();save();
        }));
    }
    function overlap(a,b){return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;}
    function slotIds(){
        const rank=id=>doc.sls[id]._sort ?? Number.MAX_SAFE_INTEGER;
        return Object.keys(doc.sls).sort((a,b)=>rank(a)-rank(b));
    }
    function activateSlot(id){
        if(id===doc.sla)return;
        parkEmbeds(doc.sla);doc.sla=id;draw();save();
    }
    function createSlot(activate,copy){
        let n=1;while(doc.sls[n])n++;
        const slot=copy?structuredClone(copy):{ps:[],ex:[]};
        slotIds().forEach((id,i)=>doc.sls[id]._sort=i);
        slot._sort=Object.keys(doc.sls).length;
        doc.sls[n]=slot;
        if(activate)activateSlot(String(n));else{draw();save();}
    }
    function manageSlots(){
        const {d,body}=screenWindow("查看/管理存档面板","screen-slot-manager");
        const toolbar=el("div","screen-slot-buttons"),head=el("div","screen-slot-head"),list=el("div","screen-slot-list");
        const selected=new Set(),selectAll=el("input"),selectLabel=el("label","screen-slot-select");
        selectAll.type="checkbox";selectAll.setAttribute("aria-label","全选");selectLabel.append(selectAll);
        let draggingSlot;
        function remove(ids){
            for(const id of ids){delete doc.sls[id];selected.delete(id);clearEmbeds(id);}
            draw();save();render();
        }
        const multi=btn("批处理...",()=>screenMenu(multi,[["删除",()=>{
            const ids=slotIds().filter(id=>selected.has(id) && id!==doc.sla);
            if(!ids.length){notice("请先选中非激活的存档面板！");return;}
            if(confirm("此操作将删除 "+ids.length+" 个存档面板。你确定要这么做吗？"))remove(ids);
        }]]));
        const create=btn("新建存档面板",()=>{createSlot(false);render();},"+");
        create.append(" 新建存档面板");toolbar.append(multi,create);
        head.append(selectLabel,...["","标识","名称",""].map(label=>{
            const button=btn(label,()=>{});button.disabled=true;return button;
        }));
        selectAll.onchange=()=>{
            selected.clear();if(selectAll.checked)slotIds().forEach(id=>selected.add(id));
            render();
        };
        function syncSelection(){
            const size=selected.size,total=Object.keys(doc.sls).length;
            selectAll.checked=size===total;selectAll.indeterminate=size>0 && size<total;
        }
        function render(){
            list.replaceChildren();
            for(const id of slotIds()){
                const slot=doc.sls[id],row=el("div","screen-slot-record");
                const check=el("input");check.type="checkbox";check.checked=selected.has(id);
                check.setAttribute("aria-label","选择存档面板 "+id);
                check.onchange=()=>{if(check.checked)selected.add(id);else selected.delete(id);syncSelection();};
                const count=el("div","screen-slot-count"),icon=el("span","screen-slot-icon","\uf40e");
                icon.setAttribute("aria-hidden","true");
                const nonempty=(slot.ps||[]).filter(panel=>panel.t).length;
                count.append(icon,el("span","",nonempty));count.title=nonempty+" Active Panel"+(nonempty===1?"":"s");
                const short=input("标识",slot.ns || "",v=>{slot.ns=v;draw();save();});short.placeholder=id;
                short.title="A short name, shown in the sidebar.";
                const name=input("名称",slot.n || "",v=>{slot.n=v;draw();save();});
                name.title="A longer name, show in tooltips and lists.";
                const grip=el("span","screen-slot-grip");grip.draggable=true;grip.title="Drag to reorder";
                grip.ondragstart=e=>{draggingSlot=id;e.dataTransfer.setData("text/plain",id);};
                grip.ondragend=()=>{draggingSlot=null;};
                row.ondragover=e=>{if(draggingSlot)e.preventDefault();};
                row.ondrop=e=>{
                    if(!draggingSlot || id===draggingSlot)return;
                    e.preventDefault();const ids=slotIds().filter(key=>key!==draggingSlot);
                    ids.splice(ids.indexOf(id),0,draggingSlot);
                    ids.forEach((key,i)=>doc.sls[key]._sort=i);
                    draggingSlot=null;draw();save();render();
                };
                const controls=el("div","screen-slot-row-actions"),group=el("div","tool-group");
                const select=btn("激活",()=>{d.close();activateSlot(id);},"",id===doc.sla?"slot-active":"");
                const more=btn("选项",()=>screenMenu(more,[["拷贝",()=>{createSlot(true,slot);render();}]]),"\ue235");
                const del=btn("Delete",()=>{if(!nonempty || confirm("删除这个存档面板？"))remove([id]);},"\ue020","red");
                del.disabled=id===doc.sla;
                group.append(select,more,del);controls.append(grip,group);
                row.append(check,count,short,name,controls);list.append(row);
            }
            syncSelection();
        }
        body.append(toolbar,head,list);render();
    }
    function settingsWindow(){
        const {d,body,footer}=screenWindow("设置","screen-board-settings",true);
        const w=input("宽",doc.w,()=>{}),h=input("高",doc.h,()=>{});
        for(const [field,title] of [[w,"Width"],[h,"Height"]]){
            field.title=title;field.type="number";field.min=1;
        }
        const dimensions=el("div","screen-settings-line"),fields=el("div","screen-dimensions");
        fields.append(w,el("span","","宽"),el("span","screen-dimensions-by","×"),h,el("span","","高"));
        dimensions.append(el("span","","槽位"),fields);
        const dimAction=el("div","screen-settings-line");
        dimAction.append(btn("设置槽位",()=>{
            const cols=Number(w.value),rows=Number(h.value);
            if(![cols,rows].every(x=>Number.isSafeInteger(x)&&x>0))throw Error("请输入有效的行列数");
            if((cols>10 || rows>10) && !confirm("That's a lot of panels. Are you sure?"))return;
            if(Object.values(doc.sls).some(sl=>sl.ps?.some(p=>p.t && (p.x+p.w>cols||p.y+p.h>rows))))throw Error("请先移动超出边界的面板");
            doc.w=cols;doc.h=rows;draw();save();
        }));
        const historySize=input("历史大小",doc.hs??10,(value,field)=>{
            doc.hs=Math.max(1,Math.min(99,Math.trunc(Number(value))||10));
            field.value=doc.hs;for(const slot of Object.values(doc.sls))slot.ex?.splice(doc.hs);save();
        });
        historySize.disabled=doc.he===false;
        function checkbox(label,key,defaultValue,update=()=>{}){
            const field=el("input");field.type="checkbox";field.checked=doc[key] ?? defaultValue;
            field.onchange=()=>{doc[key]=field.checked;update(field.checked);save();};
            return line(label,field);
        }
        function line(label,control){
            const wrap=el("label","screen-settings-line",label);wrap.append(control);return wrap;
        }
        body.append(dimensions,dimAction,el("hr"),checkbox("关闭帷幕时是否需要确认","ctc",false),
            checkbox("启用历史","he",true,checked=>{historySize.disabled=!checked;}),line("历史大小",historySize),el("hr"),
            checkbox("Preserve Embeds on Save Slot Change","pe",false,checked=>{if(!checked)clearEmbeds();}));
        footer.append(btn("关闭",()=>d.close()));
    }
    function resetSlot(all){
        if(!confirm(all?"重置所有存档面板？":"重置当前存档面板？"))return;
        if(all){clearEmbeds();doc.sla="1";doc.sls={"1":{ps:[],ex:[]}};}
        else Object.assign(active(),{ps:[],ex:[]});
        draw();save();
    }
    function remember(panel){
        if(doc.he===false)return;
        const history=active().ex;
        history.unshift(panel);history.splice(doc.hs??10);
    }
    function closeTab(p,i){
        if(doc.ctc && !confirm("关闭这个标签？"))return;
        const [closed]=p.a.splice(i,1);
        remember({...closed,x:p.x,y:p.y,w:p.w,h:p.h});
        if(!p.a.length)active().ps=active().ps.filter(o=>o!==p);
        else{
            p.b=Math.max(0,Math.min(p.b-(i<p.b?1:0),p.a.length-1));displayTab(p,p.a[p.b]);
            if(p.a.length===1){delete p.a;delete p.b;}
        }
        draw();save();
    }
    function draw(){
        panelLifetime?.abort();panelLifetime=new AbortController();
        tools.replaceChildren();grid.replaceChildren();const slot=active();slot.ps||=[];slot.ex||=[];
        grid.style.gridTemplateColumns="repeat("+doc.w+", minmax(0,1fr))";grid.style.gridTemplateRows="repeat("+doc.h+", minmax(0,1fr))";
        const filled=slot.ps.filter(p=>p.t);slot.ps=[...filled];
        for(let x=0;x<doc.w;x++)for(let y=0;y<doc.h;y++){const p=blank(x,y);if(!filled.some(other=>overlap(p,other)))slot.ps.push(p);}
        const visibleTrackers=new Set(filled.map(content).filter(c=>c.t===5).map(c=>c.s));
        for(const state of live)if(!visibleTrackers.has(state)){disconnect(state);live.delete(state);}
        if(focus){tools.hidden=true;grid.style.gridTemplateColumns="1fr";grid.style.gridTemplateRows="1fr";}
        for(const p of slot.ps){
            if(focus && (p.x!==+focus[1] || p.y!==+focus[2]))continue;
            const cell=el("article","panel"),inner=el("div","panel-body");
            cell.dataset.kind=String(p.t);cell.style.gridArea=(p.y+1)+" / "+(p.x+1)+" / span "+p.h+" / span "+p.w;
            if(focus)cell.style.gridArea="1 / 1";
            if(!doc.lk && !focus){
                cell.ondragover=e=>e.preventDefault();
                cell.ondrop=e=>{
                    e.preventDefault();
                    if(draggedTab && draggedTab.panel!==p){
                        const {panel:source,index}=draggedTab,tab=source.a[index];draggedTab=null;
                        if(p.t){if(!p.a){const {x,y,w,h,...old}=p;p.a=[old];}p.a.push(tab);p.b=p.a.length-1;}
                        displayTab(p,tab);source.a.splice(index,1);source.b=Math.min(source.b,source.a.length-1);
                        if(!source.a.length)source.t=0;
                        else {displayTab(source,source.a[source.b]);if(source.a.length===1){delete source.a;delete source.b;}}
                        draw();save();return;
                    }
                    if(!dragging||p===dragging)return;
                    const a={...dragging,x:p.x,y:p.y},b={...p,x:dragging.x,y:dragging.y};
                    const rest=filled.filter(q=>q!==p&&q!==dragging);
                    if([a,...(p.t?[b]:[])].some(q=>q.x+q.w>doc.w||q.y+q.h>doc.h||rest.some(o=>overlap(o,q))) || (p.t && overlap(a,b)))return;
                    Object.assign(dragging,{x:a.x,y:a.y});Object.assign(p,{x:b.x,y:b.y});dragging=null;draw();save();
                };
            }
            if(!p.t){if(!doc.lk)inner.append(btn("添加面板",()=>addMenu(p),"+","empty-add"));}
            else {
                if(!doc.lk){
                    const controls=el("div","panel-controls"),move=btn("移动面板",()=>editSize(p),"\ue068");
                    move.draggable=true;move.ondragstart=()=>dragging=p;move.ondragend=()=>dragging=null;
                    const info=content(p),url=info.c?.p?info.c.p+"#"+info.c.u:info.t===13?"adventure.html#"+info.c.a+","+info.c.c:info.t===14?"book.html#"+info.c.b+","+info.c.c:null;
                    if(url)controls.append(btn("在新窗口打开",()=>window.open(url,"_blank","noopener"),"\ue237"));
                    controls.append(move,
                        btn("关闭面板",()=>{remember(p);slot.ps=slot.ps.filter(x=>x!==p);draw();save();},"\ue014"));
                    cell.append(controls);
                    if(!p.a?.length)cell.append(btn("增加标签",()=>addMenu(p,true),"+","panel-add-tab"));
                    for(const edge of ["left","right","top","bottom"]){
                        const handle=el("div","panel-edge "+edge);
                        handle.onpointerdown=e=>{
                            if(e.button!==0)return;
                            const horizontal=edge==="left" || edge==="right",start=horizontal?e.clientX:e.clientY;
                            handle.setPointerCapture(e.pointerId);
                            handle.onpointerup=ev=>{
                                const gap=parseFloat(getComputedStyle(grid).gap)||0;
                                const step=horizontal?(grid.clientWidth+gap)/doc.w:(grid.clientHeight+gap)/doc.h;
                                const delta=Math.round(((horizontal?ev.clientX:ev.clientY)-start)/step),n={...p};
                                if(edge==="left"){n.x+=delta;n.w-=delta;}else if(edge==="top"){n.y+=delta;n.h-=delta;}
                                else if(horizontal)n.w+=delta;else n.h+=delta;
                                if(delta && n.w>=1 && n.h>=1 && n.x>=0 && n.y>=0 && n.x+n.w<=doc.w && n.y+n.h<=doc.h && !filled.some(o=>o!==p && overlap(n,o))){
                                    Object.assign(p,{x:n.x,y:n.y,h:n.h,w:n.w});draw();save();
                                }
                            };
                        };
                        cell.append(handle);
                    }
                }
                populate(p,inner);
            }
            cell.append(inner);
            if(p.a?.length){
                const tabs=el("div","panel-tabs");
                p.a.forEach((t,i)=>{
                    const label=btn(t.r || names[t.t] || "标签",()=>{p.b=i;displayTab(p,t);draw();save();});
                    label.setAttribute("aria-pressed",String((p.b || 0)===i));
                    label.ondblclick=()=>{if(doc.lk)return;const {d,body}=dialog("标签名称");
                        const field=input("名称",t.r || names[t.t],()=>{});body.append(field,btn("确定",()=>{t.r=field.value;d.close();draw();save();}));};
                    const group=el("span");group.append(label);
                    group.draggable=!doc.lk;group.ondragstart=e=>{e.stopPropagation();draggedTab={panel:p,index:i};};group.ondragend=()=>draggedTab=null;
                    if(!doc.lk)group.append(btn("关闭标签",()=>closeTab(p,i),"\ue014"));
                    tabs.append(group);
                });
                if(!doc.lk)tabs.append(btn("增加标签",()=>addMenu(p,true),"+"));cell.append(tabs);
            }
            grid.append(cell);
        }
        if(Object.keys(doc.sls).length>1)for(const id of slotIds()){
            const slotButton=btn(doc.sls[id].ns || id,()=>activateSlot(id),"",id===doc.sla?"selected":"");
            slotButton.setAttribute("aria-pressed",String(id===doc.sla));tools.append(slotButton);
        }
        tools.append(btn("新建存档面板",()=>createSlot(true),"+"),
            btn("查看/管理存档面板",manageSlots,"\ue118"),
            btn("面板历史",()=>{
                const {d,body}=dialog("面板历史");
                function show(){
                    body.replaceChildren(el("strong","","近期删除的面板"));
                    for(const panel of slot.ex){
                        const row=el("div","slot-row");
                        row.append(btn(panel.r || names[panel.t] || "面板",()=>{
                            const place=slot.ps.some(q=>q.t && overlap(panel,q))?slot.ps.find(q=>!q.t && q.w>=panel.w && q.h>=panel.h):panel;
                            if(!place)throw Error("没有足够的空位");
                            slot.ex.splice(slot.ex.indexOf(panel),1);panel.x=place.x;panel.y=place.y;
                            slot.ps.push(panel);d.close();draw();save();
                        }),btn("移除历史项",()=>{slot.ex.splice(slot.ex.indexOf(panel),1);show();save();},"\ue014"));
                        body.append(row);
                    }
                    body.append(btn("清空",()=>{slot.ex=[];show();save();}));
                }
                show();
            },"\uf1da"),
            btn("导出到文件",()=>download(doc),"\ue026","blue"),btn("从文件导入",event=>{const {d,body}=dialog("从文件导入");
                const merge=el("input");merge.type="checkbox";merge.checked=!!event.shiftKey;
                const label=el("label","","作为新槽位合并");label.prepend(merge);
                body.append(label,fileInput("帷幕布局",v=>{
                    if(!merge.checked){openDoc(v);save();d.close();return;}
                    const slots=v.sls ?? (Array.isArray(v.ps)?{"1":{ps:v.ps,ex:v.ex || []}}:null);
                    if(!slots)throw Error("无可合并的槽位");
                    const combined=structuredClone(doc);
                    for(const slot of Object.values(slots)){
                        let id=1;while(combined.sls[id])id++;combined.sls[id]=slot;
                        for(const panel of slot.ps || []){combined.w=Math.max(combined.w,panel.x+panel.w);combined.h=Math.max(combined.h,panel.y+panel.h);}
                    }
                    openDoc(combined);save();d.close();
                }));},"\ue027","blue"),
            btn("导出为URL",async()=>{await navigator.clipboard.writeText(location.href.split("#")[0]+"#"+encodeURIComponent(JSON.stringify(doc)));notice("已复制布局链接");},"\ue112","blue"),
            btn("重置存档面板(按住SHIFT重置所有)",e=>resetSlot(e.shiftKey),"\ue031","red"),
            btn("锁定面板",()=>{doc.lk=!doc.lk;draw();save();},"\ue033",doc.lk?"selected":""),
            btn("切换全屏",()=>{doc.fs=!doc.fs;draw();save();},"\ue140"),
            btn("设置",settingsWindow,"\ue019"));
        for(const [title,on] of [["锁定面板",doc.lk],["切换全屏",doc.fs]]){
            const button=tools.querySelector('[title="'+title+'"]');button?.setAttribute("aria-pressed",String(!!on));
        }
        space.classList.toggle("fullscreen",!!doc.fs || !!focus);grid.dataset.ready="true";
    }
    async function start(){
        message.onclick=()=>message.hidden=true;
        db=await new Promise((resolve,reject)=>{const s=el("script");s.src="../lib/localforage.js";s.onload=()=>resolve(window.localforage);s.onerror=()=>reject(Error("无法读取布局存档"));document.head.append(s);});
        const fragment=location.hash.slice(1);
        const stored=fragment?JSON.parse(decodeURIComponent(fragment)):await db.getItem(slotKey);
        if(signal.aborted)return;
        openDoc(stored ?? {mv:1,w:Math.max(1,Math.floor((grid.parentElement.clientWidth-43)/360)),h:Math.max(1,Math.floor(grid.parentElement.clientHeight/280)),sla:"1",sls:{"1":{ps:[],ex:[]}},fs:false,lk:false});
        lastLocal=structuredClone(doc);
        if(fragment){lastLocal=null;save();history.replaceState(null,"",location.href.split("#")[0]);}
    }
    signal.addEventListener("abort",()=>{panelLifetime?.abort();live.forEach(disconnect);live.clear();space.remove();},{once:true});
    await start().catch(e=>{message.textContent="无法打开帷幕："+e.message;message.hidden=false;});
}
