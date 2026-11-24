const catalogs=new Map();
const resistTypes={
    强酸:["acid","酸"],钝击:["bludgeoning"],寒冷:["cold","冰","冷冻"],火焰:["fire","火"],
    力场:["force"],闪电:["lightning","雷电"],暗蚀:["necrotic","死灵"],穿刺:["piercing"],
    毒素:["poison","毒"],心灵:["psychic"],光耀:["radiant"],挥砍:["slashing"],雷鸣:["thunder"]
};
const damageEffects=Object.entries(resistTypes).map(([type,[english,...aliases]])=>({
    id:type,damage:type,keys:[type,english,...aliases],
    words:[...[type,...aliases].flatMap(x=>["抗"+x,x+"抗性",x+"伤害抗性"]),type+"伤害的抗性",
        type+"伤害有抗性",type+"伤害具有抗性",type+"伤害拥有抗性","抗性："+type,"抗性（"+type]
}));
const effects=[
    {id:"ac",words:["ac","护甲等级","护甲类","防御等级"]},
    {id:"save",words:["豁免","豁免检定"]},
    {id:"fly",words:["飞行","飞行速度"]},
    ...damageEffects
];
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const damageList=Object.keys(resistTypes).concat("冷冻","死灵").join("|");
const joinDamage="(?:[、，,]|以及|和|或|与)\\s*";
const chineseTypes=effect=>effect.keys.filter(k=>!/^[a-z]+$/.test(k)).join("|");
function typedList(effect){
    const any="(?:"+damageList+")";
    return "(?:"+any+joinDamage+")*(?:"+chineseTypes(effect)+")(?:"+joinDamage+any+")*";
}
function matcher(word){
    const effect=effects.find(group=>group.words.includes(word));
    const pattern=[...new Set(effect?.words || [word])].sort((a,b)=>b.length-a.length)
        .map(value=>value==="ac" ? "(?<![a-z])ac(?![a-z])" : escape(value));
    if(effect?.damage){
        const list=typedList(effect);
        pattern.push("抗性\\s*[：:]\\s*"+list,list+"伤害(?:的)?(?:有|具有|拥有)?抗性");
    }
    return new RegExp(pattern.join("|"),"giu");
}

function snippet(lines, patterns) {
    const complete=new Set();
    let first;
    for(const line of lines){
        const hits=[];
        let matched=0;
        for(const [i,pattern] of patterns.entries()){
            pattern.lastIndex=0;
            const hit=pattern.exec(line);
            if(!hit)continue;
            matched++;complete.add(i);
            hits.push([hit.index,hit.index+hit[0].length]);
        }
        if(matched && !first)first=[line,hits];
        if(matched===patterns.length && line.length>6)return [line,hits];
    }
    return complete.size===patterns.length ? first : null;
}

const ac="(?<![a-z])ac(?![a-z])|护甲等级|护甲类|防御等级";
const save="豁免(?:检定)?";
const positive="(?:[+＋]\\s*[1-9]\\d*|(?:等于|等同于)[^。！？；，,]{0,18}(?:调整值|熟练加值))";
const actor="(?:你|穿戴者|佩戴者|穿着者|持用者|持握者|使用者|饮用者|着装者|受术者|同调者|友方生物)";
const verbs="(?:获得|得到|享有|拥有|具有|提高|增加|提供|赋予|给予|授予)";
const until="[^。！？；]{0,26}?";
const grantBonus=term=>new RegExp(
    "(?:"+actor+until+"(?:"+term+")[^，,。！？；]{0,12}?(?:"+verbs+"[^，,。！？；]{0,9})?"+positive
    +"|"+actor+until+verbs+until+positive+"[^，,。！？；]{0,9}(?:"+term+")[^，,。！？；]{0,4}(?:加值|加成|增益)"
    +"|(?:使|让|赋予|给予)"+actor+until+"(?:"+term+")[^，,。！？；]{0,10}"+positive+")","iu");
