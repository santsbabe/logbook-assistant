'use strict';
const assert=require('node:assert/strict');
const {generateKeyPairSync,createPublicKey,sign,randomBytes}=require('node:crypto');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const identity=require('../services/control-centre/identity.cjs');
const conflicts=require('../services/control-centre/conflict-merge.cjs');
const postgres=require('../services/control-centre/postgres-state.cjs');
const {createStateApi}=require('../services/control-centre/state-api.cjs');
const pgGmail=require('../services/control-centre/postgres-gmail.cjs');
const gmailRuntime=require('../services/control-centre/gmail-runtime.cjs');
const gmailOAuth=require('../services/control-centre/gmail-oauth.cjs');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});
const KEY={...jwk,kid:'test-google-key',alg:'RS256',use:'sig'};
const NOW=Date.parse('2026-10-18T19:00:00Z'),AUD='qa-private-oauth-client.apps.googleusercontent.com';
const PEPPER='testing-secret-pepper-not-for-production-please-rotate',DATA_KEY=randomBytes(32);
function issueToken({sub='google-account-A',aud=AUD,iss='https://accounts.google.com',
  exp=Math.floor(NOW/1000)+3600,iat=Math.floor(NOW/1000)}={}){
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:KEY.kid,typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({iss,aud,sub,iat,exp})).toString('base64url');
  const signed=head+'.'+body;
  return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
}
function ok(value){return{ok:true,status:200,json:async()=>value}}
const googleKeysFetch=async url=>{
  assert.equal(url,identity.GOOGLE_CERTS);
  return ok({keys:[KEY]});
};
class FakePg{
  constructor(){this.state=new Map();this.mail=new Map();this.processed=new Set();this.cursors=new Map();
    this.credentials=new Map();this.states=new Map();this.calls=[]}
  async query(sql,args=[]){
    this.calls.push([sql,args]);
    if(sql.startsWith('SELECT revision, encrypted_snapshot')){
      const value=this.state.get(args[0]);
      return{rows:value?[{revision:value.revision,encrypted_snapshot:value.encrypted_snapshot}]:[]};
    }
    if(sql.startsWith('INSERT INTO control_centre_state')){
      const current=this.state.get(args[0]),existing=current?.revision||0;
      if(existing!==args[1])return{rows:[]};
      const revision=existing+1;
      this.state.set(args[0],{revision,encrypted_snapshot:JSON.parse(args[2])});
      return{rows:[{revision}]};
    }
    if(sql.startsWith('INSERT INTO cc_gmail_inbox')){
      const k=args[0]+'|'+args[1];
      if(!this.mail.has(k))this.mail.set(k,JSON.parse(args[2]));
      return{rows:[]};
    }
    if(sql.startsWith('SELECT 1 FROM cc_gmail_processed')){
      return{rows:this.processed.has(args[0]+'|'+args[1])?[{one:1}]:[]};
    }
    if(sql.startsWith('INSERT INTO cc_gmail_processed')){
      this.processed.add(args[0]+'|'+args[1]);return{rows:[]};
    }
    if(sql.startsWith('SELECT cursor_value FROM cc_gmail_cursor')){
      const value=this.cursors.get(args[0]+'|'+args[1]);
      return{rows:value===undefined?[]:[{cursor_value:value}]};
    }
    if(sql.startsWith('INSERT INTO cc_gmail_cursor')){
      this.cursors.set(args[0]+'|'+args[1],args[2]);return{rows:[]};
    }
    if(sql.startsWith('INSERT INTO cc_gmail_credentials')){
      this.credentials.set(args[0],JSON.parse(args[1]));return{rows:[]};
    }
    if(sql.startsWith('SELECT encrypted_refresh FROM cc_gmail_credentials')){
      const value=this.credentials.get(args[0]);
      return{rows:value?[{encrypted_refresh:value}]:[]};
    }
    if(sql.startsWith('DELETE FROM cc_gmail_credentials')){
      this.credentials.delete(args[0]);return{rows:[]};
    }
    if(sql.startsWith('SELECT tenant_id FROM cc_gmail_credentials')){
      return{rows:[...this.credentials.keys()].map(tenant_id=>({tenant_id}))};
    }
    if(sql.startsWith('SELECT encrypted_envelope FROM cc_gmail_inbox')){
      const value=this.mail.get(args[0]+'|'+args[1]);
      return{rows:value?[{encrypted_envelope:value}]:[]};
    }
    if(sql.startsWith('INSERT INTO cc_oauth_states')){
      this.states.set(args[0],{tenant_id:args[1],encrypted_verifier:JSON.parse(args[2]),consumed:false});return{rows:[]};
    }
    if(sql.startsWith('UPDATE cc_oauth_states SET consumed_at')){
      const entry=this.states.get(args[0]);
      if(!entry||entry.consumed)return{rows:[]};
      entry.consumed=true;return{rows:[entry]};
    }
    throw Error('Unexpected SQL call: '+sql.slice(0,140));
  }
}
function mockReq({method='GET',token,origin='https://santsbabe.github.io',
  body,path='/v1/state',headers={}}={}){
  const stream=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  stream.method=method;stream.url=path;stream.headers={origin,
    ...(token?{authorization:'Bearer '+token}:{}),
    ...(body!==undefined?{'content-type':'application/json'}:{}),...headers};
  return stream;
}
function mockRes(){
  return{statusCode:200,headers:{},setHeader(n,v){this.headers[n]=v},
    end(t){this.body=t||''}};
}
async function callApi(handler,req){const res=mockRes();await handler(req,res);
  return{status:res.statusCode,headers:res.headers,
    body:res.body?JSON.parse(res.body):null}}
