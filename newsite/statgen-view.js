import {
    abilities, modes, standard, entities, modifier, baseKey, userKey, getEntity,
    entityAbility, featAbility, featPrefix, grantedFeats, featSetKey,
} from "./statgen-state.js";

export const labels = ["掷骰", "标准数组", "购点", "手动"];
const iconNames = ["dice", "signal", "chart", "tools"];
export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
export const icon = name => `<span class="sg-icon sg-icon-${name}" aria-hidden="true"></span>`;
export const button = (action, label, cls = "", title = "") =>
    `<button type="button" data-sg-action="${action}" class="sg-btn ${cls}"${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ""}>${label}</button>`;
const options = (list, active, empty = null) => [
    empty == null ? "" : `<option value="-1">${esc(empty)}</option>`,
    ...list.map((text,i) => `<option value="${i}"${i===active ? " selected" : ""}>${esc(text)}</option>`),
].join("");
const check = (active, attrs) => `<input type="checkbox" ${attrs}${active ? " checked" : ""}>`;

function field(value, {key="", type="text", role="", title="", cls="", read=false}={}) {
    return `<input class="sg-input ${cls}" type="${type}" value="${esc(value)}"${key ? ` data-key="${key}"` : ""}${role ? ` data-sg="${role}"` : ""}${title ? ` aria-label="${esc(title)}"` : ""}${read ? " readonly" : ""}>`;
}

export function rail(mode) {
    return `<nav aria-label="生成方式">${modes.map((next,i)=>button("mode:"+next,`${icon(iconNames[i])}<span>${labels[i]}</span>`,"sg-tab"+(mode===next?" sg-active":""),labels[i])).join("")}</nav>
        <div class="sg-file-actions">${[
            ["download","download","保存到文件"], ["upload","upload","从文件加载"],
            ["share","link","复制链接"], ["reset-all","refresh","重置所有"],
        ].map(([action,name,title])=>button(action,icon(name),action==="reset-all"?"sg-danger":"sg-primary",title)).join("")}</div>`;
}

function rollLabels(rolls) {
    const counts = new Map();
    return rolls.map(({total}) => {
        const n = counts.get(total) || 0;
        counts.set(total, n+1);
        return n ? total+String(n).replace(/\d/g,digit=>"₀₁₂₃₄₅₆₇₈₉"[digit]) : String(total);
    });
}

function tops(state, mode) {
    if(mode==="manual")return '<div class="sg-intro" data-sg="input">在下方的&quot;基础&quot;列中输入你想要的属性值。</div>';
    if(mode==="array")return `<div class="sg-intro sg-array" data-sg="input"><div>将这些数值任意分配到你的属性上:</div><b>${standard.join(", ")}</b><div class="sg-assign">${button("assign","随机分配","sg-xs")}</div></div>`;
    if(mode==="pointbuy")return `<div class="sg-budget" data-sg="input">
        <label>总点数${field(state.pb_budget,{key:"pb_budget",role:"budget",cls:"sg-budget-field",read:!state.pb_isCustom})}</label>
        <label>剩余点${field(state.pb_points,{role:"remaining",cls:"sg-budget-field",read:true})}</label>
        ${button("reset","重置")}${button("random-buy","随机")}</div>`;
    const rolled=rollLabels(state.rolled_rolls);
    return `<div class="sg-intro sg-rolled" data-sg="input">
        <div class="sg-roll-row"><div>
            <label><span>公式:</span>${field(state.rolled_formula,{key:"rolled_formula",role:"formula",cls:"sg-formula"})}</label>
            <label><span>掷骰次数:</span>${field(state.rolled_rollCount,{key:"rolled_rollCount",role:"roll-count",cls:"sg-formula sg-minimal"})}</label>
        </div>${button("roll","掷骰","sg-primary")}</div>
        ${rolled.length ? `<div class="sg-roll-values">=<div data-sg="roll-values">${rolled.map((n,i)=>`<span title="${esc(state.rolled_rolls[i].text ?? "undefined")}"><i>[</i><b>${esc(n)}</b><i>]</i></span>`).join('<i>,</i>')}</div></div>
            <div data-sg="roll-total" title="The sum total of the above rolls.">总计: ${state.rolled_rolls.reduce((n,r)=>n+r.total,0)}</div>
            <div class="sg-assign">${button("assign","随机分配","sg-xs")}</div>` : ""}
    </div>`;
}

