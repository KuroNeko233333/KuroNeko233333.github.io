import { mediaUrl, tryImageMirror } from "./card-media.js";
import { bindCardActions } from "./card-actions.js";
// Layout operates only on the selected renderer table. Its links, dice and cells retain identity.
function h(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstElementChild;
}

const itemIcons = {
	sword: ['近战武器','<path d="M15 3h6v6L9 21l-6-6zM15 3l6 6M4 10l10 10M7 17l-4 4"/>'],
	bow: ['远程武器','<path d="M5 3c17 0 17 18 0 18L13 12zM3 12h18M18 9l3 3-3 3"/>'],
	arrow: ['弹药','<path d="M4 20L16 8M3 13l4 4 4 1M6 10l4 4 4 1"/><path d="M20 4l-2 7-5-5z" fill="currentColor"/>'],
	armor: ['护甲','<path d="M8 3c0 4 8 4 8 0l5 4-3 5v9H6v-9L3 7zM9 12h6M9 16h6"/>'],
	shield: ['盾牌','<path d="M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6zM12 7v10M8 11h8"/>'],
	potion: ['药水','<path d="M9 3h6M10 3v6l-5 8a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-8V3M8 14h8"/><circle cx="12" cy="17" r="1"/>'],
	ring: ['戒指','<circle cx="12" cy="14" r="7"/><path d="M8 5l2-3h4l2 3-4 4z"/>'],
	rod: ['权杖','<circle cx="12" cy="6" r="3.2"/><path d="M12 9.2v11M8.5 11h7M9.5 21h5"/>'],
	staff: ['法杖','<path d="M11.5 22V11M11.5 11C6 10 5 6 7 3M11.5 11C17 10 18 6 16 3M11.5 2L14 5l-2.5 3L9 5z"/>'],
	wand: ['魔杖','<path d="M4 21L16 9M12 13l3 3M18 2v4M20 7h3M12 4l2 2M19 11l2 2"/>'],
	scroll: ['卷轴','<path d="M6 4h12a3 3 0 0 1 0 6h-2M6 4a3 3 0 0 0 0 6h2V7M8 7v12a2 2 0 0 0 4 0V7h6M10 21h8a3 3 0 0 0 3-3H12M11 11h4M11 14h4"/>'],
	wondrous: ['奇物','<path d="M5 4h14l3 6-10 11L2 10zM2 10h20M8 4l-2 6 6 11 6-11-2-6M6 10h12"/>'],
	tool: ['工具','<path d="M4 5l5-3 6 6-4 4zM10 11L4 21h4l6-9M14 7l3-3 4 4-3 3"/>'],
	instrument: ['乐器','<path d="M5 3h14M7 3v12c0 5 12 7 12-12M10 5v12M13 5v13M16 5v11M5 21h14"/>'],
	gear: ['冒险装备','<rect x="5" y="6" width="14" height="16" rx="3"/><path d="M9 6V4a3 3 0 0 1 6 0v2M5 11h14M8 15h8v4H8zM3 9v8M21 9v8"/>'],
	coins: ['财宝 / 交易品','<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v8c0 4 12 4 12 0V6M3 10c0 4 12 4 12 0M15 11c8-2 9 4 3 5M21 14v5c0 3-9 4-12 1"/>'],
	vehicle: ['坐骑 / 载具','<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M6 6l5 5M13 13l5 5M6 18l5-5M13 11l5-5"/>'],
	generic: ['通用星芒','<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>']
};

const bookItemIcon = key => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+itemIcons[key][1]+'</svg>';
const BOOK_ITEM_RARITY = {common:'common',uncommon:'uncommon',rare:'rare','very rare':'very',legendary:'legendary',artifact:'artifact','普通':'common','非普通':'uncommon','珍稀':'rare','极珍稀':'very','传说':'legendary','神器':'artifact'};
const bookRarity = value => BOOK_ITEM_RARITY[value]||'none';
const bookItemMake = (tag,cls) => {const e=document.createElement(tag);if(cls)e.className=cls;return e;};
// Split text nodes only: links, dice, and native bound controls retain identity.
function bookItemBadge(root, pattern, cls) {
	const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
	while((n=walker.nextNode())){if(n.parentElement.closest('.bk-item-tag'))continue;const m=n.data.match(pattern);if(!m)continue;const token=n.splitText(m.index);token.splitText(m[0].length);const badge=bookItemMake('span','tag bk-item-tag '+cls);token.before(badge);badge.append(token);return badge;}
}

