export const sourceSections={
  core:"核心规则",supplement:"官方扩展",setting:"设定集",ours:"我们的扩充",
  thirdparty:"第三方",partner:"扩展包与合作",other:"其他",
};
export const scopeNotes={
  rec:"显示威世智官方、甲乙两档第三方资料和我们的扩充。默认推荐。",
  official:"只显示威世智（WotC）官方资料。",
  all:"在推荐范围之外再加上其余第三方资料。怪物页仍使用该页默认的来源限制。",
  brew:"只显示甲乙两档第三方资料和我们的扩充。",
  manual:"按勾选和排除的书筛选，也可从现有范围开始。",
};
export const editionNotes={
  "24":"优先显示新版重印。没有对应新版的旧条目也保留。",
  "14":"优先显示旧版重印。没有对应旧版的新条目也保留。",
  "":"同时显示两版。同版重印仍合并。",
};
export const presetModes=new Set(["rec","official","all","brew"]);
export function bookInPreset(book,preset){
  if(preset==="official")return book.official;
  if(preset==="rec")return book.official || book.good;
  if(preset==="brew")return !book.official && book.good;
  return preset==="all";
}
export function bookInScope(book,{mode,manualSources,excludedSources,strictManual}){
  if(mode==="manual" && strictManual){
    const code=book.s.toLowerCase();
    return manualSources.has(code) && !excludedSources.has(code);
  }
  return !presetModes.has(mode) || bookInPreset(book,mode);
}
const exclusionTip="排除：即使条目同时见于其他已勾选的书，也会隐藏。物品等页面还会排除用到这本书作底材或附加来源的条目。";
const coreOrder=["xphb","xdmg","xmm","phb","dmg","mm"];
const collator=new Intl.Collator("zh-Hans-CN-u-co-pinyin",{numeric:true,sensitivity:"base"});
function make(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!=null)node.textContent=text;
  return node;
}

export function manualPanel(root,change,preset){
  const query=root.querySelector("#manual-query"), total=root.querySelector("#manual-total");
  const groupsRoot=root.querySelector("#sources"), empty=root.querySelector("#manual-empty");
  let books, groups=[], selected=new Set(), excluded=new Set(), beforeSearch=null;
  root.querySelectorAll("[data-manual-preset]").forEach(button=>{
    button.onclick=()=>preset(button.dataset.manualPreset);
  });
  query.oninput=filter;
  function filter(){
    const text=query.value.trim().toLowerCase(), terms=text.split(/\s+/).filter(Boolean);
    const searching=!!terms.length;
    const exactCode=searching && groups.some(group=>group.rows.some(row=>row.code===text));
    const exact=searching && groups.some(group=>group.rows.some(row=>row.exact.includes(text)));
    if(searching && !beforeSearch)beforeSearch=groups.map(group=>group.element.open);
    let count=0;
    for(const [i,group] of groups.entries()){
      let shown=0;
      for(const row of group.rows){
        row.element.hidden=exactCode ? row.code!==text
          : exact ? !row.exact.includes(text) : !terms.every(term=>row.query.includes(term));
        if(!row.element.hidden)shown++;
      }
      group.element.hidden=!shown;
      if(searching)group.element.open=!!shown;
      else if(beforeSearch)group.element.open=beforeSearch[i];
      count+=shown;
    }
    if(!searching)beforeSearch=null;
    empty.hidden=!!count || !books;
  }
  function draw(entries){
    books=entries;beforeSearch=null;
    const byGroup=Map.groupBy(entries,book=>book.section);
    groups=[];
    for(const [section,title] of Object.entries(sourceSections)){
      const entries=byGroup.get(section);if(!entries?.length)continue;
      const group=make("details","manual-group");group.dataset.section=section;group.open=section==="core";
      const head=make("summary","manual-group-head"), count=make("span","manual-group-count");
      const clear=make("button","manual-secondary");clear.type="button";
      clear.onclick=e=>{
        e.preventDefault();
        const codes=entries.map(book=>book.code.toLowerCase());
        change({codes,checked:!codes.every(code=>selected.has(code))});
      };
      head.append(make("span","manual-group-name",title),count,clear);
      const list=make("div","manual-group-rows");
      const rows=entries.slice().sort((a,b)=>section==="core"
        ? coreOrder.indexOf(a.code.toLowerCase())-coreOrder.indexOf(b.code.toLowerCase())
        : collator.compare(a.name,b.name)).map(book=>{
        const code=book.code.toLowerCase(), element=make("div","manual-book");
        element.dataset.source=book.code;
        const label=make("label","manual-book-label"), box=make("input");
        box.type="checkbox";box.value=book.code;box.onchange=()=>change({codes:[code],checked:box.checked});
        const title=make("span","manual-book-name",book.name);
        title.title=book.english || book.name;
        const abbreviation=make("small","manual-book-code",[book.abv,book.year].filter(Boolean).join(" · "));
        label.append(box,title,abbreviation);
        const exclude=make("button","manual-secondary manual-exclude","排除");exclude.type="button";
        exclude.title=exclusionTip;exclude.dataset.exclude=book.code;
        exclude.setAttribute("aria-label","排除 "+book.abv);
        exclude.onclick=()=>change({exclude:code});
        element.append(label,exclude);list.append(element);
        const names=[book.name,book.english].map(name=>name.toLowerCase().replace(/\s*[（(]\d{4}[）)]$/,""));
        return {code,element,box,exclude,exact:[...names,book.abv.toLowerCase(),code],
          query:[book.name,book.english,book.abv,book.code,book.year].join(" ").toLowerCase()};
      });
      group.append(head,list);groups.push({element:group,rows,count,clear});
    }
    groupsRoot.replaceChildren(...groups.map(group=>group.element));
    filter();
  }
  return (entries,on,off)=>{
    selected=on;excluded=off;
    if(books!==entries)draw(entries);
    let sum=0;
    for(const group of groups){
      let count=0;
      for(const row of group.rows){
        row.box.checked=selected.has(row.code);
        row.exclude.setAttribute("aria-pressed",String(excluded.has(row.code)));
        if(row.box.checked)count++;
      }
      const size=group.rows.length, all=count===size;
      group.count.textContent=`已选 ${count} / 共 ${size}`;
      group.clear.textContent=all?"全不选":"全选";
      group.clear.title=all?"取消本组全部勾选":"勾选本组全部书目";
      sum+=count;
    }
    total.textContent=`已选 ${sum} 本`;
  };
}