function column(label, cls, cell, group="") {
    return `<div class="sg-col ${cls}">
        <div class="sg-col-head">${group || "&nbsp;"}</div><div class="sg-col-head">${label || "&nbsp;"}</div>
        ${abilities.map((ab,i)=>`<div class="sg-cell">${cell(ab,i)}</div>`).join("")}
    </div>`;
}

function entityCols(data,state,ns) {
    const set=entityAbility(data,state,ns);
    if(!set)return "";
    const title=data.labels[ns];
    const cols=[];
    if(abilities.some(ab=>set[ab]))cols.push(column("静态","sg-fixed",ab=>
        field(set[ab] || 0,{type:"number",read:true,role:"fixed",cls:"sg-minimal sg-right"})));
    function choiceCol(type,ix,amount,allow,count) {
        const countLabel=count>1?` <small class="sg-muted">(x${count})</small>`:"";
        return column((amount>=0?"+":"")+amount+countLabel,"sg-bonus",ab=>allow.includes(ab) ? check(false,
            `data-entity-check="${ns}" data-ab="${ab}" data-choice="${type}" data-ix="${ix}" data-amount="${amount}" data-count="${count}" aria-label="${esc(title)} ${ab.toUpperCase()} +${amount}"`) : "");
    }
    const choice=set.choose;
    if(choice?.from)cols.push(choiceCol("From",0,choice.amount||1,choice.from,choice.count||1));
    if(choice?.weighted)choice.weighted.weights.forEach((w,i)=>cols.push(choiceCol("Weighted",i,w,choice.weighted.from,1)));
    return cols.length?`<div class="sg-bonus-group"><div class="sg-bonus-head" title="Ability Score Changes from ${esc(title)}">${ns==="race"?"Species":"Backg."}</div><div>${cols.join("")}</div></div>`:"";
}

function grid(data,state,mode) {
    const ability=data.labels.abilities;
    const asSelect=mode==="rolled" || mode==="array";
    const values=mode==="rolled"?rollLabels(state.rolled_rolls):standard;
    return `<div class="sg-grid" data-sg="result">
        ${column(mode!=="pointbuy"?button("reset",icon("refresh"),"sg-xxs sg-reset","重置"):"","sg-abil",(_,i)=>`<b title="${esc(ability[i])}">${esc(ability[i])}</b>`)}
        ${column("<b>基础</b>","sg-base",(ab,i)=>{
            const key=baseKey(mode,ab), title=ability[i]+" — 基础";
            return asSelect
                ? `<select class="sg-input sg-minimal sg-base-select" data-key="${key}" data-sg="base" aria-label="${esc(title)}">${options(values,state[key],"—")}</select>`
                : field(state[key]??0,{type:"number",key,role:"base",title,cls:"sg-minimal sg-right"});
        })}
        ${entityCols(data,state,"background")}${entityCols(data,state,"race")}
        ${column('<span title="此处输入额外/自定义的加值" class="sg-muted">用户</span>',"sg-user",(ab,i)=>field(state[userKey(ab)],{type:"number",key:userKey(ab),role:"user",title:ability[i]+" — 用户",cls:"sg-minimal sg-right"}))}
        ${column("总计","sg-total",(_,i)=>field("",{role:"total",title:ability[i]+" — 总计",read:true,cls:"sg-minimal"}))}
        ${column('<span title="Modifier">调整值</span>',"sg-mod",(_,i)=>field("",{role:"modifier",title:ability[i]+" — 调整值",read:true,cls:"sg-minimal"}))}
    </div>`;
}

