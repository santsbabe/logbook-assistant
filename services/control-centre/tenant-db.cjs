'use strict';
// Connection-local tenant boundary. Each transaction pins the tenant GUC to
// the VERIFIED Google subject's HMAC namespace; never accept a browser tenant.
function checkTenant(tenant){
  if(typeof tenant!=='string'||!/^[a-f0-9]{64}$/.test(tenant))
    throw Error('Verified tenant identifier required');
  return tenant;
}
async function withTenantTransaction(pool,tenant,operation){
  checkTenant(tenant);
  if(!pool||typeof pool.connect!=='function'||typeof operation!=='function')
    throw Error('Private tenant database connection required');
  const client=await pool.connect();
  let opened=false;
  try{
    await client.query('BEGIN');opened=true;
    await client.query("SELECT set_config('cc.tenant_id',$1,true)",[tenant]);
    const result=await operation({query:(sql,params)=>client.query(sql,params)});
    await client.query('COMMIT');opened=false;
    return result;
  }catch(e){
    if(opened){try{await client.query('ROLLBACK')}catch{}}
    throw e;
  }finally{
    client.release();
  }
}
function createTenantScopedStateStore({pool,encryptionKey}={}){
  const {createPostgresStateStore}=require('./postgres-state.cjs');
  return{
    read:tenant=>withTenantTransaction(pool,tenant,db=>
      createPostgresStateStore({db,encryptionKey}).read(tenant)),
    compareAndSwap:(tenant,revision,state)=>withTenantTransaction(pool,tenant,db=>
      createPostgresStateStore({db,encryptionKey}).compareAndSwap(tenant,revision,state))
  };
}
module.exports={checkTenant,withTenantTransaction,createTenantScopedStateStore};
