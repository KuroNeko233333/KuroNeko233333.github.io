export function showLibrary(root,books,stats,signal){
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
const byId=id=>root.querySelector("#"+id);
root.innerHTML=`<div class="wrap">
	<div class="top"><h1>📚 资料库总览</h1><a href="index.html">← 回到大厅</a><span class="muted">网站自带官方资料 + 中文第三方库 + 我们的扩充，全部在本机</span></div>
	<div class="cards" id="cards"></div>
	<div class="tools">
		<input id="q" placeholder="搜书名、作者、来源缩写……">
		<button class="chip on" data-f="all">全部</button>
		<button class="chip" data-f="ours">我们的扩充</button>
		<button class="chip" data-f="lib">中文第三方库</button>
		<button class="chip" data-f="player">有玩家选项</button>
		<button class="chip" data-f="one">2024 版</button>
	</div>
	<table><thead><tr>
		<th data-k="name">书名</th><th data-k="abv">缩写</th><th data-k="author">作者 / 译者</th>
		<th data-k="race">种族</th><th data-k="class">职业</th><th data-k="subclass">子职</th><th data-k="spell">法术</th><th data-k="feat">专长</th>
		<th data-k="background">背景</th><th data-k="optionalfeature">选项</th><th data-k="item">物品</th><th data-k="monster">怪物</th>
	</tr></thead><tbody id="tb"></tbody></table>
</div>`;
const K = ["race", "class", "subclass", "spell", "feat", "background", "optionalfeature", "item", "monster"];
	const NAME = {race: "种族", class: "职业", subclass: "子职", spell: "法术", feat: "专长", background: "背景", optionalfeature: "职业选项", item: "物品", monster: "怪物"};
	const cnt = (f, k) => {
		const c = f.counts || {};
		if (k === "race") return (c.race || 0) + (c.subrace || 0);
		if (k === "item") return (c.item || 0) + (c.baseitem || 0) + (c.magicvariant || 0);
		return c[k] || 0;
	};
	byId("cards").innerHTML = K.map(k => `<div class="card"><span>${NAME[k]}</span><b>${(stats.official[k] || 0) + (k === "race" ? stats.official.subrace : 0)}</b><span>官方 · 第三方 ${stats.brew[k] || 0}${stats.ours[k] ? ` · 我们的 ${stats.ours[k]}` : ""}</span></div>`).join("");
	const rows = books.map(f => {
		const s = f.sources[0] || {};
		return {f, name: (f.sources.map(x => x.full).filter(Boolean).join(" / ")) || f.id, abv: f.sources.map(x => x.abbreviation).join(" "),
			author: [...new Set([...(s.authors || []), s.translator].filter(Boolean))].join("、"),
			...Object.fromEntries(K.map(k => [k, cnt(f, k)]))};
	});
	let filter = "all", sortK = "name", sortDir = 1;
	let observer;
	signal.addEventListener("abort",()=>observer?.disconnect(),{once:true});
	const render = () => {
		const q = byId("q").value.trim().toLowerCase();
		const list = rows.filter(r => {
			if (filter === "ours" && !r.f.ours) return false;
			if (filter === "lib" && r.f.ours) return false;
			if (filter === "player" && !(r.race + r.class + r.subclass + r.spell + r.feat + r.background)) return false;
			if (filter === "one" && r.f.edition !== "one") return false;
			return !q || `${r.name} ${r.abv} ${r.author} ${r.f.file}`.toLowerCase().includes(q);
		}).sort((a, b) => (typeof a[sortK] === "number" ? (a[sortK] - b[sortK]) : String(a[sortK]).localeCompare(String(b[sortK]), "zh")) * sortDir);
		observer?.disconnect();
        const tbody=byId("tb");tbody.replaceChildren();let offset=0;
        const append=()=>{
            const limit=Math.min(offset+22,list.length);
            tbody.insertAdjacentHTML("beforeend",list.slice(offset,limit).map(r => `<tr><td>${r.f.ours ? `<span class="tag ours">我们的</span>` : ""}${r.f.edition === "one" ? `<span class="tag one">2024</span>` : ""}${esc(r.name)}<div class="muted">${esc(r.f.file)}</div></td>
			<td>${esc(r.abv)}</td><td>${esc(r.author)}</td>${K.map(k => `<td class="n ${r[k] ? "" : "z"}">${r[k] || "·"}</td>`).join("")}</tr>`).join(""));
            offset=limit;if(offset<list.length)observer.observe(tbody.lastElementChild);
        };
        observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();append();}},{root,rootMargin:"120px"});
        append();
	};
	byId("q").addEventListener("input", render);
	root.querySelectorAll(".tools .chip").forEach(c => c.addEventListener("click", () => {
		root.querySelectorAll(".tools .chip").forEach(x => x.classList.remove("on")); c.classList.add("on"); filter = c.dataset.f; render();
	}));
	root.querySelectorAll("th").forEach(th => th.addEventListener("click", () => {
		const k = th.dataset.k; if (sortK === k) sortDir = -sortDir; else { sortK = k; sortDir = typeof rows[0]?.[k] === "number" ? -1 : 1; } render();
	}));
	render();

}
