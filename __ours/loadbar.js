/* 我们的 5etools —— 下载进度条（外壳 shell.html 里加载；主要给网页版用：网慢时让人知道页面在动）。
 *
 * 页面（iframe 里）下载大文件时调用外壳的：
 *   top.__oursLoad?.progress(id, {page, label, loaded, total})   loaded / total 是字节数；total 不知道时给 0
 *   top.__oursLoad?.done(id)
 * id 随便取（同一次下载用同一个），page 是 "classes.html" 这样的页面名，label 是给人看的说明（例如「第三方和我们的书」）。
 *
 * 显示：顶栏下面一条金色细线（所有下载合计的进度），屏幕底部一个小卡片「职业 · 正在载入第三方和我们的书 1.2 / 3.6 MB」。
 * 不到 0.6 秒就下完的不显示，免得一闪；只显示当前标签页的卡片，后台预载的页面只在细线上体现。 */
(() => {
	"use strict";
	const NAMES = {"index.html": "大厅", "home.html": "大厅", "races.html": "种族", "classes.html": "职业", "spells.html": "法术", "feats.html": "专长",
		"backgrounds.html": "背景", "optionalfeatures.html": "职业选项", "items.html": "物品", "bestiary.html": "怪物", "books.html": "书库", "book.html": "书"};
	const css = `
	#ours-lb { position: fixed; z-index: 10002; left: 0; right: 0; top: var(--top, 48px); height: 2px; pointer-events: none; opacity: 0; transition: opacity .3s; }
	#ours-lb.on { opacity: 1; }
	#ours-lb > i { display: block; height: 100%; width: 0; background: #e5bd62; box-shadow: 0 0 6px rgba(229, 189, 98, .7); transition: width .25s ease-out; }
	#ours-lb.unknown > i { width: 30% !important; animation: ours-lb-slide 1.2s ease-in-out infinite; }
	@keyframes ours-lb-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
	#ours-lc { position: fixed; z-index: 10002; left: 50%; bottom: 18px; transform: translate(-50%, 8px); max-width: calc(100vw - 24px); box-sizing: border-box;
		display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 12px; background: #fffaf0; color: #2b2420;
		font: 14px/20px "Noto Sans SC", system-ui, sans-serif; box-shadow: 0 10px 24px rgba(60, 30, 10, .18), 0 0 0 1px rgba(110, 70, 20, .16);
		opacity: 0; pointer-events: none; transition: opacity .25s, transform .25s; }
	#ours-lc.on { opacity: 1; transform: translate(-50%, 0); }
	#ours-lc b { font-weight: 600; color: #822000; white-space: nowrap; }
	#ours-lc .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #776a5a; }
	#ours-lc .n { flex: none; font-variant-numeric: tabular-nums; color: #2b2420; }
	#ours-lc .ring { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(130, 32, 0, .15); border-top-color: #822000; animation: ours-lc-spin .8s linear infinite; }
	@keyframes ours-lc-spin { to { transform: rotate(360deg); } }
	@media (max-width: 520px) { #ours-lc b { display: none; } #ours-lc { bottom: 14px; } }   /* 顶栏的标签已经写着是哪一页 */
	@media (prefers-reduced-motion: reduce) { #ours-lb > i, #ours-lc { transition: none; } #ours-lb.unknown > i, #ours-lc .ring { animation: none; } }`;
	const jobs = new Map();   // id -> {page, label, loaded, total, since}
	let bar, card, timer = null;
	const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
	const activePage = () => {
		const f = document.querySelector("#frames iframe.on");
		const m = (f?.getAttribute("src") || "").match(/([\w-]+\.html)/);
		return m ? m[1] : "";
	};
	const paint = () => {
		if (!bar) return;
		const now = Date.now(), shown = [...jobs.values()].filter(j => now - j.since > 600);
		bar.classList.toggle("on", shown.length > 0);
		card.classList.remove("on");
		if (!shown.length) return;
		const known = shown.filter(j => j.total > 0);
		const tot = known.reduce((a, j) => a + j.total, 0), got = known.reduce((a, j) => a + Math.min(j.loaded, j.total), 0);
		bar.classList.toggle("unknown", !tot);
		bar.firstChild.style.width = tot ? Math.max(4, Math.round(got / tot * 100)) + "%" : "";
		const act = activePage(), mine = shown.find(j => j.page === act || (act === "home.html" && j.page === "index.html"));
		if (!mine) return;
		card.querySelector("b").textContent = NAMES[mine.page] || mine.page.replace(/\.html$/, "");
		card.querySelector(".t").textContent = "正在载入" + (mine.label || "资料");
		card.querySelector(".n").textContent = mine.total ? `${mb(mine.loaded)} / ${mb(mine.total)} MB` : mine.loaded ? `${mb(mine.loaded)} MB` : "";
		card.classList.add("on");
	};
	const tick = () => { paint(); timer = jobs.size ? setTimeout(tick, 250) : null; };   // a timer: background tabs get no animation frames
	const ensure = () => {
		if (bar || !document.body) return;
		const st = document.createElement("style");
		st.textContent = css;
		document.head.append(st);
		bar = Object.assign(document.createElement("div"), {id: "ours-lb", innerHTML: "<i></i>"});
		card = Object.assign(document.createElement("div"), {id: "ours-lc", innerHTML: '<span class="ring"></span><b></b><span class="t"></span><span class="n"></span>'});
		card.setAttribute("role", "status");
		document.body.append(bar, card);
	};
	window.__oursLoad = {
		progress (id, {page = "", label = "", loaded = 0, total = 0} = {}) {
			ensure();
			const j = jobs.get(id) || {since: Date.now()};
			Object.assign(j, {page: String(page).split("/").pop().split("#")[0], label, loaded, total});
			jobs.set(id, j);
			if (!timer) tick();
		},
		done (id) {
			jobs.delete(id);
			if (!jobs.size) { paint(); }
		},
	};
})();
