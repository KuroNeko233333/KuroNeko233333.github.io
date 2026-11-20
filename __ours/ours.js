/* 我们的 5etools —— 本地版增强：来源总开关、强度榜与评分、我们的评语与配图、首页大厅。
 * 只在本地版注入；网站本体（site.zip）不做任何改动，更新不会覆盖这里。 */
(() => {
	"use strict";

	// Image state belongs to a particular element and request. Only pending, visible
	// slots get an animation. Native lazy placeholders keep their original observer.
	const imageJobs = new WeakMap(), imageOwners = new WeakMap(), imagePending = new Map();
	const imageLoadingText = "图片加载中", imageErrorText = "图片暂时无法加载";
	const imagePrimary = "https://5e.kiwee.top/img/", imageBackup = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/";
	let imageVisibility, imageFrameObserver;
	const imagePageVisible = () => !document.hidden && (!IN_SHELL || window.frameElement?.classList.contains("on"));
	const imagePlaceholder = src => /^data:image\/svg\+xml,/.test(src || "");
	function imageWatch (job) {
		if (!imageVisibility) imageVisibility = new IntersectionObserver(entries => {
			for (const entry of entries) {
				const pending = imagePending.get(entry.target);
				if (!pending) continue;
				if (!pending.valid()) { pending.cancel(); continue; }
				pending.intersects = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
				pending.updateVisibility();
			}
		}, {threshold: [0, 0.001]});
		if (!imageFrameObserver && IN_SHELL) imageFrameObserver = new MutationObserver(imageSyncVisibility);
		if (!imagePending.size && imageFrameObserver) imageFrameObserver.observe(window.frameElement, {attributes: true, attributeFilter: ["class"]});
		imagePending.set(job.view, job);
		imageVisibility.observe(job.view);
	}
	function imageSyncVisibility () {
		for (const job of imagePending.values()) job.updateVisibility();
	}
	function imageSlot (img, host, {src, valid = () => host.isConnected, attach, onReady, onError, compact, size, view = host, native = false} = {}) {
		const existing = imageJobs.get(img);
		if (existing) return existing;
		imageOwners.get(host)?.cancel();
		let initial = src, request, state, started, delay, error, overlay;
		let visible = false, stopped = false;
		const source = () => img.getAttribute("src");
		const deferred = () => native && ((!source() || imagePlaceholder(source())) && img.dataset.src ||
			(imagePlaceholder(source()) && img.matches(".ve-stats__token") && source().includes("%23ccc3")));
		const stopWatching = () => {
			clearTimeout(delay);
			delay = undefined;
			delete host.dataset.bkImgVisible;
			if (imagePending.get(view) !== job) return;
			imagePending.delete(view);
			imageVisibility.unobserve(view);
			if (!imagePending.size) imageFrameObserver?.disconnect();
		};
		const clearOverlay = () => { overlay?.remove(); overlay = null; };
		const mark = value => { state = host.dataset.bkImg = value; };
		const retry = event => {
			if (state !== "failed" || !valid() || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
			event.preventDefault();
			event.stopPropagation();
			if (!native && img.parentElement !== host) (attach || (node => host.append(node)))(img);
			const url = new URL(initial, document.baseURI);
			// Bypass cached HTTP errors on our image endpoint and the static mirrors.
			if ((url.origin === location.origin && url.pathname.startsWith("/img/")) || url.href.startsWith(imagePrimary) || url.href.startsWith(imageBackup)) {
				url.searchParams.set("bk-retry", String(++imageRetry));
			}
			img.removeAttribute("src");
			img.src = url.href;
			start();
		};
		const show = failed => {
			if (!overlay) {
				overlay = document.createElement("span");
				overlay.className = "bk-img-status";
				if (compact) overlay.classList.add("bk-img-status--small");
			overlay.innerHTML = `<span class="bk-img-indicator" aria-hidden="true"></span><span class="bk-img-message" role="status"></span>`;
				host.append(overlay);
			}
			overlay.querySelector(".bk-img-message").textContent = failed ? imageErrorText : imageLoadingText;
			if (!failed) return;
			const retryControl = document.createElement(host.closest("button,a") ? "span" : "button");
			retryControl.className = "bk-img-retry";
			if (retryControl.tagName === "BUTTON") retryControl.type = "button";
			else { retryControl.tabIndex = 0; retryControl.setAttribute("role", "button"); retryControl.addEventListener("keydown", retry); }
			retryControl.title = `${imageErrorText}，重试`;
			retryControl.setAttribute("aria-label", retryControl.title);
			retryControl.textContent = "重试";
			retryControl.addEventListener("click", retry);
			overlay.append(retryControl);
		};
		const finish = ok => {
			if (!valid() || stopped) return job.cancel();
			const fade = state === "loading" && visible;
			stopWatching();
			if (ok) { clearOverlay(); mark(fade ? "fade" : "ready"); onReady?.(); }
			else { mark("failed"); if (!native) img.remove(); onError?.(); show(true); }
		};
		const settled = () => {
			if (!request || deferred() || !img.complete || (img.currentSrc && img.currentSrc !== img.src && !img.srcset)) return;
			if (img.naturalWidth && !imageBrokenToken()) finish(true);
			else if (state !== "failed") finish(false);
		};
		const start = () => {
			if (!valid() || stopped) return;
			request = source();
			initial ||= img.dataset.src || (deferred() ? img.closest("a")?.getAttribute("href") : request);
			if (!initial) return;
			clearTimeout(error);
			clearOverlay();
			mark("pending");
			if (!deferred() && img.complete && img.naturalWidth && !imageBrokenToken() && (img.currentSrc === img.src || img.srcset)) { finish(true); return; }
			started = performance.now();
			visible = job.intersects = false;
			if (imagePending.get(view) === job) stopWatching();
			imageWatch(job);
		};
		const change = () => {
			const next = source();
			if (stopped || !valid() || next === request) return;
			// A lazy placeholder or a mirror may change addresses within the same attempt.
			const mirror = request?.startsWith(imagePrimary) && next === imageBackup + request.slice(imagePrimary.length);
			if ((state === "pending" || state === "loading") && (!request || imagePlaceholder(request) || mirror || imageBrokenToken())) {
				request = next;
				settled();
				return;
			}
			initial = img.dataset.src || next;
			start();
		};
		const imageBrokenToken = () => native && img.matches(".ve-stats__token") && imagePlaceholder(source()) && !deferred();
		const load = () => { change(); if (state === "pending" || state === "loading") settled(); };
		const fail = () => {
			const atError = source();
			clearTimeout(error);
			// Let the static runtime's error handler select a mirror first.
			error = setTimeout(() => {
				if (state !== "pending" && state !== "loading") return;
				if (atError !== source()) { change(); return; }
				settled();
			}, 0);
		};
		const job = {
			view, valid, change, intersects: false,
			updateVisibility () {
				if (!valid()) { job.cancel(); return; }
				const next = job.intersects && imagePageVisible() && (host.checkVisibility?.({visibilityProperty: true}) ?? getComputedStyle(host).visibility === "visible");
				if (next === visible) return;
				visible = next;
				clearTimeout(delay);
				if (!visible) { delete host.dataset.bkImgVisible; return; }
				host.dataset.bkImgVisible = "";
				if (state !== "pending") return;
				delay = setTimeout(() => {
					if (!valid()) { job.cancel(); return; }
					if (!visible || state !== "pending") return;
					settled();
					if (state === "pending") { mark("loading"); show(false); }
				}, Math.max(0, 120 - (performance.now() - started)));
			},
			cancel () {
				if (stopped) return;
				stopped = true;
				stopWatching();
				clearTimeout(error);
				clearOverlay();
				img.removeEventListener("load", load);
				img.removeEventListener("error", fail);
				if (!native) { img.removeAttribute("src"); img.remove(); }
				delete host.dataset.bkImg;
				imageJobs.delete(img);
				imageOwners.delete(host);
			},
		};
		imageJobs.set(img, job);
		imageOwners.set(host, job);
		img.classList.add("bk-img-media");
		if (native || size) {
			const dimensions = size || source()?.match(/%20width%3D%22([\d.]+)%22%20height%3D%22([\d.]+)%22/)?.slice(1) || [Number(img.getAttribute("width")) || 480, Number(img.getAttribute("height")) || 320];
			host.style.setProperty("--bk-img-width", `${dimensions[0]}px`);
			host.style.setProperty("--bk-img-ratio", `${dimensions[0]} / ${dimensions[1]}`);
		}
		img.addEventListener("load", load);
		img.addEventListener("error", fail);
		if (src) {
			if (img.parentElement !== host) (attach || (node => host.append(node)))(img);
			img.src = src;
		}
		start();
		return job;
	}
	let imageRetry = 0;
	function imagePreview (img, opener, title, className = "bk-item-image") {
		const modal = document.createElement("dialog"), stage = document.createElement("div");
		const full = document.createElement("img"), close = document.createElement("button");
		modal.className = className;
		modal.setAttribute("aria-label", `${title} 原图`);
		stage.className = "bk-img-preview";
		full.alt = img.alt || title;
		close.type = "button";
		close.textContent = "关闭";
		modal.append(stage, close);
		document.body.append(modal);
		modal.showModal();
		const job = imageSlot(full, stage, {src: img.dataset.src || img.currentSrc || img.src, size: [img.naturalWidth || 480, img.naturalHeight || 320]});
		close.addEventListener("click", () => modal.close());
		modal.addEventListener("click", event => { if (event.target === modal) modal.close(); });
		modal.addEventListener("close", () => { job.cancel(); modal.remove(); if (opener.isConnected) opener.focus({preventScroll: true}); }, {once: true});
		return modal;
	}
	const imageNativeSelector = "img:not(.bk-img-media)";
	const imageNativePopups = ".ve-hwin, .ve-ui-modal__overlay";
	const imageCanvases = new WeakMap();
	function imageMapCanvas (canvas) {
		if (imageCanvases.has(canvas)) return imageCanvases.get(canvas);
		const img = new Image();
		img.dataset.src = canvas.dataset.src;
		const host = canvas.parentElement.closest("a")?.parentElement || canvas.parentElement;
		host.classList.add("bk-img-native", "bk-img-native-body");
		canvas.classList.add("bk-img-media");
		const job = imageSlot(img, host, {native: true, size: [canvas.width, canvas.height],
			onReady: () => canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)});
		const finalize = () => {
			if (!img.dataset.src) return;
			img.src = img.dataset.src;
			delete img.dataset.src;
			job.change();
		};
		imageCanvases.set(canvas, finalize);
		return finalize;
	}
	function imageNativeScan (root) {
		const watch = img => {
			if (!img.isConnected || img.closest(".stats__wrp-h-source, .ve-stats__wrp-h-source, .ve-lst__row") || (!img.getAttribute("src") && !img.dataset.src)) return;
			const token = img.classList.contains("ve-stats__token");
			if (imagePlaceholder(img.getAttribute("src")) && !img.dataset.src && !token) return;
			const anchor = img.parentElement.closest("a");
			const host = img.closest(".bk5-jacket, .bk5-tochead__media") ||
				(anchor === img.parentElement && !token ? anchor.parentElement : img.parentElement);
			if (!host || host.matches("td,tr,table")) return;
			host.classList.add("bk-img-native");
			if (img.matches(".ve-rd__image, .bks__bookshelf-image")) host.classList.add("bk-img-native-body");
			if (token) host.classList.add("bk-img-native-token");
			imageSlot(img, host, {native: true, valid: () => img.isConnected && host.contains(img), compact: token || host.matches(".bk5-tochead__media")});
		};
		if (root.matches(imageNativeSelector)) watch(root);
		else for (const img of root.querySelectorAll(imageNativeSelector)) watch(img);
		if (PAGE_ID === "maps") {
			const canvas = "canvas.ve-rd__cvs-image[data-src]";
			if (root.matches(canvas)) imageMapCanvas(root);
			else for (const node of root.querySelectorAll(canvas)) imageMapCanvas(node);
		}
	}
	function imageNativeInit () {
		const options = {childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "data-src"]};
		const add = node => {
			if (node.nodeType !== Node.ELEMENT_NODE || !node.isConnected || node.matches(".bk-img-status, .bk-img-status *, .bk-img-media")) return;
			imageNativeScan(node);
		};
		const observer = new MutationObserver(records => {
			for (const record of records) {
				if (record.type === "attributes") {
					if (record.target.tagName === "IMG") {
						const job = imageJobs.get(record.target);
						if (job) job.change(); else add(record.target);
					}
					continue;
				}
				if (record.target === document.body) {
					for (const node of record.addedNodes) if (node.matches?.(imageNativePopups)) {
						add(node); observer.observe(node, options);
					}
				} else if (!record.target.closest?.(".bk-img-status")) for (const node of record.addedNodes) add(node);
			}
		});
		const roots = "#pagecontent, #float-token, #lst-contents, #main_content, .bks__wrp-bookshelf, " + imageNativePopups;
		for (const root of document.querySelectorAll(roots + (PAGE_ID === "maps" ? ", #content" : PAGE_ID === "index" ? ", main.container" : ""))) {
			add(root); observer.observe(root, options);
		}
		if (PAGE_ID === "maps" && globalThis.Renderer?.utils.lazy) {
			const lazy = Renderer.utils.lazy, finalize = lazy.mutFinalizeEle;
			lazy.mutFinalizeEle = function (node) {
				if (node.matches("canvas.ve-rd__cvs-image[data-src]") && node.isConnected) return imageMapCanvas(node)();
				return finalize.call(this, node);
			};
		}
		if (globalThis.RenderMap) {
			RenderMap._pLoadImage = data => new Promise(resolve => {
				const host = document.createElement("div"), img = new Image(), close = document.createElement("button");
				host.className = "bk-img-map-fetch";
				close.type = "button"; close.textContent = "关闭";
				host.append(close);
				document.body.append(host);
				const done = result => { window.removeEventListener("hashchange", cancel); host.remove(); resolve(result); };
				const cancel = () => { job.cancel(); done(null); };
				const job = imageSlot(img, host, {src: data.href, onReady: () => done(img)});
				if (!host.isConnected) return;
				close.addEventListener("click", cancel);
				window.addEventListener("hashchange", cancel, {once: true});
			});
		}
		observer.observe(document.body, {childList: true});
		document.addEventListener("visibilitychange", imageSyncVisibility);
	}

	// Runs synchronously when the injected script is parsed, before DOMContentLoaded.
	// Use the native StyleSwitcher classes (and API once available), not page inversion.
	const themeGet = () => {
		try { return localStorage.getItem("ours.theme") === "night" ? "night" : "day"; }
		catch (e) { return "day"; }
	};
	window.__oursApplyTheme = (theme = themeGet()) => {
		const root = document.documentElement, night = theme === "night";
		root.dataset.oursTheme = night ? "night" : "day";
		const native = globalThis.styleSwitcher;
		if (native && native._styleTheme !== theme) native._setActiveStyleTheme(theme);
		root.classList.toggle("ve-night-mode", night);
		root.classList.toggle("ve-night-mode--standard", night);
		root.classList.remove("ve-night-mode--classic", "ve-night-mode--clean");
	};
	try { localStorage.setItem("StyleSwitcher_style", themeGet()); } catch (e) { /* no storage */ }
	window.__oursApplyTheme();
	window.addEventListener("DOMContentLoaded", () => window.__oursApplyTheme());
	window.addEventListener("storage", e => { if (e.key === "ours.theme") window.__oursApplyTheme(); });
	window.addEventListener("message", e => {
		if (e.origin === location.origin && e.source === window.top && e.data?.type === "ours-theme") window.__oursApplyTheme(e.data.theme);
	});

	// Reflow the native, already-bound statblock. No rule data is rendered here.
	// Validate the entire header before moving anything, so unfamiliar cards stay intact.

	// One inline registry shared by detail, list, and filter school icons.
	const BOOK_ICONS = {schools: {"A": ["防护", "<path d=\"M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z\"/><path d=\"M12 7.5v9M8.5 11h7\"/>"], "C": ["咒法", "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 6.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z\"/>"], "D": ["预言", "<path d=\"M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"12\" cy=\"12\" r=\".6\" fill=\"currentColor\"/>"], "E": ["惑控", "<path d=\"M12 19.5s-6.8-4.2-6.8-9.2A3.7 3.7 0 0 1 12 8.2a3.7 3.7 0 0 1 6.8 2.1c0 5-6.8 9.2-6.8 9.2z\"/><path d=\"M19.5 3.5v3M18 5h3\"/>"], "V": ["塑能", "<path d=\"M13.5 2.5L5.5 13.5h6l-1 8 8-11h-6z\"/>"], "I": ["幻术", "<path d=\"M15 3.8a8.3 8.3 0 1 0 5.2 13A6.8 6.8 0 0 1 15 3.8z\"/><path d=\"M18.5 5.5l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z\"/>"], "N": ["死灵", "<path d=\"M12 3.2c-4.3 0-7.4 3-7.4 6.9 0 2.3 1.1 4.1 2.8 5.1v2.7c0 .6.4 1 1 1h7.2c.6 0 1-.4 1-1v-2.7c1.7-1 2.8-2.8 2.8-5.1 0-3.9-3.1-6.9-7.4-6.9z\"/><circle cx=\"9.3\" cy=\"10.6\" r=\"1.7\"/><circle cx=\"14.7\" cy=\"10.6\" r=\"1.7\"/><path d=\"M10.6 19v-2.2M13.4 19v-2.2M11.4 14.2l.6-1.2.6 1.2\"/>"], "T": ["变化", "<path d=\"M12 3.5l8.5 15h-17z\"/><circle cx=\"12\" cy=\"13.2\" r=\"2.8\"/><path d=\"M3 21h18\"/>"]}};
	const bookSchoolIcon = code => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (BOOK_ICONS.schools[code]?.[1] || '<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>') + '</svg>';
	const bookSchoolNodes = new Map();
	const bookSchoolIconNode = code => {
		if (!bookSchoolNodes.has(code)) { const t=document.createElement('template');t.innerHTML=bookSchoolIcon(code);bookSchoolNodes.set(code,t.content.firstElementChild); }
		return bookSchoolNodes.get(code).cloneNode(true);
	};
	const bookSchoolPending = new WeakMap();
	let bookSchoolObserver;
	function bookSchoolListIconNode (code) {
		if (!globalThis.IntersectionObserver) return bookSchoolIconNode(code);
		if (!bookSchoolNodes.has(code)) bookSchoolIconNode(code);
		const template=bookSchoolNodes.get(code), svg=template.cloneNode(false);
		// Reserve the full 16px slot on every row; populate the actual SVG paths
		// near the viewport instead of adding thousands of offscreen path nodes.
		bookSchoolObserver ||= new IntersectionObserver(entries => {
			for (const entry of entries) if (entry.isIntersecting) {
				const icon=entry.target, template=bookSchoolPending.get(icon);if(!template)continue;
				const copy=template.cloneNode(true);
				icon.append(...copy.childNodes);icon.dataset.bkSchoolReady='1';
				bookSchoolPending.delete(icon);bookSchoolObserver.unobserve(icon);
			}
		}, {rootMargin:'160px 0px'});
		bookSchoolPending.set(svg,template);bookSchoolObserver.observe(svg);return svg;
	}
	function bookSpellCard(table, {preview = false} = {}) {
		if(table.querySelector('.bk-spell-head')) return true;
		const title=table.querySelector('.ve-stats__th-name[data-page="spells.html"]');
		if(!title)return false;
		table.classList.remove('bk-spell','bk-spell-preview');
		const fallback=reason=>{table.dataset.bkFallback=reason;return false;};
		const name=title.querySelector('.ve-stats__h-name')?.parentElement,first=table.querySelector('.ve-rd__b');
		const type=[...table.querySelectorAll('i')].find(e=>!title.contains(e)&&(!first||!!(e.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING)));
		const existing=table.querySelector('.l5-props'),labels=['施法时间','施法距离','法术成分','持续时间'];
		const fields=existing?[...existing.children]:labels.map(text=>[...table.querySelectorAll('b')].find(e=>e.textContent.replace(/[:：]\s*$/,'').trim()===text)?.parentElement);
		if(!name||!type||!first||fields.length!==4||fields.some(e=>!e))return fallback('未识别名字、类型或四格');
		// Only validated native nodes move; no rule data is reconstructed.
		const raw=type.textContent,school=Object.entries(BOOK_ICONS.schools).find(([,v])=>raw.includes(v[0])),level=raw.match(/戏法|\d+\s*环|Cantrip|\d+(?:st|nd|rd|th)[ -]level/i);
		const make=(tag,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;return e;};
		const oldTypeRow=type.closest('tr'),head=name.parentElement,sigil=make('span','bk-sigil'),meta=make('div','bk-spell-type'),lvl=make('div','bk-lvl'),num=make('b');
		head.classList.remove('ve-flex-v-center');head.classList.add('bk-spell-head');name.classList.add('bk-spell-name');
		sigil.append(bookSchoolIconNode(school&&level?school[0]:undefined));if(!school||!level)sigil.dataset.bkGeneric=school?'unknown-level':'unknown-school';sigil.setAttribute('aria-hidden','true');
		head.prepend(sigil);head.append(lvl);name.append(meta);meta.append(type);
		if(level){const walker=document.createTreeWalker(type,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const ix=n.data.indexOf(level[0]);if(ix<0)continue;const token=n.splitText(ix);token.splitText(level[0].length);num.append(token);break;}}
		if(!num.textContent)num.textContent=raw;
		lvl.append(num);
		if (!/^(戏法|Cantrip)$/i.test(num.textContent.trim())) {
			const caption=make('small');
			if (/\d\s*环$/.test(num.textContent)) { const token=num.firstChild;caption.append(token.splitText(token.data.lastIndexOf('环')));caption.append('阶'); }
			else caption.textContent='环阶';
			// Native layered !important rules force <small> to 85%; keep these captions 11px.
			caption.style.setProperty('font-size','11px','important');lvl.append(caption);
		}
		if(school){const walker=document.createTreeWalker(type,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const ix=n.data.indexOf(school[1][0]);if(ix<0)continue;const rest=n.splitText(ix+school[1][0].length);if(!rest.data.startsWith('学派'))rest.before(document.createTextNode('学派'));break;}}
		for(const text of ['专注','仪式'])if((text==='仪式'?raw:fields[3].textContent).includes(text)){
			const badge=make('span','bk-spell-tag tag');
			if(text==='仪式'){
				const walker=document.createTreeWalker(type,NodeFilter.SHOW_TEXT);let n;
				while((n=walker.nextNode())){const match=n.data.match(/[（(]?\s*仪式\s*[)）]?/);if(!match)continue;const token=n.splitText(match.index);token.splitText(match[0].length);token.data=text;badge.append(token);break;}
			}else badge.textContent=text;
			meta.append(badge);
		}
		if(oldTypeRow!==title.closest('tr')&&!oldTypeRow.textContent.trim()&&!oldTypeRow.querySelector('button,a,select'))oldTypeRow.remove();
		let cells=existing;
		if(!cells){
			cells=make('div','bk-spell-cells');const compact=fields.every(e=>e.tagName==='DIV');
			if(compact)fields[0].parentElement.parentElement.before(cells);
			else{const row=make('tr','bk-spell-props-row'),td=make('td');td.colSpan=6;td.append(cells);row.append(td);fields[0].closest('tr').before(row);}
			for(const field of fields){const box=make('div','bk-spell-cell'),small=make('small'),value=make('span'),label=field.querySelector('b');while(label.nextSibling)value.append(label.nextSibling);small.append(label);box.append(small,value);cells.append(box);if(!compact)field.closest('tr').remove();else field.remove();}
		}
		cells.classList.add('bk-spell-cells');cells.closest('tr')?.classList.add('bk-spell-props-row');for(const field of cells.children)field.classList.add('bk-spell-cell');
		for(const field of cells.children)field.querySelector(':scope > small')?.style.setProperty('font-size','11px','important');
		// Keep the existing V5 contract whichever observer gets the native rows first.
		if(!preview){cells.classList.add('l5-props');cells.closest('tr')?.classList.add('l5-props-tr');for(const field of cells.children)field.classList.add('l5-prop');}
		const info=make('div','bk-spell-info');cells.before(info);info.append(cells);
		const footerLabels=[...table.querySelectorAll('div > span.ve-bold,div > span.bold')].filter(e=>/^(职业|子职|种族|背景|专长|其他选项)[^:：]*[:：]\s*$/.test(e.textContent));
		footerLabels.forEach((label,i)=>{const line=label.parentElement;line.classList.add('bk-spell-foot');const value=make('span','bk-spell-foot-value');while(label.nextSibling)value.append(label.nextSibling);line.append(value);if(!i)line.classList.add('bk-spell-foot-first');});
		for(const b of table.querySelectorAll('td > b'))if(/^来源[:：]/.test(b.textContent))b.parentElement.classList.add('bk-spell-source');
		for(const title of table.querySelectorAll('.entry-title-inner'))for(const n of [...title.childNodes])if(n.nodeType===Node.TEXT_NODE){const match=n.data.match(/\s+[A-Za-z][\s\S]*$/);if(!match)continue;const en=make('i','bk-spell-en en');en.append(n.splitText(match.index));title.append(en);}
		table.classList.add('bk-spell');table.classList.toggle('bk-spell-preview',preview);delete table.dataset.bkFallback;return true;
	}
	window.__oursBookSpellCard=bookSpellCard;
	// Item symbols follow the same 24px / 1.6 stroke registry as the schools.
	BOOK_ICONS.items = {
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
	const bookItemCategory = e => {
		const type=String(e.type||e.typeAlt||'').split('|')[0];
		if(e.staff)return 'staff';
		const kinds={M:'sword',R:'bow',A:'arrow',AF:'arrow',LA:'armor',MA:'armor',HA:'armor',S:'shield',P:'potion',RG:'ring',RD:'rod',ST:'staff',WD:'wand',SC:'scroll',G:'gear',AT:'tool',T:'tool',INS:'instrument',GS:'gear',MNT:'vehicle',VEH:'vehicle',SHP:'vehicle',AIR:'vehicle',SPC:'vehicle',TG:'coins',SCF:'wondrous',FD:'gear',TAH:'gear',EXP:'gear',TB:'wondrous',GV:'vehicle',OTH:'gear'};
		if(kinds[type])return kinds[type];if(type.startsWith('$'))return 'coins';
		if(e.poison)return 'gear';if(e.wondrous||e.tattoo)return 'wondrous';if(e.weapon)return e.weaponCategory==='ranged'?'bow':'sword';if(e.armor)return 'armor';
		return 'generic';
	};
	const bookItemIcon = key => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+BOOK_ICONS.items[key][1]+'</svg>';
	const BOOK_ITEM_RARITY = {common:'common',uncommon:'uncommon',rare:'rare','very rare':'very',legendary:'legendary',artifact:'artifact','普通':'common','非普通':'uncommon','珍稀':'rare','极珍稀':'very','传说':'legendary','神器':'artifact'};
	const bookRarity = value => BOOK_ITEM_RARITY[value]||'none';
	const bookItemMake = (tag,cls) => {const e=document.createElement(tag);if(cls)e.className=cls;return e;};
	// Split text nodes only: links, dice, and native bound controls retain identity.
	function bookItemBadge(root, pattern, cls) {
		const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
		while((n=walker.nextNode())){if(n.parentElement.closest('.bk-item-tag'))continue;const m=n.data.match(pattern);if(!m)continue;const token=n.splitText(m.index);token.splitText(m[0].length);const badge=bookItemMake('span','tag bk-item-tag '+cls);token.before(badge);badge.append(token);return badge;}
	}
	const bookItemArtJobs = new Map();
	const bookItemEntities = new WeakMap();
	function bookItemArt(table,art,entity) {
		const title=table.querySelector('.ve-stats__th-name'),key=title.dataset.hash,slot=table.id==='pagecontent'?'detail':table;
		bookItemArtJobs.get(slot)?.();
		let cancelled=false,job,timer;
		const cancel=()=>{cancelled=true;clearTimeout(timer);job?.cancel();};
		bookItemArtJobs.set(slot,cancel);
		const valid=()=>!cancelled&&art.isConnected&&title.dataset.hash===key;
		// A short trailing delay avoids requesting pictures for intermediate rapid selections.
		timer=setTimeout(()=>{void (async()=>{
			let entry,url;
			try{entry=(await Renderer.item.pGetFluff(entity))?.images?.[0];if(entry)url=Renderer.utils.getEntryMediaUrl(entry,'href','img');}catch(e){/* category symbol remains */}
			if(!valid()||!url)return;
			const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';
			const open=()=>{
				if(!valid()||art.dataset.kind!=='image')return;
				imagePreview(img,art,title.dataset.name);
			};
			art.addEventListener('click',open);art.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
			job=imageSlot(img,art,{src:url,valid,compact:true,onReady:()=>{art.dataset.kind='image';art.tabIndex=0;art.setAttribute('role','button');art.title='查看大图';art.setAttribute('aria-label',`${title.dataset.name}：查看大图`);}});
		})();},120);
	}
	function bookItemCard(table,{preview=false,entity=null,art=true}={}) {
		const title=table.querySelector('.ve-stats__th-name[data-page="items.html"]');if(!title)return false;
		if(table.querySelector('.bk-item-head'))return true;
		table.classList.remove('bk-item','bk-item-preview');delete table.dataset.bkRarity;
		if(table.id==='pagecontent'){bookItemArtJobs.get('detail')?.();bookItemArtJobs.delete('detail');}
		const fallback=reason=>{table.dataset.bkFallback=reason;return false;};
		const name=title.querySelector('.ve-stats__h-name')?.parentElement,head=title.querySelector(':scope > .ve-split-v-end'),type=table.querySelector('.ve-rd-item__type-rarity-attunement');
		const nativeType=type?.firstElementChild,existing=table.querySelector('.l5-props'),statsRow=type?.closest('tr')?.nextElementSibling;
		if(!name||!head||!head.contains(name)||name===head||!nativeType||!statsRow||statsRow.tagName!=='TR'||!statsRow.children.length||[...statsRow.children].some(e=>e.tagName!=='TD'))return fallback('未识别名字、类别或信息行');
		entity ||= PAGE_ID==='items'?globalThis.VE_OURS_PAGE?._dataList?.find(e=>UrlUtil.autoEncodeHash(e)===title.dataset.hash):null;
		// Resolve another page's native hover cache before moving any nodes, including cells.
		if(!entity){
			if(bookItemEntities.get(table)!==title){bookItemEntities.set(table,title);void DataLoader.pCacheAndGet('items.html',title.dataset.source,title.dataset.hash).then(e=>{if(!title.isConnected||bookItemEntities.get(table)!==title)return;if(e)bookItemCard(table,{preview,entity:e,art});else fallback('未取得原生物品');}).catch(()=>{if(title.isConnected)fallback('未取得原生物品');});}
			return false;
		}
		const icon=bookItemCategory(entity),symbol=bookItemMake('span','bk-item-art'),meta=bookItemMake('div','bk-item-type ve-rd-item__type-rarity-attunement');
		const rarity=bookRarity(entity.rarity),nativeRarity=typeof entity.rarity==='string'?Parser.rarityToCN(entity.rarity):null;
		const typeRow=type.closest('tr');
		head.classList.remove('ve-split-v-end');head.classList.add('bk-item-head');head.prepend(symbol);symbol.innerHTML=bookItemIcon(icon);symbol.dataset.icon=icon;symbol.dataset.kind='placeholder';symbol.setAttribute('aria-hidden','true');
		name.classList.add('bk-item-name');name.append(meta);meta.append(...type.childNodes);for(const e of meta.querySelectorAll('.ve-italic'))e.classList.remove('ve-italic');typeRow.remove();
		const rarityBadge=rarity!=='none'&&nativeRarity?bookItemBadge(meta,new RegExp(nativeRarity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'bk-item-rarity'):null;
		if(rarityBadge)rarityBadge.dataset.bkRarity=rarity;
		bookItemBadge(meta,/[（(](?:需[^)）]*同调[^)）]*|requires? attunement[^)）]*)[)）]/i,'bk-item-attune');
		table.dataset.bkRarity=rarity;
		if(!existing)bookItemProps(table,entity,statsRow);
		const cells=table.querySelector('.l5-props');
		if(cells){cells.classList.add('bk-item-cells');cells.style.setProperty('--bk-item-columns',cells.children.length);for(const field of cells.children){field.classList.add('bk-item-cell');field.querySelector('small')?.style.setProperty('font-size','11px','important');}const info=bookItemMake('div','bk-item-info');cells.before(info);info.append(cells);}
		for(const b of table.querySelectorAll('td > b'))if(/^来源[:：]/.test(b.textContent))b.parentElement.classList.add('bk-item-foot');
		for(const en of table.querySelectorAll('.entry-title-inner'))for(const n of [...en.childNodes])if(n.nodeType===Node.TEXT_NODE){const m=n.data.match(/\s+[A-Za-z][\s\S]*$/);if(!m)continue;const i=bookItemMake('i','bk-item-en en');i.append(n.splitText(m.index));en.append(i);}
		table.classList.add('bk-item');table.classList.toggle('bk-item-preview',preview);delete table.dataset.bkFallback;
		// Reserve the external rarity edge inside a hover window's clipping boundary.
		// The native table and all of its live controls remain the same nodes.
		if(preview&&table.parentElement&&!table.parentElement.classList.contains('bk-item-preview-frame')){const frame=bookItemMake('div','bk-item-preview-frame');table.before(frame);frame.append(table);}
		if(art&&symbol.isConnected){symbol.removeAttribute('aria-hidden');bookItemArt(table,symbol,entity);}
		return true;
	}
	window.__oursBookItemCard=bookItemCard;window.__oursBookItemCategory=bookItemCategory;
	function bookItemCards(){
		const css=document.createElement('link');css.rel='stylesheet';css.href='/__ours/itemcard.css';document.head.append(css);
		let timer;
		const paint=()=>{observer.disconnect();for(const [slot,cancel] of bookItemArtJobs)if(slot!=='detail'&&!slot.isConnected){cancel();bookItemArtJobs.delete(slot);}for(const title of document.querySelectorAll('.ve-stats__th-name[data-page="items.html"]')){const table=title.closest('table');if(table)bookItemCard(table,{preview:table.id!=='pagecontent'||PAGE_ID!=='items'});}observer.observe(document.body,{childList:true,subtree:true});};
		// Edition/filter changes mount thousands of list rows, never statblock titles.
		// Do not walk those rows looking for a detail or a body-level hover window.
		const observer=new MutationObserver(muts=>{
			// One root lookup per batch; avoid a CSS ancestor query for every list mutation.
			const list=document.getElementById('listcontainer'),sublist=document.getElementById('sublistcontainer');
			if(!muts.some(m=>!list?.contains(m.target)&&!sublist?.contains(m.target)&&!m.target.closest?.('.l5-qf,.l5-pop')&&[...m.addedNodes].some(n=>n.nodeType===1&&!n.matches('#listcontainer,#sublistcontainer')&&(n.matches('.ve-stats__th-name[data-page="items.html"]')||n.querySelector('.ve-stats__th-name[data-page="items.html"]')))))return;
			clearTimeout(timer);timer=setTimeout(paint,0);
		});paint();
	}
	BOOK_ICONS.species = {
		humanoid: ['类人', '<circle cx="12" cy="5" r="2.5"/><path d="M4 11l5-2h6l5 2m-8-2v6m-3 6 3-6 3 6"/>'],
		fey: ['精类', '<path d="M12 21V9m0 6C6 15 3 11 3 5c5 0 8 2 9 6 1-4 4-6 9-6 0 6-3 10-9 10M12 6V3"/>'],
		construct: ['构装', '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M12 7V3M9 3h6M2 11v5m20-5v5M9 16h6M8.5 11.5h1m5 0h1"/>'],
		dragon: ['龙', '<path d="M4 21c0-4 2-6.5 5-9l-3-1.5L9 8l3-1 3 1.5 2 2.5 4 1 1 2-2 2h-5l4 2-2 2-5-3-1 4M8.5 8.4C7.6 5.7 6 3.8 3.7 3c3.2-.4 6 .9 7.5 4.2m.5-.1C11.2 4.8 10 3 8.2 2c3.3.2 5.5 2 6.6 6M13 10.5h.8m4.8 3.2h.5"/>'],
		elemental: ['元素', '<path d="M12 2c3 5 7 8 7 13a7 7 0 0 1-14 0c0-3 2-5 3-7 0 4 2 4 2 4 2-3 2-6 2-10zM12 21c-3-1-3-4 0-7 3 3 3 6 0 7z"/>'],
		celestial: ['天界', '<ellipse cx="12" cy="4.3" rx="4.2" ry="1.7"/><path d="M10.7 19.5c-3.2.8-6.3-.8-7.3-3l2.5-.3C3 15 1.9 12.1 2 8.6c2.6 2.7 6 2 7.4 4.5.9 1.6.3 2.6 1.3 4m-5.1-4 2 1.5m5.7 4.9c3.2.8 6.3-.8 7.3-3l-2.5-.3C21 15 22.1 12.1 22 8.6c-2.6 2.7-6 2-7.4 4.5-.9 1.6-.3 2.6-1.3 4m5.1-4-2 1.5"/>'],
		fiend: ['邪魔', '<path d="M7 9C4 8 3 5 4 2c2 3 4 4 6 5m4 0c2-1 4-2 6-5 1 3 0 6-3 7M12 22c-3-2-7-5-7-9a7 7 0 0 1 14 0c0 4-4 7-7 9zM8 13l2 1m6-1-2 1m-4 4h4"/>'],
		beast: ['野兽', '<ellipse cx="4.5" cy="11" rx="1.7" ry="2.5"/><ellipse cx="9" cy="6.5" rx="1.8" ry="2.7"/><ellipse cx="15" cy="6.5" rx="1.8" ry="2.7"/><ellipse cx="19.5" cy="11" rx="1.7" ry="2.5"/><path d="M8 15q4-6 8 0c6 6 1 8-4 5-5 3-10 1-4-5z"/>'],
		undead: ['不死', '<path d="M12 3c-8 0-10 9-5 13v4h10v-4c5-4 3-13-5-13zm-2 14v3m4-3v3m-3-5 1-2 1 2"/><circle cx="8.5" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/>'],
		plant: ['植物', '<path d="M5 21c1-5 5-9 11-13M7 17C1 7 12 4 21 3c0 10-5 17-14 14zm4-6v4h5"/>'],
		aberration: ['怪异', '<path d="M2 11s4-5 10-5 10 5 10 5-4 5-10 5-10-5-10-5zm4 4v3c0 2-2 3-3 2m9-4v6m6-7v3c0 2 2 3 3 2"/><circle cx="12" cy="11" r="2.5"/>'],
		giant: ['巨人', '<circle cx="14" cy="4.5" r="2.4"/><path d="M9 8h8l3 1.5 2 4-2.4 1.3L17 12l.5 4.2 2 5h-3.3l-2.4-4-2.4 4H8l1.5-5.4L10 12l-2.5 2.3-3.3-1.5.8-2.2 2 .6L9 8zM3.8 10.2l-1.5-.4c-.6-.2-.9-.8-.7-1.4L3 3.9c.2-.7.9-1.1 1.6-.9l1.2.4c.7.2 1.1.9.8 1.6l-1.5 4.5c-.2.5-.8.9-1.3.7zm.1.1L2 16"/>'],
		ooze: ['泥怪', '<path d="M3 18c0-3 4-3 5-8s7-8 9-2c1 3 4 6 4 10 0 3-18 3-18 0zM11 12h.5m4 2h.5m-6 3h.5"/>'],
		monstrosity: ['怪兽', '<path d="M4 3c3 3 5 5 8 4s5-1 8-4l-1 8 2 4-4 6H7l-4-6 2-4zM5 12l5 2m9-2-5 2m-4 7v-3h4v3"/>'],
	};
	BOOK_ICONS.feats = {
		O: ['起源', '<path d="M12 21v-8M5 21h14M12 15C6 15 3 11 3 6c5 0 9 2 9 8 0-6 4-10 9-11 0 6-3 10-9 10"/>'],
		G: ['通用', '<path d="M9 21c-5-2-7-7-5-14m11 14c5-2 7-7 5-14M4 12C1 11 1 8 2 5c3 1 5 3 2 7zm16 0c3-1 3-4 2-7-3 1-5 3-2 7zM7 18c-4 1-6-1-6-4 4-1 6 1 6 4zm10 0c4 1 6-1 6-4-4-1-6 1-6 4z"/>'],
		FS: ['战斗风格', '<path d="M4 3h4l8 10-3 3L4 7zm16 0h-4l-3 4m7-4v4l-8 9M11 16l5-5m-8 2 5 5m2-2 5 5m-9-5-5 5m11-3 3-1m-13 1-3-1"/>'],
		EB: ['传奇恩惠', '<path d="M3 7l5 4 4-6 4 6 5-4-2 11H5zM5 21h14m-7-8v2"/>'],
		D: ['龙纹', '<path d="M12 2l9 10-9 10-9-10zM13 6l-4 7h4l-2 5 5-7h-4z"/>'],
		DG: ['黑暗赠礼', '<path d="M15 3a9 9 0 1 0 6 14A8 8 0 0 1 15 3zM19 5v5m-2.5-2.5h5M9 12l2 2-2 2-2-2z"/>'],
		Craft: ['制作', '<path d="M3 8h18l-3 4h-5v4l4 3H6l4-3v-4H7zM6 5h12"/>'],
		Harvest: ['采集', '<path d="M6 21l7-9M9 18C3 14 4 5 11 3c4-1 7 0 9 2-8 0-11 5-7 7l4 1"/>'],
	};
	BOOK_ICONS.background = {scroll: ['背景', '<path d="M13 5H6a3 3 0 1 0 0 6h2V8m0 0v11a2 2 0 0 0 4 0v-1h8a3 3 0 0 1-3 3h-7m0-6 9-11 3-1-1 4-9 9m4-6 2 2"/>']};

	const BOOK_SPECIES_TYPES = {
		类人:'humanoid', 类人生物:'humanoid', 精类:'fey', 妖精:'fey', 构装:'construct', 构装生物:'construct',
		龙:'dragon', 龙类:'dragon', 元素:'elemental', 元素生物:'elemental', 天界:'celestial', 天界生物:'celestial',
		邪魔:'fiend', 野兽:'beast', 不死:'undead', 不死生物:'undead', 亡灵:'undead', 植物:'plant',
		怪异:'aberration', 异怪:'aberration', 巨人:'giant', 巨人语:'giant', 泥怪:'ooze', 怪兽:'monstrosity',
	};
	const bookFeatIconKey = category => /^FS(?::|$)/.test(category) ? 'FS'
		: Object.hasOwn(BOOK_ICONS.feats, category) ? category : 'generic';
	const bookOptionIconKey = (prop, entity) => {
		if (prop === 'feat') return bookFeatIconKey(entity.category);
		if (prop === 'background') return 'scroll';
		const first = String(entity.creatureTypes?.[0] ?? 'humanoid').trim().toLowerCase();
		const type = BOOK_SPECIES_TYPES[first] || first;
		return Object.hasOwn(BOOK_ICONS.species, type) ? type : 'generic';
	};
	const bookOptionIcon = (group, key) => {
		const entry = BOOK_ICONS[group][key] || BOOK_ICONS.items.generic;
		const template = document.createElement('template');
		template.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + entry[1] + '</svg>';
		return template.content.firstElementChild;
	};
	const bookFeatPending = new WeakMap();
	let bookFeatObserver;
	function bookFeatListIcon(category) {
		const key = bookFeatIconKey(category);
		const slot = bookItemMake('span', 'bk-opt-list-icon');
		slot.setAttribute('aria-hidden', 'true');
		const fill = () => slot.append(bookOptionIcon('feats', key));
		if (!globalThis.IntersectionObserver) fill();
		else {
			bookFeatObserver ||= new IntersectionObserver(entries => {
				for (const {target, isIntersecting} of entries) {
					if (!isIntersecting) continue;
					bookFeatPending.get(target)?.();
					bookFeatPending.delete(target);
					bookFeatObserver.unobserve(target);
				}
			}, {rootMargin: '160px 0px'});
			bookFeatPending.set(slot, fill);
			bookFeatObserver.observe(slot);
		}
		return slot;
	}

	const BOOK_OPTION_PROPS = {'races.html':'race', 'backgrounds.html':'background', 'feats.html':'feat'};
	const BOOK_OPTION_TITLE = Object.keys(BOOK_OPTION_PROPS).map(page => `.ve-stats__th-name[data-page="${page}"]`).join(',');
	const BOOK_OPTION_FIELDS = {
		race: /^(?:生物类型|属性值(?:提升)?|体型|速度|语言|Creature Types?|Ability Score(?: Increase|s)?|Size|Speed|Languages?)$/i,
		background: /^(?:属性值(?:提升)?|专长|技能(?:熟练项?)?|工具(?:熟练项?)?|语言|装备|Ability Score(?: Increase|s)?|Feat|Skills?|Skill Proficienc(?:y|ies)|Tools?|Tool Proficienc(?:y|ies)|Languages?|Equipment)(?:\s+[A-Za-z][A-Za-z ]*)?$/i,
	};
	const bookOptionLabel = node => node.textContent.trim().replace(/[:：.。]+$/, '');
	const bookOptionLabelNode = line => {
		const label = line.firstElementChild;
		return label?.matches('b,strong,.ve-rd__list-item-name') && line.firstChild === label ? label : null;
	};
	function bookOptionFields(body, prop) {
		const fields = [], lists = [];
		const root = prop === 'background' && body.firstElementChild?.matches('.ve-rd__b:not(.ve-rd__b--named)')
			? body.firstElementChild : body;
		for (const block of root.children) {
			const isList = block.matches('ul.ve-rd__list-hang-notitle');
			const lines = isList ? [...block.children].map(li => li.firstElementChild) : [block];
			const labels = lines.map(line => line?.matches('p') ? bookOptionLabelNode(line) : null);
			const recognized = label => label && BOOK_OPTION_FIELDS[prop].test(bookOptionLabel(label));
			if (!labels.some(recognized)) break;
			if (labels.some((label, i) => !recognized(label) || !label.nextSibling
				|| (isList && (block.children[i].childElementCount !== 1
					|| [...block.children[i].childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))))) return null;
			for (const [i, label] of labels.entries()) fields.push({line: lines[i], label});
			if (isList) lists.push(block);
		}
		const spacer = prop === 'race' && lists[0]?.nextElementSibling?.matches('.ve-w-100.ve-py-1')
			? lists[0].nextElementSibling : null;
		return {fields, lists, spacer};
	}

	function bookOptionFeatMeta(rows, entity) {
		const parts = [];
		for (const row of rows) {
			const cell = row.cells[0];
			if (!cell || cell.querySelector('.ve-tbl-divider,.ve-rd__b')) break;
			const type = cell.querySelector(':scope > i,:scope > div > i');
			const repeatLabel = cell.querySelector(':scope > b,:scope > div > b');
			const repeat = repeatLabel && /^(?:Repeatable|可重复(?:选择)?|复选)[:：]?$/i.test(repeatLabel.textContent.trim());
			const compactRepeat = type?.parentElement.nextElementSibling;
			if (type) {
				const category = entity.category ? Renderer.feat.getJoinedCategoryPrerequisites(entity.category, '') : '';
				if (category && !type.firstChild?.textContent.startsWith(category)) return null;
				parts.push({type, category, row, repeat: compactRepeat?.matches('div') ? compactRepeat : null});
			} else if (repeat) parts.push({repeat: repeatLabel.parentElement, row});
			else break;
		}
		if (entity.category && !parts.some(part => part.type)) return null;
		return parts;
	}

	function bookOptionArtwork(title, media, entity, prop) {
		let img, job, timer, dialog, generation = 0;
		const valid = () => title.isConnected && media.isConnected;
		const cancel = () => {
			++generation;
			clearTimeout(timer);
			// The native tab strip detaches and later restores its original DOM.
			if (img && media.dataset.kind !== 'image') {
				job?.cancel();
				img = null;
			}
			dialog?.close();
		};
		const start = () => {
			if (media.dataset.kind === 'image') return;
			const token = ++generation;
			timer = setTimeout(async () => {
				if (!valid()) return;
				let url;
				try {
					const entry = (await Renderer[prop].pGetFluff(entity))?.images?.[0];
					if (entry) url = Renderer.utils.getEntryMediaUrl(entry, 'href', 'img');
				} catch { /* The reserved frame still displays its symbol. */ }
				if (!url || !valid() || token !== generation) return;
				const picture = img = document.createElement('img');
				img.alt = '';
				img.decoding = 'async';
				job = imageSlot(img, media, {src: url, valid: () => valid() && token === generation, compact: true, onReady: () => {
					picture.classList.toggle('bk-opt-landscape', picture.naturalWidth > picture.naturalHeight * 1.15);
					media.dataset.kind = 'image';
					media.disabled = false;
					media.removeAttribute('aria-hidden');
				}, onError: () => { media.disabled = false; media.removeAttribute('aria-hidden'); }});
			}, 120);
		};
		media.addEventListener('click', () => {
			if (media.dataset.kind !== 'image' || dialog?.open) return;
			dialog = imagePreview(img, media, title.dataset.name, 'bk-item-image bk-opt-image');
		});
		return {start, cancel};
	}

	const bookOptionArtJobs = new Map();
	const bookOptionArtState = new WeakMap();
	const bookOptionKnownPortrait = entity => !!(entity.hasFluffImages || entity.fluff?.images?.length);
	function bookOptionCard(table, {preview = false, entity, art = true, hasPortrait} = {}) {
		const title = table.querySelector(BOOK_OPTION_TITLE);
		if (!title || !entity) return false;
		if (title.querySelector('.bk-opt-head')) return true;
		const fallback = reason => { table.dataset.bkFallback = reason; return false; };
		const prop = BOOK_OPTION_PROPS[title.dataset.page];
		const head = title.querySelector(':scope > .ve-split-v-end');
		const name = title.querySelector('.ve-stats__h-name');
		const left = head?.firstElementChild;
		const row = title.closest('tr');
		if (!left || !name || !left.contains(name) || !row) return fallback('未识别名字区');
		const rows = [];
		for (let next = row.nextElementSibling; next; next = next.nextElementSibling) rows.push(next);
		const body = rows.find(r => r.cells[0]?.querySelector(':scope > .ve-rd__b,:scope > .ve-rd__list'))?.cells[0];
		const config = prop === 'feat' ? bookOptionFeatMeta(rows, entity) : body && bookOptionFields(body, prop);
		if (!config) return fallback('未识别原生头部结构');

		const portrait = prop !== 'feat' && (hasPortrait ?? bookOptionKnownPortrait(entity));
		const media = bookItemMake(portrait ? 'button' : 'span', 'bk-opt-art');
		const icon = bookOptionIconKey(prop, entity);
		media.dataset.icon = icon;
		media.dataset.kind = 'placeholder';
		media.setAttribute('aria-hidden', 'true');
		media.append(bookOptionIcon({race:'species', feat:'feats', background:'background'}[prop], icon));
		if (portrait) {
			media.classList.add('bk-opt-portrait');
			media.type = 'button';
			media.disabled = true;
			media.setAttribute('aria-label', `${title.dataset.name}：查看大图`);
		}
		head.classList.remove('ve-split-v-end');
		head.classList.add('bk-opt-head');
		left.classList.add('bk-opt-name');
		head.prepend(media);

		if (prop === 'feat') {
			const meta = bookItemMake('div', 'bk-opt-meta');
			for (const part of config) {
				if (part.type) {
					if (part.category) {
						const rest = part.type.firstChild.splitText(part.category.length);
						const badge = bookItemMake('span', 'tag bk-opt-tag');
						part.type.insertBefore(badge, rest);
						badge.append(badge.previousSibling);
					}
					meta.append(part.type);
				}
				if (part.repeat) {
					const badge = bookItemMake('span', 'tag bk-opt-tag');
					badge.append(...part.repeat.childNodes);
					meta.append(badge);
				}
				part.row.remove();
			}
			if (meta.childElementCount) head.append(meta);
		} else if (config.fields.length) {
			const cells = bookItemMake('div', 'bk-opt-cells');
			for (const {line, label} of config.fields) {
				const cell = bookItemMake('div', 'bk-opt-cell');
				if (line.textContent.length > 58 || /^(?:装备|Equipment)/i.test(label.textContent)) cell.classList.add('bk-opt-wide');
				label.classList.add('bk-opt-label');
				const value = bookItemMake('span', 'bk-opt-value');
				while (label.nextSibling) value.append(label.nextSibling);
				cell.append(label, value);
				cells.append(cell);
				line.remove();
			}
			cells.style.setProperty('--bk-opt-columns', Math.min(4, Math.max(1,
				cells.querySelectorAll(':scope > :not(.bk-opt-wide)').length)));
			config.lists.forEach(list => list.remove());
			config.spacer?.remove();
			if (!body.textContent.trim() && !body.querySelector('a,button,img,table,[data-packed-dice]')) {
				body.classList.add('ve-hidden');
				title.classList.add('bk-opt-summary-only');
			}
			head.append(cells);
		}
		for (const r of rows) {
			const cell = r.cells[0], label = cell?.querySelector(':scope > b');
			if (!label || !/^(?:来源|Source)[:：]/i.test(label.textContent)) continue;
			const ornament = bookItemMake('div', 'orn');
			ornament.setAttribute('aria-hidden', 'true');
			cell.prepend(ornament);
			cell.classList.add('bk-opt-foot');
		}
		for (const heading of table.querySelectorAll('.entry-title-inner')) {
			if (prop === 'feat' && /^(?:复选|可重复(?:选择)?|Repeatable)(?:\s|[.。:：]|$)/i.test(heading.textContent)) {
				heading.classList.add('tag', 'bk-opt-tag');
				continue;
			}
			for (const node of [...heading.childNodes]) {
				const match = node.nodeType === Node.TEXT_NODE && node.data.match(/\s+[A-Za-z][\s\S]*$/);
				if (!match) continue;
				const en = bookItemMake('i', 'en bk-opt-en');
				node.after(en);
				en.append(node.splitText(match.index));
			}
		}
		table.classList.add('bk-opt');
		table.classList.toggle('bk-opt-preview', preview);
		delete table.dataset.bkFallback;
		if (portrait && art && media.isConnected) {
			const job = bookOptionArtwork(title, media, entity, prop);
			bookOptionArtState.set(title, job);
			bookOptionArtJobs.set(title, job);
			job.start();
		}
		return true;
	}

	function bookOptionCards() {
		const isOptionPage = Object.hasOwn(BOOK_OPTION_PROPS, PAGE);
		let css;
		const loadStyle = () => {
			if (css) return;
			css = bookItemMake('link');
			css.rel = 'stylesheet';
			css.href = '/__ours/optioncard.css';
			document.head.append(css);
		};
		if (isOptionPage) loadStyle();
		const pending = new WeakSet();
		const paint = title => {
			const table = title.closest('table');
			if (!table) return;
			const preview = table.id !== 'pagecontent';
			const {page, source, hash} = title.dataset;
			if (!preview && page !== PAGE) return;
			loadStyle();
			if (pending.has(title)) {
				if (title.querySelector('.bk-opt-head')) table.classList.add('bk-opt');
				const job = bookOptionArtState.get(title);
				if (job && !bookOptionArtJobs.has(title)) { bookOptionArtJobs.set(title, job); job.start(); }
				return;
			}
			pending.add(title);
			const prop = BOOK_OPTION_PROPS[page], current = () => title.isConnected && table.querySelector(BOOK_OPTION_TITLE) === title;
			const paintEntity = async entity => {
				if (!current()) return;
				if (!entity) { table.dataset.bkFallback = '未取得原生条目'; return; }
				let hasPortrait = bookOptionKnownPortrait(entity);
				if (prop !== 'feat' && !hasPortrait && entity.fluff) {
					hasPortrait = await Renderer.utils.pHasFluffImages(entity, `${prop}Fluff`).catch(() => false);
				}
				if (current()) bookOptionCard(table, {preview, entity, hasPortrait});
			};
			const reportError = error => {
				if (current()) table.dataset.bkFallback = '读取原生头部失败';
				console.error(error);
			};
			const entity = !preview && globalThis.VE_OURS_PAGE?._lastRender?.entity;
			if (entity && UrlUtil.autoEncodeHash(entity) === hash) void paintEntity(entity).catch(reportError);
			else void DataLoader.pCacheAndGet(page, source, hash).then(paintEntity).catch(reportError);
		};
		const observer = new MutationObserver(mutations => {
			const list = document.getElementById('listcontainer'), sublist = document.getElementById('sublistcontainer');
			for (const mutation of mutations) {
				if (list?.contains(mutation.target) || sublist?.contains(mutation.target)) continue;
				const table = isOptionPage && mutation.target.closest?.('table#pagecontent');
				if (table && !table.querySelector('.bk-opt-head') && table.classList.contains('bk-opt')) {
					table.classList.remove('bk-opt', 'bk-opt-preview');
					delete table.dataset.bkFallback;
				}
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE || !node.isConnected) continue;
					if (node.matches(BOOK_OPTION_TITLE)) paint(node);
					else if (node.matches('.ve-hwin,.ve-hwin *') ||
						(isOptionPage && node.matches('tr,tbody,table,#contentwrapper'))) {
						for (const title of node.querySelectorAll(BOOK_OPTION_TITLE)) paint(title);
					}
				}
			}
			for (const [title, job] of bookOptionArtJobs) {
				if (title.isConnected) continue;
				job.cancel();
				bookOptionArtJobs.delete(title);
			}
		});
		observer.observe(document.body, {childList:true, subtree:true});
		for (const title of document.querySelectorAll(BOOK_OPTION_TITLE)) paint(title);
	}
	window.__oursBookOptionCard = bookOptionCard;
	window.__oursBookOptionIconKey = bookOptionIconKey;
	window.__oursBookOptionIcons = () => Object.fromEntries(['species','background','feats','items'].map(group => [
		group, Object.entries({...BOOK_ICONS[group], generic:BOOK_ICONS.items.generic})
			.map(([key, [label]]) => ({key, label, svg:bookOptionIcon(group, key).outerHTML})),
	]));

	function bookSpellCards(){
		const css=document.createElement('link');css.rel='stylesheet';css.href='/__ours/spellcard.css';document.head.append(css);
		let timer;
		const paint=()=>{observer.disconnect();for(const title of document.querySelectorAll('.ve-stats__th-name[data-page="spells.html"]')){const table=title.closest('table');if(table)bookSpellCard(table,{preview:table.id!=='pagecontent'||PAGE_ID!=='spells'});}observer.observe(document.body,{childList:true,subtree:true});};
		const observer=new MutationObserver(muts=>{if(!muts.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches('.ve-stats__th-name[data-page="spells.html"]')||n.querySelector('.ve-stats__th-name[data-page="spells.html"]')))))return;clearTimeout(timer);timer=setTimeout(paint,0);});
		paint();
	}

	function bookMonsterCard (table, {preview = false} = {}) {
		if (table.querySelector(":scope > tbody > .bk-mon-row, :scope > .bk-mon-row")) return true;
		const title = table.querySelector('.ve-stats__th-name[data-page="bestiary.html"]');
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
				if (n.parentElement.closest("strong") || (!allowDice && n.parentElement.closest("[data-packed-dice]"))) continue;
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
	// Public entry point also lets the audit compare the same live nodes before/after.
	window.__oursBookMonsterCard = bookMonsterCard;
	function bookMonsterCards () {
		const stylesheet = document.createElement("link"); stylesheet.rel = "stylesheet"; stylesheet.href = "/__ours/statblock.css"; document.head.append(stylesheet);
		let timer;
		const paint = () => {
			observer.disconnect();
			for (const title of document.querySelectorAll('.ve-stats__th-name[data-page="bestiary.html"]')) {
				const table = title.closest("table"); if (!table || title.closest(".bk-mon-row")) continue;
				const preview = table.id !== "pagecontent" || PAGE_ID !== "bestiary";
				if (bookMonsterCard(table, {preview}) && !preview) bookMonsterPortrait(table);
			}
			observer.observe(document.body, {childList: true, subtree: true});
		};
		const observer = new MutationObserver(muts => {
			if (!muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('.ve-stats__th-name[data-page="bestiary.html"]') || n.querySelector('.ve-stats__th-name[data-page="bestiary.html"]'))))) return;
			clearTimeout(timer); timer = setTimeout(paint, 0);
		});
		paint();
		if (PAGE_ID === "bestiary") waitFor(() => globalThis.VE_OURS_PAGE?._tokenDisplay).then(display => {
			if (!display) return;
			const nativeRender = display.render;
			display.render = function (...args) {
				const table = document.getElementById("pagecontent");
				// The native renderer calls this after inserting/binding every stat node.
				// Choose the illustration before the old circular token requests a bitmap.
				if (table && bookMonsterCard(table)) { bookMonsterPortrait(table); return; }
				document.getElementById("float-token")?.classList.remove("ve-hidden");
				return nativeRender.apply(this, args);
			};
		});
	}
	async function bookMonsterPortrait (table) {
		const head = table.querySelector(".bk-mon-head"), mon = globalThis.VE_OURS_PAGE?._lastRender?.entity;
		if (!head || !mon || head.dataset.portraitPending || head.querySelector(".bk-mon-portrait")) return;
		head.dataset.portraitPending = "true";
		const token = document.querySelector("#float-token"); token?.classList.add("ve-hidden");
		let imageEntry;
		try { const fluff = await Renderer.monster.pGetFluff(mon); imageEntry = fluff?.images?.[0]; } catch (e) { /* unavailable fluff uses the token */ }
		// A switched/detached card must never start an image request.
		if (!head.isConnected || globalThis.VE_OURS_PAGE?._lastRender?.entity !== mon) return;
		let url;
		try {
			if (imageEntry) url = Renderer.get()._renderImage_getUrl(imageEntry);
			else if (Renderer.monster.hasToken(mon)) url = Renderer.monster.getTokenUrl(mon);
		} catch (e) { head.dataset.portraitPending = "none"; return; }
		if (!url) { head.dataset.portraitPending = "none"; return; }
		head.dataset.portraitPending = "image";
		// No image means no column. The ornament is reserved for a real URL
		// which has failed to load, and is never a no-image monster placeholder.
		const portrait = document.createElement("figure"); portrait.className = "bk-mon-portrait portrait"; portrait.dataset.kind = "loading";
		const ornament = document.createElement("span"); ornament.className = "bk-mon-flower ve-hidden"; ornament.setAttribute("aria-hidden", "true"); portrait.append(ornament); head.append(portrait);
		const img = document.createElement("img"); img.loading = "lazy"; img.alt = `${mon.name} 插图`;
		const ready = () => {
			let cutout = false;
			try {
				const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2;
				const ctx = canvas.getContext("2d", {willReadFrequently: true});
				for (const [x, y, dx, dy] of [[0, 0, 0, 0], [img.naturalWidth - 1, 0, 1, 0], [0, img.naturalHeight - 1, 0, 1], [img.naturalWidth - 1, img.naturalHeight - 1, 1, 1]]) ctx.drawImage(img, x, y, 1, 1, dx, dy, 1, 1);
				const pixels = ctx.getImageData(0, 0, 2, 2).data; cutout = [3, 7, 11, 15].every(i => pixels[i] < 10);
			} catch (e) { /* CORS/unsupported canvas: treat as opaque. */ }
			portrait.dataset.presentation = cutout ? "cutout" : "photo";
			portrait.dataset.kind = imageEntry ? "fluff" : "token"; ornament.classList.add("ve-hidden");
		};
		const failed = () => { ornament.classList.remove("ve-hidden"); portrait.dataset.kind = "placeholder"; };
		if (imageEntry) {
			portrait.tabIndex = 0; portrait.setAttribute("role", "button"); portrait.title = "查看大图"; portrait.setAttribute("aria-label", "查看大图");
			const open = () => [...document.querySelectorAll("#stat-tabs button,.stat-tab")].find(e => e.textContent.trim() === "图片")?.click();
			portrait.addEventListener("click", open); portrait.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
		}
		const valid = () => portrait.isConnected && globalThis.VE_OURS_PAGE?._lastRender?.entity === mon;
		img.addEventListener("load", () => {
			if (valid() && img.naturalWidth && ["fluff", "token"].includes(portrait.dataset.kind)) ready();
		});
		imageSlot(img, portrait, {src: url, valid, onReady: ready, onError: failed});
	}

	// ------------------------------------------------------------------ basics
	const TIERS = ["T0", "T1", "T2", "T3", "T4"];
	const TIER_NAME = {T0: "传说", T1: "史诗", T2: "精良", T3: "优秀", T4: "普通"};
	const MODES = [
		{id: "rec", label: "推荐", tip: "官方＋甲、乙两档第三方（不全书收录范围与知名出版社）＋我们的扩充。默认"},
		{id: "official", label: "常规", tip: "只显示威世智（WotC）官方资料"},
		{id: "all", label: "全部", tip: "推荐范围之外，再加上其余所有第三方（丙档：个人自制、小众作品等）"},
		{id: "brew", label: "只看第三方", tip: "只显示甲、乙两档第三方和我们的扩充，方便逛新东西"},
		{id: "manual", label: "手动", tip: "不干预，用页面自己的来源筛选"},
	];
	const PAGE = (window.__OURS_WEB && location.pathname === "/home.html" ? "index.html" : (location.pathname.split("/").filter(Boolean).pop() || "index.html")).replace(/\/$/, "");
	const PAGE_ID = PAGE.replace(/\.html$/, "");
	const LS_MODE = "ours.srcMode2";
	const DEFAULT_MODE = "rec";
	const FULL_MODES = ["all", "manual"];   // only these need the 丙 books; the others share one set of loaded data
	// 强度榜 / 档位标记 / 评价卡片：暂时关闭（数据都还在 ours\ratings*.json，以后讨论好怎么加再打开）
	const RATINGS_ON = false;
	const INITIAL_HASH = location.hash;
	const SEARCH_PARAMS = new URLSearchParams(location.search);
	const SEARCH_SOURCES = new Set(SEARCH_PARAMS.getAll("ours-source").map(s => s.toLowerCase()));
	const SEARCH_FEATURE = SEARCH_PARAMS.get("ours-feature");
	const searchFeatureSlot = INITIAL_HASH.match(/(?:[:~])feature=s([^~,]+)/i)?.[1];
	const hashEntry = hash => hash.toLowerCase().replace(/^#/, "").split(",", 1)[0];
	const initialEntry = hashEntry(INITIAL_HASH);
	const searchEntry = SEARCH_PARAMS.get("ours-search");
	let pinnedEntry = initialEntry && (searchEntry === initialEntry || (!searchEntry && PAGE_ID === "classes" && SEARCH_SOURCES.size))
		? initialEntry : "";
	const isPinnedEntryActive = () => !!pinnedEntry && hashEntry(location.hash) === pinnedEntry;
	const isPinnedFeature = slot => !!SEARCH_FEATURE && !!slot && slot === searchFeatureSlot && isPinnedEntryActive();
	if (pinnedEntry) window.addEventListener("hashchange", () => {
		if (!pinnedEntry || isPinnedEntryActive()) return;
		pinnedEntry = "";
		const mode = srcMode();
		const p = page();
		if (PAGE_ID === "classes" && SEARCH_SOURCES.size && p?._filterBox && ["official", "rec", "brew"].includes(mode)) {
			setSources(p, mode);
		}
	});
	const setModeCookie = mode => { document.cookie = `ours_src=${mode}; path=/; max-age=31536000; SameSite=Lax`; };
	const cookieMode = () => (document.cookie.match(/(?:^|;\s*)ours_src=(\w+)/) || [])[1] || "";
	const START_FULL = ["all", "manual"].includes(cookieMode());   // the server sends the 丙 books only for these
	let LOADED_FULL = START_FULL;
	let TIER = {};             // third-party source -> "A" | "B" | "C"（我们的扩充算 A）
	const state = {ratings: null, user: null, status: null};

	const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c]));
	const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
	const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
	async function api (path, body) {
		if (window.__OURS_WEB && body === undefined && /^\/__api\/[\w-]+$/.test(path)) path += ".json";
		const opts = body === undefined ? {} : {method: "POST", headers: {"Content-Type": "application/json", "X-Local-Reader": "1"}, body: JSON.stringify(body)};
		const r = await fetch(path, opts);
		if (!r.ok) throw new Error(`${path}: ${r.status}`);
		return r.json();
	}
	async function waitFor (fn, {timeout = 60000, every = 150} = {}) {
		const t0 = Date.now();
		while (Date.now() - t0 < timeout) {
			try { const v = fn(); if (v) return v; } catch (e) { /* not ready */ }
			await sleep(every);
		}
		return null;
	}
	const page = () => globalThis.VE_OURS_PAGE;
	// most list pages have one list; the items page has two (mundane + magic)
	const pageLists = pg => (pg?._list ? [pg._list] : (pg?.primaryLists || [])).filter(Boolean);
	const listReady = pg => pageLists(pg).some(l => l.items?.length);
	const IN_SHELL = (() => { try { return window.top !== window && !!window.top.__oursShell; } catch (e) { return false; } })();
	const tellShell = msg => { if (IN_SHELL) try { window.top.postMessage(msg, location.origin); } catch (e) { /* ignore */ } };

	// Only requests cross the frame boundary. The shell owns the worker for
	// its entire lifetime, including when a list tab is released from memory.
	function bindSearch () {
		const host = IN_SHELL ? window.top : window;
		let client, warned = false, options;
		const knownBrewSources = new Set();
		let css;
		const styles = () => {
			if (css) return;
			css = document.createElement("link");
			css.rel = "stylesheet";
			css.href = "/__ours/search.css";
			document.head.append(css);
		};
		const request = async (type, query, opts) => {
			if (IN_SHELL) return host.__oursSearchRequest(type, query, opts);
			client ||= import("/__ours/search-worker.js").then(module => module.createSearchClient())
				.catch(error => { client = null; throw error; });
			return (await client)(type, query, opts);
		};
		const run = async (...args) => {
			try {
				const result = await request(...args);
				if (args[0] !== "list") host.__oursSearchReady = true;
				warned = false;
				return result;
			} catch (error) {
				if (args[0] !== "list") host.__oursSearchReady = false;
				throw error;
			}
		};
		const metadata = (aliases = {}) => {
			if (options) return options;
			const labels = Parser.CAT_ID_TO_FULL;
			const props = Parser.CAT_ID_TO_PROP;
			const categories = {};
			const add = (key, ids) => { if (key) categories[key] = [...new Set([...(categories[key] || []), ...ids])]; };
			for (const [id, label] of Object.entries(labels)) {
				add(label.toLowerCase(), [+id]);
				add(props[id]?.toLowerCase(), [+id]);
				const file = UrlUtil.categoryToPage(+id);
				if (file) add(file.replace(/\.html$/, ""), [+id]);
			}
			for (const [key, names] of Object.entries(aliases)) {
				add(key, Object.keys(labels).filter(id => names.includes(labels[id])).map(Number));
			}
			const sources = Object.fromEntries(Object.keys(Parser.SOURCE_JSON_TO_FULL).map(s => [s.toLowerCase(), {
				abv: Parser.sourceJsonToAbv(s),
				legacy: SourceUtil.isLegacySourceWotc(s),
				ua: SourceUtil.isNonstandardSourceWotc(s),
				partnered: SourceUtil.isPartneredSourceWotc(s),
			}]));
			options = {labels, props, sources, categories: Object.entries(categories).sort((a, b) => b[0].length - a[0].length)};
			return options;
		};
		const href = (link, doc) => {
			const targetPage = UrlUtil.categoryToPage(doc?.c)?.replace(/\.html$/, "");
			const pinsEdition = ED_PAGES.includes(targetPage);
			if (!pinsEdition && !doc?._oursOutside && !doc?._target) return link;
			const url = new URL(link, location.href);
			if (pinsEdition && url.hash) url.searchParams.set("ours-search", hashEntry(url.hash));
			const extra = [doc.s, doc._target];
			if ([30, 40, 41].includes(doc.c)) {
				extra.push(UrlUtil.autoDecodeHash(url.hash.slice(1).split(",")[0], {page: UrlUtil.PG_CLASSES})?.source);
			}
			if ([30, 41].includes(doc.c)) {
				const kind = doc.c === 30 ? "classfeature" : "subclassfeature";
				url.searchParams.set("ours-feature", doc.u);
				url.searchParams.set("ours-feature-kind", kind);
				if (doc.c === 41) {
					const {subclassShortName, subclassSource, classSource, level} = UrlUtil.autoDecodeHash(doc.u, {page: kind});
					extra.push(subclassSource, classSource);
					if (subclassShortName && subclassSource && level) {
						const state = UrlUtil.getClassesPageStatePart({
							subclass: {shortName: subclassShortName, source: subclassSource},
							feature: {ixLevel: level - 1, ixFeature: 0},
						});
						url.hash = url.hash.split(",")[0] + "," + state;
					}
				}
			}
			if (targetPage === "classes" || doc._oursOutside || doc._target) {
				for (const src of new Set(extra.filter(Boolean).map(s => s.toLowerCase()))) url.searchParams.append("ours-source", src);
			}
			return url.pathname + url.search + url.hash;
		};
		const inputs = new WeakMap();
		function listUpdated (list) {
			const input = list._iptSearch;
			if (!input || !list._wrpList?.closest("#listcontainer,main") || input.matches(".omni__input")
				|| /^(?:search|dmscreen|makecards|blocklist|managebrew|lootgen)\.html$/.test(PAGE)) return;
			let state = inputs.get(input);
			if (!state) {
				state = {lists: new Set(), clock: 0, timer: null, box: null};
				inputs.set(input, state);
				input.addEventListener("input", () => {
					state.clock++;
					clearTimeout(state.timer);
					state.box?.remove();
				});
			}
			state.lists.add(list);
			clearTimeout(state.timer);
			const query = input.value.trim();
			const clock = ++state.clock;
			if (!query || [...state.lists].some(l => l.visibleItems.length || l._syntax?.reCommand && query.search(l._syntax.reCommand) >= 0)) {
				state.box?.remove();
				return;
			}
			if (query.replace(/[^\p{L}\p{N}]/gu, "").length < (/\p{Script=Han}/u.test(query) ? 3 : 4)) return;
			state.timer = setTimeout(async () => {
				const items = [], names = [];
				for (const l of state.lists) for (const item of l.items) {
					if (item.data.isExcluded) continue;
					const en = item._oursEnglish || item.values.ENG_name || item.data.entity?.ENG_name;
					names.push([items.length, item.name, en]);
					items.push({item, list: l});
				}
				if (!items.length) return;
				const results = await run("list", query, {labels: {}, sources: {}, list: names}).catch(() => []);
				if (state.clock !== clock || input.value.trim() !== query || !results.length) return;
				styles();
				const box = state.box ||= h('<aside class="ours-list-suggestions" aria-live="polite"></aside>');
				box.replaceChildren(h('<div class="ours-search-section">近似结果</div>'));
				const links = new Set();
				for (const {doc} of results) {
					const hit = items[doc.u];
					if (!hit || hit.list._fnFilter && !hit.list._fnFilter(hit.item)) continue;
					const item = hit.item;
					const link = item.ele.matches("a[href]") ? item.ele : item.ele.querySelector("a[href]");
					if (!link || links.has(link.href)) continue;
					links.add(link.href);
					const row = document.createElement("a");
					row.href = link.href;
					row.textContent = item.name;
					box.append(row);
					if (box.childElementCount === 6) break;
				}
				if (box.childElementCount > 1) (document.querySelector(".bk5-sections") || document.querySelector("#list") || list._wrpList).before(box);
			}, 30);
		}
		window.__oursSearch = {
			ready: () => !!host.__oursSearchReady,
			warm: () => { styles(); return run("warm"); },
			query: async (query, filters, aliases, pageSize = 20) => {
				styles();
				const opts = {...metadata(aliases), ...filters, mode: srcMode()};
				const fetchPage = offset => run("query", query, {...opts, window: {offset, size: pageSize}});
				const {items, total} = await fetchPage(0);
				const result = new Array(total);
				items.forEach((item, i) => result[i] = item);
				result._oursLoadPage = async offset => {
					if (offset in result) return;
					const {items: next} = await fetchPage(offset);
					next.forEach((item, i) => { if (offset + i < result.length) result[offset + i] = item; });
				};
				return result;
			},
			href,
			listUpdated,
			registerResult: doc => {
				if (doc._brew && doc.s) knownBrewSources.add(doc.s.toLowerCase());
				if (doc._otherEdition === edMode()) doc._oursOutside = true;
			},
			knowsBrew: source => knownBrewSources.has(source),
			isPinnedSubclass: (cls, sc) => isSearchSubclass(cls, sc),
			isPinnedFeature,
			jumpClassFeature: () => {
				if (!isPinnedFeature(page()?._state.feature)) return;
				const prop = SEARCH_PARAMS.get("ours-feature-kind") || "subclassfeature";
				const {name, level, subclassShortName, subclassSource} = UrlUtil.autoDecodeHash(SEARCH_FEATURE, {page: prop});
				const normalize = value => value.toLowerCase().trim().replace(/^等级\s+\d+\s*[:：]\s*/, "").replace(/[.。]$/, "");
				const wanted = normalize(name);
				const match = el => {
					const prefix = el.querySelector("[data-subclass-name-prefix]")?.textContent || "";
					const title = normalize(el.textContent.trimStart().slice(prefix.length));
					return el.offsetParent && (title === wanted || title.startsWith(wanted + " ") || title.startsWith(wanted + "（"));
				};
				const selector = prop === "classfeature" ? '[data-scroll-id^="' + (+level - 1) + '-"] .entry-title-inner'
					: `[data-subclass-id="${CSS.escape(UrlUtil.getStateKeySubclass({shortName: subclassShortName, source: subclassSource}))}"] .entry-title-inner`;
				const title = [...document.querySelectorAll("#pagecontent " + selector)].find(match);
				if (title && !title.dataset.oursSearchTarget) {
					title.dataset.oursSearchTarget = SEARCH_FEATURE;
					title.scrollIntoView({block: "center", inline: "nearest"});
				}
			},
			navigate: url => {
				if (!IN_SHELL) return false;
				tellShell({type: "ours-nav", path: url.pathname, hash: url.hash, query: url.search});
				return true;
			},
			warn: error => {
				if (warned) return;
				warned = true;
				console.warn("Search worker", error);
				toast("全站搜索暂时不可用，已切回原生搜索");
			},
		};
	}

	// ------------------------------------------------------------------ Notion-style interface (the shell decides: html.nt on the shell)
	const NT = IN_SHELL && (() => { try { return window.top.document.documentElement.classList.contains("nt"); } catch (e) { return false; } })();
	// V2 (默认) = notion.css + notion2.css + the class page rebuilt as one Notion page; V1 = notion.css only (kept for comparison)
	const NT2 = NT && (() => { try { return window.top.document.documentElement.classList.contains("nt2"); } catch (e) { return false; } })();
	// V3 = V2's page structure + notion3.css (warm paper colours) under a top navigation bar instead of the sidebar
	const NT3 = NT2 && (() => { try { return window.top.document.documentElement.classList.contains("nt3"); } catch (e) { return false; } })();
	// V4 = V3's shell and colours + the class page re-arranged (one row per class, identity strip, subclass browser, subclass features in the table)
	const NT4 = NT3 && (() => { try { return window.top.document.documentElement.classList.contains("nt4"); } catch (e) { return false; } })();
	let v4Paint = null;   // set by classPageV4; called after every V2 repaint
	// Semantic source ink remains live when the theme changes (no cached day RGB).
	function srcColor (cls) {
		if (!NT3 || !cls) return "";
		const src = cls.replace(/^ve-source__/, "");
		const kind = /^Ours/i.test(src) ? "ours" : TIER[src] ? "3p" : /^UA/i.test(src) ? "ua" : ["XPHB", "XDMG", "XMM"].includes(src) ? "off24" : "off14";
		return `var(--v3-k-${kind})`;
	}
	const srcAttr = cls => { const c = srcColor(cls); return c ? ` style="--src:${c}"` : ""; };
	if (!NT) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = "/__ours/theme.css";
		document.head.append(link);
		const images = document.createElement("link");
		images.rel = "stylesheet"; images.href = "/__ours/imageload.css";
		document.head.append(images);
	}
	if (NT) {
		document.documentElement.classList.add("nt");
		if (NT2) document.documentElement.classList.add("nt2");
		if (NT3) document.documentElement.classList.add("nt3");
		if (NT4) document.documentElement.classList.add("nt4");
		const sheets = NT4 ? ["/__ours/notion.css", "/__ours/notion2.css", "/__ours/notion3.css", "/__ours/notion4.css", "/__ours/theme.css"] : NT3 ? ["/__ours/notion.css", "/__ours/notion2.css", "/__ours/notion3.css", "/__ours/theme.css"] : NT2 ? ["/__ours/notion.css", "/__ours/notion2.css", "/__ours/theme.css"] : ["/__ours/notion.css", "/__ours/theme.css"];
		sheets.push("/__ours/imageload.css");
		let told = false, left = sheets.length;
		const styled = () => { if (!told) { told = true; tellShell({type: "ours-styled"}); } };
		sheets.forEach(href => {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.onload = link.onerror = () => { if (--left <= 0) styled(); };
			document.head.appendChild(link);
		});
		setTimeout(styled, 1500);
	}
	// class page: the site's flex utility classes are "!important" inside its CSS layer, so the grid layout needs them off
	function notionClassLayout () {
		const m = document.querySelector("main.classes");
		if (!m) return;
		const rows = m.querySelectorAll(":scope > .row");
		if (rows[0]) { rows[0].classList.remove("ve-flex"); rows[0].classList.add("nt-row1"); }
		m.querySelectorAll(":scope > .row > .ve-px-4").forEach(e => e.classList.remove("ve-px-4"));
		["listcontainer", "classtable"].forEach(id => document.getElementById(id)?.classList.remove("ve-col-3", "ve-col-9"));
		const r2 = rows[1];
		if (r2) {
			r2.querySelector(":scope > .ve-col-3")?.classList.replace("ve-col-3", "nt-side");
			r2.querySelector(":scope > .ve-col-9")?.classList.replace("ve-col-9", "nt-body");
		}
	}
	// ------------------------------------------------------------------ V2 class page: one Notion page
	// 页头（职业名 + 属性）→ 成长表 → 子职（按来源分组）→ 职业特性（正文一栏 + 右侧目录）。
	// Only existing elements are moved (their ids, handlers and the site's rendering stay the same); nothing in the rules is rewritten.
	function notionClassPageV2 () {
		const m = document.querySelector("main.classes");
		if (!m || m.querySelector(".ntc")) return;
		const $ = id => document.getElementById(id);
		const list = $("listcontainer"), table = $("classtable"), props = $("statsprof"), toc = $("sticky-nav"), tabs = $("subclasstabs"), text = $("pagecontent");
		const readBtns = m.querySelector(".wrp-btn-readmode");
		if (!list || !table || !props || !tabs || !text) return;
		list.classList.remove("ve-col-3", "ve-px-4");
		table.classList.remove("ve-col-9", "ve-px-4");
		const wrap = h(`<div class="ntc">
			<header class="ntc-head">
				<div class="ntc-head__row"><h1 class="ntc-title"><span class="ntc-title__zh"></span><span class="ntc-title__en"></span></h1><div class="ntc-actions"></div></div>
				<div class="ntc-props"></div>
			</header>
			<section class="ntc-sec ntc-sec--table"><div class="ntc-sec__head"><h2 class="ntc-h">成长表</h2></div></section>
			<section class="ntc-sec ntc-sec--more"><div class="ntc-props ntc-props--more"></div></section>
			<section class="ntc-sec ntc-sec--sub"><div class="ntc-sec__head"><h2 class="ntc-h">子职</h2><span class="ntc-count"></span></div></section>
			<section class="ntc-sec ntc-sec--body"><div class="ntc-sec__head"><h2 class="ntc-h">职业特性</h2><div class="ntc-views"></div></div>
				<div class="ntc-read"><div class="ntc-text"></div><aside class="ntc-toc"></aside></div></section>
			<div class="ntc-hidden"></div>
		</div>`);
		m.prepend(list);
		m.append(wrap);
		wrap.querySelector(".ntc-sec--table").append(table);
		wrap.querySelector(".ntc-sec--sub").append(tabs);
		wrap.querySelector(".ntc-text").append(text);
		if (toc) wrap.querySelector(".ntc-toc").append(toc);
		if (readBtns) wrap.querySelector(".ntc-actions").append(readBtns);
		wrap.querySelector(".ntc-hidden").append(props);   // the site keeps rendering into it; the header shows a copy
		m.classList.add("ntc-on");
		m.querySelectorAll(":scope > .row, :scope > hr").forEach(r => r.classList.add("ve-hidden"));   // emptied; the site's flex class is !important, its own hidden class wins

		const abvOf = src => { try { return Parser.sourceJsonToAbv(src); } catch (e) { return src; } };
		const fullOf = src => { try { return Parser.sourceJsonToFull(src); } catch (e) { return src; } };
		const clsOf = src => { try { return Parser.sourceJsonToSourceClassname(src); } catch (e) { return "ve-source__" + src; } };
		// playtest: UA… sources only. AU is 启封奥秘 (Arcana Unleashed), a published book, not Unearthed Arcana.
		const isPlaytest = src => /^UA/i.test(src) || /破解奥秘|Unearthed Arcana/i.test(fullOf(src));
		const kindOf = src => /^Ours/i.test(src) ? "ours" : TIER[src] ? "3p" : isPlaytest(src) ? "ua" : "off";
		const KIND = {ours: "我们的扩充", "3p": "第三方", ua: "测试版", off: "官方"};

		// ---- header: title + properties (copied from the side panel the site renders)
		const head = wrap.querySelector(".ntc-head");
		const paintHead = () => {
			const name = props.querySelector(".cls-side__name")?.textContent.trim() || "";
			const mm = name.match(/^(.*?[^\x00-\x7f])\s*([A-Za-z].*)?$/) || [name, name, ""];
			head.querySelector(".ntc-title__zh").textContent = mm[1] || name;
			head.querySelector(".ntc-title__en").textContent = mm[2] || "";
			const src = props.querySelector("[data-source]")?.dataset.source || "";
			const cls = page()?.activeClass;
			const newEd = cls ? isNew(cls) : /'24$/.test(abvOf(src));
			const kind = kindOf(src);
			const rows = [];
			const add = (label, node, wide, more) => rows.push({label, node, wide, more});   // more = shown in the block under the table
			const valueOf = (el, b) => {
				const v = document.createElement("div");
				let n = b.nextSibling;
				while (n) { v.append(n.cloneNode(true)); n = n.nextSibling; }
				return v;
			};
			props.querySelectorAll(".cls-side__section").forEach(sec => {
				const h5 = sec.querySelector(":scope > h5");
				if (!h5) {   // 来源 line
					const b = sec.querySelector(":scope > b");
					if (b && /来源/.test(b.textContent)) {
						const v = valueOf(sec, b);
						v.insertAdjacentHTML("afterbegin", `<span class="nt-tag nt-tag--${kind === "off" ? (newEd ? "24" : "14") : kind}"${srcAttr(clsOf(src))}>${esc(abvOf(src))}</span><span class="ntc-src-full">${esc(fullOf(src))}</span><span class="ntc-src-sep"> · </span>`);
						v.querySelector(":scope > i")?.remove();
						const tagOnly = document.createElement("div");
						tagOnly.innerHTML = `<span class="nt-tag nt-tag--${kind === "off" ? (newEd ? "24" : "14") : kind}"${srcAttr(clsOf(src))}>${esc(abvOf(src))}</span><span class="ntc-src-full">${esc(fullOf(src))}</span>`;
						rows.splice(0, 0, {label: "来源", node: tagOnly, wide: false});
						for (const n of [...v.childNodes]) { if (n.nodeType === 3 && /^\s*[,，]\s*/.test(n.textContent)) { n.textContent = n.textContent.replace(/^\s*[,，]\s*/, ""); break; } }
						add("出处", v, true, true);
					}
					return;
				}
				if (/核心|Core/i.test(h5.textContent)) {
					sec.querySelectorAll(":scope > div, :scope > .ve-rd__b > p").forEach(line => {
						const b = line.querySelector(":scope > b, :scope > strong");
						if (!b) return;
						const label = b.textContent.replace(/[:：]\s*$/, "").trim();
						const v = valueOf(line, b);
						add(label, v, v.textContent.trim().length > 34, /起始装备|Starting Equipment/i.test(label));
					});
					return;
				}
				// any other section (兼职、施法…): one property, its own text as the value
				const v = document.createElement("div");
				[...sec.childNodes].forEach(n => { if (n !== h5) v.append(n.cloneNode(true)); });
				add(h5.textContent.trim(), v, true, true);
			});
			const ed = document.createElement("div");
			ed.innerHTML = kind === "off" || kind === "ua"
				? `<span class="nt-tag nt-tag--${newEd ? "24" : "14"}">${newEd ? "2024 规则（5.5e）" : "2014 规则（5e）"}</span>`
				: `<span class="nt-tag nt-tag--${kind}">${KIND[kind]}</span>`;
			const srcAt = rows.findIndex(r => r.label === "来源");
			rows.splice(srcAt + 1, 0, {label: kind === "off" || kind === "ua" ? "规则版本" : "类别", node: ed, wide: false});
			const box = head.querySelector(".ntc-props");
			const more = wrap.querySelector(".ntc-props--more");
			box.textContent = "";
			more.textContent = "";
			rows.forEach(r => {
				const row = h(`<div class="ntc-prop${r.wide ? " ntc-prop--wide" : ""}"><div class="ntc-prop__k"></div><div class="ntc-prop__v"></div></div>`);
				row.querySelector(".ntc-prop__k").textContent = r.label;
				row.querySelector(".ntc-prop__k").title = r.label;
				row.querySelector(".ntc-prop__v").append(...r.node.childNodes);
				(r.more ? more : box).append(row);
			});
		};

		// ---- subclasses: grouped by kind of source (official new / official old / ours / third party / playtest), the site's buttons untouched
		const subWrap = wrap.querySelector(".ntc-sec--sub");
		// third-party classes: features the book's level table lists again at later levels (no entry of their own). Display only.
		const paintLevelFeatures = () => {
			const cls = page()?.activeClass, extra = cls?.oursLevelFeatures, tbl = table.querySelector(".ve-cls-tbl");
			if (!extra || !tbl) return;
			const key = `${cls.name}|${cls.source}`;
			if (tbl.dataset.oursLv === key) return;
			tbl.dataset.oursLv = key;
			const rows = [...tbl.rows].map(tr => ({level: parseInt(tr.querySelector(":scope > td.ve-cls-tbl__col-level")?.textContent, 10), cell: tr.children[2]})).filter(r => r.level && r.cell);
			const native = new Map();
			rows.forEach(r => r.cell.querySelectorAll("a").forEach(a => { if (!native.has(a.textContent)) native.set(a.textContent, a); }));
			rows.forEach(({level, cell}) => {
				const names = extra[level];
				if (!names?.length) return;
				let hasItem = !!cell.querySelector("a");
				if (!hasItem) [...cell.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
				const before = cell.querySelector(".n4-scfs");
				names.forEach(name => {
					const item = h(`<div class="ve-inline-block ours-lvfeat"></div>`);
					if (hasItem) item.append(h(`<span class="ve-mr-1">,</span>`));
					const target = native.get(name);
					const label = document.createElement(target ? "a" : "span");
					label.textContent = name;
					if (target) { label.href = target.getAttribute("href") || "#"; label.addEventListener("click", e => { e.preventDefault(); target.click(); }); }
					item.append(label); cell.insertBefore(item, before);
					hasItem = true;
				});
			});
		};
		const paintSubs = () => {
			const flex = tabs.querySelector(":scope > .ve-flex-wrap");
			const views = tabs.querySelector(":scope > .ve-btn-group:first-child");
			if (views && !views.closest(".ntc-views")) { const vw = wrap.querySelector(".ntc-views"); vw.textContent = ""; vw.append(views); }   // the site re-creates them per class: keep only the live ones
			table.querySelector(".ve-cls-tbl.ve-w-100")?.classList.remove("ve-w-100");   // a Notion table is as wide as its columns
			if (!flex) return;
			const cls = page()?.activeClass;
			const byKey = new Map();
			(cls?.subclasses || []).forEach(sc => byKey.set(`${sc.shortName}|${abvOf(sc.source)}`, sc));
			const clsNew = cls ? isNew(cls) : true;
			const ORDER = clsNew ? ["off24", "off14", "ours", "3p"] : ["off14", "off24", "ours", "3p"];
			const NAME = {off24: "官方 · 2024", off14: "官方 · 2014", ours: "我们的扩充", "3p": "第三方"};
			const count = {};
			let shown = 0;
			flex.querySelectorAll(":scope > .ve-btn").forEach((b, i) => {
				const nm = b.querySelector(":scope > div:first-child")?.textContent.trim();
				const abv = (b.querySelector(":scope > .ve-ml-1")?.textContent || "").trim().replace(/^\(|\)$/g, "");
				const sc = byKey.get(`${nm}|${abv}`);
				let g = "3p";
				if (sc) {
					const k = kindOf(sc.source);
					g = k === "off" || k === "ua" ? (isNew(sc) ? "off24" : "off14") : k;   // official playtest stays with its edition; its UA tag still shows
				}
				b.dataset.ntg = g;
				b.__sc = sc || null;
				b.style.order = String(ORDER.indexOf(g) * 1000 + 10 + i);
				// V4 keeps most buttons out of the row (class n4-off) without them being filtered out
				if (!b.classList.contains("ve-hidden") && (b.offsetParent !== null || b.classList.contains("n4-off"))) { count[g] = (count[g] || 0) + 1; shown++; }
			});
			ORDER.forEach((g, gi) => {
				let lab = flex.querySelector(`:scope > .ntc-scg[data-g="${g}"]`);
				if (!lab) { lab = h(`<div class="ntc-scg" data-g="${g}"><span class="ntc-scg__n"></span></div>`); lab.prepend(NAME[g]); flex.append(lab); }
				lab.style.order = String(gi * 1000);
				lab.classList.toggle("ntc-scg--empty", !count[g]);
				const n = lab.querySelector(".ntc-scg__n");
				const t = String(count[g] || 0);
				if (n.textContent !== t) n.textContent = t;
			});
			[...flex.children].forEach(c => { if (!c.classList.contains("ve-btn") && !c.classList.contains("ntc-scg")) c.style.order = "99999"; });
			const c = subWrap.querySelector(".ntc-count");
			const t = `${shown} 个`;
			if (c.textContent !== t) c.textContent = t;
		};

		let queued = false;
		// a timer, not requestAnimationFrame: pages preloaded in the background get no animation frames
		const paintObservers = [];
		const later = () => {
			if (queued) return;
			queued = true;
			setTimeout(() => {
				queued = false;
				try { paintHead(); paintSubs(); paintLevelFeatures(); paintIdleSubclassLevels(); v4Paint?.(); } catch (e) { console.warn("ours V2", e); }
				// Native changes were delivered before this timer ran, so whatever is queued now is our own painting.
				// Reacting to it would repaint forever (classList writes count as changes even when nothing differs).
				paintObservers.forEach(o => o.takeRecords());
			}, 30);
		};
		const propsObserver = new MutationObserver(later);
		propsObserver.observe(props, {childList: true, subtree: true, characterData: true});
		new MutationObserver(() => { table.querySelector(".ve-cls-tbl.ve-w-100")?.classList.remove("ve-w-100"); paintLevelFeatures(); }).observe(table, {childList: true, subtree: true});
		const tabsObserver = new MutationObserver(muts => { if (muts.some(x => !(x.target.classList?.contains("ntc-scg") || x.target.closest?.(".ntc-scg")))) later(); });
		tabsObserver.observe(tabs, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]});
		paintObservers.push(propsObserver, tabsObserver);
		window.addEventListener("hashchange", later);
		later();
	}

	// ------------------------------------------------------------------ V4 class page (on top of the V2 structure)
	// Layout only: the native title, edition controls, read buttons and subclass
	// buttons keep their DOM order, node identity and delegated/native handlers.
	function bookClassArtLayout (head) {
		const section = head.parentElement?.querySelector(".ntc-sec--table"), table = section?.querySelector(".ve-cls-tbl"), row = head.querySelector(".ntc-head__row");
		if (!section || !table || !row) return;
		// Nine-ring full casters need compact number columns. Half casters retain
		// the approved table spacing, including the width added by subclass chips.
		const header = [...table.rows].find(r => r.querySelector("th.ve-cls-tbl__col-level"));
		const slots = header ? [...header.cells].flatMap((c, i) => /^[1-9一二三四五六七八九](?:环|st|nd|rd|th)?$/.test(c.textContent.trim()) ? [i] : []) : [];
		table.classList.toggle("bk-full-caster", slots.length === 9);
		table.classList.toggle("bk-half-caster", slots.length === 5);
		if (slots.length === 9) [...table.rows].filter(r => r.cells.length === header.cells.length).forEach(r => slots.forEach(i => r.cells[i].classList.toggle("bk-slot-col", true)));
		if (!head._bkArtObserver) {
			head._bkArtObserver = new ResizeObserver(() => {
				clearTimeout(head._bkLayoutTimer);
				head._bkLayoutTimer = setTimeout(() => bookClassArtLayout(head), 0);
			});
			head._bkArtObserver.observe(section);
		}
		if (head._bkObservedTable !== table) {
			if (head._bkObservedTable) head._bkArtObserver.unobserve(head._bkObservedTable);
			head._bkArtObserver.observe(table); head._bkObservedTable = table;
		}
		const art = head._bkClassArt;
		if (!art) { row.classList.remove("bk-class-avatar-row"); head.dataset.artMode = "none"; section.style.minHeight = ""; return; }
		const s = section.getBoundingClientRect(), t = table.getBoundingClientRect(), available = s.right - t.right - 24;
		if (innerWidth >= 900 && available >= 200) {
			const width = Math.min(340, Math.floor(available));
			if (art.parentElement !== section) section.append(art);
			art.dataset.layout = "side"; head.dataset.artMode = "side"; row.classList.remove("bk-class-avatar-row");
			Object.assign(art.style, {left: `${t.right - s.left + 24}px`, top: `${t.top - s.top}px`, width: `${width}px`});
			const artHeight = width / (art._bkRatio || .75);
			section.style.minHeight = artHeight > t.height ? `${Math.ceil(artHeight + t.top - s.top)}px` : "";
		} else {
			if (art.parentElement !== row) row.append(art);
			art.dataset.layout = "avatar"; head.dataset.artMode = "avatar"; row.classList.add("bk-class-avatar-row");
			Object.assign(art.style, {left: "0px", top: "7px", width: "60px"}); section.style.minHeight = "";
		}
	}

	function bookClassHeader (head, subSec, cur) {
		const row = head.querySelector(".ntc-head__row"), facts = head.querySelector(".n4-facts");
		if (!row?.querySelector(".ntc-title") || !row.querySelector(".n4-ed") || !row.querySelector(".ntc-actions") || !facts || !head.querySelector(".ntc-props")) {
			head.dataset.bkFallback = "未识别职业页头结构";
			head.classList.remove("bk-hero"); facts?.classList.remove("bk-facts"); subSec.classList.remove("bk-subs");
			head._bkClassArt?.remove(); head._bkClassArt = null; row?.classList.remove("bk-class-avatar-row"); delete head.dataset.artClass; head._bkArtRequest = null;
			return;
		}
		delete head.dataset.bkFallback;
		head.classList.add("bk-hero"); facts.classList.add("bk-facts"); subSec.classList.add("bk-subs");
		facts.querySelectorAll(".n4-fact").forEach((field, i) => {
			if (field.querySelector(".bk-fact-value")) return;
			const label = field.querySelector("i"), value = document.createElement("span");
			value.className = "bk-fact-value"; if (!i && label?.textContent === "生命骰") field.classList.add("bk-hit-die");
			while (label?.nextSibling) value.append(label.nextSibling);
			field.append(value);
		});
		const key = cur.name + "|" + cur.source;
		if (head.dataset.artClass === key) { bookClassArtLayout(head); return; }
		head.dataset.artClass = key;
		const request = head._bkArtRequest = {};
		head._bkClassImage?.cancel(); head._bkClassImage = null;
		head._bkClassArt?.remove(); head._bkClassArt = null;
		head.dataset.artState = "pending";
		// The picture never takes space from the native table or increases the hero.
		const makeArt = () => {
			const art = document.createElement("figure"); art.className = "bk-class-art";
			art.dataset.kind = "loading"; art.dataset.edition = isNew(cur) ? "24" : "14";
			head._bkClassArt = art; head.append(art); bookClassArtLayout(head); return art;
		};
		let art = cur.hasFluffImages || cur.fluff?.images?.length ? makeArt() : null;
		bookClassArtLayout(head);
		void (async () => {
			let entry, url;
			try { entry = (await Renderer.class.pGetFluff(cur))?.images?.[0]; if (entry) url = Renderer.utils.getEntryMediaUrl(entry, "href", "img"); } catch (e) { /* no available fluff */ }
			const active = page()?.activeClass;
			if (!head.isConnected || head._bkArtRequest !== request || !active || active.name + "|" + active.source !== key) return;
			if (!url) { art?.remove(); head._bkClassArt = null; head.dataset.artState = "none"; bookClassArtLayout(head); return; }
			art ||= makeArt(); head.dataset.artState = "loading";
			if (entry.width && entry.height) { art._bkRatio = entry.width / entry.height; art.style.setProperty("--bk-art-ratio", `${entry.width} / ${entry.height}`); }
			art.tabIndex = 0; art.setAttribute("role", "button"); art.title = "查看大图"; art.setAttribute("aria-label", `${cur.name}：查看大图`);
			const img = document.createElement("img"); img.alt = `${cur.name} 插图`; img.loading = "lazy"; img.decoding = "async";
			if (entry.width && entry.height) { img.width = entry.width; img.height = entry.height; }
			// Address-keyed exceptions only; never infer a crop from class/rule data.
			const focus = BOOK_CLASS_ART_FOCUS[new URL(url, location.href).pathname.replace(/^.*\/img\//, "img/")];
			if (focus) {
				art.style.setProperty("--bk-avatar-x", `${focus[0]}%`);
				art.style.setProperty("--bk-avatar-y", `${focus[1]}%`);
				art.style.setProperty("--bk-avatar-zoom", focus[2] || 3);
			}
			const open = () => {
				if (!img.naturalWidth || !img.isConnected) return;
				imagePreview(img, art, cur.name, "bk-class-image");
			};
			art.addEventListener("click", open);
			art.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
			bookClassArtLayout(head);
			head._bkClassImage = imageSlot(img, art, {
				src: url, valid: () => art.isConnected && head._bkArtRequest === request,
				onReady: () => { art._bkRatio = img.naturalWidth / img.naturalHeight; art.style.setProperty("--bk-art-ratio", `${img.naturalWidth} / ${img.naturalHeight}`); art.dataset.kind = "image"; head.dataset.artState = "image"; bookClassArtLayout(head); },
				onError: () => { art.dataset.kind = "placeholder"; head.dataset.artState = "placeholder"; },
			});
		})();
	}
	const BOOK_CLASS_ART_FOCUS = {
		// Face centres in the original image (x%, y%, optional magnification).
		// Used only by the small avatar; the illustration alongside the table is whole.
		"img/classes/TCE/Artificer.webp": [68, 48, 4],
		"img/classes/TCE/Expert%20Sidekick.webp": [80, 29, 4],
		"img/classes/EFA/Artificer.webp": [42, 38],
		"img/classes/PHB/Barbarian.webp": [65, 17],
		"img/classes/XPHB/Barbarian.webp": [50, 20],
		"img/classes/PHB/Bard.webp": [35, 16],
		"img/classes/XPHB/Bard.webp": [35, 15],
		"img/classes/PHB/Cleric.webp": [63, 44],
		"img/classes/XPHB/Cleric.webp": [55, 36],
		"img/classes/PHB/Druid.webp": [63, 28],
		"img/classes/XPHB/Druid.webp": [50, 35],
		"img/classes/PHB/Fighter.webp": [45, 22],
		"img/classes/XPHB/Fighter.webp": [47, 38],
		"img/classes/PHB/Monk.webp": [48, 35],
		"img/classes/XPHB/Monk.webp": [40, 26],
		"img/classes/PHB/Paladin.webp": [52, 29],
		"img/classes/XPHB/Paladin.webp": [47, 22],
		"img/classes/PHB/Ranger.webp": [37, 26],
		"img/classes/XPHB/Ranger.webp": [50, 24],
		"img/classes/PHB/Rogue.webp": [76, 29],
		"img/classes/XPHB/Rogue.webp": [45, 33],
		"img/classes/PHB/Sorcerer.webp": [44, 23],
		"img/classes/XPHB/Sorcerer.webp": [45, 13],
		"img/classes/PHB/Warlock.webp": [60, 39],
		"img/classes/XPHB/Warlock.webp": [65, 48],
		"img/classes/PHB/Wizard.webp": [68, 25],
		"img/classes/XPHB/Wizard.webp": [50, 19],
	};

	// 1 列表：每个核心职业一行（2014/2024 两版并成一行，页头切换版本），其他职业在另一个标签页
	// 2 页头：一行身份条（名字 · 版本 · 生命骰/主属性/豁免/护甲），完整属性点「详情」展开
	// 3 子职业：一行只放本版官方子职和已选中的，其余在「浏览全部」面板里（可搜索、按来源分组、每个带一句简介）
	// 4 成长表：选中的子职把它的能力写进对应等级
	// The site's own buttons, state and rendering stay in charge; this only chooses what is shown where.
	function classPageV4 () {
		const m = document.querySelector("main.classes");
		const wrap = m?.querySelector(".ntc");
		if (!wrap || wrap.dataset.v4) return;
		wrap.dataset.v4 = "1";
		const $ = id => document.getElementById(id);
		const tabs = $("subclasstabs"), table = $("classtable"), listEl = $("list");
		const head = wrap.querySelector(".ntc-head"), subSec = wrap.querySelector(".ntc-sec--sub"), tableSec = wrap.querySelector(".ntc-sec--table");
		const abvOf = src => { try { return Parser.sourceJsonToAbv(src); } catch (e) { return src; } };
		const clsOf = src => { try { return Parser.sourceJsonToSourceClassname(src); } catch (e) { return "ve-source__" + src; } };
		const fullOf = src => { try { return Parser.sourceJsonToFull(src); } catch (e) { return src; } };
		const isPlaytest = src => /^UA/i.test(src) || /破解奥秘|Unearthed Arcana/i.test(fullOf(src));
		const kindOf = src => /^Ours/i.test(src) ? "ours" : TIER[src] ? "3p" : isPlaytest(src) ? "ua" : "off";
		const groupOf = sc => { const k = kindOf(sc.source); return k === "off" || k === "ua" ? (isNew(sc) ? "off24" : "off14") : k; };
		const GNAME = {off24: "官方 · 2024", off14: "官方 · 2014", ours: "我们的扩充", "3p": "第三方"};
		const stateKey = sc => UrlUtil.getStateKeySubclass(sc);
		const isOn = sc => { try { return !!page()._state[stateKey(sc)]; } catch (e) { return false; } };
		const setSubs = obj => { try { page()._proxyAssign("state", "_state", "__state", obj); } catch (e) { console.warn("ours V4", e); } };

		// ---- page order: 身份条 → 子职业 → 成长表 → 其余
		tableSec.before(subSec);
		subSec.querySelector(".ntc-h").textContent = "子职业";
		const row = head.querySelector(".ntc-head__row");
		const edBox = h(`<div class="n4-ed"></div>`), facts = h(`<div class="n4-facts"></div>`);
		row.querySelector(".ntc-title").after(edBox, facts);
		const browse = h(`<button type="button" class="n4-browse" aria-haspopup="dialog" aria-expanded="false"><span class="n4-browse__t">浏览全部</span><span class="n4-browse__n"></span><span class="n4-caret" aria-hidden="true"></span></button>`);
		const pop = h(`<div class="n4-pop" role="dialog" aria-label="浏览子职业" hidden>
			<div class="n4-pop__bar"><input type="search" class="n4-pop__q" placeholder="搜索子职业、来源…" autocomplete="off" spellcheck="false"><div class="n4-kinds"></div><button type="button" class="n4-pop__btn" data-act="clear">清除选择</button><button type="button" class="n4-pop__btn" data-act="close">收起</button></div>
			<div class="n4-pop__list"></div>
			<div class="n4-pop__foot"></div>
		</div>`);
		subSec.append(browse, pop);

		// ---- 1 class list: two tabs, one row per class
		const listBox = $("listcontainer");
		const ltabs = h(`<div class="n4-ltabs" role="tablist"><button type="button" data-g="core" role="tab">核心职业<span></span></button><button type="button" data-g="other" role="tab">其他职业<span></span></button></div>`);
		($("filtertools") || listEl)?.before(ltabs);
		$("filtertools")?.classList.add("ve-hidden");   // one order only (规则书顺序): the two sort buttons were noise
		let lgroup = "core", lgroupFor = "";
		const twins = new Map();   // "name|source" of a listed core class -> its other-edition twin, when both are in the list
		const search = $("lst__search");
		const paintList = () => {
			const p = page();
			if (!p?._list || !listEl) return;
			const vis = p._list.visibleItems || [];
			const cur = p.activeClass;
			const pref = edMode() || lsGet("ours.clsEd", "24");   // the top switch (5e / 5.5e) decides when it is set
			const byName = new Map();
			vis.forEach(it => {
				const el = it.ele, ent = it.data?.entity;
				if (!el || !ent) return;
				el.classList.remove("n4-twin", "n4-merged");
				if (el.classList.contains("n4-h")) el.classList.remove("n4-h", "ve-hidden");
				if (!el.classList.contains("ve-ours-cls-off")) return;
				if (!byName.has(ent.name)) byName.set(ent.name, []);
				byName.get(ent.name).push({el, ent});
			});
			twins.clear();
			byName.forEach(g => {
				if (g.length < 2) return;
				const keep = g.find(x => cur && x.ent.name === cur.name && x.ent.source === cur.source) || g.find(x => isNew(x.ent) === (pref === "24")) || g[0];
				g.forEach(x => { x.el.classList.add(x === keep ? "n4-merged" : "n4-twin"); twins.set(x.ent.name + "|" + x.ent.source, g.find(y => y !== x && isNew(y.ent) !== isNew(x.ent))?.ent || null); });
			});
			let core = 0, other = 0;
			vis.forEach(it => { const el = it.ele; if (!el || el.classList.contains("n4-twin")) return; if (el.classList.contains("ve-ours-cls-off")) core++; else other++; });
			// follow the class on screen into its tab (once per class, so the tabs stay yours to click)
			const curKey = cur ? cur.name + "|" + cur.source : "";
			if (curKey && curKey !== lgroupFor) {
				lgroupFor = curKey;
				const curEl = vis.find(it => it.data?.entity?.name === cur.name && it.data?.entity?.source === cur.source)?.ele;
				if (curEl) lgroup = curEl.classList.contains("ve-ours-cls-off") ? "core" : "other";
			}
			if (lgroup === "core" && !core && other) lgroup = "other";
			const searching = !!search?.value.trim();
			listEl.classList.toggle("n4-g-core", lgroup === "core");
			listEl.classList.toggle("n4-g-other", lgroup === "other");
			listEl.classList.toggle("n4-searching", searching);
			// hidden with the site's own class: its display utilities are "!important" inside a CSS layer, which beats any rule of ours
			vis.forEach(it => {
				const el = it.ele;
				if (!el) return;
				const core = el.classList.contains("ve-ours-cls-off");
				if (el.classList.contains("n4-twin") || (!searching && core !== (lgroup === "core"))) el.classList.add("n4-h", "ve-hidden");
			});
			ltabs.querySelectorAll("button").forEach(b => {
				const on = b.dataset.g === lgroup;
				b.classList.toggle("on", on);
				b.setAttribute("aria-selected", on ? "true" : "false");
				const n = String(b.dataset.g === "core" ? core : other);
				if (b.lastElementChild.textContent !== n) b.lastElementChild.textContent = n;
			});
		};
		ltabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; lgroup = b.dataset.g; paintList(); listEl.scrollTop = 0; });
		search?.addEventListener("input", () => setTimeout(paintList, 0));
		if (listEl) new MutationObserver(() => paintList()).observe(listEl, {childList: true});

		// ---- 2 identity strip
		const twinOf = cur => (cur && twins.get(cur.name + "|" + cur.source)) || null;
		const propText = label => {
			const r = [...head.querySelectorAll(".ntc-props .ntc-prop")].find(x => x.querySelector(".ntc-prop__k")?.textContent.trim() === label);
			return r ? r.querySelector(".ntc-prop__v").textContent.replace(/\s+/g, " ").trim() : "";
		};
		const paintStrip = () => {
			const cur = page()?.activeClass;
			if (!cur) return;
			const twin = twinOf(cur), newEd = isNew(cur), kind = kindOf(cur.source);
			let edHtml;
			if (twin) {
				edHtml = `<div class="n4-edsw" role="group" aria-label="规则版本"><button type="button" data-ed="24" class="${newEd ? "on" : ""}" title="2024 规则（5.5e）· ${esc(fullOf((newEd ? cur : twin).source))}">2024</button><button type="button" data-ed="14" class="${newEd ? "" : "on"}" title="2014 规则（5e）· ${esc(fullOf((newEd ? twin : cur).source))}">2014</button></div>`;
			} else {
				const t = kind === "off" || kind === "ua" ? (newEd ? "24" : "14") : kind;
				const label = kind === "off" || kind === "ua" ? (newEd ? "2024 规则" : "2014 规则") : kind === "ours" ? "我们的扩充" : "第三方";
				edHtml = `<span class="nt-tag nt-tag--${t}" title="${esc(fullOf(cur.source))}">${label}</span>`;
			}
			edHtml += `<span class="nt-tag nt-tag--${kind === "off" ? (newEd ? "24" : "14") : kind}"${srcAttr(clsOf(cur.source))} title="${esc(fullOf(cur.source))}">${esc(abvOf(cur.source))}</span>`;
			if (edBox.dataset.h !== edHtml) { edBox.dataset.h = edHtml; edBox.innerHTML = edHtml; }
			const out = [];
			if (cur.hd?.faces) out.push(["生命骰", `d${cur.hd.faces}`]);
			const prim = propText("主要属性").replace(/\s*(和|或)\s*/g, "$1");
			if (prim) out.push(["主属性", prim]);
			const save = propText("豁免熟练").replace(/\s*[,，]\s*/g, "、");
			if (save) out.push(["豁免", save]);
			const armor = propText("护甲受训").replace(/\s*[,，]\s*/g, "、").replace(/、?\s*和\s*/g, "、").replace(/^、|、$/g, "");
			out.push(["护甲", armor || "无"]);
			const cast = {full: "全施法", "1/2": "半施法", "1/3": "三分之一施法", pact: "契约魔法", artificer: "半施法"}[cur.casterProgression];
			if (cast) out.push(["施法", cast]);
			const fh = out.map(([k, v]) => `<span class="n4-fact"><i>${esc(k)}</i>${esc(v.length > 26 ? v.slice(0, 25) + "…" : v)}</span>`).join("")
				+ `<button type="button" class="n4-more" aria-expanded="${head.classList.contains("n4-open")}">${head.classList.contains("n4-open") ? "收起详情" : "详情"}</button>`;
			if (facts.dataset.h !== fh) { facts.dataset.h = fh; facts.innerHTML = fh; }
			bookClassHeader(head, subSec, cur);
		};
		edBox.addEventListener("click", e => {
			const b = e.target.closest("button[data-ed]");
			if (!b || b.classList.contains("on")) return;
			const twin = twinOf(page()?.activeClass);
			if (!twin) return;
			if (!edMode()) lsSet("ours.clsEd", b.dataset.ed);
			location.hash = "#" + UrlUtil.autoEncodeHash(twin);
		});
		facts.addEventListener("click", e => {
			if (!e.target.closest(".n4-more")) return;
			head.classList.toggle("n4-open");
			facts.dataset.h = "";
			paintStrip();
		});

		// ---- 3 subclass row + browser
		const tagline = sc => {
			try {
				const first = (sc.subclassFeatures?.[0]?.[0]?.entries || []).find(e => typeof e === "string");
				if (!first) return "";
				const mm = first.match(/^\{@i ([^{}]+)\}$/);
				const t = Renderer.stripTags(mm ? mm[1] : first).replace(/\s+/g, " ").trim();
				return t.length > 44 ? t.slice(0, 43) + "…" : t;
			} catch (e) { return ""; }
		};
		const subclassEditionTag = sc => sc?._oursScEdition
			? `<span class="nt-tag nt-tag--${sc._oursScEdition.slice(2)} bk-sc-edition" title="按 ${sc._oursScEdition} 规则编写">${sc._oursScEdition}</span>`
			: "";
		let shownSubs = [], popKind = "", popSig = "";
		const paintRow = () => {
			const flex = tabs.querySelector(":scope > .ve-flex-wrap");
			const cur = page()?.activeClass;
			if (!flex || !cur) return;
			const clsOff = kindOf(cur.source) === "off", clsNew = isNew(cur);
			const btns = [...flex.querySelectorAll(":scope > .ve-btn")];
			shownSubs = [];
			let pins = 0;
			// (the site's flex utilities are "!important" in a CSS layer: off, so the row can decide what shows)
			[...tabs.children].forEach(c => { if (c !== flex && !c.classList.contains("ve-hidden")) c.classList.add("ve-hidden"); });
			flex.querySelector(".cls-tabs__sc-not-shown")?.classList.remove("ve-flex-vh-center");
			btns.forEach(b => {
				const sc = b.__sc;
				b.classList.remove("ve-flex-v-center");
				const filtered = b.classList.contains("ve-hidden");
				if (sc && !filtered) shownSubs.push({sc, b});
				const active = /cls__btn-sc--active/.test(b.className);
				let pin = false;
				if (sc && !filtered) pin = sc.source === cur.source || (clsOff && clsNew && b.dataset.ntg === "off24");
				if (pin && ++pins > 12) pin = false;
				b.classList.toggle("n4-off", !(pin || active));
				if (sc && !b.dataset.n4t) {
					b.dataset.n4t = "1";
					const t = tagline(sc), version = subclassEditionTag(sc);
					if (version) b.insertAdjacentHTML("beforeend", version);
					if (t || version) b.title = [`${sc.name} · ${abvOf(sc.source)}`, sc._oursScNote, t].filter(Boolean).join("\n");
				}
			});
			const n = String(shownSubs.length);
			const nEl = browse.querySelector(".n4-browse__n");
			if (nEl.textContent !== n + " 个") nEl.textContent = n + " 个";
			browse.classList.toggle("n4-none", !shownSubs.length);
			if (!pop.hidden) paintPop();
		};
		const paintPop = () => {
			const cur = page()?.activeClass;
			if (!cur) return;
			const q = pop.querySelector(".n4-pop__q").value.trim().toLowerCase();
			const counts = {};
			shownSubs.forEach(({sc}) => { const g = groupOf(sc); counts[g] = (counts[g] || 0) + 1; });
			const order = (isNew(cur) ? ["off24", "off14"] : ["off14", "off24"]).concat(["ours", "3p"]);
			if (popKind && !counts[popKind]) popKind = "";
			const kinds = `<button type="button" data-k="" class="${popKind ? "" : "on"}">全部<span>${shownSubs.length}</span></button>`
				+ order.filter(g => counts[g]).map(g => `<button type="button" data-k="${g}" data-g="${g}" class="${popKind === g ? "on" : ""}">${GNAME[g]}<span>${counts[g]}</span></button>`).join("");
			let hits = 0;
			const body = order.map(g => {
				if (popKind && popKind !== g) return "";
				const cards = shownSubs.map((x, i) => [x, i]).filter(([x]) => groupOf(x.sc) === g).filter(([{sc}]) => !q || `${sc.name} ${sc.shortName} ${sc.ENG_name || ""} ${abvOf(sc.source)} ${fullOf(sc.source)}`.toLowerCase().includes(q));
				if (!cards.length) return "";
				hits += cards.length;
				return `<div class="n4-g" data-g="${g}"><div class="n4-g__h">${GNAME[g]}<span>${cards.length}</span></div><div class="n4-cards">${cards.map(([{sc}, i]) => {
					const on = isOn(sc), t = tagline(sc);
					return `<div class="n4-card${on ? " on" : ""}" data-i="${i}" data-g="${g}" role="button" tabindex="0" aria-pressed="${on}" title="${esc(sc.name)} · ${esc(fullOf(sc.source))}">
						<span class="n4-card__n">${esc(sc.name)}${sc.ENG_name ? `<small>${esc(sc.ENG_name)}</small>` : ""}</span>
						${(() => {
							const src = `<span class="nt-tag nt-tag--${g === "off24" ? "24" : g === "off14" ? "14" : g}"${srcAttr(clsOf(sc.source))}>${esc(abvOf(sc.source))}</span>`;
							const version = subclassEditionTag(sc);
							return version ? `<span class="n4-card__tags">${version}${src}</span>` : src;
						})()}
						<span class="n4-card__t">${esc(t)}</span>
						<button type="button" class="n4-card__add" title="${on ? "不再显示这个子职" : "同时显示这个子职（多选，用来对比）"}" aria-label="${on ? "取消" : "同时显示"} ${esc(sc.name)}">${on ? "－" : "＋"}</button>
					</div>`;
				}).join("")}</div></div>`;
			}).join("");
			const total = (cur.subclasses || []).length, away = total - shownSubs.length;
			const sig = kinds + body;
			if (sig !== popSig) {
				popSig = sig;
				pop.querySelector(".n4-kinds").innerHTML = kinds;
				pop.querySelector(".n4-pop__list").innerHTML = hits ? body : `<div class="n4-empty">没有名字或来源里带“${esc(q)}”的子职业。换个词，或者点上面的“全部”。</div>`;
			}
			pop.querySelector(".n4-pop__foot").textContent = "点一个子职业 = 只看它；点右边的 ＋ = 同时显示多个，方便对比。"
				+ (away > 0 ? `另有 ${away} 个没有列出：被顶部的资料范围或版本开关收起了。` : "");
		};
		const openPop = open => {
			pop.hidden = !open;
			browse.setAttribute("aria-expanded", open ? "true" : "false");
			browse.classList.toggle("on", open);
			if (open) { popSig = ""; paintPop(); const q = pop.querySelector(".n4-pop__q"); q.value = ""; paintPop(); setTimeout(() => q.focus(), 0); }
		};
		browse.addEventListener("click", e => { e.stopPropagation(); openPop(pop.hidden); });
		pop.addEventListener("input", e => { if (e.target.classList.contains("n4-pop__q")) paintPop(); });
		const pick = (card, add) => {
			const x = shownSubs[+card.dataset.i];
			const cur = page()?.activeClass;
			if (!x || !cur) return;
			if (add) { setSubs({[stateKey(x.sc)]: !isOn(x.sc)}); return; }
			const onlyThis = isOn(x.sc) && (cur.subclasses || []).filter(isOn).length === 1;
			const next = {};
			(cur.subclasses || []).forEach(sc => { next[stateKey(sc)] = false; });
			if (!onlyThis) next[stateKey(x.sc)] = true;
			setSubs(next);
			openPop(false);
		};
		pop.addEventListener("click", e => {
			e.stopPropagation();
			const k = e.target.closest(".n4-kinds button");
			if (k) { popKind = k.dataset.k; paintPop(); return; }
			const act = e.target.closest(".n4-pop__btn")?.dataset.act;
			if (act === "close") return openPop(false);
			if (act === "clear") { const next = {}; (page()?.activeClass?.subclasses || []).forEach(sc => { next[stateKey(sc)] = false; }); setSubs(next); return; }
			const card = e.target.closest(".n4-card");
			if (card) pick(card, !!e.target.closest(".n4-card__add") || e.ctrlKey || e.metaKey || e.shiftKey);
		});
		pop.addEventListener("keydown", e => {
			if (e.key === "Escape") { openPop(false); browse.focus(); }
			if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("n4-card")) { e.preventDefault(); pick(e.target, e.shiftKey); }
		});
		document.addEventListener("click", e => { if (!pop.hidden && !e.target.closest(".n4-pop, .n4-browse")) openPop(false); });

		// ---- 4 the chosen subclasses' features, written into the table at their levels
		const paintTable = () => {
			const cur = page()?.activeClass;
			const tbl = table.querySelector("table");
			if (!cur || !tbl) return;
			tbl.querySelectorAll("th").forEach(th => {   // the site's data mixes "1环" and "5th"
				const el = th.childElementCount === 1 && th.firstElementChild.tagName === "A" ? th.firstElementChild : th.childElementCount ? null : th;
				const mm = el?.textContent.trim().match(/^(\d)(?:st|nd|rd|th)$/);
				if (mm) el.textContent = mm[1] + "环";
			});
			const act = (cur.subclasses || []).filter(isOn);
			const sig = cur.name + "|" + cur.source + "|" + act.map(sc => sc.shortName + "_" + sc.source).join(",");
			if (tbl.dataset.n4 === sig) return;
			tbl.querySelectorAll(".n4-scfs").forEach(e => e.remove());
			tbl.dataset.n4 = sig;
			tbl.classList.toggle("n4-has-sc", act.length > 0);
			const byLevel = {};
			act.forEach(sc => featsOf(sc).forEach(f => (byLevel[f.level] ||= []).push({...f, sc})));
			tbl.querySelectorAll("tr").forEach(tr => {
				const lv = tr.querySelector(":scope > td.ve-cls-tbl__col-level");
				const cell = tr.children[2];
				const fs = lv && byLevel[parseInt(lv.textContent, 10)];
				if (!fs || !cell) return;
				const box = h(`<span class="n4-scfs"></span>`);
				fs.forEach(f => {
					const g = groupOf(f.sc);
					const chip = h(`<button type="button" class="n4-scf${f.replaced ? " bk-sc-replaced" : ""}" data-g="${g}"><span class="bk-sc-chip-name">${esc(f.name)}</span></button>`);
					const marker = f.replaced ? subclassReplacedLabel : subclassLevelLabel(f);
					if (marker) chip.append(h(`<span class="bk-sc-chip-level">${esc(marker)}</span>`));
					if (act.length > 1) chip.prepend(h(`<i class="n4-scf__of">${esc(f.sc.shortName || f.sc.name)}</i>`));   // several chosen: say whose feature it is
					chip.title = [`${f.sc.name}（${abvOf(f.sc.source)}）· ${f.name}`, subclassLevelLabel(f), f.replaced && subclassReplacedLabel, "点击跳到正文"].filter(Boolean).join("\n");
					chip.dataset.featureTitle = f.key;
					box.append(chip);
				});
				cell.append(box);
			});
		};
		table.addEventListener("click", e => {
			const chip = e.target.closest(".n4-scf");
			if (!chip) return;
			const target = subclassTitleTarget(chip.dataset.featureTitle);
			if (target) jumpSubclassTitle(target, true);
		});
		const paintGrowth = () => { paintTable(); bookClassArtLayout(head); };
		new MutationObserver(() => { clearTimeout(paintTable.t); paintTable.t = setTimeout(() => { try { paintGrowth(); } catch (e) { console.warn("ours V4", e); } }, 60); })
			.observe(table, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]});

		v4Paint = () => { paintList(); paintStrip(); paintRow(); paintGrowth(); };
		window.addEventListener("message", e => { if (e.origin === location.origin && (e.data?.type === "ours-ed" || e.data?.type === "ours-mode")) setTimeout(() => { try { v4Paint(); } catch (err) { /* page not ready */ } }, 600); });
		window.addEventListener("hashchange", () => setTimeout(() => { try { v4Paint(); } catch (err) { /* page not ready */ } }, 120));
	}
	// the site's global search, shown as Notion's centred search window
	function bindNotionSearch () {
		const root = document.documentElement;
		const input = () => document.querySelector(".omni__input");
		const close = () => {
			if (!root.classList.contains("nt-search")) return;
			root.classList.remove("nt-search");
			const i = input();
			if (i && document.activeElement === i) i.blur();
		};
		const open = () => {
			const i = input();
			if (!i) return;
			root.classList.add("nt-search");
			i.focus();
			i.select();
		};
		window.addEventListener("message", e => { if (e.origin === location.origin && e.data?.type === "ours-search") open(); });
		document.addEventListener("focusin", e => { if (e.target?.classList?.contains("omni__input")) root.classList.add("nt-search"); });
		document.addEventListener("keydown", e => {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); open(); return; }
			if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "\\") { e.preventDefault(); tellShell({type: "ours-sidebar"}); return; }
			if (e.key === "Escape" && root.classList.contains("nt-search")) { e.preventDefault(); close(); }
		}, true);
		document.addEventListener("mousedown", e => {
			if (!root.classList.contains("nt-search")) return;
			if (e.target.closest?.(".omni__wrp-input, .omni__wrp-output, .ve-hwin")) return;
			close();
		}, true);
		document.addEventListener("click", e => { if (e.target.closest?.(".omni__lnk-name, .omni__wrp-page a")) setTimeout(close, 0); }, true);
		window.addEventListener("hashchange", close);
	}
	// list rows: the source cell becomes a Notion tag that also says which edition / which kind of source it is
	function notionTags () {
		const kind = (src, abv) => {
			if (/^Ours/i.test(src)) return "ours";
			if (/'24$|’24$/.test(abv) || ["XPHB", "XDMG", "XMM"].includes(src)) return "24";
			if (/^UA/.test(src) || /^UA/.test(abv)) return "ua";
			if (TIER[src]) return "3p";
			return "14";
		};
		const run = () => {
			document.querySelectorAll(".ve-lst__row-inner > [class*='ve-source__']:not([data-nt])").forEach(el => {
				el.dataset.nt = "1";
				const src = ([...el.classList].find(c => c.startsWith("ve-source__")) || "").slice(11);
				const abv = el.textContent.trim();
				if (!abv) return;
				el.innerHTML = `<span class="nt-tag nt-tag--${kind(src, abv)}"${srcAttr("ve-source__" + src)}>${esc(abv)}</span>`;
				if (NT2 && PAGE_ID === "classes") el.parentElement.querySelector(":scope > .ve-bold")?.classList.replace("ve-bold", "nt-name");
			});
		};
		let queued = false;
		const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; run(); }, 30); };
		const watch = () => {
			// most pages have one #list; the items page has two (#list-mundane / #list-magic)
			const lists = document.querySelectorAll("#listcontainer .list:not(#sublist), #list");
			if (!lists.length) return setTimeout(watch, 500);
			lists.forEach(list => new MutationObserver(later).observe(list, {childList: true, subtree: true}));
			run();
		};
		watch();
	}

	// rules text links to a filtered list of options, e.g. 魔契师「魔能祈唤选项」→ {@filter …|optionalfeatures|feature type=EI|source=XPHB}.
	// The source pin would show only the 28 invocations of the 2024 book; drop it, so the list shows every book
	// in the current 资料范围 (the source switch still decides which books those are).
	function widenOptionLinks () {
		const R = globalThis.Renderer;
		if (!R?.getFilterSubhashes || R.getFilterSubhashes.__ours) return;
		const orig = R.getFilterSubhashes;
		R.getFilterSubhashes = function (filters, ...rest) {
			const str = f => String(f ?? "").trim();
			if (Array.isArray(filters) && filters.some(f => /^feature ?type\s*=/i.test(str(f)))) filters = filters.filter(f => !/^source\s*=/i.test(str(f)));
			return orig.call(this, filters, ...rest);
		};
		R.getFilterSubhashes.__ours = true;
	}

	// Optional class features that one of OUR books adds to an OFFICIAL class or subclass (e.g. 《魔兽世界》图腾 → 野蛮人 3 级,
	// 唤魔师法术 → 术士「龙族术法」3 级). The site only shows the features a class lists itself, and a homebrew file can't
	// add to an official class's list — so, right before the class page expands a class's feature list, add a reference to
	// each of our features marked isClassFeatureVariant for that class (shown like TCE's 原初学识, under the 变体 switch).
	// Display only: the features themselves are our book's data, untouched.
	function attachOursVariants () {
		// the loader class lives inside an ES module; DataLoader keeps the registered instance under its props
		const DL = globalThis.DataLoader, reg = DL?._DATA_TYPE_LOADERS || {};
		const L = (reg.raw_class || reg.class || (DL?._DATA_TYPE_LOADER_LIST || []).find(l => l?.constructor?._pGetDereferencedClassData))?.constructor;
		if (!L?._pGetDereferencedClassData || L._pGetDereferencedClassData.__ours) return;
		let pFeats = null;
		const ours = () => pFeats ||= (async () => {
			let brew = {};
			try { brew = await globalThis.BrewUtil2.pGetBrewProcessed() || {}; } catch (e) { /* no library */ }
			const mine = arr => (arr || []).filter(f => f?.isClassFeatureVariant && /^Ours/i.test(f.source || ""));
			return {cf: mine(brew.classFeature), scf: mine(brew.subclassFeature)};
		})();
		const low = s => String(s || "").toLowerCase();
		const add = (ent, prop, uids) => {
			const have = new Set((ent[prop] || []).map(r => low(typeof r === "string" ? r : r[prop.replace(/s$/, "")])));
			const extra = uids.filter(u => !have.has(low(u)));
			if (!extra.length) return ent;
			return {...ent, [prop]: [...(ent[prop] || []), ...extra]};
		};
		const origC = L._pGetDereferencedClassData, origS = L._pGetDereferencedSubclassData;
		L._pGetDereferencedClassData = async function (cls, ...rest) {
			try {
				const {cf} = await ours();
				const uids = cf.filter(f => low(f.className) === low(cls?.name) && low(f.classSource) === low(cls?.source))
					.map(f => [f.name, f.className, f.classSource, f.level, f.source].join("|"));
				if (uids.length) cls = add(cls, "classFeatures", uids);
			} catch (e) { console.warn("ours variants", e); }
			const out = await origC.call(this, cls, ...rest);
			// the site draws one table row per level up to the last level with a feature; some books keep every feature under level 1
			if (out?.oursLevelFeatures && Array.isArray(out.classFeatures)) while (out.classFeatures.length < 20) out.classFeatures.push([]);
			return out;
		};
		L._pGetDereferencedSubclassData = async function (sc, ...rest) {
			try {
				const {scf} = await ours();
				const uids = scf.filter(f => low(f.className) === low(sc?.className) && low(f.classSource) === low(sc?.classSource)
					&& low(f.subclassShortName) === low(sc?.shortName) && low(f.subclassSource) === low(sc?.source))
					.map(f => [f.name, f.className, f.classSource, f.subclassShortName, f.subclassSource, f.level, f.source].join("|"));
				if (uids.length) sc = add(sc, "subclassFeatures", uids);
			} catch (e) { console.warn("ours variants", e); }
			return origS.call(this, sc, ...rest);
		};
		L._pGetDereferencedClassData.__ours = true;
	}

	const subclassLevelLabel = info => info.original !== info.level
		? `原 ${info.original} 级`
		: info.retained ? `原书 ${info.original} 级` : "";
	const subclassReplacedLabel = "已由 7 级受祝击取代";
	const subclassFeatureName = name => String(name || "").replace(/·+$/, "");

	function featsOf (sc, {includeIntro = false} = {}) {
		const out = [];
		const walk = e => {
			if (!e || typeof e !== "object") return;
			if (Array.isArray(e)) return e.forEach(walk);
			if (e._oursScTitle && (includeIntro || e.name !== sc.name)) out.push(e._oursScTitle);
			walk(e.entries);
		};
		walk(sc.subclassFeatures);
		return out;
	}

	// The class page owns these copies. DataLoader's entities and UID/hash fields
	// continue to describe the original features for links and hover previews.
	function alignSubclassLevels (sc, cls, current, opposite, edition) {
		const features = (sc.subclassFeatures || []).flat();
		const first = Math.min(...features.map(f => f.level));
		const followsOther = current.length && sc.edition !== edition && first !== current[0] && first === opposite[0];
		const otherEdition = edition === "one" ? "classic" : "one";
		// Some pre-aligned third-party subclasses have no edition field. Their
		// first group is already in the right place, but carries named entries
		// with the other edition's first level.
		const hasOriginalLevel = entry => Array.isArray(entry)
			? entry.some(hasOriginalLevel)
			: entry && typeof entry === "object" && (
				(entry.level === opposite[0] && entry.subclassShortName === sc.shortName)
				|| hasOriginalLevel(entry.entries)
			);
		const preAligned = !sc.edition && first === current[0] && opposite.length && first !== opposite[0]
			&& features.some(f => f.level === first && hasOriginalLevel(f.entries));
		const sourceEdition = /\D(?:20)?14$/.test(sc.source) ? "classic"
			: /\D(?:20)?24$/.test(sc.source) ? "one" : BrewUtil2.sourceJsonToSource(sc.source)?.edition;
		const isOtherFirstGroup = original => edition === "one" ? original < current[0] : original === (preAligned ? opposite[0] : first);
		const written = sc.veFrom2014 ? "classic" : sc.edition || (followsOther || preAligned ? otherEdition : sourceEdition);
		const cross = (written === "classic" || written === "one") && written !== edition;
		const move = followsOther && !sc.name.includes("变体职业");
		const byLevel = new Map(), moved = new Set(), retained = new Set();
		const stateKey = UrlUtil.getStateKeySubclass(sc);
		let ixTitle = 0, replaced = false;
		for (const [index, f] of features.entries()) {
			const original = f.level;
			const level = move && isOtherFirstGroup(original) ? current[0] : original;
			const stays = level === original && !current.includes(level);
			if (level !== original) moved.add(original);
			if (stays) retained.add(original);
			const root = {original, level, retained: stays};
			f._oursScRoot = {...root, stateKey, index};
			const walk = (entry, top) => {
				if (!entry || typeof entry !== "object") return;
				if (Array.isArray(entry)) return entry.forEach(e => walk(e, top));
				if (entry.name && entry.level != null && (top || entry.subclassShortName != null || entry.className != null)) {
					const name = subclassFeatureName(entry.name);
					const isReplaced = cls.name === "牧师" && edition === "one" && written === "classic" && original === 8
						&& ["神圣打击", "强力施法", "受祝击"].includes(name);
					replaced ||= isReplaced;
					entry._oursScTitle = {...root, key: `${stateKey}|${ixTitle++}`, name, replaced: isReplaced};
				}
				// A nested original level can also be part of a pre-aligned official
				// entry. Only update headings carried by a group we actually moved.
				if ((entry.level === original && level !== original)
					|| (preAligned && original === first && entry._oursScTitle && isOtherFirstGroup(entry.level))) entry.level = level;
				if (entry.entries) walk(entry.entries, false);
			};
			walk(f, true);
			if (!byLevel.has(level)) byLevel.set(level, []);
			byLevel.get(level).push(f);
		}
		sc.subclassFeatures = [...byLevel.keys()].sort((a, b) => a - b).map(lv => byLevel.get(lv));
		sc._oursScEdition = cross ? (written === "classic" ? "2014" : "2024") : null;
		const levelList = set => [...set].sort((a, b) => a - b).join("、");
		const details = [];
		if (moved.size) details.push(`${levelList(moved)} 级能力改在 ${current[0]} 级获得`);
		if (preAligned && retained.size) details.push(`初始能力已按 ${edition === "one" ? "2024" : "2014"} 职业在 ${first} 级获得`);
		if (retained.size) details.push(`${levelList(retained)} 级能力保留在原等级`);
		if (replaced) details.push(`部分 8 级能力${subclassReplacedLabel}`);
		const note = sc._oursScEdition ? `按 ${sc._oursScEdition} 规则编写` : "";
		sc._oursScNote = details.length ? `${note ? note + "。" : ""}${details.join("；")}。`
			: note ? `${note}，${sc.veFrom2014 ? "能力沿用原书等级" : `能力等级已按 ${edition === "one" ? "2024" : "2014"} 职业调整`}。` : "";
	}

	function subclassTitleTarget (key) {
		return document.querySelector(`#pagecontent [data-ours-sc-title="${CSS.escape(key)}"]`);
	}

	function jumpSubclassTitle (target, flash = false) {
		const title = target.closest(".ve-rd__h");
		title.scrollIntoView({block: "start", inline: "nearest"});
		if (!flash) return;
		const block = title.closest(".ve-rd__b") || title;
		block.classList.add("n4-flash");
		setTimeout(() => block.classList.remove("n4-flash"), 1600);
	}

	// The site adds a "子职特性" level wherever ANY of the class's subclasses has a feature
	// outside the class's own subclass levels (third-party subclasses on odd levels). Show
	// such a level only while a selected subclass actually has something there.
	function paintIdleSubclassLevels () {
		const root = document.getElementById("pagecontent"), state = page()?._state;
		if (!root || !state) return;
		for (const row of root.querySelectorAll('tr[data-feature-type="gain-subclass"][data-scroll-id$="--1"]')) {
			const group = [];
			let on = false;
			for (let n = row.nextElementSibling; n && !n.hasAttribute("data-feature-type"); n = n.nextElementSibling) {
				group.push(n);
				if (n.dataset.subclassId && state[n.dataset.subclassId]) on = true;
			}
			for (const el of [row, ...group.filter(n => n.dataset.subclassNoneMessage)]) {
				if (el.hasAttribute("data-ours-idle") !== on) continue;
				if (on) el.removeAttribute("data-ours-idle"); else el.setAttribute("data-ours-idle", "");
			}
		}
	}

	function attachSubclassLevels () {
		const p = page();
		if (PAGE_ID !== "classes" || !p?._addData) return;
		const addData = p._addData;
		p._addData = function (data) {
			const incoming = {...data};
			if (data.class) incoming.class = MiscUtil.copyFast(data.class);
			if (data.subclass) incoming.subclass = MiscUtil.copyFast(data.subclass);
			const classes = [...this._dataList, ...(incoming.class || [])];
			const byName = new Map(), editions = new Map(), gains = new Map(), twinsByClass = new Map();
			const core = new Set(["XPHB", "PHB", "EFA", "TCE"]);
			for (const cls of classes) {
				editions.set(cls, isNew(cls) ? "one" : "classic");
				gains.set(cls, (cls.classFeatures || []).flatMap((fs, i) => fs.some(f => f.gainSubclassFeature) ? [i + 1] : []));
				for (const name of new Set([cls.name, cls.ENG_name].filter(Boolean).map(n => n.toLowerCase()))) {
					if (!byName.has(name)) byName.set(name, []);
					byName.get(name).push(cls);
				}
			}
			const align = (sc, cls) => {
				const edition = editions.get(cls);
				if (!twinsByClass.has(cls)) {
					const twins = byName.get(cls.name.toLowerCase()).filter(c => editions.get(c) !== edition);
					const other = twins.find(c => core.has(c.source) && core.has(cls.source))
						|| twins.find(c => c.edition && cls.edition)
						|| (twins.length === 1 ? twins[0] : null);
					twinsByClass.set(cls, other);
				}
				alignSubclassLevels(sc, cls, gains.get(cls), gains.get(twinsByClass.get(cls)) || [], edition);
			};
			for (const cls of incoming.class || []) for (const sc of cls.subclasses || []) align(sc, cls);
			for (const sc of incoming.subclass || []) {
				const cls = byName.get(sc.className?.toLowerCase())?.find(c => c.source.toLowerCase() === (sc.classSource || "PHB").toLowerCase());
				if (cls) align(sc, cls);
			}
			return addData.call(this, incoming);
		};

		const renderIdle = p._render_pRenderClassContent;
		if (renderIdle) p._render_pRenderClassContent = async function (...args) {
			const out = await renderIdle.apply(this, args);
			paintIdleSubclassLevels();
			return out;
		};

		const renderer = Renderer.get();
		const headerSpan = renderer._renderEntriesSubtypes_getHeaderSpan;
		renderer._renderEntriesSubtypes_getHeaderSpan = function (opts) {
			const info = opts.entry._oursScTitle;
			if (!info || !opts.displayName) return headerSpan.call(this, opts);
			const label = [subclassLevelLabel(info), info.replaced && subclassReplacedLabel].filter(Boolean).join(" · ");
			const tag = `<span data-ours-sc-title="${esc(info.key)}"${label ? ` class="bk-sc-level-tag${info.replaced ? " bk-sc-replaced" : ""}"` : ""}>${esc(label)}</span>`;
			return headerSpan.call(this, {...opts, partPageExpandCollapse: tag + (opts.partPageExpandCollapse || "")});
		};
		const named = Renderer.class.getDisplayNamedSubclassFeatureEntry;
		let sourceNotes = null;
		Renderer.class.getDisplayNamedSubclassFeatureEntry = function (entry, opts) {
			const root = entry._oursScRoot;
			if (!root || !entry.entries || !sourceNotes) return named.call(this, entry, opts);
			const notes = sourceNotes.get(root.stateKey);
			if (!notes && !opts?.isEditionMismatch) return named.call(this, entry, opts);
			const entries = [...entry.entries];
			if (notes?.date && entries[0] === notes.date) entries.shift();
			if (opts?.isEditionMismatch && typeof entries[0] === "string" && entries[0].includes("This subclass is from a different game edition.")) entries.shift();
			for (const note of [notes?.reprint, notes?.source]) {
				if (note && entries.at(-1) === note) entries.pop();
			}
			if (notes?.first === root.index) {
				if (notes.date) entries.unshift(notes.date);
				if (notes.source) entries.push(notes.source);
				if (notes.reprint) entries.push(notes.reprint);
			}
			entry = {...entry, entries};
			return named.call(this, entry, opts);
		};
		const renderContent = p._render_pRenderClassContent;
		p._render_pRenderClassContent = async function (...args) {
			const cls = this.activeClass;
			// 5etools attaches publication, source and reprint notes only at the
			// first subclass level. Keep each of those notes on its original entry.
			const gain = cls.classFeatures.findIndex(fs => fs.some(f => f.gainSubclassFeature));
			let firstLevel = gain < 0 ? Infinity : gain + 1;
			for (const sc of cls.subclasses) for (const f of sc.subclassFeatures.flat()) {
				if (f._oursScRoot?.original <= cls.classFeatures.length) firstLevel = Math.min(firstLevel, f._oursScRoot.original);
			}
			sourceNotes = new Map();
			for (const sc of cls.subclasses) {
				const date = SourceUtil.isNonstandardSource(sc.source) && Parser.sourceJsonToDate(sc.source);
				if (!date && !sc.otherSources && !sc.reprintedAs) continue;
				const first = sc.subclassFeatures.flat().find(f => f._oursScRoot?.original === firstLevel)?._oursScRoot.index;
				sourceNotes.set(UrlUtil.getStateKeySubclass(sc), {
					first,
					date: date ? renderer.render(`{@note This subclass was published on ${DatetimeUtil.getDateStr({date: new Date(date)})}.}`) : null,
					source: sc.otherSources ? `{@note {@b 子职业 来源:} ${Renderer.utils.getSourceAndPageHtml(sc)}}` : null,
					reprint: sc.reprintedAs ? `{@note ${Renderer.utils.getReprintedAsHtml(sc)}.}` : null,
				});
			}
			try {
				await renderContent.apply(this, args);
			} finally {
				sourceNotes = null;
			}
			const notes = new Map(cls.subclasses.filter(sc => sc._oursScNote).map(sc => [UrlUtil.getStateKeySubclass(sc), sc._oursScNote]));
			if (!notes.size) return;
			for (const row of document.querySelectorAll("#pagecontent tr[data-subclass-id]")) {
				const key = row.dataset.subclassId, note = notes.get(key);
				if (!note) continue;
				row.firstElementChild.prepend(h(`<p class="bk-sc-edition-note">${esc(note)}</p>`));
				notes.delete(key);
			}
		};

		// The original external link identifies the subclass and original level.
		// Its hover hash also includes a name, which same-page clicks can use.
		const titleForOriginal = (sc, original, name) => {
			if (!sc) return null;
			const matches = featsOf(sc, {includeIntro: true}).filter(f => f.original === original && f.level !== original);
			const info = (name && matches.find(f => f.name.toLowerCase() === subclassFeatureName(name).toLowerCase()))
				|| matches.find(f => f.name !== sc.name) || matches[0];
			return info && subclassTitleTarget(info.key);
		};
		document.addEventListener("click", e => {
			const link = e.target.closest('a[data-vet-page="subclassfeature"]');
			if (!link || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || p._state.isViewActiveScComp || p._state.isViewActiveBook) return;
			const {hash, page: linkPage} = Renderer.hover.getLinkElementData(link);
			const {name, className, classSource, subclassShortName, subclassSource, level} = UrlUtil.autoDecodeHash(hash, {page: linkPage});
			const cls = p.activeClass;
			if (!cls || cls.name.toLowerCase() !== className?.toLowerCase() || cls.source.toLowerCase() !== classSource?.toLowerCase()) return;
			const key = UrlUtil.getStateKeySubclass({shortName: subclassShortName, source: subclassSource});
			const target = titleForOriginal(cls.subclasses.find(sc => UrlUtil.getStateKeySubclass(sc) === key), level, name);
			if (!target) return;
			e.preventDefault();
			e.stopPropagation();
			if (!p._state[key]) p._state[key] = true;
			jumpSubclassTitle(target);
		}, true);
		const setStateFromHash = p._pSetStateFromHash;
		let skipTableHash = "";
		document.getElementById("classtable").addEventListener("click", e => {
			const link = e.target.closest('td:nth-child(3) a[href^="#"]');
			if (link) skipTableHash = link.hash;
		}, true);
		p._pSetStateFromHash = async function (...args) {
			const hash = location.hash;
			const local = skipTableHash === hash;
			skipTableHash = "";
			const state = !local && UrlUtil.unpackClassesPageStatePart(hash);
			const scKeys = state?.stateKeysSubclass?.filter(key => key.startsWith("sub_")) || [];
			const match = state?.feature?.match(/^(\d+)-0$/);
			await setStateFromHash.apply(this, args);
			if (isPinnedFeature(state?.feature)) return;
			if (scKeys.length !== 1 || !match) return;
			const cls = this.activeClassRaw;
			const sc = cls?.subclasses.find(s => UrlUtil.getStateKeySubclass(s) === scKeys[0]);
			if (!sc || !featsOf(sc, {includeIntro: true}).some(f => f.original === +match[1] + 1 && f.level !== f.original)) return;
			const clicked = IN_SHELL && window.top.__oursSubclassLink;
			const name = clicked?.href === hash && Date.now() - clicked.time < 10000
				? UrlUtil.autoDecodeHash(clicked.feature, {page: "subclassfeature"}).name : null;
			if (name) delete window.top.__oursSubclassLink;
			const jump = () => setTimeout(() => {
				if (this.activeClassRaw !== cls || !this._state[scKeys[0]]) return;
				const target = titleForOriginal(sc, +match[1] + 1, name);
				if (target?.offsetParent) jumpSubclassTitle(target);
			}, 130);
			if (args[0]) window.addEventListener("toolsLoaded", jump, {once: true});
			else jump();
		};
	}

	// Each page only loads the third-party / our-own slices it lists itself (spells page: spells, …). A link or pop-up
	// pointing elsewhere — a WoW spell in a subclass table on the class page, a book's creature on the items page — then
	// found nothing and stayed empty ("Loading…"). On such a miss, fetch that one book's slice for the target page and
	// put it through the site's own brew processing, then look again.
	function lookupMissingBrew () {
		const DL = globalThis.DataLoader;
		if (!DL?.pCacheAndGet || DL.pCacheAndGet.__ours) return;
		const orig = DL.pCacheAndGet;
		const tried = new Map();
		const PAGE_ALIAS = {
			classfeature: "classes.html", subclassfeature: "classes.html", subclass: "classes.html",
			raw_class: "classes.html", raw_subclass: "classes.html", legendarygroup: "bestiary.html",
			itemmastery: "items.html", card: "decks.html", skill: "conditionsdiseases.html", sense: "conditionsdiseases.html",
		};
		const pageFile = pageClean => {
			if (pageClean.endsWith(".html")) return pageClean;
			if (PAGE_ALIAS[pageClean]) return PAGE_ALIAS[pageClean];
			const pg = globalThis.UrlUtil?.PROP_TO_PAGE?.[pageClean];
			return pg || null;
		};
		function fill (pageClean, sourceClean) {
			const file = pageFile(pageClean);
			if (!file) return false;
			const key = pageClean + "|" + sourceClean;
			if (!tried.has(key)) tried.set(key, fillFromSource(file, pageClean, sourceClean));
			return tried.get(key);
		}
		async function fillFromSource (file, pageClean, sourceClean) {
			let docs;
			try { docs = window.__OURS_WEB ? await window.__OURS_WEB.brewSource(file, sourceClean) : await api(`/__api/brew-source?page=${encodeURIComponent(file)}&src=${encodeURIComponent(sourceClean)}`); } catch (e) { return false; }
			if (!docs?.length) return false;
			const merged = {_meta: {}};
			for (const {json = {}} of docs) {
				for (const [prop, arr] of Object.entries(json)) {
					if (prop !== "_meta" && Array.isArray(arr)) (merged[prop] ||= []).push(...arr);
				}
				const {internalCopies, dependencies, includes} = json._meta || {};
				if (internalCopies?.length) (merged._meta.internalCopies ||= []).push(...internalCopies);
				for (const [type, props] of [["dependencies", dependencies], ["includes", includes]]) {
					for (const [prop, sources] of Object.entries(props || {})) {
						const dst = merged._meta[type] ||= {};
						dst[prop] = [...new Set([...(dst[prop] || []), ...sources])];
					}
				}
			}
			const processed = await DataUtil.pDoMetaMerge(CryptUtil.uid(), merged, {isSkipMetaMergeCache: true});
			const dl = DL._pCache_getDataTypeLoader({pageClean, isSilent: true}) || DL._pCache_getDataTypeLoader({pageClean: file, isSilent: true});
			if (!dl) return false;
			let data = processed;
			if (dl.constructor.name === "DataTypeLoaderCustomItem") {
				Renderer.item.addPrereleaseBrewPropertiesAndTypesFrom({data: processed});
				data = {item: await Renderer.item.pGetSiteUnresolvedRefItemsFromPrereleaseBrew({brewUtil: BrewUtil2, brew: processed}), itemEntry: processed.itemEntry || []};
			} else if (dl.constructor.name === "DataTypeLoaderRace") {
				data = DataUtil.race.getPostProcessedPrereleaseBrewJson(await DataUtil.race.loadRawJSON(), processed, {isAddBaseRaces: true});
			} else {
				try { await dl._pPrePopulate?.({data, isBrew: true}); } catch (e) { /* optional step */ }
			}
			DL._pCache_addToCache({allDataMerged: data, propAllowlist: dl.phase1CachePropAllowlist || new Set(dl.constructor.PROPS)});
			if (dl.hasPhase2Cache) {
				const post = await dl._pGetPostCacheData_obj({obj: data});
				DL._pCache_addToCache({allDataMerged: post, propAllowlist: dl.phase2CachePropAllowlist || new Set(dl.constructor.PROPS)});
			}
			return true;
		}
		DL.pCacheAndGet = async function (page, source, hash, opts = {}) {
			const sourceClean = String(source).toLowerCase();
			const isLocalResult = window.__oursSearch?.knowsBrew(sourceClean);
			let ent;
			try { ent = await orig.call(this, page, source, hash, {...opts, isRequired: false}); }
			catch (error) { if (!isLocalResult) throw error; }
			if (ent || !source) return ent ?? orig.call(this, page, source, hash, opts);
			const clean = {page: String(page).toLowerCase(), source: sourceClean, hash: String(hash).toLowerCase()};
			if (!isLocalResult && DL._isSiteSource?.({sourceClean})) return orig.call(this, page, source, hash, opts);
			let ok = false;
			try { ok = await fill(clean.page, clean.source); } catch (e) { console.warn("ours: brew lookup", e); }
			if (ok) {
				const bySrc = DL._CACHE?._cache?.[clean.page]?.[clean.source];
				if (bySrc && typeof bySrc[clean.hash] === "symbol") delete bySrc[clean.hash];   // the "not found" mark left by the first try
				const again = DL.getFromCache(page, source, hash, {isCopy: opts.isCopy});
				if (again) return again;
			}
			return orig.call(this, page, source, hash, opts);
		};
		DL.pCacheAndGet.__ours = true;
	}

	// inside the shell the shell owns the back/forward history: a page's own #hash changes replace its entry
	// (otherwise every page, also the ones loading in the background, adds entries that the back button then walks
	// through out of order — back would change a hidden page or reload a released one instead of returning).
	// The shell adds one entry per step you take (see shell.html), so back returns to where you were.
	function shellOwnsHistory () {
		const nav = window.navigation;
		if (!nav?.addEventListener) return;
		nav.addEventListener("navigate", e => {
			if (!e.hashChange || e.navigationType !== "push" || !e.cancelable) return;
			if (e.userInitiated) tellShell({type: "ours-step"});   // a click of yours (a list row, a link on the page): one step back
			e.preventDefault();
			nav.navigate(e.destination.url, {history: "replace"});
		});
	}

	// inside the shell: links to another page switch to that page's (already loaded) tab instead of reloading
	function bindShellNav () {
		shellOwnsHistory();
		document.addEventListener("click", e => {
			if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
			if (e.target.closest?.(".bk-img-retry")) return;
			const a = e.target.closest?.("a[href]");
			if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
			let u;
			try { u = new URL(a.getAttribute("href"), location.href); } catch (err) { return; }
			if (u.origin !== location.origin || !/(\.html|\/)$/.test(u.pathname) || u.pathname.startsWith("/__ours/")) return;
			if (u.searchParams.has("ours-search") || u.searchParams.has("ours-source") || u.searchParams.has("ours-feature")
				|| u.pathname.endsWith("/search.html") && u.searchParams.has("q")) {
				e.preventDefault();
				e.stopPropagation();
				window.__oursSearch.navigate(u);
				return;
			}
			if (u.pathname === location.pathname) return;   // same page: the site handles #hash itself
			if (u.pathname.endsWith("/classes.html") && a.dataset.vetPage === "subclassfeature" && a.dataset.vetHash) {
				window.top.__oursSubclassLink = {href: u.hash, feature: a.dataset.vetHash, time: Date.now()};
			}
			e.preventDefault();
			e.stopPropagation();
			tellShell({type: "ours-nav", path: u.pathname, hash: u.hash});
		}, true);
		window.addEventListener("hashchange", () => tellShell({type: "ours-hash"}));
		window.addEventListener("message", e => {
			if (e.origin !== location.origin) return;
			if (e.data?.type === "ours-mode") applySourceMode(true);
			if (e.data?.type === "ours-ed") applyEdition();
		});
	}

	// tiny markdown: bullets (nested), **bold**, `code`, tables, [text](link) -> text
	function md (src) {
		const inline = s => esc(s)
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
			.replace(/`(.+?)`/g, "<code>$1</code>");
		const out = [];
		const stack = [];
		const lines = String(src || "").split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (/^\s*\|/.test(line)) {
				const rows = [];
				while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
				i--;
				while (stack.length) { out.push("</ul>"); stack.pop(); }
				const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
				const body = rows.filter(r => !/^\s*\|[\s|:-]+\|\s*$/.test(r));
				out.push(`<table class="ours-md-table">${body.map((r, ix) => `<tr>${cells(r).map(c => ix ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join("")}</tr>`).join("")}</table>`);
				continue;
			}
			const m = line.match(/^(\s*)[-*] (.*)$/);
			if (m) {
				const depth = Math.floor(m[1].length / 2);
				while (stack.length > depth + 1) { out.push("</ul>"); stack.pop(); }
				while (stack.length < depth + 1) { out.push("<ul>"); stack.push(1); }
				out.push(`<li>${inline(m[2])}</li>`);
				continue;
			}
			while (stack.length) { out.push("</ul>"); stack.pop(); }
			if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
		}
		while (stack.length) { out.push("</ul>"); stack.pop(); }
		return out.join("");
	}

	const gem = (tier, {big = false, title = ""} = {}) => tier
		? `<span class="ours-gem ours-gem--${tier} ${big ? "ours-gem--big" : ""}" title="${esc(title || `${tier} · ${TIER_NAME[tier]}`)}">${tier}</span>`
		: "";

	// ------------------------------------------------------------------ modal
	function modal (title, bodyHtml, {wide = false} = {}) {
		const wrp = h(`<div class="ours-modal"><div class="ours-modal__box ${wide ? "ours-modal__box--wide" : ""}">
			<div class="ours-modal__head"><div class="ours-modal__title">${title}</div><button class="ours-modal__x" title="关闭">×</button></div>
			<div class="ours-modal__body">${bodyHtml}</div></div></div>`);
		const close = () => { wrp.remove(); document.removeEventListener("keydown", onKey); };
		const onKey = e => { if (e.key === "Escape") close(); };
		wrp.addEventListener("click", e => { if (e.target === wrp) close(); });
		wrp.querySelector(".ours-modal__x").addEventListener("click", close);
		document.addEventListener("keydown", onKey);
		document.body.appendChild(wrp);
		return {el: wrp, close};
	}

	function toast (text) {
		const t = h(`<div class="ours-toast">${esc(text)}</div>`);
		document.body.appendChild(t);
		setTimeout(() => t.classList.add("ours-toast--out"), 1800);
		setTimeout(() => t.remove(), 2400);
	}

	// ------------------------------------------------------------------ ratings data
	async function loadRatings () {
		if (state.ratings) return;
		try {
			const r = await api("/__api/ratings");
			state.ratings = r.base || {};
			state.user = Object.assign({items: {}, subclass: {}}, r.user || {});
		} catch (e) {
			state.ratings = {};
			state.user = {items: {}, subclass: {}};
		}
	}
	async function saveUser () {
		await api("/__api/ratings", state.user);
		toast("已保存到本地（ours 文件夹，更新不会覆盖）");
	}
	const entKey = ent => `${PAGE}|${ent.name}|${ent.source}`;
	const itemRating = ent => (state.user.items || {})[entKey(ent)] || (state.ratings.items || {})[entKey(ent)] || null;

	// subclass lists
	const subLists = () => state.ratings.subclassLists || [];
	const subUser = (list, e) => (state.user.subclass || {})[`${list.id}|${e.zh}`] || {};
	const subTier = (list, e) => subUser(list, e).tier || e.tier;

	// ------------------------------------------------------------------ top bar: source switch + status
	function srcMode () { const m = lsGet(LS_MODE, DEFAULT_MODE); return MODES.some(x => x.id === m) ? m : DEFAULT_MODE; }

	function buildBar () {
		const nav = document.getElementById("navigation");
		if (!nav || document.getElementById("ours-bar")) return;
		const isList = !!document.getElementById("filtertools") || !!document.querySelector(".ve-lst__wrp-search-visible") || PAGE_ID === "classes";
		const bar = h(`<div id="ours-bar" class="container ours-bar">
			<a class="ours-bar__brand" href="index.html" title="回到大厅"><span class="ours-bar__sigil">✦</span>我们的 5etools</a>
			<div class="ours-bar__switch" role="tablist" title="来源总开关：在所有列表页通用">
				${MODES.map(m => `<button class="ours-seg" data-mode="${m.id}" title="${esc(m.tip)}">${m.label}</button>`).join("")}
			</div>
			<div class="ours-bar__switch ours-bar__ed" title="版本开关：只对职业、法术、专长生效">
				${ED_MODES.map(m => `<button class="ours-ed" data-ed="${m.id}" title="${esc(m.tip)}">${m.label}</button>`).join("")}
			</div>
			<div class="ours-bar__spacer"></div>
			<button class="ours-bar__status" title="资料与数据包"><span class="ours-dot"></span><span class="ours-bar__status-text">本地版</span></button>
		</div>`);
		nav.after(bar);
		if (window.__OURS_WEB) bar.querySelector(".ours-bar__status").classList.add("ve-hidden");
		bar.classList.toggle("ours-bar--list", isList);
		const paint = () => bar.querySelectorAll(".ours-seg").forEach(b => b.classList.toggle("ours-seg--on", b.dataset.mode === srcMode()));
		paint();
		bar.querySelectorAll(".ours-seg").forEach(b => b.addEventListener("click", () => {
			lsSet(LS_MODE, b.dataset.mode);
			paint();
			applySourceMode(true);
		}));
		paintEd();
		bar.querySelectorAll(".ours-ed").forEach(b => b.addEventListener("click", () => {
			lsSet(LS_ED, b.dataset.ed);
			paintEd();
			applyEdition();
		}));
		bar.querySelector(".ours-bar__status").addEventListener("click", ev => { ev.stopPropagation(); toggleDataMenu(); });
		document.addEventListener("click", ev => { const m = document.getElementById("ours-data-menu"); if (m && !m.contains(ev.target)) m.remove(); });
		pollStatus();
		setInterval(pollStatus, 30000);
	}

	// ------------------------------------------------------------------ data menu: export the complete data pack / manual update
	function toggleDataMenu () {
		if (window.__OURS_WEB) return;
		const old = document.getElementById("ours-data-menu");
		if (old) { old.remove(); return; }
		const s = state.status || {};
		const btn = document.querySelector(".ours-bar__status");
		const m = h(`<div id="ours-data-menu" class="ours-data-menu">
			<div class="ours-data-menu__info">
				<div>网站资料：${esc(s.pack_created ? "数据包 " + s.pack_created.slice(0, 16) : (s.site_updated || s.installed || "").slice(0, 16))}</div>
				<div>第三方库 + 我们的扩充：${s.brew_books || 0} 本</div>
				${s.last_export ? `<div class="ours-data-menu__path">上次导出：${esc(s.last_export)}</div>` : ""}
			</div>
			<button class="ours-data-menu__btn" data-act="export"><b>导出数据包</b><span>把全部资料打成一个压缩包，发给朋友，放在程序旁边即可</span></button>
			<button class="ours-data-menu__btn" data-act="update"><b>联网检查更新</b><span>从原作者的仓库获取新资料；更新前自动备份，不动我们的扩充</span></button>
		</div>`);
		document.body.appendChild(m);
		const r = btn.getBoundingClientRect();
		m.style.top = `${r.bottom + window.scrollY + 6}px`;
		m.style.left = `${Math.max(8, r.right + window.scrollX - m.offsetWidth)}px`;
		m.querySelector('[data-act="export"]').addEventListener("click", async () => {
			m.remove();
			try {
				const r = await api("/__api/export-pack", {});
				toast(`正在导出数据包，完成后保存在：${r.folder}`);
				waitExport();
			} catch (e) { toast("导出失败"); }
		});
		m.querySelector('[data-act="update"]').addEventListener("click", async () => {
			m.remove();
			if (!confirm("将联网从原作者的仓库下载新资料。\n更新前会自动把现有资料备份成数据包，我们自己的扩充不会被改动。\n继续吗？")) return;
			try { await api("/__api/update", {}); toast("开始检查更新……"); } catch (e) { toast("检查更新失败"); }
			setTimeout(pollStatus, 1500);
		});
	}

	async function waitExport () {
		for (let i = 0; i < 600; i++) {
			await new Promise(r => setTimeout(r, 1500));
			await pollStatus();
			const s = state.status || {};
			if (/^已导出数据包/.test(s.phase || "")) { alert(/完整版/.test(s.last_export || "")
				? `完整版已导出（程序 + 全部资料）：\n${s.last_export}\n\n把这一个文件发给朋友，解压后双击里面的程序即可。`
				: `数据包已导出：\n${s.last_export}\n\n已经有程序的朋友：把它放在程序旁边，再打开程序即可。\n想导出连程序一起的「完整版」：把 KuroNeko-5etools.exe 放进这个文件夹，再导出一次。`); return; }
			if (/导出数据包失败/.test(s.phase || "")) { alert(`导出失败：${s.error || ""}`); return; }
		}
	}

	function paintEd () { document.querySelectorAll(".ours-ed").forEach(b => b.classList.toggle("ours-seg--on", b.dataset.ed === edMode())); }

	async function pollStatus () {
		if (window.__OURS_WEB) return;
		try {
			const s = state.status = await api("/__api/status");
			const el = document.querySelector(".ours-bar__status-text");
			const dot = document.querySelector(".ours-dot");
			if (!el) return;
			const busy = /正在/.test(s.phase || "");
			const bad = !!s.error;
			el.textContent = busy ? s.phase : bad ? "本地资料 · 有提示" : "本地资料";
			dot.className = `ours-dot ${busy ? "ours-dot--busy" : bad ? "ours-dot--off" : "ours-dot--ok"}`;
			el.parentElement.title = `${s.phase || ""}${s.error ? "\n" + s.error : ""}\n第三方库 + 我们的扩充：${s.brew_books || 0} 本\n点击：导出数据包 / 联网检查更新`;
		} catch (e) { /* server restarting */ }
	}

	// apply the global switch to the page's own source filter
	function wantSource (mode, k) {
		const G = SourceUtil;
		const g = G.getFilterGroup(k);
		const official = g === G.FILTER_GROUP_STANDARD || g === G.FILTER_GROUP_NON_STANDARD;
		const good = TIER[k] && TIER[k] !== "C";
		switch (mode) {
			case "official": return official;
			case "rec": return official || good;
			case "brew": return !official && good;
			default: return null;   // 全部: nothing selected = everything shown
		}
	}
	function setSources (p, mode) {
		const sf = p._pageFilter.sourceFilter;
		const next = {};
		// Source selection can run before the native renderer has resolved activeClassRaw.
		const pinnedClass = ["official", "rec", "brew"].includes(mode) && PAGE_ID === "classes" && isPinnedEntryActive();
		Object.keys(sf._state).forEach(k => {
			next[k] = wantSource(mode, k) || pinnedClass && SEARCH_SOURCES.has(k.toLowerCase()) ? 1 : 0;
		});
		const same = Object.keys(next).every(k => sf._state[k] === next[k]);
		if (!same) {
			sf._proxyAssignSimple("state", next);
			p._filterBox.fireChangeEvent();
		}
		return Object.keys(next).length;
	}
	// the site shows an entry when ANY of its sources is selected, so third-party entries that also list an official
	// book (variants built on DMG items, reprint notes…) leaked into 常规: the entry's own book has the final say
	let strictInstalled = false;
	function installStrictSources (p) {
		if (strictInstalled || PAGE_ID === "classes") return;
		const pf = p._pageFilter;
		const base = pf.toDisplay.bind(pf);
		pf.toDisplay = (f, e) => {
			if (isSearchListEntry(p, e)) return true;
			if (!base(f, e)) return false;
			const m = srcMode();
			if (m === "all" || m === "manual" || !e?.source) return true;
			try { return !!wantSource(m, e.source); } catch (err) { return true; }
		};
		strictInstalled = true;
	}
	function loadingVeil (text) {
		if (document.getElementById("ours-veil")) return;
		document.body.appendChild(h(`<div id="ours-veil" class="ours-veil"><div class="ours-veil__box"><span class="ours-veil__spin"></span>${esc(text)}</div></div>`));
	}
	let watchTimer = null;
	let applyTimer = null;
	let applyGen = 0;
	// rapid clicks on the switch collapse into one filter pass
	function applySourceMode (isUserClick) {
		clearTimeout(applyTimer);
		applyTimer = setTimeout(() => doApplySourceMode(isUserClick), isUserClick ? 150 : 0);
	}
	async function doApplySourceMode (isUserClick) {
		const gen = ++applyGen;
		const mode = srcMode();
		setModeCookie(mode);
		const p = await waitFor(() => {
			if (gen !== applyGen) return "stale";
			const pg = page();
			const sf = pg?._pageFilter?.sourceFilter;
			return pg?._filterBox && sf && Object.keys(sf._state || {}).length && listReady(pg) ? pg : null;
		}, {timeout: isUserClick ? 8000 : 120000});
		if (!p || p === "stale" || gen !== applyGen) return;
		if (FULL_MODES.includes(mode) && !LOADED_FULL) {
			loadingVeil("正在载入全部第三方资料……");
			location.reload();
			return;
		}
		if (mode === "manual") return;
		const firstStrict = !strictInstalled;
		installStrictSources(p);
		let n = setSources(p, mode);
		if (firstStrict && strictInstalled) p._filterBox.fireChangeEvent();
		if (!INITIAL_HASH && !isUserClick) {
			// opened without a target: show the first entry of the (re-ordered, re-filtered) list
			setTimeout(() => {
				const first = document.querySelector("#list > li a[href^='#']");
				if (first && location.hash !== first.getAttribute("href")) location.replace(first.getAttribute("href"));
			}, 1200);
		}
		// the page adds third-party sources a moment after its own: re-apply whenever new sources show up
		clearInterval(watchTimer);
		let quiet = 0;
		watchTimer = setInterval(() => {
			if (srcMode() !== mode || gen !== applyGen) { clearInterval(watchTimer); return; }
			const now = Object.keys(p._pageFilter.sourceFilter._state).length;
			if (now !== n) { n = setSources(p, mode); quiet = 0; } else if (++quiet > 40) clearInterval(watchTimer);
		}, 250);
	}

	// ------------------------------------------------------------------ edition switch: 5e (2014) / 5.5e (2024)
	// Only hides an entry when its other-edition twin is really there: the data says "this was reprinted as …"
	// (reprintedAs), the twin is loaded, the twin passes the current filters, and the reprint crosses editions.
	// Anything that exists in one edition only always stays.
	const LS_ED = "ours.edMode2";   // default 5.5e when unset (shell.html has the same rule); "" = 两版
	const ED_MODES = [
		{id: "24", label: "5.5e", tip: "5.5e（2024）：有 2024 版的只显示 2024 版；只有 2014 版的照常显示（按官方兼容规则可以继续用）"},
		{id: "14", label: "5e", tip: "5e（2014）：有 2014 版的只显示 2014 版；只有 2024 版的照常显示"},
		{id: "", label: "两版", tip: "2014 和 2024 版都显示"},
	];
	const ED_PAGES = ["classes", "spells", "feats", "races", "backgrounds", "items", "bestiary", "optionalfeatures"];
	const edMode = () => { const m = lsGet(LS_ED, "24"); return ED_MODES.some(x => x.id === m) ? m : ""; };
	const ED = {sig: null, key: new Map(), newer: new Map(), older: new Map(), same: new Map(), clsOf: new Map(), installed: false, applied: null};
	const lc = s => String(s ?? "").toLowerCase();
	const keysOfEnt = e => [e.name, e.ENG_name].filter(Boolean).map(n => lc(`${n}|${e.source}`));
	const keysOfSc = sc => [sc.shortName, sc.ENG_shortName, sc.name].filter(Boolean).map(n => lc(`${n}|${sc.className}|${sc.source}`));
	function reprintKeys (r, isSc, tag = "spell") {
		const uid = typeof r === "string" ? r : r?.uid;
		if (typeof uid !== "string" || !uid.trim()) return [];
		const parts = uid.split("|").map(s => s.trim());
		if (isSc) return parts.length >= 4 ? [lc(`${parts[0]}|${parts[1]}|${parts[3]}`)] : [];
		// UID display text/extra fields are not part of identity. Items default to DMG, creatures to MM.
		return [lc(`${parts[0]}|${Parser.getTagSource(tag, parts[1])}`)];
	}
	// the classes page renders filtered copies of its classes/subclasses, so twins are looked up by key, not by object
	const isSearchClass = cls => isPinnedEntryActive() && cls
		&& hashEntry(UrlUtil.URL_TO_HASH_BUILDER.class(cls)) === pinnedEntry;
	let pinnedListEntry;
	const isSearchListEntry = (p, ent) => {
		if (!isPinnedEntryActive()) return false;
		const item = pinnedListEntry || (pinnedListEntry = Hist._listPage && Hist.getActiveListItem(pinnedEntry));
		return item != null && p._dataList[item.getId()] === ent;
	};
	const isSearchSubclass = (cls, sc) => isSearchClass(cls)
		&& INITIAL_HASH.toLowerCase().split(/[,:~]/).includes(UrlUtil.getStateKeySubclass(sc) + "=b1");
	const edIds = new WeakMap();
	const edId = e => {
		if (!edIds.has(e)) edIds.set(e, (e.className != null && e.shortName != null)
			? lc(`s|${e.shortName}|${e.className}|${e.classSource}|${e.source}`)
			: lc(`e|${e.name}|${e.source}`));
		return edIds.get(e);
	};
	const edTag = e => Parser.getPropTag(e.__prop || ({classes: "class", spells: "spell", feats: "feat", races: "race", backgrounds: "background", items: "item", bestiary: "monster", optionalfeatures: "optionalfeature"})[PAGE_ID]);
	const isNew = e => {
		if (e?.edition === "one") return true;
		if (e?.edition === "classic") return false;
		// third-party books that ship both versions name them so (CrookedMoon14 / CrookedMoon24); their book-level tag can be wrong
		if (/(?:^|[^0-9])(?:20)?14$/.test(e?.source || "")) return false;
		if (/(?:^|[^0-9])(?:20)?24$/.test(e?.source || "")) return true;
		try { return !SourceUtil.isClassicSource(e.source); } catch (err) { return false; }
	};
	function edIndex (p) {
		const isCls = PAGE_ID === "classes";
		const list = p._dataList || [];
		const sig = list.length + ":" + (isCls ? list.reduce((a, c) => a + (c.subclasses || []).length, 0) : 0);
		if (ED.sig === sig) return;
		ED.sig = sig; ED.key = new Map(); ED.newer = new Map(); ED.older = new Map(); ED.same = new Map(); ED.clsOf = new Map();
		const add = (k, e) => { if (!ED.key.has(k)) ED.key.set(k, []); ED.key.get(k).push(e); };
		const all = [];   // [ent, isSubclass]
		list.forEach(e => {
			keysOfEnt(e).forEach(k => add("e|" + k, e));
			all.push([e, false]);
			if (isCls) (e.subclasses || []).forEach(sc => { ED.clsOf.set(sc, e); keysOfSc(sc).forEach(k => add("s|" + k, sc)); all.push([sc, true]); });
		});
		all.forEach(([e, isSc]) => {
			if (!e.reprintedAs) return;
			[e.reprintedAs].flat().forEach(r => {
				const crossing = (typeof r === "object" && r?.edition === "one");
				const tag = Parser.getPropTag(r?.tag || edTag(e));
				reprintKeys(r, isSc, tag).forEach(k => (ED.key.get((isSc ? "s|" : "e|") + k) || []).forEach(t => {
					if (t === e) return;
					if (!isSc && edTag(t) !== tag) return; // e.g. an invocation becoming a feat is not loaded on this page
					const put = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
					const fromNew = isNew(e), toNew = crossing || isNew(t);
					if (fromNew === toNew) { put(ED.same, edId(e), t); return; } // ordinary reprint, in either edition
					const old = fromNew ? t : e, newer = fromNew ? e : t;
					put(ED.newer, edId(old), newer);
					put(ED.older, edId(newer), old);
				}));
			});
		});
	}
	// is `e` replaced, in the current edition mode, by a twin that is actually showing?
	function edHiddenBy (e, f, baseVisible, m = edMode()) {
		const twins = m === "24" ? ED.newer.get(edId(e)) : m === "14" ? ED.older.get(edId(e)) : null;
		if (!twins) return null;
		for (const t of twins) if (baseVisible(t)) return t;
		return null;
	}
	function installEdition (p) {
		if (ED.installed) return;
		const pf = p._pageFilter;
		const baseToDisplay = pf.toDisplay.bind(pf);
		if (PAGE_ID !== "classes") {
			// The native lists exclude reprints by default, which would leave nothing to switch between:
			// that tag is handed over to this switch. Plain same-edition reprints stay hidden like before.
			const mf = pf.miscFilter;
			for (const key of Object.keys(mf?._state || {})) if (/^(重印|Reprinted)$/i.test(key) && mf._state[key] === 2) mf.setValue(key, 0);
			// A single immutable FilterBox snapshot is shared by both item lists. Cache native checks for that pass.
			const passes = new WeakMap();
			const rawVisible = (f, e) => {
				let pass = passes.get(f);
				if (!pass || pass.sig !== ED.sig) { pass = {sig: ED.sig, values: new WeakMap()}; passes.set(f, pass); }
				if (!pass.values.has(e)) pass.values.set(e, baseToDisplay(f, e));
				return pass.values.get(e);
			};
			const baseVisible = (f, e) => {
				if (!rawVisible(f, e)) return false;
				for (const t of ED.same.get(edId(e)) || []) if (rawVisible(f, t)) return false;
				return true;
			};
			pf.toDisplay = (f, e) => {
				if (isSearchListEntry(p, e)) return true;
				edIndex(p);
				if (!baseVisible(f, e)) return false;
				const mode = ED.applied ?? edMode(); // avoid tens of thousands of localStorage reads per filter pass
				if (!mode) return true;
				return !edHiddenBy(e, f, t => baseVisible(f, t), mode);
			};
		} else {
			const baseScVisible = pf.isSubclassVisible.bind(pf);
			const scVisible = (f, cls, sc) => {
				if (isSearchSubclass(cls, sc)) return true;
				if (!baseScVisible(f, cls, sc)) return false;
				if (!edMode()) return true;
				edIndex(p);
				return !edHiddenBy(sc, f, t => baseScVisible(f, ED.clsOf.get(t) || cls, t));
			};
			pf.isSubclassVisible = scVisible;
			// which subclasses of the class on screen did the edition switch (not the filters) put away, and for what
			ED.subsPutAway = f => {
				const cls = p.activeClass;
				if (!cls || !edMode()) return [];
				return (cls.subclasses || []).filter(sc => baseScVisible(f, cls, sc) && !scVisible(f, cls, sc))
					.map(sc => [sc, edHiddenBy(sc, f, t => baseScVisible(f, ED.clsOf.get(t) || cls, t))]);
			};
			watchSubCount(p);
			pf.toDisplay = (f, cls) => {
				if (isSearchClass(cls)) return true;
				if (!baseToDisplay(f, cls)) return false;
				if (!edMode()) return true;
				edIndex(p);
				const twin = edHiddenBy(cls, f, t => baseToDisplay(f, t));
				if (!twin) return true;
				// safety net: keep the class if one of its (still wanted) subclasses can't be reached from the twin
				const twinKeys = new Set((twin.subclasses || []).flatMap(keysOfSc));
				// (in 5e mode only 2014 subclasses count: a subclass written directly for the 2024 class needs that class)
				const orphan = (cls.subclasses || []).some(sc => scVisible(f, cls, sc)
					&& !(edMode() === "14" && !(sc.edition === "classic" || sc._isCopy))
					&& !keysOfSc(sc).some(k => twinKeys.has(k)));
				return orphan;
			};
		}
		ED.installed = true;
	}
	// the site's "(N个未显示)" note under the subclass buttons doesn't know about the edition switch: say what it hid
	function watchSubCount (p) {
		const abv = src => { try { return Parser.sourceJsonToAbv(src); } catch (e) { return src; } };
		const relabel = () => {
			const el = document.querySelector(".cls-tabs__wrp i.ve-clickable:not([data-ours])");
			if (!el || !ED.subsPutAway) return;
			el.dataset.ours = "1";
			const total = parseInt((el.textContent.match(/\d+/) || [0])[0], 10);
			let away;
			try { away = ED.subsPutAway(p.filterBox.getValues()); } catch (e) { return; }
			if (!away.length) return;
			const ed = edMode() === "24" ? "2014" : "2024";
			const other = total - away.length;
			el.classList.add("ours-edcount");
			el.textContent = other > 0 ? `(${total}个未显示：${away.length}个${ed}版由版本开关收起)` : `(${away.length}个${ed}版已收起)`;
			el.title = `版本开关（${edMode() === "24" ? "5.5e" : "5e"}）收起了这些子职，因为另一版本正在显示：\n`
				+ away.map(([sc, t]) => `  ${sc.name}（${abv(sc.source)}）→ ${t ? `${t.name}（${abv(t.source)}）` : "另一版本"}`).join("\n")
				+ (NT3 ? `\n\n想看它们：把顶部的版本开关切回“两版”。` : NT ? `\n\n想看它们：把左侧栏的「版本」切回“两版”。` : `\n\n想看它们：把顶部蓝色版本开关切回“两版”。`)
				+ (other > 0 ? `\n另外 ${other} 个是被来源筛选隐藏的（${NT3 ? "顶部的资料范围开关" : NT ? "左侧栏的「资料范围」" : "顶部金色来源开关"}决定）。` : "");
		};
		new MutationObserver(() => relabel()).observe(document.body, {childList: true, subtree: true, characterData: true});
		// clicking the note would make the site rewrite the source filter: keep that for filter-hidden ones only
		document.addEventListener("click", e => {
			if (e.target.closest?.(".ours-edcount")) { e.stopPropagation(); e.preventDefault(); }
		}, true);
		relabel();
	}
	let edGen = 0;
	function edRefreshLists (p) {
		// Preserve unchanged native rows on the large pages. Group headers, when present, use the normal render path.
		// The native List still computes all filtering, sorting, visibleItems and counts.
		const restore = [];
		if (NT4 && ["items", "bestiary"].includes(PAGE_ID)) for (const list of pageLists(p)) {
			const before = [...list.visibleItems], original = list._doRender;
			list._doRender = function () {
				const host = this._wrpList, next = this._sortedItems;
				if (host.children.length !== before.length || before.some((it, i) => host.children[i] !== it.ele)) return original.call(this);
				const oldSet = new Set(before), newSet = new Set(next), shared = before.filter(it => newSet.has(it));
				let index = 0;
				const sameOrder = next.every(it => !oldSet.has(it) || it === shared[index++]);
				if (sameOrder) {
					for (const it of before) if (!newSet.has(it)) it.ele.remove();
					let cursor = host.firstElementChild, pending = document.createDocumentFragment();
					for (const it of next) {
						if (it.ele === cursor) { if (pending.childNodes.length) host.insertBefore(pending, cursor); cursor = cursor.nextElementSibling; }
						else pending.append(it.ele);
					}
					if (pending.childNodes.length) host.append(pending);
					this._isDirty = false; this._trigger("updated"); return;
				}
				let start = 0, oldEnd = before.length, newEnd = next.length;
				while (start < oldEnd && start < newEnd && before[start] === next[start]) start++;
				while (oldEnd > start && newEnd > start && before[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
				const anchor = before[oldEnd]?.ele || null, frag = document.createDocumentFragment();
				for (let i = start; i < oldEnd; i++) before[i].ele.remove();
				for (let i = start; i < newEnd; i++) frag.append(next[i].ele);
				host.insertBefore(frag, anchor);
				this._isDirty = false;
				this._trigger("updated");
			};
			restore.push(() => { list._doRender = original; });
		}
		try { p._filterBox.fireChangeEvent(); } finally { restore.forEach(fn => fn()); }
	}
	async function applyEdition () {
		if (!ED_PAGES.includes(PAGE_ID)) return;
		const gen = ++edGen;
		const p = await waitFor(() => {
			const pg = page();
			return pg?._filterBox && pg._pageFilter && pg._dataList?.length && listReady(pg) ? pg : null;
		}, {timeout: 120000});
		if (!p || gen !== edGen) return;
		const first = !ED.installed;
		installEdition(p);
		const m = edMode();
		if (ED.applied === m && !first) return;
		ED.applied = m;
		if (!first) p._prepareEditionRows?.();
		// ListPage skips unchanged FilterBox values. Edition lives outside that box, so invalidate its cache.
		if (PAGE_ID !== "classes") p._lastListFilterValues = null;
		edRefreshLists(p);
		// the class on screen was just replaced by its other-edition twin: go there
		if (PAGE_ID === "classes" && m) setTimeout(() => {
			if (isPinnedEntryActive()) return;
			const cur = p.activeClass;
			if (!cur) return;
			const f = p.filterBox.getValues();
			if (p._pageFilter.toDisplay(f, cur)) return;
			const twin = [...(m === "24" ? ED.newer.get(edId(cur)) || [] : ED.older.get(edId(cur)) || [])][0];
			if (twin) location.hash = UrlUtil.autoEncodeHash(twin);
		}, 300);
	}

	function translateButtons () {
		const T = {
			"Toggle Filter Summary": "显示/隐藏筛选摘要：列出当前生效的筛选条件（红色=被排除，蓝色=只看这些）",
			"Hide Search Bar and Entry List": "隐藏左侧列表，只看右侧正文（阅读模式）",
			"Manage Prerelease Content": "管理预发布内容（UA 测试资料）",
		};
		document.querySelectorAll("button[title]").forEach(b => { if (T[b.title]) b.title = T[b.title]; });
	}

	// ------------------------------------------------------------------ list pages: tier badges + "我们的评价" card
	function decorateList () {
		const p = page();
		if (!p?._list?.items) return;
		for (const item of p._list.items) {
			const ent = p._dataList?.[item.getId()];
			if (!ent) continue;
			const r = itemRating(ent);
			const has = r?.tier;
			const ele = (has || item._oursBadge) ? item.ele : null;
			if (!ele) continue;
			ele.querySelector(".ours-gem")?.remove();
			if (has) {
				const cell = ele.querySelector(".ve-bold") || ele.querySelector("a > span:nth-child(2)") || ele.querySelector("a");
				cell?.insertAdjacentHTML("afterbegin", gem(r.tier, {title: r.comment || ""}));
			}
			item._oursBadge = !!has;
		}
	}

	async function fluffImage (ent) {
		try {
			const prop = ent.__prop;
			const R = Renderer[prop];
			if (!R?.pGetFluff) return null;
			const fluff = await R.pGetFluff(ent);
			const img = fluff?.images?.[0];
			if (!img) return null;
			return Renderer.utils.getEntryMediaUrl(img, "href", "img");
		} catch (e) { return null; }
	}

	let cardFor = null;
	async function renderCard () {
		const p = page();
		const ent = p?._lastRender?.entity;
		const host = document.getElementById("wrp-pagecontent") || document.getElementById("pagecontent")?.parentElement;
		if (!ent || !host) return;
		const key = entKey(ent);
		let card = document.getElementById("ours-card");
		if (card && card.dataset.key === key && cardFor === ent) return;
		cardFor = ent;
		card?.remove();
		const r = itemRating(ent) || {};
		card = h(`<div id="ours-card" class="ours-card" data-key="${esc(key)}">
			<div class="ours-card__art"></div>
			<div class="ours-card__head">
				<span class="ours-card__title">我们的评价</span>
				${r.tier ? gem(r.tier, {big: true}) + `<span class="ours-card__tiername ours-c--${r.tier}">${TIER_NAME[r.tier]}</span>` : `<span class="ours-card__none">还没有评价</span>`}
				<button class="ours-btn ours-card__edit">✎ ${r.tier || r.comment ? "修改" : "写评价"}</button>
			</div>
			${r.comment ? `<div class="ours-card__comment">${md(r.comment)}</div>` : ""}
		</div>`);
		host.appendChild(card);
		card.querySelector(".ours-card__edit").addEventListener("click", () => editItem(ent));
		const url = r.img || await fluffImage(ent);
		if (url && card.isConnected) {
			const art = card.querySelector(".ours-card__art");
			const img = document.createElement("img"); img.alt = "";
			art.classList.add("ours-card__art--on");
			imageSlot(img, art, {src: url, compact: true});
		}
	}

	function tierPicker (current) {
		return `<div class="ours-picker">${TIERS.map(t => `<button class="ours-pick ${current === t ? "ours-pick--on" : ""}" data-tier="${t}">${gem(t, {big: true})}<span>${TIER_NAME[t]}</span></button>`).join("")}
			<button class="ours-pick ${!current ? "ours-pick--on" : ""}" data-tier=""><span class="ours-gem ours-gem--none ours-gem--big">–</span><span>不评</span></button></div>`;
	}
	function bindPicker (root) {
		let val = root.querySelector(".ours-pick--on")?.dataset.tier || "";
		root.querySelectorAll(".ours-pick").forEach(b => b.addEventListener("click", () => {
			root.querySelectorAll(".ours-pick").forEach(x => x.classList.remove("ours-pick--on"));
			b.classList.add("ours-pick--on");
			val = b.dataset.tier;
		}));
		return () => val;
	}

	function editItem (ent) {
		const key = entKey(ent);
		const r = itemRating(ent) || {};
		const m = modal(`评价：${esc(ent.name)} <span class="ours-muted">${esc(Parser.sourceJsonToAbv(ent.source))}</span>`, `
			<div class="ours-form">
				<label>档位</label>${tierPicker(r.tier)}
				<label>评语（支持 - 列表、**加粗**）</label><textarea rows="6" class="ours-in" data-k="comment">${esc(r.comment || "")}</textarea>
				<label>配图地址（可留空：留空时自动用资料自带插图）</label><input class="ours-in" data-k="img" value="${esc(r.img || "")}" placeholder="https://… 或 /img/…">
				<div class="ours-form__btns"><button class="ours-btn ours-btn--primary" data-act="save">保存</button><button class="ours-btn" data-act="del">清除评价</button></div>
			</div>`);
		const getTier = bindPicker(m.el);
		m.el.querySelector("[data-act=save]").addEventListener("click", async () => {
			const v = {tier: getTier(), comment: m.el.querySelector("[data-k=comment]").value.trim(), img: m.el.querySelector("[data-k=img]").value.trim(), t: Date.now()};
			if (!v.tier && !v.comment && !v.img) delete state.user.items[key]; else state.user.items[key] = v;
			await saveUser(); m.close(); cardFor = null; renderCard(); decorateList();
		});
		m.el.querySelector("[data-act=del]").addEventListener("click", async () => {
			delete state.user.items[key];
			await saveUser(); m.close(); cardFor = null; renderCard(); decorateList();
		});
	}

	// Shared native information cells for full cards and compact previews.
	function bookItemProps(pc,ent,statsRow=null) {
		const typeRow = pc.querySelector(".ve-rd-item__type-rarity-attunement")?.closest("tr");
		statsRow ||= typeRow?.nextElementSibling;
		if (ent && statsRow?.tagName === "TR") {
			const cells = [...statsRow.children], right = cells[cells.length - 1];
			const blocks = [...right.querySelectorAll(":scope > .ve-text-wrap-balance")];
			const left = cells.length > 1 || !blocks.length ? cells[0] : null;
			const [damage, properties] = Renderer.item.getRenderedDamageAndProperties(ent);
			const parts = [];
			if (left?.textContent.trim()) parts.push({label: "价值 / 重量", nodes: [left]});
			if (damage && blocks[0] && (ent.dmg1 || ent.ac != null || ent.acSpecial != null)) {
				parts.push({label: ent.dmg1 ? (ent.ac != null || ent.acSpecial != null ? "伤害 / 护甲等级" : "伤害") : "护甲等级", nodes: [blocks[0]]});
			}
			const propertyNodes = [properties ? blocks[damage ? 1 : 0] : null, Renderer.item.getRenderedMastery(ent) ? blocks[(damage ? 1 : 0) + (properties ? 1 : 0)] : null].filter(Boolean);
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
	function listPageV5ItemProps(p,pc) {
		let timer;
		const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(paint,20);});
		const paint=()=>{observer.disconnect();if(!pc.querySelector('.l5-props'))bookItemProps(pc,p._lastRender?.entity);observer.observe(pc,{childList:true,subtree:true});};paint();
	}

	// V5 list controls are a view of the site's filters, never a second list filter.
	let listPageV5CatalogPromise;
	function listPageV5Catalog () {
		return listPageV5CatalogPromise ||= Promise.all([
			DataUtil.loadJSON(`${Renderer.get().baseUrl}data/books.json`),
			DataUtil.loadJSON(`${Renderer.get().baseUrl}data/adventures.json`),
			BrewUtil2.pGetBrewProcessed(), PrereleaseUtil.pGetBrewProcessed(),
		]).then(([books, adventures, brew, prerelease]) => {
			// Match the native catalogue's publication order within each source group (newest first).
			const entries = [...books.book || [], ...adventures.adventure || [], ...brew.book || [], ...brew.adventure || [], ...prerelease.book || [], ...prerelease.adventure || []];
			entries.sort((a, b) => String(b.published || "1970-01-01").localeCompare(String(a.published || "1970-01-01")) || (a.publishedOrder || 0) - (b.publishedOrder || 0) || SortUtil.ascSort(a.name, b.name));
			const catalog = new Map();
			entries.forEach((book, order) => { const src = book.source || book.id; if (!catalog.has(src)) catalog.set(src, {group: book.group, order}); });
			return catalog;
		});
	}
	function listPageV5Sorter (p, catalog) {
		const collator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", {numeric: true, sensitivity: "base"});
		const cache = new WeakMap(), sources = new Map();
		const sourceKey = src => {
			if (sources.has(src)) return sources.get(src);
			const book = catalog.get(src), abv = Parser.sourceJsonToAbv(src);
			const core = ["PHB", "DMG", "MM", "XPHB", "XDMG", "XMM"].includes(src);
			const ua = /^UA/i.test(src) || /^UA/i.test(abv) || SourceUtil.isPrereleaseSource(src);
			const homebrew = !!TIER[src] || BrewUtil2.hasSourceJson(src);
			const layer = core ? 0 : /^Ours/i.test(src) ? 5 : ua ? 7
				: SourceUtil.isPartneredSourceWotc(src) || book?.group === "supplement-alt" ? 4
				: homebrew ? 6 : SourceUtil.isSiteSource(src) && book?.group === "supplement" && !SourceUtil.isAdventure(src) ? 2
				: SourceUtil.isSiteSource(src) && (["setting", "setting-alt"].includes(book?.group) || SourceUtil.isAdventure(src)) ? 3 : 7;
			const value = {layer, core, abv, order: book?.order ?? Infinity, tier: ({A: 0, B: 1, C: 2})[TIER[src]] ?? 3};
			sources.set(src, value); return value;
		};
		return {
			prepare (items) {
				const current = edMode() !== "14";
				for (const item of items) {
					let key = cache.get(item);
					if (!key) {
						const ent = p._dataList[item.getId()], src = ent.source || "";
						const source = sourceKey(src);
						key = {name: ent.name || "", src, source, newer: source.core ? ["XPHB", "XDMG", "XMM"].includes(src) : isNew(ent)}; cache.set(item, key);
					}
					if (key.current !== current) {
						key.current = current;
						key.layer = key.source.core ? (key.newer === current ? 0 : 1) : key.source.layer;
						key.edition = [2, 3].includes(key.layer) && key.newer !== current ? 1 : 0;
					}
				}
			},
			compare (a, b) {
				const x = cache.get(a), y = cache.get(b);
				return x.layer - y.layer || x.edition - y.edition || (x.layer === 6 ? x.source.tier - y.source.tier : 0)
					|| collator.compare(x.name, y.name) || (x.source.order === y.source.order ? 0 : x.source.order - y.source.order)
					|| collator.compare(x.source.abv, y.source.abv) || collator.compare(x.src, y.src) || a.getId() - b.getId();
			},
		};
	}

	// The native List owns the matching items and their count. Only its race-page
	// rendering stage projects those items into family rows.
	function installRaceFamilies (list, entity, decorate, catalogSort, decisions) {
		const host = list._wrpList, header = document.getElementById("filtertools");
		const key = (name, source) => name + "|" + source;
		const root = name => name.split(/[（(;；]/, 1)[0].trim() || name;
		const reviewed = new Map(decisions.map(d => [key(d.name, d.source), d.family]));
		const cache = new WeakMap(), english = new Map();
		const info = item => {
			if (cache.has(item)) return cache.get(item);
			const e = entity(item), parent = e.raceName || e._baseName;
			const family = reviewed.get(key(e.name, e.source))
				|| (parent && reviewed.get(key(parent, e.raceSource || e._baseSource)))
				|| root(parent || e.name);
			const base = !e._isSubRace && (e.name === family || e._isBaseRace && root(e.name) === family && /本相/.test(e.name));
			if (base && e.ENG_name) {
				if (!english.has(family)) english.set(family, []);
				const names = english.get(family), en = list.constructor.getCleanSearchTerm(e.ENG_name);
				if (!names.includes(en)) names.push(en);
			}
			const data = {family, base};
			cache.set(item, data);
			return data;
		};
		list.items.forEach(info);
		const nativeMatch = list._fnSearch;
		list.setFnSearch((item, term) => {
			const {family} = info(item);
			return !term || family.toLowerCase().includes(term) || english.get(family)?.some(name => name.includes(term))
				|| (nativeMatch ? nativeMatch(item, term) : list.constructor.isVisibleDefaultSearch(item, term.replace(/'/g, "")));
		});

		const bookButton = document.createElement("button");
		bookButton.type = "button";
		bookButton.className = "sort ve-btn ve-btn-default ve-btn-xs";
		bookButton.textContent = "书目";
		bookButton.title = "按来源层级和版本排序";
		header.prepend(bookButton);
		bookButton.addEventListener("click", () => list.sort("book", "asc"));
		header.querySelector("[name=list-toggle-all-previews]")?.classList.add("ve-hidden");
		header.classList.remove("ve-hidden");
		const nativeSort = list.getSortedItems.bind(list);
		list.getSortedItems = function (options) {
			return this.sortBy === "book" ? catalogSort(options) : nativeSort(options);
		};

		const storageKey = "ours.raceFamilies.open";
		let opened = new Set();
		try { opened = new Set(JSON.parse(sessionStorage.getItem(storageKey) || "[]")); } catch (_) { /* storage unavailable */ }
		let term, groups = new Map(), orderedGroups = [], current, highlighted, pendingReveal = false;
		const foldedSearch = new Set();
		const isOpen = family => term ? !foldedSearch.has(family) : opened.has(family);
		const buttons = new WeakMap(), rowRoles = new WeakMap();
		const styleRow = (item, group, head) => {
			const row = item.ele, e = entity(item);
			const size = head ? group.members.length : 0;
			const expanded = size > 1 && isOpen(group.family);
			const old = rowRoles.get(row);
			if (old && old.size === size && old.expanded === expanded) return;
			rowRoles.set(row, {size, expanded});
			decorate(item);
			row.dataset.family = group.family;
			row.classList.toggle("rf-child", !head);
			if (head) row.dataset.familySize = size;
			else delete row.dataset.familySize;
			const name = row.querySelector("a .ve-bold");
			if (name?.firstChild?.nodeType === Node.TEXT_NODE) {
				const label = head && (size > 1 || info(item).base) ? group.family : e.name;
				if (name.firstChild.data !== label) name.firstChild.data = label;
				// When the only matching representative is itself a variant, keep
				// its actual title discoverable on the row which opens that entry.
				name.title = e.name;
				const en = name.querySelector(".l5-en");
				if (en) en.textContent = label !== e.name && !info(item).base ? e.name + " · " + e.ENG_name : e.ENG_name;
				else if (label !== e.name && !info(item).base) {
					const sub = name.querySelector(".rf-variant") || document.createElement("small");
					sub.className = "rf-variant"; sub.textContent = e.name; name.append(sub);
				} else name.querySelector(".rf-variant")?.remove();
			}
			let button = buttons.get(row);
			if (size <= 1) { button?.remove(); return; }
			if (!button) {
				button = document.createElement("button");
				button.type = "button"; button.className = "rf-toggle";
				const family = group.family;
				button.addEventListener("click", event => {
					event.stopPropagation();
					setOpen(family, !isOpen(family));
				});
				buttons.set(row, button);
			}
			if (!button.parentNode) row.prepend(button);
			button.setAttribute("aria-expanded", String(expanded));
			button.setAttribute("aria-label", (expanded ? "收起" : "展开") + group.family + "家族");
		};
		const mark = () => {
			const group = current && groups.get(info(current).family);
			const next = group?.members.includes(current) ? (isOpen(group.family) ? current : group.rep).ele : null;
			if (highlighted !== next) {
				highlighted?.classList.remove("rf-current");
				highlighted?.querySelector("a")?.removeAttribute("aria-current");
				next?.classList.add("rf-current");
				next?.querySelector("a")?.setAttribute("aria-current", "page");
				highlighted = next;
			}
		};
		function setOpen (family, value, remember = true) {
			const group = groups.get(family);
			if (!group || group.members.length < 2 || value === isOpen(family)) return;
			if (term) { if (value) foldedSearch.delete(family); else foldedSearch.add(family); }
			else {
				if (value) opened.add(family); else opened.delete(family);
				if (remember) try { sessionStorage.setItem(storageKey, JSON.stringify([...opened])); } catch (_) { /* storage unavailable */ }
			}
			styleRow(group.rep, group, true);
			for (const it of group.members) {
				if (it === group.rep) continue;
				if (value) styleRow(it, group, false);
				it.ele.classList.toggle("ve-hidden", !value);
			}
			mark();
		}
		function reveal () {
			current = Hist.getSelectedListItem();
			const group = current && groups.get(info(current).family);
			pendingReveal = !group?.members.includes(current);
			if (!pendingReveal) {
				if (current !== group.rep) setOpen(group.family, true, !term);
				current.ele.scrollIntoView({block: "nearest"});
			}
			mark();
		}
		window.addEventListener("hashchange", reveal);
		window.addEventListener("keydown", event => {
			if (event.defaultPrevented || !EventUtil.noModifierKeys(event) || EventUtil.isInInput(event)
				|| event.target.closest?.("[contenteditable=true],dialog,.ve-modal__window,.ve-fltr__wrp-filter")) return;
			const dir = {ArrowDown: 1, j: 1, ArrowUp: -1, k: -1}[event.key];
			if (!dir && !["ArrowRight", "ArrowLeft"].includes(event.key)) return;
			const row = event.target.closest?.("[data-family]") || highlighted;
			if (!row && !host.firstElementChild) return;
			event.preventDefault(); event.stopImmediatePropagation();
			if (!dir) {
				if (row) setOpen(row.dataset.family, event.key === "ArrowRight");
			} else {
				const visible = orderedGroups.flatMap(g => isOpen(g.family)
					? [g.rep, ...g.members.filter(it => it !== g.rep)] : [g.rep]);
				const pos = row ? visible.findIndex(it => it.ele === row) : dir > 0 ? -1 : visible.length;
				const link = visible[pos + dir]?.ele.querySelector("a");
				if (link) { link.focus({preventScroll: true}); link.click(); }
			}
		}, true);

		list._doRender = function () {
			if (term !== list._searchTerm) { term = list._searchTerm; foldedSearch.clear(); }
			groups = new Map();
			for (const item of list.visibleItems) {
				const {family, base} = info(item);
				let group = groups.get(family);
				if (!group) groups.set(family, group = {family, members: [], rep: item});
				group.members.push(item);
				if (base && !info(group.rep).base) group.rep = item;
			}
			// Keep the native DOM in native sort order for comparisons, counts and
			// selection. Flex order places the visible children below their representative.
			orderedGroups = [];
			for (const it of list.visibleItems) {
				const group = groups.get(info(it).family);
				if (it === group.rep) { group.order = orderedGroups.length * 2; orderedGroups.push(group); }
			}
			const keep = new Set(list.visibleItems.map(it => it.ele));
			for (const row of [...host.children]) if (!keep.has(row)) row.remove();
			let cursor = host.firstElementChild;
			for (const it of list.visibleItems) {
				const row = it.ele, group = groups.get(info(it).family), head = group.rep === it;
				const hidden = !head && !isOpen(group.family), order = String(group.order + (head ? 0 : 1));
				if (!hidden || rowRoles.has(row)) styleRow(it, group, head);
				row.classList.toggle("ve-hidden", hidden);
				if (row.style.order !== order) row.style.order = order;
				if (row === cursor) cursor = cursor.nextElementSibling;
				else host.insertBefore(row, cursor);
			}
			const byBook = list.sortBy === "book";
			if (bookButton.getAttribute("aria-pressed") !== String(byBook)) {
				bookButton.setAttribute("aria-pressed", String(byBook));
				if (byBook) header.querySelector(".ve-lst__caret--active")?.classList.remove("ve-lst__caret--active");
			}
			if (pendingReveal) reveal(); else mark();
			this._isDirty = false;
			this._trigger("updated");
		};
		host.classList.add("rf-list");
		list._sortBy = list._sortByInitial = "book";
		list._doSearch();
		reveal();
	}
	function listPageV5 (p) {
		if (!NT4 || !["races", "spells", "feats", "backgrounds", "optionalfeatures", "items", "bestiary"].includes(PAGE_ID) || document.querySelector(".l5-qf")) return;
		const pf = p._pageFilter, box = p.filterBox || p._filterBox, lists = pageLists(p);
		const search = document.getElementById("filter-search-group"), pc = document.getElementById("pagecontent");
		if (!pf || !box || !lists.length || !search) return;
		document.documentElement.classList.add("ours-l5");
		document.documentElement.dataset.oursPage = PAGE_ID;
		const hideHeaders = () => document.querySelectorAll("#filtertools, #filtertools-mundane, #filtertools-magic").forEach(el => el.classList.add("ve-hidden"));
		hideHeaders();
		pc?.classList.add("l5-doc");
		const qf = h(`<div class="l5-qf"><div class="l5-qf__row"></div><div class="l5-active ve-hidden"></div></div>`);
		search.after(qf);
		const groups = [], bindings = [];
		const keys = f => (f?._items || []).map(it => it.item);
		const values = f => f.getValues()[f.header];
		const defaultValue = (g, k) => g.resetDefaults ? g.filter._getDefaultItemState(k) : 0;
		const optionKeys = opt => opt.keys || [opt.key];
		const optionState = (g, opt, v = values(g.filter)) => {
			if (g.range) return v._isActive && v.min === opt.min && v.max === opt.max ? 1 : 0;
			return optionKeys(opt).some(k => v[k] === 1) ? 1 : optionKeys(opt).some(k => v[k] === 2) ? 2 : 0;
		};
		const resetGroup = g => {
			if (g.range) g.filter._proxyAssignSimple("state", {curMin: g.filter._state.min, curMax: g.filter._state.max});
			else g.options.forEach(o => optionKeys(o).forEach(k => g.filter.setValue(k, defaultValue(g, k))));
		};
		const labelsByFilter = new Map();
		const label = (f, k) => {
			if (!labelsByFilter.has(f)) labelsByFilter.set(f, new Map());
			const cache = labelsByFilter.get(f);
			if (!cache.has(k)) { const tmp = document.createElement("span"); tmp.innerHTML = f._displayFn ? f._displayFn(k) : String(k); cache.set(k, tmp.textContent); }
			return cache.get(k);
		};
		const row = () => { const r = h(`<div class="l5-qf__row"></div>`); qf.insertBefore(r, qf.lastElementChild); return r; };
		let currentRow = qf.firstElementChild, popup = null, popupButton = null;
		const closePop = (focus = false) => {
			popup?.remove(); popup = null;
			popupButton?.setAttribute("aria-expanded", "false");
			if (focus) popupButton?.focus();
			popupButton = null;
		};
		const sync = () => {
			const active = [];
			const states = new Map(groups.map(g => [g.filter, values(g.filter)]));
			for (const g of groups) {
				const v = states.get(g.filter);
				if (g.range) {
					const opt = g.options.find(o => optionState(g, o, v) === 1);
					if (v._isActive) active.push(`CR ${opt ? opt.text : `${g.filter._labels[v.min]}–${g.filter._labels[v.max]}`}`);
				} else for (const opt of g.options) {
					const state = optionState(g, opt, v);
					if (state) active.push(`${state === 2 ? "排除 " : ""}${opt.active || opt.text}`);
				}
			}
			for (const {button, group, option} of bindings) {
				const v = states.get(group.filter);
				const selected = option ? optionState(group, option, v) === 1 : group.options.some(o => optionState(group, o, v) === 1);
				button.classList.toggle("on", selected);
				button.setAttribute("aria-pressed", String(selected));
				if (!option) button.textContent = group.options.filter(o => optionState(group, o, v) === 1).map(o => o.text).join("、") || "全部";
			}
			const summary = qf.querySelector(".l5-active");
			summary.classList.toggle("ve-hidden", !active.length);
			summary.innerHTML = active.length ? `正在看：${active.map(t => `<b>${esc(t)}</b>`).join(" · ")} <button type="button" class="l5-clear">清除</button>` : "";
		};
		const choose = (g, opt) => {
			const wasOn = optionState(g, opt) === 1;
			if (g.range) {
				if (wasOn) resetGroup(g);
				else g.filter._proxyAssignSimple("state", {curMin: opt.min, curMax: opt.max});
			} else {
				if (g.single) resetGroup(g);
				optionKeys(opt).forEach(k => g.filter.setValue(k, wasOn ? defaultValue(g, k) : 1));
			}
			box.fireChangeEvent();
			sync();
		};
		const add = (name, filter, options, {dropdown = false, single = false, range = false, resetDefaults = false} = {}) => {
			if (!filter || !options.length) return;
			const g = {filter, options, single, range, resetDefaults}; groups.push(g);
			if (name) currentRow.append(h(`<span class="l5-qf__lab">${esc(name)}</span>`));
			if (dropdown) {
				const b = h(`<button type="button" class="l5-chip l5-chip--dd" aria-label="${esc(name)}" aria-haspopup="true" aria-expanded="false">全部</button>`);
				currentRow.append(b); bindings.push({button: b, group: g});
				b.addEventListener("click", () => {
					const wasOpen = popupButton === b; closePop(); if (wasOpen) return;
					popupButton = b; b.setAttribute("aria-expanded", "true");
					popup = h(`<div class="l5-pop" role="group" aria-label="${esc(name)}"></div>`);
					const v = values(filter);
					for (const opt of options) {
						const o = h(`<button type="button" class="l5-pop__opt">${esc(opt.text)}</button>`);
						if (PAGE_ID === 'spells' && filter === pf._schoolFilter) { o.prepend(bookSchoolIconNode(opt.key)); o.classList.add('bk-school-option'); }
						o.classList.toggle("on", optionState(g, opt, v) === 1);
						o.setAttribute("aria-pressed", String(optionState(g, opt, v) === 1));
						o.addEventListener("click", () => { choose(g, opt); closePop(true); });
						popup.append(o);
					}
					document.body.append(popup);
					const r = b.getBoundingClientRect();
					popup.style.position = "absolute";
					popup.style.left = `${Math.max(0, Math.min(r.left, innerWidth - popup.offsetWidth)) + scrollX}px`;
					popup.style.top = `${r.bottom + scrollY}px`;
					popup.querySelector("button")?.focus();
				});
			} else for (const opt of options) {
				const b = h(`<button type="button" class="l5-chip">${esc(opt.text)}</button>`);
				if (PAGE_ID === 'items' && filter === pf._rarityFilter) { b.classList.add('bk-item-rarity-option');b.dataset.bkRarity=bookRarity(opt.key); }
				if (PAGE_ID === 'feats' && filter === pf._categoryFilter) {
					b.prepend(bookOptionIcon('feats', bookFeatIconKey(opt.key)));
					b.classList.add('bk-opt-filter');
				}
				if (range) b.title = opt.text === "17+" ? "单选，再点取消；沿用原生上界，包含未知／特殊 CR" : "单选，再点取消";
				currentRow.append(b); bindings.push({button: b, group: g, option: opt});
				b.addEventListener("click", () => choose(g, opt));
			}
		};
		if (PAGE_ID === "spells") {
			add("环阶", pf._levelFilter, keys(pf._levelFilter).map(k => ({key: k, text: k === 0 ? "戏法" : String(k), active: k === 0 ? "戏法" : `${k}环`})));
			currentRow = row();
			const core = ["野蛮人", "吟游诗人", "牧师", "德鲁伊", "战士", "武僧", "圣武士", "游侠", "游荡者", "术士", "魔契师", "法师", "奇械师"];
			// Non-casters may have no spells. They are still valid choices in the native Class filter.
			core.filter(k => !keys(pf._classFilter).includes(k)).forEach(k => pf._classFilter.addItem(k));
			add("职业", pf._classFilter, core.map(k => ({key: k, text: k})), {dropdown: true, single: true});
			add("学派", pf._schoolFilter, keys(pf._schoolFilter).filter(k => ["A", "C", "D", "E", "V", "I", "N", "T"].includes(k)).map(k => ({key: k, text: label(pf._schoolFilter, k)})), {dropdown: true, single: true});
			for (const [text, pattern] of [["专注", /^(专注|Concentration)$/i], ["仪式", /^(仪式|Ritual)$/i]]) {
				const k = keys(pf._miscFilter).find(k => pattern.test(k));
				if (k != null) add("", pf._miscFilter, [{key: k, text}]);
			}
		} else if (PAGE_ID === "feats") {
			add("类别", pf._categoryFilter, ["O", "G", "FS", "EB"].filter(k => keys(pf._categoryFilter).includes(k)).map(k => ({key: k, text: label(pf._categoryFilter, k)})));
			// Only expose prerequisite toggles if the site actually has such filter items.
			for (const f of Object.values(pf).filter(f => f?._items && f !== pf._sourceFilter)) {
				const opts = keys(f).filter(k => /^(有先决条件|无先决条件|Has Prerequisite|No Prerequisite)$/i.test(k)).map(k => ({key: k, text: label(f, k)}));
				if (opts.length) add("", f, opts);
			}
		} else if (PAGE_ID === "races") {
			add("体型", pf._sizeFilter, [...keys(pf._sizeFilter)].sort((a, b) => Parser.SIZE_ABVS.indexOf(a) - Parser.SIZE_ABVS.indexOf(b)).map(k => ({key: k, text: label(pf._sizeFilter, k)})));
			const dark = keys(pf._traitFilter).find(k => /^(黑暗视觉|Darkvision)$/i.test(k));
			if (dark != null) add("", pf._traitFilter, [{key: dark, text: "黑暗视觉"}]);
		} else if (PAGE_ID === "backgrounds") {
			add("技能熟练", pf._skillFilter, keys(pf._skillFilter).map(k => ({key: k, text: label(pf._skillFilter, k)})), {dropdown: true, single: true});
		} else if (PAGE_ID === "optionalfeatures") {
			const typeKeys = keys(pf._typeFilter), used = new Set();
			const common = [["魔能祈唤", k => k === "EI"], ["战技", k => /^MV:/.test(k)], ["超魔法", k => k === "MM"], ["奇械师注法", k => k === "AI"], ["战斗风格", k => /^FS:/.test(k)]];
			add("类型", pf._typeFilter, common.map(([text, match]) => {
				const ks = typeKeys.filter(match); ks.forEach(k => used.add(k)); return {keys: ks, text};
			}).filter(o => o.keys.length));
			add("其他类型", pf._typeFilter, typeKeys.filter(k => !used.has(k)).map(k => ({key: k, text: label(pf._typeFilter, k)})), {dropdown: true, single: true});
		} else if (PAGE_ID === "items") {
			add("稀有度", pf._rarityFilter, ["common", "uncommon", "rare", "very rare", "legendary", "artifact"].filter(k => keys(pf._rarityFilter).includes(k)).map(k => ({key: k, text: label(pf._rarityFilter, k)})));
			currentRow = row();
			add("类型", pf._typeFilter, keys(pf._typeFilter).map(k => ({key: k, text: label(pf._typeFilter, k)})), {dropdown: true, single: true, resetDefaults: true});
			const attune = keys(pf._attunementFilter).filter(k => /^(?:需要?同调|需要?由.*同调|Requires? Attunement(?: By.*)?)$/i.test(k));
			if (attune.length) add("", pf._attunementFilter, [{keys: attune, text: "需同调"}]);
		} else if (PAGE_ID === "bestiary") {
			const labels = pf._crFilter._labels;
			// RangeFilter stores label indices, not CR numbers, and cannot represent disjoint intervals.
			add("挑战等级", pf._crFilter, [["0–4", "0", "4"], ["5–10", "5", "10"], ["11–16", "11", "16"], ["17+", "17", null]].map(([text, min, max]) => ({text, min: labels.indexOf(min), max: max == null ? pf._crFilter._state.max : labels.indexOf(max)})), {range: true, single: true});
			currentRow = row();
			add("生物类型", pf._typeFilter, Parser.MON_EN_TYPES.filter(k => keys(pf._typeFilter).includes(k)).map(k => ({key: k, text: label(pf._typeFilter, k)})), {dropdown: true, single: true});
			add("体型", pf._sizeFilter, keys(pf._sizeFilter).map(k => ({key: k, text: label(pf._sizeFilter, k)})));
		}
		const more = h(`<button type="button" class="l5-more">更多筛选</button>`);
		currentRow.append(more);
		more.addEventListener("click", () => { closePop(); box.show(); });
		qf.addEventListener("click", e => {
			if (!e.target.closest(".l5-clear")) return;
			groups.forEach(resetGroup);
			box.fireChangeEvent(); sync();
		});
		document.addEventListener("pointerdown", e => { if (popup && !popup.contains(e.target) && e.target !== popupButton) closePop(); });
		document.addEventListener("keydown", e => { if (e.key === "Escape" && popup) { e.preventDefault(); closePop(true); } });
		window.addEventListener("resize", () => closePop());
		document.addEventListener("scroll", e => { if (popup && !popup.contains(e.target)) closePop(); }, true);
		box.on(`${globalThis.FILTER_BOX_EVNT_VALCHANGE || "valchange"}.oursL5`, sync);
		// Modal pills update their state before the modal's Save fires the box event.
		let syncTimer;
		new Set(groups.map(g => g.filter)).forEach(f => f.addHookAllState(() => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 0); }));
		sync();

		// Collapse/reorder only the Source UI; never reorder _filters (toDisplay is positional).
		const source = pf._sourceFilter, sourceKey = `ours.l5.sourceHidden.${PAGE_ID}`;
		if (source) {
			if (lsGet(sourceKey, "1") === "1") source.hide(); else source.show();
			source._addHook("uiMeta", "isHidden", () => lsSet(sourceKey, source._uiMeta.isHidden ? "1" : "0"));
			const moveSource = () => {
				const el = source.__wrpFilter;
				if (!el?.parentElement) return false;
				if (el !== el.parentElement.lastElementChild) el.parentElement.append(el);
				return true;
			};
			if (!moveSource()) {
				const obs = new MutationObserver(() => { if (moveSource()) obs.disconnect(); });
				obs.observe(document.body, {childList: true, subtree: true});
			}
		}

		const done = new WeakSet();
		const entity = item => p._dataList[item.getId()];
		const decorate = item => {
			const el = item.ele;
			if (done.has(el)) return;
			const ent = entity(item), a = el.querySelector("a.ve-lst__row-inner");
			if (!ent || !a) return;
			const cells = [...a.children], name = a.querySelector(".ve-bold"), source = cells[cells.length - 1];
			const metaIndex = {spells: 3, feats: 2, races: 3, backgrounds: 2, optionalfeatures: 2, bestiary: 2};
			const meta = cells[PAGE_ID === "items" ? (ent._fIsMundane ? 1 : 4) : metaIndex[PAGE_ID]];
			if (!name || !meta || !source) return;
			for (const cell of cells) {
				if ([name, meta, source].includes(cell)) {
					for (const cls of [...cell.classList]) if (/^ve-col-/.test(cls)) cell.classList.remove(cls);
				} else cell.classList.add("ve-hidden");
			}
			if (ent.ENG_name) { const en = document.createElement("small"); en.className = "l5-en"; en.textContent = ent.ENG_name; name.append(en); }
			if(PAGE_ID==='items')meta.classList.add('l5-meta','bk-item-list-rarity');else meta.classList.add('l5-meta');
			if (PAGE_ID === "spells") {
				const level = document.createElement("span"); level.className = "l5-lv"; level.textContent = levelText(ent.level).replace(/(\d)环$/, "$1 环"); meta.before(level);
				for (const cls of [...meta.classList]) if (cls.startsWith('ve-sp__school--')) meta.classList.remove(cls);
				meta.prepend(bookSchoolListIconNode(ent.school)); meta.classList.add('bk-school');
				if (ent._isConc) meta.append(h(`<span class="l5-c">专</span>`));
			}
			if (PAGE_ID === "feats") {
				meta.textContent = Parser.featCategoryToFull(ent.category || "其他");
				meta.prepend(bookFeatListIcon(ent.category));
				meta.classList.add('bk-opt-list-category');
			}
			if (PAGE_ID === "races") meta.textContent = (ent.size || [Parser.SZ_VARIES]).map(k => Parser.sizeAbvToFull(k)).join("/");
			if (PAGE_ID === "backgrounds") meta.textContent = meta.textContent.replace(/,\s*/g, "、");
			if (PAGE_ID === "optionalfeatures") meta.textContent = ent._dFeatureType.join("、");
			if (PAGE_ID === "bestiary") meta.textContent = `${item.values.type} · ${ent._pCr}`;
			if (PAGE_ID === "items") {
				meta.textContent = label(pf._rarityFilter, ent.rarity || "none");
				const rarity=bookRarity(ent.rarity);
				// Native magic rows already carry the palette class; add it only when absent.
				// This avoids parsing an inline colour declaration for every list row.
				if(rarity!=='none'&&!meta.classList.contains(`ve-itm__rarity-${rarity}`))meta.classList.add(`ve-itm__rarity-${rarity}`);
				if (/^(?:需要?同调|需要?由.*同调|Requires? Attunement(?: By.*)?)$/i.test(ent._attunementCategory || "")) meta.append(h(`<span class="l5-c">调</span>`));
			}
			done.add(el);
		};
		const levelText = k => Number(k) === 0 ? "戏法" : `${k}环`;
		// Edition can reveal thousands of previously hidden items. Decorate those detached rows before native filtering,
		// so V5 can keep its no-remount path instead of detaching both item tables again after the switch.
		if (PAGE_ID !== "races") p._prepareEditionRows = () => { for (const list of lists) for (const item of list.items) if (!item.ele.isConnected) decorate(item); };
		const groupKey = item => PAGE_ID === "spells" ? entity(item).level : PAGE_ID === "optionalfeatures" ? entity(item).featureType[0] || "其他" : PAGE_ID === "bestiary" ? String(entity(item)._pCr) : entity(item).category || "其他";
		const groupText = key => PAGE_ID === "spells" ? levelText(key) : PAGE_ID === "optionalfeatures" ? label(pf._typeFilter, key) : PAGE_ID === "bestiary" ? `CR ${key}` : Parser.featCategoryToFull(key);
		const grouping = list => ["spells", "feats", "optionalfeatures", "bestiary"].includes(PAGE_ID) && !list._searchTerm;
		const categoryOrder = ["O", "G", "FS", "FS:P", "FS:R", "EB"];
		const compareGroups = (a, b) => {
			const ka = groupKey(a), kb = groupKey(b); if (ka === kb) return 0;
			if (PAGE_ID === "spells") return ka - kb;
			if (PAGE_ID === "bestiary") return SortUtil.ascSortCr(ka, kb) || String(ka).localeCompare(String(kb));
			if (PAGE_ID === "optionalfeatures") {
				const rank = k => k === "EI" ? 0 : /^MV:/.test(k) ? 1 : k === "MM" ? 2 : k === "AI" ? 3 : /^FS:/.test(k) ? 4 : 5;
				return rank(ka) - rank(kb) || String(groupText(ka)).localeCompare(String(groupText(kb))) || String(ka).localeCompare(String(kb));
			}
			const ia = categoryOrder.indexOf(ka), ib = categoryOrder.indexOf(kb);
			return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(ka).localeCompare(String(kb));
		};
		let sorter;
		const paintList = list => {
			if (!sorter) return;
			hideHeaders(); // ItemsPage toggles .ele-mundane/.ele-magic (including the headers) after filtering.
			const host = list._wrpList;
			const items = list.visibleItems, grouped = grouping(list);
			// Native sorting already established row order. Keep the cheap path for both item lists and search results.
			if (!grouped && host.children.length === items.length && items.every((it, i) => done.has(it.ele) && host.children[i] === it.ele)) return;
			const counts = new Map();
			if (grouped) items.forEach(it => counts.set(groupKey(it), (counts.get(groupKey(it)) || 0) + 1));
			if (grouped && host.children.length === items.length + counts.size && items.every(it => done.has(it.ele))) {
				let i = 0, last, same = true;
				for (const it of items) { const key = groupKey(it); if (key !== last) { const head = host.children[i++]; same &&= head?.classList.contains("l5-gh") && head.querySelector(".l5-gh__n")?.textContent === `${counts.get(key)} 个` && head.querySelector(".l5-gh__t")?.textContent === groupText(key); last = key; } same &&= host.children[i++] === it.ele; }
				if (same) return;
			}
			// Detach once; all row edits and grouping happen off-document, with no per-row layout reads.
			const top = host.scrollTop, frag = document.createDocumentFragment();
			host.replaceChildren();
			let previous;
			for (const item of items) {
				decorate(item);
				if (grouped) {
					const key = groupKey(item);
					if (key !== previous) {
						frag.append(h(`<div class="l5-gh"><span class="l5-gh__t">${esc(groupText(key))}</span><span class="l5-gh__n">${counts.get(key)} 个</span></div>`));
						previous = key;
					}
				}
				frag.append(item.ele);
			}
			host.append(frag); host.scrollTop = top;
		};
		for (const list of lists) {
			let paintTimer;
			list.on("updated", () => {
				if (!sorter || list._wrpList.classList.contains("rf-list")) return;
				clearTimeout(paintTimer); paintTimer = setTimeout(() => paintList(list), 20);
			});
		}
		const familyData = PAGE_ID === "races" ? api("/__ours/race-families.json").catch(error => {
			console.warn("种族核对表加载失败，使用原列表", error);
			return null;
		}) : null;
		Promise.all([listPageV5Catalog(), familyData]).then(([catalog, decisions]) => {
			sorter = listPageV5Sorter(p, catalog);
			for (const list of lists) {
				// Use the native sorting stage so filtering/searching mounts rows only once, already in V5 order.
				const catalogSort = ({items = null} = {}) => {
					items ||= [...list._filteredItems]; sorter.prepare(items);
					const grouped = grouping(list);
					return items.sort((a, b) => (grouped ? compareGroups(a, b) : 0) || sorter.compare(a, b));
				};
				if (decisions) { installRaceFamilies(list, entity, decorate, catalogSort, decisions); continue; }
				list.getSortedItems = catalogSort;
				list._doSort(); paintList(list);
			}
		});
		let editionTimer;
		window.addEventListener("message", e => {
			if (e.origin !== location.origin || e.data?.type !== "ours-ed") return;
			clearTimeout(editionTimer); editionTimer = setTimeout(() => {
				if (!sorter) return;
				for (const list of lists) {
					const next = list.getSortedItems();
					if (next.length !== list.visibleItems.length || next.some((it, i) => it !== list.visibleItems[i])) list._doSort();
				}
			}, 20);
		});

		if (PAGE_ID === "items" && pc) listPageV5ItemProps(p, pc);

		if (PAGE_ID === "spells" && pc) {
			const observer = new MutationObserver(() => { clearTimeout(detailTimer); detailTimer = setTimeout(paintDetail, 20); });
			let detailTimer;
			const paintDetail = () => {
				observer.disconnect();
				if (!pc.querySelector(".l5-props")) {
					const labels = ["施法时间", "施法距离", "法术成分", "持续时间"];
					const rows = labels.map(text => [...pc.querySelectorAll("tr")].find(tr => tr.querySelector(":scope > td > b")?.textContent.replace(/[:：]\s*$/, "").trim() === text));
					if (rows.every(Boolean)) {
						const tr = h(`<tr class="l5-props-tr"><td colspan="6"><div class="l5-props"></div></td></tr>`), props = tr.querySelector(".l5-props");
						rows[0].before(tr);
						rows.forEach((r, i) => {
							const prop = h(`<div class="l5-prop"><small>${labels[i]}</small><span></span></div>`), val = prop.lastElementChild, b = r.querySelector(":scope > td > b");
							while (b.nextSibling) val.append(b.nextSibling); // move live links/hover handlers intact
							props.append(prop); r.remove();
						});
					}
				}
				pc.querySelectorAll(".ve-rd__h, .ve-rd__h-inner, b, strong").forEach(title => {
					// 2014: 升环施法 At Higher Levels; 2024: 升环施法 Using a Higher-Level Spell Slot (the site shows the English title after the Chinese)
					if (!/^(?:升环施法(?:\s+(?:At Higher Levels|Using a Higher-Level Spell Slot))?|At Higher Levels|Using a Higher-Level Spell Slot)[.。:：\s]*$/i.test(title.textContent.trim())) return;
					(title.closest(".ve-rd__b") || title.closest("p, div"))?.classList.add("l5-upcast");
				});
				observer.observe(pc, {childList: true, subtree: true});
			};
			paintDetail();
		}
	}

	async function initListPage () {
		const p = await waitFor(() => listReady(page()) ? page() : null, {timeout: 120000});
		tellShell({type: "ours-ready"});
		translateButtons();
		if (p) listPageV5(p);
		if (!p || !RATINGS_ON) return;
		decorateList();
		const pc = document.getElementById("pagecontent");
		if (pc) {
			let busy = false;
			new MutationObserver(() => {
				if (busy) return;
				busy = true;
				requestAnimationFrame(() => { busy = false; renderCard(); });
			}).observe(pc, {childList: true, subtree: false});
			renderCard();
		}
	}

	// ------------------------------------------------------------------ classes page: subclass power ranking
	function currentClassName () {
		const raw = decodeURIComponent(location.hash.slice(1).split(",")[0] || "");
		const ix = raw.lastIndexOf("_");
		return ix > 0 ? raw.slice(0, ix) : raw;
	}
	const listFor = clsName => subLists().find(l => l.class === clsName || (l.classEn || "").toLowerCase() === clsName.toLowerCase());

	function pillIndex () {
		// map "name|ABV" -> button for the subclass pills currently shown
		const out = {};
		document.querySelectorAll("#subclasstabs button").forEach(btn => {
			const divs = btn.querySelectorAll(":scope > div");
			if (divs.length < 2) return;
			const name = (divs[0].getAttribute("title") || "").split(";")[0].trim();
			const abv = divs[divs.length - 1].textContent.trim().replace(/^\(|\)$/g, "");
			out[`${name}|${abv}`] = btn;
		});
		return out;
	}
	const pillsFor = (e, pills) => [...new Set((e.match || []).map(m => pills[`${m.name}|${Parser.sourceJsonToAbv(m.source)}`]).filter(Boolean))];

	function renderRanking () {
		const cls = currentClassName();
		const list = listFor(cls);
		const anchor = document.getElementById("subclasstabs");
		let box = document.getElementById("ours-rank");
		if (!list || !anchor) { box?.remove(); return; }
		const pills = pillIndex();
		// badges on the subclass pills
		document.querySelectorAll("#subclasstabs .ours-gem").forEach(g => g.remove());
		for (const e of list.entries) {
			for (const btn of pillsFor(e, pills)) btn.insertAdjacentHTML("afterbegin", gem(subTier(list, e), {title: `${e.zh} · ${e.score} 分`}));
		}
		if (box && box.dataset.list === list.id && box.dataset.pills === String(Object.keys(pills).length)) return;
		box?.remove();
		const open = lsGet("ours.rankOpen", "1") === "1";
		box = h(`<div id="ours-rank" class="ours-rank ${open ? "" : "ours-rank--closed"}" data-list="${list.id}" data-pills="${Object.keys(pills).length}">
			<div class="ours-rank__head">
				<span class="ours-rank__title">⚔ ${esc(list.class)}子职强度榜</span>
				<span class="ours-muted">2024 底盘 · 3—13 级为主 · 共 ${list.entries.length} 个 · 点卡片看理由</span>
				<span class="ours-rank__spacer"></span>
				<button class="ours-btn ours-btn--ghost" data-act="niche">职业生态位</button>
				<button class="ours-btn ours-btn--ghost" data-act="toggle">${open ? "收起" : "展开"}</button>
			</div>
			<div class="ours-rank__rows">${TIERS.map(t => {
				const es = list.entries.filter(e => subTier(list, e) === t);
				if (!es.length) return "";
				return `<div class="ours-rank__row"><div class="ours-rank__tier ours-bg--${t}">${t}<small>${TIER_NAME[t]}</small></div><div class="ours-rank__chips">${es.map(e => {
					const inSite = pillsFor(e, pills).length > 0;
					const known = (e.match || []).length > 0;
					return `<button class="ours-chip ours-chip--${t} ${inSite ? "" : known ? "ours-chip--hidden" : "ours-chip--missing"}" data-zh="${esc(e.zh)}" title="${esc(e.from)}${known ? "" : "（本站没有这本书）"}">
						<span class="ours-chip__name">${esc(e.zh.replace(/(道途|学院|领域)(?=（|$)/, ""))}</span><span class="ours-chip__score">${e.score.toFixed(1)}</span>
						${subUser(list, e).comment ? `<span class="ours-chip__note" title="有我们的评语">✎</span>` : ""}</button>`;
				}).join("")}</div></div>`;
			}).join("")}</div>
		</div>`);
		anchor.before(box);
		box.querySelector("[data-act=toggle]").addEventListener("click", () => {
			const closed = box.classList.toggle("ours-rank--closed");
			lsSet("ours.rankOpen", closed ? "0" : "1");
			box.querySelector("[data-act=toggle]").textContent = closed ? "展开" : "收起";
		});
		box.querySelector("[data-act=niche]").addEventListener("click", () => modal(`${esc(list.class)}：${esc(list.niche_title || "生态位")}`, `<div class="ours-prose">${md(list.niche)}</div><hr><div class="ours-prose">${md(list.summary)}</div>`, {wide: true}));
		box.querySelectorAll(".ours-chip").forEach(c => c.addEventListener("click", () => openSubclass(list, list.entries.find(e => e.zh === c.dataset.zh))));
	}

	function windowsBars (e) {
		const labels = ["3—5级", "6—9级", "10—13级", "14—20级"];
		return `<div class="ours-bars">${e.windows.map((v, i) => `<div class="ours-bar-row"><span>${labels[i]}</span><div class="ours-bar-track"><div class="ours-bar-fill ours-bg--${e.tier}" style="width:${Math.max(0, Math.min(10, v)) * 10}%"></div></div><b>${v}</b></div>`).join("")}</div>`;
	}

	function openSubclass (list, e) {
		const u = subUser(list, e);
		const tier = subTier(list, e);
		const pills = pillIndex();
		const btns = pillsFor(e, pills);
		const m = modal(`${gem(tier, {big: true})} ${esc(e.zh)} <span class="ours-muted">${esc(e.en || "")}</span>`, `
			<div class="ours-sc">
				<div class="ours-sc__side">
					<div class="ours-sc__score ours-c--${tier}">${e.score.toFixed(2)}<small>总分 · 第 ${e.rank} 名</small></div>
					<div class="ours-sc__meta">基础 ${e.base} ＋ 搭配 ${e.bonus}</div>
					${windowsBars({...e, tier})}
					<dl class="ours-sc__dl">
						<dt>出处</dt><dd>${esc(e.from)}</dd>
						<dt>证据等级</dt><dd>${esc(e.evidence)}</dd>
						<dt>关键搭配</dt><dd>${esc(e.combo || "—")}</dd>
					</dl>
					${btns.length ? `<button class="ours-btn ours-btn--primary" data-act="show">在页面中${btns[0].classList.contains("ve-btn-primary") || btns[0].classList.contains("active") ? "切换" : "显示"}此子职</button>`
		: (e.match || []).length ? `<div class="ours-muted">此子职当前没有显示：可能被来源总开关隐藏（切到“全部”），或属于旧版子职（点子职按钮最后的“未显示”展开）。</div>` : `<div class="ours-muted">本站暂时没有收录这本书。</div>`}
				</div>
				<div class="ours-sc__main ours-prose">${md(e.detail)}
					<div class="ours-sc__mine">
						<div class="ours-sc__mine-head">我们的评语 / 改档 <span class="ours-muted">（保存在本机，不改原始报告）</span></div>
						${tierPicker(u.tier || "")}
						<textarea rows="3" class="ours-in" placeholder="写点自己的看法……">${esc(u.comment || "")}</textarea>
						<div class="ours-form__btns"><button class="ours-btn ours-btn--primary" data-act="save">保存</button><span class="ours-muted">不评 = 用报告原档位（${e.tier}）</span></div>
					</div>
				</div>
			</div>`, {wide: true});
		const getTier = bindPicker(m.el.querySelector(".ours-sc__mine"));
		m.el.querySelector("[data-act=show]")?.addEventListener("click", () => { btns[0].click(); m.close(); });
		m.el.querySelector("[data-act=save]").addEventListener("click", async () => {
			const v = {tier: getTier(), comment: m.el.querySelector(".ours-sc__mine textarea").value.trim()};
			const k = `${list.id}|${e.zh}`;
			if (!v.tier && !v.comment) delete state.user.subclass[k]; else state.user.subclass[k] = v;
			await saveUser(); m.close();
			document.getElementById("ours-rank")?.remove();
			renderRanking();
		});
	}

	async function initClassesPage () {
		const p = await waitFor(() => document.querySelector("#subclasstabs button") ? true : null, {timeout: 120000});
		tellShell({type: "ours-ready"});
		translateButtons();
		if (!p || !RATINGS_ON) return;
		let busy = false;
		const run = () => { if (busy) return; busy = true; requestAnimationFrame(() => { busy = false; renderRanking(); }); };
		new MutationObserver(run).observe(document.getElementById("subclasstabs"), {childList: true, subtree: true});
		window.addEventListener("hashchange", run);
		renderRanking();
	}

	// ------------------------------------------------------------------ home page: the hall
	// One entry per destination (the site's own home repeated several buttons, and its menus — the only way to pages such
	// as 神祇 / 语言 / 遭遇生成器 — are hidden in the shell): a search box, the nine main pages as cards, then every other
	// page in a directory. The site's own home (button stripes, FAQ, compatibility notes, donation, footer) is hidden.
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
		["主持人", [["dmscreen.html", "DM 帷幕"], ["adventures.html", "冒险模组"], ["encountergen.html", "遭遇生成器"], ["lootgen.html", "战利品生成器"],
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
	function hallIllustrations (hall) {
		const hero = hall.querySelector(".oh-hero");
		const isVisible = () => !window.frameElement || getComputedStyle(window.frameElement).visibility === "visible";
		const art = h(`<div class="oh-art" data-state="pending"><div class="oh-art-caption"><a class="oh-art-source"></a><button type="button" class="oh-art-next">↻ 换一张</button></div></div>`);
		hero.append(art);
		let current = -1, heroImage;
		const choose = () => {
			let previous = current;
			if (previous < 0) { try { previous = HALL_ART.findIndex(a => a.path === localStorage.getItem("ours.hallArt")); } catch (e) { /* storage may be unavailable */ } }
			const choices = HALL_ART.map((_, i) => i).filter(i => i !== previous);
			current = choices[Math.floor(Math.random() * choices.length)];
			const entry = HALL_ART[current];
			try { localStorage.setItem("ours.hallArt", entry.path); } catch (e) { /* decorative preference */ }
			art.dataset.path = entry.path;
			art.querySelector(".oh-art-source").textContent = entry.credit;
			art.querySelector(".oh-art-source").href = `book.html#${entry.book},${entry.chapter}`;
			heroImage?.cancel(); heroImage = null; art.dataset.state = "pending";
			// Keep hidden shell preloads and <640px windows entirely image-free.
			if (innerWidth < 640 || !isVisible() || !hall.getClientRects().length || !hero.getBoundingClientRect().width) return;
			const img = document.createElement("img"); img.alt = ""; img.setAttribute("aria-hidden", "true"); img.decoding = "async"; img.style.objectPosition = entry.focus;
			heroImage = imageSlot(img, art, {src: "/img/" + entry.path, attach: node => art.prepend(node),
				onReady: () => { art.dataset.state = "ready"; }, onError: () => { art.dataset.state = "failed"; }});
		};
		art.querySelector(".oh-art-next").addEventListener("click", choose);
		const cards = [...hall.querySelectorAll(".oh-card")];
		const thumbMedia = matchMedia("(min-width: 640px)");
		let visible;
		const syncThumbs = () => cards.forEach((card, i) => {
			const old = card.querySelector(".oh-thumb, .oh-thumb-failed");
			if (!thumbMedia.matches) { old?._imageJob?.cancel(); old?.remove(); return; }
			if (old) return;
			const entry = HALL_THUMBS[HALL[i].k], thumb = document.createElement("span");
			thumb.className = "oh-thumb";
			thumb.style.setProperty("--oh-thumb-crop", entry.crop || 1);
			const img = document.createElement("img"); img.alt = ""; img.setAttribute("aria-hidden", "true"); img.loading = "lazy"; img.decoding = "async"; img.style.objectPosition = entry.focus; img.style.transformOrigin = entry.focus;
			thumb.append(img); card.prepend(thumb);
			// Assign src on visibility, rather than letting native lazy-load fetch
			// images in the shell's hidden, preloaded hall iframe.
			thumb._load = () => {
				if (!thumbMedia.matches || !isVisible() || thumb._imageJob) return;
				thumb._imageJob = imageSlot(img, thumb, {src: "/img/" + entry.path, compact: true, view: card,
					onReady: () => { thumb.classList.replace("oh-thumb-failed", "oh-thumb"); thumb.classList.add("is-ready"); },
					onError: () => { thumb.classList.replace("oh-thumb", "oh-thumb-failed"); }});
			};
			visible?.observe(card);
		});
		syncThumbs(); thumbMedia.addEventListener("change", syncThumbs);
		let active = false;
		const activate = () => {
			if (!isVisible()) return;
			if (!active) { active = true; choose(); }
			else if (innerWidth >= 640 && !art.querySelector("img") && art.dataset.state === "pending") choose();
		};
		visible = new IntersectionObserver(entries => {
			if (!isVisible()) return;
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				if (entry.target === hero) activate();
				else { entry.target.querySelector(".oh-thumb")?._load(); visible.unobserve(entry.target); }
			}
		}, {threshold: 0});
		visible.observe(hero); cards.forEach(card => visible.observe(card));
		const observer = new ResizeObserver(() => { if (active) activate(); });
		observer.observe(hero);
		// Shell preloads keep full-size iframes with visibility:hidden. Ordinary
		// intersection checks alone therefore report them as intersecting.
		if (window.frameElement) new MutationObserver(() => {
			if (!isVisible()) return;
			activate();
			cards.forEach(card => { const r = card.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) card.querySelector(".oh-thumb")?._load(); });
		}).observe(window.frameElement, {attributes: true, attributeFilter: ["class", "style"]});
	}
	async function initHome () {
		const stripe = document.querySelector(".home__stripe");
		if (!stripe) return;
		document.documentElement.classList.add("ours-home");
		[stripe, ...document.querySelectorAll("body > .viewport-wrapper > main.container, body > .viewport-wrapper > footer.container, .home__update-heading, .home__support-banner, #wrp-donate, .cancer__footer-pad")]
			.forEach(e => e.classList.add("ours-hide"));
		const stylesheet = document.createElement("link"); stylesheet.rel = "stylesheet"; stylesheet.href = "/__ours/hall.css"; document.head.append(stylesheet);
		const web = !!window.__OURS_WEB;
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
		stripe.before(hall);
		hallIllustrations(hall);
		hall.querySelector(".oh-search").addEventListener("click", () => {
			// The hall can paint before the site's asynchronous global search arrives.
			const open = (attempt = 0) => {
				if (document.querySelector(".omni__input")) window.postMessage({type: "ours-search"}, location.origin);
				else if (attempt < 200) setTimeout(() => open(attempt + 1), 50);
			};
			open();
		});
		try {
			const s = await api("/__api/stats");
			hall.querySelector("[data-stat=books]").textContent = s.books;
			hall.querySelector("[data-stat=ourBooks]").textContent = s.ourBooks;
			const n = v => Number(v || 0).toLocaleString("zh-CN");
			hall.querySelectorAll("[data-tile]").forEach(el => {
				const k = el.dataset.tile;
				if (k === "books") { el.innerHTML = `官方书 · <b>${s.ourBooks}</b> 本我们的扩充`; return; }
				const line = key => `<b>${n(s.official[key])}</b> 官方 · <b>${n((s.brew[key] || 0) + (s.ours[key] || 0))}</b> 第三方`;
				el.innerHTML = line(k) + (el.dataset.sub ? `<span class="oh-card__sub">子职 ${line(el.dataset.sub)}</span>` : "");
			});
		} catch (e) { /* stats optional */ }
		await loadRatings();
		const ranks = hall.querySelector(".ours-hall__ranks");
		const lists = RATINGS_ON ? subLists() : [];
		if (lists.length) {
			ranks.innerHTML = `<div class="ours-hall__h">⚔ 子职强度榜 <span class="ours-muted">点职业进入，榜单显示在子职按钮上方</span></div>
				<div class="ours-hall__rankgrid">${lists.map(l => {
					const top = [...l.entries].sort((a, b) => b.score - a.score).slice(0, 5);
					return `<a class="ours-rankcard" href="classes.html#${encodeURIComponent(`${l.class}_xphb`).toLowerCase()}">
						<div class="ours-rankcard__cls">${esc(l.class)}<small>${l.entries.length} 个子职</small></div>
						${top.map((e, i) => `<div class="ours-rankcard__row">${gem(e.tier)}<span>${i + 1}. ${esc(e.zh.replace(/（.*）/, ""))}</span><b>${e.score.toFixed(1)}</b></div>`).join("")}
					</a>`;
				}).join("")}</div>`;
		}
	}

	// ------------------------------------------------------------------ V5 library/reader (the native lists and BookUtil own the data/navigation)
	const BK5_SECTIONS = {core: "核心规则", supplement: "官方扩展", setting: "设定集", ours: "我们的扩充", thirdparty: "第三方", partner: "扩展包与合作", other: "其他"};
	const bk5Section = book => {
		if (/^Ours/i.test(book.source || book.id)) return "ours";
		if (book.group === "homebrew") return "thirdparty";
		if (book.group === "supplement-alt" || SourceUtil.isPartneredSourceWotc(book.source)) return "partner";
		if (["core", "supplement"].includes(book.group)) return book.group;
		if (["setting", "setting-alt"].includes(book.group)) return "setting";
		return "other";
	};
	const bk5MetaCache = new Map();
	const BK5_COVER_COLORS = ["wine", "blue", "green", "violet", "brown"];
	const bk5TagKind = (src, abv) => /^Ours/i.test(src) ? "ours" : /'24$|’24$/.test(abv) || ["XPHB", "XDMG", "XMM"].includes(src) ? "24" : /^UA/.test(src) || /^UA/.test(abv) ? "ua" : TIER[src] ? "3p" : "14";
	function bk5Metas (books) {
		// Tier data can arrive after the native books; refresh tag kinds without re-reading source colors.
		books.forEach(book => { const src = book.source || book.id, meta = bk5MetaCache.get(src); if (meta) meta.kind = bk5TagKind(src, meta.abv); });
		const fresh = books.filter(book => !bk5MetaCache.has(book.source || book.id));
		if (!fresh.length) return;
		const holder = document.createElement("div"); holder.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
		const probes = fresh.map(book => { const el = document.createElement("span"); el.className = Parser.sourceJsonToSourceClassname(book.source || book.id); holder.append(el); return el; });
		document.body.append(holder);
		const base = getComputedStyle(holder).color;
		// Batch all style reads before removing the probes; no per-book DOM write/read cycle.
		const colors = probes.map(el => getComputedStyle(el).color);
		holder.remove();
		fresh.forEach((book, i) => {
			const src = book.source || book.id, abv = Parser.sourceJsonToAbv(src);
			const kind = bk5TagKind(src, abv);
			const sourceColor = colors[i] !== base ? colors[i] : "";
			bk5MetaCache.set(src, {abv, kind, sourceColor});
		});
	}
	function bk5Cover (book, {small = false} = {}) {
		const meta = bk5MetaCache.get(book.source || book.id);
		if (book.cover && !/^Ours/i.test(book.source || book.id)) {
			const img = `<img${small ? ' class="bk5-tochead__img"' : ""} src="${esc(Renderer.adventureBook.getCoverUrl(book))}" loading="lazy" alt="${esc(book.name)}封面">`;
			return small ? `<span class="bk5-tochead__media">${img}</span>` : img;
		}
		let hash = 0;
		for (const c of (book.id || book.source).toLowerCase()) hash = Math.imul(hash, 31) + c.codePointAt(0) | 0;
		const color = `var(--bk-cover-${BK5_COVER_COLORS[(hash >>> 0) % BK5_COVER_COLORS.length]})`;
		return small ? `<span class="bk5-tochead__gen" style="--c:${color}">${esc(meta.abv)}</span>` : `<div class="bk5-gen" style="--c:${color}"><span class="bk5-gen__a">${esc(meta.abv)}</span><span class="bk5-gen__t">${esc(book.name)}</span><span class="bk5-gen__f">${BK5_SECTIONS[bk5Section(book)]}</span></div>`;
	}
	function bookShelfV5 (p) {
		if (document.querySelector(".bk5")) return;
		const original = document.getElementById("listcontainer"), input = document.getElementById("lst__search") || document.getElementById("search");
		if (!original || !input) return;
		const shelf = h(`<div class="bk5"><div class="bk5-head"><h1 class="bk5-title">${PAGE_ID === "adventures" ? "冒险模组" : "书库"}</h1><span class="bk5-n"></span><div class="bk5-search"></div></div><div class="bk5-chips"></div><div class="bk5-sections"></div></div>`);
		original.before(shelf); original.classList.add("ve-hidden");
		// This site calls the input #search. Keep the live element and its native List bindings.
		input.id = "lst__search"; shelf.querySelector(".bk5-search").append(input);
		shelf._bk5Page = p; // Native list reference, also useful to audits; no replacement VE_OURS_PAGE/filter.
		let selected = "", timer, rangeStamp = "";
		const applyRange = () => {
			const mode = srcMode(), stamp = `${mode}|${Object.keys(TIER).length}`;
			if (rangeStamp === stamp) return;
			rangeStamp = stamp;
			if (FULL_MODES.includes(mode) && !LOADED_FULL) { location.reload(); return; }
			// Books have no PageFilter/SourceFilter. Apply the existing top-bar policy through the native List API.
			const fn = ["all", "manual"].includes(mode) ? null : item => { const book = p._dataList[item.getId()]; return !!wantSource(mode, book.source || book.id); };
			p._list.filter(fn); p._listAlt.filter(fn);
		};
		const paint = () => {
			if (!p._list._isInit) return;
			applyRange();
			const entries = p._list.visibleItems.map(item => ({book: p._dataList[item.getId()], href: item.ele.querySelector("a").getAttribute("href")}));
			bk5Metas(entries.map(e => e.book));
			const bySection = new Map(Object.keys(BK5_SECTIONS).map(k => [k, []]));
			entries.forEach(e => bySection.get(bk5Section(e.book)).push(e));
			if (selected && !bySection.get(selected).length) selected = "";
			shelf.querySelector(".bk5-n").textContent = `${selected ? bySection.get(selected).length : entries.length} 本`;
			shelf.querySelector(".bk5-chips").innerHTML = `<button type="button" class="bk5-chip${selected ? "" : " on"}" data-sec="" aria-pressed="${!selected}">全部<b>${entries.length}</b></button>`
				+ [...bySection].filter(([, es]) => es.length).map(([k, es]) => `<button type="button" class="bk5-chip${selected === k ? " on" : ""}" data-sec="${k}" aria-pressed="${selected === k}">${BK5_SECTIONS[k]}<b>${es.length}</b></button>`).join("");
			const frag = document.createDocumentFragment();
			for (const [k, es] of bySection) {
				if (!es.length || selected && selected !== k) continue;
				const section = h(`<section class="bk5-sec" data-sec="${k}"><h2 class="bk5-h">${BK5_SECTIONS[k]}<span>${es.length} 本</span></h2><div class="bk5-shelf"></div></section>`);
				section.lastElementChild.innerHTML = es.map(({book, href}) => {
					const m = bk5MetaCache.get(book.source || book.id);
					return `<a class="bk5-book" href="${esc(href)}"><div class="bk5-cover"><div class="bk5-jacket">${bk5Cover(book)}</div></div><div class="bk5-name">${esc(book.name)}</div><div class="bk5-meta"><span class="nt-tag nt-tag--${m.kind}"${m.sourceColor ? ` style="--src:${m.sourceColor}"` : ""}>${esc(m.abv)}</span> ${esc((book.published || "").slice(0, 4))}</div></a>`;
				}).join("");
				frag.append(section);
			}
			shelf.querySelector(".bk5-sections").replaceChildren(frag);
			imageNativeScan(shelf.querySelector(".bk5-sections"));
			tellShell({type: "ours-ready"});
		};
		const later = () => { clearTimeout(timer); timer = setTimeout(paint, 20); };
		p._list.on("updated", later);
		shelf.querySelector(".bk5-chips").addEventListener("click", e => { const b = e.target.closest(".bk5-chip"); if (b) { selected = b.dataset.sec; later(); } });
		window.addEventListener("toolsLoaded", later); later();
		window.addEventListener("message", e => { if (e.origin === location.origin && e.data?.type === "ours-mode") later(); });
		waitFor(() => Object.keys(TIER).length, {timeout: 2000}).then(later);
	}
	const BK_DOC_HEADINGS = ".ve-rd__h:is(.ve-rd__h--0, .ve-rd__h--1, .ve-rd__h--2)";
	function bkDocEnglish (title, source) {
		if (!title) return;
		const value = title.textContent;
		const lastHan = /\p{Script=Han}(?![\s\S]*\p{Script=Han})/u.exec(value);
		if (!lastHan) return;
		const afterHan = lastHan.index + lastHan[0].length;
		// Native title tracking preserves the Chinese name, including any Latin abbreviations in it.
		const native = typeof source === "string" ? Renderer.stripTags(source).trim() : "";
		const boundary = value.startsWith(native) && native.length >= afterHan
			? (/^\s/u.test(value.slice(native.length)) ? native.length : -1)
			: value.slice(afterHan).search(/\s/u) + afterHan;
		if (boundary < afterHan || !/\p{Script=Latin}/u.test(value.slice(boundary))) return;
		const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
		const spans = [];
		let offset = 0;
		for (let node; (node = walker.nextNode()); ) {
			const end = offset + node.length;
			if (end > boundary) spans.push([node, Math.max(0, boundary - offset)]);
			offset = end;
		}
		for (const [i, [node, index]] of spans.entries()) {
			const suffix = index ? node.splitText(index) : node;
			const span = bookItemMake("span", i ? "bk-doc-en" : "bk-doc-en bk-doc-en-start");
			suffix.before(span);
			span.append(suffix);
		}
	}
	function bkDocDropcap (heading) {
		for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
			if (el.matches(".ve-rd__h, .ve-rd__b--named") || el.querySelector(":scope > .ve-rd__h") && !el.matches(".ve-rd__b-inset")) return;
			if (el.tagName !== "P") continue;
			const value = el.textContent.trim();
			if (value.length >= 60 && /^[\p{Script=Han}\p{Script=Latin}]/u.test(value)) el.classList.add("bk-dropcap");
			return;
		}
	}
	function bookDocumentV5 (B, pc) {
		let current;
		const decorate = () => {
			const cell = pc.querySelector(":scope > tr > td.ve-py-2.ve-px-5");
			if (!cell || cell === current) return;
			current = cell;
			const render = B.curRender, tracked = B._renderer.getTrackedTitles();
			const starts = render.chapter === -1 ? render.allViewFirstTitleIndexes : [0];
			const headings = cell.querySelectorAll(BK_DOC_HEADINGS);
			// Read native lazy placeholders before the intersection observer swaps their URLs.
			for (const img of cell.querySelectorAll('.ve-rd__image[src^="data:image/svg+xml,"]')) {
				const size = img.getAttribute("src").match(/%20width%3D%22([\d.]+)%22%20height%3D%22([\d.]+)%22/);
				if (!size || +size[2] <= +size[1] || img.closest(".ve-rd__wrp-map, .ve-rd__comic-img-speaker") || img.style.maxHeight) continue;
				img.classList.add("bk-doc-portrait");
				if (+size[2] >= 480) img.classList.add("bk-doc-portrait-large");
			}
			let i = 0, chapter = -1, needsTitle = false;
			const batch = () => {
				if (cell !== current || !cell.isConnected) return;
				const deadline = performance.now() + 6;
				// Also bound DOM writes: even a fast batch can defer expensive style work to the next native scroll.
				const end = Math.min(i + 48, headings.length);
				while (i < end && performance.now() < deadline) {
					const heading = headings[i++], index = Number(heading.dataset.titleIndex);
					while (chapter + 1 < starts.length && index >= starts[chapter + 1]) { chapter++; needsTitle = true; }
					if (needsTitle && heading.matches(".ve-rd__h--0")) {
						needsTitle = false;
						heading.classList.add("bk-ch-title");
						bkDocDropcap(heading);
					}
					bkDocEnglish(heading.querySelector(":scope > .entry-title-inner"), tracked[index]);
				}
				if (i < headings.length) setTimeout(batch, 24);
				else cell._bkDocReady = true;
			};
			batch();
		};
		new MutationObserver(decorate).observe(pc, {childList: true});
		decorate();
	}
	function bookReaderV5 (B, pc, toc) {
		const crumbs = h(`<div class="bk5-crumbs"><a class="bk5-crumbs__book"></a><span class="bk5-crumbs__sep">›</span><span class="bk5-crumbs__ch"></span><span class="bk5-crumbs__sep">›</span><span class="bk5-crumbs__sec"></span><span class="bk5-crumbs__sp"></span></div>`);
		const pn = h(`<div class="bk5-pn"></div>`); pc.before(crumbs); pc.after(pn); pc.classList.add("bk5-doc");
		bookDocumentV5(B, pc);
		let timer, scrollTimer, signature = "", targets = [], chapters = [], currentLink = null, movedControls = [], lastHash = "", requested = null;
		const scrollPosition = () => { let y = window.scrollY; for (let el = pc.parentElement; el; el = el.parentElement) y += el.scrollTop; return y; };
		const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
		const chapterName = chapter => { if (!chapter) return ""; const el = document.createElement("span"); el.innerHTML = Parser.bookOrdinalToAbv(chapter.ordinal); return el.textContent + chapter.name; };
		const triangle = (native, parent) => {
			if (!native || !parent) return;
			native.classList.add("ve-hidden");
			let car = native._bk5Car;
			if (!car || !car.isConnected) {
				car = h(`<button type="button" class="bk5-car"></button>`); native._bk5Car = car; parent.prepend(car);
				car.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); native.click(); later(); });
			}
			const open = native.textContent.trim() !== "[+]";
			car.classList.toggle("open", open); car.setAttribute("aria-expanded", String(open)); car.setAttribute("aria-label", open ? "收起目录" : "展开目录"); text(car, open ? "▾" : "▸");
		};
		const scroll = () => {
			scrollTimer = null;
			const r = B.curRender; if (!r.fromIndex?.contents) return;
			const limit = Math.max(0, crumbs.getBoundingClientRect().bottom) + 24;
			const positions = targets.map(t => ({...t, rect: t.target.getBoundingClientRect()})).filter(t => t.rect.width || t.rect.height);
			let hit = null; for (const pos of positions) if (pos.rect.top <= limit) hit = pos;
			// A short final section cannot always reach the viewport top. Honor the native anchor jump until the reader actually scrolls elsewhere.
			if (requested) {
				const y = scrollPosition();
				if (requested.y != null && Math.abs(requested.y - y) > 2) requested = null;
				else {
					const intended = positions.find(pos => pos.link === requested.link && pos.rect.top >= 0 && pos.rect.top < innerHeight);
					if (intended) { hit = intended; requested.y = y; }
				}
			}
			let chapter = r.chapter;
			if (chapter === -1) {
				chapter = 0;
				for (const ch of chapters) if (ch.target.getBoundingClientRect().top <= limit) chapter = ch.chapter;
				if (hit && hit.chapter !== chapter) hit = null;
			}
			r.lnksChapter.forEach((link, i) => link.classList.toggle("bk5-cur", i === chapter));
			if (currentLink !== hit?.link) { currentLink?.classList.remove("bk5-cur-sec"); currentLink = hit?.link || null; currentLink?.classList.add("bk5-cur-sec"); }
			text(crumbs.querySelector(".bk5-crumbs__ch"), chapterName(r.fromIndex.contents[chapter]));
			text(crumbs.querySelector(".bk5-crumbs__sec"), hit?.link.dataset.header || "");
		};
		const laterScroll = () => { if (!scrollTimer) scrollTimer = setTimeout(scroll, 80); };
		const buildTargets = r => {
			const headers = [...pc.querySelectorAll(".ve-rd__h[data-title-index]")];
			const stats = new Map([...pc.querySelectorAll("[data-statblock-hash]")].map(el => [el.dataset.statblockHash, el]));
			const starts = r.allViewFirstTitleIndexes;
			const chapterOf = el => { if (r.chapter !== -1) return r.chapter; let ch = 0; const ix = Number(el.dataset.titleIndex); starts.forEach((start, i) => { if (ix >= start) ch = i; }); return ch; };
			chapters = r.chapter === -1 ? starts.map((start, i) => ({chapter: i, target: headers.find(el => Number(el.dataset.titleIndex) >= start)})).filter(c => c.target) : [];
			const tracked = B._renderer.getTrackedTitles(), named = new Map();
			const headingInfo = headers.map(el => {
				const ch = chapterOf(el), title = (el.querySelector(".entry-title-inner")?.textContent || "").trim().toLowerCase();
				const raw = tracked[el.dataset.titleIndex], key = `${ch}|${typeof raw === "string" ? raw.trim().toLowerCase() : title}`;
				if (!named.has(key)) named.set(key, []); named.get(key).push(el);
				return {el, ch, title};
			});
			targets = [];
			Object.entries(r.lnksHeader).forEach(([ch, links]) => {
				if (r.chapter !== -1 && Number(ch) !== r.chapter) return;
				links.forEach(link => {
					const parts = link.getAttribute("href").slice(1).split(","), name = link.dataset.header.toLowerCase().trim();
					const stat = parts[2]?.startsWith("stathash-") ? stats.get(parts[2].slice(9)) : null;
					const title = named.get(`${ch}|${name}`)?.[Number(parts[3]) || 0] || headingInfo.filter(h => h.ch === Number(ch) && (h.title === name || h.title.startsWith(name + " ") || h.title.startsWith(name + ".")))[Number(parts[3]) || 0]?.el;
					// Some native books have a named intro AND a later embedded stat block for the same TOC link.
					for (const target of new Set([title, stat].filter(Boolean))) targets.push({link, target, chapter: Number(ch)});
				});
			});
			targets.sort((a, b) => a.target === b.target ? 0 : a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
			if (lastHash !== location.hash) {
				lastHash = location.hash;
				const link = targets.find(t => t.link.getAttribute("href").toLowerCase() === lastHash.toLowerCase())?.link;
				requested = link ? {link, y: null} : null;
			}
		};
		const observer = new MutationObserver(records => {
			if (records.every(({target, addedNodes, removedNodes}) => target.closest?.(".entry-title-inner, .bk-img-status") ||
				[...addedNodes, ...removedNodes].every(node => node.matches?.(".bk-img-status")))) return;
			clearTimeout(timer); timer = setTimeout(paint, 20);
		});
		const paint = () => {
			observer.disconnect();
			const r = B.curRender, book = r.fromIndex;
			const back = toc.querySelector(`a[href="${B.allPageUrl}"]`); if (back) text(back, PAGE_ID === "adventure" ? "← 冒险模组" : "← 书库");
			if (book?.contents) {
				bk5Metas([book]);
				let head = toc.querySelector(".bk5-tochead");
				if (!head || head.dataset.book !== book.id) {
					head?.remove(); head = h(`<div class="bk5-tochead" data-book="${esc(book.id)}">${bk5Cover(book, {small: true})}<span class="bk5-tochead__t">${esc(book.name)}</span><span class="bk5-tochead__s">${esc(bk5MetaCache.get(book.source || book.id).abv)} · ${book.contents.length} 章</span></div>`);
					if (back) back.parentElement.after(head); else toc.prepend(head);
					imageNativeScan(head);
				}
				toc.querySelector(".bk__contents-header")?.classList.add("ve-hidden");
				triangle(r.btnToggleExpandAll, head);
				r.lnksChapter.forEach((link, i) => triangle(r.btnsToggleExpand[i], link));
				const oldTop = r.controls.btnsPrv?.[0]?.closest("tr");
				if (oldTop) {
					const controls = [...oldTop.querySelectorAll("a,button")].filter(node => /^查看完整/.test(node.textContent.trim()) || node.querySelector(".glyphicon-option-vertical"));
					if (controls.length) { movedControls.forEach(node => node.remove()); controls.forEach(node => crumbs.append(node)); movedControls = controls; }
				}
				for (const node of [...r.controls.btnsPrv || [], ...r.controls.btnsNxt || []]) node.closest("tr")?.classList.add("ve-hidden");
				B.wrpFloatControls?.classList.add("ve-hidden");
				const bookLink = crumbs.querySelector(".bk5-crumbs__book"); text(bookLink, book.name); bookLink.setAttribute("href", `#${UrlUtil.encodeForHash(book.id)}`);
				const sig = `${book.id}|${r.chapter}|${book.contents.length}`;
				if (sig !== signature) {
					signature = sig;
					pn.replaceChildren(); pn.classList.toggle("ve-hidden", r.chapter === -1);
					if (r.chapter !== -1) for (const [mod, cls, label] of [[-1, "prev", "← 上一章"], [1, "next", "下一章 →"]]) {
						const ch = book.contents[r.chapter + mod], native = (mod < 0 ? r.controls.btnsPrv : r.controls.btnsNxt)?.[0];
						if (!ch || !native) { pn.append(h(`<span class="bk5-pn__empty"></span>`)); continue; }
						const link = h(`<a class="bk5-pn__${cls}" href="${esc(native.getAttribute("href"))}"><small>${label}</small><span>${esc(chapterName(ch))}</span></a>`);
						link.addEventListener("click", () => MiscUtil.scrollPageTop()); pn.append(link);
					}
				}
				buildTargets(r); laterScroll(); tellShell({type: "ours-ready"});
			}
			observer.observe(pc, {childList: true, subtree: true}); observer.observe(toc, {childList: true, subtree: true});
		};
		const later = () => { clearTimeout(timer); timer = setTimeout(paint, 20); };
		window.addEventListener("hashchange", later); window.addEventListener("toolsLoaded", later);
		document.addEventListener("scroll", laterScroll, true); window.addEventListener("scroll", laterScroll, {passive: true}); window.addEventListener("resize", laterScroll);
		paint();
	}
	function bookPagesV5 () {
		if (!NT4 || !["books", "book", "adventures", "adventure"].includes(PAGE_ID)) return;
		document.documentElement.classList.add("ours-bk"); document.documentElement.dataset.oursPage = PAGE_ID;
		const css = bookItemMake("link");
		css.rel = "stylesheet";
		css.href = "/__ours/bookpage.css";
		document.head.append(css);
		if (["books", "adventures"].includes(PAGE_ID)) {
			// These ES-module instances are not exposed as VE_OURS_PAGE. Capture the actual instance as it receives data.
			import(new URL("js/bookslist.js", document.baseURI).href).then(({AdventuresBooksList}) => {
				const original = AdventuresBooksList.prototype.addData;
				AdventuresBooksList.prototype.addData = function (...args) { const result = original.apply(this, args); bookShelfV5(this); return result; };
			});
		} else waitFor(() => globalThis.BookUtil && document.getElementById("pagecontent") && document.getElementById("lst-contents"), {timeout: 120000}).then(toc => { if (toc) bookReaderV5(BookUtil, document.getElementById("pagecontent"), toc); });
	}

	// ------------------------------------------------------------------ boot
	async function boot () {
		document.documentElement.classList.add("ours-local");
		bindSearch();
		imageNativeInit();
		bookMonsterCards();
		bookSpellCards();
		bookItemCards();
		bookOptionCards();
		bookPagesV5();
		widenOptionLinks();
		lookupMissingBrew();
		attachOursVariants();
		if (PAGE_ID === "classes") {
			attachSubclassLevels();
			const stylesheet = document.createElement("link");
			stylesheet.rel = "stylesheet";
			stylesheet.href = "/__ours/classpage.css";
			document.head.append(stylesheet);
		}
		if (IN_SHELL) { document.documentElement.classList.add("ours-in-shell"); bindShellNav(); } else buildBar();
		if (NT) { bindNotionSearch(); if (NT2) notionClassPageV2(); else notionClassLayout(); if (NT4) classPageV4(); }
		// a standalone tab follows switches made in other tabs; inside the shell only the shell tells a page to switch
		if (!IN_SHELL) window.addEventListener("storage", e => { if (e.key === LS_ED) { paintEd(); applyEdition(); } });
		if (!IN_SHELL) window.addEventListener("storage", e => { if (e.key === LS_MODE) { document.querySelectorAll(".ours-seg").forEach(b => b.classList.toggle("ours-seg--on", b.dataset.mode === srcMode())); applySourceMode(true); } });
		if (cookieMode() !== srcMode()) setModeCookie(srcMode());
		await loadRatings();
		if (PAGE_ID === "index" || PAGE === "") { tellShell({type: "ours-ready"}); return initHome(); }
		try { TIER = await api("/__api/tiers"); } catch (e) { /* server too old: 推荐 = official only */ }
		if (NT) notionTags();
		applySourceMode(false);
		applyEdition();
		if (PAGE_ID === "classes") initClassesPage();
		else initListPage();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
	else boot();
})();
