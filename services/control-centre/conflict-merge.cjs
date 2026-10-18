'use strict';
/*
 * Conservative 3-way merge for independently edited Control Centre data.
 * No silent winner for simultaneous changes, deleted tasks or non-task sections.
 * Returns only a candidate if no conflicts; does not write to cloud storage.
 */
const MAX_JSON_BYTES=1024*1024;
function safeJsonObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  let bytes=Buffer.byteLength(JSON.stringify(value)||'','utf8');
  if(bytes>MAX_JSON_BYTES)return false;
  const stack=[{x:value,d:0}],seen=new Set();
  while(stack.length){
    const {x,d}=stack.pop();
    if(!x||typeof x!=='object')continue;
    if(d>32||seen.has(x))return false;
    seen.add(x);
    for(const [key,item] of Object.entries(x)){
      if(key==='__proto__'||key==='constructor'||key==='prototype')return false;
      if(item&&typeof item==='object')stack.push({x:item,d:d+1});
    }
  }
  return true;
}
function validState(data){
  if(!safeJsonObject(data)||!Array.isArray(data.tasks)||data.tasks.length>10000)return false;
  let seen=new Set();
  for(const task of data.tasks){
    if(!task||typeof task!=='object'||Array.isArray(task)||
       typeof task.id!=='string'||!/^[a-zA-Z0-9_.:@-]{1,300}$/.test(task.id)||
       seen.has(task.id))return false;
    seen.add(task.id);
  }
  return true;
}
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function clone(x){return JSON.parse(JSON.stringify(x))}
function mergeThreeWay(base,local,remote){
  if(!validState(base)||!validState(local)||!validState(remote))throw Error('Invalid state; merge cancelled');
  const baseMap=new Map(base.tasks.map(t=>[t.id,t]));
  const localMap=new Map(local.tasks.map(t=>[t.id,t]));
  const remoteMap=new Map(remote.tasks.map(t=>[t.id,t]));
  const ids=new Set([...baseMap.keys(),...localMap.keys(),...remoteMap.keys()]);
  const mergedTasks=[],conflicts=[];
  for(const id of ids){
    const b=baseMap.get(id),l=localMap.get(id),r=remoteMap.get(id);
    // Deletions are never propagated automatically: require explicit confirmation.
    if((b&&!l)||(b&&!r)){conflicts.push({kind:'task-delete',id});continue}
    if(!b&&!l&&!r)continue;
    const eq=(x,y)=>stable(x)===stable(y);
    let chosen;
    if(!b){
      if(l&&r&&!eq(l,r)){conflicts.push({kind:'task-new-conflict',id});continue}
      chosen=l||r;
    }else if(eq(l,r))chosen=l;
    else if(eq(l,b))chosen=r;
    else if(eq(r,b))chosen=l;
    else{conflicts.push({kind:'task-concurrent-edit',id});continue}
    if(chosen)mergedTasks.push(clone(chosen));
  }
  const out={tasks:mergedTasks};
  const sections=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  sections.delete('tasks');
  for(const section of sections){
    const b=base[section],l=local[section],r=remote[section];
    const exists={base:Object.hasOwn(base,section),local:Object.hasOwn(local,section),remote:Object.hasOwn(remote,section)};
    if(exists.base&&(!exists.local||!exists.remote)){
      conflicts.push({kind:'section-delete',section});continue;
    }
    const eq=(x,y)=>stable(x)===stable(y);
    let chosen;
    if(eq(l,r))chosen=l;
    else if(eq(l,b))chosen=r;
    else if(eq(r,b))chosen=l;
    else{conflicts.push({kind:'section-concurrent-edit',section});continue}
    if(chosen!==undefined)out[section]=clone(chosen);
  }
  return{merged:conflicts.length?null:out,conflicts,summary:{
    remoteTaskCount:remote.tasks.length,localTaskCount:local.tasks.length,
    mergedTaskCount:conflicts.length?null:mergedTasks.length}};
}
module.exports={mergeThreeWay,validState,MAX_JSON_BYTES};
