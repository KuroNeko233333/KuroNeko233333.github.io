const byId = id => document.getElementById(id);
const collator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", {numeric: true, sensitivity: "base"});
const rarities = new Map(Object.entries({
  none:"无", unknown:"未知", common:"常见", uncommon:"不常见", rare:"珍稀",
  "very rare":"非常珍稀", legendary:"传说", artifact:"神器", varies:"不定", "unknown (magic)":"未知（魔法）"
}));
const typesHiddenByDefault = new Set(["treasure", "treasure (art object)", "treasure (coinage)", "treasure (gemstone)", "futuristic", "modern", "renaissance", "trade bar"]);
const monsterTypeNames={aberration:"异怪",beast:"野兽",celestial:"天族",construct:"构装",dragon:"龙",elemental:"元素",fey:"妖精",fiend:"邪魔",giant:"巨人",humanoid:"类人",monstrosity:"怪兽",ooze:"泥怪",plant:"植物",undead:"亡灵"};
const itemSortNames = {catalog:"默认顺序", name:"名称", rarity:"稀有度", source:"来源", type:"类别", attunement:"同调", weight:"重量", cost:"价值"};
const monsterSortNames = {catalog:"默认顺序",name:"名称",type:"类型",cr:"挑战等级",translate:"译者",source:"来源"};
const fieldNames = {
  Level:"等级", Class:"职业", Subclass:"子职", "Optional/Variant Class":"可选职业与变体", Species:"种族",
  Background:"背景", Feat:"专长", Source:"来源", "Other Option/Feature":"其他选项与特性",
  "Components & Miscellaneous":"成分与杂项", Group:"分组", School:"学派", Subschool:"子学派",
  "Damage Type":"伤害类型", "Conditions Inflicted":"造成状态", "Spell Attack":"法术攻击",
  "Saving Throw":"豁免", "Ability Check":"属性检定", "Cast Time":"施法时间", Duration:"持续时间",
  Range:"射程", "Area Style":"区域形状", "Affects Creature Types":"影响的生物类型",
  Category:"类别", "Ability Bonus":"属性加值", Other:"其他", Benefits:"收益",
  "易伤Vulnerability":"伤害易伤", "抗性Resistance":"伤害抗性", "免疫Immunity":"伤害免疫",
  "Condition Immunity":"状态免疫", Miscellaneous:"杂项", "Ability Scores":"属性值",
  Prerequisite:"先决条件", "Skill Proficiencies":"技能熟练", "Tool Proficiencies":"工具熟练",
  "Other Benefits":"其他收益", Feats:"专长", "Feature Type":"类型", "Pact Boon":"契约恩泽",
  "Otherworldly Patron":"异界宗主", Spell:"法术", Feature:"特性",
  "Ability Scores (Including Subrace)":"属性值（含亚种）", "体型Size":"体型", "速度Speed":"速度",
  Traits:"特质", Languages:"语言", "基础种族Base Race":"基础种族", "Creature Type":"生物类型", "Adult Age":"成年年龄",
  Type:"类型", "Rule Type":"规则类型", Script:"文字", Alignment:"阵营", Pantheon:"神系", Domain:"领域",
  "Vehicle Type":"载具类型", "Upgrade Type":"改装类型", Terrain:"地形", Cost:"价格", Speed:"速度",
  "Armor Class":"护甲等级", "Hit Points":"生命值", "Creature Capacity":"载员数", Rarity:"稀有度",
  Subtype:"亚类", Order:"派系", "Dish Type":"菜品类型", Serves:"份数", Total:"总耗时",
  Preparation:"准备时间", Cooking:"烹饪时间", Diet:"饮食类别", Allergens:"过敏原",
  "Skill Level":"技艺等级", Width:"宽度", Height:"高度", Hook:"线索", Designer:"设计者",
};
const pinyinCatalogs = new Set(["variantrules","conditionsdiseases","actions","languages"]);
export function filterName(key,label=key) {
  if (key==="Level" && document.body.dataset.page==="spells") return "环阶";
  return Object.hasOwn(fieldNames,key) ? fieldNames[key] : label;
}
export const filterValueLabel = text => typeof text==="string"
  ? text.replace(/\bLevel (\d+)\+/gi,"$1 级及以上") : text;
