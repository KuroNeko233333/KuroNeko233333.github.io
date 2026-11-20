const sum=(items,fn)=>items.reduce((total,item)=>total+fn(item),0);
export const MCDM="mcdmFleeMortals";

const fractions=new Map([
    [".125","⅛"],[".2","⅕"],[".25","¼"],[".375","⅜"],[".4","⅖"],[".5","½"],
    [".6","⅗"],[".625","⅝"],[".75","¾"],[".8","⅘"],[".875","⅞"],
    [".33","⅓"],[".67","⅔"],[".17","⅙"],[".83","⅚"]
]);
export function formatCr(number){
    if(Number.isInteger(number))return String(number);
    const [whole,decimal]=String(number).split(".");
    const remainder="."+decimal;
    const glyph=fractions.get(remainder)||fractions.get(Number(remainder).toFixed(2).slice(1));
    if(glyph)return (whole==="0"?"":whole)+glyph;
    // Match the reader's six-decimal fractional fallback (including floating point rounding).
    const rounded=Number(number.toFixed(6));
    if(!rounded)return "0";
    const denominator=10**(String(rounded).length-2),numerator=rounded*denominator;
    let a=numerator,b=denominator;
    while(b>=Number.EPSILON)[a,b]=[b,Math.floor(a%b)];
    const bottom=Math.floor(denominator/a),top=Math.floor(numerator/a);
    return bottom===1?String(top):top+"/"+bottom;
}
export function crNumber(cr){
    if(cr==null || !/^\d+(?:\/\d+)?$/.test(cr))return null;
    const [a,b=1]=String(cr).split("/").map(Number);return a/b;
}

// Adjust the existing groups as the legacy builder does: start with one of
// each unlocked creature, leave locked groups intact, and add within budget.
export function fitCrBudget(items,group,budget){
    const adjusted=items.map(item=>item.l||group(item).cr==null?{...item}:{...item,c:"1"});
    const adjustable=adjusted.filter(item=>!item.l&&group(item).cr!=null);
    if(!adjustable.length)return null;
    const base=sum(adjusted,item=>(group(item).cr||0)*Number(item.c??1));
    if(base>budget)return null;
    const choices=new Map();
    for(const item of adjustable){
        const cost=Math.round(group(item).cr*16);
        if(cost>0&&!choices.has(cost))choices.set(cost,item);
    }
    if(!choices.size)return adjusted;
    const limit=Math.min(Math.floor((budget-base)*16),Math.max(...choices.keys())*2500);
    const counts=new Uint16Array(limit+1);counts.fill(65535);counts[0]=0;
    const previous=new Int32Array(limit+1);
    for(let spend=1;spend<=limit;spend++){
        for(const cost of choices.keys()){
            if(cost>spend||counts[spend-cost]>=2500||counts[spend-cost]+1>=counts[spend])continue;
            previous[spend]=cost;
            counts[spend]=counts[spend-cost]+1;
        }
    }
    let spend=limit;
    while(spend&&!previous[spend])spend--;
    while(spend){
        const cost=previous[spend],item=choices.get(cost);
        item.c=String(Number(item.c)+1);
        spend-=cost;
    }
    return adjusted;
}
export function encounterResult(rules,table,players,groups){
    const classic=rules==="classic",mcdm=rules===MCDM,tiers=Object.keys(table[rules]),last=mcdm?"extreme":"absurd";
    const count=sum(players,p=>p.count),budget=Object.fromEntries(tiers.map(t=>[t,sum(players,p=>table[rules][t][p.level]*p.count)]));
    budget[last]=2*budget[tiers.at(-1)]-budget[tiers.at(-2)];
    const xpNext=sum(players,p=>(table.levelXp[Math.min(19,p.level)]-table.levelXp[p.level-1])*p.count);
    const daily=sum(players,p=>table.daily[p.level]*p.count);
    const dpt=sum(players,p=>table.damage[p.level-1]*p.count);
    const turns=dpt?sum(groups,g=>(g.hp||0)*(g.ac/10||0)*g.count)/dpt:0;
    const monsters=groups.filter(g=>g.cr!=null),total=sum(monsters,g=>g.count);
    const xp=sum(monsters,g=>g.xp*g.count);
    const base=mcdm?sum(monsters,g=>g.cr*g.count):xp;
    const standardXp=mcdm?sum(monsters,g=>g.standardXp*g.count):xp;
    let relevant=total,mult=1;
    if(classic){
        if(total && monsters.some(g=>g.cr>2) && sum(players,p=>p.level>=5?p.count:0)/count>=.333){
            const mean=sum(monsters,g=>g.cr*g.count)/total;
            const cutoff=mean-2*sum(monsters,g=>Math.abs(g.cr-mean)*g.count)/total;
            relevant=sum(monsters,g=>g.cr>=cutoff?g.count:0);
        }
        mult=table.multipliers[Math.min(table.multipliers.length-1,Math.max(0,relevant-1))];
        if(count<3)mult+=mult>=3?1:.5;else if(count>5)mult-=mult===4?1:.5;
    }
    const adjusted=base*mult,all=[...tiers,last];
    const tier=!count?"unknown":classic?(all.findLast(t=>adjusted>=budget[t])||"trivial"):(all.find((t,i)=>budget[t]!==budget[all[i+1]] && adjusted<=budget[t])||last);
    return {count,budget,xpNext,daily,turns,base,mult,adjusted,relevant,tier,standardXp};
}
