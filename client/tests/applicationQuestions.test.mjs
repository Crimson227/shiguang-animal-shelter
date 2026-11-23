import test from 'node:test'
import assert from 'node:assert/strict'
import { applicationQuestions, emptyApplicationAnswers, encodeApplication, decodeApplication, importQuizAnswers, sanitizeApplicationAnswers, validApplication } from '../src/lib/applicationQuestions.ts'

const filled = () => Object.fromEntries(applicationQuestions.map(q=>[q.key,q.key==='extra'?'':'有可靠的日常照护安排']))
test('structured submission round-trips multiline content and keeps original 1000-character contract',()=>{
  const answers=filled();answers.home='家人同意\n独立休息空间';answers.extra='原样保留："引号"和换行\n第二行'
  const note=encodeApplication(answers)
  assert.deepEqual(decodeApplication(note),answers)
  assert.ok(note.length<=1000);assert.equal(validApplication(answers),true)
})
test('legacy and malformed versions remain plain notes without dropping text',()=>{
  for(const note of ['原来的申请说明','相伴申请/v2\n[]','相伴申请/v1\n{"home":"a"}','相伴申请/v1\n[1,2,3,4,5,6,7]','相伴申请/v1\n["a"]']) assert.equal(decodeApplication(note),null)
})
test('six required answers and length limit validated with trimmed whitespace',()=>{
  assert.equal(validApplication(filled()),true)
  for(const q of applicationQuestions.filter(q=>q.key!=='extra')){const answers=filled();answers[q.key]='    ';assert.equal(validApplication(answers),false)}
  const answers=filled();answers.care='字'.repeat(121);assert.equal(validApplication(answers),false)
})
test('all normal maximum-length answers still fit existing server field',()=>{
  const answers=Object.fromEntries(applicationQuestions.map(q=>[q.key,'字'.repeat(q.max)]))
  assert.equal(validApplication(answers),true);assert.ok(encodeApplication(answers).length<=1000)
  answers.home='"'.repeat(120);answers.care='\\'.repeat(120);assert.equal(validApplication(answers),false)
})
test('quiz import only fills blanks, skips unknown, never fabricates missing care plans',()=>{
  const answers=emptyApplicationAnswers();answers.home='我已填写的真实住处'
  const imported=importQuizAnswers(answers,{space:'compact',permission:'yes',household:'pets',hours:'long',activity:'unknown',experience:'first',care:'no'})
  assert.equal(imported.home,answers.home);assert.match(imported.family,/其他宠物/);assert.match(imported.time,/8 小时/)
  assert.equal(imported.away,'');assert.equal(imported.extra,'');assert.match(imported.experience,/第一次/)
  assert.equal(answers.family,'')
})
test('corrupt drafts normalize without injecting unknown fields',()=>{
  assert.deepEqual(sanitizeApplicationAnswers(null),emptyApplicationAnswers())
  const answers=sanitizeApplicationAnswers({home:'字'.repeat(200),family:42,extra:'补充',other:'ignored'})
  assert.equal(answers.home.length,120);assert.equal(answers.family,'');assert.equal(answers.extra,'补充');assert.equal('other' in answers,false)
})