export function crNumber(value) {
  if (value == null || value === "—") return 999;
  if(value==="Unknown")return 998;
  const [n,d]=String(value).split("/").map(Number); return Number.isFinite(n) ? n/(d || 1) : Infinity;
}
const rarityOrder = ["none","common","uncommon","rare","very rare","legendary","artifact","varies","unknown (magic)","unknown"];
const nativeKey = value => typeof value === "string" ? value.toLowerCase() : value;
function compareNative(a,b) {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  return a === b ? 0 : b < a ? 1 : -1;
}
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const needAttunement = value => array(value).some(v => /^(?:需要?同调|需要?由.*同调|Requires? Attunement(?: By.*)?)$/i.test(v));

export function rarityName(code) { return rarities.get(code) || code || "—"; }
export const defaultFilters = () => ({type:"", rarity:"", attuned:false, rules:[], sort:"catalog", desc:false});

export class ItemFilters {
  constructor(change, loadExtras, fail) {
    this.state = defaultFilters();
    this.change = change;
    this.loadExtras = loadExtras;
    this.fail = fail;
    this.quickOptions = new WeakMap();
    this.bind();
  }

  configure(monster, optionSorts) {
    this.monster = monster;
    this.sortNames = optionSorts ? {catalog:"书目",...optionSorts} : monster ? monsterSortNames : itemSortNames;
    const columns=document.querySelector(".columns");
    columns.replaceChildren(...Object.entries(this.sortNames).filter(([key])=>key!=="catalog").map(([key,label])=>{
      const b=document.createElement("button");b.type="button";b.dataset.sort=key;b.textContent=label;
      b.onclick=()=>this.sortBy(key,this.state.sort===key && !this.state.desc);return b;
    }));
    byId("order-field").replaceChildren(...Object.entries(this.sortNames).map(([k,v])=>new Option(v,k)));
  }

  bind() {
    for (const key of ["type", "rarity", "attuned"]) byId(key).onchange = () => {
      const control = byId(key);
      this.state[key] = key === "attuned" ? control.checked : control.value;
      this.change();
    };
    this.configure(false);
    byId("order-field").onchange = () => this.sortBy(byId("order-field").value, false);
    byId("reverse").onclick = () => this.sortBy(this.state.sort, !this.state.desc);
    for (const b of document.querySelectorAll("[data-sort]")) b.onclick = () =>
      this.sortBy(b.dataset.sort, this.state.sort === b.dataset.sort && !this.state.desc);
    byId("field").onchange = () => this.fieldChanged();
    byId("add-filter").onclick = () => {
      const field = this.extras?.fields.find(f => f.key === byId("field").value);
      if (!field) return;
      const rule = {key:field.key};
      if (field.numeric) {
        const suffix=field.options?.length ? "-rank" : "";
        const min = byId("minimum"+suffix).value, max = byId("maximum"+suffix).value;
        if ((!min && !max) || (min && max && +min > +max)) return;
        if (min) rule.min=field.options?.length ? field.options[+min].value : +min;
        if (max) rule.max=field.options?.length ? field.options[+max].value : +max;
      } else {
        rule.value = byId("filter-value").value;
        if (!rule.value) return;
        rule.exclude = byId("operator").value === "exclude";
        if(byId("operator").value==="neutral")rule.neutral=true;
      }
      const encoded = JSON.stringify(rule);
      if (!this.state.rules.some(v => JSON.stringify(v) === encoded)) this.state.rules.push(rule);
      this.change();
    };
    byId("reset").onclick = () => { this.state = defaultFilters(); this.change(); };
    const openFilters = async () => {
      byId("filters").showModal();
      try { await this.loadExtras(); this.paintFields(); }
      catch (e) { this.fail(e); }
    };
    byId("filter-button").onclick = openFilters;
  }

  sortBy(key, desc) {
    this.state.sort = key;
    this.state.desc = desc;
    this.change();
  }

