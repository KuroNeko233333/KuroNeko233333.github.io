/* 我们的 5etools —— 手机版的外壳部分（屏幕宽度 ≤ 760px 时起作用，电脑上什么都不做）。样式在 mobile.css。
 * 在 shell.html 的 <head> 里加载（要早于外壳自己的脚本，才能改默认的内存模式）。
 * 1 手机上默认「省内存」：不在后台预载别的页面（网页版里每预载一页都要下载几 MB 资料）。用户自己选过的不动。
 * 2 资料范围和版本开关从顶栏搬进「⋯」菜单（顶栏放不下），屏幕变宽时搬回去。
 * 3 顶栏的页面标签：当前页滚到看得见的位置；职业页的职业条：当前职业滚到看得见的位置。 */
(() => {
	"use strict";
	const MQ = window.matchMedia("(max-width: 760px)");
	try { if (MQ.matches && !localStorage.getItem("ours.memMode")) localStorage.setItem("ours.memMode", "save"); } catch (e) { /* storage blocked */ }

	const start = () => {
		const bar = document.getElementById("bar"), menu = document.getElementById("moremenu");
		const sw = document.getElementById("switch"), ed = document.getElementById("edsw");
		if (!bar || !menu || !sw || !ed) return;
		const home = document.createElement("span");   // where the switches live on a wide screen
		home.hidden = true;
		sw.before(home);
		const box = document.createElement("div");
		box.className = "mob-sw";
		box.innerHTML = `<div class="mob-sw__h">资料范围</div><div class="mob-sw__a"></div><div class="mob-sw__tip"></div>`
			+ `<div class="mob-sw__h">版本<small>只对职业、法术、专长生效</small></div><div class="mob-sw__b"></div><div class="mob-sep"></div>`;
		const tip = box.querySelector(".mob-sw__tip");
		const showTip = () => { tip.textContent = sw.querySelector(".seg.on")?.title || ""; };
		new MutationObserver(showTip).observe(sw, {attributes: true, subtree: true, attributeFilter: ["class"]});

		const place = () => {
			if (MQ.matches) {
				box.querySelector(".mob-sw__a").append(sw);
				box.querySelector(".mob-sw__b").append(ed);
				if (!box.isConnected) menu.prepend(box);
				showTip();
			} else if (box.isConnected) {
				home.after(sw, ed);
				box.remove();
			}
		};
		place();
		MQ.addEventListener?.("change", place);

		// keep the current page tab and the current class chip in view
		const tabs = document.getElementById("tabs");
		const intoView = (scroller, el) => {
			if (!scroller || !el) return;
			const a = scroller.getBoundingClientRect(), b = el.getBoundingClientRect();
			if (b.left < a.left + 8 || b.right > a.right - 24) scroller.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2);
		};
		let lastTab = null;
		const chipDone = new WeakMap();
		setInterval(() => {   // a timer, not requestAnimationFrame: background frames get no animation frames
			if (!MQ.matches) return;
			const on = tabs?.querySelector(".tab.on");
			if (on && on !== lastTab) { lastTab = on; intoView(tabs, on); }
			const f = document.querySelector('#frames iframe[src*="classes.html"]');
			let doc = null;
			try { doc = f?.contentDocument; } catch (e) { return; }
			const list = doc?.querySelector("#list.cls__list"), cur = list?.querySelector(".list-multi-selected:not(.ve-hidden)");
			if (cur && chipDone.get(list) !== cur) { chipDone.set(list, cur); intoView(list, cur); }
		}, 400);
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
