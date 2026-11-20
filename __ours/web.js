/* Generated-site adapter. app.py remains the authority for every JSON value.
 * Recipes join content-addressed properties back into its exact responses.
 * Loaded before site scripts; no service worker or response headers required. */
(() => {
    "use strict";
    if (!window.__OURS_WEB) return;
    const W = window.__OURS_WEB;
    // The same snapshot can be mounted at "/" or at a project Pages prefix.
    const mount = new URL(document.currentScript.src).pathname.replace(/\/__ours\/web\.js$/, '');
    const atMount = value => typeof value === 'string' && mount && /^\/(?!\/)/.test(value)
        && !value.startsWith(mount + '/') ? mount + value : value;
    // The static loader defers site scripts until assets arrive. Restore the
    // theme here, in <head>, so even the real DOMContentLoaded has its marker.
    const root = document.documentElement;
    let initialTheme = "day";
    try {
        initialTheme = localStorage.getItem("ours.theme") === "night" ? "night" : "day";
        localStorage.setItem("StyleSwitcher_style", initialTheme);
    } catch (e) { /* storage unavailable: default to day */ }
    root.dataset.oursTheme = initialTheme;
    root.classList.toggle("ve-night-mode", initialTheme === "night");
    root.classList.toggle("ve-night-mode--standard", initialTheme === "night");
    // A warm canvas while boot() conceals the unstyled document. Once CSS is
    // available this stays a live variable, including after further toggles.
    root.style.backgroundColor = `var(--v3-paper, ${initialTheme === "night" ? "#17120e" : "#fbf3e1"})`;
    // A plain local HTTP/1.0 server has a small accept queue. GitHub Pages uses
    // HTTP/2: allow 16 requests there to overlap the ~300–350 ms network RTT.
    const REQUEST_CONCURRENCY = location.hostname === 'localhost' ||
        /^127(?:\.\d{1,3}){3}$/.test(location.hostname) ||
        location.hostname === '[::1]' || location.hostname === '::1' ? 2 : 16;
    let active = 0;
    const queue = [];
    W.limit = fn => new Promise((resolve, reject) => {
        queue.push(async () => {
            active++;
            try { resolve(await fn()); } catch (e) { reject(e); }
            finally { active--; queue.shift()?.(); }
        });
        if (active < REQUEST_CONCURRENCY) queue.shift()?.();
    });
    const pending = new Map();
    // Download progress (shown by the shell's loadbar.js): every file the build listed as big (W.sizes, bytes before
    // compression) counts, whether the site asks for it with XMLHttpRequest (its own data) or fetch (assets, our books).
    // All downloads of this page add up to one job; a file's share is reported as a fraction of its known size,
    // because the browser counts compressed bytes for XHR and decompressed bytes for fetch.
    const job = {id: 'web:' + location.pathname + ':' + Math.random().toString(36).slice(2), files: new Set()};
    const loadBar = () => { try { return window.top.__oursLoad || null; } catch (e) { return null; } };
    const pageName = () => location.pathname === '/home.html' ? 'index.html' : location.pathname.split('/').pop();
    const report = () => {
        const bar = loadBar();
        if (!bar) return;
        if (![...job.files].some(f => !f.done)) { bar.done(job.id); job.files.clear(); return; }
        let loaded = 0, total = 0;
        for (const f of job.files) { total += f.size; loaded += f.done ? f.size : Math.min(f.size, Math.round(f.size * f.part)); }
        bar.progress(job.id, {page: pageName(), label: '资料', loaded, total});
    };
    const sizeOf = url => { try { return (W.sizes || {})[decodeURI(new URL(url, location.href).pathname)] || 0; } catch (e) { return 0; } };
    const track = size => { const f = {size, part: 0, done: false}; job.files.add(f); report(); return f; };
    const finish = f => { f.done = true; report(); };
    // GitHub Pages now and then answers 5xx (or drops the connection) for a moment, e.g. right after an update. A single
    // failed file used to leave the whole page empty, so same-site GETs are retried a few times before giving up.
    const RETRY_DELAYS = [500, 1500, 3000, 6000];
    const retryable = status => status >= 500 || status === 429;
    const sameSite = url => { try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; } };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        input = atMount(input);
        const url = typeof input === 'string' ? input : input?.url || String(input);
        const retry = String(init?.method || input?.method || 'GET').toUpperCase() === 'GET' && sameSite(url);
        const size = sizeOf(url);
        const f = size && loadBar() ? track(size) : null;   // counted from the request on: the wait for the first byte is part of what the card covers
        let r;
        for (let i = 0; ; i++) {
            try {
                r = await nativeFetch(input, init);
                if (!retry || !retryable(r.status) || i >= RETRY_DELAYS.length) break;
                r.body?.cancel().catch(() => {});
            } catch (e) {
                if (!retry || i >= RETRY_DELAYS.length || init?.signal?.aborted || e?.name === 'AbortError') { if (f) finish(f); throw e; }
            }
            await new Promise(ok => setTimeout(ok, RETRY_DELAYS[i]));
        }
        if (!f) return r;
        if (!r.body) { finish(f); return r; }
        let got = 0;
        const counted = r.body.pipeThrough(new TransformStream({
            transform (chunk, ctl) { got += chunk.length; f.part = got / size; report(); ctl.enqueue(chunk); },
            flush () { finish(f); },
        }));
        return new Response(counted, {status: r.status, statusText: r.statusText, headers: r.headers});
    };
    // The site's own data comes by XMLHttpRequest (listeners added after open(), before send()). On a same-site async
    // GET its load / error / loadend listeners are held back and the request is re-sent on 5xx or a dropped connection;
    // the site sees only the final attempt (as synthetic events on the same object, so status / response are that attempt's).
    const xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
    const xhrListen = XMLHttpRequest.prototype.addEventListener;
    const HELD = new Set(['load', 'error', 'loadend']);
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        url = atMount(url);
        this.__oursUrl = url;
        this.__oursOpen = [method, url, ...rest];
        this.__oursRetry = String(method).toUpperCase() === 'GET' && rest[0] !== false && sameSite(url);
        this.__oursHeld = [];
        return xhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.addEventListener = function (type, fn, ...rest) {
        if (this.__oursRetry && this.__oursHeld && HELD.has(type)) { this.__oursHeld.push([type, fn, rest]); return; }
        return xhrListen.call(this, type, fn, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        const size = this.__oursUrl ? sizeOf(this.__oursUrl) : 0;
        const f = size && loadBar() ? track(size) : null;
        if (f) xhrListen.call(this, 'progress', e => { f.part = e.lengthComputable && e.total ? e.loaded / e.total : e.loaded / size; report(); });
        if (!this.__oursRetry) {
            if (f) xhrListen.call(this, 'loadend', () => finish(f));
            return xhrSend.apply(this, args);
        }
        let tries = 0, stopped = false;
        const token = this.__oursToken = {};   // a reused XHR object gets new listeners; the old ones stand down
        xhrListen.call(this, 'abort', () => { stopped = true; });
        xhrListen.call(this, 'timeout', () => { stopped = true; });
        xhrListen.call(this, 'loadend', () => {
            if (this.__oursToken !== token || !this.__oursHeld) return;   // stale, or the synthetic loadend below
            const failed = !stopped && (this.status === 0 || retryable(this.status));
            if (failed && tries < RETRY_DELAYS.length) {
                setTimeout(() => { xhrOpen.apply(this, this.__oursOpen); if (f) { f.part = 0; report(); } xhrSend.apply(this, args); }, RETRY_DELAYS[tries++]);
                return;
            }
            if (f) finish(f);
            const held = this.__oursHeld;
            this.__oursHeld = null;
            for (const [type, fn, rest] of held) xhrListen.call(this, type, fn, ...rest);
            if (!stopped) this.dispatchEvent(new ProgressEvent(this.status === 0 ? 'error' : 'load'));   // abort / timeout already fired themselves
            this.dispatchEvent(new ProgressEvent('loadend'));
        });
        return xhrSend.apply(this, args);
    };
    const raw = url => {
        if (!pending.has(url)) {
            const p = W.limit(() => fetch(url).then(r => {
                if (!r.ok) throw new Error(`${url}: ${r.status}`);
                return r.json().then(rewriteValues);
            }));
            p.catch(() => { if (pending.get(url) === p) pending.delete(url); });   // a failure is not remembered: the next ask tries again
            pending.set(url, p);
        }
        return pending.get(url);
    };
    const pathOf = url => {
        const path = new URL(url, location.href).pathname;
        return mount && path.startsWith(mount + '/') ? path.slice(mount.length) : path;
    };
    const pageOf = path => {
        const parts = path.split('/').filter(Boolean);
        let page = parts.pop() || 'index';
        if (page === 'index.html' && parts.length) page = parts.pop();
        return page.replace(/\.html$/, '');
    };
    const currentPage = () => location.pathname === '/home.html' ? 'index' : pageOf(location.pathname);
    const pages = () => raw('/homebrew/pages.json');
    const canonical = async page => (await pages()).pages[page] || 'core';
    const full = async () => {
        let mode = (document.cookie.match(/(?:^|;\s*)ours_src=(\w+)/) || [])[1];
        if (!mode) try { mode = localStorage.getItem('ours.srcMode2'); } catch (e) { /* cookies/storage optional */ }
        return (await pages()).fullModes.includes(mode);
    };
    const recipe = async page => raw(`/homebrew/_recipes/${await canonical(page)}.json`);
    async function documents(page, ids) {
        const r = await recipe(page);
        const refs = ids.flatMap(id => r.docs[id] || []);
        const paths = [...new Set(refs.map(key => r.packs[key]))];
        const packs = await Promise.all(paths.map(raw));
        const props = Object.assign({}, ...packs);
        return ids.filter(id => r.docs[id]).map(id => {
            const json = {};
            for (const key of r.docs[id]) {
                const [prop, value] = props[key];
                if (Array.isArray(value)) (json[prop] ||= []).push(...structuredClone(value));
                else json[prop] = structuredClone(value);
            }
            return {name: `_split/${page}/${id}`, json};
        });
    }
    W.brewSource = async (page, source) => {
        page = pageOf(page);
        const ids = (await raw('/homebrew/sources.json'))[source.toLowerCase()] || [];
        return documents(page, ids);
    };
    W.matches = url => {
        const p = pathOf(url);
        return p === '/homebrew/index.json' || p.startsWith('/homebrew/_bundle/') ||
            p.startsWith('/homebrew/_split/') || p.startsWith('/__brewrepo/') || p.startsWith('/__prerelease/');
    };
    W.load = async url => {
        const p = pathOf(url);
        const extraSources = new URLSearchParams(location.search).getAll('ours-source');
        const getExtraIds = async () => {
            const sources = await raw('/homebrew/sources.json');
            return extraSources.flatMap(source => sources[source.toLowerCase()] || []);
        };
        if (p === '/homebrew/index.json') {
            const page = await canonical(currentPage());
            const isFull = await full();
            const index = structuredClone(await raw(`/homebrew/_indexes/${page}${isFull ? '~full' : ''}.json`));
            if (extraSources.length && !isFull) {
                const ids = await getExtraIds();
                if (ids.length) {
                    index.bundle ||= `_bundle/${page}.json`;
                    index.toImport.push(...ids.map(id => `_split/${page}/${id}`));
                }
            }
            return index;
        }
        if (p.startsWith('/homebrew/_bundle/')) {
            const key = p.split('/').pop().replace(/\.json$/, '');
            const page = key.split('~')[0];
            const base = await raw(`/homebrew/_bundle/${page}.json`);
            const ids = base.ids.slice();
            if (key.endsWith('~full')) ids.push(...(await raw(`/homebrew/_bundle/${page}~extra.json`)).ids);
            if (extraSources.length && !key.endsWith('~full')) ids.push(...(await getExtraIds()));
            // Preserve manifest order (recommended and 丙 books are interleaved).
            const order = Object.keys((await recipe(page)).docs);
            const selected = new Set(ids);
            const out = await documents(page, order.filter(id => selected.has(id)));
            for (const name of base.site) out.push({name, json: structuredClone(await raw('/homebrew/' + name))});
            return out;
        }
        if (p.startsWith('/homebrew/_split/')) {
            const [, , , page, ...rest] = p.split('/');
            return (await documents(page, [decodeURIComponent(rest.join('/'))]))[0]?.json || {};
        }
        if (p.startsWith('/__prerelease/')) return {};
        if (p.startsWith('/__brewrepo/_')) return structuredClone(await raw(url));
        const file = decodeURIComponent(p.slice('/__brewrepo/'.length));
        const id = (await raw('/__brewrepo/files.json'))[file];
        return id ? (await documents('all', [id]))[0].json : {};
    };
    W.boot = async () => {
        // On a slow line the shared transfer takes a while: show nothing (the shell's progress card is up) rather
        // than the page's unstyled buttons. Shown again once the stylesheets are in, or if loading fails.
        const veil = document.createElement('style');
        veil.textContent = 'body > * { visibility: hidden !important; }';
        document.head.append(veil);
        let assets;
        try { assets = await raw('/__ours/assets.json'); } catch (e) { veil.remove(); throw e; }
        const source = path => assets[path].replace(/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'])(\.[^"']+)(["'])/g,
            (_, before, spec, after) => before + new URL(spec, new URL(path, location.origin)).href + after);
        const imports = {};
        for (const path of Object.keys(assets).filter(p => p.endsWith('.js'))) {
            imports[location.origin + path] = URL.createObjectURL(new Blob([source(path)], {type: 'application/javascript'}));
        }
        const map = document.createElement('script');
        map.type = 'importmap'; map.textContent = JSON.stringify({imports}); document.head.append(map);
        for (const link of document.querySelectorAll('link[rel="ours-stylesheet"]')) {
            const style = document.createElement('style');
            style.textContent = assets[link.dataset.oursSrc].replace(/url\((["']?)(\/(?!\/)[^'")]+)\1\)/g,
                (_, q, path) => 'url(' + q + atMount(path) + q + ')');
            link.replaceWith(style);
            for (const url of style.textContent.match(/https:\/\/5e\.kiwee\.top\/img\/[^\s"')]+/g) || []) {
                resolveImage(url).then(resolved => { if (url !== resolved) style.textContent = style.textContent.replaceAll(url, resolved); });
            }
        }
        veil.remove();
        // Scripts were deferred while the shared transfer arrived. Deliver their
        // lifecycle callbacks after all original script slots have executed.
        const loads = [], domReady = [];
        const windowAdd = window.addEventListener, docAdd = document.addEventListener;
        window.addEventListener = function(type, fn, options) {
            if (type === 'load') loads.push([fn, this]);
            else if (type === 'DOMContentLoaded') domReady.push([fn, this]);
            else windowAdd.call(this, type, fn, options);
        };
        document.addEventListener = function(type, fn, options) {
            if (type === 'DOMContentLoaded') domReady.push([fn, this]); else docAdd.call(this, type, fn, options);
        };
        try {
            for (const slot of document.querySelectorAll('script[data-ours-src]')) {
                const path = slot.dataset.oursSrc;
                if (slot.dataset.oursKind === 'module') await import(location.origin + path);
                else {
                    const script = document.createElement('script');
                    script.textContent = source(path) + '\n//# sourceURL=' + location.origin + path;
                    slot.replaceWith(script);
                }
            }
        } finally {
            window.addEventListener = windowAdd; document.addEventListener = docAdd;
        }
        for (const [callbacks, name] of [[domReady, 'DOMContentLoaded'], [loads, 'load']]) {
            const event = new Event(name);
            for (const [fn, target] of callbacks) {
                try { typeof fn === 'function' ? fn.call(target, event) : fn.handleEvent(event); }
                catch (error) { setTimeout(() => { throw error; }); }
            }
        }
    };
    // URL setters catch both script-created and lazily loaded image elements.
    const imagePrimary = 'https://5e.kiwee.top/img/';
    const imageFallback = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/';
    const armed = new WeakSet(), images = new Map();
    const tryFallback = img => { if (img.src.startsWith(imagePrimary)) img.src = imageFallback + img.src.slice(imagePrimary.length); };
    function armImage(img) {
        if (armed.has(img)) return;
        armed.add(img);
        img.addEventListener('error', () => tryFallback(img));
    }
    function resolveImage(url) {
        if (!images.has(url)) images.set(url, new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img.src);
            // Observe the failed URL before armImage changes it. A cached
            // fallback can already be complete while the first error bubbles.
            img.addEventListener('error', () => { if (img.src.startsWith(imageFallback)) resolve(url); });
            armImage(img);
            img.src = url;
        }));
        return images.get(url);
    }
    function needsRewrite(value) {
        return typeof value === 'string' && (value.includes('img/') ||
            value.includes('__remote/') || value.includes('homebrew.kiwee.top'));
    }
    function remote(value) {
        // List rendering calls these hooks thousands of times with plain text.
        // Avoid every regexp/replacement unless a supported URL can occur.
        if (!needsRewrite(value)) return value;
        value = value.replace(/(?:https?:\/\/[^/]+)?\/__remote\//g, 'https://');
        value = value.replace(/https?:\/\/homebrew\.kiwee\.top\/_font\//g, '/__brewrepo/_font/');
        value = value.replace(/((?:src|href|data-src)=["']|url\(\s*["']?)(?:\.\.\/|\.\/)*\/?img\//g, '$1' + imagePrimary);
        if (/^(?:\/)?img\//.test(value)) value = imagePrimary + value.replace(/^\/?img\//, '');
        return value;
    }
    function rewriteValues(value) {
        if (typeof value === 'string') return remote(value);
        if (Array.isArray(value)) return value.map(rewriteValues);
        if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = rewriteValues(value[key]);
        return value;
    }
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (['src', 'href', 'data-src', 'srcset', 'style'].includes(name)) value = remote(value);
        if (['src', 'href', 'data-src'].includes(name)) value = atMount(value);
        if (name === 'src' && this instanceof HTMLImageElement) armImage(this);
        return originalSetAttribute.call(this, name, value);
    };
    const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {...htmlDescriptor, set(value) { htmlDescriptor.set.call(this, remote(value)); }});
    const originalInsertHTML = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function(where, html) { return originalInsertHTML.call(this, where, remote(html)); };
    for (const [type, prop] of [[HTMLImageElement, 'src'], [HTMLSourceElement, 'srcset'], [HTMLLinkElement, 'href']]) {
        const descriptor = Object.getOwnPropertyDescriptor(type.prototype, prop);
        Object.defineProperty(type.prototype, prop, {...descriptor, set(value) {
            if (this instanceof HTMLImageElement) armImage(this);
            descriptor.set.call(this, atMount(remote(value)));
        }});
    }
    // Chromium exposes CSS properties as own properties of each declaration,
    // so intercept the declaration returned by element.style, not its prototype.
    const styled = new WeakSet();
    function armStyle(style) {
        if (styled.has(style)) return style;
        styled.add(style);
        for (const [property, css] of [['backgroundImage', 'background-image'], ['background', 'background']]) {
            Object.defineProperty(style, property, {configurable: true, enumerable: true,
                get() { return this.getPropertyValue(css); },
                set(value) {
                    if (!needsRewrite(value)) { this.setProperty(css, value); return; }
                    value = remote(value);
                    this.setProperty(css, value);
                    for (const url of String(value).match(/https:\/\/5e\.kiwee\.top\/img\/[^\s"')]+/g) || []) {
                        resolveImage(url).then(resolved => {
                            const current = this.getPropertyValue(css);
                            if (url !== resolved && current.includes(url)) this.setProperty(css, current.replaceAll(url, resolved));
                        });
                    }
                },
            });
        }
        return style;
    }
    for (const type of [HTMLElement, SVGElement]) {
        const style = Object.getOwnPropertyDescriptor(type.prototype, 'style');
        if (style?.get) Object.defineProperty(type.prototype, 'style', {...style, get() { return armStyle(style.get.call(this)); }});
    }
    document.addEventListener('error', event => {
        const img = event.target;
        if (img instanceof HTMLImageElement) tryFallback(img);
    }, true);
    // Parser-created attributes and inline CSS fonts are rewritten at build time.
    // Remove old service workers if a visitor previously used another snapshot.
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
})();

window.__OURS_WEB && (window.__OURS_WEB.sizes = {"/favicon_origin.svg": 8121595, "/safari-pinned-tab.svg": 9039313, "/data/adventures.json": 764577, "/data/backgrounds.json": 750845, "/data/books.json": 300099, "/data/changelog.json": 337795, "/data/decks.json": 789438, "/data/deities.json": 792522, "/data/encounters.json": 339949, "/data/feats.json": 426735, "/data/fluff-items.json": 288109, "/data/fluff-races.json": 488349, "/data/foundry-items.json": 479956, "/data/homecrafts.json": 509244, "/data/items.json": 2951589, "/data/races.json": 603288, "/data/recipes.json": 704930, "/data/variantrules.json": 672013, "/icon/icon-1024.png": 303720, "/js/render.js": 622360, "/js/utils.js": 339187, "/lib/ace.js": 741440, "/search/index-foundry.json": 4115982, "/search/index-item.json": 511728, "/search/index-partnered.json": 1373240, "/search/index.json": 3052806, "/__api/search-index.json": 15784458, "/__ours/assets.json": 8585371, "/__ours/ours.js": 282180, "/audio/adventure/GoS/saltmarsh-shanty.opus": 2196038, "/data/adventure/adventure-aud.json": 741967, "/data/adventure/adventure-bgdia.json": 1301762, "/data/adventure/adventure-cm.json": 1348870, "/data/adventure/adventure-coa.json": 1007175, "/data/adventure/adventure-cos.json": 1838702, "/data/adventure/adventure-crcotn.json": 1111260, "/data/adventure/adventure-dc.json": 305829, "/data/adventure/adventure-dip.json": 713103, "/data/adventure/adventure-dosi.json": 288591, "/data/adventure/adventure-dsotdq.json": 1140669, "/data/adventure/adventure-gos.json": 1476929, "/data/adventure/adventure-hotb.json": 564756, "/data/adventure/adventure-hotdq.json": 737734, "/data/adventure/adventure-idrotf.json": 2213295, "/data/adventure/adventure-imr.json": 391538, "/data/adventure/adventure-jttrc.json": 1389458, "/data/adventure/adventure-kftgv.json": 1189335, "/data/adventure/adventure-llk.json": 278532, "/data/adventure/adventure-lmop.json": 352489, "/data/adventure/adventure-lox.json": 352309, "/data/adventure/adventure-oota.json": 1752315, "/data/adventure/adventure-oow.json": 768262, "/data/adventure/adventure-pabtso.json": 1505660, "/data/adventure/adventure-pota.json": 1934446, "/data/adventure/adventure-qftis.json": 1562726, "/data/adventure/adventure-rmbre.json": 263140, "/data/adventure/adventure-rot.json": 678611, "/data/adventure/adventure-rtg.json": 266176, "/data/adventure/adventure-sdw.json": 380460, "/data/adventure/adventure-skt.json": 1961083, "/data/adventure/adventure-slw.json": 275835, "/data/adventure/adventure-tftyp-atg.json": 892100, "/data/adventure/adventure-tftyp-dit.json": 945279, "/data/adventure/adventure-tftyp-tfof.json": 403299, "/data/adventure/adventure-tftyp-thsot.json": 306282, "/data/adventure/adventure-tftyp-tsc.json": 322905, "/data/adventure/adventure-toa.json": 1876831, "/data/adventure/adventure-tofw.json": 595888, "/data/adventure/adventure-veor.json": 1397175, "/data/adventure/adventure-wbtw.json": 1247340, "/data/adventure/adventure-wdh.json": 1431767, "/data/adventure/adventure-wdmm.json": 2652928, "/data/adventure/adventure-wtthc.json": 328834, "/data/bestiary/bestiary-ftd.json": 553145, "/data/bestiary/bestiary-mm.json": 1670921, "/data/bestiary/bestiary-mpmm.json": 942291, "/data/bestiary/bestiary-mtf.json": 561023, "/data/bestiary/bestiary-rhw.json": 264517, "/data/bestiary/bestiary-vgm.json": 506810, "/data/bestiary/bestiary-xmm.json": 1347058, "/data/bestiary/fluff-bestiary-ftd.json": 291075, "/data/bestiary/fluff-bestiary-mm.json": 812672, "/data/bestiary/fluff-bestiary-mpmm.json": 382050, "/data/bestiary/fluff-bestiary-mtf.json": 306248, "/data/bestiary/fluff-bestiary-vgm.json": 354180, "/data/bestiary/fluff-bestiary-xmm.json": 777447, "/data/bestiary/legendarygroups.json": 400661, "/data/book/book-ai.json": 433062, "/data/book/book-au.json": 480452, "/data/book/book-bgg.json": 514979, "/data/book/book-bmt.json": 889671, "/data/book/book-dmg.json": 1312030, "/data/book/book-dmtcrg.json": 264776, "/data/book/book-efa.json": 292994, "/data/book/book-egw.json": 1082896, "/data/book/book-erlw.json": 1285957, "/data/book/book-fraif.json": 1355209, "/data/book/book-frhof.json": 541130, "/data/book/book-ftd.json": 751088, "/data/book/book-ggr.json": 687630, "/data/book/book-mabjov.json": 268805, "/data/book/book-mot.json": 660870, "/data/book/book-mtf.json": 629056, "/data/book/book-phb.json": 612192, "/data/book/book-rhw.json": 1068654, "/data/book/book-rmr.json": 289321, "/data/book/book-sato.json": 430822, "/data/book/book-scag.json": 739755, "/data/book/book-scc.json": 264782, "/data/book/book-tce.json": 465199, "/data/book/book-vgm.json": 614654, "/data/book/book-vrgr.json": 1019495, "/data/book/book-xdmg.json": 1452650, "/data/book/book-xge.json": 329192, "/data/book/book-xmm.json": 470528, "/data/book/book-xphb.json": 567876, "/data/class/class-cleric.json": 263834, "/data/class/foundry.json": 574619, "/data/generated/bookref-dmscreen.json": 345211, "/data/generated/gendata-maps.json": 2841878, "/data/generated/gendata-spell-source-lookup.json": 673279, "/data/generated/gendata-tables.json": 2839187, "/data/spells/foundry.json": 465226, "/data/spells/sources.json": 329095, "/data/spells/spells-phb.json": 648463, "/data/spells/spells-xphb.json": 624811, "/fonts/fontawesome/fa-duotone-900.woff2": 326968, "/fonts/fontawesome/fa-duotone-light-300.woff2": 522620, "/fonts/fontawesome/fa-duotone-regular-400.woff2": 481044, "/fonts/fontawesome/fa-duotone-thin-100.woff2": 574260, "/fonts/fontawesome/fa-light-300.woff2": 366248, "/fonts/fontawesome/fa-regular-400.woff2": 342108, "/fonts/fontawesome/fa-sharp-duotone-light-300.woff2": 429200, "/fonts/fontawesome/fa-sharp-duotone-regular-400.woff2": 400668, "/fonts/fontawesome/fa-sharp-duotone-solid-900.woff2": 266856, "/fonts/fontawesome/fa-sharp-duotone-thin-100.woff2": 458632, "/fonts/fontawesome/fa-sharp-light-300.woff2": 302440, "/fonts/fontawesome/fa-sharp-regular-400.woff2": 282592, "/fonts/fontawesome/fa-sharp-thin-100.woff2": 318776, "/fonts/fontawesome/fa-solid-900.woff2": 265848, "/fonts/fontawesome/fa-thin-100.woff2": 396172, "/homebrew/_data/extra-advdata-00.json": 800392, "/homebrew/_data/extra-background-00.json": 486793, "/homebrew/_data/extra-bookdata-00.json": 1745812, "/homebrew/_data/extra-class-00.json": 4266991, "/homebrew/_data/extra-core-00.json": 970101, "/homebrew/_data/extra-item-00.json": 1175007, "/homebrew/_data/extra-monster-00.json": 2953726, "/homebrew/_data/extra-optfeat-00.json": 1355084, "/homebrew/_data/extra-race-00.json": 349070, "/homebrew/_data/extra-spell-00.json": 2024608, "/homebrew/_data/rec-advdata-00.json": 8285849, "/homebrew/_data/rec-background-00.json": 664164, "/homebrew/_data/rec-bookdata-00.json": 8255500, "/homebrew/_data/rec-bookdata-01.json": 4324816, "/homebrew/_data/rec-class-00.json": 8355516, "/homebrew/_data/rec-class-01.json": 3260094, "/homebrew/_data/rec-core-00.json": 3244152, "/homebrew/_data/rec-feat-00.json": 684874, "/homebrew/_data/rec-item-00.json": 7692114, "/homebrew/_data/rec-monster-00.json": 7639757, "/homebrew/_data/rec-monster-01.json": 7645689, "/homebrew/_data/rec-monster-02.json": 6465184, "/homebrew/_data/rec-monster-03.json": 2055755, "/homebrew/_data/rec-optfeat-00.json": 2134556, "/homebrew/_data/rec-race-00.json": 1706005, "/homebrew/_data/rec-spell-00.json": 3134650, "/__ours/fonts/book-headings.woff2": 1569932});
