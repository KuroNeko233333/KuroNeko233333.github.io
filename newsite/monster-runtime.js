// One isolated renderer per open revision, created only when a scale control is used.
let current;
async function startRenderer(bundle) {
    const frame=document.createElement("iframe");
    frame.hidden=true;
    frame.title="怪物缩放排版";
    const loaded=new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
    frame.srcdoc='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body></body></html>';
    document.body.append(frame);
    await loaded;
    const win=frame.contentWindow, doc=frame.contentDocument;
    const urls=[];
    const append=(code,type)=>{
        const el=doc.createElement("script");
        if (type) el.type=type;
        el.textContent=code;
        doc.head.append(el);
    };
    try {
        const imports={};
        for (const [path,source] of Object.entries(bundle.modules)) {
            const url=win.URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
            urls.push(url);
            imports["@bestiary/"+path]=url;
        }
        append(JSON.stringify({imports}),"importmap");
        for (const source of bundle.classic) append(source);
        win.FilterItem=class {};
        win.Hist={util:{getCleanHash:hash=>hash.replace(/,+/g,",").replace(/,$/,"").toLowerCase(),
            getHashParts:hash=>hash.replace(/^#/,"").split(",")}};
        win.VetoolsConfig={get(group,key) {
            if (group==="styleSwitcher" && key==="style") return "one";
            throw Error("缺少排版设置 "+group+"/"+key);
        }};
        const ready=new Promise((resolve,reject)=>{
            win.startScaling=resolve;
            win.failScaling=reject;
        });
        append('try { await import("@bestiary/js/utils-dataloader.js"); await import("@bestiary/js/utils-brew.js"); await import("@bestiary/js/shim-esmodules.js"); const {RenderBestiary}=await import("@bestiary/js/render-bestiary.js"); window.startScaling(RenderBestiary); } catch(e) { window.failScaling(e); }',"module");
        const renderer=await ready;
        win.BrewUtil2._cache_metas=bundle.brew;
        win.PrereleaseUtil._cache_metas=bundle.pre;
        win.ScaleCreature._spells=bundle.spells;
        await win.I18nUtil.loadProperties("zh_CN");
        // Native getters run synchronously while a card is rendered.
        win.DataUtil.monster.getLegendaryGroup=()=>win.currentLegendary;
        return {win,renderer,close:()=>frame.remove()};
    } catch (e) {
        frame.remove();
        throw e;
    } finally {
        urls.forEach(url=>win.URL.revokeObjectURL(url));
    }
}

function spellLevelBonus(expression,level) {
    const compact=expression.replace(/\s/g,"").replace(/[一二三四五六七八九]/g,c=>String("一二三四五六七八九".indexOf(c)+1));
    let match=compact.match(/^(?:法术)?每比(\d)环高(?:1法术环阶|的法术环阶|1环增加)(\d+)点?$/)
        || compact.match(/^(?:每个)?高于(\d)环?(?:的法术环阶|的每环阶|每环)(\d+)点?$/);
    if (match) return Math.max(0,level-Number(match[1]))*Number(match[2]);
    match=compact.match(/^(\d+)[×x]?每比(\d)环高的法术(?:等级|环阶)$/);
    if (match) return Number(match[1])*Math.max(0,level-Number(match[2]));
    match=compact.match(/^每个?法术环阶(\d+)$/) || compact.match(/^(\d+)每法术环阶$/);
    return match ? level*Number(match[1]) : null;
}

function chineseSummonStats(mon) {
    const level=mon._scaledSpellSummonLevel;
    const hp=mon.hp?.special || "";
    const multiple=hp.match(/^(\d+)\s*[×x]\s*法术位环阶$/);
    if (multiple) {
        const value=Number(multiple[1])*level;
        mon.hp={average:value,special:String(value)};
    }
    const expr=hp.match(/^(.+?)(?:\s*\+\s*|，外加)([^（]+?)(（[^）]*生命骰[^）]*）)?$/);
    if (expr) {
        const bonus=spellLevelBonus(expr[2],level);
        const base=expr[1].trim();
        if (bonus!=null && /^\d+$/.test(base)) {
            const value=Number(base)+bonus;
            mon.hp={average:value,special:String(value)+(expr[3] || "")};
        } else if (bonus!=null && /^\d+\s*（[^）]+）(?:或\s*\d+\s*（[^）]+）)+$/.test(base)) {
            mon.hp={special:base.replace(/\d+(?=\s*（)/g,n=>String(Number(n)+bonus))+(expr[3]||"")};
        }
    }
    for (let i=0;i<(mon.ac?.length || 0);i++) {
        const special=mon.ac[i]?.special || "";
        const ac=special.match(/^(\d+)\s*\+\s*(?:法术(?:环阶|等级|环数)|每法术环阶\s*1)(.*)$/);
        if (ac) {
            const value=Number(ac[1])+level;
            mon.ac[i]=ac[2] ? {special:String(value)+ac[2]} : value;
        }
    }
}

export function prepareMonsterScale(digest,readObject) {
    if (!current || current.digest!==digest) {
        current?.engine.then(engine=>engine.close(),()=>{});
        const engine=readObject(digest).then(startRenderer);
        current={digest,engine};
        engine.catch(()=>{if(current?.engine===engine) current=null;});
    }
    return current.engine;
}

export async function scaleMonster(card,opts,digest,readObject,renderCard=true) {
    const {cr,spell,classLevel}=opts;
    if (cr==null && spell==null && classLevel==null) return card;
    if (cr!=null && String(cr)===String(card.model.cr?.cr ?? card.model.cr)) return card;
    const {win,renderer}=await prepareMonsterScale(digest,readObject);
    let model;
    // Clone into the library realm. Native methods use its Array prototypes.
    const base=win.JSON.parse(JSON.stringify(card.model));
    if (cr!=null) {
        const value=win.Parser.crToNumber(String(cr));
        model=await win.ScaleCreature.scale(base,value);
    } else if (spell!=null) {
        model=await win.ScaleSpellSummonedCreature.scale(base,Number(spell));
        chineseSummonStats(model);
    } else {
        model=await win.ScaleClassSummonedCreature.scale(base,Number(classLevel));
    }
    if (!renderCard) return {model};
    win.currentLegendary=card.legendary ? win.JSON.parse(JSON.stringify(card.legendary)) : null;
    return {...card,model,html:win.renderMonsterTable(model,renderer)};
}