(async()=>{
  const signed=issueToken();
  const user=await identity.verifyGoogleIdToken(signed,{clientId:AUD,fetchImpl:googleKeysFetch,now:NOW});
  assert.equal(user.subject,'google-account-A');
  const t1=identity.tenantFromSubject('google-account-A',PEPPER);
  const t2=identity.tenantFromSubject('google-account-B',PEPPER);
  assert.notEqual(t1,t2);assert.match(t1,/^[a-f0-9]{64}$/);
  assert.equal(identity.tenantFromSubject('google-account-A',PEPPER),t1);
  for(const token of [
    issueToken({aud:'attacker-client'}),issueToken({iss:'https://attacker.example'}),
    issueToken({exp:Math.floor(NOW/1000)-1}),
    signed.slice(0,-7)+'abcdefg',
  ])await assert.rejects(()=>identity.verifyGoogleIdToken(token,
    {clientId:AUD,fetchImpl:googleKeysFetch,now:NOW}),/Identity verification failed/);
  assert.throws(()=>identity.parseBearer('Basic attacker'),/Authorisation/);
  const good=()=>({tasks:[{id:'task.1',title:'School bag',state:'Next'}],seen:[]});
  const pg=new FakePg(),store=postgres.createPostgresStateStore({db:pg,encryptionKey:DATA_KEY});
  assert.deepEqual(await store.read(t1),{revision:0,data:{tasks:[]}});
  const sameTime=await Promise.all([store.compareAndSwap(t1,0,good()),store.compareAndSwap(t1,0,good())]);
  assert.equal(sameTime.filter(x=>x.applied).length,1,'Two simultaneous first writes cannot both win');
  const first=await store.read(t1);
  assert.equal(first.revision,1);
  assert.equal(first.data.tasks[0].title,'School bag');
  assert.equal(JSON.stringify(pg.state.get(t1)).includes('School bag'),false,
    'Database must not store plaintext task details');
  assert.deepEqual(await store.read(t2),{revision:0,data:{tasks:[]}});
  assert.throws(()=>postgres.decrypt(pg.state.get(t1).encrypted_snapshot,t2,1,DATA_KEY),/integrity/);
  assert.throws(()=>postgres.decrypt(pg.state.get(t1).encrypted_snapshot,t1,2,DATA_KEY),/integrity/);
  const altered={...pg.state.get(t1).encrypted_snapshot,ciphertext:'YXR0YWNrZXI'};
  assert.throws(()=>postgres.decrypt(altered,t1,1,DATA_KEY),/integrity/);
  const base={tasks:[{id:'A',title:'One',state:'Now'},{id:'B',title:'Two',state:'Next'}],shopping:[{id:'fruit',done:false}]};
  const local={tasks:[{id:'A',title:'One',state:'Done'},{id:'B',title:'Two',state:'Next'}],shopping:[{id:'fruit',done:false}]};
  const remote={tasks:[{id:'A',title:'One',state:'Now'},{id:'B',title:'Two',state:'Now'}],shopping:[{id:'fruit',done:false}]};
  const merged=conflicts.mergeThreeWay(base,local,remote);
  assert.equal(merged.conflicts.length,0);assert.equal(merged.merged.tasks[0].state,'Done');
  assert.equal(merged.merged.tasks[1].state,'Now');
  const changedBoth={...remote,tasks:[{id:'A',title:'One',state:'Waiting'},{id:'B',title:'Two',state:'Now'}]};
  assert.equal(conflicts.mergeThreeWay(base,local,changedBoth).merged,null);
  assert.equal(conflicts.mergeThreeWay(base,local,changedBoth).conflicts[0].kind,'task-concurrent-edit');
  assert.equal(conflicts.mergeThreeWay(base,local,{...remote,tasks:[remote.tasks[1]]}).conflicts[0].kind,'task-delete');
  assert.equal(conflicts.mergeThreeWay(base,local,{...remote,shopping:[{id:'fruit',done:true}]}).merged.tasks[0].state,'Done');
  assert.equal(conflicts.mergeThreeWay(base,{...local,shopping:[{id:'fruit',done:true}]},{...remote,shopping:[{id:'fruit',done:'unknown'}]}).merged,null);
  assert.equal(conflicts.validState({tasks:[{id:'A'},{id:'A'}]}),false);
  assert.equal(conflicts.validState({tasks:[{id:'A'}],unsafe:{constructor:12}}),false);
  let count=0;const allowed={allow:async()=>++count<=20};
  const api=createStateApi({store,googleClientId:AUD,tenantPepper:PEPPER,
    allowedOrigins:['https://santsbabe.github.io'],fetchImpl:googleKeysFetch,
    rateLimiter:allowed,now:()=>NOW});
  const unauth=await callApi(api,mockReq());
  assert.equal(unauth.status,401);
  const spoofed=await callApi(api,mockReq({token:issueToken({sub:'google-account-B'}),headers:{'x-user-id':'google-account-A'}}));
  assert.equal(spoofed.status,200);assert.equal(spoofed.body.revision,0,
    'Forged x-user-id cannot cross tenant boundary');
  const denied=await callApi(api,mockReq({token:signed,origin:'https://attacker.example'}));
  assert.equal(denied.status,403);assert.equal(denied.headers['Access-Control-Allow-Origin'],undefined);
  const get=await callApi(api,mockReq({token:signed}));
  assert.equal(get.status,200);assert.equal(get.body.revision,1);
  assert.equal(get.headers['Cache-Control'],'no-store');
  const update=await callApi(api,mockReq({method:'PUT',token:signed,body:{expectedRevision:1,data:local}}));
  assert.equal(update.status,200);assert.equal(update.body.revision,2);
  const collision=await callApi(api,mockReq({method:'PUT',token:signed,body:{expectedRevision:1,data:remote}}));
  assert.equal(collision.status,409);assert.equal(collision.body.currentRevision,2);
  assert.ok(!JSON.stringify(collision.body).includes('School bag'));
  const options=await callApi(api,mockReq({method:'OPTIONS',origin:'https://santsbabe.github.io'}));
  assert.equal(options.status,204);assert.equal(options.headers['Access-Control-Allow-Origin'],'https://santsbabe.github.io');
  const unknown=await callApi(api,mockReq({method:'DELETE',token:signed}));
  assert.equal(unknown.status,405);

  const gmail=pgGmail.createGmailPostgres({db:pg,dataKey:DATA_KEY});
  const key=t1+':gmail:schoolMessage123';
  const mailbox=await gmail.forTenant(t1);
  assert.equal(await mailbox.hasProcessed(key),false);
  const envelope={key,sourceId:'schoolMessage123',plainText:'Confidential reminder',subject:'School',sender:'Office'};
  await mailbox.deliver(envelope);
  await mailbox.deliver(envelope);
  assert.equal(pg.mail.size,1);
  assert.equal(JSON.stringify([...pg.mail.values()]).includes('Confidential reminder'),false);
  assert.equal((await gmail.readEncryptedEnvelope(t1,key)).plainText,'Confidential reminder');
  assert.equal(await gmail.readEncryptedEnvelope(t2,key),null,'Cross-tenant inbox reads never return mail');
  await mailbox.markProcessed(key);
  assert.equal(await mailbox.hasProcessed(key),true);
  await mailbox.commitCursor(t1+':gmail:cursor','cursor-abc');
  assert.equal(await mailbox.readCursor(t1+':gmail:cursor'),'cursor-abc');
  const tokenSecret='refresh-secret-example-at-least-20-chars';
  await gmail.saveRefreshToken(t1,tokenSecret);
  assert.equal(await gmail.getRefreshToken(t1),tokenSecret);
  assert.equal(JSON.stringify([...pg.credentials.values()]).includes(tokenSecret),false);
  assert.deepEqual(await gmail.listEnabled(),[{tenantId:t1,gmailEnabled:true}]);
  await gmail.revoke(t1);
  assert.equal(await gmail.getRefreshToken(t1),null);
  let released=0,unlockCount=0;
  const pool={connect:async()=>({query:async sql=>sql.includes('pg_try')?{rows:[{acquired:true}]}:(unlockCount++,{rows:[{released:true}]}),
    release:()=>released++})};
  let called=0;
  const lease=pgGmail.createPgLeaseProvider(pool);
  assert.equal(await lease.withLease('gmail:'+t1,async()=>++called),1);
  assert.equal(called,1);assert.equal(released,1);assert.equal(unlockCount,1);
  let releasedOnFailure=0;
  const brokenPool={connect:async()=>({query:async sql=>{
    if(sql.includes('pg_try'))return{rows:[{acquired:true}]};
    throw Error('Unable to unlock connection');
  },release:()=>releasedOnFailure++})};
  await assert.rejects(()=>pgGmail.createPgLeaseProvider(brokenPool).withLease(
    'gmail:'+t1,async()=>true),/Unable to unlock connection/);
  assert.equal(releasedOnFailure,1,'Never leak a pooled connection after unlock failure');


  const refreshFake=async url=>{
    assert.equal(url,gmailRuntime.TOKEN_URL);
    return ok({access_token:'temporary-token-value',token_type:'Bearer',expires_in:3600});
  };
  assert.equal(await gmailRuntime.refreshGmailAccessToken({fetchImpl:refreshFake,refreshToken:tokenSecret,
    clientId:AUD,clientSecret:'injected-secret'}),'temporary-token-value');
  await assert.rejects(()=>gmailRuntime.refreshGmailAccessToken({fetchImpl:async()=>({ok:false,status:400}),
    refreshToken:tokenSecret,clientId:AUD,clientSecret:'injected-secret'}),/reauthorisation/);
  const source={listEnabled:async()=>[{tenantId:t1,gmailEnabled:true},{tenantId:t2,gmailEnabled:true}]};
  let refreshed=0;
  const runtimeFetch=async(url,init)=>{
    if(url===gmailRuntime.TOKEN_URL){refreshed++;return ok({access_token:'valid-access-token',token_type:'Bearer',expires_in:3599})}
    if(url.includes('/messages?'))return ok({messages:[]});
    throw Error('Unexpected network call');
  };
  const sinkFactory={forTenant:async()=>({hasProcessed:async()=>false,deliver:async()=>{},
    markProcessed:async()=>{},readCursor:async()=>'',commitCursor:async()=>{}})};
  const summary=await gmailRuntime.runScheduledGmail({accounts:source,
    vault:{getRefreshToken:async t=>t===t1?tokenSecret:null},sinkFactory,
    leases:{withLease:async(_,fn)=>fn()},fetchImpl:runtimeFetch,
    clientId:AUD,clientSecret:'injected-secret'});
  assert.equal(summary.succeeded,1);assert.equal(summary.reauthorisationRequired,1);
  assert.equal(refreshed,1);assert.equal(summary.dispatched,0);
  // Gmail OAuth state must be once-only, and cross-account login must be rejected.
  const stateStore=gmailOAuth.createPostgresOAuthStates({db:pg,encryptionKey:DATA_KEY});
  const started=await gmailOAuth.beginGmailConsent({tenantId:t1,store:stateStore,clientId:AUD,
    redirectUri:'https://private.example/v1/gmail/callback',now:NOW});
  const consentUrl=new URL(started.authorizationUrl);
  assert.equal(consentUrl.searchParams.get('code_challenge_method'),'S256');
  assert.equal(consentUrl.searchParams.get('access_type'),'offline');
  assert.equal(consentUrl.searchParams.get('prompt'),'consent');
  let networkCalls=0;
  const oauthFetch=async(url,init)=>{
    if(url===gmailOAuth.AUTH_URL)throw Error('Unrelated');
    if(url===gmailRuntime.TOKEN_URL){
      networkCalls++;
      assert.equal(new URLSearchParams(init.body).get('grant_type'),'authorization_code');
      assert.ok(new URLSearchParams(init.body).get('code_verifier'));
      return ok({id_token:signed,refresh_token:tokenSecret,
        scope:'openid email https://www.googleapis.com/auth/gmail.readonly'});
    }
    return googleKeysFetch(url);
  };
  const done=await gmailOAuth.completeGmailConsent({state:consentUrl.searchParams.get('state'),
    code:'temporary-authorization-code',store:stateStore,vault:gmail,clientId:AUD,
    clientSecret:'injected-secret',redirectUri:'https://private.example/v1/gmail/callback',
    tenantPepper:PEPPER,fetchImpl:oauthFetch,now:NOW});
  assert.deepEqual(done,{connected:true});
  assert.equal(await gmail.getRefreshToken(t1),tokenSecret);
  await assert.rejects(()=>gmailOAuth.completeGmailConsent({state:consentUrl.searchParams.get('state'),
    code:'temporary-authorization-code',store:stateStore,vault:gmail,clientId:AUD,
    clientSecret:'injected-secret',redirectUri:'https://private.example/v1/gmail/callback',
    tenantPepper:PEPPER,fetchImpl:oauthFetch,now:NOW}),/previously used/);
  assert.equal(networkCalls,1);
  const other=await gmailOAuth.beginGmailConsent({tenantId:t2,store:stateStore,clientId:AUD,
    redirectUri:'https://private.example/v1/gmail/callback',now:NOW});
  await assert.rejects(()=>gmailOAuth.completeGmailConsent({state:new URL(other.authorizationUrl).searchParams.get('state'),
    code:'temporary-authorization-code',store:stateStore,vault:gmail,clientId:AUD,
    clientSecret:'injected-secret',redirectUri:'https://private.example/v1/gmail/callback',
    tenantPepper:PEPPER,fetchImpl:oauthFetch,now:NOW}),/does not match/);
  assert.equal(await gmail.getRefreshToken(t2),null);
  const ddl=fs.readFileSync('services/control-centre/schema/001_private_backend.sql','utf8');
  for(const table of ['control_centre_state','cc_gmail_inbox','cc_gmail_credentials','cc_gmail_cursor','cc_oauth_states']){
    assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS '+table));
  }
  console.log('PASS authenticated Google identity, isolated encrypted state CAS, conservative 3-way merge, token vault, Gmail lease/worker and single-use PKCE OAuth');
})().catch(e=>{console.error(e);process.exitCode=1});
