import { useEffect, useState } from 'react'
import { api } from './lib/api'
import './ApplicationTimeline.css'
import ApplicationAnswers from './ApplicationAnswers'

type Event={eventID:number;actorRole:'admin'|'member';eventType:string;note:string|null;createdAt:string}
const names:Record<string,string>={submitted:'提交申请',approved:'审核通过',rejected:'审核未通过',withdrawn:'申请撤回',cancelled:'领养取消',scheduled:'办理安排',completed:'完成领养',followup:'领养回访'}
export default function ApplicationTimeline({applicationID,role='member'}:{applicationID:number;role?:'member'|'admin'}){
  const [open,setOpen]=useState(false),[events,setEvents]=useState<Event[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0)
  useEffect(()=>{
    if(!open)return
    const controller=new AbortController()
    setLoading(true);setError('');setEvents([])
    api<Event[]>(`/api/${role}/applications/${applicationID}/events`,{signal:controller.signal})
      .then(rows=>{if(!controller.signal.aborted)setEvents(rows)})
      .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[open,applicationID,role,retry])
  return <div className="application-timeline"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起进度':'查看完整进度'}</button>{open&&<div className="application-timeline-list">{loading?<p role="status">正在读取进度…</p>:error?<div><p role="alert">{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>重新读取进度</button></div>:events.length?events.map(item=><article key={item.eventID}><span>{names[item.eventType]||item.eventType}{item.eventType==='cancelled'&&(item.actorRole==='admin'?' · 工作人员':' · 申请人')}</span><time>{String(item.createdAt).replace('T',' ').slice(0,16)}</time>{item.note&&(item.eventType==='submitted'?<ApplicationAnswers note={item.note}/>:<p>{item.note}</p>)}</article>):<p>暂时没有进度记录。</p>}</div>}</div>
}
