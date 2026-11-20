import {mediaUrl,tryImageMirror} from "./card-media.js";
const HALL = [
	{href: "races.html", icon: "fa-users", name: "种族", desc: "种族、血统与种族特质", k: "race"},
	{href: "classes.html", icon: "fa-hat-wizard", name: "职业", desc: "职业、子职与成长表", k: "class", sub: "subclass"},
	{href: "spells.html", icon: "fa-book-spells", name: "法术", desc: "按环阶、学派、职业找法术", k: "spell"},
	{href: "feats.html", icon: "fa-award", name: "专长", desc: "起源、通用、战斗风格、恩惠", k: "feat"},
	{href: "backgrounds.html", icon: "fa-portrait", name: "背景", desc: "背景与起源专长", k: "background"},
	{href: "optionalfeatures.html", icon: "fa-drafting-compass", name: "职业选项", desc: "魔能祈唤、战技、超魔法……", k: "optionalfeature"},
	{href: "items.html", icon: "fa-helmet-battle", name: "物品", desc: "魔法物品、装备与武器", k: "item"},
	{href: "bestiary.html", icon: "fa-dragon", name: "怪物", desc: "怪物数据卡", k: "monster"},
	{href: "books.html", icon: "fa-books", name: "书库", desc: "整本阅读规则书与我们的扩充", k: "books"},
];
const HALL_DIR = [
	["规则与参考", [["variantrules.html", "术语汇编"], ["conditionsdiseases.html", "状态与疾病"], ["actions.html", "动作"], ["tables.html", "表格"],
		["languages.html", "语言"], ["deities.html", "神祇"], ["quickreference.html", "快速参考（2014）"]]],
	["角色", [["charcreationoptions.html", "其他角色创建选项"], ["statgen.html", "属性生成器"], ["lifegen.html", "这是你的人生"], ["names.html", "命名"]]],
	["主持人", [["dmscreen.html", "DM 帷幕"], ["adventures.html", "冒险模组"], ["bestiary.html?encounter=1", "遭遇构筑器"], ["lootgen.html", "战利品生成器"],
		["crcalculator.html", "CR 计算器（2014）"], ["trapshazards.html", "陷阱与危害"], ["objects.html", "物件"], ["cultsboons.html", "异教与超自然赠礼"],
		["rewards.html", "其他奖励"], ["vehicles.html", "载具"], ["bastions.html", "据点"], ["decks.html", "牌组"], ["maps.html", "地图"]]],
	["更多", [["psionics.html", "灵能"], ["recipes.html", "食谱"], ["homecrafts.html", "手工艺品"], ["terms.html", "术语库"],
		["/__ours/library.html", "资料库（全部书目）"], ["managebrew.html", "管理自制内容"], ["blocklist.html", "内容黑名单"]]],
];
// Only core-rulebook art. Chapter indexes match book-*.json (zero based).
const HALL_ART = [
	{path: "book/XPHB/004-01-005.adventurers-bartering.webp", book: "XPHB", chapter: 1, credit: "《玩家手册》（2024）· 第 1 章", focus: "58% 46%"},
	{path: "book/XPHB/008-01-009.adventurers-in-combat.webp", book: "XPHB", chapter: 1, credit: "《玩家手册》（2024）· 第 1 章", focus: "58% 40%"},
	{path: "book/XPHB/009-01-010.displacer-beast-combat.webp", book: "XPHB", chapter: 1, credit: "《玩家手册》（2024）· 第 1 章", focus: "58% 48%"},
	{path: "book/XPHB/180-07-006.wizard-familiar-shopping.webp", book: "XPHB", chapter: 6, credit: "《玩家手册》（2024）· 装备", focus: "65% 48%"},
	{path: "book/XPHB/182-08-002.aasimar-wizard.webp", book: "XPHB", chapter: 7, credit: "《玩家手册》（2024）· 法术", focus: "53% 42%"},
	{path: "book/XDMG/007-01-002.traveling-party.webp", book: "XDMG", chapter: 1, credit: "《城主指南》（2024）· 第 2 章", focus: "58% 48%"},
	{path: "book/XDMG/008-01-003.party-infiltration.webp", book: "XDMG", chapter: 1, credit: "《城主指南》（2024）· 第 2 章", focus: "56% 45%"},
	{path: "book/XDMG/015-01-010.fantastical-landscapes.webp", book: "XDMG", chapter: 1, credit: "《城主指南》（2024）· 第 2 章", focus: "65% 48%"},
	{path: "book/XDMG/016-01-011.river-party.webp", book: "XDMG", chapter: 1, credit: "《城主指南》（2024）· 第 2 章", focus: "62% 45%"},
	{path: "book/XDMG/107-07-004.crafting-magic-items.webp", book: "XDMG", chapter: 6, credit: "《城主指南》（2024）· 宝藏", focus: "55% 43%"},
	{path: "book/XMM/090-03-015.adult-copper-dragon.webp", book: "XMM", chapter: 1, credit: "《怪物图鉴》（2025）· 赤铜龙", focus: "57% 45%"},
	{path: "book/XMM/262-19-013.adult-silver-dragon.webp", book: "XMM", chapter: 1, credit: "《怪物图鉴》（2025）· 银龙", focus: "55% 42%"},
];
const HALL_THUMBS = {
	race: {path: "book/XMM/088-03-013.commoners.webp", focus: "20% 50%"}, // foreground people, not the distant street
	class: {path: HALL_ART[5].path, focus: "10% 45%"}, // the travelling adventurers, rather than the cart wheel
	spell: {path: HALL_ART[4].path, focus: "45% 40%"}, // caster's face and spell focus
	feat: {path: HALL_ART[1].path, focus: "85% 45%"}, // archer's face and bow
	background: {path: "book/XDMG/024-02-004.seas-of-greyhawk.webp", focus: "38% 48%"}, // ship and sails
	optionalfeature: {path: "book/XMM/191-13-001.mages.webp", focus: "62% 35%"}, // red-robed mage
	item: {path: "book/XDMG/108-07-005.magic-tome.webp", focus: "50% 62%"}, // the glowing tome, less empty space above
	monster: {path: "book/XMM/145-07-015.adult-gold-dragon.webp", focus: "18% 32%"}, // dragon's head, not just its wing
	books: {path: "covers/XPHB.webp", focus: "50% 60%", crop: 1.34}, // crop the square file's transparent side margins; centre the cover's people
};

