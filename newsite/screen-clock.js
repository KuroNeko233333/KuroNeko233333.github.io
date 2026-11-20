
import {el,input,btn,dialog,fileInput,notice} from "./screen-ui.js";
import {normalizeClock,dateAt,timeForDate,moveMonth,dateText,yearText,moonsOn,phases,onDate,clampCalendarEntries} from "./screen-calendar.js";
import {clockSettings,editNumber,checkbox} from "./screen-clock-settings.js";
import {defaultWeather,makeWeather} from "./screen-weather.js";
import {readSlot,namedSaves} from "./encounter-store.js";

let moonSprite;
function moonIcon(moon){
    const icon=el("canvas","clock-moon");icon.width=32;icon.height=32;icon.title=moon.name+"—"+phases[moon.phase];
    const context=icon.getContext("2d");
    function draw(sprite){
        context.clearRect(0,0,32,32);
        if(sprite)context.drawImage(sprite,moon.phase*32,0,32,32,0,0,32,32);
        context.globalCompositeOperation="multiply";context.fillStyle=moon.color;context.fillRect(0,0,32,32);
        context.globalCompositeOperation="source-over";context.beginPath();context.arc(16,16,16,0,Math.PI*2);
        context.lineWidth=6;context.stroke();
    }
    draw(null);
    moonSprite??=new Promise(resolve=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);
        image.src=new URL("./screen-moon.webp",import.meta.url);
    });
    moonSprite.then(image=>{if(image && icon.isConnected)draw(image);});
    return icon;
}
function lunarStrip(s,day){
    const row=el("div","clock-moons");
    for(const moon of moonsOn(s,day)){
        const item=el("div","clock-moon-info"),detail=el("div","clock-moon-description");
        detail.append(el("div","",moon.name),el("i","",phases[moon.phase])," ",el("small","","(Day "+(moon.dayOfPeriod+1)+"/"+moon.period+")"));
        item.tabIndex=0;
        item.append(moonIcon(moon),detail);row.append(item);
    }
    return row;
}
function packEntries(entries){
    return (entries || []).map(item=>typeof item==="object"?JSON.stringify(item,null,2).split("\n").map(line=>"  "+line).join("\n"):String(item)).join("\n");
}
function unpackEntries(text){
    const lines=text.trimEnd().split("\n"),result=[];
    let i=0;
    while(i<lines.length){
        const line=lines[i++];
        if(!line.trim())continue;
        if(/^\s+[[{]/.test(line)){
            let json=line;
            while(true){
                try{result.push(JSON.parse(json));break;}catch{}
                if(i===lines.length || !/^\s/.test(lines[i]))throw Error("事件正文的 JSON 格式无效");
                json+="\n"+lines[i++];
            }
        }else result.push(line.trim());
    }
    return result;
}
function asBoardEncounter(raw){
    const source=Array.isArray(raw?.items)?raw:raw?.l ?? raw;
    if(!Array.isArray(source?.items) && !source?.saveId)throw Error("无效的遭遇文件");
    return source;
}
async function materializeEncounter(raw){
    if(!raw.managerClient_isReferencable || raw.managerClient_isLoadAsCopy || !raw.saveId)return raw;
    const saved=(await namedSaves()).state.saves.find(row=>row.entity.saveId===raw.saveId)?.entity;
    if(!saved)throw Error("Could not find encounter data! Has the encounter been deleted?");
    return saved;
}
function exportEncounter(raw,name){
    const a=el("a"),url=URL.createObjectURL(new Blob([JSON.stringify(raw,null,2)],{type:"application/json"}));
    a.href=url;a.download=(name || "encounter")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function mountClock(root,doc,save,signal,clockKey,loadEncounter){
    if(signal.aborted)return;
    const s=normalizeClock(doc),weather=(doc.compClockState.compWeatherState??={state:{...defaultWeather}}).state;
    root.classList.add("screen-clock");
    const tabs=el("nav","clock-tabs"),face=el("div","clock-face");root.append(tabs,face);
    const visibleTime=()=>s.isBrowseMode && s.browseTime!=null?s.browseTime:s.time;
    let timer,last,ownClock,lease,update=()=>{};
    const openDialogs=new Set();
    function attachModal(d){
        openDialogs.add(d);d.addEventListener("close",()=>openDialogs.delete(d),{once:true});
    }
    function modal(title,style){
        const result=dialog(title);if(style)result.d.classList.add(style);
        attachModal(result.d);return result;
    }

    function tick(){
        const now=Date.now();s.time+=Math.max(0,now-last);last=now;update();save();
    }
    function stop(){clearInterval(timer);ownClock=false;lease?.abort();}
    function schedule(){
        stop();
        if(s.isPaused || s.isAutoPaused || signal.aborted)return;
        const ctl=lease=new AbortController();
        const run=()=>{
            if(ctl.signal.aborted)return;
            ownClock=true;last=Date.now();timer=setInterval(tick,1000);
            return new Promise(done=>ctl.signal.addEventListener("abort",done,{once:true}));
        };
        if(navigator.locks)navigator.locks.request("dm-clock:"+clockKey,{signal:ctl.signal},run).catch(e=>{if(e.name!=="AbortError")notice(e.message);});
        else run();
    }
    signal.addEventListener("abort",()=>{stop();for(const d of openDialogs)d.close();},{once:true});
    function setTime(time,browse=false){
        if(browse && s.isBrowseMode)s.browseTime=Math.max(0,time);
        else{s.time=Math.max(0,time);last=Date.now();}
        update();save();
    }
    function digits(value,total){return String(value).padStart(String(total).length,"0");}
    function jump(time){
        s.isBrowseMode=false;s.browseTime=null;setTime(time);
    }
    function dateHead(d,short){
        const head=el("div","clock-date"),year=el("div","clock-year",yearText(s,d,short));
        head.append(el("div","clock-date-text",dateText(d)),year);return head;
    }
    function buttonText(text,title,fn){
        const b=btn(title,fn);b.textContent=text;return b;
    }
    function editEvent(item,done){
        const {d,body}=modal("Edit Event","clock-edit-event");
        const name=input("名称",item.name,()=>{}),entries=el("textarea");
        entries.setAttribute("aria-label","事件正文");entries.value=packEntries(item.entries);
        body.append(name,entries,btn("保存",()=>{
            const next=unpackEntries(entries.value);
            item.name=name.value.trim() || "(Unnamed event)";item.entries=next;
            d.close();done();save();
        }));
    }
    function renderEvent(target,item){
        if(item.isHidden || !item.entries?.length)return;
        import("./screen-data.js").then(async({manifest,object})=>{
            const {prepareMonsterScale}=await import("./monster-runtime.js"),m=await manifest();
            if(!target.isConnected)return;
            const {win}=await prepareMonsterScale(m.monsters.runtime,object);
            const {renderedTable}=await import("./screen-corpus.js");
            if(target.isConnected)target.append(renderedTable("<tr><td>"+win.Renderer.get().render({type:"entries",entries:win.JSON.parse(JSON.stringify(item.entries))})+"</td></tr>"));
        }).catch(e=>notice(e.message));
    }
    const encountersInUse=new Set();
    async function runEncounter(item,updateRecords){
        if(item.countUses>0 || encountersInUse.has(item.id))return;
        encountersInUse.add(item.id);
        try{
            const raw=await materializeEncounter(item.data);
            if(await loadEncounter(raw)){item.countUses=(item.countUses || 0)+1;updateRecords();save();}
        }finally{encountersInUse.delete(item.id);}
    }

    function mountClockFace(){
        const layout=el("div","clock-reading"),main=el("div","clock-center"),side=el("aside","clock-side");
        const dayInfo=el("div","clock-day-counter"),digitsWrap=el("div","clock-digits"),timeHeading=el("div","clock-heading");
        const sunlight=el("div","clock-sunlight"),recordMarks=el("div","clock-record-marks");
        const rest=el("div","clock-rest"),skips=el("div","clock-skips"),dayOps=el("div","clock-day-buttons");
        const skipSun=btn("下一个日出",()=>{
            const d=dateAt(s,s.time),season=d.seasons[0];
            if(season.sunriseHour>s.hoursPerDay)throw Error("无法跳转到下一天—日出时间超过了一天的小时数！");
            const dest=season.sunriseHour*d.hourSecs;
            setTime(s.time+(dest-d.timeOfDay+(d.hour<season.sunriseHour?0:d.daySecs))*1000);
        });
        let lastDay=-1,lastHour=-1,autoPause=false;
        const steps=[
            ["小时","小时","hoursPerDay","hour",()=>s.minutesPerHour*s.secondsPerMinute,[5,12,5]],
            ["分钟","分钟","minutesPerHour","minute",()=>s.secondsPerMinute,[5,15,30]],
            ["秒","秒","secondsPerMinute","second",()=>1,[5,15,30]]
        ];
        const fields=steps.map(([label,unit,key,part,seconds,by],i)=>{
            const stack=el("div","clock-digit-stack"),field=input(label,"",raw=>{
                const n=Number(raw.trim())||0;
                setTime(s.time+(n-dateAt(s,s.time)[part])*seconds()*1000);
            });
            field.className="clock-digit";field.style.width=(20*String(s[key]).length)+"px";
            field.onfocus=()=>{autoPause=true;s.isAutoPaused=true;stop();pause.setAttribute("aria-pressed","true");};
            field.onblur=()=>{if(!autoPause)return;autoPause=false;s.isAutoPaused=false;schedule();update();};
            field.onclick=()=>field.select();
            const controls=[1,-1].map(sign=>buttonText(sign===1?"+":"-", (sign===1?"加":"减")+"一"+unit,e=>{
                const ctrl=e.ctrlKey || e.metaKey;
                const mult=e.shiftKey?(ctrl?by[2]:by[0]):ctrl?by[1]:1;
                setTime(s.time+sign*seconds()*mult*1000);
            }));
            if(i)digitsWrap.append(el("span","clock-separator",":"));
            stack.append(controls[0],field,controls[1]);digitsWrap.append(stack);return field;
        });
        const pause=btn("暂停 / 继续",()=>{
            if(ownClock)tick();
            s.isPaused=!s.isPaused;schedule();update();save();
        },"\ue073","clock-pause");
        digitsWrap.append(pause);
        for(const [label,duration] of [["长休",()=>s.hoursPerLongRest*s.minutesPerHour*s.secondsPerMinute],
            ["短休",()=>s.minutesPerShortRest*s.secondsPerMinute],["回合",()=>s.secondsPerRound]]){
            rest.append(btn(label,e=>setTime(s.time+(e.shiftKey?-1:1)*duration()*1000)));
        }
        skips.append(skipSun,btn("下一天",()=>{
            const d=dateAt(s,s.time);setTime(s.time+(d.daySecs-d.timeOfDay)*1000);
        }));
        for(const sign of [-1,1])dayOps.append(buttonText(sign<0?"-":"+",sign<0?"减一天":"加一天",
            e=>setTime(s.time+sign*(e.shiftKey?5:1)*dateAt(s,s.time).daySecs*1000)));
        const weatherUI=makeWeather(weather,s.unitsWindSpeed,()=>{
            const d=dateAt(s,s.time),season=d.seasons[0];return season && (d.hour<season.sunriseHour || d.hour>=season.sunsetHour);
        },save,attachModal);
        main.append(timeHeading,digitsWrap,sunlight,el("hr"),rest,skips);
        side.append(dayInfo,dayOps,el("hr"),recordMarks,weatherUI.root);
        layout.append(main,el("div","clock-divider"),side);face.append(layout);
        function refreshRecords(d){
            recordMarks.replaceChildren();
            for(const [key,kind] of [["events","event"],["encounters","encounter"]]){
                for(const item of onDate(s[key],d.year,d.day)){
                    const mark=buttonText("*",item.displayName ?? item.name,()=>{
                        if(key==="events")editEvent(item,()=>refreshRecords(dateAt(s,s.time)));
                        else return runEncounter(item,()=>refreshRecords(dateAt(s,s.time)));
                    });
                    mark.className="clock-mark "+kind+(item.countUses?" used":"");recordMarks.append(mark);
                }
            }
            recordMarks.hidden=!recordMarks.childElementCount;
        }
        update=()=>{
            const d=dateAt(s,s.time);
            if(d.n!==lastDay){
                timeHeading.replaceChildren(dateHead(d,true),lunarStrip(s,d.n));
                dayInfo.textContent="第"+(d.n+1)+"天";refreshRecords(d);lastDay=d.n;lastHour=-1;
            }
            if(d.hour!==lastHour){
                const blocks=d.seasons.map(season=>{
                    const isDay=d.hour>=season.sunriseHour && d.hour<season.sunsetHour;
                    const hours=isDay?season.sunsetHour-d.hour:season.sunriseHour-d.hour+(d.hour>=season.sunriseHour?s.hoursPerDay:0);
                    const row=el("span");
                    row.append(el("b","",isDay?"白天":"夜晚")," ",el("small","",hours===1?"(开始不到1小时)":"(距离日"+(isDay?"落":"出")+(hours-1)+"个多小时)"));
                    return row;
                });
                sunlight.replaceChildren(...blocks);sunlight.hidden=!blocks.length;skipSun.hidden=!blocks.length;
                weatherUI.draw();lastHour=d.hour;
            }
            fields.forEach((field,i)=>{const step=steps[i];if(field!==document.activeElement)field.value=digits(d[step[3]],s[step[2]]);});
            pause.setAttribute("aria-pressed",String(s.isPaused || s.isAutoPaused));
        };
        update();
    }

    function dateControls(container,get,change,compact=false){
        const bar=el("div","clock-date-controls");
        function shifts(sign){
            return [["一年","Y",d=>d.yearDays],["一个月","M"],...(compact?[]:[["一周","W",()=>s.days.length],["一天","D",()=>1]])]
                .map(([label,letter,span])=>buttonText(sign===1?letter+"+":"−"+letter,(sign===1?"加":"减")+label,e=>{
                    const d=get(),direction=sign*(e.shiftKey?5:1);
                    change(span?timeForDate(s,d,d.year,d.index,d.date+direction*span(d)):moveMonth(s,d,direction));
                }));
        }
        const values=get();
        const fields=[["Year","year",1],["Month","index",1],["Day","date",1]].map(([label,part,offset])=>editNumber(label,values[part],value=>{
            const d=get();
            if(part==="year")change(timeForDate(s,d,value,d.index,d.date));
            else if(part==="index")change(moveMonth(s,d,Math.min(s.months.length-1,value)-d.index));
            else change(timeForDate(s,d,d.year,d.index,Math.min(d.month.days-1,value)));
        },part==="year"?-9999:1,offset));
        const date=el("div","clock-date-inputs");
        date.append(fields[0],el("span","clock-date-slash","/"),fields[1],el("span","clock-date-slash","/"),fields[2]);
        const left=el("div","clock-date-adjust tool-group"),right=el("div","clock-date-adjust tool-group");
        left.append(...shifts(-1));right.append(...shifts(1).reverse());
        bar.append(left,date,right);container.append(bar);
        return ()=>{const d=get();fields[0].value=d.year+1;fields[1].value=d.index+1;fields[2].value=d.date+1;};
    }

    function calendarGrid(d,click,hideCurrent=false){
        const grid=el("div","clock-month"),labels=s.hasCalendarLabelsColumns,weekLabels=s.hasCalendarLabelsRows;
        const perWeek=s.days.length,offset=weekLabels?1:0,start=d.weekdayStart;
        grid.style.gridTemplateColumns=(weekLabels?"auto ":"")+"repeat("+perWeek+", minmax(24px,1fr))";
        function place(node,x,y){node.style.gridColumn=x+1;node.style.gridRow=y+1;grid.append(node);}
        if(labels)s.days.forEach(({data},i)=>{
            const col=el("span","clock-calendar-label",data.name.slice(0,2));col.title=data.name;place(col,i+offset,0);
        });
        const rows=Math.ceil((start+d.month.days)/perWeek),firstDay=d.day-d.date;
        for(let row=0;row<rows;row++){
            if(weekLabels){const week=Math.floor(firstDay/perWeek)+row;const lbl=el("span","clock-calendar-label",String(week));lbl.title="Week "+week;place(lbl,0,row+Number(labels));}
            for(let col=0;col<perWeek;col++){
                const day=row*perWeek+col-start;
                if(day<0 || day>=d.month.days){place(el("span","clock-day-spacer"),col+offset,row+Number(labels));continue;}
                const targetTime=timeForDate(s,d,d.year,d.index,day),info=dateAt(s,targetTime);
                const tile=btn(String(day+1),e=>click(e,info,targetTime),"","clock-day");
                if(!hideCurrent && d.date===day)tile.setAttribute("aria-current","date");
                const items=el("span","clock-calendar-moons"),moons=moonsOn(s,info.n).filter(m=>m.first);
                if(moons.length){items.append(...moons.slice(0,moons.length>2?1:2).map(moonIcon));if(moons.length>2)items.append(el("span","","+"));tile.append(items);}
                if(onDate(s.events,d.year,info.day).length)tile.append(el("span","clock-mark event","*"));
                if(onDate(s.encounters,d.year,info.day).length)tile.append(el("span","clock-mark encounter","*"));
                place(tile,col+offset,row+Number(labels));
            }
        }
        return grid;
    }
    function mountCalendar(){
        const layout=el("div","clock-calendar"),top=el("div","clock-calendar-header"),grid=el("div","clock-calendar-body");
        const current=()=>dateAt(s,visibleTime());
        const activeDate=el("div"),browse=btn("浏览模式",()=>{s.isBrowseMode=!s.isBrowseMode;s.browseTime=s.isBrowseMode?s.time:null;lastDay=undefined;update();save();});
        let lastDay;
        top.append(activeDate,browse);layout.append(top);
        const showInputs=dateControls(layout,current,time=>setTime(time,true));layout.append(el("hr"),grid);face.append(layout);
        update=()=>{
            const d=current();if(d.n===lastDay)return;
            lastDay=d.n;
            activeDate.replaceChildren(dateHead(d,false));browse.setAttribute("aria-pressed",String(s.isBrowseMode));showInputs();
            grid.replaceChildren(calendarGrid(d,(evt,info,time)=>evt.shiftKey?jump(time):openDay(info,()=>{lastDay=undefined;update();})));
        };
        update();
    }
    function chooseDay(item,done){
        const {d,body}=modal(item.data?"Choose Encounter Day":"Choose Event Day","clock-pick-day");
        const tz=dateAt(s,s.time),start=(((item.when.year-s.offsetYears)*tz.yearDays+item.when.day)*tz.daySecs+tz.timeOfDay)*1000;
        let time=Math.max(0,start);const current=()=>dateAt(s,time);
        const header=el("div"),grid=el("div");body.append(header);
        const sync=dateControls(body,current,next=>{time=Math.max(0,next);draw();},true);
        body.append(grid);
        function draw(){
            const date=current();header.replaceChildren(dateHead(date,false));sync();
            grid.replaceChildren(calendarGrid(date,(_evt,day)=>{item.when={year:day.year,day:day.day};d.close();done();save();},true));
        }
        draw();
    }
    function openDay(date,changed=()=>{}){
        const {d,body}=modal(dateText(date),"clock-day-dialog");
        d.querySelector("header").append(btn("Go to Day",()=>{jump(timeForDate(s,date,date.year,date.index,date.date));d.close();}));
        const lists=el("div","clock-day-lists");body.append(lunarStrip(s,date.n),el("hr"),lists);
        function render(){changed();lists.replaceChildren(group("events","Events","Event"),el("hr"),group("encounters","Encounters","Encounter"));}
        function refresh(){render();save();}
        function timeFields(item,done){
            const wrap=el("label","clock-event-time"),noon=Math.floor(date.daySecs/2);
            wrap.append("Has Time? ",checkbox("Has Time?",item.hasTime,hasTime=>{
                item.hasTime=hasTime;if(hasTime)item.timeOfDaySecs??=noon;done();
            }));
            if(item.hasTime){
                const units=[["Hours",date.hourSecs,s.hoursPerDay],["Minutes",s.secondsPerMinute,s.minutesPerHour],["Seconds",1,s.secondsPerMinute]];
                units.forEach(([label,factor,max],i)=>{
                    if(i)wrap.append(":");
                    const old=Math.floor(item.timeOfDaySecs/factor)%max;
                    wrap.append(editNumber(label,old,next=>{
                        const prior=Math.floor(item.timeOfDaySecs/factor)%max;
                        item.timeOfDaySecs=Math.max(0,Math.min(date.daySecs-1,item.timeOfDaySecs+(Math.min(max-1,next)-prior)*factor));save();
                    },0));
                });
            }
            return wrap;
        }
        function group(key,title,singular){
            const area=el("section","clock-event-group"),header=el("header"),external=key==="encounters";
            function add(time){
                const id=crypto.randomUUID(),value={id,name:singular,pos:Object.keys(s[key]).length,when:{year:date.year,day:date.day},isDeleted:false,
                    ...(time==null?{}:{hasTime:true,timeOfDaySecs:time})};
                if(external){
                    const source=modal("Add Encounter");
                    const accept=raw=>{
                        value.data=asBoardEncounter(raw);value.name=value.data.name || "Encounter";value.countUses=0;
                        s[key][id]=value;source.d.close();refresh();
                    };
                    source.body.append(btn("当前遭遇",async()=>accept(await readSlot("sublist"))),fileInput("导入遭遇文件",accept));
                    namedSaves().then(list=>{
                        for(const {entity} of list.state.saves.filter(row=>row.entity.manager_isSaved))source.body.append(btn(entity.name,()=>accept(entity)));
                    }).catch(e=>notice(e.message));
                }else{
                    value.entries=[];value.isHidden=false;s[key][id]=value;refresh();editEvent(value,refresh);
                }
            }
            const actionColor=external?"green":"blue";
            const addButton=btn("Add "+singular,()=>add(null),"+",actionColor);
            addButton.append(" Add "+singular);
            header.append(el("span","",title),addButton,btn("At Time...",evt=>{
                const now=dateAt(s,s.time).timeOfDay;
                if(evt.shiftKey){add(now);return;}
                const prompt=modal("Time of Day"),zero=el("div","clock-event-time");
                const h=input("Hours",date.hour,()=>{}),m=input("Minutes",date.minute,()=>{}),seconds=input("Seconds",date.second,()=>{});
                zero.append(h,":",m,":",seconds);prompt.body.append(zero,btn("确定",()=>{
                    const time=(Number(h.value)||0)*date.hourSecs+(Number(m.value)||0)*s.secondsPerMinute+(Number(seconds.value)||0);
                    prompt.d.close();add(Math.max(0,Math.min(date.daySecs-1,time)));
                }));
            },"",actionColor));
            area.append(header);
            const all=onDate(s[key],date.year,date.day);
            if(!all.length)area.append(el("i","clock-settings-empty","(No "+title.toLowerCase()+")"));
            for(const item of all){
                const block=el("div","clock-event"),row=el("div","clock-event-row");
                const field=input("名称",item.displayName??item.name,v=>{if(external)item.displayName=v.trim();else item.name=v.trim() || "(Unnamed event)";save();});
                row.append(field);
                if(external){
                    if(item.data){
                        const run=btn("Run Encounter",()=>runEncounter(item,render),"\ue072"),reset=btn("Reset Usage",()=>{
                            item.countUses=0;refresh();
                        },"\ue031");
                        run.disabled=item.countUses>0;reset.disabled=!item.countUses;
                        row.append(run,reset,btn("Download Encounter File",async()=>{
                            exportEncounter(await materializeEncounter(item.data),item.displayName??item.name);
                        },"\ue026"));
                    }
                }else{
                    const hidden=btn("Hide Event",()=>{item.isHidden=!item.isHidden;refresh();},"\ue106");hidden.setAttribute("aria-pressed",String(!!item.isHidden));
                    row.append(hidden,btn("Edit Event",()=>editEvent(item,refresh),"\u270f"));
                }
                row.append(timeFields(item,refresh),btn("Move "+singular,()=>chooseDay(item,refresh),"\ue068"),
                    btn("Delete "+singular,()=>{delete s[key][item.id];refresh();},"\ue020","red"));
                block.append(row);if(!external)renderEvent(block,item);area.append(block);
            }
            return area;
        }
        render();
    }
    const tabButtons=[["时钟","\ue023"],["日历","\ue109"],["设置","\ue019"]].map(([label,icon],index)=>btn(label,()=>{
        if(s.tab===index)return;
        s.tab=index;draw();save();
    },icon));
    tabs.append(...tabButtons,btn("重置时钟/日历时间为第一天",()=>{if(confirm("你确定吗？"))jump(0); },"\ue031","red"));
    function draw(){
        update=()=>{};face.replaceChildren();face.dataset.tab=s.tab;
        tabButtons.forEach((button,index)=>button.setAttribute("aria-pressed",String(s.tab===index)));
        if(s.tab===0)mountClockFace();
        else if(s.tab===1)mountCalendar();
        else face.append(clockSettings(s,()=>{clampCalendarEntries(s);save();}));
    }
    face.addEventListener("clock-sync",()=>update(),{signal});
    clampCalendarEntries(s);draw();schedule();
}