function bookItemProps(pc,ent,statsRow=null) {
	const typeRow = pc.querySelector(".ve-rd-item__type-rarity-attunement")?.closest("tr");
	statsRow ||= typeRow?.nextElementSibling;
	if (ent && statsRow?.tagName === "TR") {
		const cells = [...statsRow.children], right = cells[cells.length - 1];
		const blocks = [...right.querySelectorAll(":scope > .ve-text-wrap-balance")];
		const left = cells.length > 1 || !blocks.length ? cells[0] : null;
		const [damage, properties] = [ent.damage, ent.properties];
		const parts = [];
		if (left?.textContent.trim()) parts.push({label: "价值 / 重量", nodes: [left]});
		if (damage && blocks[0] && (ent.dmg1 || ent.hasAC)) {
			parts.push({label: ent.dmg1 ? (ent.hasAC ? "伤害 / 护甲等级" : "伤害") : "护甲等级", nodes: [blocks[0]]});
		}
		const propertyNodes = [properties ? blocks[damage ? 1 : 0] : null, ent.mastery ? blocks[(damage ? 1 : 0) + (properties ? 1 : 0)] : null].filter(Boolean);
		if (propertyNodes.length) parts.push({label: "物品属性", nodes: propertyNodes});
		if (parts.length) {
			const tr = h(`<tr class="l5-props-tr"><td colspan="6"><div class="l5-props"></div></td></tr>`), card = tr.querySelector(".l5-props");
			statsRow.before(tr);
			parts.forEach(part => {
				const prop = h(`<div class="l5-prop"><small>${part.label}</small><span></span></div>`), value = prop.lastElementChild;
				part.nodes.filter(Boolean).forEach((node, i) => {
					if (i) value.append(document.createElement("br"));
					value.append(...node.childNodes);
					if (!cells.includes(node)) node.remove();
				});
				card.append(prop);
			});
			if (!statsRow.textContent.trim() && !statsRow.querySelector("a, [onmouseover], .render-roller")) statsRow.remove();
		}
	}
}

function bookItemCard(table,{preview=false,entity}={}) {
	const title=table.querySelector('.ve-stats__th-name');if(!title)return false;
	if(table.querySelector('.bk-item-head'))return true;
	table.classList.remove('bk-item','bk-item-preview');delete table.dataset.bkRarity;
	const fallback=reason=>{table.dataset.bkFallback=reason;return false;};
	const name=title.querySelector('.ve-stats__h-name')?.parentElement,head=title.querySelector(':scope > .ve-split-v-end'),type=table.querySelector('.ve-rd-item__type-rarity-attunement');
	const nativeType=type?.firstElementChild,existing=table.querySelector('.l5-props'),statsRow=type?.closest('tr')?.nextElementSibling;
	if(!name||!head||!head.contains(name)||name===head||!nativeType||!statsRow||statsRow.tagName!=='TR'||!statsRow.children.length||[...statsRow.children].some(e=>e.tagName!=='TD'))return fallback('未识别名字、类别或信息行');
	const icon=entity.icon,symbol=bookItemMake('span','bk-item-art'),meta=bookItemMake('div','bk-item-type ve-rd-item__type-rarity-attunement');
	const rarity=bookRarity(entity.rarity),nativeRarity=entity.rarityLabel;
	const typeRow=type.closest('tr');
	head.classList.remove('ve-split-v-end');head.classList.add('bk-item-head');head.prepend(symbol);symbol.innerHTML=bookItemIcon(icon);symbol.dataset.icon=icon;symbol.dataset.kind='placeholder';symbol.setAttribute('aria-hidden','true');
	name.classList.add('bk-item-name');name.append(meta);meta.append(...type.childNodes);for(const e of meta.querySelectorAll('.ve-italic'))e.classList.remove('ve-italic');typeRow.remove();
	const rarityBadge=rarity!=='none'&&nativeRarity?bookItemBadge(meta,new RegExp(nativeRarity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'bk-item-rarity'):null;
	if(rarityBadge)rarityBadge.dataset.bkRarity=rarity;
	bookItemBadge(meta,/[（(](?:需[^)）]*同调[^)）]*|requires? attunement[^)）]*)[)）]/i,'bk-item-attune');
	table.dataset.bkRarity=rarity;
	if(!existing)bookItemProps(table,entity,statsRow);
	const cells=table.querySelector('.l5-props');
	if(cells){cells.classList.add('bk-item-cells');cells.style.setProperty('--bk-item-columns',cells.children.length);for(const field of cells.children){field.classList.add('bk-item-cell');}const info=bookItemMake('div','bk-item-info');cells.before(info);info.append(cells);}
	for(const b of table.querySelectorAll('td > b'))if(/^来源[:：]/.test(b.textContent))b.parentElement.classList.add('bk-item-foot');
	for(const en of table.querySelectorAll('.entry-title-inner'))for(const n of [...en.childNodes])if(n.nodeType===Node.TEXT_NODE){const m=n.data.match(/\s+[A-Za-z][\s\S]*$/);if(!m)continue;const i=bookItemMake('i','bk-item-en en');i.append(n.splitText(m.index));en.append(i);}
	table.classList.add('bk-item');table.classList.toggle('bk-item-preview',preview);delete table.dataset.bkFallback;
	return true;
}

