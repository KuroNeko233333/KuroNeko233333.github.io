"use strict";

// The shell holds this worker. Parse and keep the corpus here, including the
// names used for matching. Only the short, ranked result list crosses back.
let corpus;
let revision;
let loading;
let sourceAliases;

const normalize = value => String(value ?? "").normalize("NFKD").toLowerCase()
	.replace(/\p{M}/gu, "").replace(/æ/g, "ae").replace(/[’']/g, "")
	.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const compact = name => name.replaceAll(" ", "");
const han = /\p{Script=Han}/u;
const prepareNames = values => {
	const names = [...new Set(values.map(normalize).filter(Boolean))];
	const hanNames = names.map(name => han.test(name));
	return {names, joined: names.map(compact), hanNames,
		wordLists: names.map((name, i) => !hanNames[i] && name.includes(" ") ? name.split(" ") : null)};
};

async function load(isWeb, indexUrl) {
	if (loading) return loading;
	if (corpus && (isWeb || indexUrl)) return;
	loading = (async () => {
		async function json(url, options) {
			const response = await fetch(url, options);
			if (!response.ok) throw new Error("Search data: " + response.status);
			if (url.endsWith(".gz")) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes[0] === 31 && bytes[1] === 139)
          return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
        return JSON.parse(new TextDecoder().decode(bytes));
      }
      return response.json();
		}
		const next = indexUrl || isWeb ? indexUrl || "" : await json("/__api/search-revision", {cache: "no-store"});
		if (corpus && revision === next) return;
		const {rows, sources} = await json(indexUrl || "/__api/search-index.json");
		const prepared = rows.map(doc => {
			const source = (doc.s || "").toLowerCase();
			const meta = sources[source];
			if (!doc.sA && meta?.[0]) doc.sA = meta[0];
			if (!doc.sF && meta?.[1]) doc.sF = meta[1];
			if (doc.c === 30 || doc.c === 41) {
				doc._zh ||= doc.cn?.split("; ").slice(1).join("; ");
				doc._en ||= doc.n?.split("; ").slice(1).join("; ").replace(/}$/, "");
			}
			return {doc, source, tier: meta?.[2], ...prepareNames([doc._zh, doc._en, doc.cn, doc.n, doc.b])};
		});
		corpus = prepared.filter(({doc}) => !doc._invalid);
		sourceAliases = new Set(corpus.flatMap(({doc, source}) => [source, doc.sA?.toLowerCase()].filter(Boolean)));
		revision = next;
	})();
	try { await loading; } finally { loading = null; }
}

function parse(query, options) {
	const groups = {source: [], in: [], page: []};
	// A value may contain spaces (e.g. "in:class feature"), ending at the
	// next switch. A quoted value also permits trailing free text.
	const tail = /\b(source|in|page):\s*(!)?\s*(?:"([^"]+)"|([^]*?))(?=\s+(?:source|in|page):|$)/gi;
	const name = query.replace(tail, (match, key, negate, quoted, bare) => {
		key = key.toLowerCase();
		const raw = (quoted ?? bare).trim().toLowerCase();
		let value = raw, rest = "";
		if (key === "page") {
			const pages = /^(\d+)(?:\s*-\s*(\d+))?\b/.exec(raw);
			if (!pages) return match;
			value = [+pages[1], +(pages[2] ?? pages[1])];
			rest = raw.slice(pages[0].length);
		} else if (key === "in") {
			const category = options.categories.find(([label]) =>
				raw === label || raw === label + "s" || raw.startsWith(label + " ") || raw.startsWith(label + "s "));
			if (!category) return match;
			value = category[1];
			rest = raw.slice(category[0].length + Number(raw[category[0].length] === "s"));
		} else if (!quoted && !sourceAliases.has(raw) && !Object.values(options.sources).some(s => s.abv?.toLowerCase() === raw)) {
			[value, ...rest] = raw.split(/\s+/);
			rest = rest.join(" ");
		}
		if (!value.length) return match;
		groups[key].push({value, negate: !!negate});
		return " " + rest + " ";
	});
	return {name: normalize(name), groups};
}

const within = (rules, test) => !rules.length || rules.some(({value, negate}) => test(value) !== negate);

function score(item, name, query, isHan, words) {
	let grade = 0;
	for (let i = 0; i < item.names.length; i++) {
		const candidate = isHan ? item.joined[i] : item.names[i];
		const needle = isHan ? query : name;
		if (candidate === needle || item.joined[i] === query) return 4;
		if (candidate.startsWith(needle) || item.joined[i].startsWith(query)) grade = Math.max(grade, 3);
		else if (candidate.includes(needle)) grade = Math.max(grade, 2);
		else if (words.length > 1 && words.every(word => item.names[i].includes(word))) grade = Math.max(grade, 1);
	}
	return grade;
}

