import { answerLabel, type QuizAnswers, type QuizKey } from './matchQuiz.ts'

export const applicationQuestions = [
  { key: 'home', title: '它将住在哪里？', help: '说明居住空间，以及家人、房东是否同意养宠。', max: 120, quiz: ['space','permission'] },
  { key: 'family', title: '谁会和它一起生活？', help: '说明共同照护的人、儿童或其他宠物，以及相处准备。', max: 100, quiz: ['household'] },
  { key: 'time', title: '平日如何陪伴它？', help: '说明独处时长、喂食、活动和日常陪伴安排。', max: 100, quiz: ['hours','activity'] },
  { key: 'experience', title: '你有哪些照护经验？', help: '第一次养宠也可以，说说你准备如何学习和获得帮助。', max: 100, quiz: ['experience'] },
  { key: 'away', title: '外出或生活变化时怎么办？', help: '说明出差、旅行、生病或搬家时，由谁继续照护。', max: 100, quiz: [] },
  { key: 'care', title: '长期照护，你准备好了吗？', help: '说明日常开支、就医安排、适应期和后续回访的准备。', max: 120, quiz: ['care'] },
  { key: 'extra', title: '还有什么想告诉我们？', help: '可以补充对这只动物的了解，或想与工作人员讨论的问题。', max: 120, quiz: [] },
] as const
export type ApplicationKey = typeof applicationQuestions[number]['key']
export type ApplicationAnswers = Record<ApplicationKey, string>
export const emptyApplicationAnswers = (): ApplicationAnswers => ({home:'',family:'',time:'',experience:'',away:'',care:'',extra:''})
const prefix = '相伴申请/v1\n'
export function encodeApplication(answers: ApplicationAnswers): string {
  return prefix + JSON.stringify(applicationQuestions.map(q => answers[q.key].trim()))
}
export function decodeApplication(note: string): ApplicationAnswers | null {
  if (!note.startsWith(prefix)) return null
  try {
    const rows: unknown = JSON.parse(note.slice(prefix.length))
    if (!Array.isArray(rows) || rows.length !== applicationQuestions.length || rows.some((v,i) => typeof v !== 'string' || v.length > applicationQuestions[i].max)) return null
    return Object.fromEntries(applicationQuestions.map((q,i) => [q.key,rows[i]])) as ApplicationAnswers
  } catch { return null }
}
export const validApplication = (answers: ApplicationAnswers) => applicationQuestions.every(q => answers[q.key].trim().length >= (q.key === 'extra' ? 0 : 5) && answers[q.key].length <= q.max) && encodeApplication(answers).length <= 1000
export function sanitizeApplicationAnswers(value: unknown): ApplicationAnswers {
  const result = emptyApplicationAnswers()
  if (value && typeof value === 'object') for (const q of applicationQuestions) {
    const v = (value as Record<string,unknown>)[q.key]
    if (typeof v === 'string') result[q.key] = v.slice(0,q.max)
  }
  return result
}
export function importQuizAnswers(current: ApplicationAnswers, quiz: QuizAnswers): ApplicationAnswers {
  const result = {...current}
  for (const question of applicationQuestions) {
    if (current[question.key].trim()) continue
    result[question.key] = (question.quiz as readonly QuizKey[]).filter(key => quiz[key] && quiz[key] !== 'unknown').map(key => answerLabel(key,quiz[key])).join('；').slice(0,question.max)
  }
  return result
}
