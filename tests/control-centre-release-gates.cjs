'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {review,CHECKS}=require('../services/control-centre/ops/preflight.cjs');
const first=review({env:{}});
assert.equal(first.qaBackendDisabled,true);
assert.equal(first.ready,false,'Without explicit approval release must not pass');
assert.ok(first.missing.includes('netlifyUsage'));
assert.ok(first.missing.includes('explicitApproval'));
const env={};
const strong='e'.repeat(48);
for(const [field,key]of Object.entries(CHECKS)){
  env[key]=field==='signedIdentity'?'safe-ci.apps.googleusercontent.com':
    field==='privateHttpsHost'?'https://private-ci.example':
    field==='authorisedFrontend'?'https://santsbabe.github.io':
    field==='durablePostgres'?'postgresql://ignored@127.0.0.1/ci':
    field==='encryptionKey'?Buffer.alloc(32,7).toString('base64'):
    field==='tenantPepper'?strong:'yes';
}
assert.equal(review({env}).ready,true,'A complete explicitly approved private configuration passes a read-only preflight');
const invalid={...env,CONTROL_CENTRE_NETLIFY_DEPLOY_APPROVED:'no'};
assert.equal(review({env:invalid}).ready,false,'Netlify release permission must be explicit');
const invalidOrigin={...env,CONTROL_CENTRE_FRONTEND_ORIGIN:'https://attacker.example'};
assert.ok(review({env:invalidOrigin}).errors.length);
const badKey={...env,CONTROL_CENTRE_DATA_KEY_BASE64:'invalid'};
assert.ok(review({env:badKey}).errors.length);
const template=fs.readFileSync('services/control-centre/ops/release.env.example','utf8');
assert.ok(template.includes('CONTROL_CENTRE_NETLIFY_DEPLOY_APPROVED=no'));
assert.ok(template.includes('CONTROL_CENTRE_NETLIFY_USAGE_VERIFIED=no'));
assert.ok(!template.includes('BEGIN PRIVATE KEY'));
const runbook=fs.readFileSync('docs/control-centre/deployment-and-rollback-readiness.md','utf8');
assert.match(runbook,/separate app and migration roles/);
assert.match(runbook,/No Netlify build/i);
assert.match(runbook,/Do not DROP tables/);
assert.match(runbook,/iPhone Safari/);
console.log('PASS staged release preflight: explicit Netlify permission, cost, HTTPS, origin, key validity and non-destructive rollback; no deployment');