// A banded edit-distance calculation with adjacent transpositions. Reject a
// candidate before allocating rows if too many query letters are absent.
function distance(a, b, max, letters) {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let missing = 0;
	for (const letter of letters) {
		if (!b.includes(letter) && ++missing > max) return max + 1;
	}
	const cap = max + 1;
	const width = b.length + 1;
	const rows = [new Uint16Array(width), new Uint16Array(width), new Uint16Array(width)];
	for (let j = 0; j < width; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		const cur = rows[i % 3], prev = rows[(i + 2) % 3], older = rows[(i + 1) % 3];
		const start = Math.max(1, i - max), end = Math.min(b.length, i + max);
		cur[start - 1] = start === 1 ? i : cap;
		if (end < b.length) cur[end + 1] = cap;
		let best = cur[start - 1];
		for (let j = start; j <= end; j++) {
			let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + Number(a[i - 1] !== b[j - 1]));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, older[j - 2] + 1);
			cur[j] = d;
			best = Math.min(best, d);
		}
		if (best > max) return cap;
	}
	return rows[a.length % 3][b.length];
}

function approximate(item, isHan, wordCount, max, measure) {
	let best = Infinity;
	for (let i = 0; i < item.names.length; i++) {
		const candidate = item.joined[i];
		if (item.hanNames[i] !== isHan) continue;
		const d = measure(candidate);
		if (d <= max) best = Math.min(best, d);
		const words = item.wordLists[i];
		if (!words || wordCount > 3 || d === 0) continue;
		for (let k = 0; k + wordCount <= words.length; k++) {
			const part = wordCount === 1 ? words[k] : words.slice(k, k + wordCount).join("");
			const near = measure(part);
			if (near <= max) best = Math.min(best, near + 0.25);
		}
	}
	return best;
}

function weight(doc, source, sourceInfo, classic, shortSource) {
	let rank = 1;
	if ((classic ? /^(phb|dmg|mm)$/ : /^(xphb|xdmg|xmm)$/).test(source)) rank *= 1.1;
	if (sourceInfo?.ua) rank *= 0.66;
	if (sourceInfo?.legacy && !classic) rank *= 0.75;
	if (doc.c === 43 || doc.c === 53 || (doc.c === 18 && !classic)) rank *= 0.5;
	if (doc.c === 48 || doc.c === 57) rank *= 0.38;
	if (doc.dR) rank *= 0.9;
	if (shortSource && (doc.c === 13 || doc.c === 44)) rank *= 1.1;
	return rank;
}

