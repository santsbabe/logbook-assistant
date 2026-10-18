/* Control Centre: staged, disabled-by-default authenticated QA client.
 * No app data or ID token is persisted by this module.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ControlCentreSync=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const MAX_BYTES=1048576;
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function plain(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}
  function validData(data){
    if(!plain(data)||!Array.isArray(data.tasks)||data.tasks.length>10000)return false;
    let encoded;
    try{encoded=JSON.stringify(data)}catch{return false}
    if(!encoded||encoded.length>MAX_BYTES)return false;
    const ids=new Set(),seen=new Set(),stack=[{v:data,d:0}];
    while(stack.length){
      const {v,d}=stack.pop();if(!v||typeof v!=='object')continue;
      if(d>25||seen.has(v))return false;seen.add(v);
      for(const [k,x] of Object.entries(v)){
        if(['__proto__','constructor','prototype'].includes(k))return false;
        if(x&&typeof x==='object')stack.push({v:x,d:d+1});
      }
    }
    for(const t of data.tasks){
      if(!plain(t)||typeof t.id!=='string'||!/^[a-zA-Z0-9_.:@-]{1,300}$/.test(t.id)||ids.has(t.id))return false;
      ids.add(t.id);
    }
    return true;
  }
  function canonical(v){
    if(v===undefined)return'undefined';
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    if(plain(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }
  function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v))}
  function keyFor(kind,id){return kind+':'+encodeURIComponent(id)}
  // If base is null, this is the FIRST connection; simultaneous same-ID records
  // have no proven common ancestor and must be reviewed, never auto-overwritten.
  function planMerge(base,local,remote,choices={}){
    const first=base===null;
    const b=first?{tasks:[]}:base;
    if(![b,local,remote].every(validData))throw Error('Unsafe or malformed Control Centre data');
    const toMap=d=>new Map(d.tasks.map(t=>[t.id,t]));
    const B=toMap(b),L=toMap(local),R=toMap(remote);
    const merged={tasks:[]},conflicts=[],unresolved=[];
    const eq=(a,c)=>canonical(a)===canonical(c);
    function choose(kind,id,left,right){
      const key=keyFor(kind,id),selected=choices[key];
      if(selected!=='local'&&selected!=='remote'){
        conflicts.push({key,kind,id,local:clone(left),remote:clone(right)});
        unresolved.push(key);return undefined;
      }
      conflicts.push({key,kind,id,local:clone(left),remote:clone(right),selection:selected});
      return clone(selected==='local'?left:right);
    }
    for(const id of new Set([...B.keys(),...L.keys(),...R.keys()])){
      const existed=B.has(id),bItem=B.get(id),l=L.get(id),r=R.get(id);
      let result;
      if(first){
        if(!l)result=r;
        else if(!r||eq(l,r))result=l;
        else result=choose('task',id,l,r);
      }else if(existed&&(!l||!r)){
        result=choose('task',id,l,r);
      }else if(!existed){
        result=l&&r&&!eq(l,r)?choose('task',id,l,r):(l||r);
      }else if(eq(l,r))result=l;
      else if(eq(l,bItem))result=r;
      else if(eq(r,bItem))result=l;
      else result=choose('task',id,l,r);
      if(result!==undefined)merged.tasks.push(clone(result));
    }
    const keys=new Set([...Object.keys(b),...Object.keys(local),...Object.keys(remote)]);
    keys.delete('tasks');
    for(const section of keys){
      const vB=b[section],vL=local[section],vR=remote[section];
      let result;
      if(first){
        result=eq(vL,vR)?vL:vL===undefined?vR:vR===undefined?vL:choose('section',section,vL,vR);
      }else if(has(b,section)&&(!has(local,section)||!has(remote,section))){
        result=choose('section',section,vL,vR);
      }else if(eq(vL,vR))result=vL;
      else if(eq(vL,vB))result=vR;
      else if(eq(vR,vB))result=vL;
      else result=choose('section',section,vL,vR);
      if(result!==undefined)merged[section]=clone(result);
    }
    return{ready:unresolved.length===0,candidate:unresolved.length?null:merged,conflicts,unresolved,
      firstConnection:first,localTasks:local.tasks.length,remoteTasks:remote.tasks.length};
  }
  function checkUrl(config){
    if(config?.enabled!==true)throw Error('Authenticated backend not enabled');
    const value=config.endpoint;
    if(typeof value!=='string')throw Error('Approved API endpoint missing');
    let url;
    try{url=new URL(value)}catch{throw Error('Approved API endpoint missing')}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
      (url.pathname!=='/'&&url.pathname!=='')||!url.hostname||
      url.hostname==='santsbabe.github.io')throw Error('Private HTTPS API host is required');
    return url.origin+'/v1/state';
  }
  function createClient({config,fetchImpl}={}){
    const endpoint=checkUrl(config);
    if(typeof fetchImpl!=='function')throw Error('Network transport unavailable');
    async function request(method,token,body){
      if(typeof token!=='string'||token.length<100||token.length>12000)throw Error('Google ID sign-in required');
      let response;
      try{
        response=await fetchImpl(endpoint,{
          method,mode:'cors',cache:'no-store',redirect:'error',
          headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
          ...(body?{body:JSON.stringify(body)}:{})
        });
      }catch{throw Error('Private API unreachable. No data was changed')}
      if(response?.status===401)throw Error('Google sign-in expired. Sign in again');
      if(response?.status===409){
        let details;try{details=await response.json()}catch{}
        return{conflict:true,currentRevision:details?.currentRevision??null};
      }
      if(!response?.ok)throw Error('Private API unavailable ('+(response?.status||'unknown')+'). No data was changed');
      let decoded;try{decoded=await response.json()}catch{throw Error('Malformed private API response')}
      return decoded;
    }
    return{
      async read(token){
        const data=await request('GET',token);
        if(!data||!Number.isSafeInteger(data.revision)||data.revision<0||!validData(data.data))
          throw Error('Private API returned an unsafe snapshot');
        return{revision:data.revision,data:data.data};
      },
      async write(token,revision,data){
        if(!Number.isSafeInteger(revision)||revision<0||!validData(data))throw Error('Refusing unsafe cloud write');
        const result=await request('PUT',token,{expectedRevision:revision,data});
        if(result.conflict)return result;
        if(!Number.isSafeInteger(result.revision)||result.revision!==revision+1||result.updated!==true)
          throw Error('Cloud write could not be confirmed; inspect server before retry');
        return{revision:result.revision,updated:true};
      }
    };
  }
  return{validData,planMerge,createClient,keyFor};
});