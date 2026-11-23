export const quizQuestions = [
  { key: 'species', title: '你想与谁一起生活？', short: '相伴对象', help: '先说说期待。每个选择之后都可以修改。', options: [['Canine','想认识狗狗'],['Feline','想认识猫咪'],['any','猫狗都愿意了解']] },
  { key: 'space', title: '它将住进怎样的空间？', short: '居住空间', help: '考虑日常活动、休息和独立适应的位置。', options: [['compact','空间比较紧凑'],['regular','有独立的休息与活动空间'],['spacious','室内空间较宽敞']] },
  { key: 'permission', title: '一起生活的人，准备好了吗？', short: '共同准备', help: '包括同住家人，以及租住时需要沟通的房东。', options: [['yes','已经沟通，并获得明确同意'],['discuss','还需要和相关的人商量'],['no','目前的住处不允许养宠']] },
  { key: 'hours', title: '平日里，它会独自在家多久？', short: '陪伴时间', help: '按通常的一天选择，照护安排有变化也可以回来修改。', options: [['short','通常不超过 4 小时'],['medium','通常 4–8 小时'],['long','通常超过 8 小时'],['varies','时间不固定，会安排他人照顾']] },
  { key: 'activity', title: '你更愿意怎样度过日常？', short: '活动习惯', help: '想想你能长期保持的安排。具体动物的活动需要，还要逐一了解。', options: [['outdoor','愿意每天安排规律的户外活动'],['balanced','室内陪伴与外出活动相结合'],['indoors','更倾向于室内陪伴']] },
  { key: 'experience', title: '这是你的第几段养宠经历？', short: '照护经验', help: '经验用于准备提醒，每只动物的性格和照护难度仍需单独确认。', options: [['first','第一次，愿意认真学习'],['some','有过照护经验'],['experienced','长期照护过宠物']] },
  { key: 'household', title: '家里还有哪些伙伴？', short: '家庭成员', help: '动物与儿童、其他动物相处的情况，需要工作人员进一步确认。', options: [['alone','主要由我独自照护'],['adults','与成年家人一起生活'],['children','有需要一起考虑的儿童'],['pets','已经有其他宠物'],['both','同时有儿童和其他宠物']] },
  { key: 'size', title: '你期待怎样体型的伙伴？', short: '体型期待', help: '体型是偏好之一，不等于性格或运动需求。', options: [['小型','小小的一只'],['中型','中等体型'],['大型','也愿意认识大个子'],['any','体型不限']] },
  { key: 'age', title: '你想陪伴它的哪个阶段？', short: '年龄期待', help: '这里按档案年龄分组，具体状态以工作人员沟通为准。', options: [['young','0–1 岁的幼龄伙伴'],['adult','2–7 岁的成年伙伴'],['senior','8 岁及以上的年长伙伴'],['any','每个阶段都愿意了解']] },
  { key: 'care', title: '额外的健康照护，你准备好了吗？', short: '照护意愿', help: '了解自己的时间、精力和就医安排，再决定是否进一步认识。', options: [['yes','愿意进一步了解特殊照护需要'],['no','目前优先了解健康状态良好的动物']] },
] as const

export type QuizKey = typeof quizQuestions[number]['key']
export type QuizAnswers = Partial<Record<QuizKey, string>>
export type QuizDraft = { version: 1; started: boolean; answers: QuizAnswers; step: number; complete: boolean }
export const quizStorageKey = 'shiguang-match-quiz-v1'
export const emptyQuizDraft = (): QuizDraft => ({ version: 1, started: false, answers: {}, step: 0, complete: false })

export function sanitizeQuizDraft(value: unknown): QuizDraft {
  if (!value || typeof value !== 'object' || (value as QuizDraft).version !== 1) return emptyQuizDraft()
  const raw = value as QuizDraft
  const answers: QuizAnswers = {}
  for (const question of quizQuestions) {
    const answer = raw.answers?.[question.key]
    if (answer === 'unknown' || question.options.some(([option]) => option === answer)) answers[question.key] = answer
  }
  return { version: 1, started: raw.started === true, answers, step: Number.isInteger(raw.step) ? Math.max(0, Math.min(9, raw.step)) : 0, complete: raw.complete === true && quizQuestions.every(q => answers[q.key]) }
}

export function readQuizDraft(): QuizDraft {
  try { return sanitizeQuizDraft(JSON.parse(localStorage.getItem(quizStorageKey) || 'null')) } catch { return emptyQuizDraft() }
}

export const answerLabel = (key: QuizKey, value?: string) => {
  if (!value) return '还未选择'
  if (value === 'unknown') return '暂不确定'
  return quizQuestions.find(q => q.key === key)?.options.find(([option]) => option === value)?.[1] || '暂不确定'
}