  setCatalog(index, extras = null) {
    this.index = index;
    this.extras = extras;
    this.extraCrByRow=null;
    this.fastCr=false;
    let options = this.quickOptions.get(index);
    if (!options) {
      const types = new Set(), rarity = new Set();
      for (const r of index.rows) {
        for (const t of array(this.monster ? r.filterType || r.type : r.type)) types.add(t);
        if (r.rarity) rarity.add(r.rarity);
      }
      options = [Array.from(types).sort(collator.compare), Array.from(rarity).sort((a,b) =>
        [...rarities.keys()].indexOf(a) - [...rarities.keys()].indexOf(b))];
      this.quickOptions.set(index, options);
    }
    for (const [i,key] of ["type","rarity"].entries()) {
      const values=!i && this.monster ? Object.keys(monsterTypeNames).filter(v=>options[0].includes(v)) : options[i];
      byId(key).replaceChildren(new Option("全部",""), ...values.map(v=>new Option(i ? rarityName(v) : this.monster ? monsterTypeNames[v] : v,v)));
    }
    if (byId("filters").open) this.paintFields();
  }

  paintFields() {
    const fields = this.extras?.fields || [], select = byId("field"), old = select.value;
    select.replaceChildren(...fields.map(f => new Option(filterName(f.key,f.label),f.key)));
    if (fields.some(f => f.key === old)) select.value = old;
    this.fieldChanged();
  }

  fieldChanged() {
    const f = this.extras?.fields.find(v => v.key === byId("field").value);
    const numeric = !!f?.numeric;
    const neutral=byId("operator").querySelector('[value="neutral"]');
    if(neutral){
      neutral.hidden=!(document.body.dataset.page==="races" && f?.key==="Traits") && !this.index?.defaultRules?.[f?.key]?.length;
      if(neutral.hidden && byId("operator").value==="neutral")byId("operator").value="include";
    }
    for (const id of ["filter-kind","filter-value-label"]) byId(id).hidden = numeric;
    for (const id of ["minimum-label","maximum-label"]) byId(id).hidden = !numeric;
    byId("minimum").value = byId("maximum").value = "";
    const ranks=!!(numeric && f.options?.length);
    for(const [id,k] of [["minimum","min"],["maximum","max"]]){
      const box=byId(id),select=byId(id+"-rank");box.hidden=ranks;select.hidden=!ranks;
      if(ranks)select.replaceChildren(new Option("不限",""),...f.options.map((o,i)=>new Option(filterValueLabel(o.label),String(i))));
      if(numeric){box.placeholder=f[k]??"";box.min=f.min??"";box.max=f.max??"";}
    }
    byId("filter-value").replaceChildren(...(f?.options || []).map(o => new Option(f.key === "rarity" ? rarityName(o.value) : filterValueLabel(o.label), o.value)));
  }

  sync() {
    const state = this.state;
    for (const id of ["type","rarity"]) byId(id).value = state[id];
    byId("attuned").checked = state.attuned;
    byId("order-field").value = state.sort;
    byId("reverse").textContent = state.desc ? "降序" : "升序";
    for (const b of document.querySelectorAll("[data-sort]")) {
      const on = b.dataset.sort === state.sort;
      b.setAttribute("aria-pressed", String(on));
      b.textContent = this.sortNames[b.dataset.sort] + (on && !(b.closest("#family-sort") && b.dataset.sort==="catalog") ? (state.desc ? " ↓" : " ↑") : "");
    }
    const chips = byId("chips");
    chips.hidden = !state.rules.length;
    for (const el of [chips, byId("conditions")]) {
      el.replaceChildren(...state.rules.map((rule,i) => {
        const f = this.extras?.fields.find(field => field.key === rule.key);
        const label = rule.key === "rarity" ? rarityName(rule.value)
          : filterValueLabel(f?.options?.find(o => String(o.value) === String(rule.value))?.label || rule.value);
        const text = rule.value != null ? (rule.neutral ? "忽略默认条件 " : rule.exclude ? "排除 " : "") + label :
          (rule.min ?? "不限") + " 至 " + (rule.max ?? "不限");
        const b = document.createElement("button");
        b.type = "button"; b.textContent = filterName(rule.key,f?.label) + " · " + text + " ×";
        b.title = "移除条件";
        b.onclick = () => { state.rules.splice(i,1); this.change(); };
        return b;
      }));
    }
  }

