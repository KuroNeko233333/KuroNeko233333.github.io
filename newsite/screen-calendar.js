
const chineseNumbers = ["一","二","三","四","五","六","七","八","九","十","十一","十二"];

export const phases = ["新月","蛾眉月","上弦月","盈凸月","满月","亏凸月","下弦月","残月"];
export const collections = {
    days:{title:"Days",name:"Day",fields:[["name","名称"]],make:i=>({name:"周"+(chineseNumbers[i] || i+1)})},
    months:{title:"Months",name:"Month",fields:[["name","名称"],["days","Days",1]],make:i=>({name:(chineseNumbers[i] || i+1)+"月",days:30})},
    seasons:{title:"Seasons",name:"Season",fields:[["name","名称"],["sunriseHour","Sunrise",0],["sunsetHour","Sunset",0],["startDay","Start",1,1],["endDay","End",1,1]],
        make:i=>({name:"第"+(i+1)+"季",startDay:i*90,endDay:(i+1)*90-1,sunriseHour:6,sunsetHour:22}),empty:"(No seasons)"},
    years:{title:"Named Years",name:"Year",fields:[["name","名称"],["year","Year",-9999,1]],
        make:i=>({name:"Year of the "+(chineseNumbers[i] || i+1)+"s",year:i}),empty:"(No named years)"},
    eras:{title:"Eras",name:"Era",fields:[["name","名称"],["abbreviation","Abbv."],["startYear","Start",-9999,1],["endYear","End",-9999,1]],
        make:i=>({name:(i+1)+" Era",abbreviation:"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i%26]+"E",startYear:i,endYear:i}),empty:"(No eras)"},
    moons:{title:"Moons",name:"Moon",fields:[["name","Moon"],["color","","color"],["phaseOffset","Offset",1,1],["period","Period",1]],
        make:i=>({name:(i+1)+"月",color:"#ffffff",phaseOffset:0,period:24}),empty:"(No moons)"}
};
const presetCounts = {days:7,months:12,seasons:4,moons:1};
export function calendarEntry(key,index){
    return {id:crypto.randomUUID(),data:collections[key].make(index)};
}
export function defaultCollection(key){
    return Array.from({length:presetCounts[key] || 0},(_,index)=>calendarEntry(key,index));
}
export const clockDefaults = {
    time:0,browseTime:null,isBrowseMode:false,hoursPerDay:24,minutesPerHour:60,secondsPerMinute:60,
    hoursPerLongRest:8,minutesPerShortRest:60,secondsPerRound:6,offsetYears:0,offsetMonthStartDay:0,
    tab:0,isPaused:false,isAutoPaused:false,hasCalendarLabelsColumns:true,hasCalendarLabelsRows:false,unitsWindSpeed:"mph"
};

export function normalizeClock(doc){
    const state=doc.state ||= {};
    for(const [k,value] of Object.entries(clockDefaults))if(!(k in state))state[k]=value;
    for(const key of Object.keys(collections)){
        const existing=state[key];
        if(existing && !Array.isArray(existing))state[key]=Object.entries(existing).map(([key,item])=>{
            const {id=key,data,...fields}=item;
            return {id,data:data || fields};
        });
        else state[key]??=defaultCollection(key);
        if((key==="days" || key==="months") && !state[key].length)state[key]=defaultCollection(key);
    }
    state.events??={};state.encounters??={};
    state.isAutoPaused=false;
    doc.compClockState??={state:{}};doc.compCalendarState??={state:{}};doc.compSettingsState??={state:{}};
    return state;
}

const mod = (value,size) => (value % size + size) % size;

export function dateAt(s,time){
    const hourSecs=s.minutesPerHour*s.secondsPerMinute,daySecs=s.hoursPerDay*hourSecs;
    const seconds=Math.max(0,Math.round(time/1000)),n=Math.floor(seconds/daySecs),timeOfDay=seconds%daySecs;
    const yearDays=s.months.reduce((sum,month)=>sum+month.data.days,0);
    const year=Math.floor(n/yearDays)+s.offsetYears,day=n%yearDays;
    let index=0,date=day;
    while(index<s.months.length-1 && date>=s.months[index].data.days)date-=s.months[index++].data.days;
    const weekday=s.days[mod(n+s.offsetMonthStartDay,s.days.length)].data.name;
    const seasons=s.seasons.map(row=>row.data).filter(row=>day>=row.startDay && day<=row.endDay).sort((a,b)=>a.startDay-b.startDay);
    return {year,day,n,index,date,daySecs,hourSecs,yearDays,weekday,seasons,timeOfDay,
        weekdayStart:mod(n-date+s.offsetMonthStartDay,s.days.length),month:s.months[index].data,
        hour:Math.floor(timeOfDay/hourSecs),minute:Math.floor(timeOfDay/s.secondsPerMinute)%s.minutesPerHour,second:timeOfDay%s.secondsPerMinute};
}

export function timeForDate(s,current,year,index,day){
    const priorMonths=s.months.slice(0,index).reduce((sum,m)=>sum+m.data.days,0);
    return (((year-s.offsetYears)*current.yearDays+priorMonths+day)*current.daySecs+current.timeOfDay)*1000;
}
export function moveMonth(s,current,delta){
    const count=s.months.length,index=mod(current.index+delta,count),year=current.year+Math.floor((current.index+delta)/count);
    return timeForDate(s,current,year,index,Math.min(current.date,s.months[index].data.days-1));
}
export function dateText(d){
    const season=d.seasons.map(item=>item.name || "[Nameless season]").join("/");
    return (d.weekday || "[Nameless day]")+" "+(d.date+1)+" "+(d.month.name || "[Nameless month]")+(season?" ("+season+")":"");
}
export function yearText(s,d,short){
    const years=s.years.map(x=>x.data).filter(x=>x.year===d.year).map(x=>x.name);
    const eras=s.eras.map(x=>x.data).filter(x=>x.startYear<=d.year && d.year<=x.endYear).sort((a,b)=>a.startYear-b.startYear)
        .map(x=>(d.year-x.startYear+1)+" "+(short?x.abbreviation:x.name+" ("+x.abbreviation+")"));
    return "第"+(d.year+1)+"年"+(years.length?" ("+years.join("/")+")":"")+(eras.length?", "+eras.join("/"):"");
}
export function moonsOn(s,day){
    return s.moons.map(x=>x.data).sort((a,b)=>a.phaseOffset-b.phaseOffset || a.name.localeCompare(b.name)).map(moon=>{
        const period=Math.max(1,moon.period);
        const dayOfPeriod=mod(day-moon.phaseOffset,period);
        const phase=Math.floor(dayOfPeriod*8/period);
        return {...moon,dayOfPeriod,phase,first:Math.floor((dayOfPeriod-1)*8/period)===phase-1};
    });
}
export function onDate(values,year,day){
    return Object.values(values).filter(x=>!x.isDeleted && x.when?.year===year && x.when.day===day)
        .sort((a,b)=>Number(Boolean(a.hasTime))-Number(Boolean(b.hasTime))
            || (a.hasTime?(a.timeOfDaySecs || 0)-(b.timeOfDaySecs || 0):0) || (a.pos || 0)-(b.pos || 0));
}
export function clampCalendarEntries(s){
    const {yearDays,daySecs}=dateAt(s,s.time);
    for(const record of [...Object.values(s.events),...Object.values(s.encounters)]){
        if(record.when?.day>=yearDays)record.when.day=yearDays-1;
        if(record.timeOfDaySecs>=daySecs)record.timeOfDaySecs=daySecs-1;
    }
}
