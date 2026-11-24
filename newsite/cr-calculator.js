const sizes={Tiny:4,Small:6,Medium:8,Large:10,Huge:12,Gargantuan:20};
const options=values=>values.map(([v,n])=>`<option value="${v}">${n}</option>`).join("");
const field=(id,label,input)=>`<label class="cr-field"><span>${label}</span>${input.replace("<@",'<input id="'+id+'"')}</label>`;
const number=(id,label,value)=>field(id,label,'<@ type="number" value="'+value+'">');
const check=(id,label)=>field(id,label,'<@ type="checkbox">');
const select=(id,label,values)=>field(id,label,`<select id="${id}">${options(values)}</select>`);
const keys=["expectedcr","ac","dpr","attackbonus","saveinstead","size","hd","con","vulnerabilities","resistances","flying","saveprofs"];
function fraction(s){return String(s).split("/").map(Number).reduce((a,b)=>a/b);}
function meanCr(value){
    if(value>0 && value<=.1875)return "1/8";
    if(value>.1875 && value<=.375)return "1/4";
    if(value===.5 || value===.5625)return "1/2";
    return String(Math.round(value));
}
// Feature effects are arithmetic from the installed table. Never execute strings as JavaScript.
function effect(expression,trait,expected,hp,actual){
    if(!expression)return 0;
    if(Number.isFinite(+expression))return +expression;
    switch(expression){
        case "trait":return trait;
        case "hp":return hp;
        case "hpActual * 0.33":return actual*.33;
        case "trait*3":return trait*3;
        case "Math.floor((expectedCr <= 10) ? hp * 0.25 : 0)":return Math.floor(expected<=10?hp*.25:0);
        case "((expectedCr >= 0 && expectedCr <= 4) ? 10*trait : ((expectedCr >= 5 && expectedCr <= 10) ? 20*trait : ((expectedCr >= 11) ? 30*trait : 0)))":
            return trait*(expected>=11?30:expected>=5?20:expected>=0?10:0);
        case "((expectedCr >= 0 && expectedCr <= 4) ? 7 : ((expectedCr >= 5 && expectedCr <= 10) ? 14 : ((expectedCr >= 11 && expectedCr <= 16) ? 21 : ((expectedCr >= 17) ? 28 : 0))))":
            return expected>=17?28:expected>=11?21:expected>=5?14:expected>=0?7:0;
        default:throw Error("无法读取怪物特性公式 "+expression);
    }
}
export function showCr(root,data){
    const rows=data.cr;
    root.innerHTML=`<section class="cr-page"><div class="cr-columns"><div><div id="croutput">等待计算结束...</div><p class="cr-error" role="status" hidden></p><button id="crcalc_reset" type="button">重置</button><h4>说明</h4><ol><li>输入该生物的预期CR。</li><li>填写该生物的HP、AC、以及其他的防御性属性。</li><li>填写该生物的攻击性属性。DPR(每轮平均伤害)代表着三个战斗轮的平均！</li><li>勾选该生物所拥有的特殊怪物特性。</li></ol><small>请确保你已经阅读了<em>《地下城主指南（2014）》</em>的<a href="book.html#dmg,9,creating%20a%20monster,0">怪物创建章节</a>，从第273页到第283页。你可以点击右侧的表格以自动填入固定的数值，再随你的喜好调整。你可以将鼠标指向各个标签以通过一段简短叙述了解各属性对怪物CR的影响。你也可以指向各个特性描述以了解该特性对CR&gt;计算的影响。</small><hr>${field("expectedcr","预期 CR:",'<@ value="0" size="2">')}</div><div><h4 class="cr-table-title">各挑战等级的怪物数据</h4><table id="msbcr"><thead><tr>${["CR","XP","熟练<br>加值","护甲<br>等级","生命值","攻击<br>加值","伤害<br>每轮","豁免<br>DC"].map(t=>"<th>"+t+"</th>").join("")}</tr></thead><tbody>${rows.map((r,i)=>`<tr data-index="${i}">${[r._cr,r.xp,r.pb,r.ac,r.hpMin+"-"+r.hpMax,r.attackBonus,r.dprMin+"-"+r.dprMax,r.saveDc].map(v=>"<td>"+v+"</td>").join("")}</tr>`).join("")}</tbody></table></div></div>
    <hr><div class="cr-columns"><div><h4>防御属性</h4>${number("hp","生命值:",1)}${number("ac","护甲等级:",13)}</div>
    <div><h4>攻击属性</h4>${number("dpr","每轮平均伤害(DPR):",1)}${number("attackbonus","攻击加值/豁免DC:",3)}${check("saveinstead","使用豁免？")}</div></div>
    <hr><div class="cr-columns"><div>${select("size","体型:",Object.keys(sizes).map((v,i)=>[v,["微型","小型","中型","大型","巨型","超巨型"][i]]))}${field("hd","生命骰：",'<span><@ type="number" value="1"><span id="hdval">d8</span></span>')}${number("con","体质值:",10)}</div><div>${check("vulnerabilities","易伤：")}${select("resistances","抗性/免疫：",[[0,"无"],["res","抗性"],["imm","免疫"]])}${check("flying","飞行且可以在远距离造成伤害(限定CR 0~9)：")}${select("saveprofs","豁免熟练：",[[0,"0-2"],[2,"3-4"],[4,"5-6"]])}</div></div><hr><section class="cr-features"><h4>怪物特性</h4><div class="cr-trait"><b></b><b>名称</b><b>范例怪物</b><b>特性描述</b></div><div id="cr-traits"></div><p><small><em>注记：这里并为含括所有的怪物特性。在DMG(2014)中另有关于要如何评估其它特性的记载。</em></small></p></section></section>`;
    const $=id=>root.querySelector("#"+id);
    const entries=data.features.map(f=>{
        const row=document.createElement("label");row.className="cr-trait";
        row.innerHTML='<span><input type="checkbox">'+(f.hasNumberParam?'<input type="number" min="0" value="0">':'')+'</span><span></span><span></span><span></span>';
        const [box,param]=row.querySelectorAll("input");
        row.children[1].textContent=f.name;row.children[2].innerHTML=f.exampleHtml;row.children[3].innerHTML=f.effectHtml;
        row.title=[["HP",f.hp],["AC",f.ac],["DPR",f.dpr],["AB",f.attackBonus]].filter(x=>x[1]).map(x=>x.join(": ")).join(", ");
        $("cr-traits").append(row);return {box,param,f};
    });
    const ctl=Object.fromEntries([...keys,"hp"].map(k=>[k,$(k)]));
    const tips={
        "expectedcr": "要进行CR计算，首先你必须决定这个怪物最终的CR是多少。",
        "hp": "生物的生命值会决定其根据AC调整前的防御性CR。",
        "ac": "生物的AC会调整其防御性CR。",
        "dpr": "生物的每轮平均伤害(DPR)决定了它的攻击性CR，且其攻击性CR会再根据其攻击加值或豁免DC进行调整。DPR是以它在三轮内最大伤害输>出的平均值决定（掷骰取平均值，忽视暴击和命中准确）。区域效应将被视为它命中了两个生物，且目标被视作在任何豁免检定中失败。",
        "attackbonus": "生物的攻击加值或豁免DC会调整其攻击性CR。",
        "saveinstead": "若一个生物的伤害输出比起攻击更依赖涉及豁免的能力，则它的豁免DC将被用于调整它的攻击性CR，而非使用它的攻击加值。",
        "size": "生物的体型将决定它每颗生命骰的大小。",
        "hd": "玩家角色不同，NPC所得到的生命骰数量完全是任意决定的。随你喜好调整这个数量。",
        "con": "生物的HP会因为它每一颗拥有的生命骰得到其体质调整值的加值。",
        "vulnerabilities": "若生物具有某个常见伤害类型的易伤（特别是钝击、穿刺、挥砍伤害），则它的有效生命值将被视为原本的一半。",
        "resistances": "怪物的HP会根据它对于常见伤害类型（其中最主要为非魔法的钝击、穿刺、和挥砍伤害）而乘上倍率。",
        "flying": "若怪物可以飞行且能在远距离造成伤害，则它的有效AC将增加2点。但这个加成只会发生在其预期挑战等级为10或更低。",
        "saveprofs": "若生物具有3或4个豁免熟练项，则它的有效AC增加2点。若有5或6个豁免熟练项，则有效AC增加4点。"
};
    for(const [id,text] of Object.entries(tips))ctl[id]?.closest("label")?.setAttribute("title",text);
    ctl.size.value="Medium";
    const value=k=>ctl[k].type==="checkbox"?ctl[k].checked:ctl[k].value;
    const n=k=>parseInt(value(k));
    const mod=()=>Math.floor((n("con")-10)/2);
    const average=()=>sizes[value("size")]/2+.5+mod();
    const dice=()=>Math.round(n("hp")/average()) || 1;
    const [base,...saved]=location.hash.slice(1).split(/,(?=mf-)/);
    if(base.split(",").length>=12){
        base.split(",").slice(0,12).forEach((v,i)=>{const el=ctl[keys[i]];if(el.type==="checkbox")el.checked=v==="true";else el.value=v;});
        ctl.hp.value=Math.floor(n("hd")*average());
        for(const {box,param,f} of entries){const val=saved.find(x=>x.startsWith(f.key+":"));if(val){box.checked=true;if(param)param.value=val.slice(f.key.length+1);}}
    }
    let selectedRow;
    function update(){
        const expected=n("expectedcr"),actual=n("hp"),save=value("saveinstead");
        const rowIndex=rows.findIndex(r=>r._cr===value("expectedcr"));
        if(selectedRow?.dataset.index!==String(rowIndex)){
            selectedRow?.removeAttribute("aria-current");
            selectedRow=$("msbcr").querySelector('[data-index="'+rowIndex+'"]');
            selectedRow?.setAttribute("aria-current","true");
        }
        let hp=actual*(value("vulnerabilities") ? .5 : 1),ac=n("ac")+n("saveprofs")+(value("flying")?2:0),attack=n("attackbonus"),dpr=n("dpr");
        if(expected>=0 && value("resistances")!=="0"){
            const immune=value("resistances")==="imm";
            hp*=expected<=4?2:expected<=10?(immune?2:1.5):expected<=16?(immune?1.5:1.25):(immune?1.25:1);
        }
        const hash=keys.map(value);
        for(const {box,param,f} of entries)if(box.checked)hash.push(f.key+":"+(param?param.value:true));
        const next="#"+hash.join(",")+(hash.length===12?",":"");
        if(location.hash!==next)history.replaceState(history.state,"",next);
        const unresolved=entries.find(({box,f})=>box.checked && f.dpr==="特质");
        const error=root.querySelector(".cr-error");error.hidden=!unresolved;
        if(unresolved){
            error.textContent=unresolved.f.name+"的资料中含有未定义的公式「特质」。计算已暂停，取消勾选后继续。";
            return;
        }
        for(const {box,param,f} of entries)if(box.checked){
            const trait=Number(param?.value||0);hp+=effect(f.hp,trait,expected,hp,actual);ac+=Number(f.ac||0);
            dpr+=effect(f.dpr,trait,expected,hp,actual);if(!save)attack+=Number(f.attackBonus||0);
        }
        hp=Math.floor(hp);dpr=Math.floor(dpr);
        function rating(amount,min,max,stat,v,cap){
            const i=rows.findLastIndex(r=>Math.min(cap,amount)>=r[min] && Math.min(cap,amount)<=r[max]);
            return i<0?"0":rows[Math.min(rows.length-1,Math.max(0,i-Math.trunc((rows[i][stat]-v)/2)))]?._cr || "0";
        }
        const def=rating(hp,"hpMin","hpMax","ac",ac,850),off=rating(dpr,"dprMin","dprMax",save?"saveDc":"attackBonus",attack,320);
        const cr=meanCr((fraction(def)+fraction(off))/2),r=rows.find(x=>x._cr===cr)||rows[0],hd=dice(),s=sizes[value("size")];
        $("hdval").textContent="d"+s;
        $("croutput").innerHTML=`<h4>挑战等级CR: ${cr}</h4>`+[`进攻CR: ${off}`,`防御CR: ${def}`,`熟练度加值: +${r.pb}`,`有效HP: ${hp} (${hd}d${s}${mod()<0?"":"+"}${mod()*hd})`,`有效AC: ${ac}`,`每轮平均伤害: ${dpr}`,(save?"豁免DC: ":"有效攻击加值: +")+attack,`经验值: ${r.xp}`].map(t=>"<p>"+t+"</p>").join("");
    }
    function changed(e){
        const k=e.target.id;
        if(["size","con","hd"].includes(k))ctl.hp.value=Math.floor(n("hd")*average());
        if(k==="hp")ctl.hd.value=dice();
        if(k==="saveinstead")ctl.attackbonus.value=n("attackbonus")+(value(k)?10:-10);
        update();
    }
    const panel=root.firstElementChild;
    panel.oninput=e=>{if(e.target.matches('input:not([type=checkbox])'))changed(e);};
    panel.onchange=e=>changed(e);
    $("msbcr").onclick=e=>{const row=e.target.closest("[data-index]");if(!row||!confirm("此操作将重置计算器。你确定吗？"))return;
        const r=rows[row.dataset.index];for(const [k,v] of Object.entries({expectedcr:r._cr,ac:r.ac,hp:(r.hpMin+r.hpMax)/2,dpr:r.dprMin,attackbonus:value("saveinstead")?r.saveDc:r.attackBonus}))ctl[k].value=v;
        ctl.hd.value=dice();update();};
    $("crcalc_reset").onclick=()=>{if(confirm("你确定吗？")){history.replaceState(history.state,"",location.pathname+location.search);showCr(root,data);}};
    update();
}