function pickerLine(data,state,ns,kind,suffix) {
    const title=data.labels[ns], entry=getEntity(data,state,ns);
    const active=state["common_isPreview"+suffix];
    return `<div class="sg-entity-line">
        <span>选择一个${esc(title)}</span><div class="sg-entity-btns">
            ${button("filter:"+kind,icon("filter")+" 筛选","sg-xs","Filter for "+title)}
            ${button("pick:"+kind,esc(entry?.label||"—")+icon("caret"),"sg-entity-pick"+(entry?"":" sg-empty"),"选择"+title)}
            ${entry?button("preview:"+suffix,icon("eye"),"sg-xs sg-preview"+(active?" sg-active":""),"预览 "+title):""}
        </div>
        ${entry?.abilityLabels?.length>1 ? `<label class="sg-ability-choice">属性值提升 <select class="sg-input sg-ability-set" data-key="common_ixAbilityScoreSet${suffix}" aria-label="${esc(title)}属性加值">${options(entry.abilityLabels,state["common_ixAbilityScoreSet"+suffix])}</select></label>` : ""}
    </div>`;
}

function costs(state) {
    return `<section class="sg-cost-panel"><h4>属性值点数花费</h4><div class="sg-cost-body">
        <div class="sg-cost-table" data-sg="cost-table">
            <div class="sg-cost-head"><b>属性值</b><b>调整值</b><b>花费点数</b><span></span></div>
            ${state.pb_rules.map(({entity:r},i)=>`<div class="sg-cost-row">
                <span>${r.score}</span><span>${modifier(r.score)}</span>
                <span>${state.pb_isCustom?field(r.cost,{role:"cost",key:"cost:"+i,title:`${r.score} 花费点数`,type:"number",cls:"sg-cost-input sg-minimal sg-right"}):r.cost}</span>
                <span>${state.pb_isCustom && state.pb_rules.length>1 && (i===0||i===state.pb_rules.length-1)?button("remove-rule:"+i,icon("trash"),"sg-xxs sg-danger","Delete"):""}</span>
            </div>`).join("")}
        </div>
        ${state.pb_isCustom ? `<div class="sg-cost-actions">${button("lower","添加更低的属性值","sg-xs")}${button("upper","添加更高的属性值","sg-xs")}
            <div>${button("reset-rules","重置","sg-xs sg-danger")}${button("code-menu",icon("menu"),"sg-xs","Menu")}</div></div>` : ""}
        </div><hr><label class="sg-custom">自定规则 ${check(state.pb_isCustom,'data-key="pb_isCustom" data-sg="custom"')}</label></section>`;
}
function featRow(data,state,{prefix,feat,fixed,category,asi=false}) {
    const inAsi=asi && state[prefix+"mode"]!=="feat";
    const picked=feat ?? data.feats[state[prefix+"ixFeat"]];
    const set=featAbility(state,picked,prefix), fromKey=prefix+"featAbilityChooseFrom";
    const head=asi ? button("asi:"+prefix,"属性","sg-xs"+(inAsi?" sg-active":""))+button("feat:"+prefix,"专长","sg-xs"+(!inAsi?" sg-active":"")) : "<span>专长</span>";
    const body=inAsi
        ? `<div class="sg-asi-scores">${abilities.map((ab,i)=>`<label title="${esc(data.labels.abilities[i])}">${ab.toUpperCase()}<span>
            ${field(0,{key:`asi-score:${prefix}:${i}`,cls:"sg-minimal sg-right",type:"number",role:"asi-score",title:data.labels.abilities[i]+" — 属性值提升"})}</span></label>`).join("")}</div>`
        : `<div class="sg-feat-row"><div>${fixed?"":button("pickfeat:"+prefix,icon("search"),"sg-xxs","Choose a Feat")}
            ${picked?`<a href="feats.html#${esc(picked.hash)}" data-vet-page="feats.html" data-vet-hash="${esc(picked.hash)}" data-vet-source="${esc(picked.source)}">${esc(picked.name)}</a>`:'<i class="sg-muted">(选择一项专长)</i>'}</div>
            ${picked?.abilityLabels?.length>1?`<select class="sg-input sg-ability-set" data-key="${prefix}ixFeatAbility" aria-label="属性加值">${options(picked.abilityLabels,state[prefix+"ixFeatAbility"]||0)}</select>`:""}
            ${set?`<div class="sg-feat-abilities">${abilities.some(ab=>set[ab]) ? `<span>— ${abilities.flatMap((ab,i)=>set[ab]?[esc(data.labels.abilities[i])+" "+(set[ab]>=0?"+":"")+set[ab]]:[]).join(", ")}</span>` : ""}
            ${set.choose?.from ? `<span>— choose ${set.choose.count>1?set.choose.count+" ":""}+${set.choose.amount||1}</span>` : ""}
            ${set.choose?.from?.map((ab,i)=>`<label>${ab.toUpperCase()}${check(state[fromKey+"__isActive_"+i],`data-feat-check="${fromKey}" data-choice-ix="${i}" data-choice-length="${set.choose.from.length}" data-choice-count="${set.choose.count||1}"`)}</label>`).join("")||""}</div>`:""}
            ${set?.choose?.weighted?'<i class="sg-muted">The selected ability score format is currently unsupported. Please check back later!</i>':""}</div>`;
    return `<div class="sg-asi-row" data-category="${esc(asi?"!EB":category||"")}"><div class="sg-asi-kind">${head}</div>${body}</div>`;
}

