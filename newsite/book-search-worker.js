let rows, url;
self.onmessage=async({data})=>{
    const {id,src,query}=data;
    try{
        if(src!==url){
            url=src;
            rows=(async()=>{const r=await fetch(src);if(!r.ok)throw Error("找不到本书索引");
                const bytes=new Uint8Array(await r.arrayBuffer());
                if(bytes[0]===31 && bytes[1]===139)return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
                return JSON.parse(new TextDecoder().decode(bytes));
            })();
        }
        const q=query.trim().toLocaleLowerCase(),results=[];
        (await rows).forEach((chapter,c)=>{for(const [i,[anchor,line]] of chapter.entries()){
            const pos=line.toLocaleLowerCase().indexOf(q);if(pos<0)continue;
            results.push([c,anchor,line.slice(Math.max(0,pos-32),pos+q.length+68),i]);
        }});
        postMessage({id,results});
    }catch(error){rows=url=null;postMessage({id,error:error.message});}
};