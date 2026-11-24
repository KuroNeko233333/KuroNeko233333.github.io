export async function showTerms({root,manifest,object,signal}){
    let data=manifest.reading.terms?await object(manifest.reading.terms):null;
    if(!data && globalThis.caches && (await caches.keys()).includes("5etools-terms-v1")){
        const cache=await caches.open("5etools-terms-v1"),keys=await cache.keys();
        for(const key of keys.reverse()){
            try{const file=await(await cache.match(key)).json();if(Array.isArray(file.items)){data=file.items;break;}}catch{}
        }
    }
    if(signal.aborted)return;
    const wrapper=document.createElement("section");wrapper.className="bk5";
    wrapper.innerHTML='<h1 class="bk5-title">译名术语库</h1><form class="terms-form"><input type="search" name="q" placeholder="中文名或英文名" aria-label="译名"><input name="category" placeholder="类别"><input name="source" placeholder="来源"><label><input type="checkbox" name="exact"> 精确匹配</label><button>查询</button><button type="button" class="site-query">查本站资料</button></form><p role="status"></p><div class="term-results"></div>';
    root.replaceChildren(wrapper);
    const form=wrapper.querySelector("form"),out=wrapper.querySelector(".term-results"),status=wrapper.querySelector("p"),saved=new URLSearchParams(location.search);
    for(const key of ["q","source","category"])form.elements[key].value=saved.get(key)||"";
    form.elements.exact.checked=saved.get("exact")==="1";
    function paint(){
        out.replaceChildren();
        if(!data){status.textContent="这份安装书库没有独立译名表。可以按中文或英文查本站资料。";return;}
        const q=form.elements.q.value.trim().toLowerCase(),cat=form.elements.category.value.trim().toLowerCase(),src=form.elements.source.value.trim().toLowerCase();
        const hits=data.filter(r=>{
            const name=String(/[\u3400-\u9fff]/.test(q)?r.cn:r.en).toLowerCase();
            return (!q || (form.elements.exact.checked?name===q:name.includes(q))) && (!cat || String(r.category).toLowerCase().includes(cat))&&(!src||String(r.source).toLowerCase().includes(src));
        }).sort((a,b)=>String(a.en).localeCompare(String(b.en),"zh-CN",{numeric:true}));
        status.textContent=hits.length+" 条";let n=0;
        function more(){
            for(const r of hits.slice(n,n+30)){
                const row=document.createElement("article"),title=document.createElement("b"),desc=document.createElement("p");
                title.textContent=[r.en,r.cn].join(" · ");desc.textContent=[r.category_label||r.category,r.source_label||r.source,r.note,r.modified_reson].filter(Boolean).join(" · ");row.append(title,desc);out.append(row);
            }
            n+=30;if(n<hits.length){const b=document.createElement("button");b.textContent="更多结果";b.onclick=()=>{b.remove();more();};out.append(b);}
        }more();
    }
    form.onsubmit=e=>{e.preventDefault();const u=new URL(location.href);for(const key of ["q","category","source"])u.searchParams.set(key,form.elements[key].value);u.searchParams.set("exact",form.elements.exact.checked?"1":"0");history.pushState({}, "",u);paint();};
    wrapper.querySelector(".site-query").onclick=()=>{document.getElementById("global-query").value=form.elements.q.value;document.getElementById("sbsearch").click();};
    paint();
}