import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,validateState,searchRecords,transitionTask,escapeHTML,isOverdue,localDay} from '../public/data.js';

test('initial workspace remains valid after JSON export and import',()=>{
  const state=JSON.parse(JSON.stringify(seed()));
  assert.equal(validateState(state),state);
  assert.equal(state.people.length,5);
  assert.ok(state.tasks.every(t=>state.people.some(p=>p.id===t.assignee)));
});
test('search finds both documented knowledge and responsible people in Russian',()=>{
  const s=seed();
  assert.ok(searchRecords(s,'   ДОСТУПЫ  ').some(r=>r.kind==='page'&&r.id==='access'));
  assert.ok(searchRecords(s,'стабильность').some(r=>r.kind==='person'&&r.id==='max'));
  assert.deepEqual(searchRecords(s,'    '),[]);
});
test('task status update preserves related records and rejects invalid states',()=>{
  const s=seed(),old=s.tasks.find(t=>t.id==='t1');
  const changed=transitionTask(s.tasks,'t1','done');
  assert.equal(changed.find(t=>t.id==='t1').status,'done');
  assert.equal(changed.find(t=>t.id==='t1').page,old.page);
  assert.equal(old.status,'progress');
  assert.deepEqual(changed.filter(t=>t.id!=='t1'),s.tasks.filter(t=>t.id!=='t1'));
  assert.throws(()=>transitionTask(s.tasks,'t1','unknown'));
});
test('completed tasks are never overdue; future and missing dates are handled',()=>{
  assert.equal(isOverdue({due:localDay(-1),status:'todo'}),true);
  assert.equal(isOverdue({due:localDay(-1),status:'done'}),false);
  assert.equal(isOverdue({due:localDay(1),status:'progress'}),false);
  assert.equal(isOverdue({due:'',status:'todo'}),false);
});
test('imports reject broken references, malformed content, duplicate identities and invalid task status',()=>{
  let s=seed();s.tasks[0].assignee='missing-person';assert.throws(()=>validateState(s));
  s=seed();s.pages[0].space='missing-space';assert.throws(()=>validateState(s));
  s=seed();s.tasks[0].status='unsupported';assert.throws(()=>validateState(s));
  s=seed();s.pages[0].comments=[{text:'x',author:'missing'}];assert.throws(()=>validateState(s));
  s=seed();s.pages[0].versions=[{title:'x',at:new Date().toISOString()}];assert.throws(()=>validateState(s));
  s=seed();s.people.push({...s.people[0]});assert.throws(()=>validateState(s));
  assert.throws(()=>validateState({version:2}));
});
test('untrusted names and descriptions are escaped for HTML attributes and text',()=>{
  assert.equal(escapeHTML('<img onerror="alert(1)">&\''),'&lt;img onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});