const grantRules={
    ac:grantBonus(ac),
    save:new RegExp(grantBonus(save).source+"|"+actor+until+"(?:豁免|豁免检定)[^，,。！？；]{0,10}(?:具有|拥有|获得)优势","iu"),
    fly:new RegExp(actor+"[^。！？；，,]{0,26}?(?:[，,](?:并|且))?(?:(?:获得|拥有|具有|得到|享有)[^。！？；，,]{0,34}飞行速度|(?:的)?飞行速度(?:为|变为|等于|等同于)\\s*(?:[1-9]\\d*\\s*(?:英?尺|ft)|(?:你的)?步行速度)|(?:能够|能|可以|可)\\s*(?:在空中)?飞行(?!术))","iu"),
};
const linkedAc=new RegExp("目标速度翻倍[^。！？]{0,8}其(?:的)?(?:"+ac+")[^。！？；，,]{0,12}"+positive,"iu");
const linkedFly=/自愿生物[^。！？]{0,20}(?:使|让)(?:该)?目标[^。！？；，,]{0,24}获得[^。！？；，,]{0,18}飞行速度/u;
const damageGrant=new Map(damageEffects.map(effect=>{
    const list=typedList(effect);
    return [effect.id,new RegExp("(?:"+actor+until+"(?:对|对于)?"+list+"(?:伤害)?(?:的)?(?:有|具有|获得|拥有)?抗性"
        +"|(?:赋予|给予|提供|授予)"+actor+until+list+"伤害(?:的)?抗性"
        +"|"+actor+until+"(?:获得|具有|拥有|选择)[^。！？；]{0,40}抗性\\s*[：:]\\s*"+list+")","iu")];
}));
const immunity=new Map(damageEffects.map(effect=>[
    effect.id,new RegExp(actor+until+"(?:对|对于)(?:"+chineseTypes(effect)+")伤害(?:具有|获得|拥有)?免疫","iu")
]));

function grantingLine(line,effect,via){
    if(/(?:失去|降低|削减|减值|扣除|抵消|忽略|无视|物件的|目标的)[^，,。；！？]{0,10}(?:护甲等级|AC|豁免|飞行速度|抗性)/iu.test(line))return false;
    if(effect.id==="ac" && /(?:AC|护甲等级|护甲类)[^，,。；！？]{0,4}(?:等于|等同于|变为)|(?:AC|护甲等级)[^，,。；！？]{0,14}(?:加值|调整值)上限/iu.test(line))return false;
    if(effect.id==="fly" && /举个例子|例如飞行速度|若你已拥有|已有飞行速度|飞行速度的(?:生物|野兽|游泳速度|步行速度)|飞行速度[^，,。；！？]{0,8}(?:降低|减少|减半)/u.test(line))return false;
    return (effect.damage ? damageGrant.get(effect.id) : grantRules[effect.id])?.test(line)
        || !!(via && ((effect.id==="ac" && linkedAc.test(line)) || (effect.id==="fly" && linkedFly.test(line))));
}
function linkedGrant(lines,name,effect){
    for(const [i,line] of lines.entries()){
        if(!line.includes(name))continue;
        const limitation=line.match(/仅(?:限)?\s*([^（）()、，。]{1,9})(?:伤害|[）)])/);
        if(effect.damage && limitation && !effect.keys.some(key=>limitation[1].includes(key)))continue;
        if(/(?:无法|不能|不会|无视|抵消|终止|解除|穿透)[^。！？；]{0,8}(?:施展|施放|该法术|效应|效果|法术)/u.test(line))continue;
        if(/(?:施展|施放|获得|受益于|享有|处于|受到|如同|视为)/u.test(line) ||
            /消耗充能\s*\d/.test(line) ||
            (/^(?:法术 )?[^。！？]{1,34}$/.test(line) &&
                lines.slice(Math.max(0,i-4),i).some(prefix=>/(?:可|可以).{0,24}(?:施展|施放)以下/u.test(prefix))))return true;
    }
    return false;
}
function resistanceField(values,effect,condition=""){
    for(const part of values || []){
        if(typeof part==="string" && effect.keys.includes(part.toLowerCase()))return [condition];
        if(part?.resist){
            const found=resistanceField(part.resist,effect,part.cond || condition);
            if(found)return found;
        }
    }
    return null;
}
function fieldResult(data,effect,own){
    if(effect.id==="ac"){
        const delta=data.bonusAc,shield=data.shieldAc;
        if(delta)return ["AC +"+delta+(shield ? "（另有盾牌 AC +"+shield+"）" : ""),"bonusAc"];
        if(shield)return ["AC +"+shield,"ac（盾牌）"];
    }else if(effect.id==="save"){
        if(data.bonusSavingThrow)return ["豁免 +"+data.bonusSavingThrow,"bonusSavingThrow"];
    }else if(effect.id==="fly"){
        const speed=data.modifySpeed;
        if(speed){
            const fields=[speed.static ? "static" : "equal"];
            let label=speed.static ? "飞行速度 "+speed.static+" 尺" : "飞行速度等于步行速度";
            if(speed.multiply && speed.multiply!==1){label+=" × "+speed.multiply;fields.push("multiply");}
            if(speed.bonus){label+=(Number(speed.bonus)>0 ? " + " : " ")+speed.bonus+" 尺";fields.push("bonus");}
            if(own?.some(line=>/^\d+ · (?:增益词条|植入效果) .*飞行速度/.test(line)))label+="（按表取得）";
            if(own?.some(line=>/磅[^，,。！？]{0,10}·\s*飞行速度/.test(line)))label+="（按承重）";
            return [label,fields.map(field=>"modifySpeed."+field+".fly").join(" + ")];
        }
    }else{
        const resistance=resistanceField(data.resist,effect);
        if(!resistance)return null;
        const matchingType=new RegExp(typedList(effect)+"(?:伤害)?(?:的)?(?:有|具有|拥有)?抗性|抗性\\s*[：:]\\s*"+typedList(effect));
        // Some flattened fields are shared across dormant/awakened/ascended
        // variants. When prose exists, confirm which of those stages grants it.
        const supported=!own?.length || own.some(line=>grantingLine(line,effect,false)
            || /(?:所有|一切|全部)伤害(?:的)?抗性|对(?:所有|一切|全部)伤害具有抗性/.test(line)
            || (!immunity.get(effect.id).test(line) && /(?:获得|赋予|给予|具有|拥有|选择)/.test(line) && matchingType.test(line)));
        if(supported){
            return [effect.damage+"伤害抗性"+(resistance[0] ? "（"+resistance[0]+"）" : ""),"resist"];
        }
    }
    return null;
}
function effectSnippet(lines,pattern,effect,via){
    let mention;
    for(const line of lines){
        pattern.lastIndex=0;
        const hit=pattern.exec(line);
        if(!hit)continue;
        const result=[line,[[hit.index,hit.index+hit[0].length]]];
        if(grantingLine(line,effect,via))return {grant:result,mention:mention || result};
        if(!mention || mention[0].length<=6)mention=result;
    }
    return {mention};
}

