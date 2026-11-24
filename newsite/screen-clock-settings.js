
import {btn,el,input} from "./screen-ui.js";
import {calendarEntry,clockDefaults,collections} from "./screen-calendar.js";

const controls=[
    ["Clock","Clock",[["hoursPerDay","Hours per Day"],["minutesPerHour","Minutes per Hour"],["secondsPerMinute","Seconds per Minute"]]],
    ["Calendar","Calendar",[["hasCalendarLabelsColumns","Show Calendar Column Labels","check"],["hasCalendarLabelsRows","Show Calendar Row Labels","check"]]],
    ["Game Mechanics","Mechanics",[["hoursPerLongRest","Hours per Long rest"],["minutesPerShortRest","Minutes per Short Rest"],["secondsPerRound","Seconds per Round"]]],
    ["Offsets","Offsets",[["offsetYears","Year Offset",-9999],["offsetMonthStartDay","Year Start Weekday Offset",0]]]
];
export function editNumber(label,value,change,min=1,offset=0){
    const field=input(label,value+offset,raw=>{
        const n=Number(raw.trim());
        const next=Number.isFinite(n) ? Math.max(min,Math.min(9999,Math.trunc(n))) : value+offset;
        field.value=next;
        value=next-offset;change(value);
    });
    field.inputMode="numeric";
    return field;
}
export function checkbox(label,checked,change){
    const box=el("input");box.type="checkbox";box.checked=!!checked;box.setAttribute("aria-label",label);
    box.onchange=()=>change(box.checked);return box;
}
export function clockSettings(s,changed){
    const wrap=el("div","clock-settings");
    function section(title,code,body,reset){
        const hidden="is"+code+"SectionHidden",header=el("header","clock-settings-header");
        const toggle=btn("Hide Section",()=>{s[hidden]=!s[hidden];show();changed();},"\ue106");
        const resetBtn=reset && btn("Reset Section",()=>{if(confirm("你确定吗？"))reset();});
        function show(){
            body.hidden=!!s[hidden];
            toggle.setAttribute("aria-pressed",String(!!s[hidden]));
            if(resetBtn)resetBtn.hidden=body.hidden;
        }
        header.append(el("b","",title));if(resetBtn)header.append(resetBtn);
        header.append(toggle);wrap.append(header,body,el("hr"));show();
    }
    for(const [title,code,rows] of controls){
        const body=el("div","clock-setting-fields"),sync=[];
        body.dataset.section=code;
        for(const [key,label,min] of rows){
            const line=el("label","clock-settings-field");
            line.append(el("span","clock-setting-label",label));
            const change=value=>{s[key]=value;changed();};
            const field=min==="check"?checkbox(label,s[key],change):editNumber(label,s[key],change,min);
            sync.push(()=>{if(min==="check")field.checked=s[key];else field.value=s[key];});
            line.append(field);body.append(line);
        }
        section(title,code,body,()=>{for(const [key] of rows)s[key]=clockDefaults[key];sync.forEach(fn=>fn());changed();});
    }
    const units=el("label","clock-settings-field","Wind Speed Units"),select=el("select");
    select.append(new Option("Miles per Hour","mph"),new Option("Kilometres per Hour","kmph"));
    select.value=s.unitsWindSpeed;select.onchange=()=>{s.unitsWindSpeed=select.value;changed();};
    units.append(select);wrap.append(units,el("hr"));
    for(const [key,spec] of Object.entries(collections)){
        const body=el("div","clock-setting-collection"),rows=el("div","clock-setting-rows");
        const header=el("div","clock-setting-row"),add=btn("Add "+spec.name,()=>{s[key].push(calendarEntry(key,s[key].length));render();changed();},"+","blue");
        const labels=spec.fields.map(([,label,type],i)=>el("span",i===0?"clock-setting-name":type==="color"?"clock-setting-color":"clock-setting-short",label));
        header.append(...labels,add);body.append(header,rows);
        const reorder=key==="days" || key==="months";
        let grabbed;
        function move(from,to){
            if(from===to || to<0 || to>=s[key].length)return;
            const [row]=s[key].splice(from,1);s[key].splice(to,0,row);render();changed();
        }
        function render(){
            rows.replaceChildren();
            if(!s[key].length){rows.append(el("i","clock-settings-empty",spec.empty));return;}
            s[key].forEach(({data},i)=>{
                const line=el("div","clock-setting-row");
                for(const [j,[field,label,type,offset]] of spec.fields.entries()){
                    const desc=label || "Color";
                    const change=value=>{data[field]=value;changed();};
                    const control=typeof type==="number"?editNumber(desc,data[field],change,type,offset):input(desc,data[field],change);
                    if(type==="color")control.type="color";
                    control.className=j===0?"clock-setting-name":type==="color"?"clock-setting-color":"clock-setting-short";
                    line.append(control);
                }
                if(reorder){
                    const grip=btn("Drag to reorder",()=>{},"","clock-setting-grip");grip.textContent="⠿";grip.draggable=true;
                    grip.ondragstart=e=>{grabbed=i;e.dataTransfer.setData("text/plain",String(i));e.dataTransfer.effectAllowed="move";};
                    grip.ondragend=()=>{grabbed=undefined;};
                    grip.onkeydown=e=>{
                        if(e.key==="ArrowUp" || e.key==="ArrowDown"){e.preventDefault();move(i,i+(e.key==="ArrowUp"?-1:1));}
                    };
                    line.ondragover=e=>{if(grabbed!==undefined)e.preventDefault();};
                    line.ondrop=e=>{if(grabbed!==undefined){e.preventDefault();move(grabbed,i);}};
                    line.append(grip);
                }
                const del=btn("Delete "+spec.name,()=>{s[key].splice(i,1);render();changed();},"\ue020","red");
                del.style.visibility=reorder && s[key].length===1?"hidden":"";
                line.append(del);rows.append(line);
            });
        }
        render();section(spec.title,key[0].toUpperCase()+key.slice(1),body);
    }
    return wrap;
}
