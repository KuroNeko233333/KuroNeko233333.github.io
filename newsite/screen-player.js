import {el,btn,input,dialog,screenWindow,screenMenu,notice,theme} from "./screen-ui.js";
import {playerMessage} from "./initiative-state.js";
const libraries=new Map();
function script(path) {
    if (!libraries.has(path)) libraries.set(path,new Promise((resolve,reject)=>{
        const node=document.createElement("script");node.src=path;node.onload=resolve;
        node.onerror=()=>{libraries.delete(path);reject(Error("连接库未载入，请重试"));};
        document.head.append(node);
    }));
    return libraries.get(path);
}
async function loadPeers() { await script("../lib/peerjs.js");await script("../js/utils-p2p.js"); }
const hosts=new WeakMap();
export function publish(state) { hosts.get(state)?.send(); }
export function disconnect(state) { hosts.get(state)?.close(); hosts.delete(state); }
function host(state) {
    if(hosts.has(state)) return hosts.get(state);
    const localId=crypto.randomUUID(),channel=new BroadcastChannel("dm-player-"+localId),servers=[],listeners=new Set();
    let peer,sequence=0;
    function changed(){listeners.forEach(fn=>fn());}
    function drop(entry){
        const index=servers.indexOf(entry);
        if(index<0)return;
        servers.splice(index,1);entry.server?.close();changed();
    }
    function send() {
        const msg=playerMessage(state);
        channel.postMessage(msg);
        if(peer?.hasConnections()) peer.pSendMessage(msg).catch(e=>notice(e.message));
        for(const conn of servers) if(!conn.disconnected && conn.server?.isActive) conn.server.sendMessage(msg).catch(e=>notice(e.message));
    }
    channel.onmessage=e=>{if(e.data?.type==="ready")send();};
    const h={localId,send,rows:servers,
        add(){const row={label:"",name:"",token:"",answer:""};servers.push(row);changed();return row;},
        remove:drop,
        get token(){return peer?.token || "";},
        get standardClients(){return peer?.getActiveConnections() || [];},
        async standard() {
            await loadPeers();
            if(!peer) {
                peer=new PeerVeServer();
                peer.on("connection",conn=>{
                    conn.on("open",()=>{send();changed();});conn.on("close",changed);
                });
            }
            try {await peer.pInit();return peer.token;}catch(e){peer.destroy();peer=null;throw e;}
        },
        async offer(entry) {
            const alreadyGenerated=()=>entry.pending || (entry.token && !entry.disconnected);
            if(alreadyGenerated())return;
            await loadPeers();
            if(!servers.includes(entry) || alreadyGenerated())return;
            const name=entry.label.trim().replace(/[:|{}\s]+/g,"-") || "PLAYER-"+(++sequence);
            if(servers.some(s=>s.name===name && s!==entry))throw Error("玩家标识重复");
            const prior=entry.server,server=new PeerServerV0();
            Object.assign(entry,{server,name,token:"",answer:"",disconnected:false,pending:true});
            prior?.close();changed();
            const ended=()=>{if(entry.server===server){entry.disconnected=true;changed();}};
            try {
                const pending=server.pMakeOffer(()=>{},ended);
                const {pc,dc}=server._ctx;
                pc.addEventListener("connectionstatechange",()=>{
                    if(["closed","failed","disconnected"].includes(pc.connectionState))ended();
                    else if(pc.connectionState==="connected" && entry.server===server){entry.disconnected=false;changed();}
                });
                dc.addEventListener("close",ended);
                entry.token=PeerUtilV0._packToken(name,await pending);
                if(!servers.includes(entry))return;
                return entry.token;
            } catch(e){
                server.close();
                Object.assign(entry,{server:null,name:"",token:"",answer:"",disconnected:false});
                if(servers.includes(entry))throw e;
            } finally {entry.pending=false;changed();}
        },
        async accept(answer,only) {
            await loadPeers();
            const linked=await PeerUtilV0.pConnectClientsToServers(servers.filter(x=>(!only || x===only) && x.token && !x.disconnected && !x.server.isActive),answer);
            if(!linked.length) throw Error("玩家回复与当前连接码不匹配");
            for(const row of linked){row.answer=row._tempTokenToDisplay;delete row._tempTokenToDisplay;}
            send();changed();return linked.length;
        },
        stopStandard(){peer?.destroy();peer=null;changed();},
        subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
        close(){channel.postMessage({type:"closed"});channel.close();peer?.destroy();servers.splice(0).forEach(x=>x.server?.close());listeners.clear();}
    };
    hosts.set(state,h);return h;
}
const viewName="先攻追踪器玩家视图";
function iconText(label,icon,action,className=""){
    const button=btn(label,action,icon,className);
    button.append(" "+label);
    return button;
}
function playerLink(){
    const link=el("a","",viewName);link.href="inittrackerplayerview.html";return link;
}
function localPlayer(h){
    return btn("本机玩家窗口",()=>window.open("inittrackerplayerview.html#local:"+h.localId,"_blank","noopener"));
}
function standardWindow(h){
    const {d,body}=screenWindow("配置玩家视图","screen-host-standard");
    const intro=el("p","","先攻追踪器玩家视图是一个P2P系统，允许玩家连接到DM的先攻追踪器。玩家应该使用");
    intro.append(playerLink(),"页面连接到DM的实例。作为DM，使用方法如下：");
    const steps=el("ol");
    for(const text of ["启动服务器。","复制你的链接/Token并与玩家分享。","等待他们连接！"])steps.append(el("li","",text));
    const actions=el("p","screen-standard-actions");
    const start=iconText("启动服务端","\ue072",async()=>{
        start.disabled=true;
        try{await h.standard();}finally{refresh();}
    });
    const link=iconText("复制链接","\ue144",()=>navigator.clipboard.writeText(new URL("inittrackerplayerview.html#v1:"+h.token,location.href).href));
    const token=iconText("复制 Token","\ue205",()=>navigator.clipboard.writeText(h.token));
    const stop=btn("关闭标准服务端",()=>h.stopStandard());
    actions.append(start,link,token,localPlayer(h),stop);
    const note=el("p"),clients=el("div","screen-standard-clients");
    note.append(el("i","","请注意！这是一个实验性功能。你的使用体验可能会有所不同。"));
    body.append(intro,steps,actions,note,el("hr"),clients);
    function refresh(){
        const label=h.token?"服务端运行中":"启动服务端";
        start.lastChild.textContent=" "+label;
        start.title=label;start.setAttribute("aria-label",label);
        start.disabled=!!h.token;
        stop.hidden=!h.token;link.disabled=token.disabled=!h.token;
        clients.replaceChildren();
        if(!h.token){clients.append(el("i","","客户端未连接。"));return;}
        const list=el("ul");
        for(const peer of [...h.standardClients].sort((a,b)=>(a.label||"").localeCompare(b.label||""))){
            const row=el("li","",peer.label || "(Unknown)");
            row.append(" ",btn("移除 "+(peer.label || peer.peer),()=>peer.close(),"\ue020","red"));
            list.append(row);
        }
        clients.append(el("h5","","已连接的客户端："),list);
    }
    d.addEventListener("close",h.subscribe(refresh),{once:true});refresh();
}
function manualWindow(h){
    if(!h.rows.length)h.add();
    const {d,body}=screenWindow("配置玩家视图","screen-host-manual");
    const add=()=>{const row=h.add();views.get(row)?.label.focus();};
    function copy(){
        const tokens=h.rows.filter(r=>r.token && !r.disconnected && !r.server.isActive).map(r=>r.token);
        if(!tokens.length){notice("No free server tokens to copy. Generate some!");return;}
        return navigator.clipboard.writeText(tokens.join("\n\n"));
    }
    async function generateAll(){
        const results=await Promise.allSettled(h.rows.map(row=>h.offer(row)));
        const errors=results.filter(r=>r.status==="rejected").map(r=>r.reason.message);
        if(errors.length)notice(errors.join("；"));
    }
    function acceptAll(){
        const window=screenWindow("批量接受客户端","screen-host-accept");
        const paste=el("textarea");paste.setAttribute("aria-label","批量玩家回复");
        const submit=btn("批量接受客户端",async()=>{await h.accept(paste.value);window.d.close();},"","blue");
        submit.title="Add Client";
        const actions=el("div","screen-window-center");actions.append(submit);
        window.body.append(el("p","","Paste text containing one or more client tokens, and click \"Accept Multiple Clients\""),paste,actions);
    }
    const intro=el("div","screen-manual-help");
    // Preserve the existing instructions and their inline shortcuts.
    intro.innerHTML=`<p>先攻追踪器玩家视图是一个P2P（即无服务器）系统，允许玩家连接到DM的先攻追踪器。玩家应该使用<span data-link></span>页面连接到DM的实例。作为DM，使用方法如下：</p>
<ol><li>添加所需数量的玩家("<span data-action></span>")，并输入玩家姓名（最好唯一）。</li>
<li>点击"<span data-action></span>,"来为每个玩家生成"服务端token"。 你可以点击"<span data-action></span>" 来将他们一起复制，或者点击"服务端Token"的值来一个一个复制。将这些Token发给你的玩家。每个玩家需要将他们的Token粘贴到<span data-link></span>并按照其中的说明进行操作。</li>
<li>获得每位玩家的"客户端token"，然后对于每个Token:
<ol type="a"><li>点击"批量接受客户端"按钮, 并粘贴包含多个客户端token的文本。 <b>这将尝试在任何文本中查找token, 并忽略其他所有内容。</b> 粘贴聊天记录日志（例如包含用户名和时间戳的混合token）是一般的用法。</li>
<li>将每个token粘贴到相应的"客户端Token"字段中, 并点击"接受客户端"。 一个token可以通过前几个字符中的玩家名来识别。</li></ol></li></ol>
<p>一旦玩家的客户端被"接受"，它将从DM的先攻追踪器接收更新。 <i>请注意，这个系统是高度实验性的。你的体验可能会有所不同。</i></p>`;
    for(const link of intro.querySelectorAll("[data-link]"))link.replaceWith(playerLink());
    const inlineActions=[["添加玩家",add],["生成全部",generateAll],["复制服务端Tokens",copy]];
    intro.querySelectorAll("[data-action]").forEach((span,i)=>span.replaceWith(btn(...inlineActions[i],"","blue screen-inline-button")));
    const toolbar=el("div","screen-manual-actions");
    for(const [label,caption,action,touch] of [
        ["添加一个玩家(客户端):","添加玩家",add,"Add Client"],
        ["复制所有未使用的服务器token:","复制服务端Tokens",copy,"复制所有未使用的服务器token"],
        ["批量接受客户端:","批量接受客户端",acceptAll,"可以粘贴包含客户端token的文本"],
    ]){
        const group=el("span","screen-manual-action"),button=btn(caption,action,"","blue");
        button.title=touch;group.append(el("span","",label),button);toolbar.append(group);
    }
    toolbar.append(localPlayer(h));
    const batch=btn("批量移除连接",()=>{
        const picker=screenWindow("批量移除连接","screen-host-remove",true),marked=new Set();
        const remove=btn("移除",()=>{for(const row of marked)h.remove(row);picker.d.close();},"","red");
        remove.disabled=true;
        for(const row of h.rows.filter(r=>r.label || r.token)){
            const name=row.label || row.name,check=el("input"),label=el("label","",name);
            check.type="checkbox";check.setAttribute("aria-label","选择 "+name);
            check.onchange=()=>{if(check.checked)marked.add(row);else marked.delete(row);remove.disabled=!marked.size;};
            label.prepend(check);picker.body.append(label);
        }
        picker.footer.append(remove,btn("取消",()=>picker.d.close()));
    });
    toolbar.append(batch);
    const head=el("div","screen-manual-row screen-manual-head"),all=btn("生成所有",generateAll,"","blue");
    head.append(el("b","","玩家名字"),el("b","","服务端Token"),all,el("b","","客户端Token"));
    const rows=el("div","screen-manual-rows"),views=new Map();
    body.append(intro,el("hr"),toolbar,el("hr"),head,rows);
    function makeRow(row){
        const wrap=el("div","screen-manual-row"),label=input("玩家名字",row.label,()=>{});
        const server=input("服务端 Token","",()=>{}),answer=input("客户端Token",row.answer,()=>{});
        server.readOnly=true;server.onclick=()=>navigator.clipboard.writeText(row.token).catch(e=>notice(e.message));
        answer.oninput=()=>row.answer=answer.value;
        const generate=btn("生成",()=>h.offer(row),"","blue");
        generate.title="生成服务端Token";
        const accept=btn("接受客户端",()=>h.accept(answer.value,row),"","blue");
        accept.title="接受客户端Token";
        label.onkeydown=e=>{if(e.key==="Enter")generate.click();};
        answer.onkeydown=e=>{if(e.key==="Enter")accept.click();};
        const remove=btn("移除玩家",()=>h.remove(row),"\ue020","red");
        label.oninput=()=>{
            row.label=label.value;
            remove.setAttribute("aria-label","移除 "+(row.label || "玩家"));
            updateBatch();
        };
        wrap.append(label,server,generate,answer,accept,remove);
        rows.append(wrap);return {wrap,label,server,answer,generate,accept,remove};
    }
    function updateBatch(){batch.hidden=h.rows.filter(r=>r.label || r.token).length<2;}
    function refresh(){
        for(const [row,view] of views)if(!h.rows.includes(row)){view.wrap.remove();views.delete(row);}
        if(!h.rows.length){h.add();return;}
        for(const row of h.rows){
            if(!views.has(row))views.set(row,makeRow(row));
            const view=views.get(row),connected=!row.disconnected && !!row.server?.isActive;
            const locked=!!row.pending || (!!row.token && !row.disconnected);
            view.server.value=row.token;
            if(view.answer.value!==row.answer)view.answer.value=row.answer;
            view.server.disabled=!row.token;view.answer.disabled=view.accept.disabled=!row.token || connected || !!row.disconnected;
            view.generate.disabled=locked;
            view.generate.textContent=row.disconnected?"重新连接":"生成";
            view.generate.setAttribute("aria-label",row.disconnected?"重新连接 "+row.label:"生成");
            view.remove.setAttribute("aria-label","移除 "+(row.label || "玩家"));
            view.label.disabled=locked;
        }
        updateBatch();
    }
    d.addEventListener("close",h.subscribe(refresh),{once:true});refresh();
}
export function configurePlayers(state,event) {
    const h=host(state);
    if(event.shiftKey){standardWindow(h);return;}
    screenMenu(event.target.closest("button"),[["标准",()=>standardWindow(h)],["手动（旧版）",()=>manualWindow(h)]]);
}
export const woundNames=["健康","受伤","浴血","战败"];
export function renderPlayer(root,payload) {
    const table=el("table","player-table"), header=table.createTHead().insertRow();
    for(const title of ["生物/状态","生命值",...(payload.statsCols || []).map(c=>c.abbreviation),"先攻"]) header.append(el("th","",title));
    const body=table.createTBody();
    for(const r of payload.rows) {
        const tr=body.insertRow();if(r.isActive)tr.className="active";
        const name=tr.insertCell();name.textContent=(r.customName || r.name || "")+(r.ordinal==null?"":" ("+r.ordinal+")");
        for(const c of r.conditions || []) {
            const flag=el("span","condition"); flag.title=c.entity.name || "";flag.style.backgroundColor=c.entity.color;name.append(flag);
        }
        const hp=el("span","wound wound-"+r.hpWoundLevel,r.hpCurrent==null ? woundNames[r.hpWoundLevel] || "未知" : r.hpCurrent+"/"+(r.hpMax??"?"));
        tr.insertCell().append(hp);
        for(const {entity} of r.rowStatColData || []){
            const cell=tr.insertCell();
            if(entity.isUnknown)cell.textContent="?";
            else if(entity.type==="image" && entity.tokenUrl){const img=el("img","stat-token");img.alt="Token";img.src=new URL(entity.tokenUrl,new URL("../",location.href));cell.append(img);}
            else if(typeof entity.value==="boolean")cell.append(el("span","glyph",entity.value?"\ue013":"\ue014"));
            else cell.textContent=entity.value??"‒";
        }
        tr.insertCell().textContent=r.initiative ?? "";
    }
    root.replaceChildren(el("strong","round","回合: "+payload.round),table);
}
export function startPlayer(root,options={}) {
    if(options.embedded)return connectPlayer(root,options);
    theme();
    const heading=el("h1","player-title","先攻追踪器玩家视图"),tabs=el("nav","player-tabs");
    tabs.setAttribute("aria-label","连接方式");
    const pages=["v1","v0"].map((method,i)=>{
        const area=el("section","player-tab"),button=btn(i?"手动（旧版）":"标准",()=>select(i));
        button.setAttribute("role","tab");area.setAttribute("role","tabpanel");
        tabs.append(button);root.append(area);connectPlayer(area,{...options,method});return area;
    });
    function select(index){pages.forEach((page,i)=>{page.hidden=i!==index;tabs.children[i].setAttribute("aria-selected",String(i===index));});}
    root.prepend(heading,tabs);select(location.hash.startsWith("#v0:")?1:0);
}
function connectPlayer(root,{tracker,signal,embedded=false,method,legacy=false}={}) {
    if(!embedded && method==="v1"){
        window.addEventListener("keydown",e=>{
            if(e.key.toLowerCase()==="f" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest("input,textarea"))
                document.body.classList.toggle("player-full");
        });
    }
    const [mode,...parts]=(embedded?"":location.hash.slice(1)).split(":"),token=parts.join(":");
    const onLeave=fn=>signal?signal.addEventListener("abort",fn,{once:true}):window.addEventListener("pagehide",fn,{once:true});
    let connection,localChannel;
    const output=el("div","player-output"),network=el("div","player-network");
    function lost(message){
        const prior=connection;connection=null;
        prior?.destroy?.();prior?.close?.();localChannel?.close();localChannel=null;
        output.replaceChildren();network.hidden=false;
        if(message)output.append(el("p","",message));
    }
    onLeave(()=>lost());
    const retry=btn("断开并返回连接",()=>lost("连接已断开"));
    function receive(data){
        if(data?.type==="closed"){lost("主持人已关闭先攻表");return;}
        if(data?.type!=="state")return;
        network.hidden=true;renderPlayer(output,data.payload);
        if(connection)output.append(retry);
    }
    if(mode==="local" && token && method==="v1") {
        const channel=new BroadcastChannel("dm-player-"+token);
        localChannel=channel;channel.onmessage=e=>receive(e.data);channel.postMessage({type:"ready"});
        output.textContent="等待主持人…";root.append(output);return;
    }
    const name=input("玩家姓名","",()=>{}),code=el("textarea"),reply=el("textarea");
    name.placeholder="玩家姓名";code.placeholder="服务端 Token";code.setAttribute("aria-label","服务端 Token");
    reply.readOnly=true;reply.setAttribute("aria-label","玩家回复");
    const manual=method==="v0" || (embedded && legacy);
    code.value=mode===method?token:mode && !["local","v1","v0"].includes(mode) && !manual?mode:"";
    if(!embedded){
        const intro=el("section","player-help");
        if(manual)intro.append(el("p","player-warning","强烈建议使用“标准”模式，因为它更简单。如果标准模式不可用，“手动（旧版）”模式可以代替使用。"));
        intro.append(el("p","","先攻追踪器玩家视图是一个P2P（即无服务器）系统，允许玩家连接到DM帷幕的先攻追踪器。作为玩家，使用方法如下："));
        const steps=el("ol");
        for(const text of manual?['粘贴DM提供的“服务器token”到“服务器Token”输入框，然后点击“生成客户端Token”按钮。','等待“客户端Token”输入框出现，复制其中的内容，然后发送给DM。']:['输入你的姓名到“玩家姓名”输入框。','粘贴DM提供的“服务端Token”到“服务端Token”输入框。','点击“连接”按钮。'])steps.append(el("li","",text));
        intro.append(steps,el("p","",manual?"一旦DM接受了你的token，这个页面就会改变，显示DM的先攻追踪器中的战斗。":"在短暂的延迟后，你应该能够连接到DM并看到先攻追踪器。"),el("hr"));network.append(intro);
    }
    if(embedded)root.append(btn("连接本地先攻表",()=>{
        const states=tracker();
        if(!states.length)throw Error("请先在帷幕中打开先攻表");
        function connect(state){
            const h=host(state),channel=new BroadcastChannel("dm-player-"+h.localId);
            lost();localChannel=channel;channel.onmessage=e=>receive(e.data);channel.postMessage({type:"ready"});
        }
        if(states.length===1){connect(states[0]);return;}
        const {d,body}=dialog("选择先攻表");
        const list=el("select");
        list.setAttribute("aria-label","Select a local tracker");
        list.append(new Option("Select a local tracker",""));
        list.options[0].disabled=true;
        states.forEach((state,i)=>{
            const names=state.r.map(r=>r.n).filter(n=>n?.trim()),count=state.r.length;
            const summary=count+" creature"+(count===1?"":"s")+(names.length?" ("+names.slice(0,3).join(", ")+(names.length>3?"...":"")+")":"");
            list.append(new Option(summary,String(i)));
        });
        body.append(list,btn("OK",()=>{
            if(list.value===""){list.focus();return;}
            d.close();connect(states[Number(list.value)]);
        },"","blue"),btn("Back",()=>d.close()));
    }));
    const connect=btn(manual?"Generate Client Token":"连接",async()=>{
        await loadPeers();
        lost();
        if(manual || (embedded && PeerUtilV0.isValidToken(code.value))){
            const c=await PeerUtilV0.pInitialiseClient(code.value,m=>receive(m.data),e=>lost(e.message));
            if(!c)throw Error("服务端 Token 无效");
            connection=c.client;reply.value=c.textifiedSdp;
            const {pc,dc}=connection._ctx;
            const close=()=>{if(connection===c.client)lost("连接已断开，请向主持人索取新的连接码");};
            dc.addEventListener("close",close);
            pc.addEventListener("connectionstatechange",()=>{if(["failed","closed"].includes(pc.connectionState))close();});
        }else{
            if (!name.value.trim() || !code.value.trim()) throw Error("请输入玩家姓名和服务端 Token");
            const peer=connection=new PeerVeClient();
            await peer.pConnectToServer(code.value.trim(),m=>receive(m.data),{label:name.value,serialization:"json"});
            peer.connections.forEach(conn=>conn.on("close",()=>{if(connection===peer)lost("连接已断开");}));
        }
    });
    const form=el("div","player-connect");
    function labeled(text,field){const label=el("label","",text);label.append(field);return label;}
    if(!manual)form.append(labeled("玩家姓名",name));form.append(labeled("服务端Token",code),connect);
    if(manual || embedded)form.append(labeled("客户端Token",reply));
    network.append(form);root.append(network,output);
}

