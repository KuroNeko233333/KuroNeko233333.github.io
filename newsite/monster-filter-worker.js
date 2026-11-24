// Both owned catalogues keep their optional fields in column-independent row objects.
// Parse each immutable table here; transfer only the columns used by current controls.
const tables=new Map();
async function load(url){
  let task=tables.get(url);
  if(!task){
    task=(async()=>{
      const response=await fetch(url);
      if(!response.ok)throw new Error("无法读取筛选资料（HTTP "+response.status+"）");
      if(!url.endsWith(".gz"))return response.json();
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes[0]===31 && bytes[1]===139)
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
      return JSON.parse(new TextDecoder().decode(bytes));
    })().catch(error=>{if(tables.get(url)===task)tables.delete(url);throw error;});
  }
  tables.delete(url);tables.set(url,task);
  if(tables.size>2)tables.delete(tables.keys().next().value);
  return task;
}
self.onmessage=async({data:{id,url,fields,columns,crRanges}})=>{
  try{
    const table=await load(url),result={columns:{}};
    if(fields)result.fields=table.fields;
    for(const name of columns || [])result.columns[name]=table.rows.map(row=>row[name]);
    if(crRanges){
      result.ranges=[];
      table.rows.forEach((row,i)=>{
        if(Array.isArray(row.cr) && row.cr.length>1)result.ranges.push([i,row.cr]);
      });
    }
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};