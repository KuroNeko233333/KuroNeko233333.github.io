const byId = id => document.getElementById(id);
const sizeNames={T:"微型",S:"小型",M:"中型",L:"大型",H:"巨型",G:"超巨型",V:"不定"};
const rarities={common:"常见",uncommon:"不常见",rare:"珍稀","very rare":"非常珍稀",legendary:"传说",artifact:"神器"};
function button(label,on,handler) {
  const b=document.createElement("button");b.type="button";b.className="chip";b.textContent=label;
  b.setAttribute("aria-pressed",String(on));b.onclick=handler;return b;
}
function label(text) {const l=document.createElement("span");l.className="quick-label";l.textContent=text;return l;}
export function quickControls(filters,monster,change) {
  const more=byId("more");
  const first=byId("quick-first"),second=byId("quick-second"),state=filters.state;
  const changed=()=>change();
  first.replaceChildren(label(monster ? "挑战等级" : "稀有度"));
  if (monster) {
    for (const [name,min,max] of [["0–4",0,4],["5–10",5,10],["11–16",11,16],["17+",17,null]]) {
      const on=state.cr?.[0]===min;
      first.append(button(name,on,()=>{state.cr=on ? null : [min,max]; changed();}));
    }
  } else {
    const selected=[state.rarity || []].flat();
    for (const [key,name] of Object.entries(rarities)) {
      const on=selected.includes(key);
      const b=button(name,on,()=>{
        const arr=on ? selected.filter(k=>k!==key) : [...selected,key];
        state.rarity=arr.length>1 ? arr : arr[0] || ""; changed();
      });
      b.dataset.rarity=key;first.append(b);
    }
  }
  const type=byId("type");
  const typeLabel=label(monster ? "生物类型" : "类型");
  type.setAttribute("aria-label",typeLabel.textContent);type.className="chip type";type.style.width=(Math.max(2,(type.selectedOptions[0]?.text || "").length)*13+30)+"px";
  second.replaceChildren(typeLabel,type);
  if (monster) {
    second.append(label("体型"));
    const sizes=filters.sizes || [];
    for (const size of sizes) {
      const on=state.size?.includes(size);
      second.append(button(sizeNames[size] || size,on,()=>{
        state.size=on ? state.size.filter(v=>v!==size) : [...state.size || [],size];changed();
      }));
    }
  } else second.append(button("需同调",state.attuned,()=>{state.attuned=!state.attuned;changed();}));
  more.hidden=false;second.append(more);
  const chosen=[];
  if(state.type)chosen.push(type.selectedOptions[0]?.text || state.type);
  if(monster){
    if(state.cr)chosen.push("CR "+state.cr[0]+(state.cr[1]==null ? "+" : "–"+state.cr[1]));
    chosen.push(...(state.size || []).map(k=>sizeNames[k] || k));
  }else{
    chosen.push(...[state.rarity || []].flat().map(k=>rarities[k] || k));
    if(state.attuned)chosen.push("需同调");
  }
  const summary=byId("quick-summary");summary.hidden=!chosen.length;summary.replaceChildren();
  if(chosen.length){
    const content=document.createElement("b");content.textContent=chosen.join(" · ");
    const clear=document.createElement("button");clear.textContent="清除";clear.onclick=()=>{
      Object.assign(state,{type:"",size:[],cr:null,rarity:"",attuned:false});changed();
    };
    summary.append("正在看：",content,clear);
  }
}
export function monsterControls(detail,card,settings,apply) {
  const bar=byId("monster-tools");bar.replaceChildren();
  if (!card.scale) return;
  const kv=detail.querySelector(".bk-mon-kv");
  if(!kv)return;
  const row=[...kv.querySelectorAll("strong,b")].find(e=>/^(CR|挑战|挑战等级)$/.test(e.textContent.trim()))?.parentElement || kv;
  const opener=document.createElement("button");opener.className="scale-button";opener.type="button";opener.title="调整挑战等级、召唤等级与熟练骰";
  opener.setAttribute("aria-label",opener.title);opener.setAttribute("aria-controls",bar.id);opener.setAttribute("aria-haspopup","true");
  opener.innerHTML='<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M1 12h2v3H1zm4-3h2v6H5zm4-4h2v10H9zm4-4h2v14h-2z"/></svg>';
  opener.onclick=()=>{
    if(bar.matches(":popover-open")){bar.hidePopover();return;}
    const r=opener.getBoundingClientRect();bar.showPopover();
    bar.style.left=Math.min(r.left,innerWidth-bar.offsetWidth-6)+"px";
    bar.style.top=(r.bottom+bar.offsetHeight+4>innerHeight ? Math.max(4,r.top-bar.offsetHeight-4) : r.bottom+3)+"px";
  };
  row.append(opener);
  function select(label,key,entries) {
    const l=document.createElement("label"), s=document.createElement("select");
    l.append(label+" ",s);s.dataset.scale=key;s.setAttribute("aria-label",label);
    s.add(new Option("原始",""));for (const n of entries) s.add(new Option(n,n));
    s.value=settings[key] ?? "";s.onchange=()=>{bar.hidePopover();apply(key,s.value);};bar.append(l);
  }
  if (card.scale.cr) select("调整 CR","cr",["0","1/8","1/4","1/2",...Array.from({length:30},(_,i)=>String(i+1))]);
  if (card.scale.spell!=null) select("召唤环阶","spell",Array.from({length:10-Number(card.scale.spell)},(_,i)=>String(i+Number(card.scale.spell))));
  if (card.scale.class) select("职业等级","classLevel",Array.from({length:20},(_,i)=>String(i+1)));
  if (card.scale.prof!==false) {
    const b=button(settings.prof ? "熟练骰" : "熟练加值",!!settings.prof,()=>{bar.hidePopover();apply("prof",!settings.prof);});
    b.dataset.profToggle="";bar.append(b);
  }
}
export function showProficiency(root,on) {
  for (const el of root.querySelectorAll("[data-prof-roll]")) {
    if (!el.hasAttribute("data-bonus-roll")) el.dataset.bonusRoll=el.dataset.roll || "";
    for(const child of el.querySelectorAll(".ve-rd__roller--roll-prof-bonus,.ve-rd__dc--rollable-text"))child.hidden=on;
    for(const child of el.querySelectorAll(".ve-rd__roller--roll-prof-dice,.ve-rd__dc--rollable-dice"))child.hidden=!on;
    if (on || el.dataset.bonusRoll) el.dataset.roll=on ? el.dataset.profRoll : el.dataset.bonusRoll;
    else delete el.dataset.roll;
  }
}