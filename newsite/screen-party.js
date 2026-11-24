import {el,btn,input,dialog} from "./screen-ui.js";
import {newRow} from "./initiative-state.js";

export function defaultParty(state,save){
    const {body}=dialog("默认队伍"),rows=el("div","party-editor");
    function render(){
        rows.replaceChildren(...state.rdp.map(row=>{
            const line=el("div","party-edit-row");
            line.append(input("名称",row.n,v=>{row.n=v;save();}));
            for(const [key,title] of [["h","当前生命值"],["g","最大生命值"],["i","先攻值"]]){
                const field=input(title,row[key],v=>{row[key]=v===""?null:Number(v);save();});
                field.type="number";field.placeholder=title;line.append(field);
            }
            line.append(btn("删除",()=>{state.rdp.splice(state.rdp.indexOf(row),1);render();save();},"\ue020"));return line;
        }));
    }
    render();body.append(rows,btn("添加玩家",()=>{state.rdp.push(newRow());render();save();}));
}
export function statColumns(state,save){
    const {body}=dialog("附加列"),list=el("div","column-editor");
    function render(){
        list.replaceChildren(...state.c.map(col=>{
            const line=el("div","column-edit-row"),visible=el("select");
            visible.setAttribute("aria-label","玩家可见性");
            ["隐藏","所有行","仅玩家行"].forEach((name,i)=>visible.add(new Option(name,String(i))));
            visible.value=String(Number(col.v)||0);visible.onchange=()=>{col.v=Number(visible.value);save();};
            const edit=el("input");edit.type="checkbox";edit.checked=col.e;edit.onchange=()=>{col.e=edit.checked;save();};
            const label=el("label","","怪物行可编辑");label.prepend(edit);
            line.append(input("列名",col.a,v=>{col.a=v;save();}),visible,label,btn("删除",()=>{
                state.c=state.c.filter(c=>c!==col);
                for(const row of [...state.r,...state.rdp])row.k=(row.k||[]).filter(c=>c.id!==col.id);
                render();save();
            },"\ue020"));return line;
        }));
    }
    const show=el("input");show.type="checkbox";show.checked=state.k;show.onchange=()=>{state.k=show.checked;save();};
    const label=el("label","","显示附加列");label.prepend(show);
    const type=el("select");type.setAttribute("aria-label","附加列类型");
    const add=btn("添加列",async()=>{
        const col={id:crypto.randomUUID(),a:type.selectedOptions[0].dataset.abbreviation,p:type.value,v:0,e:true};
        const {fillColumns,modelFor}=await import("./screen-stats.js");
        for(const row of [...state.r,...state.rdp])await fillColumns([col],row,await modelFor(row));
        state.c.push(col);state.k=show.checked=true;render();save();
    });
    add.disabled=true;
    body.append(label,list,type,add);
    import("./screen-stats.js").then(mod=>mod.columnOptions(type)).then(()=>add.disabled=false)
        .catch(error=>body.append(el("p","",error.message)));
    render();
}
