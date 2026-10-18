'use strict';
/*
 * Durable, privately encrypted Gmail message queue, idempotency and token vault.
 * All SQL uses parameterized queries. The private server must provide a
 * restricted PostgreSQL connection and a 32-byte secret from its secret store.
 */
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
function requireTenant(t){if(typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t))throw Error('Invalid verified account');return t}
function requireKey(k){if(!Buffer.isBuffer(k)||k.length!==32)throw Error('Private data key unavailable');return k}
function seal(text,key,aad){
  let iv=randomBytes(12),c=createCipheriv('aes-256-gcm',requireKey(key),iv);
  c.setAAD(Buffer.from(aad));
  let ciphertext=Buffer.concat([c.update(Buffer.from(text)),c.final()]);
  return{v:1,iv:iv.toString('base64url'),tag:c.getAuthTag().toString('base64url'),body:ciphertext.toString('base64url')};
}
function open(envelope,key,aad){
  try{
    if(envelope?.v!==1)throw Error('Invalid envelope');
    let iv=Buffer.from(envelope.iv,'base64url'),tag=Buffer.from(envelope.tag,'base64url');
    if(iv.length!==12||tag.length!==16)throw Error('Invalid envelope');
    let d=createDecipheriv('aes-256-gcm',requireKey(key),iv);
    d.setAAD(Buffer.from(aad));d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(envelope.body,'base64url')),d.final()]).toString('utf8');
  }catch{throw Error('Private Gmail record failed integrity verification')}
}
function createGmailPostgres({db,dataKey}={}){
  if(!db||typeof db.query!=='function')throw Error('Durable database missing');
  requireKey(dataKey);
  return{
    async forTenant(id){
      const tenant=requireTenant(id);
      return{
        async hasProcessed(messageKey){
          if(typeof messageKey!=='string'||!messageKey.startsWith(tenant+':gmail:'))throw Error('Invalid message key');
          const result=await db.query('SELECT 1 FROM cc_gmail_processed WHERE tenant_id=$1 AND message_key=$2',[tenant,messageKey]);
          return Boolean(result.rows?.length);
        },
        async deliver(envelope){
          if(!envelope||typeof envelope.key!=='string'||!envelope.key.startsWith(tenant+':gmail:')||
             typeof envelope.sourceId!=='string')throw Error('Invalid private mail envelope');
          let encrypted=seal(JSON.stringify(envelope),dataKey,tenant+':mail:'+envelope.key);
          await db.query('INSERT INTO cc_gmail_inbox(tenant_id,message_key,encrypted_envelope) VALUES($1,$2,$3::jsonb) ON CONFLICT(tenant_id,message_key) DO NOTHING',
            [tenant,envelope.key,JSON.stringify(encrypted)]);
        },
        async markProcessed(messageKey){
          if(!messageKey.startsWith(tenant+':gmail:'))throw Error('Invalid message key');
          await db.query('INSERT INTO cc_gmail_processed(tenant_id,message_key) VALUES($1,$2) ON CONFLICT(tenant_id,message_key) DO NOTHING',
            [tenant,messageKey]);
        },
        async readCursor(cursorKey){
          if(cursorKey!==tenant+':gmail:cursor')throw Error('Invalid cursor key');
          const r=await db.query('SELECT cursor_value FROM cc_gmail_cursor WHERE tenant_id=$1 AND cursor_key=$2',[tenant,cursorKey]);
          return r.rows?.[0]?.cursor_value||'';
        },
        async commitCursor(cursorKey,value){
          if(cursorKey!==tenant+':gmail:cursor'||typeof value!=='string'||value.length>2048)throw Error('Invalid cursor');
          await db.query('INSERT INTO cc_gmail_cursor(tenant_id,cursor_key,cursor_value) VALUES($1,$2,$3) ON CONFLICT(tenant_id,cursor_key) DO UPDATE SET cursor_value=EXCLUDED.cursor_value',
            [tenant,cursorKey,value]);
        }
      };
    },
    async getRefreshToken(id){
      const tenant=requireTenant(id);
      const result=await db.query('SELECT encrypted_refresh FROM cc_gmail_credentials WHERE tenant_id=$1 AND gmail_enabled=true',[tenant]);
      if(!result.rows?.length)return null;
      return open(result.rows[0].encrypted_refresh,dataKey,tenant+':oauth-refresh');
    },
    async saveRefreshToken(id,token){
      const tenant=requireTenant(id);
      if(typeof token!=='string'||token.length<20||token.length>10000)throw Error('Invalid refresh token');
      const envelope=seal(token,dataKey,tenant+':oauth-refresh');
      await db.query('INSERT INTO cc_gmail_credentials(tenant_id,encrypted_refresh,gmail_enabled) VALUES($1,$2::jsonb,true) ON CONFLICT(tenant_id) DO UPDATE SET encrypted_refresh=EXCLUDED.encrypted_refresh,gmail_enabled=true,updated_at=now()',
        [tenant,JSON.stringify(envelope)]);
    },
    async revoke(id){
      const tenant=requireTenant(id);
      await db.query('DELETE FROM cc_gmail_credentials WHERE tenant_id=$1',[tenant]);
    },
    async listEnabled(){
      const result=await db.query('SELECT tenant_id FROM cc_gmail_credentials WHERE gmail_enabled=true ORDER BY tenant_id');
      return(result.rows||[]).map(r=>({tenantId:r.tenant_id,gmailEnabled:true}));
    },
    async readEncryptedEnvelope(id,key){
      const tenant=requireTenant(id);
      const r=await db.query('SELECT encrypted_envelope FROM cc_gmail_inbox WHERE tenant_id=$1 AND message_key=$2',[tenant,key]);
      if(!r.rows?.length)return null;
      return JSON.parse(open(r.rows[0].encrypted_envelope,dataKey,tenant+':mail:'+key));
    }
  };
}
function createPgLeaseProvider(pool){
  if(!pool||typeof pool.connect!=='function')throw Error('Durable PostgreSQL lease pool unavailable');
  return{async withLease(key,run){
    if(typeof key!=='string'||!/^[a-z]+:[a-f0-9]{64}$/.test(key)||typeof run!=='function')throw Error('Invalid lease request');
    const client=await pool.connect();
    let taken=false;
    try{
      const r=await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[key]);
      taken=r.rows?.[0]?.acquired===true;
      if(!taken)return null;
      return await run();
    }finally{
      if(taken)await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0)) AS released',[key]);
      client.release();
    }
  }};
}
module.exports={createGmailPostgres,createPgLeaseProvider,seal,open};