  needsExtras() {
    return (!this.fastCr && !!this.state.cr) || this.state.rules.some(r=>!r.quick) || ["source","weight","cost"].includes(this.state.sort);
  }

  predicate() {
    const s = this.state, extras = this.extras;
    const groups = new Map();
    for (const rule of s.rules) {
      if (!groups.has(rule.key)) groups.set(rule.key,[]);
      groups.get(rule.key).push(rule);
    }
    for(const [key,rules] of groups){
      for(const base of this.index?.defaultRules?.[key] || []){
        if(!rules.some(r=>String(r.value)===String(base.value)))rules.push(base);
      }
    }
    const customCategory = groups.has("category"), customType = !!s.type || groups.has("type");
    const crField=extras?.fields.find(f=>f.key==="cr");
    const ranks=new Map(crField?.options.map((o,i)=>[String(o.value),i]) || []);
    const fields=new Map(extras?.fields.map(f=>[f.key,f]) || []);
    return (row, i) => {
      if (this.monster) {
        if (row.hidden && !groups.get("misc")?.some(rule=>["冒险NPC","Adventure NPC"].includes(rule.value) && !rule.exclude)) return false;
        if (s.size?.length && !array(row.size).some(k=>s.size.includes(k))) return false;
        if(s.cr){
          const crs=this.extraCrByRow?.get(i) || extras?.columns.cr?.[i] || row.cr;
          if(!array(crs).some(v=>{const cr=crNumber(v);return cr>=s.cr[0] && cr<=(s.cr[1] ?? Infinity);}))return false;
        }
      } else if (row.hidden && this.index?.columns) {
        if(!row.blockedBy?.length || row.blockedBy.some(key=>!groups.has(key)))return false;
      } else if (row.hidden && row.family!=null) {
        // The native race Traits filter initially excludes NPC species. The user can
        // explicitly include these species or clear that default while applying other traits.
        if(!groups.get("Traits")?.some(rule=>rule.value==="NPC种族" && !rule.exclude))return false;
      } else if (row.hidden) {
        if (!customCategory && row.category === "特殊变体") return false;
        if (!customType && array(row.type).some(v => typesHiddenByDefault.has(v))) return false;
        if (!customCategory && !customType) return false;
      }
      if (s.type && !array(this.monster ? row.filterType || row.type : row.type).includes(s.type)) return false;
      if (s.rarity && !array(s.rarity).includes(row.rarity)) return false;
      if (!this.monster && s.attuned && !needAttunement(row.attunement)) return false;
      for (const [key,rules] of groups) {
        const field=fields.get(key);
        if(field?.inactive)continue;
        const v = extras?.columns[key]?.[i] ?? row.quick?.[key] ?? row[key];
        const vals = array(v).map(String);
        let include = false, matched = false;
        for (const rule of rules) {
          if(rule.neutral)continue;
          if (rule.value != null) {
            const umbrella=key==="language" && !rule.exclude && !rules.some(r=>r.value==="CS") &&
              vals.some(v=>v==="X" || v==="XX") && !["X","XX"].every(v=>rules.some(r=>r.value===v && r.exclude));
            const hit=vals.includes(String(rule.value)) || umbrella || (!rule.exclude && field?.umbrella?.some(s=>vals.includes(s) && !rules.some(r=>r.exclude && r.value===s)));
            if (rule.exclude && hit) return false;
            if (!rule.exclude) { include = true; matched ||= hit; }
          } else {
            const f=fields.get(key);
            const boundary=(val,fallback)=>val==null ? fallback : key==="cr" ? ranks.get(String(val)) ?? crNumber(val) : Number(val);
            const lo=boundary(rule.min,f?.min ?? -Infinity),hi=boundary(rule.max,f?.max ?? Infinity);
            if(v==null){if(lo===f?.min && hi===f?.max)continue;return false;}
            if(field?.fullRange && array(v).some(x=>x<lo || x>hi))return false;
            if(!array(v).some(x=>{
              const val=key==="cr" && ranks.size ? ranks.get(String(x)) : Number(x);
              return val>=lo && val<=hi;
            }))return false;
          }
        }
        if (include && !matched) return false;
      }
      return true;
    };
  }

