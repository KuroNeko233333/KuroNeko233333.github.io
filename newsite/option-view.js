import {retireDialog} from "./motion.js";
import {filterName,filterValueLabel} from "./item-filters.js";

export const readingPages = new Set(["dmscreen","statgen","crcalculator","classes","index","books","adventures","library","book","adventure","quickreference","search","terms"]);
export const referencePages = {"conditionsdiseases":"状态与疾病","variantrules":"规则术语","actions":"动作","tables":"表格","languages":"语言","deities":"神祇","objects":"物件","trapshazards":"陷阱与危害","vehicles":"载具","rewards":"其他奖励","cultsboons":"异教与超自然赠礼","bastions":"据点","psionics":"灵能","recipes":"食谱","homecrafts":"手工艺品","decks":"牌组","charcreationoptions":"其他角色创建选项","names":"命名表"};
export const optionPages = {...referencePages,spells:"法术",feats:"专长",backgrounds:"背景",optionalfeatures:"职业选项",races:"种族"};
export const ownedPage = page => readingPages.has(page) || page==="items" || page==="bestiary" || Object.hasOwn(optionPages,page);
const node = (tag,cls,text) => {
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!=null)e.textContent=text;
    return e;
};
export function optionQuick(catalog,filters,change) {
    const lines=["quick-first","quick-second"].map(id=>document.getElementById(id));
    document.querySelector(".widget-storage").append(document.getElementById("type"));
    lines.forEach(el=>el.replaceChildren());
    const summary=document.getElementById("quick-summary");
    const picks=[];
    for(const group of catalog.quick){
        const line=lines[group.row];
        const groupName=group.name===group.field ? filterName(group.field) : group.name;
        if(groupName)line.append(node("span","quick-label",groupName));
        const keys=opt=>(opt.keys || [opt.key]).map(String);
        const isOn=opt=>filters.state.rules.some(r=>r.key===group.field && !r.exclude && !r.neutral && keys(opt).includes(String(r.value)));
        const choose=opt=>{
            const remove=new Set((group.single?group.options:[opt]).flatMap(keys)),was=isOn(opt);
            filters.state.rules=filters.state.rules.filter(r=>!(r.key===group.field && remove.has(String(r.value))));
            if(!was)for(const v of keys(opt))filters.state.rules.push({key:group.field,value:v,quick:true});
            change();
        };
        function chip(opt){
            const b=node("button","chip",filterValueLabel(opt.text));
            b.type="button";b.setAttribute("aria-pressed",String(isOn(opt)));
            if(catalog.icons[opt.key] && (group.field==="School" || group.field==="Category")){
                const icon=node("span","option-icon");icon.innerHTML=catalog.icons[opt.key];b.prepend(icon);
            }
            b.onclick=()=>choose(opt);return b;
        }
        const on=group.options.filter(isOn);picks.push(...on.map(o=>filterValueLabel(o.active || o.text)));
        if(group.dropdown){
            const button=node("button","chip option-drop",on.map(o=>filterValueLabel(o.text)).join("、") || "全部");
            button.setAttribute("aria-label",groupName);button.setAttribute("aria-haspopup","true");button.setAttribute("aria-pressed",String(!!on.length));
            button.onclick=()=>{
                const menu=node("div","option-menu");menu.popover="auto";
                menu.append(...group.options.map(opt=>{const b=chip(opt);b.onclick=()=>{menu.hidePopover();choose(opt);};return b;}));
                document.body.append(menu);menu.addEventListener("toggle",()=>{if(!menu.matches(":popover-open"))retireDialog(menu);});
                menu.showPopover();const rect=button.getBoundingClientRect();
                menu.style.left=Math.min(rect.left,innerWidth-menu.offsetWidth-6)+"px";
                menu.style.top=Math.min(rect.bottom+2,innerHeight-menu.offsetHeight-4)+"px";
                menu.querySelector("button")?.focus();
            };line.append(button);
        }else line.append(...group.options.map(chip));
    }
    lines[0].hidden=!lines[0].childElementCount;
    lines[1].hidden=!lines[1].childElementCount;
    summary.replaceChildren();summary.hidden=!picks.length;
    if(picks.length){
        const clear=node("button",null,"清除");clear.onclick=()=>{filters.state.rules=filters.state.rules.filter(r=>!r.quick);change();};
        summary.append("正在看：",node("b",null,picks.join(" · ")),clear);
    }
}

let openFamilies;
try{openFamilies=new Set(JSON.parse(sessionStorage.getItem("ours.raceFamilies.open") || "[]"));}
catch{openFamilies=new Set();}
const searchFolded=new Set();
let lastSearch;
export function familyRows(catalog,visible,query,reveal){
    if(query!==lastSearch){searchFolded.clear();lastSearch=query;}
    const groups=new Map(),roles=new Map(),entries=[];
    for(const i of visible){
        const r=catalog.rows[i];
        if(!groups.has(r.family))groups.set(r.family,{rep:i,items:[]});
        const g=groups.get(r.family);g.items.push(i);
        if(r.rep && !catalog.rows[g.rep].rep)g.rep=i;
    }
    for(const i of visible){
        const row=catalog.rows[i],g=groups.get(row.family);
        if(i!==g.rep)continue;
        if(reveal && g.items.some(n=>n!==i && catalog.rows[n].h===reveal)){
            openFamilies.add(row.family);searchFolded.delete(row.family);
        }
        const expanded=query ? !searchFolded.has(row.family) : openFamilies.has(row.family);
        roles.set(i,{head:true,label:g.items.length>1||row.rep ? row.family : row.n,count:g.items.length,expanded});
        entries.push(i);
        if(expanded)for(const j of g.items)if(j!==i){entries.push(j);roles.set(j,{head:false});}
    }
    return {entries,roles};
}
export function toggleFamily(family,expanded,query){
    if(query){if(expanded)searchFolded.delete(family);else searchFolded.add(family);}
    else {if(expanded)openFamilies.add(family);else openFamilies.delete(family);
        sessionStorage.setItem("ours.raceFamilies.open",JSON.stringify([...openFamilies]));}
}
export function optionRow(a,name,meta,row,index,role,changeFamily){
    meta.textContent=filterValueLabel(row.meta);
    if(row.conc)meta.append(node("small","option-conc","专"));
    if(row.icon && index.icons[row.icon]){const icon=node("span","option-icon");icon.innerHTML=index.icons[row.icon];meta.prepend(icon);}
    if(row.level!=null)a.append(node("span","spell-level",row.level ? row.level+" 环":"戏法"));
    if(!role)return;
    const ability=(row.ability || "").replace(/^None$/i,"");
    const cell=node("span","race-ability",ability || "—");
    cell.title=ability;
    a.append(cell);
    a.dataset.family=row.family;
    if(!role.head){a.classList.add("family-child");return;}
    name.firstChild.textContent=role.label;
    a.dataset.familySize=role.count;
    if(role.label!==row.n && !row.rep){const sub=name.querySelector("small") || name.appendChild(node("small","english"));sub.textContent=[row.n,row.e].filter(Boolean).join(" · ");}
    if(role.count<2)return;
    const toggle=node("button","family-toggle");
    toggle.setAttribute("aria-expanded",String(role.expanded));toggle.setAttribute("aria-label",(role.expanded?"收起":"展开")+row.family);
    toggle.onclick=e=>{e.preventDefault();e.stopPropagation();changeFamily(row.family,!role.expanded);};
    name.title=row.n;a.prepend(toggle);toggle.title=role.count+" 个条目";
}

