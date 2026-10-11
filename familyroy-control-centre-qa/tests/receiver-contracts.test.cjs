const test=require("node:test");
const assert=require("node:assert/strict");
require("../receiver-contracts.js");
const {schoolActionIdentity:key,endpointAllowed}=globalThis.FamilyRoyReceiverContracts;
const canonical=x=>String(x).toLowerCase().trim();

test("repeat of same task, child and due date has stable identity",()=>{const a={title:"Bring library bag",child:"Harrison",due:"2026-10-16",gmailId:"mail1"};assert.equal(key(a,canonical),key({...a,gmailId:"mail2"},canonical));});
test("new school week is never suppressed by the previous Friday",()=>{const a={title:"Bring library bag",child:"Harrison",due:"2026-10-16",gmailId:"mail1"};assert.notEqual(key(a,canonical),key({...a,due:"2026-10-23"},canonical));});
test("different children remain distinct even for same school task and day",()=>{const a={title:"Bring library bag",child:"Harrison",due:"2026-10-16",gmailId:"mail1"};assert.notEqual(key(a,canonical),key({...a,child:"Alexander"},canonical));});
test("undated evidence from different sources remains separate",()=>{const a={title:"Return form",child:"Harrison",gmailId:"mail1"};assert.notEqual(key(a,canonical),key({...a,gmailId:"mail2"},canonical));});
test("same undated source does not create duplicates",()=>{const a={title:"Return form",child:"Harrison",familyRoySourceId:"a".repeat(64)};assert.equal(key(a,canonical),key({...a},canonical));});
test("known preview Intake endpoints are accepted",()=>{assert.equal(endpointAllowed("https://deploy-preview-1--familyroy-intake.netlify.app"),true);assert.equal(endpointAllowed("https://familyroy-intake.netlify.app/"),true);});
test("untrusted and disguised endpoints are rejected",()=>{for(const x of ["http://familyroy-intake.netlify.app","https://evil.example","https://familyroy-intake.netlify.app.evil.example","https://familyroy-intake.netlify.app@evil.example","https://familyroy-intake.netlify.app/handoff","javascript:alert(1)","https://deploy-preview-fake--familyroy-intake.netlify.app"])assert.equal(endpointAllowed(x),false,x);});
