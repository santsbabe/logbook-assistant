'use strict';
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const PgGmail=require('../services/control-centre/postgres-gmail.cjs');
const PgState=require('../services/control-centre/postgres-state.cjs');
const Runtime=require('../services/control-centre/gmail-runtime.cjs');
const Review=require('../services/control-centre/gmail-review.cjs');
const TENANT='a'.repeat(64),OTHER='b'.repeat(64);
class LocalPg{
  constructor(){
    this.inbox=new Map();this.processed=new Set();this.cursors=new Map();
    this.credentials=new Map();this.state=new Map();this.failNextAck=false;
    this.failNextCas=false;this.locked=false;
  }
  async query(sql,args=[]){
    const [tenant,key,v]=args;
    if(sql.startsWith('INSERT INTO cc_gmail_credentials')){
      this.credentials.set(tenant,JSON.parse(key));return{rows:[]};
    }
    if(sql.startsWith('SELECT encrypted_refresh FROM cc_gmail_credentials'))
      return{rows:this.credentials.has(tenant)?[{encrypted_refresh:this.credentials.get(tenant)}]:[]};
    if(sql.startsWith('SELECT tenant_id FROM cc_gmail_credentials'))
      return{rows:[...this.credentials].map(([tenant_id])=>({tenant_id}))};
    if(sql.startsWith('DELETE FROM cc_gmail_credentials')){
      this.credentials.delete(tenant);return{rows:[]};
    }
    if(sql.startsWith('INSERT INTO cc_gmail_inbox')){
      const id=tenant+'|'+key;
      if(!this.inbox.has(id))this.inbox.set(id,{tenant,key,encrypted:JSON.parse(v),ack:false});
      return{rows:[]};
    }
    if(sql.startsWith('SELECT message_key,encrypted_envelope FROM cc_gmail_inbox')){
      return{rows:[...this.inbox.values()].filter(row=>row.tenant===tenant&&!row.ack)
        .slice(0,key).map(row=>({message_key:row.key,encrypted_envelope:row.encrypted}))};
    }
    if(sql.startsWith('UPDATE cc_gmail_inbox SET reviewed_at')){
      if(this.failNextAck){this.failNextAck=false;throw Error('Temporary acknowledge failure')}
      const row=this.inbox.get(tenant+'|'+key);if(row)row.ack=true;
      return{rows:[]};
    }
    if(sql.startsWith('SELECT encrypted_envelope FROM cc_gmail_inbox')){
      const row=this.inbox.get(tenant+'|'+key);
      return{rows:row?[{encrypted_envelope:row.encrypted}]:[]};
    }
    if(sql.startsWith('SELECT 1 FROM cc_gmail_processed'))
      return{rows:this.processed.has(tenant+'|'+key)?[{}]:[]};
    if(sql.startsWith('INSERT INTO cc_gmail_processed')){
      this.processed.add(tenant+'|'+key);return{rows:[]};
    }
    if(sql.startsWith('SELECT cursor_value FROM cc_gmail_cursor'))
      return{rows:this.cursors.has(tenant+'|'+key)?[{cursor_value:this.cursors.get(tenant+'|'+key)}]:[]};
    if(sql.startsWith('INSERT INTO cc_gmail_cursor')){
      this.cursors.set(tenant+'|'+key,v);return{rows:[]};
    }
    if(sql.startsWith('SELECT revision, encrypted_snapshot FROM control_centre_state')){
      const row=this.state.get(tenant);
      return{rows:row?[{revision:row.revision,encrypted_snapshot:row.encrypted}]:[]};
    }
    if(sql.startsWith('WITH updated AS (')){
      if(this.failNextCas){this.failNextCas=false;return{rows:[]}}
      const current=this.state.get(tenant),rev=current?.revision||0;
      if(rev!==key)return{rows:[]};
      this.state.set(tenant,{revision:rev+1,encrypted:JSON.parse(v)});
      return{rows:[{revision:rev+1}]};
    }
    if(sql.startsWith('SELECT pg_try_advisory_lock')){
      if(this.locked)return{rows:[{acquired:false}]};
      this.locked=true;return{rows:[{acquired:true}]};
    }
    if(sql.startsWith('SELECT pg_advisory_unlock')){
      this.locked=false;return{rows:[{released:true}]};
    }
    throw Error('Unexpected local SQL: '+sql);
  }
  async connect(){return{query:(sql,args)=>this.query(sql,args),release:()=>{}}}
}
(async()=>{
  const db=new LocalPg(),secret=randomBytes(32);
  const pgGmail=PgGmail.createGmailPostgres({db,dataKey:secret});
  const store=PgState.createPostgresStateStore({db,encryptionKey:secret});
  const lease=PgGmail.createPgLeaseProvider(db);
  const refreshToken='testing-offline-refresh-token-not-real';
  await pgGmail.saveRefreshToken(TENANT,refreshToken);
  let tokenRequests=0,messageRequests=0;
  const fetchImpl=async(url,init)=>{
    if(url===Runtime.TOKEN_URL){
      tokenRequests++;
      const values=new URLSearchParams(init.body);
      assert.equal(values.get('refresh_token'),refreshToken);
      return{ok:true,json:async()=>({access_token:'short-lived-test-gmail-token',
        token_type:'Bearer',expires_in:3600})};
    }
    assert.equal(init.headers.Authorization,'Bearer short-lived-test-gmail-token');
    if(url.includes('/messages?'))return{ok:true,json:async()=>({messages:[
      {id:'schoolMail12345'},{id:'noticeMail45678'}]})};
    if(url.includes('/messages/')){
      messageRequests++;
      const id=url.match(/\/messages\/([^?]+)/)[1];
      return{ok:true,json:async()=>({id,threadId:'thread-1',internalDate:'1792335600000',
        payload:{headers:[{name:'Subject',value:id==='schoolMail12345'?'PNPS: library bag reminder':'Aftercare information'},
          {name:'From',value:'School Office'}],
          parts:[{mimeType:'text/plain',body:{data:Buffer.from('Please see the attached school notice; details to confirm').toString('base64url')}}]}})};
    }
    throw Error('Unexpected Gmail network call');
  };
  const cycle=()=>Runtime.runScheduledGmail({accounts:pgGmail,vault:pgGmail,
    sinkFactory:pgGmail,leases:lease,fetchImpl,
    clientId:'test-oauth-client',clientSecret:'test-server-secret'});
  const first=await cycle();
  assert.equal(first.succeeded,1);
  assert.equal(first.dispatched,2);
  assert.equal(db.inbox.size,2);
  assert.equal(db.processed.size,2);
  assert.equal(messageRequests,2);
  const stored=JSON.stringify([...db.inbox.values()]);
  assert.ok(!stored.includes('Please see the attached school notice'));
  assert.ok(!stored.includes('library bag reminder'),'Only encrypted mail is stored');
  const firstQueue=await pgGmail.pending(TENANT,30);
  assert.equal(firstQueue.length,2);
  assert.ok(firstQueue.every(x=>x.key.startsWith(TENANT+':gmail:')));
  assert.equal((await pgGmail.pending(OTHER,30)).length,0,'Other tenant cannot see mailbox');
  // Simulate a collision with a concurrent device write: CAS retries and preserves records.
  db.failNextCas=true;
  const imported=await Review.importGmailQueue({tenantId:TENANT,queue:pgGmail,stateStore:store});
  assert.equal(imported.imported,2);
  const saved=await store.read(TENANT);
  assert.equal(saved.revision,2);
  assert.equal(saved.data.tasks.length,2);
  assert.ok(saved.data.tasks.every(t=>t.state==='Review'&&t.due===''&&t.owner==='Unassigned'));
  assert.ok(saved.data.tasks.some(t=>t.title.includes('PNPS')));
  assert.equal((await pgGmail.pending(TENANT,30)).length,0);
  assert.ok(!JSON.stringify(db.state.get(TENANT)).includes('PNPS'),'Tasks are encrypted at rest');
  // Re-running Gmail and import cannot double-create the same Review task.
  const repeated=await cycle();
  assert.equal(repeated.dispatched,0);
  assert.equal(messageRequests,2);
  assert.equal((await Review.importGmailQueue({tenantId:TENANT,queue:pgGmail,stateStore:store})).imported,0);
  // A crash after a committed task but before acknowledgement must leave a safe retry.
  const item={key:TENANT+':gmail:replayMail34567',sourceId:'replayMail34567',
    subject:'Forgotten notice',sender:'school',plainText:'Collect from reception'};
  const sink=await pgGmail.forTenant(TENANT);
  await sink.deliver(item);
  db.failNextAck=true;
  await assert.rejects(()=>Review.importGmailQueue({tenantId:TENANT,queue:pgGmail,stateStore:store}),/acknowledge/);
  const afterCrash=await store.read(TENANT);
  assert.equal(afterCrash.data.tasks.filter(t=>t.gmailId==='replayMail34567').length,1);
  const recovery=await Review.importGmailQueue({tenantId:TENANT,queue:pgGmail,stateStore:store});
  assert.equal(recovery.existing,1);
  assert.equal((await store.read(TENANT)).data.tasks.filter(t=>t.gmailId==='replayMail34567').length,1);
  assert.equal((await pgGmail.pending(TENANT,30)).length,0);
  // If database writes remain in conflict, the inbox stays unacknowledged for later retry.
  const bad={key:TENANT+':gmail:blockedMail45678',sourceId:'blockedMail45678',
    subject:'Unprocessed',plainText:'Keep this until the database is available'};
  await sink.deliver(bad);
  const permanentCollision={read:()=>store.read(TENANT),compareAndSwap:async()=>({applied:false})};
  await assert.rejects(()=>Review.importGmailQueue({tenantId:TENANT,queue:pgGmail,
    stateStore:permanentCollision}),/Concurrent/);
  assert.equal((await pgGmail.pending(TENANT,30)).length,1);
  // Revocation stops new polling, but existing private queued data remains recoverable.
  await pgGmail.revoke(TENANT);
  const revoked=await cycle();
  assert.equal(revoked.reauthorisationRequired,0);
  assert.equal(revoked.attempted,0);
  assert.equal((await pgGmail.pending(TENANT,30)).length,1);
  assert.equal(await pgGmail.getRefreshToken(TENANT),null);
  assert.equal(db.locked,false,'Exclusive Gmail worker lease must be released');
  console.log('PASS: mocked offline OAuth refresh -> encrypted Gmail queue -> CAS Review actions; idempotency, account isolation, rollback/retry and revocation');
})().catch(e=>{console.error(e);process.exitCode=1});
