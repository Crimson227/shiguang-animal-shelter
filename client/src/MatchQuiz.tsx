import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, PawPrint } from '@phosphor-icons/react'
import { api } from './lib/api'
import { answerLabel, emptyQuizDraft, matchFromQuiz, quizQuestions, quizStorageKey, readQuizDraft, type MatchAnimal, type QuizDraft } from './lib/matchQuiz'
import { useMotionPreference } from './motionPreferenceContext'
import AnimalPhoto from './AnimalPhoto'
import { PeekCompanion } from './LivingCompanions'
import './PublicTypography.css'
import './CatalogEditorial.css'
import './AnimalPhoto.css'
import './MatchQuiz.css'

export default function MatchQuiz({ role = null }: { role?: 'member' | 'admin' | null }) {
  const [draft, setDraft] = useState<QuizDraft>(readQuizDraft)
  const [animals, setAnimals] = useState<MatchAnimal[]>([])
  const [loading, setLoading] = useState(draft.complete), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [canSave, setCanSave] = useState(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const { reduced } = useMotionPreference()
  const question = quizQuestions[draft.step]
  const answered = quizQuestions.filter(q => draft.answers[q.key]).length
  const result = useMemo(() => matchFromQuiz(animals, draft.answers), [animals, draft.answers])

  useEffect(() => {
    try { localStorage.setItem(quizStorageKey, JSON.stringify(draft)); setCanSave(true) } catch { setCanSave(false) }
  }, [draft])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    heading.current?.focus({ preventScroll: true })
  }, [draft.started, draft.step, draft.complete])
  useEffect(() => {
    if (!draft.complete) return
    const controller = new AbortController()
    setLoading(true); setError('')
    api<MatchAnimal[]>('/api/catalog', { signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setAnimals(rows) })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof TypeError ? '暂时无法读取待领养档案，请稍后重试。' : (err as Error).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [draft.complete, retry])

  const next = (skip = false) => {
    const answers = skip ? { ...draft.answers, [question.key]: 'unknown' } : draft.answers
    if (!answers[question.key]) return
    if (draft.step < quizQuestions.length - 1) setDraft({ ...draft, answers, step: draft.step + 1 })
    else {
      const missing = quizQuestions.findIndex(q => !answers[q.key])
      if (missing < 0) setLoading(true)
      setDraft({ ...draft, answers, step: missing < 0 ? draft.step : missing, complete: missing < 0 })
    }
  }
  const edit = (step: number) => setDraft({ ...draft, started: true, complete: false, step })
  const clear = () => {
    if (!window.confirm('清除这台设备上的问卷答案和进度？')) return
    try { localStorage.removeItem(quizStorageKey) } catch { /* The in-memory draft can still be cleared. */ }
    setDraft(emptyQuizDraft()); setAnimals([]); setError('')
  }

  return <div className="catalog-page c-editorial match-quiz" data-motion={reduced ? 'reduced' : 'full'}>
    <a className="c-skip" href="#quiz-content">跳到相伴问卷</a>
    <header className="quiz-header"><Link to="/catalog" className="quiz-brand">拾光守护</Link><nav aria-label="相伴问卷导航"><Link to="/catalog">浏览领养档案 <ArrowUpRight size={16} /></Link><Link to={role === 'admin' ? '/' : '/member'}>{role === 'admin' ? '管理工作台' : role === 'member' ? '我的领养' : '领养人登录'} <ArrowUpRight size={16} /></Link></nav></header>
    <main id="quiz-content" className="quiz-main">
      {!draft.started ? <section className="quiz-intro"><div><h1 ref={heading} tabIndex={-1}>让相遇，<br />更合适<span>。</span></h1><p>每个人的生活不同，<br />适合相伴的方式，也各有不同。</p><p className="quiz-intro-detail">用 10 个小问题，梳理你的生活与期待。<br />再一起认识，正在等待一个家的它们。</p><button className="quiz-primary" onClick={() => setDraft({ ...draft, started: true })}>开始相伴问卷 <ArrowRight size={20} /></button><Link className="quiz-text-link" to="/catalog#catalog-list">也可以直接浏览档案 <ArrowUpRight size={15} /></Link></div><div className="quiz-intro-art"><span aria-hidden="true">相伴</span><PeekCompanion pet="terrier" reduced={reduced} /><p>从了解彼此的生活开始。</p></div></section>
      : !draft.complete ? <div className="quiz-workspace"><section className="quiz-question" aria-labelledby="quiz-question-title"><div className="quiz-progress-line"><span>相伴问卷 · 第 {draft.step + 1} / 10 题</span><span>{answered} 项已选择</span></div><progress max={10} value={answered} aria-label="问卷回答进度" /><form onSubmit={event => { event.preventDefault(); next() }}><h1 id="quiz-question-title" ref={heading} tabIndex={-1}>{question.title}</h1><p className="quiz-help">{question.help}</p><fieldset className="quiz-options"><legend className="sr-only">{question.title}</legend>{[...question.options, ['unknown','暂不确定']].map(([value, label]) => <label className={draft.answers[question.key] === value ? 'is-chosen' : ''} key={value}><input type="radio" name={question.key} value={value} checked={draft.answers[question.key] === value} onChange={() => setDraft({ ...draft, answers: { ...draft.answers, [question.key]: value } })} /><span>{label}</span><Check size={18} aria-hidden="true" /></label>)}</fieldset><div className="quiz-step-actions"><button type="button" className="quiz-back" onClick={() => draft.step ? setDraft({ ...draft, step: draft.step - 1 }) : setDraft({ ...draft, started: false })}><ArrowLeft size={17} />{draft.step ? '上一题' : '返回介绍'}</button><button className="quiz-primary" disabled={!draft.answers[question.key]}>{draft.step === 9 ? '看看相伴的可能' : '下一题'}<ArrowRight size={18} /></button></div><button type="button" className="quiz-skip" onClick={() => next(true)}>先跳过，之后再补充</button></form></section><aside className="quiz-outline" aria-label="问卷问题与已选答案"><h2>从你的生活出发。</h2><p>回头看一看，也可以随时修改。</p><ol>{quizQuestions.map((q, index) => <li key={q.key}><button aria-current={draft.step === index ? 'step' : undefined} onClick={() => edit(index)}><span>{q.short}</span>{draft.answers[q.key] && <Check size={15} />}<small>{answerLabel(q.key, draft.answers[q.key])}</small></button></li>)}</ol></aside></div>
      : <section className="quiz-results" aria-labelledby="quiz-results-title"><div className="quiz-result-heading"><div><h1 id="quiz-results-title" ref={heading} tabIndex={-1}>{result.blocked ? <>先为相伴，<br />准备一个家。</> : <>相伴的可能，<br />从这里开始。</>}</h1><p>依据你的期待和现有档案，找到值得进一步了解的伙伴。<br />实际相处与照护需要，仍要和工作人员一起确认。</p></div><button className="quiz-edit" onClick={() => edit(0)}>修改我的答案 <ArrowUpRight size={17} /></button></div><details className="quiz-answer-summary"><summary>查看我的 10 项选择</summary><div>{quizQuestions.map((q, index) => <button key={q.key} onClick={() => edit(index)}><span>{q.short}</span><strong>{answerLabel(q.key, draft.answers[q.key])}</strong><span>修改 <ArrowUpRight size={13} /></span></button>)}</div></details>
        {result.reminders.length > 0 && <details className="quiz-readiness" open={result.blocked || undefined}><summary>相伴之前，记得这 {result.reminders.length} 件事。</summary><ul>{result.reminders.map(reminder => <li key={reminder}>{reminder}</li>)}</ul></details>}
        {result.blocked ? <div className="quiz-empty"><h2>先确认住处允许养宠，再回来寻找伙伴。</h2><p>可以先浏览档案、了解照护需要，等条件准备好后再修改问卷。</p><Link to="/catalog#catalog-list">先认识一下它们 <ArrowRight size={18} /></Link></div>
        : loading ? <div className="quiz-load" role="status"><PawPrint size={28} />正在寻找等待新家的伙伴…</div>
        : error ? <div className="quiz-error" role="alert"><p>{error}</p><button className="quiz-primary" onClick={() => setRetry(value => value + 1)}>重新读取档案 <ArrowRight size={17} /></button></div>
        : <><div className="quiz-match-count" role="status">{result.items.length ? `先认识这 ${result.items.length} 位伙伴 · 当前有 ${result.available} 位伙伴可进一步了解` : '目前没有符合这些选择的待领养伙伴'}</div>{result.items.length ? <div className="quiz-result-grid">{result.items.map(({ animal, reasons, considerations }, index) => <article className="quiz-result-card" key={animal.animalID}><AnimalPhoto animal={animal} eager={index < 3} tone={index} /><h2>{animal.animalName}</h2><p className="quiz-animal-meta">{animal.species === 'Feline' ? '猫' : '犬'} · {animal.breed || '品种未填'} · {animal.age == null || animal.age === '' ? '年龄未填' : `${animal.age} 岁`} · {animal.size || '体型未填'}</p><h3>为什么先认识它</h3><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{considerations.length > 0 && <div className="quiz-considerations"><h3>还需要了解</h3><ul>{considerations.map(note => <li key={note}>{note}</li>)}</ul></div>}<div className="quiz-card-actions"><Link to={`/catalog/${animal.animalID}`}>查看完整档案 <ArrowUpRight size={16} /></Link><Link to={`/member/apply/${animal.animalID}`}>申请领养 <ArrowRight size={16} /></Link></div></article>)}</div> : <div className="quiz-empty"><p>可以修改种类与照护选择再看看，也可以浏览完整待领养名单。</p><button className="quiz-primary" onClick={() => edit(0)}>调整我的选择 <ArrowRight size={17} /></button></div>}</>}
        {!result.blocked && !loading && !error && <Link className="quiz-browse-all" to="/assistant" state={{answers:draft.answers,animalIDs:result.items.map(item=>item.animal.animalID)}}>结合我的选择，与相伴助手聊聊 <ArrowUpRight size={17}/></Link>}<Link className="quiz-browse-all" to="/catalog#catalog-list">继续浏览全部待领养伙伴 <ArrowRight size={18} /></Link>
      </section>}
    </main>
    <footer className="quiz-footer"><Link to="/guide">领养须知 <ArrowUpRight size={15}/></Link><p role="status">{canSave ? '进度保存在这台设备，稍后可以继续。' : '这台设备暂时无法保存进度，离开后需要重新填写。'}</p>{draft.started && <button onClick={clear}>清除本机问卷</button>}<Link to="/catalog">返回拾光守护 <ArrowUpRight size={15} /></Link></footer>
  </div>
}