function bookMonsterCard (table, {preview = false} = {}) {
	if (table.querySelector(":scope > tbody > .bk-mon-row, :scope > .bk-mon-row")) return true;
	const title = table.querySelector('.ve-stats__th-name');
	if (!title) return false;
	table.classList.remove("bk-mon", "bk-mon-preview");
	const fallback = reason => { table.dataset.bkFallback = reason; return false; };
	const rows = [...(table.tBodies[0] || table).children];
	const titleRow = title.closest("tr"), start = rows.indexOf(titleRow);
	const ability = table.querySelector(".stats-tbl-ability-scores__lbl-abv")?.closest("table");
	const classicNames = [...table.querySelectorAll("th")].filter(e => /^(力量|敏捷|体质|智力|感知|魅力|STR|DEX|CON|INT|WIS|CHA)$/i.test(e.textContent.trim()));
	const classic = !ability && classicNames.length === 6;
	const abilityRow = (ability || classicNames[0])?.closest("td")?.closest("tr") || (classic ? classicNames[0].closest("tr") : null);
	const abilityEnd = classic ? rows.indexOf(classicNames[0].closest("tr")) + 1 : rows.indexOf(abilityRow);
	const typeRow = rows.slice(start + 1, abilityEnd).find(r => r.querySelector("i") && !r.querySelector("strong,b,table"));
	const compact = rows.slice(start + 1, abilityEnd).map(r => r.querySelector("table.ve-summary-noback")).find(Boolean);
	const labels = [...table.querySelectorAll("strong")];
	const findLabel = re => labels.find(e => re.test(e.textContent.trim()));
	const ac = findLabel(/^(AC|护甲等级|护甲类型)$/), hp = findLabel(/^(HP|生命值)$/), speed = findLabel(/^(速度|移动速度|Speed)$/i);
	let fields;
	if (compact) {
		const heads = [...compact.rows[0].cells], values = [...compact.rows[1]?.cells || []];
		if (heads.length !== values.length) return fallback("预览关键值列数不一致");
		fields = heads.map((label, i) => ({label, value: values[i]}));
		if (!heads.some(e => /^(AC|护甲等级|护甲类型)$/.test(e.textContent.trim())) || !heads.some(e => /^(HP|生命值)$/.test(e.textContent.trim()))) return fallback("预览缺少AC或HP");
	} else if (!ac || !hp || !speed) return fallback("未识别关键值");
	if (!typeRow || abilityEnd < 0 || (!ability && !classic)) return fallback("未识别类型或六项属性");
	let abilities;
	if (ability) {
		const names = [...ability.querySelectorAll(".stats__disp-as-score--label")];
		if (names.length !== 6 || names.some(e => !e.nextElementSibling?.nextElementSibling?.nextElementSibling)) return fallback("非标准六项属性");
		abilities = names.map(e => [e, e.nextElementSibling, e.nextElementSibling.nextElementSibling, e.nextElementSibling.nextElementSibling.nextElementSibling]);
	} else {
		const vals = [...rows[abilityEnd]?.cells || []];
		if (vals.length !== 6) return fallback("2014属性列数不一致");
		abilities = classicNames.map((e, i) => [e, vals[i]]);
	}
	// Only known header rows belong here. Section text and the footer never move.
	let end = abilityEnd + 1;
	while (end < rows.length) {
		const r = rows[end];
		if (r.querySelector(".ve-stats__sect-header-inner,.ve-rd__b,.ve-rd__b-special,.ve-stats__sect-row-inner")) break;
		if (r.textContent.trim() && !r.querySelector("strong,.ve-rd__compact-stat") && !r.querySelector("select")) break;
		end++;
	}
	const make = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
	const move = (from, to) => { while (from.firstChild) to.append(from.firstChild); };
	const row = make("tr", "bk-mon-row"), head = make("div", "bk-mon-head mon"), main = make("div", "bk-mon-main");
	head.append(main);
	const meta = make("div", "bk-mon-meta"), name = make("div", "bk-mon-name"), type = make("div", "bk-mon-type"), vitals = make("div", "bk-mon-vitals vitals"), abil = make("div", "bk-mon-abil abil"), kv = make("div", "bk-mon-kv kv");
	head.prepend(meta); main.append(name, type, vitals, abil, kv);
	const source = title.querySelector(".stats__wrp-h-source,.ve-stats__wrp-h-source");
	if (source) { source.className = "bk-mon-source"; meta.append(source); }
	move(title, name); move(typeRow.cells[0], type);
	row.append(title); title.append(head);
	const firstNumber = (e, allowDice = false) => {
		const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
		while ((n = walker.nextNode())) {
			if (n.parentElement.closest("strong") || (!allowDice && n.parentElement.closest("[data-roll-entry]"))) continue;
			const match = n.data.match(/\d+/); if (!match) continue;
			const rest = n.splitText(match.index), tail = rest.splitText(match[0].length), big = make("b", "bk-mon-number");
			tail.before(big); big.append(rest); return;
		}
	};
	const vital = (label, value) => {
		const box = make("div", "bk-mon-vital"), caption = make("small"), val = make("div", "bk-mon-value");
		const text = label.textContent.trim(), isSpeed = /^(速度|移动速度|Speed)$/i.test(text);
		// Keep native caption nodes/text for lossless auditing;
		// only their visible UI aliases are normalized across the two renderers.
		if (/^(护甲等级|护甲类型|生命值|移动速度|Speed)$/i.test(text)) {
			label.classList.add("ve-hidden"); caption.append(isSpeed ? "速度" : text === "生命值" ? "生命值 HP" : "护甲等级 AC");
		} else if (text === "AC" || text === "HP") caption.append(text === "AC" ? "护甲等级 " : "生命值 ");
		caption.append(label); move(value, val); box.append(caption, val); vitals.append(box); firstNumber(val);
		if (isSpeed) {
			box.classList.add("bk-mon-speed");
			// Split text at separators, never inside a movement mode, moving all
			// existing links/rollers along with the surrounding text nodes.
			const nodes = [...val.childNodes]; let part = make("span", "bk-mon-speed-part"); val.append(part);
			for (let node of nodes) {
				if (node.nodeType === Node.TEXT_NODE) {
					let match;
					while ((match = node.data.match(/[,，;；]/))) {
						const rest = node.splitText(match.index + 1); part.append(node);
						part = make("span", "bk-mon-speed-part"); val.append(part); node = rest;
					}
				}
				part.append(node);
			}
		}
		return box;
	};
	const summaryFields = [];
	if (compact) {
		let acBox;
		for (const f of fields) {
			const text = f.label.textContent.trim();
			if (/^(先攻|Initiative)/i.test(text)) {
				const extra = make("span", "bk-mon-extra"); move(f.label, extra); extra.append(" "); move(f.value, extra); acBox?.append(extra);
			} else if (/^(AC|HP|护甲等级|护甲类型|生命值|移动速度|速度|Speed)$/i.test(text)) {
				const label = make("span"); move(f.label, label); const box = vital(label, f.value); if (text === "AC") acBox = box;
			} else { const extra = make("div"), label = make("strong"); move(f.label, label); extra.append(label, " "); move(f.value, extra); summaryFields.push(extra); }
		}
	} else {
		const init = ac.parentElement.nextElementSibling;
		const acBox = vital(ac, ac.parentElement);
		if (init?.querySelector('[data-roll-name="Initiative"]')) { init.classList.add("bk-mon-extra"); acBox.append(init); }
		vital(hp, hp.parentElement); vital(speed, speed.parentElement);
	}
	const abilityLabels = ability ? [...ability.rows[0].cells].filter(e => e.textContent.trim()) : [];
	abilities.forEach((cells, i) => {
		const box = make("table", "bk-mon-ability"), body = make("tbody"), label = make("tr", "bk-mon-ability-label"), score = make("tr", "bk-mon-score"), rolls = make("tr", "bk-mon-rolls");
		cells[0].colSpan = cells[1].colSpan = 2;
		label.append(cells[0]); score.append(cells[1]); firstNumber(cells[1], classic); body.append(label, score); box.append(body);
		if (cells.length === 4) {
			const mod = make("span"), save = make("span");
			if (abilityLabels[i * 2]) move(abilityLabels[i * 2], mod); else mod.append("调整");
			mod.append(" "); cells[2].prepend(mod);
			if (abilityLabels[i * 2 + 1]) move(abilityLabels[i * 2 + 1], save); else save.append("豁免");
			save.append(" "); cells[3].prepend(save); rolls.append(cells[2], cells[3]); body.append(rolls);
		}
		abil.append(box);
	});
	// Preserve any unexpected ancillary header content too, including controls.
	for (const r of rows.slice(start + 1, end)) {
		if (r === typeRow || r === abilityRow || (classic && (r === classicNames[0].closest("tr") || r === rows[abilityEnd]))) continue;
		if (compact && r.contains(compact)) continue;
		for (const c of [...r.cells]) { const div = make("div"); move(c, div); if (div.textContent.trim() || div.querySelector("button,select,a")) kv.append(div); }
	}
	// Compact native cards put CR/PB in their summary table. Put those live
	// fields after languages, matching the main card's native key/value order.
	kv.append(...summaryFields);
	const cr = [...kv.querySelectorAll("strong,b")].find(e => /^(CR|挑战|挑战等级)$/.test(e.textContent.trim()));
	const crValue = (cr?.nextElementSibling?.textContent || cr?.parentElement.textContent.replace(cr.textContent, ""))?.match(/^\s*[\d/]+/);
	if (crValue) { const badge = make("span", "bk-mon-badge"); badge.textContent = `CR ${crValue[0].trim()}`; meta.append(badge); }
	if ([...table.querySelectorAll(".ve-stats__sect-header-inner")].some(e => /传奇动作|Legendary Actions/.test(e.textContent))) {
		const badge = make("span", "bk-mon-badge"); badge.textContent = "传奇"; meta.append(badge);
	}
	titleRow.before(row);
	for (const r of rows.slice(start, end)) r.remove();
	table.classList.add("bk-mon"); table.classList.toggle("bk-mon-preview", preview); delete table.dataset.bkFallback;
	table.querySelectorAll(".ve-stats__wrp-avoid-token").forEach(e => e.classList.remove("ve-stats__wrp-avoid-token"));
	table.querySelectorAll(".ve-stats__sect-header-inner").forEach(e => e.classList.add("sect"));
	table.querySelectorAll(".entry-title-inner,.ve-rd__list-item-name").forEach(e => {
		e.classList.add("bk-mon-action");
		// Split only native text nodes; links/rollers inside names remain live.
		for (const n of [...e.childNodes]) if (n.nodeType === Node.TEXT_NODE) {
			const m = n.data.match(/\s+[A-Za-z][\s\S]*$/); if (!m) continue;
			const en = make("i", "en"); en.append(n.splitText(m.index)); e.append(en);
		}
	});
	return true;
}