async function load(url) {
    const response=await fetch(url);
    if(!response.ok)throw new Error("找不到效果索引（HTTP "+response.status+"）");
    if(!url.endsWith(".gz"))return response.json();
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes[0]!==0x1f || bytes[1]!==0x8b)return JSON.parse(new TextDecoder().decode(bytes));
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

self.onmessage=async ({data:{id,url,terms}})=>{
    try{
        if(!catalogs.has(url))catalogs.set(url,load(url).catch(error=>{catalogs.delete(url);throw error;}));
        const {docs,linked,facts=[]}=await catalogs.get(url);
        if(!terms){postMessage({id});return;}
        const effect=terms.length===1 && effects.find(group=>group.words.includes(terms[0]));
        const patterns=terms.map(matcher),found=[];
        if(effect){
            const matchingLinks=linked.map(([name,lines])=>[name,effectSnippet(lines,patterns[0],effect,true)]);
            for(const [row,own,refs] of docs){
                const direct=effectSnippet(own,patterns[0],effect,false);
                if(direct.grant){found.push([row,[1,"",...direct.grant]]);continue;}
                const targets=refs.map(ref=>matchingLinks[ref]);
                const granted=targets.find(([name,hit])=>hit.grant && linkedGrant(own,name,effect));
                if(granted){found.push([row,[2,granted[0],...granted[1].grant]]);continue;}
                if(direct.mention){found.push([row,[3,"",...direct.mention]]);continue;}
                const cited=targets.find(([,hit])=>hit.mention);
                if(cited)found.push([row,[4,cited[0],...cited[1].mention]]);
            }
            const ownText=new Map(docs.map(([i,lines])=>[i,lines]));
            const fields=[];
            for(const [row,data] of facts){
                const value=fieldResult(data,effect,ownText.get(row<0 ? ~row : row));
                if(value)fields.push([row,[0,"",value[0],[],value[1]]]);
            }
            postMessage({id,found,fields,effect});
            return;
        }
        const matchingLinks=linked.map(([name,lines])=>{
            const hit=snippet(lines,patterns);return hit && [name,...hit];
        });
        for(const [row,own,refs] of docs){
            const direct=snippet(own,patterns);
            if(direct)found.push([row,[1,"",...direct]]);
            else for(const ref of refs){
                const hit=matchingLinks[ref];
                if(hit){found.push([row,[2,...hit]]);break;}
            }
        }
        postMessage({id,found});
    }catch(error){
        postMessage({id,error:error.message});
    }
};
