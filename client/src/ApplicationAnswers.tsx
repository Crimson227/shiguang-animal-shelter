import { applicationQuestions, decodeApplication } from './lib/applicationQuestions'
import './ApplicationQuestions.css'

export default function ApplicationAnswers({note}: {note:string}) {
  const answers = decodeApplication(note)
  if (!answers) return <p className="application-legacy-note">{note}</p>
  return <dl className="application-answers">{applicationQuestions.map(q => <div key={q.key}><dt>{q.title}</dt><dd>{answers[q.key] || '未补充'}</dd></div>)}</dl>
}