function artPresentation(img) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext("2d", {willReadFrequently:true});
    try {
        for (const x of [0,1]) for (const y of [0,1])
            ctx.drawImage(img, x*(img.naturalWidth-1), y*(img.naturalHeight-1), 1,1, x,y,1,1);
        const rgba = ctx.getImageData(0,0,2,2).data;
        return [3,7,11,15].every(i => rgba[i] < 10) ? "cutout" : "photo";
    } catch { return "photo"; } // External book illustrations can disallow canvas reads.
}

function addPronunciation(table, clip) {
    const name = table.querySelector(".bk-mon-name");
    if (!name || !clip || name.querySelector(".card-pronounce")) return;
    const path = clip.type === "internal" ? "../audio/" + clip.path : clip.url;
    const url = mediaUrl(path);
    if (!url) return;
    const button = bookItemMake("button","card-pronounce");
    button.type = "button"; button.title = "播放读音";
    button.setAttribute("aria-label",button.title);
    button.textContent = "\ue038";
    let audio;
    button.onclick = async () => {
        try {
            audio ||= new Audio(url);
            audio.currentTime = 0;
            await audio.play();
        } catch {
            button.title = "暂时无法播放读音，点击重试";
        }
    };
    const english = name.querySelector(".ve-stats__eh-name,.ve-stats__h-name:last-child");
    (english || name).after(button);
}

