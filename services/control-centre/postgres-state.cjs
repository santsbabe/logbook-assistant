'use strict';
/*
 * Private, encrypted, revisioned state store.
 * db.query must connect to a durable transactional PostgreSQL database.
 * The single UPSERT predicate is the atomic compare-and-swap, not a JS lock.
 */
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {validState}=require('./conflict-merge.cjs');
const TABLE='control_centre_state';
function keyBuffer(key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Encrypted storage key must be exactly 32 bytes');
  return key;
}
function tenant(tenantId){
  if(typeof tenantId!=='string'||!/^[a-f0-9]{64}$/.test(tenantId))throw Error('Invalid verified tenant identifier');
  return tenantId;
}
function revision(n){
  if(!Number.isSafeInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER-2)throw Error('Invalid expected revision');
  return n;
}
function encrypt(data,tenantId,rev,key){
  if(!validState(data))throw Error('Invalid state');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBuffer(key),iv);
  cipher.setAAD(Buffer.from(tenant(tenantId)+':'+revision(rev)));
  const plain=Buffer.from(JSON.stringify(data),'utf8');
  const body=Buffer.concat([cipher.update(plain),cipher.final()]);
  return{version:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:body.toString('base64url')};
}
function decrypt(envelope,tenantId,rev,key){
  try{
    if(envelope?.version!==1||typeof envelope.iv!=='string'||
       typeof envelope.tag!=='string'||typeof envelope.ciphertext!=='string')throw Error('Invalid envelope');
    const iv=Buffer.from(envelope.iv,'base64url'),tag=Buffer.from(envelope.tag,'base64url');
    if(iv.length!==12||tag.length!==16)throw Error('Invalid envelope');
    const decipher=createDecipheriv('aes-256-gcm',keyBuffer(key),iv);
    decipher.setAAD(Buffer.from(tenant(tenantId)+':'+revision(rev)));
    decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]);
    const state=JSON.parse(plain.toString('utf8'));
    if(!validState(state))throw Error('Invalid content');
    return state;
  }catch{throw Error('Private stored state failed integrity verification')}
}
const READ_SQL='SELECT revision, encrypted_snapshot FROM '+TABLE+' WHERE tenant_id=$1';
// A guarded UPDATE handles subsequent revisions; first-time INSERT is permitted
// only for expected=0. Either branch succeeds atomically or no row is returned.
const CAS_SQL='WITH updated AS ('+
 ' UPDATE '+TABLE+' SET revision=revision+1,encrypted_snapshot=$3::jsonb,updated_at=now()'+
 ' WHERE tenant_id=$1 AND revision=$2::bigint AND $2::bigint>0 RETURNING revision'+
 '), inserted AS ('+
 ' INSERT INTO '+TABLE+' (tenant_id,revision,encrypted_snapshot,updated_at)'+
 ' SELECT $1,1,$3::jsonb,now() WHERE $2::bigint=0'+
 ' ON CONFLICT(tenant_id) DO NOTHING RETURNING revision'+
 ') SELECT revision FROM updated UNION ALL SELECT revision FROM inserted';
function createPostgresStateStore({db,encryptionKey}={}){
  if(!db||typeof db.query!=='function')throw Error('Durable database required');
  keyBuffer(encryptionKey);
  return{
    async read(tenantId){
      const id=tenant(tenantId),result=await db.query(READ_SQL,[id]);
      const row=result?.rows?.[0];
      if(!row)return{revision:0,data:{tasks:[]}};
      const rev=Number(row.revision);
      revision(rev);
      return{revision:rev,data:decrypt(row.encrypted_snapshot,id,rev,encryptionKey)};
    },
    async compareAndSwap(tenantId,expectedRevision,data){
      const id=tenant(tenantId),expected=revision(expectedRevision);
      const encrypted=encrypt(data,id,expected+1,encryptionKey);
      const result=await db.query(CAS_SQL,[id,expected,JSON.stringify(encrypted)]);
      const next=result?.rows?.[0];
      if(!next)return{applied:false};
      if(Number(next.revision)!==expected+1)throw Error('Unexpected database revision');
      return{applied:true,revision:expected+1};
    },
  };
}
module.exports={createPostgresStateStore,encrypt,decrypt,READ_SQL,CAS_SQL};