export type MatchAnimal = { animalID: number; animalName: string; species: string; size: string | null; age: number | string | null; breed: string | null; pictureURL: string | null; healthStatus: string | null; restrictions: string | null }
export type QuizMatch = { animal: MatchAnimal; reasons: string[]; considerations: string[]; rank: number }
const known = (value?: string) => Boolean(value && value !== 'unknown' && value !== 'any')
const ageOf = (animal: MatchAnimal) => {
  if (animal.age == null || String(animal.age).trim() === '') return null
  const age = Number(animal.age)
  return Number.isFinite(age) && age >= 0 && age <= 50 ? age : null
}

export function matchFromQuiz(animals: MatchAnimal[], answers: QuizAnswers): { items: QuizMatch[]; available: number; reminders: string[]; blocked: boolean } {
  const reminders: string[] = []
  if (answers.permission !== 'yes') reminders.push(answers.permission === 'no' ? '目前的住处不允许养宠。先解决居住许可，再考虑领养。' : '先与同住家人、房东等相关的人确认养宠安排。')
  if (answers.hours === 'long') reminders.push('独处时间较长，先落实日间陪伴、外出与照护安排。')
  if (answers.hours === 'varies') reminders.push('提前确认代为照护的人选与交接安排。')
  if (answers.experience === 'first') reminders.push('第一次养宠，可以请工作人员重点介绍适应期与日常照护。')
  if (answers.household === 'alone') reminders.push('独自照护时，也为出差或临时有事准备可靠的替代安排。')
  if (['children','both'].includes(answers.household || '')) reminders.push('请工作人员逐只确认与儿童相处的记录，并讨论陪伴与看护安排。')
  if (['pets','both'].includes(answers.household || '')) reminders.push('请工作人员确认与现有宠物相处的记录，以及初次见面的安排。')
  if (answers.care === 'unknown' || !answers.care) reminders.push('额外照护意愿尚未确定，暂不纳入已记录需要特殊健康关注的动物。')
  const skipped = quizQuestions.filter(q => !answers[q.key] || answers[q.key] === 'unknown').length
  if (skipped) reminders.push(`有 ${skipped} 项尚未确定，可以随时补充，推荐也会随之调整。`)
  const blocked = answers.permission === 'no'
  const candidates = blocked ? [] : animals.filter(a => ['Canine','Feline'].includes(a.species) && (!known(answers.species) || a.species === answers.species) && (answers.care === 'yes' || a.healthStatus === '健康' || a.healthStatus === '待评估'))
  const items = candidates.map(animal => {
    let rank = 0
    const reasons: string[] = [], considerations: string[] = []
    const age = ageOf(animal)
    if (known(answers.species)) { rank += 40; reasons.push('种类符合你的期待') }
    if (known(answers.size)) {
      if (animal.size === answers.size) { rank += 25; reasons.push('体型符合你的偏好') }
      else considerations.push(animal.size ? '体型与你的首选不同，可以再了解实际照护需要。' : '体型尚未记录，需要进一步确认。')
    }
    if (known(answers.age)) {
      if (age == null) considerations.push('年龄尚未确认。')
      else if ((answers.age === 'young' && age <= 1) || (answers.age === 'adult' && age >= 2 && age < 8) || (answers.age === 'senior' && age >= 8)) { rank += 20; reasons.push('年龄阶段符合你的期待') }
      else considerations.push('年龄不在你的首选阶段。')
    }
    if (answers.space === 'compact') {
      if (animal.size === '小型') { rank += 8; reasons.push('结合紧凑空间，优先展示小型伙伴') }
      else considerations.push('居住空间较紧凑，请结合它的体型确认活动与休息位置。')
    }
    if (answers.hours === 'long' && age != null) {
      if (age >= 2) { rank += 8; reasons.push('结合陪伴安排，优先让你了解成年伙伴') }
      else considerations.push('它仍处于幼龄阶段，请先与工作人员讨论白天的照护安排。')
    }
    if (answers.activity === 'indoors') {
      if (animal.species === 'Feline') { rank += 6; reasons.push('你更倾向室内陪伴，先让你认识猫咪') }
      else considerations.push('你偏好室内陪伴，请确认能否持续安排犬只日常外出。')
    }
    if (answers.activity === 'outdoor' && animal.species === 'Canine') { rank += 6; reasons.push('你愿意安排日常外出，先让你认识狗狗') }
    if (animal.healthStatus === '待评估') considerations.push('健康状态待评估，申请前请确认最新记录。')
    else if (animal.healthStatus !== '健康') considerations.push(animal.healthStatus ? `健康记录为“${animal.healthStatus}”，请具体了解照护需要。` : '健康状态尚未记录，需要进一步确认。')
    if (['children','both'].includes(answers.household || '')) considerations.push('与儿童相处的情况，仍需工作人员确认。')
    if (['pets','both'].includes(answers.household || '')) considerations.push('与现有宠物相处的情况，仍需工作人员确认。')
    if (!reasons.length) reasons.push('目前仍在等待领养，可以从它的完整档案开始了解')
    return { animal, reasons, considerations, rank }
  }).sort((a, b) => b.rank - a.rank || Number(b.animal.animalID) - Number(a.animal.animalID))
  return { items: items.slice(0, 6), available: items.length, reminders: [...new Set(reminders)], blocked }
}