function mountArt(slot, path, kind, name, activate, img = new Image()) {
    const url = mediaUrl(typeof path === "string" ? path : path.url);
    if (!url) return;
    if (!img.alt) img.alt = name + " 插图";
    img.loading = "lazy";
    img.decoding = "async";
    const status = bookItemMake("span", "bk-img-status");
    const spinner = bookItemMake("span", "bk-img-indicator");
    const message = bookItemMake("span", "bk-img-message");
    status.append(spinner,message);
    slot.append(img,status);
    function load() {
        slot.dataset.bkImg = "loading";
        slot.dataset.bkImgVisible = "";
        message.textContent = "图片加载中";
        img.hidden = false;
        img.src = url;
    }
    img.onload = () => {
        status.remove();
        delete slot.dataset.bkImg;
        slot.dataset.kind = kind;
        if (kind === "fluff" || kind === "token") slot.dataset.presentation = artPresentation(img);
        if (!activate) return;
        slot.removeAttribute("aria-hidden");
        slot.tabIndex = 0;
        slot.title = "查看大图";
        slot.setAttribute("role","button");
        slot.setAttribute("aria-label", name + "：查看大图");
        slot.onclick = activate;
        slot.onkeydown = e => {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); activate(); }
        };
    };
    img.onerror = () => {
        if (tryImageMirror(img)) return;
        slot.dataset.bkImg = "failed";
        img.hidden = true;
        if (["fluff","token"].includes(kind) && !slot.querySelector(".bk-mon-flower"))
            slot.prepend(bookItemMake("span","bk-mon-flower"));
        message.textContent = "图片暂时无法加载";
        const retry = bookItemMake("button","bk-img-retry");
        retry.type = "button"; retry.textContent = "重试";
        retry.onclick = event => { event.stopPropagation(); retry.remove(); load(); };
        status.append(retry);
    };
    load();
}

