'use strict';
/*
 * Server-side Gmail offline OAuth with CSRF state, PKCE and identity binding.
 * This is a host-agnostic module, not a deployed callback route.
 */
const {randomBytes,createHash}=require('node:crypto');
const {verifyGoogleIdToken,tenantFromSubject}=require('./identity.cjs');
const {seal,open}=require('./postgres-gmail.cjs');
const TOKEN_URL='https://oauth2.googleapis.com/token';
const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES='openid email https://www.googleapis.com/auth/gmail.readonly';
function hashState(state){return createHash('sha256').update(state).digest('hex')}
function requireRedirect(uri){
  if(typeof uri!=='string'||!/^https:\/\/[^?#\s]+\/v1\/gmail\/callback$/.test(uri))throw Error('Approved HTTPS callback required');
  return uri;
}
function createPostgresOAuthStates({db,encryptionKey}={}){
  if(!db||typeof db.query!=='function'||!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32)
    throw Error('Durable private OAuth state required');
  return{
    async save({stateHash,tenantId,verifier,expiresAt}){
      const encrypted=seal(verifier,encryptionKey,tenantId+':pkce:'+stateHash);
      await db.query('INSERT INTO cc_oauth_states(state_hash,tenant_id,encrypted_verifier,expires_at) VALUES($1,$2,$3::jsonb,$4)',
        [stateHash,tenantId,JSON.stringify(encrypted),expiresAt]);
    },
    async consume(stateHash){
      const r=await db.query('UPDATE cc_oauth_states SET consumed_at=now() WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING tenant_id,encrypted_verifier',[stateHash]);
      const row=r.rows?.[0];if(!row)return null;
      return{tenantId:row.tenant_id,verifier:open(row.encrypted_verifier,encryptionKey,row.tenant_id+':pkce:'+stateHash)};
    }
  };
}
async function beginGmailConsent({tenantId,store,clientId,redirectUri,now=Date.now()}={}){
  if(!/^[a-f0-9]{64}$/.test(tenantId||'')||!store||typeof store.save!=='function'||
     !clientId)throw Error('Verified identity and durable state required');
  requireRedirect(redirectUri);
  const state=randomBytes(32).toString('base64url');
  const verifier=randomBytes(48).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  await store.save({stateHash:hashState(state),tenantId,verifier,expiresAt:new Date(now+600000).toISOString()});
  const url=new URL(AUTH_URL);
  const args={client_id:clientId,redirect_uri:redirectUri,response_type:'code',
    scope:SCOPES,access_type:'offline',prompt:'consent',code_challenge:challenge,
    code_challenge_method:'S256',state};
  for(const [k,v]of Object.entries(args))url.searchParams.set(k,v);
  return{authorizationUrl:url.href,expiresInSeconds:600};
}
async function completeGmailConsent({state,code,store,vault,clientId,clientSecret,
  redirectUri,tenantPepper,fetchImpl,now=Date.now()}={}){
  if(typeof state!=='string'||state.length>500||!(/^[a-zA-Z0-9_-]{20,200}$/).test(state)||
     typeof code!=='string'||code.length<5||code.length>4000||
     !store||typeof store.consume!=='function'||!vault||typeof vault.saveRefreshToken!=='function'||
     !clientId||!clientSecret||typeof fetchImpl!=='function')throw Error('Gmail consent cannot be completed');
  requireRedirect(redirectUri);
  // Consume state exactly once, atomically, before any remote token exchange.
  const pending=await store.consume(hashState(state));
  if(!pending?.tenantId||!pending?.verifier)throw Error('Gmail consent expired or previously used');
  const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,
    code,code_verifier:pending.verifier,grant_type:'authorization_code'});
  let response;
  try{response=await fetchImpl(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()})}
  catch{throw Error('Gmail consent token exchange unavailable')}
  if(!response?.ok)throw Error('Gmail consent token exchange unavailable');
  let tokens;
  try{tokens=await response.json()}catch{throw Error('Invalid Google OAuth response')}
  if(typeof tokens.id_token!=='string'||typeof tokens.refresh_token!=='string'||
    !tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.readonly')){
    throw Error('Gmail consent missing required identity, scope or offline authorisation');
  }
  const user=await verifyGoogleIdToken(tokens.id_token,{clientId,fetchImpl,now});
  if(tenantFromSubject(user.subject,tenantPepper)!==pending.tenantId)throw Error('Gmail account does not match authenticated Control Centre user');
  await vault.saveRefreshToken(pending.tenantId,tokens.refresh_token);
  return{connected:true};
}
module.exports={createPostgresOAuthStates,beginGmailConsent,completeGmailConsent,SCOPES};
