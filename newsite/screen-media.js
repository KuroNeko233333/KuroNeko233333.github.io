import {el,btn,input,notice} from "./screen-ui.js";
function address(text){
    const url=new URL(text,location.href);
    if(!["http:","https:"].includes(url.protocol))throw Error("请输入 HTTP 或 HTTPS 网址");
    return url;
}
export function mediaMenu(root,tab,select){
    const options=tab==="图片"?[[20,"图片网址"]]:[[10,"YouTube"],[11,"Twitch"],[12,"Twitch 聊天"],[90,"网页"]];
    if(tab==="图片"){
        const file=el("input");file.type="file";file.accept="image/*";file.hidden=true;
        file.onchange=async()=>{
            if(!file.files.length)return;
            const upload=file.files[0];file.value="";
            try{
                const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(",")[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(upload);});
                // This public anonymous Imgur application ID is also used by the legacy screen.
                const r=await fetch("https://api.imgur.com/3/image",{method:"POST",headers:{Accept:"application/json",Authorization:"Client-ID abdea4de492d3b0"},body:new URLSearchParams({image:encoded,type:"base64"})});
                const response=await r.json();if(!r.ok || !response.data?.link)throw Error(response.data?.error || "上传失败");
                select({t:20,c:{u:address(response.data.link).href}});
            }catch(e){notice("Imgur 上传失败："+e.message);}
        };
        root.append(btn("Imgur (Anonymous Upload)",()=>file.click()),file);
    }
    for(const [type,label] of options){
        const field=input(label,"",()=>{});field.placeholder="URL";
        const row=el("div","embed-form");
        row.append(el("label","",label),field,btn("Add",()=>{
            if(!field.value.trim())throw Error("请输入网址");
            let url=address(field.value.trim());
            if(type===10){
                const id=url.hostname==="youtu.be"?url.pathname.slice(1):/(^|\.)youtube\.com$/.test(url.hostname)?url.searchParams.get("v")||url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]:null;
                if(!id || !/^[\w-]+$/.test(id))throw Error("请输入 YouTube 视频网址");url=new URL("https://www.youtube.com/embed/"+id);
            }else if(type===11 || type===12){
                const channel=url.pathname.split("/").filter(Boolean)[0];
                if(!/(^|\.)twitch\.tv$/.test(url.hostname)||!/^\w+$/.test(channel))throw Error("请输入 Twitch 频道网址");
                url=new URL(type===11?"https://player.twitch.tv/?channel="+channel:"https://www.twitch.tv/embed/"+channel+"/chat");
            }
            select(type===20?{t:type,c:{u:url.href}}:{t:type,s:{u:url.href}});
        }));root.append(row);
    }
}
export function mountMedia(root,content){
    const url=address((content.s || content.c).u);
    if(content.t!==20){
        if(content.t===10)for(const [key,v] of [["autoplay",1],["enablejsapi",1],["modestbranding",1],["iv_load_policy",3]])url.searchParams.set(key,v);
        if(content.t===11 || content.t===12){url.protocol="https:";url.searchParams.set("parent",location.hostname);}
        const frame=el("iframe","screen-embed");frame.title=content.r || url.hostname;
        frame.allow="autoplay; encrypted-media";frame.allowFullscreen=true;
        frame.sandbox="allow-scripts allow-forms allow-presentation"+(url.origin!==location.origin?" allow-same-origin":"");
        frame.src=url.href;root.append(frame);return;
    }
    const area=el("div","screen-image"),img=el("img"),scale=input("缩放",1,()=>{});
    img.src=url.href;img.alt=content.r || "Image";img.draggable=false;scale.type="range";scale.min=".1";scale.max="8";scale.step=".1";
    let x=0,y=0,start;
    function render(){img.style.transform="translate("+x+"px,"+y+"px) scale("+scale.value+")";}
    img.onpointerdown=e=>{start=[e.clientX-x,e.clientY-y];img.setPointerCapture(e.pointerId);};
    img.onpointermove=e=>{if(start){x=e.clientX-start[0];y=e.clientY-start[1];render();}};
    img.onpointerup=img.onpointercancel=()=>start=null;scale.oninput=render;
    area.append(img,btn("复位",()=>{x=y=0;scale.value=1;render();},"\ue031"),scale);root.append(area);
}