export function renderSupplement(container, card, kind, tab) {
    const native = document.createElement("template");
    native.innerHTML = card.html;
    const title = native.content.querySelector(".ve-stats__th-name")?.closest("tr");
    const table = document.createElement("table");
    table.className = "card-supplement";
    const body = table.createTBody();
    if (title) body.append(title);
    const cell = body.insertRow().insertCell();
    cell.colSpan = 6;
    cell.innerHTML = tab === "images" ? card.gallery || "" : card.info || "";
    const images = [...cell.querySelectorAll("img")];
    const paths = card.images?.length ? card.images : [card.token].filter(Boolean);
    if (tab === "images" && !images.length) {
        for (const path of paths) {const img = new Image(); cell.append(img); images.push(img);}
    }
    const name = title?.querySelector(".ve-stats__h-name")?.textContent || "";
    images.forEach((img,i) => {
        const anchor = img.closest("a");
        const path = tab === "images" ? paths[i] || anchor?.getAttribute("href") : img.getAttribute("src");
        if (!path) return;
        const slot = bookItemMake("span","gallery-plate");
        (anchor || img).before(slot);
        anchor?.remove();
        const zoom = () => {
            const dlg = document.getElementById("image-view"), large = dlg.querySelector("img");
            large.src = img.currentSrc || img.src; large.alt = img.alt; dlg.showModal();
        };
        mountArt(slot,path,"gallery",name,zoom,img);
    });
    container.replaceChildren(table);
    bindCardActions(container,table,card,kind);
}

