import test from 'node:test'
import assert from 'node:assert/strict'
import { matchFromQuiz, sanitizeQuizDraft, quizQuestions } from '../src/lib/matchQuiz.ts'

const animal = (id, overrides = {}) => ({ animalID: id, animalName: `伙伴${id}`, species: 'Canine', age: 3, size: '中型', breed: '家犬', pictureURL: null, healthStatus: '健康', restrictions: null, ...overrides })
const base = { permission: 'yes', species: 'any', size: 'any', age: 'any', care: 'no', hours: 'short', space: 'regular', activity: 'balanced', experience: 'some', household: 'adults' }
test('explicit species remains a real filter, not a cosmetic score', () => {
  const result = matchFromQuiz([animal(1), animal(2, { species: 'Feline' })], { ...base, species: 'Feline' })
  assert.deepEqual(result.items.map(x => x.animal.animalID), [2])
})
test('changing size and age changes ordering and explains the tradeoff', () => {
  const rows = [animal(1, { size: '小型', age: 1 }), animal(9, { size: '大型', age: 10 })]
  assert.equal(matchFromQuiz(rows, { ...base, size: '小型', age: 'young' }).items[0].animal.animalID, 1)
  const senior = matchFromQuiz(rows, { ...base, size: '大型', age: 'senior' })
  assert.equal(senior.items[0].animal.animalID, 9)
  assert(senior.items[1].considerations.some(x => x.includes('年龄不在')))
})
test('unknown age cannot accidentally become zero-year-old', () => {
  const rows = [animal(9, { age: '' }), animal(1, { age: 1 })]
  const result = matchFromQuiz(rows, { ...base, age: 'young' })
  assert.equal(result.items[0].animal.animalID, 1)
  assert(result.items.find(x => x.animal.animalID === 9).considerations.includes('年龄尚未确认。'))
})
test('special-care consent is explicit and pending assessment is disclosed', () => {
  const rows = [animal(1, { healthStatus: '治疗中' }), animal(2, { healthStatus: '待评估' }), animal(3, { healthStatus: null })]
  assert.deepEqual(matchFromQuiz(rows, { ...base, care: 'unknown' }).items.map(x => x.animal.animalID), [2])
  assert.equal(matchFromQuiz(rows, { ...base, care: 'yes' }).items.length, 3)
  assert(matchFromQuiz(rows, base).items[0].considerations.some(x => x.includes('健康状态待评估')))
})
test('housing not allowed gives preparation outcome with no implied approval', () => {
  const result = matchFromQuiz([animal(1)], { ...base, permission: 'no' })
  assert.equal(result.blocked, true); assert.equal(result.items.length, 0)
  assert(result.reminders.some(x => x.includes('居住许可')))
})
test('life choices affect priorities without inventing temperament', () => {
  const rows = [animal(1, { species: 'Feline', size: '小型', age: 5 }), animal(9, { size: '大型', age: 1 })]
  const result = matchFromQuiz(rows, { ...base, space: 'compact', activity: 'indoors', hours: 'long' })
  assert.equal(result.items[0].animal.animalID, 1)
  assert.equal(result.items[0].reasons.length, 3)
  assert(result.items[1].considerations.some(x => x.includes('幼龄')))
})
test('children and existing pets produce verification needs, never invented compatibility', () => {
  const result = matchFromQuiz([animal(1)], { ...base, household: 'both', experience: 'first' })
  assert(result.items[0].considerations.some(x => x.includes('儿童')))
  assert(result.items[0].considerations.some(x => x.includes('现有宠物')))
  assert(result.reminders.some(x => x.includes('第一次养宠')))
})
test('empty and unsupported catalogs are honest empty results', () => {
  assert.equal(matchFromQuiz([], base).available, 0)
  assert.equal(matchFromQuiz([animal(1, { species: 'Other' })], base).available, 0)
})
test('malformed saved drafts cannot inject answers or claim completion', () => {
  assert.equal(sanitizeQuizDraft({ version: 99, complete: true }).complete, false)
  const draft = sanitizeQuizDraft({ version: 1, started: true, step: 300, complete: true, answers: { species: 'dragon', care: 'yes', extra: 'not a question' } })
  assert.equal(draft.step, 9); assert.equal(draft.complete, false)
  assert.deepEqual(draft.answers, { care: 'yes' })
})
test('all skipped questions are resumable but add no precision', () => {
  const answers = Object.fromEntries(quizQuestions.map(q => [q.key, 'unknown']))
  const draft = sanitizeQuizDraft({ version: 1, started: true, step: 9, complete: true, answers })
  assert.equal(draft.complete, true)
  const result = matchFromQuiz([animal(1)], answers)
  assert.equal(result.items[0].rank, 0)
  assert(result.reminders.some(x => x.includes('10 项尚未确定')))
  assert.equal(result.items[0].reasons.length, 1)
})
