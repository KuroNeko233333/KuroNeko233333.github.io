export const abilities = ["str", "dex", "con", "int", "wis", "cha"];
export const modes = ["rolled", "array", "pointbuy", "manual"];
export const standard = [15, 14, 13, 12, 10, 8];
export const entities = [["race", "races", "Race"], ["background", "backgrounds", "Background"]];
export const rule = (score, cost) => ({id: crypto.randomUUID(), entity: {score, cost}});
export const defaultRules = () => [0, 1, 2, 3, 4, 5, 7, 9].map((cost, i) => rule(i + 8, cost));
export const baseKey = (mode, ab) => ({
    rolled: `rolled_${ab}_abilSelectedRollIx`,
    array: `array_${ab}_abilSelectedScoreIx`,
    pointbuy: `pb_${ab}`,
    manual: `manual_${ab}_abilValue`,
})[mode];
export const userKey = ab => `common_${ab}_user`;
export const choiceKey = (ns, type) => `common_${ns}ChoiceMetas${type}`;
export const featPrefix = (ns, i) => `common_asi_${ns}_${i}_`;
export const featSetKey = ns => `common_additionalFeats_${ns}_ixSel`;
export const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
export const modifier = score => `${score >= 10 ? "+" : ""}${Math.floor((score - 10) / 2)}`;
export const cap = (n, min, max) => Math.min(max, Math.max(min, n));
export const featCount = n => cap(int(n), 0, 20);

export function resetMode(state, mode) {
    for (const ab of abilities) {
        state[userKey(ab)] = 0;
        state[baseKey(mode, ab)] = mode === "pointbuy" ? 8 : null;
    }
    for (const [ns] of entities) {
        state[choiceKey(ns, "From")] = [];
        state[choiceKey(ns, "Weighted")] = [];
    }
}

export function defaultState(data) {
    const state = {
        common_isAllowTashasRules: data.classicAllowed, common_isTashas: false,
        common_isShowTashasRules: false, common_pulseAsi: false,
        common_cntAsi: 0, common_cntFeatsCustom: 0,
        rolled_formula: "4d6dl1", rolled_rollCount: 6, rolled_rolls: [],
        pb_rules: defaultRules(), pb_budget: 27, pb_points: 27, pb_isCustom: false,
    };
    modes.forEach(mode => resetMode(state, mode));
    entities.forEach(([, , suffix]) => {
        state["common_ix" + suffix] = null;
        state["common_ixAbilityScoreSet" + suffix] = 0;
        state["common_isPreview" + suffix] = false;
    });
    return state;
}

export function clampPointBuy(state) {
    const values = state.pb_rules.map(r => r.entity.score);
    const min = Math.min(...values), max = Math.max(...values);
    for (const ab of abilities) state["pb_" + ab] = cap(int(state["pb_" + ab]), min, max);
}

function transferHashes(state, data, saving) {
    function exchange(list, hashKey, indexKey, removeIndex) {
        if (saving) {
            if (!list[state[indexKey]]) return;
            state[hashKey] = list[state[indexKey]].hash;
            if (removeIndex) delete state[indexKey];
        } else if (state[hashKey]) {
            const index = list.findIndex(e => e.hash === state[hashKey]);
            state[indexKey] = index >= 0 ? index : null;
            delete state[hashKey];
        }
    }
    for (const [ns, kind, suffix] of entities) exchange(data[kind], `_pb_${ns}Hash`, "common_ix" + suffix, true);
    for (const [ns, amount] of [["ability", state.common_cntAsi], ["custom", state.common_cntFeatsCustom]]) {
        for (let i = 0; i < featCount(amount); i++) {
            const prefix = featPrefix(ns, i);
            exchange(data.feats, "_" + prefix + "hash", prefix + "ixFeat", ns === "custom");
        }
    }
    for (const key of Object.keys(state)) {
        const match = /^(common_additionalFeats_(?:race|background)_(?:choose|chooseCategory)_\d+_)ixFeat$/.exec(key)
            || /^_(common_additionalFeats_(?:race|background)_(?:choose|chooseCategory)_\d+_)hash$/.exec(key);
        if (match) exchange(data.feats, "_" + match[1] + "hash", match[1] + "ixFeat", false);
    }
}

export function loadState(data, saved) {
    const input = saved?.state;
    const state = defaultState(data);
    if (!input || Array.isArray(input) || typeof input !== "object") return state;
    for (const [key, value] of Object.entries(input)) {
        if (Object.hasOwn(state, key) || /^(?:_?common_|_pb_(?:race|background)Hash$|rolled_|array_|manual_)/.test(key)) {
            state[key] = structuredClone(value);
        }
    }
    state.common_isAllowTashasRules = data.classicAllowed;
    state.common_cntAsi = featCount(state.common_cntAsi);
    state.common_cntFeatsCustom = featCount(state.common_cntFeatsCustom);
    if (!Array.isArray(state.pb_rules) || !state.pb_rules.length || state.pb_rules.some(r => !Number.isFinite(r?.entity?.score) || !Number.isFinite(r.entity.cost))) {
        state.pb_rules = defaultRules();
    }
    state.rolled_rolls = Array.isArray(state.rolled_rolls)
        ? state.rolled_rolls.filter(roll => Number.isFinite(roll?.total))
        : [];
    state.rolled_rollCount = cap(int(state.rolled_rollCount, 6), 1, 1000);
    entities.forEach(([ns]) => ["From", "Weighted"].forEach(type => {
        const key = choiceKey(ns, type);
        if (!Array.isArray(state[key])) state[key] = [];
    }));
    transferHashes(state, data, false);
    clampPointBuy(state);
    return state;
}