export function decorateCard(container, card, kind, {openImages, preview=false}={}) {
    const table = container.matches("table") ? container : container.querySelector("table");
    if (!table) return;
    if (!preview && container.id === "detail") bindCardActions(container,table,card,kind);
    for (const image of table.querySelectorAll("img[src]")) {
        const resolved = mediaUrl(image.getAttribute("src"));
        if (resolved && image.src !== resolved) image.src = resolved;
        const slot=image.closest(".bk-img-native-body");
        const link=image.closest("a[href]");
        if(link && resolved && link.getAttribute("href")===image.getAttribute("src"))link.href=resolved;
        if(!slot || !document.body.classList.contains("reference-page")){
            image.addEventListener("error",()=>tryImageMirror(image),{once:true});continue;
        }
        const failed=()=>{
            if(tryImageMirror(image) || slot.querySelector("button"))return;
            slot.classList.add("reference-image-failed");
            const retry=document.createElement("button");retry.textContent="图片未能加载 · 重试";
            retry.onclick=()=>{retry.remove();slot.classList.remove("reference-image-failed");image.src=resolved;};
            slot.append(retry);
        };
        image.addEventListener("error",failed);
        if(image.complete && !image.naturalWidth)failed();
    }
    const name = table.querySelector(".ve-stats__h-name")?.textContent || "";
    if(!["items","bestiary"].includes(kind)){
        table.classList.add("option-card");
        if(kind==="spells")for(const title of table.querySelectorAll(".ve-rd__h,.ve-rd__h-inner,b,strong")){
            if(/^(?:升环施法(?:\s+(?:At Higher Levels|Using a Higher-Level Spell Slot))?|At Higher Levels|Using a Higher-Level Spell Slot)[.。:：\s]*$/i.test(title.textContent.trim()))
                title.closest(".ve-rd__b")?.classList.add("l5-upcast");
        }
        if(!preview)for(const toggle of table.querySelectorAll(".ve-rd__h-toggle")){
            const fold=(button,closed)=>{
                const block=button.closest(".ve-rd__b,.ve-rd__b-special");if(!block)return;
                for(const child of block.children)if(!child.contains(button))child.hidden=closed;
                button.textContent=closed?"[+]":"[−]";button.setAttribute("aria-expanded",String(!closed));
            };
            toggle.tabIndex=0;toggle.setAttribute("role","button");toggle.setAttribute("aria-expanded","true");
            toggle.onclick=event=>{
                const closed=toggle.getAttribute("aria-expanded")==="true";
                for(const btn of event.shiftKey?table.querySelectorAll(".ve-rd__h-toggle"):[toggle])fold(btn,closed);
            };
            toggle.onkeydown=e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();toggle.click();}};
        }
        if(card.pronunciation && !preview){
            const title=table.querySelector(".ve-stats__h-name");
            if(title){
                const play=document.createElement("button");play.type="button";play.className="pronunciation";
                play.setAttribute("aria-label","播放名称发音");play.title="播放名称发音";play.textContent="\ue038";
                const sound=new Audio();sound.preload="none";
                play.onclick=()=>{sound.src=card.pronunciation;sound.play().catch(()=>{play.title="当前无法读取这段发音";});};
                (title.closest(".ve-flex-col") || title).after(play);
            }
        }
        const slot=table.querySelector(".bk-opt-portrait");
        if(slot && card.images?.length && !preview){
            slot.disabled=false;
            const picture=new Image();
            picture.addEventListener("load",()=>picture.classList.toggle("bk-opt-landscape",picture.naturalWidth>1.15*picture.naturalHeight));
            mountArt(slot,card.images[0],"image",name,()=>{
                const dlg=document.getElementById("image-view"),img=dlg.querySelector("img");
                img.src=picture.currentSrc || picture.src;img.alt=name;dlg.showModal();
            },picture);
        }
    } else if (kind === "items") {
        if (!card.display || !bookItemCard(table,{entity:card.display,preview})) return;
        const slot = table.querySelector(".bk-item-art");
        const art = card.images?.[0];
        if (art && !preview && slot.isConnected && !slot.querySelector("img")) {
            const zoom = () => {
                const dialog = document.getElementById("image-view");
                if (!dialog) return openImages?.();
                const image = dialog.querySelector("img");
                image.src = slot.querySelector("img").src; image.alt = name;
                dialog.showModal();
            };
            mountArt(slot,art,"image",name,zoom);
        }
    } else if (kind === "bestiary" && bookMonsterCard(table,{preview}) && !preview) {
        addPronunciation(table,card.model?.soundClip);
        const path = card.images?.[0] || card.token;
        const head = table.querySelector(".bk-mon-head");
        if (!path || !head.isConnected || head.querySelector(".bk-mon-portrait")) return;
        const slot = bookItemMake("figure","bk-mon-portrait");
        head.append(slot);
        mountArt(slot,path,card.images?.length ? "fluff" : "token",name,card.images?.length ? openImages : null);
    }
}