export function showHall(root,s,route){
const web=!!document.querySelector('meta[name="catalog-web"]');
const h=html=>{const t=document.createElement("template");t.innerHTML=html;return t.content.firstElementChild;};
const hall = h(`<section class="ours-hall2">
			<header class="oh-hero">
				<div class="oh-kicker">${web ? "网页版" : "本地版 · 断网可用"}</div>
				<h1 class="oh-title">冒险者大厅</h1>
				<p class="oh-sub">官方规则、中文第三方资料和我们自己转换的书都在这里。顶栏的<b>资料范围</b>决定看哪些书，<b>版本</b>决定看 2014 还是 2024。</p>
				<button type="button" class="oh-search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8.7" cy="8.7" r="5.4"/><path d="m12.8 12.8 4 4"/></svg><span>搜索法术、怪物、物品、职业……</span><kbd>Ctrl K</kbd></button>
				<div class="oh-books"><b data-stat="books">…</b> 本中文第三方书 · <b data-stat="ourBooks">…</b> 本我们的扩充</div>
			</header>
			<div class="oh-grid">${HALL.map(t => `<a class="oh-card" href="${t.href}">
				<span class="oh-card__ic"><i class="fal ${t.icon}"></i></span>
				<span class="oh-card__body"><span class="oh-card__name">${t.name}</span><span class="oh-card__desc">${t.desc}</span><span class="oh-card__n" data-tile="${t.k}"${t.sub ? ` data-sub="${t.sub}"` : ""}>&nbsp;</span></span>
			</a>`).join("")}</div>
			<h2 class="oh-h">全部页面</h2>
			<div class="oh-dir">${HALL_DIR.map(([g, items]) => `<div class="oh-dir__col"><div class="oh-dir__h">${g}</div>${items.map(([href, name]) => `<a href="${href}">${name}</a>`).join("")}</div>`).join("")}</div>
			<div class="ours-hall__ranks"></div>
			<footer class="oh-foot">资料来自 5etools 中文站（tjliqy/5etools-cn）、中文第三方库（tjliqy/homebrew）、5e 不全书汉化组与各位译者；我们的扩充由我们自己整理转换。</footer>
		</section>`);
root.replaceChildren(hall);
hall.querySelector("[data-stat=books]").textContent=s.books;hall.querySelector("[data-stat=ourBooks]").textContent=s.ourBooks;
const n = v => Number(v || 0).toLocaleString("zh-CN");
			hall.querySelectorAll("[data-tile]").forEach(el => {
				const k = el.dataset.tile;
				if (k === "books") { el.innerHTML = `官方书 · <b>${s.ourBooks}</b> 本我们的扩充`; return; }
				const line = key => `<b>${n(s.official[key])}</b> 官方 · <b>${n((s.brew[key] || 0) + (s.ours[key] || 0))}</b> 第三方`;
				el.innerHTML = line(k) + (el.dataset.sub ? `<span class="oh-card__sub">子职 ${line(el.dataset.sub)}</span>` : "");
			});
    function picture(path,focus){
        const img=new Image();img.alt="";img.decoding="async";img.style.objectPosition=focus;
        img.addEventListener("error",()=>tryImageMirror(img),{once:true});img.src=mediaUrl("../img/"+path);return img;
    }
    const art=h('<div class="oh-art"><div class="oh-art-caption"><a class="oh-art-source"></a><button class="oh-art-next">↻ 换一张</button></div></div>');
    hall.querySelector(".oh-hero").append(art);
    function choose(){
        const prior=localStorage.getItem("ours.hallArt"), choices=HALL_ART.filter(a=>a.path!==prior);
        const a=choices[Math.floor(Math.random()*choices.length)];localStorage.setItem("ours.hallArt",a.path);
        art.querySelector("img")?.remove();const img=picture(a.path,a.focus);art.prepend(img);
        art.dataset.state="pending";img.onload=()=>art.dataset.state="ready";img.onerror=()=>art.dataset.state="failed";
        const link=art.querySelector("a");link.textContent=a.credit;link.href="book.html#"+a.book+","+a.chapter;
    }
    choose();art.querySelector("button").onclick=choose;
    hall.querySelector(".oh-search").onclick=()=>document.getElementById("sbsearch").click();
    hall.querySelectorAll(".oh-card").forEach((card,i)=>{
        const a=HALL_THUMBS[HALL[i].k],thumb=document.createElement("span");
        thumb.className="oh-thumb";thumb.style.setProperty("--oh-thumb-crop",a.crop||1);
        const img=picture(a.path,a.focus);img.loading="lazy";img.style.transformOrigin=a.focus;
        img.onload=()=>thumb.classList.add("is-ready");img.onerror=()=>thumb.classList.add("oh-thumb-failed");
        thumb.append(img);card.prepend(thumb);
    });
    for(const a of hall.querySelectorAll("a[href]"))a.href=route(a.getAttribute("href"));
}
