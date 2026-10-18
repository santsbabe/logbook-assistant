'use strict';
/**
 * Control Centre Gmail polling core. Host-agnostic and deliberately NOT deployed.
 * A private backend must supply an authorised per-user access token, durable
 * per-user idempotency store and restricted action queue. Never put secrets in
 * GitHub, a static frontend, logs, or the public snapshot feed.
 */
const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_QUERY='newer_than:14d -category:promotions -category:social -in:spam -in:trash';
const MAX_PER_RUN=50;
function safeId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{4,100}$/.test(id)}
function decodeBody(payload){
  const parts=[];
  function read(node){
    if(!node||typeof node!=='object')return;
    if(node.mimeType==='text/plain'&&typeof node.body?.data==='string'){
      try{parts.push(Buffer.from(node.body.data,'base64url').toString('utf8'))}catch{}
    }
    if(Array.isArray(node.parts))node.parts.forEach(read);
  }
  read(payload);
  const fallback=parts.join('\n').slice(0,50000);
  return fallback;
}
async function readGmailJson(fetchImpl,accessToken,url){
  if(!accessToken||typeof accessToken!=='string')throw new Error('Server-side Google authorisation is unavailable');
  let response;
  try{response=await fetchImpl(url,{headers:{Authorization:'Bearer '+accessToken}})}
  catch{throw new Error('Gmail network request failed')}
  if(!response?.ok)throw new Error('Gmail API unavailable (status '+(response?.status||'unknown')+')');
  try{return await response.json()}catch{throw new Error('Gmail returned malformed JSON')}
}
function checkSink(sink){
  if(!sink||typeof sink.hasProcessed!=='function'||typeof sink.deliver!=='function'||
     typeof sink.markProcessed!=='function'||typeof sink.readCursor!=='function'||typeof sink.commitCursor!=='function')throw new Error('Durable private message sink and cursor required');
}
async function runGmailPoll({fetchImpl,accessToken,sink,query=DEFAULT_QUERY,maxMessages=MAX_PER_RUN,namespace}={}){
  if(typeof fetchImpl!=='function')throw new Error('Fetch transport required');
  if(!namespace||typeof namespace!=='string'||!/^[a-zA-Z0-9_-]{5,100}$/.test(namespace)){
    throw new Error('Verified account namespace required to prevent cross-user state mixing');
  }
  checkSink(sink);
  if(!Number.isInteger(maxMessages)||maxMessages<1||maxMessages>MAX_PER_RUN)throw new Error('Unsafe poll batch limit');
  if(typeof query!=='string'||query.length>1000)throw new Error('Invalid Gmail query');
  const cursorKey=namespace+':gmail:cursor';
  const previousCursor=await sink.readCursor(cursorKey);
  if(previousCursor!==null&&previousCursor!==undefined&&typeof previousCursor!=='string')throw new Error('Invalid durable Gmail cursor');
  const url=new URL(GMAIL+'/messages');
  url.searchParams.set('maxResults',String(maxMessages));
  url.searchParams.set('q',query);
  if(previousCursor)url.searchParams.set('pageToken',previousCursor);
  const list=await readGmailJson(fetchImpl,accessToken,url.href);
  if(!Array.isArray(list.messages))throw new Error('Gmail returned an invalid message list');
  let dispatched=0,duplicates=0,scanned=0;
  for(const msg of list.messages.slice(0,maxMessages)){
    if(!safeId(msg.id))continue;
    const key=namespace+':gmail:'+msg.id;
    scanned++;
    if(await sink.hasProcessed(key)){duplicates++;continue}
    const full=await readGmailJson(fetchImpl,accessToken,GMAIL+'/messages/'+encodeURIComponent(msg.id)+'?format=full');
    if(full?.id!==msg.id)throw new Error('Gmail message identity mismatch');
    const headers=full.payload?.headers||[];
    const header=name=>headers.find(h=>String(h.name||'').toLowerCase()===name)?.value||'';
    const envelope={key,sourceId:msg.id,threadId:String(full.threadId||''),
      subject:String(header('subject')).slice(0,512),
      sender:String(header('from')).slice(0,512),
      receivedAt:full.internalDate||'',
      plainText:decodeBody(full.payload)};
    // Deliver MUST be idempotent on key; a process crash before markProcessed
    // may retry the same message. Do not mark a message processed before commit.
    await sink.deliver(envelope);
    await sink.markProcessed(key);
    dispatched++;
  }
  // Only advance the pagination cursor after every delivered item is recorded.
  // If any operation above fails, this cursor stays put for safe retry.
  await sink.commitCursor(cursorKey,list.nextPageToken||'');
  return{scanned,dispatched,duplicates,moreAvailable:Boolean(list.nextPageToken)};
}
module.exports={GMAIL,DEFAULT_QUERY,MAX_PER_RUN,decodeBody,runGmailPoll};