
import {btn,dialog,el,input} from "./screen-ui.js";
import {storage} from "./encounter-store.js";

const temperatures=["冰冷","寒冷","适宜","炎热","炽热"];
const conditions=["晴","多云","雾","小雨","大雨","雷暴","冰雹","雪"];
const speeds=["无风","微风","和风","强风","疾风","大风","烈风","暴风","飓风"];
const intervals={
    mph:["<1","1-7","8-18","19-31","32-38","39-46","47-54","55-72","≥73"],
    kmph:["<2","2-11","12-28","29-49","50-61","62-74","75-88","89-117","≥118"]
};
const icons={
    temperature:["\uf768","\uf2ca","\uf2c9","\uf2c8","\uf76a"],
    precipitation:["\uf185","\uf746","\uf74e","\uf738","\uf740","\uf76c","\uf739","\uf742"]
};
const filters={allowedTemperatures:temperatures,allowedPrecipitations:conditions,allowedWindSpeeds:speeds};
const defaults={...filters,prevailingWindDirection:0};
const preferencesKey="TimeTracker_RandomWeatherModal_dmscreen.html";

export const defaultWeather={temperature:"适宜",precipitation:"晴",windDirection:0,windSpeed:"无风"};
const bearing=value=>((Number(value)||0)%360+360)%360;
function randomInt(max,min=1){
    const size=max-min+1,ceil=4294967296-4294967296%size,arr=new Uint32Array(1);
    do {crypto.getRandomValues(arr);} while(arr[0]>=ceil);
    return arr[0]%size+min;
}
export function randomWeather(current,options,roll=randomInt){
    const changeTemp=roll(3)>1,changeRain=roll(5)>1,directionRoll=roll(5);
    let direction=directionRoll===1?current.windDirection:directionRoll<=3?options.prevailingWindDirection:roll(360)-1;
    direction+=roll(20,0)*(roll(2)===2?1:-1);
    const windRoll=roll(7),offset=windRoll<=3?-windRoll:windRoll-4;
    const target=speeds.indexOf(current.windSpeed)+offset;
    const allowed=options.allowedWindSpeeds;
    let windSpeed=current.windSpeed;
    if(offset<0)windSpeed=[speeds[target],speeds[target-1]].find(value=>allowed.includes(value)) || speeds.find(value=>allowed.includes(value));
    if(offset>0)windSpeed=speeds.slice(Math.max(0,target)).find(value=>allowed.includes(value)) || speeds.findLast(value=>allowed.includes(value));
    return {temperature:changeTemp?options.allowedTemperatures[roll(options.allowedTemperatures.length)-1]:current.temperature,
        precipitation:changeRain?options.allowedPrecipitations[roll(options.allowedPrecipitations.length)-1]:current.precipitation,
        windDirection:direction,windSpeed};
}
async function preferences(){
    const saved=(await (await storage()).getItem(preferencesKey))?.state || {};
    return {
        ...Object.fromEntries(Object.entries(filters).map(([key,list])=>{
            const available=Array.isArray(saved[key])?saved[key].filter(value=>list.includes(value)):[];
            return [key,available.length?available:[...list]];
        })),
        prevailingWindDirection:bearing(saved.prevailingWindDirection)
    };
}
function iconButton(label,code,action,value=label){
    const b=btn(label,action);b.title=value;
    b.replaceChildren(el("span","weather-icon",code));return b;
}
function modalChoice(title,list,current,make,update,parent){
    const {d,body}=dialog(title);
    if(parent)parent(d);
    body.classList.add("weather-options");
    body.append(...list.map((value,index)=>{
        const b=make(value,index,()=>{update(value);d.close();});
        b.setAttribute("aria-pressed",String(value===current));
        return b;
    }));
}
export function makeWeather(weather,units,isNight,update,attachModal){
    const root=el("aside","clock-weather");
    const formatSpeed=index=>(intervals[units] || intervals.mph)[index]+" "+(units==="kmph"?"km/h":"mph");
    function draw(){
        function apply(next){Object.assign(weather,next);update();draw();}
        const set=(key,value)=>apply({[key]:value});
        const heading=el("div","weather-label", "天气");
        heading.append(iconButton("随机生成天气 (按住SHIFT重新使用之前的设置)","\uf522",async event=>{
            const opts=await preferences(),persist=async()=>{
                await (await storage()).setItem(preferencesKey,{state:opts});apply(randomWeather(weather,opts));
            };
            if(event.shiftKey){await persist();return;}
            const {d,body}=dialog("随机天气生成器");attachModal(d);
            d.classList.add("weather-random-dialog");
            function allowedChoices(title,key,symbols){
                const list=el("div","weather-option-list");
                filters[key].forEach((value,index)=>{
                    const choice=btn(value,()=>{
                        opts[key]=opts[key].includes(value)?opts[key].filter(item=>item!==value):[...opts[key],value];
                        choice.setAttribute("aria-pressed",String(opts[key].includes(value)));
                    });
                    if(key==="allowedTemperatures")choice.dataset.temperature=String(index);
                    choice.setAttribute("aria-pressed",String(opts[key].includes(value)));
                    const icon=symbols?el("span","weather-icon",symbols[index]):el("small","weather-speed",formatSpeed(index));
                    choice.replaceChildren(icon,el("span","",value));list.append(choice);
                });
                body.append(el("h5","",title),list);
            }
            allowedChoices("可选的温度","allowedTemperatures",icons.temperature);
            allowedChoices("可选的天气","allowedPrecipitations",icons.precipitation);
            const wind=el("div","weather-heading"),direction=iconButton("主导风向","\uf062",()=>{
                windBearing(opts.prevailingWindDirection,value=>{
                    opts.prevailingWindDirection=value;direction.firstChild.style.transform="rotate("+value+"deg)";
                });
            });
            direction.firstChild.style.transform="rotate("+opts.prevailingWindDirection+"deg)";
            wind.append(el("h5","","主导风向"),direction);body.append(wind);
            allowedChoices("可选的风速","allowedWindSpeeds");
            const footer=el("div","weather-submit");
            footer.append(btn("确认并随机生成天气",async()=>{
                if(Object.keys(filters).some(key=>!opts[key].length))throw Error("Please select allowed values for all sections!");
                await persist();d.close();
            }));
            body.append(footer);
        }));
        const precipitationIcons=[...icons.precipitation];
        if(isNight())precipitationIcons.splice(0,2,"\uf186","\uf745");
        const br=el("div","weather-icons");
        for(const [key,label,values,symbols] of [["temperature","温度",temperatures,icons.temperature],["precipitation","天气",conditions,precipitationIcons]]){
            br.append(iconButton(label,symbols[Math.max(0,values.indexOf(weather[key]))],()=>modalChoice(label,values,weather[key],(value,i,change)=>{
                const b=iconButton(value,symbols[i],change);b.append(" "+value);return b;
            },value=>set(key,value),attachModal),weather[key]));
        }
        function windBearing(initial,change){
            const {d,body}=dialog("风向");attachModal(d);
            const degrees=input("风向角度",initial,()=>{});degrees.type="number";
            body.append(degrees,btn("确定",()=>{change(bearing(degrees.value));d.close();},"","blue"));
        }
        const direction=iconButton("风向",weather.windSpeed===speeds[0]?"\uf141":"\uf062",()=>windBearing(weather.windDirection,value=>set("windDirection",value)));
        if(weather.windSpeed!==speeds[0])direction.firstChild.style.transform="rotate("+weather.windDirection+"deg)";
        const speed=btn("风速",()=>modalChoice("风速",speeds,weather.windSpeed,(value,index,change)=>btn(value+" "+formatSpeed(index),change),
            value=>set("windSpeed",value),attachModal));
        speed.textContent=weather.windSpeed;speed.title=formatSpeed(Math.max(0,speeds.indexOf(weather.windSpeed)));
        root.replaceChildren(heading,br,el("div","weather-label","风向/风速"),direction,speed);
    }
    draw();return {root,draw};
}
