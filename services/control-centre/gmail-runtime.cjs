'use strict';
/*
 * Unattended Gmail orchestration. It never runs by itself; a PRIVATE scheduled
 * host must inject encrypted credentials, a durable transactional queue, an
 * exclusive lease service and a server-owned approved-account listing.
 */
const {runGmailPoll}=require('./gmail-worker.cjs');
const TOKEN_URL='https://oauth2.googleapis.com/token';
function validTenant(id){return typeof id==='string'&&/^[a-f0-9]{64}$/.test(id)}
async function refreshGmailAccessToken({fetchImpl,refreshToken,clientId,clientSecret}={}){
  if(typeof fetchImpl!=='function'||!refreshToken||typeof refreshToken!=='string'||
     !clientId||!clientSecret)throw Error('Server-side Gmail credentials unavailable');
  const data=new URLSearchParams({
    client_id:clientId,client_secret:clientSecret,
    refresh_token:refreshToken,grant_type:'refresh_token'});
  let response;
  try{
    response=await fetchImpl(TOKEN_URL,{method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},body:data.toString()});
  }catch{throw Error('Google token refresh unavailable')}
  if(!response?.ok){
    if([400,401].includes(response?.status))throw Error('Gmail reauthorisation required');
    throw Error('Google token refresh unavailable');
  }
  let json;
  try{json=await response.json()}catch{throw Error('Google token refresh unavailable')}
  if(typeof json.access_token!=='string'||json.access_token.length<12||
     json.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(json.expires_in)||
     json.expires_in<=0)throw Error('Invalid Google token response');
  return json.access_token;
}
async function runScheduledGmail({accounts,vault,sinkFactory,leases,fetchImpl,clientId,clientSecret,maxAccounts=10}={}){
  if(!accounts||typeof accounts.listEnabled!=='function'||
    !vault||typeof vault.getRefreshToken!=='function'||
    !sinkFactory||typeof sinkFactory.forTenant!=='function'||
    !leases||typeof leases.withLease!=='function'||
    typeof fetchImpl!=='function'||!clientId||!clientSecret||
    !Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>30){
    throw Error('Private scheduled worker infrastructure incomplete');
  }
  const enabled=await accounts.listEnabled();
  if(!Array.isArray(enabled)||enabled.length>10000)throw Error('Invalid private account list');
  let attempted=0,succeeded=0,reauthorisationRequired=0,failed=0,dispatched=0,skipped=0;
  const encountered=new Set();
  for(const item of enabled.slice(0,maxAccounts)){
    const tenant=item?.tenantId;
    if(!validTenant(tenant)||encountered.has(tenant)||item.gmailEnabled!==true){skipped++;continue}
    encountered.add(tenant);
    attempted++;
    try{
      const result=await leases.withLease('gmail:'+tenant,async()=>{
        const refreshToken=await vault.getRefreshToken(tenant);
        if(typeof refreshToken!=='string'||!refreshToken)throw Error('Gmail reauthorisation required');
        const token=await refreshGmailAccessToken({fetchImpl,refreshToken,clientId,clientSecret});
        const sink=await sinkFactory.forTenant(tenant);
        return runGmailPoll({fetchImpl,accessToken:token,sink,namespace:tenant});
      });
      if(result===null||result===undefined){skipped++;continue}
      succeeded++;dispatched+=result.dispatched;
    }catch(e){
      if(e?.message==='Gmail reauthorisation required')reauthorisationRequired++;
      else failed++;
      // Deliberately no message body, tenant ID, token or raw exception logs.
    }
  }
  return{attempted,succeeded,reauthorisationRequired,failed,dispatched,skipped,
    hasAdditionalAccounts:enabled.length>maxAccounts};
}
module.exports={refreshGmailAccessToken,runScheduledGmail,TOKEN_URL};
