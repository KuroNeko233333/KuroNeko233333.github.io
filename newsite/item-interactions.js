import {decorateCard} from "./card-view.js";
const byId = id => document.getElementById(id);
// 只接受骰式的数字、运算符、括号和已知函数，不把资料文字作为程序执行。
export function evaluateRoll(expression) {
  const compact = expression.toLowerCase().replace(/\s+(piercing|necrotic|穿刺)(?=\s|$)/g,"")
    .replace(/\s+x\s+|×/g,"*").replace(/÷/g,"/").replace(/\s+/g,"");
  const tokens = compact.match(/(?:\d+(?:\.\d+)?)|floor|ceil|round|max|min|abs|[d()+*/^%,+-]/g) || [];
  if (!tokens.length || tokens.length > 256 || tokens.join("") !== compact) throw new Error("此骰式需要额外参数");
  let cursor=0, budget=10000;
  const details=[];
  function number() {
    const token=tokens[cursor++];
    if (!/^\d+(\.\d+)?$/.test(token)) throw new Error("骰式中的数值无效");
    return Number(token);
  }
  function dice(n) {
    cursor++;
    const sides=tokens[cursor]==="%" ? (cursor++,100) : number();
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(sides) || n<0 || n>budget || sides<0 || sides>1e7)
      throw new Error("骰数或面数超出范围");
    budget-=n;
    // 5etools 为未熟练检定生成 d0；旧掷骰器会在明细中列出 0。
    const rolls=Array.from({length:n},()=>sides===0 ? 0 : 1+Math.floor(Math.random()*sides));
    details.push(n+"d"+sides+" ["+rolls.slice(0,16).join(", ")+(n>16?"…":"")+"]");
    return rolls.reduce((sum,v)=>sum+v,0);
  }
  function atom() {
    const t=tokens[cursor];
    if (t==="+" || t==="-") { cursor++; return (t==="-" ? -1 : 1)*atom(); }
    if (t==="d") return dice(1);
    if (t==="(") { cursor++; const n=sum(); close(); return tokens[cursor]==="d" ? dice(n) : n; }
    if (["floor","ceil","round","abs","max","min"].includes(t)) {
      cursor++; if (tokens[cursor++]!=="(") throw new Error("骰式缺少左括号");
      const args=[sum()];
      while (tokens[cursor]===",") { cursor++; args.push(sum()); }
      close();return Math[t](...args);
    }
    const n=number(); return tokens[cursor]==="d" ? dice(n) : n;
  }
  function close() { if (tokens[cursor++]!==")") throw new Error("骰式缺少右括号"); }
  function power() { const x=atom(); if(tokens[cursor]!=="^")return x; cursor++;return x**power(); }
  function product() {
    let x=power();
    while (["*","/","%"].includes(tokens[cursor])) { const op=tokens[cursor++], y=power(); x=op==="*" ? x*y : op==="/" ? x/y : x%y; }
    return x;
  }
  function sum() {
    let x=product();
    while (["+","-"].includes(tokens[cursor])) { const op=tokens[cursor++], y=product(); x+=op==="+" ? y : -y; }
    return x;
  }
  const total=sum();
  if (cursor!==tokens.length || !Number.isFinite(total)) throw new Error("无法计算这一骰式");
  return {total, details};
}

function choose(label, options) {
  if (options.length < 2) return options[0];
  const raw=window.prompt(label+"\n"+options.map((v,i)=>(i+1)+". "+v).join("\n"),"1");
  if (raw===null) return null;
  const value=options[Number(raw)-1];
  if (!value) throw new Error("没有选择有效的骰式");
  return value;
}