function search(raw, options) {
	const {name, groups} = options.list ? {name: normalize(raw), groups: {in: [], source: [], page: []}} : parse(raw, options);
	const query = compact(name), isHan = han.test(name), words = name.split(" ");
	if (!name && !Object.values(groups).some(group => group.length)) return options.window ? {items: [], total: 0} : [];
	const maxEdits = query.length >= (isHan ? 3 : 4) ? (query.length >= (isHan ? 5 : 7) ? 2 : 1) : 0;
	const letters = [...new Set(query)];
	const exact = [], candidates = [];
	const listRows = options.list?.map(([key, name, english]) =>
		({doc: {u: key, id: key}, source: "", ...prepareNames([name, english])}));
	const blocklist = new Map();
	for (const entry of options.exclude || []) {
		const hash = entry.hash?.toLowerCase();
		const source = (entry.source?.source ?? entry.source)?.toLowerCase();
		const category = entry.category?.toLowerCase();
		if (!hash || !source || !category) continue;
		const values = blocklist.get(hash) || [];
		values.push({source, category});
		blocklist.set(hash, values);
	}
	for (const item of listRows || corpus) {
		const {doc, source, tier} = item;
		const sourceInfo = options.sources[source];
		const {abv, ua, legacy, partnered: officialPartnered} = sourceInfo || {};
		const partnered = doc.dP || officialPartnered;
		if (!listRows) {
			if (!options.brew && doc._brew && !partnered) continue;
			if (!options.ua && (ua || /^(?:ua|ps|mcv[0-9])/i.test(doc.s || ""))) continue;
			if (!options.legacy && legacy) continue;
			if (options.srd && !doc.r && !doc.r2) continue;
			if (partnered && (options.partnered === "none" || (options.partnered === "local" && doc.isRemote))) continue;
			if (!within(groups.in, cats => cats.includes(doc.c))) continue;
			if (!within(groups.source, src => source === src || (doc.sA || abv || "").toLowerCase() === src)) continue;
			if (!within(groups.page, ([lo, hi]) => doc.p != null && doc.p >= lo && doc.p <= hi)) continue;
			if (blocklist.size && doc.c !== 18 && doc.c !== 45) {
				const category = options.props[doc.c]?.toLowerCase();
				const subtype = doc._itemType?.toLowerCase();
				const isBlocked = e => (e.source === "*" || e.source === source)
					&& (e.category === "*" || e.category === category || e.category === subtype);
				if (blocklist.get(doc.u)?.some(isBlocked) || blocklist.get("*")?.some(isBlocked)) continue;
			}
		}
		const isOfficial = !doc._brew && !partnered && !doc.isRemote;
		const good = tier && tier !== "C";
		const outside = !!source && (options.mode === "official" && !isOfficial
			|| options.mode === "rec" && !isOfficial && !good
			|| options.mode === "brew" && (isOfficial || !good));
		const shortSource = source && (source === name || (doc.sA || abv || "").toLowerCase() === name);
		const grade = !name ? 4 : shortSource && (doc.c === 13 || doc.c === 44) ? 4
			: score(item, name, query, isHan, words) || (shortSource ? 1 : 0);
		if (!grade && !maxEdits) continue;
		if (grade) exact.push({item, outside, grade, weight: weight(doc, source, sourceInfo, options.classic, shortSource)});
		else candidates.push({item, outside});
	}
	const compare = (a, b) => b.grade - a.grade || b.weight - a.weight || a.outside - b.outside || a.item.doc.id - b.item.doc.id;
	exact.sort(compare);
	const distinct = matches => {
		const seen = new Set();
		return matches.filter(({item: {doc}}) => {
			const key = doc.c + "|" + doc.u + "|" + doc.s;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	};
	const hits = distinct(exact);
	let fuzzy = [];
	if (hits.length < 5 && maxEdits) {
		const edits = new Map();
		const measure = candidate => {
			if (Math.abs(candidate.length - query.length) > maxEdits) return maxEdits + 1;
			let edit = edits.get(candidate);
			if (edit === undefined) {
				edit = distance(query, candidate, maxEdits, letters);
				edits.set(candidate, edit);
			}
			return edit;
		};
		const exactIds = new Set(hits.map(({item: {doc}}) => doc.c + "|" + doc.u + "|" + doc.s));
		for (const match of candidates) {
			const {doc, source} = match.item;
			if (exactIds.has(doc.c + "|" + doc.u + "|" + doc.s)) continue;
			const edit = approximate(match.item, isHan, words.length, maxEdits, measure);
			if (edit !== Infinity) fuzzy.push({...match, grade: -edit, fuzzy: true,
				weight: weight(doc, source, options.sources[source], options.classic, false)});
		}
		fuzzy = distinct(fuzzy.sort(compare)).slice(0, listRows ? 30 : 5);
	}
	const ranked = listRows ? fuzzy : hits.concat(fuzzy);
	const {offset = 0, size = 20} = options.window || {};
	const items = ranked.slice(offset, offset + (listRows ? 30 : size)).map(({item: {doc, source}, weight, outside, fuzzy}) => ({
		doc: {...doc, cf: options.labels[doc.c], sA: doc.sA || options.sources[source]?.abv,
			_oursOutside: outside, _oursFuzzy: !!fuzzy},
		score: weight,
	}));
	return options.window ? {items, total: ranked.length} : items;
}

if (typeof WorkerGlobalScope !== "undefined") self.onmessage = async ({data: {id, type, query, options, isWeb, indexUrl}}) => {
	try {
		if (type !== "list") await load(isWeb,indexUrl);
		self.postMessage({id, results: type === "warm" ? null : search(query, options)});
	} catch (error) {
		self.postMessage({id, error: error.message});
	}
};

export function createSearchClient({workerUrl="/__ours/search-worker.js",indexUrl}={}) {
	let worker, nextId = 0;
	const pending = new Map();
	const fail = error => {
		worker?.terminate();
		worker = null;
		for (const request of pending.values()) request.reject(error);
		pending.clear();
	};
	return (type, query, options) => {
		if (!worker) {
			worker = new Worker(workerUrl, {type: "module", name: "ours-search"});
			worker.onmessage = ({data: {id, error, results}}) => {
				const request = pending.get(id);
				if (!request) return;
				pending.delete(id);
				if (error) request.reject(new Error(error));
				else request.resolve(results);
			};
			worker.onerror = event => fail(new Error(event.message || "Search worker failed"));
		}
		const id = ++nextId;
		return new Promise((resolve, reject) => {
			pending.set(id, {resolve, reject});
			worker.postMessage({id, type, query, options, indexUrl, isWeb: !!window.__OURS_WEB});
		});
	};
}
