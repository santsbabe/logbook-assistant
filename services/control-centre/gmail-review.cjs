'use strict';
/*
 * Private Gmail-to-Review consumer. NEVER infers a child, owner or deadline:
 * a new message produces a Review item with retained provenance.
 * Persist through revisioned tenant state BEFORE acknowledging a queue item.
 */
const MAX_ATTEMPTS=4,MAX_BATCH=30;
function tenantOk(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function fromEnvelope(tenant,envelope){
  if(!tenantOk(tenant)||!envelope||typeof envelope!=='object'||
     typeof envelope.sourceId!=='string'||!/^[a-zA-Z0-9_-]{4,100}$/.test(envelope.sourceId)||
     envelope.key!==tenant+':gmail:'+envelope.sourceId)throw Error('Invalid private Gmail review evidence');
  const title=String(envelope.subject||'').trim().slice(0,180);
  return{
    id:'gmail-review:'+envelope.sourceId,
    title:'Review email: '+(title||'Untitled message'),
    state:'Review',owner:'Unassigned',cat:'Admin',
    module:'Attention Inbox',priority:45,
    source:'Gmail background watch',gmailId:envelope.sourceId,
    familyRoySourceId:envelope.key,
    evidenceText:String(envelope.plainText||'').slice(0,12000),
    sender:String(envelope.sender||'').slice(0,250),
    emailThreadId:String(envelope.threadId||'').slice(0,100),
    receivedAt:String(envelope.receivedAt||''),
    due:''
  };
}
async function importGmailQueue({tenantId,queue,stateStore,maxMessages=MAX_BATCH}={}){
  if(!tenantOk(tenantId)||!queue||typeof queue.pending!=='function'||typeof queue.acknowledge!=='function'||
    !stateStore||typeof stateStore.read!=='function'||typeof stateStore.compareAndSwap!=='function'||
    !Number.isInteger(maxMessages)||maxMessages<1||maxMessages>MAX_BATCH)
    throw Error('Private review queue and revisioned state store required');
  const items=await queue.pending(tenantId,maxMessages);
  if(!Array.isArray(items)||items.length>maxMessages)throw Error('Invalid private review batch');
  let imported=0,existing=0;
  for(const envelope of items){
    const task=fromEnvelope(tenantId,envelope);
    let committed=false,wasExisting=false;
    for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
      const current=await stateStore.read(tenantId);
      if(!current||!Number.isSafeInteger(current.revision)||!current.data||
         !Array.isArray(current.data.tasks))throw Error('Unable to read private task state');
      if(current.data.tasks.some(t=>t.id===task.id||t.gmailId===task.gmailId)){
        committed=true;wasExisting=true;break;
      }
      const updated={...current.data,tasks:[...current.data.tasks,task]};
      const saved=await stateStore.compareAndSwap(tenantId,current.revision,updated);
      if(saved.applied===true){committed=true;imported++;break}
    }
    if(!committed)throw Error('Concurrent Control Centre edits prevented safe inbox import');
    // A crash before acknowledgement is safe: task identity suppresses duplicate import.
    await queue.acknowledge(tenantId,envelope.key);
    if(wasExisting)existing++;
  }
  return{scanned:items.length,imported,existing};
}
module.exports={fromEnvelope,importGmailQueue};