function roll(el) {
  const output=byId("roll-result");
  try {
    const entry=JSON.parse(el.dataset.rollEntry || "{}"), alternatives=el.dataset.roll.split(";").filter(Boolean);
    let expr=choose("选择骰式",alternatives);
    if (expr==null) return;
    if (entry.prompt?.options) {
      const k=choose(entry.prompt.entry || "选择等级",Object.keys(entry.prompt.options));
      if (k==null) return;
      if (entry.prompt.options[k]) expr+="+"+entry.prompt.options[k];
    }
    let cancelled=false;
    if (expr==="average") throw new Error("原资料只给出 average，缺少可掷的骰式");
    expr=expr.replace(/@srd5e\.userchar\.pb|@classes\.druid\.levels/g,token=>{
      const label=token.endsWith(".pb") ? "熟练加值" : "德鲁伊等级";
      const v=window.prompt("角色的"+label);
      if(v==null){cancelled=true;return "0";}
      if(!/^\d+$/.test(v.trim()))throw new Error("请输入"+label);
      return String(Number(v));
    });
    expr=expr.replace(/#\$prompt_number(?::([^$]*))?\$#/gi,(_,metadata="")=>{
      const opts=Object.fromEntries(metadata.split(",").map(s=>s.trim().split("=")));
      const v=window.prompt(opts.title || "请输入数值",opts.default || "0");
      if (v==null) {cancelled=true;return "0";}
      if (v.trim()==="" || !Number.isFinite(+v) || +v<Number(opts.min ?? 0) || +v>Number(opts.max ?? Infinity)) throw new Error("数值超出骰式范围");
      return "("+Number(v)+")";
    });
    if (cancelled) return;
    const {total,details}=evaluateRoll(expr);
    let result=expr+" = "+total;
    if (details.length) result+="　"+details.join("，");
    const cells=el.closest("th")?.closest("table")?.querySelectorAll("td[data-roll-min]") || [];
    for (const cell of cells) {
      if (+cell.dataset.rollMin<=total && total<=+cell.dataset.rollMax) {
        result+="　"+[...cell.parentElement.cells].filter(c=>c!==cell).map(c=>c.textContent.trim()).join(" · "); break;
      }
    }
    output.textContent=result;
    document.dispatchEvent(new CustomEvent("catalog-roll",{detail:result}));
  } catch(e) { output.textContent=el.dataset.roll+" · "+e.message; }
  const close=document.createElement("button");close.type="button";close.textContent="关闭";close.onclick=()=>{output.hidden=true;};
  output.append(close);output.hidden=false;
}

export function attachInteractions(getPreview) {
  const panel=byId("preview");
  let serial=0, timer, closeTimer, anchor;
  function hide() {
    clearTimeout(timer); clearTimeout(closeTimer); serial++; anchor=null;
    panel.hidden=true; panel.replaceChildren();
  }
  function place() {
    const a=anchor.getBoundingClientRect(), p=panel.getBoundingClientRect();
    const left=a.right+p.width+12<innerWidth ? a.right+8 : Math.max(4,Math.min(innerWidth-p.width-4,a.left));
    const top=Math.max(4,Math.min(innerHeight-p.height-4,a.bottom+5));
    panel.style.left=left+"px"; panel.style.top=top+"px";
  }
  function targetOf(el) {
    const node=el.closest("[data-hover-html], [data-hover-page], .rows a");
    if (!node || panel.contains(node)) return null;
    if (node.dataset.hoverHtml) return {node,html:node.dataset.hoverHtml};
    if (node.dataset.hoverPage) return {node,page:node.dataset.hoverPage,hash:node.dataset.hoverHash};
    return {node,page:node.dataset.page || "items.html",hash:node.hash.slice(1),uid:node.dataset.id};
  }
  function show(target) {
    clearTimeout(closeTimer);
    if (target.node===anchor) return;
    hide();
    const ticket=++serial;
    anchor=target.node;
    timer=setTimeout(async ()=>{
      try {
        const preview=target.html || await getPreview(target.page,target.hash?.toLowerCase(),target.uid);
        if (ticket!==serial || !anchor?.isConnected) return;
        const surface = anchor.closest("dialog[open]") || document.body;
        if (panel.parentElement !== surface) surface.append(panel);
        if (preview?.card) {
          panel.innerHTML=preview.card.html;
          decorateCard(panel,preview.card,preview.kind,{preview:true});
          if (preview.outside) {
            const note=document.createElement("p");
            note.textContent="此条目在当前范围外。"; panel.prepend(note);
          }
        } else if (preview) panel.innerHTML=preview;
        else panel.textContent="当前资料库未收录这条预览。";
        panel.hidden=false; place();
      } catch { if(ticket===serial)hide(); }
    },260);
  }
  document.addEventListener("pointerover",e=>{
    if (panel.contains(e.target)) { clearTimeout(closeTimer); return; }
    if (e.pointerType==="touch") return;
    const target=targetOf(e.target);
    if (target)show(target);
  });
  document.addEventListener("pointerout",e=>{
    if ((!anchor?.contains(e.target) && !panel.contains(e.target)) ||
        (e.relatedTarget && (anchor?.contains(e.relatedTarget) || panel.contains(e.relatedTarget)))) return;
    clearTimeout(closeTimer); closeTimer=setTimeout(hide,100);
  });
  document.addEventListener("focusin",e=>{
    if (panel.contains(e.target)) return;
    const target=targetOf(e.target);
    if (target && e.target.matches(":focus-visible")) show(target);
    else hide();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){hide();byId("roll-result").hidden=true;}
    if(["Enter"," "].includes(e.key) && e.target.matches("[data-roll]")){e.preventDefault();roll(e.target);}
  });
  document.addEventListener("click",e=>{
    const dice=e.target.closest("[data-roll]");
    if(dice){e.preventDefault();roll(dice);}
    else if (!panel.contains(e.target))hide();
  });
  for (const event of ["scroll","resize"]) window.addEventListener(event,e=>{
    if (!(e.target instanceof Node) || !panel.contains(e.target)) hide();   // resize targets the window, not a node
  },true);
}

