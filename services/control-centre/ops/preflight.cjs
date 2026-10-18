'use strict';
// Read-only release preflight. Never deploys, migrates, provisions or contacts Netlify.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const CHECKS={
  signedIdentity:'CONTROL_CENTRE_GOOGLE_CLIENT_ID',
  privateHttpsHost:'CONTROL_CENTRE_PRIVATE_HTTPS_URL',
  authorisedFrontend:'CONTROL_CENTRE_FRONTEND_ORIGIN',
  durablePostgres:'CONTROL_CENTRE_DATABASE_URL',
  encryptionKey:'CONTROL_CENTRE_DATA_KEY_BASE64',
  tenantPepper:'CONTROL_CENTRE_TENANT_PEPPER',
  privateRateLimiter:'CONTROL_CENTRE_RATE_LIMITER_CONFIGURED',
  verifiedBackups:'CONTROL_CENTRE_BACKUP_RESTORED_IN_STAGING',
  testedRollback:'CONTROL_CENTRE_ROLLBACK_VERIFIED',
  privacyReview:'CONTROL_CENTRE_PRIVACY_REVIEW_APPROVED',
  netlifyUsage:'CONTROL_CENTRE_NETLIFY_USAGE_VERIFIED',
  explicitApproval:'CONTROL_CENTRE_NETLIFY_DEPLOY_APPROVED'
};
function review({env=process.env,readFile=fs.readFileSync}={}){
  const errors=[],checks={};
  for(const [key,name]of Object.entries(CHECKS)){
    const value=env[name];checks[key]=Boolean(value)&&!String(value).includes('REPLACE_ME');
  }
  const config=readFile(path.join(ROOT,'familyroy-control-centre-qa/backend-config.js'),'utf8');
  const configOff=/enabled:\s*false/.test(config)&&/endpoint:\s*null/.test(config);
  if(!configOff)errors.push('QA backend flag is enabled: release gate violated');
  const clientId=env[CHECKS.signedIdentity];
  if(checks.signedIdentity&&!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))
    errors.push('Google OAuth client ID invalid');
  const https=env[CHECKS.privateHttpsHost];
  if(checks.privateHttpsHost&&!/^https:\/\/[^/?#\s]+\/?$/.test(https))
    errors.push('Private backend must have a single dedicated HTTPS origin');
  if(checks.authorisedFrontend&&env[CHECKS.authorisedFrontend]!=='https://santsbabe.github.io')
    errors.push('Frontend origin is not the approved GitHub Pages origin');
  if(checks.encryptionKey){
    const encoded=env[CHECKS.encryptionKey];
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||Buffer.from(encoded,'base64').length!==32)
      errors.push('AES-GCM key must be 32 random bytes');
  }
  if(checks.tenantPepper&&env[CHECKS.tenantPepper].length<32)
    errors.push('HMAC tenant pepper is too short');
  for(const key of ['privateRateLimiter','verifiedBackups','testedRollback','privacyReview','netlifyUsage','explicitApproval']){
    if(checks[key]&&env[CHECKS[key]]!=='yes')
      errors.push('Manual signoff is not yes: '+key);
  }
  if(checks.durablePostgres){
    try{const url=new URL(env[CHECKS.durablePostgres]);
      if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)
        errors.push('Database URL is invalid');
    }catch{errors.push('Database URL is invalid')}
  }
  return{
    qaBackendDisabled:configOff,
    verified:Object.entries(checks).filter(([,v])=>v).map(([k])=>k),
    missing:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),
    errors,ready:configOff&&errors.length===0&&Object.values(checks).every(Boolean)
  };
}
if(require.main===module){
  const result=review();
  if(process.argv.includes('--ci')){
    if(result.qaBackendDisabled&&!result.errors.length){
      process.stdout.write('PASS: QA backend disabled; no Netlify or cloud deployment authorised\n');
    }else{process.stderr.write(result.errors.join('\n')+'\n');process.exitCode=1}
  }else{
    process.stdout.write('Read-only private-backend preflight. No resources changed.\n');
    process.stdout.write('QA backend disabled: '+result.qaBackendDisabled+'\n');
    process.stdout.write('Checked prerequisites: '+result.verified.length+'/'+Object.keys(CHECKS).length+'\n');
    process.stdout.write('Missing: '+result.missing.join(', ')+'\n');
    process.stdout.write('Configuration problems: '+(result.errors.join(', ')||'none')+'\n');
    process.stdout.write('Release-ready: '+result.ready+'\n');
    if(process.argv.includes('--release')&&!result.ready)process.exitCode=1;
  }
}
module.exports={review,CHECKS};
