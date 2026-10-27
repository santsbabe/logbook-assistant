'use strict';
const assert = require('node:assert/strict');
const { projectControlCentreSnapshot, FORMAT, VERSION } =
  require('../familyroy-control-centre-qa/less-readonly-projection.js');
const raw = {
  tasks: [
    {id:'school-1',title:'Pack school kit',module:'School Readiness',state:'Done',
      owner:'Parent A',child:'Alexander',due:'2026-11-06',
      familyRoySourceId:'a'.repeat(64),
      familyRoyRoute:'control_centre.school_readiness',
      source:'FamilyRoy Intake',sourceUrl:'https://mail.google.com/mail/u/0/#all/demo',
      evidenceText:'A private source notice not to include in projections',
      resolution:'Done in the app',completedAt:'2026-10-26T10:00:00Z'},
    {id:'school-2',title:'Check teacher form',module:'School Readiness',state:'Review',
      owner:'Unassigned',child:'Harrison',due:'2026-11-06',gmailId:'some-message-id',
      sourceUrl:'javascript:alert(1)'},
    {id:'school-1',title:'Duplicate old task copy',module:'School Readiness',
      state:'Next',owner:'Parent B',due:'2026-11-06'},
  ],
  seen:['gmail:message1'],shopping:[{price:199}],secret:'must-not-leak'
};
const snapshot=structuredClone(raw);
const output=projectControlCentreSnapshot(raw,{snapshotId:'synthetic-v1'});
assert.equal(output.format,FORMAT);assert.equal(output.version,VERSION);
assert.equal(output.snapshotStatus,'caller_supplied_partial_not_live_verified');
assert.equal(output.domainOwner,'familyroy_control_centre');
assert.equal(output.taskCount,3);assert.deepEqual(output.duplicateIds,['school-1']);
assert.equal(output.seenIdsCount,1);
assert.equal(output.tasks[0].state,'Done');
assert.equal(output.tasks[0].owner,'Parent A');
assert.equal(output.tasks[0].resolution,'Done in the app');
assert.equal(output.tasks[0].evidenceTextPresent,true);
assert.equal(output.tasks[0].originalEvidenceKeptInControlCentre,true);
assert.equal(output.tasks[1].sourceUrl,null);
assert.equal(output.tasks[2].owner,'Parent B');
assert.equal(JSON.stringify(output).includes('A private source notice'),false);
assert.equal(JSON.stringify(output).includes('must-not-leak'),false);
assert.equal(JSON.stringify(output).includes('199'),false);
output.tasks[0].owner='Not the real owner';
assert.deepEqual(raw,snapshot);
assert.throws(()=>projectControlCentreSnapshot(null),/explicit saved/);
assert.throws(()=>projectControlCentreSnapshot({tasks:[{title:'Missing ID'}]}),/identifier/);
assert.throws(()=>projectControlCentreSnapshot({tasks:new Array(20001).fill({id:'id'})}),/limit/);
const fresh=projectControlCentreSnapshot({tasks:[],seen:[]});
assert.equal(fresh.taskCount,0);
assert.equal(fresh.snapshotStatus,'caller_supplied_partial_not_live_verified');
assert.ok(!('outcomeVerified' in fresh.tasks));
assert.ok(!('actionAllowed' in fresh));
console.log('LESS FamilyRoy read-only projection contract: all tests passed');