function asiPanel(data,state) {
    const additional=entities.map(([ns])=>{
        const entry=getEntity(data,state,ns);
        if(!entry?.feats?.length)return "";
        const sets=entry.feats.map(set=>[
            ...Object.keys(set).filter(k=>!["any","anyFromCategory"].includes(k)),
            set.any?`任选 ${set.any}`:"",set.anyFromCategory?`${set.anyFromCategory.category} × ${set.anyFromCategory.count}`:"",
        ].filter(Boolean).join(", "));
        return `<div class="sg-granted"><hr><h4>${esc(data.labels[ns])}专长</h4>
            ${sets.length>1?`<select class="sg-input sg-ability-set" data-key="${featSetKey(ns)}">${options(sets,state[featSetKey(ns)]||0)}</select>`:""}
            ${grantedFeats(data,state,ns).map(entry=>featRow(data,state,entry)).join("")}</div>`;
    }).join("");
    const count=(text,key,role)=>`<div class="sg-count"><label>${esc(text)}:<span class="sg-ticker">${field(state[key],{key,role,cls:"sg-minimal",title:text})}
        ${button("count-up:"+key,"+","","Increase by 1 (SHIFT for 5)")}${button("count-down:"+key,"−","","Decrease by 1 (SHIFT for 5)")}</span></label></div>`;
    return `<section class="sg-asi" data-sg="list">
        <h4>属性值提升</h4>
        ${count("属性值提升次数","common_cntAsi","asi-count")}
        ${Array.from({length:state.common_cntAsi},(_,i)=>featRow(data,state,{prefix:featPrefix("ability",i),asi:true})).join("")}
        ${additional}
        <hr><h4>${esc(data.labels.feats)}</h4>
        ${count(data.labels.featCount,"common_cntFeatsCustom","feat-count")}
        ${Array.from({length:state.common_cntFeatsCustom},(_,i)=>featRow(data,state,{prefix:featPrefix("custom",i)})).join("")}
    </section>`;
}

export function panel(data,state,mode) {
    return `${mode!=="pointbuy"?tops(state,mode):""}<div class="sg-main"><div class="sg-score-panel">${mode==="pointbuy"?tops(state,mode):""}${grid(data,state,mode)}
        <div class="sg-entity-list">${[...entities].reverse().map(args=>pickerLine(data,state,...args)).join("")}</div>
        ${data.classicAllowed?`<div class="sg-tasha"><label>允许自定义出身 ${check(state.common_isTashas,'data-key="common_isTashas"')}</label>
          <small><i>An <a href="../variantrules.html#customizing%20your%20origin_tce">optional rule</a>
          ${button("origin-note",icon("eye"),"sg-xxs","Toggle &quot;Customizing Your Origin&quot; Section")} from Tasha's Cauldron of Everything, page 8.</i></small></div>`:""}
        </div>${mode==="pointbuy"?costs(state):""}</div><hr>
        <div class="sg-previews"><div data-preview="background"></div><div data-preview="race"></div><div data-preview="origin"></div></div>${asiPanel(data,state)}`;
}
