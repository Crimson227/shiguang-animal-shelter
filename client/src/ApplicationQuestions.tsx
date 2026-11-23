import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { api } from './lib/api'
import { readQuizDraft } from './lib/matchQuiz'
import { applicationQuestions, emptyApplicationAnswers, encodeApplication, importQuizAnswers, sanitizeApplicationAnswers, validApplication } from './lib/applicationQuestions'
import ApplicationAnswers from './ApplicationAnswers'
import './ApplicationQuestions.css'

export default function ApplicationQuestions({animalID, memberID, onDone}: {animalID:number;memberID:number;onDone:()=>Promise<void>}) {
  const storageKey = `shiguang-application-v1-${memberID}-${animalID}`
  const [answers,setAnswers] = useState(() => {
    try { return sanitizeApplicationAnswers(JSON.parse(sessionStorage.getItem(storageKey)||'null')) } catch { return emptyApplicationAnswers() }
  })
  const [preview,setPreview] = useState(false), [busy,setBusy] = useState(false), [sent,setSent] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState(''), [saved,setSaved] = useState(true)
  const [quiz] = useState(readQuizDraft)
  const heading = useRef<HTMLHeadingElement>(null), submitting = useRef(false), completed = useRef(false)
  const note = encodeApplication(answers), valid = validApplication(answers)
  useEffect(() => {
    if (completed.current) return
    try { sessionStorage.setItem(storageKey,JSON.stringify(answers)); setSaved(true) } catch { setSaved(false) }
  },[answers,storageKey])
  useEffect(() => { if (preview) heading.current?.focus() },[preview])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!preview || !valid || submitting.current || completed.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      await api('/api/member/applications',{method:'POST',body:JSON.stringify({animalID,applicationNote:note})})
      completed.current = true
      setSent(true)
      try { sessionStorage.removeItem(storageKey) } catch { /* Submission is already saved by the server. */ }
      await onDone()
    } catch (e) { setError((e as Error).message) }
    finally { submitting.current = false; setBusy(false) }
  }
  const edit = () => { setPreview(false); setError(''); requestAnimationFrame(() => document.getElementById('application-home')?.focus()) }
  if (sent) return <section className="application-questionnaire" role="status"><h2>申请已提交。</h2><p>工作人员会在审核后通知你。</p><Link className="button primary" to="/member">查看我的申请 <ArrowRight size={17}/></Link></section>
  return <section className="application-questionnaire" aria-label="分题领养申请">
    <div className="application-introduction"><h2>把未来的生活，<br/>说给我们听。</h2><p>前六项请各写至少 5 个字。申请提交后，工作人员会与你进一步沟通。</p><p className="application-storage" role="status">{saved ? '未提交的内容仅暂存在当前浏览器标签页，提交成功后清除。共用设备请在离开前清空草稿。' : '当前浏览器无法暂存草稿，请在离开前完成提交。'}</p></div>
    {!preview ? <><div className="application-import">{Object.keys(quiz.answers).length ? <><p>你已填写相伴问卷，可以带入已有的生活安排，再逐项补充。</p><button type="button" className="button secondary" onClick={()=>{setAnswers(current=>importQuizAnswers(current,quiz.answers));setNotice('已将问卷中明确的选择带入空白项。请补充具体安排；原有文字已保留。')}}>带入问卷答案 <ArrowUpRight size={17}/></button></> : <p>还没有相伴问卷？<Link to="/match">先梳理我的生活与期待 <ArrowUpRight size={15}/></Link>，也可以直接填写下方申请。</p>}{notice&&<p role="status">{notice}</p>}<Link className="application-guide-link" to={`/guide?animal=${animalID}&from=apply#prepare`}>填写前，看看领养须知 <ArrowUpRight size={16}/></Link></div>
    <form onSubmit={e=>{e.preventDefault();if(valid){setPreview(true);setError('')}}}>
      {applicationQuestions.map((q,index)=><div className="application-question" key={q.key}><div className="application-question-heading"><span aria-hidden="true">{index+1}</span><label htmlFor={`application-${q.key}`}>{q.title}{q.key==='extra'&&<small>（选填）</small>}</label></div><p id={`help-${q.key}`}>{q.help}</p><textarea id={`application-${q.key}`} aria-describedby={`help-${q.key} count-${q.key}`} required={q.key!=='extra'} minLength={q.key==='extra'?undefined:5} maxLength={q.max} rows={3} value={answers[q.key]} onChange={e=>setAnswers({...answers,[q.key]:e.target.value})}/><small id={`count-${q.key}`} className="application-count">{answers[q.key].length} / {q.max} 字</small></div>)}
      {note.length>1000&&<p role="alert">内容较长，请精简部分文字后再预览。</p>}<div className="application-form-actions"><button className="button primary" disabled={!valid}>预览我的申请 <ArrowRight size={18}/></button><button type="button" className="flow-text-button" onClick={()=>{if(window.confirm('清空当前标签页中这只动物的未提交申请？')){setAnswers(emptyApplicationAnswers());setNotice('草稿已清空。')}}}>清空草稿</button></div>
    </form></> : <form onSubmit={submit} aria-busy={busy}><div className="application-preview-heading"><h2 ref={heading} tabIndex={-1}>最后，认真看一遍。</h2><p>确认这些是你目前真实的安排。提交后可在“我的申请”查看进度。</p></div><ApplicationAnswers note={note}/>{error&&<div className="flow-error" role="alert">{error}</div>}<div className="application-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={edit}><ArrowLeft size={17}/>返回修改</button><button className="button primary" disabled={busy||!valid}>{busy?'正在提交…':'确认并提交申请'} <ArrowRight size={18}/></button></div></form>}
  </section>
}