  sort(ids) {
    const {sort, desc} = this.state;
    if(this.index.columns && (sort==="name" || (sort==="catalog" && pinyinCatalogs.has(document.body.dataset.page)))){
      const rows=this.index.rows;
      ids.sort((a,b)=>collator.compare(rows[a].n,rows[b].n));
      return desc?ids.reverse():ids;
    }
    if(!this.index.columns && sort==="time" && this.index.sortOrder?.time){
      // The source comparator is non-transitive for unnormalised casting times.
      // Sort the filtered insertion sequence so those entries retain the native landing positions.
      const rows=this.index.rows,keep=new Set(ids);
      const result=rows.map((_,i)=>i).filter(i=>keep.has(i));
      result.sort((a,b)=>compareNative(Number(rows[a].time),Number(rows[b].time)) || compareNative(rows[a].n.toLowerCase(),rows[b].n.toLowerCase()));
      return desc?result.reverse():result;
    }
    if(this.index.sortOrder?.[sort]){
      const keep=new Set(ids),ordered=this.index.sortOrder[sort].filter(i=>keep.has(i));
      return desc?ordered.reverse():ordered;
    }
    if (this.monster && sort !== "catalog") {
      const rows=this.index.rows;
      const key=(r,i)=>sort==="cr" ? crNumber(r.cr) : nativeKey(sort==="source" ? this.index.sources[r.s].abv : sort==="translate" ? undefined : sort==="name" ? r.n : r[sort]);
      return ids.sort((a,b)=>{
        const x=rows[a],y=rows[b];
        // 原表头的 translate 没有写入 ListItem.values，因此按名称排序。
        // 同名同值时沿用原加载顺序：默认来源与自制书先到，其余官方来源随后追加。
        const cmp=compareNative(key(x,a),key(y,b)) || (sort==="source" ? compareNative(this.extras?.columns.sortPage?.[a],this.extras?.columns.sortPage?.[b]) : 0)
          || compareNative(nativeKey(x.n),nativeKey(y.n))
          || Number(this.index.sources[y.s].defaultOn)-Number(this.index.sources[x.s].defaultOn) || a-b;
        return desc ? -cmp : cmp;
      });
    }
    if (sort === "catalog") {
      if (!desc) return ids;
      return [...ids.filter(i=>this.index.rows[i].m).reverse(), ...ids.filter(i=>!this.index.rows[i].m).reverse()];
    }
    const rows = this.index.rows, extras = this.extras, sources = this.index.sources;
    const keys = [];
    for (const id of ids) {
      const r=rows[id], columns=extras?.columns;
      const name = nativeKey(r.n);
      let value;
      switch (sort) {
        case "name": value = name; break;
        case "source": value = sources[r.s].abv; break;
        case "rarity": {
          const rank = rarityOrder.indexOf(r.rarity);
          value = rank < 0 ? Number.MAX_SAFE_INTEGER : rank;
          break;
        }
        case "type": value = array(r.type).join(", "); break;
        case "attunement": value = r.attunement !== "无需同调"; break;
        case "cost": value = columns?.sortCost?.[id] ?? columns?.cost?.[id] ?? 0; break;
        case "weight": value = Number(columns?.weight?.[id]) || 0; break;
      }
      keys[id] = {name,value:nativeKey(value),page:sort === "source" ? nativeKey(columns?.sortPage?.[id]) : null};
    }
    // 两张旧列表各有各的表头。某栏只适用于其中一张时，另一张保留自己的默认顺序。
    return ids.sort((a,b) => {
      if (rows[a].m !== rows[b].m) return rows[a].m ? -1 : 1;
      if (rows[a].m ? sort === "rarity" || sort === "attunement" : sort === "cost") return 0;
      const x = keys[a], y = keys[b];
      const cmp = compareNative(x.value,y.value) || compareNative(x.page,y.page)
        || compareNative(x.name,y.name) || a-b;
      return desc ? -cmp : cmp;
    });
  }
}