export function saveState(state, data) {
    const copy = structuredClone(state);
    transferHashes(copy, data, true);
    return {state: copy};
}

export function getEntity(data, state, ns) {
    const [, kind, suffix] = entities.find(entry => entry[0] === ns);
    return data[kind][state["common_ix" + suffix]];
}

export function entityAbility(data, state, ns) {
    const suffix = ns === "race" ? "Race" : "Background";
    const set = getEntity(data, state, ns)?.ability?.[state["common_ixAbilityScoreSet" + suffix]];
    if (!set || ns !== "race" || !state.common_isAllowTashasRules || !state.common_isTashas) return set;
    const weights = abilities.flatMap(ab => set[ab] ? [set[ab]] : []);
    const choice = set.choose;
    if (choice?.from) weights.push(...Array(choice.count || 1).fill(choice.amount || 1));
    if (choice?.weighted) weights.push(...choice.weighted.weights);
    return {choose: {weighted: {from: abilities, weights: weights.sort((a, b) => b - a)}}};
}

export function selectEntityAbility(state, ns, ab, {type, amount, ix, count}) {
    const key = choiceKey(ns, type);
    const before = state[key];
    if (type === "From") {
        state[key] = before.some(it => it.ability === ab)
            ? before.filter(it => it.ability !== ab)
            : [...before.slice(Math.max(0, before.length - count + 1)), {ability: ab, amount}];
        return;
    }
    const checked = before.some(it => it.ability === ab && it.ix === ix);
    state[key] = before.filter(it => it.ability !== ab && it.ix !== ix);
    if (!checked) state[key].push({ability: ab, amount, ix});
}

function featByUid(list, uid) {
    const [name, source = "phb"] = uid.toLowerCase().split("|");
    return list.find(e => (e.name.toLowerCase() === name || e.english.toLowerCase() === name) && e.source.toLowerCase() === source);
}

export function grantedFeats(data, state, ns) {
    const set = getEntity(data, state, ns)?.feats?.[state[featSetKey(ns)] ?? 0];
    if (!set) return [];
    const prefix = `common_additionalFeats_${ns}_`;
    return [
        ...Object.keys(set).filter(key => !["any", "anyFromCategory"].includes(key) && set[key])
            .map((uid, ix) => ({prefix: `${prefix}static_${ix}_`, feat: featByUid(data.feats, uid), fixed: true})),
        ...Array.from({length: featCount(set.any)}, (_, ix) => ({prefix: `${prefix}choose_${ix}_`})),
        ...Array.from({length: featCount(set.anyFromCategory?.count)}, (_, ix) => ({
            prefix: `${prefix}chooseCategory_${ix}_`, category: set.anyFromCategory.category,
        })),
    ];
}

export function baseScore(state, mode, ab) {
    const value = state[baseKey(mode, ab)];
    if (mode === "rolled") return state.rolled_rolls[value]?.total ?? 0;
    if (mode === "array") return standard[value] ?? 0;
    return value ?? 0;
}

export function remaining(state, base = state) {
    return state.pb_budget - abilities.reduce((sum, ab) => {
        const cost = state.pb_rules.find(rule => rule.entity.score === base["pb_" + ab])?.entity.cost ?? 0;
        return sum + cost;
    }, 0);
}

export function featAbility(state, feat, prefix) {
    return feat?.ability?.[state[prefix + "ixFeatAbility"] || 0];
}

export function scores(data, state, mode) {
    const result = Object.fromEntries(abilities.map(ab => [ab, baseScore(state, mode, ab) + (state[userKey(ab)] || 0)]));
    function addFixed(set) {
        for (const ab of abilities) result[ab] += set?.[ab] || 0;
    }
    function addFeat(prefix, feat = data.feats[state[prefix + "ixFeat"]]) {
        const set = featAbility(state, feat, prefix);
        if (!set) return;
        addFixed(set);
        const prop = prefix + "featAbilityChooseFrom";
        set.choose?.from?.forEach((ab, i) => {
            if (state[prop + "__isActive_" + i]) result[ab] += set.choose.amount || 1;
        });
    }
    for (const [ns] of entities) {
        const set = entityAbility(data, state, ns);
        addFixed(set);
        for (const [type, isUsed] of [["From", set?.choose?.from], ["Weighted", set?.choose?.weighted?.weights]]) {
            if (!isUsed) continue;
            for (const {ability, amount} of state[choiceKey(ns, type)]) {
                if (Object.hasOwn(result, ability)) result[ability] += amount;
            }
        }
        for (const item of grantedFeats(data, state, ns)) {
            if (!item.fixed || item.feat) addFeat(item.prefix, item.feat);
        }
    }
    for (let i = 0; i < state.common_cntAsi; i++) {
        const p = featPrefix("ability", i);
        if (state[p + "mode"] === "feat") {
            addFeat(p);
            continue;
        }
        for (const term of ["asiPointOne", "asiPointTwo"]) {
            const ab = abilities[state[p + term]];
            if (ab) result[ab]++;
        }
    }
    for (let i = 0; i < state.common_cntFeatsCustom; i++) addFeat(featPrefix("custom", i));
    return result;
}
