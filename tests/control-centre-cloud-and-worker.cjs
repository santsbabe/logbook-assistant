'use strict';
const assert=require('node:assert/strict');
const cloud=require('../familyroy-control-centre-qa/cloud-sync.js');
const worker=require('../services/control-centre/gmail-worker.cjs');
(async()=>{
  assert.equal(cloud.SCOPE,'https://www.googleapis.com/auth/drive.appdata');
  assert.equal(cloud.validData({tasks:[{id:'t1',state:'Now'}]}),true);
  assert.equal(cloud.validData({tasks:[{}]}),false);
  const dataset={tasks:[{id:'school-one',state:'Review',title:'Pack for school'}],seen:[],shopping:[]};
  const snapshot={format:cloud.FORMAT,version:1,savedAt:'2026-10-18T15:00:00.000Z',data:dataset};
  let calls=[];
  const ok=value=>({ok:true,json:async()=>value});
  const fakeDrive=async(url,init)=>{
    calls.push({url,method:init.method,headers:init.headers,body:init.body});
    if(url.includes('uploadType=multipart')){
      assert.equal(init.method,'POST');
      assert.match(init.headers['Content-Type'],/^multipart\/related/);
      assert.match(init.body,/"parents":\["appDataFolder"\]/);
      assert.match(init.body,/"format":"familyroy-control-centre-cloud-snapshot"/);
      const name=JSON.parse(init.body.split('\r\n\r\n')[1].split('\r\n')[0]).name;
      return ok({id:'file-A',name,createdTime:'2026-10-18T15:00:00Z'});
    }
    if(url.includes('alt=media'))return ok(snapshot);
    if(url.includes('/drive/v3/files?'))return ok({files:[
      {id:'file-A',name:'control-centre-qa-snapshot-latest.json',mimeType:'application/json',createdTime:'2026-10-18T15:00:00Z'},
      {id:'file-B',name:'other-app.json',mimeType:'application/json'},
    ]});
    throw new Error('Unexpected Drive request: '+url);
  };
  const list=await cloud.listCopies(fakeDrive,'short-lived-token');
  assert.equal(list.length,1);
  assert.equal((await cloud.readCopy(fakeDrive,'short-lived-token',list[0])).data.tasks[0].id,'school-one');
  const saved=await cloud.createCopy(fakeDrive,'short-lived-token',dataset,
    {now:new Date('2026-10-18T15:00:00Z'),nonce:'11111111-2222-4333-8444-555555555555'});
  assert.equal(saved.id,'file-A');
  assert.equal(saved.taskCount,1);
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.ok(calls.every(x=>x.headers.Authorization==='Bearer short-lived-token'));
  assert.throws(()=>cloud.safeSnapshot({format:cloud.FORMAT,version:1,data:{tasks:[]}}),/Unrecognised/);
  assert.rejects(()=>cloud.createCopy(fakeDrive,'short-lived-token',{tasks:[{}]},
    {nonce:'11111111-2222-4333-8444-555555555555'}),/Invalid local/);
  const denial=()=>({ok:false,status:403});
  await assert.rejects(()=>cloud.listCopies(denial,'never-show-this-token'),err=>{
    assert.ok(!err.message.includes('never-show-this-token'));return true
  });
  let page=0;
  const paginated=async(url)=>{
    page++;
    const u=new URL(url);
    return ok({files:[],nextPageToken:u.searchParams.has('pageToken')?'':'page-2'});
  };
  assert.equal((await cloud.listCopies(paginated,'token')).length,0);
  assert.equal(page,2);

  const mailId='mailIdABC12345';
  const encoded=Buffer.from('Please bring a book tomorrow.','utf8').toString('base64url');
  const gmailCalls=[];
  const gmailFetch=async(url,init)=>{
    gmailCalls.push({url,authorization:init.headers.Authorization});
    if(url.includes('/messages?'))return ok({messages:[{id:mailId,threadId:'thread1'}]});
    if(url.includes('/messages/'+mailId))return ok({id:mailId,threadId:'thread1',
      internalDate:'1792335600000',payload:{headers:[
        {name:'Subject',value:'School reminder'},{name:'From',value:'School Office'}],
        parts:[{mimeType:'text/plain',body:{data:encoded}}]}});
    throw new Error('Unexpected Gmail URL');
  };
  const processed=new Set(),received=[],cursorState=new Map();
  const sink={
    hasProcessed:async key=>processed.has(key),
    deliver:async envelope=>{assert.ok(envelope.key.startsWith('user-1:gmail:'));received.push(envelope)},
    markProcessed:async key=>{processed.add(key)},
    readCursor:async key=>cursorState.get(key)||'',
    commitCursor:async (key,value)=>cursorState.set(key,value)
  };
  const first=await worker.runGmailPoll({fetchImpl:gmailFetch,accessToken:'access-only',namespace:'user-1',sink});
  assert.equal(first.dispatched,1);
  assert.equal(received[0].subject,'School reminder');
  assert.equal(received[0].plainText,'Please bring a book tomorrow.');
  const second=await worker.runGmailPoll({fetchImpl:gmailFetch,accessToken:'access-only',namespace:'user-1',sink});
  assert.equal(second.dispatched,0);
  assert.equal(second.duplicates,1);
  assert.equal(received.length,1);
  assert.ok(gmailCalls.every(c=>c.authorization==='Bearer access-only'));
  await assert.rejects(()=>worker.runGmailPoll({fetchImpl:gmailFetch,accessToken:'no',sink}),/namespace/);
  await assert.rejects(()=>worker.runGmailPoll({fetchImpl:gmailFetch,accessToken:'no',namespace:'user-1',sink:{}}),/Durable private/);
  let deliveries=0,marked=0;
  const failingSink={
    hasProcessed:async()=>false,
    deliver:async()=>{deliveries++;throw new Error('Durable queue rejected')},
    markProcessed:async()=>{marked++},
    readCursor:async()=>'',commitCursor:async()=>{marked++}
  };
  await assert.rejects(()=>worker.runGmailPoll({fetchImpl:gmailFetch,accessToken:'access-only',namespace:'user-1',sink:failingSink}),/queue rejected/);
  assert.equal(marked,0);
  assert.equal(deliveries,1);
  assert.equal(cursorState.get('user-1:gmail:cursor'),'');
  // Progress through more than one Gmail page without ever acknowledging a failed message.
  const pagedCursor=new Map(),processedPages=new Set(),pagedUrls=[];
  const pagedFetch=async(url,init)=>{
    pagedUrls.push(url);
    if(url.includes('/messages?')){
      const page=new URL(url).searchParams.get('pageToken');
      return ok(page==='second-page'?{messages:[{id:'mailSecond123'}]}:
        {messages:[{id:'mailFirst123'}],nextPageToken:'second-page'});
    }
    const id=url.match(/\/messages\/([^?]+)/)?.[1];
    return ok({id,threadId:'thread-x',payload:{headers:[],parts:[]}});
  };
  const pagedSink={
    hasProcessed:async k=>processedPages.has(k),
    deliver:async item=>{assert.ok(item.key.includes('gmail:mail'))},
    markProcessed:async k=>processedPages.add(k),
    readCursor:async k=>pagedCursor.get(k)||'',
    commitCursor:async(k,v)=>pagedCursor.set(k,v)
  };
  await worker.runGmailPoll({fetchImpl:pagedFetch,accessToken:'token',namespace:'user-2',sink:pagedSink});
  assert.equal(pagedCursor.get('user-2:gmail:cursor'),'second-page');
  await worker.runGmailPoll({fetchImpl:pagedFetch,accessToken:'token',namespace:'user-2',sink:pagedSink});
  assert.equal(pagedCursor.get('user-2:gmail:cursor'),'');
  assert.equal(processedPages.size,2);
  assert.ok(pagedUrls.some(u=>u.includes('pageToken=second-page')));

  console.log('PASS: private cloud appData snapshots, safe restore validation, Gmail durable idempotent queue and fail-closed processing');
})().catch(e=>{console.error(e);process.exitCode=1});