import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {Link,useLocation,useSearchParams} from 'react-router'
import {ArrowRight,ArrowUpRight,Stop,Trash} from '@phosphor-icons/react'
import {api,notifySessionExpired} from './lib/api'
import {PublicHeader,type CommunityRole} from './Community'
import {answerLabel,quizQuestions,type QuizAnswers} from './lib/matchQuiz'
import './Community.css'
import './AssistantConversation.css'
import {shouldSubmitMessage} from './lib/assistantInput'
type Source={title:string;url:string}
type Message={role:'user'|'assistant';content:string;sources?:Source[];failed?:boolean}
export default function CompanionAssistant({role,actorKey,onAccountCheck}:{role:CommunityRole;actorKey:string|null;onAccountCheck:(mismatch?:boolean)=>void}){
 const [params]=useSearchParams(),location=useLocation(),state=location.state as {answers?:QuizAnswers;animalIDs?:number[]}|null
 const rawIDs=(params.get('animals')||'').split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,6),animalIDs=state?.animalIDs||rawIDs,postID=Number(params.get('post'))||null
 const [configured,setConfigured]=useState<boolean|null>(null),[statusError,setStatusError]=useState(''),[context,setContext]=useState<{animals:{animalID:number;animalName:string}[];post:{title:string}|null}>({animals:[],post:null}),[useQuiz,setUseQuiz]=useState(false),[messages,setMessages]=useState<Message[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const controller=useRef<AbortController|null>(null),inputRef=useRef<HTMLTextAreaElement>(null),composeRef=useRef<HTMLFormElement>(null),scrollRef=useRef<HTMLDivElement>(null)
 const [viewportHeight,setViewportHeight]=useState(()=>window.visualViewport?.height||window.innerHeight)
 const [following,setFollowing]=useState(true),[compact,setCompact]=useState(()=>window.matchMedia('(max-width:600px)').matches)
 useEffect(()=>{const media=window.matchMedia('(max-width:600px)'),sync=()=>setCompact(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[])
 useEffect(()=>{const view=window.visualViewport,measure=()=>setViewportHeight(view&&view.scale===1?view.height:window.innerHeight);measure();view?.addEventListener('resize',measure);window.addEventListener('resize',measure);return()=>{view?.removeEventListener('resize',measure);window.removeEventListener('resize',measure)}},[])
 useLayoutEffect(()=>{const input=inputRef.current;if(input){input.style.height='auto';input.style.height=`${Math.min(viewportHeight<450?48:viewportHeight<600?64:compact?96:120,input.scrollHeight)}px`}},[question,compact,configured,role,viewportHeight])
 useLayoutEffect(()=>{const scroll=scrollRef.current;if(scroll&&following)scroll.scrollTop=scroll.scrollHeight},[messages,following,question,viewportHeight])
 function focusInput(){inputRef.current?.focus({preventScroll:true})}
 const idString=animalIDs.join(',')
 useEffect(()=>{const c=new AbortController();setConfigured(null);setStatusError('');api<{configured:boolean}>('/api/ai/status',{signal:c.signal}).then(d=>setConfigured(d.configured)).catch(e=>{if(!c.signal.aborted)setStatusError(e.message)});api<{animalID:number;animalName:string}[]>('/api/catalog',{signal:c.signal}).then(rows=>{if(!c.signal.aborted)setContext(old=>({...old,animals:rows.filter(a=>animalIDs.includes(a.animalID))}))}).catch(()=>{});if(postID)api<{title:string}>(`/api/community/posts/${postID}`,{signal:c.signal}).then(post=>setContext(old=>({...old,post}))).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[idString,postID,retry])
 useEffect(()=>{window.scrollTo(0,0)},[]);
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{
  const check=()=>{if(document.visibilityState==='visible')onAccountCheck()}
  window.addEventListener('focus',check)
  document.addEventListener('visibilitychange',check)
  return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}
 },[onAccountCheck])
 async function send(e:React.FormEvent){
  e.preventDefault();if(busy||!actorKey||!question.trim())return;const prompt=question.trim(),history=messages.filter(m=>!m.failed&&m.content).slice(-8).map(({role,content})=>({role,content:content.slice(0,2000)}));
  setMessages(old=>[...old,{role:'user',content:prompt},{role:'assistant',content:'',sources:[]}]);setQuestion('');setBusy(true);setError('');setFollowing(true);focusInput();const c=new AbortController();controller.current=c;let completed=false;
  function update(patch:Partial<Message>){setMessages(old=>old.map((m,i)=>i===old.length-1?{...m,...patch}:m))}
  try{
   const response=await fetch('/api/ai/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Shelter-Account':actorKey},body:JSON.stringify({message:prompt,history,animalIDs,postID,answers:useQuiz?state?.answers:undefined}),signal:c.signal})
   notifySessionExpired(response.status,'/api/ai/chat')
   if(!response.ok){
    const result=await response.json()
    if(result.code==='session_changed')onAccountCheck(true)
    throw new Error(result.error||'咨询暂时不可用')
   }
   if(!response.body)throw new Error('没有收到回答，请重试。')
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='';
   for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line)continue;const event=JSON.parse(line);if(event.type==='sources')update({sources:event.sources});else if(event.type==='delta'){text+=event.text;update({content:text})}else if(event.type==='error')throw new Error(event.error);else if(event.type==='done')completed=true}}
   if(!completed)throw new Error('回答传输中断，可重新提问。');
  }catch(err){update({failed:true});setError(c.signal.aborted?'已停止生成，未完成内容请勿作为结论。':(err as Error).message)}finally{setBusy(false);controller.current=null;if(inputRef.current&&(document.activeElement===document.body||composeRef.current?.contains(document.activeElement))&&window.getSelection()?.isCollapsed!==false)focusInput()}
 }
 return <div className="social-page assistant-page" data-short-viewport={viewportHeight<600} data-tight-viewport={viewportHeight<450} style={{height:viewportHeight,'--assistant-viewport-height':`${viewportHeight}px`} as React.CSSProperties}><PublicHeader active="assistant"/><main><section className="assistant-intro"><div><h1>关于相伴，<br/>再多了解一点。</h1><p>从眼前这只伙伴，到接它回家后的生活，把想问的慢慢说清楚。</p></div><p className="assistant-boundary">AI建议仅供参考，领养由工作人员审核；健康问题请咨询兽医。</p></section><div className="assistant-layout"><details className="assistant-context" open={!compact}><summary>本次参考资料</summary><div className="assistant-context-content">{context.animals.length?<ul>{context.animals.map(a=><li key={a.animalID}><Link to={`/catalog/${a.animalID}`}>{a.animalName}<ArrowUpRight size={15}/></Link></li>)}</ul>:<p>领养准备与相伴手册</p>}{context.post&&<p>求助讨论：<Link to={`/community/${postID}`}>{context.post.title}</Link></p>}{state?.answers&&<><label className="assistant-quiz-toggle"><input type="checkbox" checked={useQuiz} onChange={e=>setUseQuiz(e.target.checked)} disabled={busy}/>本次咨询使用我的问卷选择</label><details><summary>查看将使用的问卷内容</summary><dl>{quizQuestions.map(q=>state.answers?.[q.key]&&<div key={q.key}><dt>{q.short}</dt><dd>{answerLabel(q.key,state.answers[q.key])}</dd></div>)}</dl></details></>}<Link to="/guide">先读相伴手册<ArrowUpRight size={15}/></Link><Link to="/community">听听领养人的经验<ArrowUpRight size={15}/></Link><small>每小时最多10次咨询。</small></div></details><section className="assistant-conversation" aria-label="与相伴助手的对话">{configured&&role&&<div className="assistant-toolbar"><span role="status">{busy?'正在回答，你可以先写下一条':'相伴助手 · AI'}</span><div>{!following&&messages.length>0&&<button type="button" onClick={()=>setFollowing(true)}>回到最新</button>}<button type="button" aria-label="清空对话" disabled={busy||!messages.length} onClick={()=>{setMessages([]);setError('');setFollowing(true);focusInput()}}><Trash size={15}/>清空对话</button></div></div>}<div className="assistant-scroll" role="region" aria-label="对话记录" tabIndex={0} ref={scrollRef} onScroll={e=>{const el=e.currentTarget;setFollowing(el.scrollHeight-el.scrollTop-el.clientHeight<80)}}>{configured===null?(statusError?<div className="assistant-unavailable" role="alert"><h2>暂时无法连接相伴助手。</h2><p>{statusError}</p><button onClick={()=>setRetry(n=>n+1)}>重新检查</button>{!role&&<Link className="social-back" to="/member">登录领养人账号</Link>}</div>:<p role="status">正在检查相伴助手…</p>):!configured?<div className="assistant-unavailable"><h2>相伴助手还在准备中。</h2><p>模型服务尚未配置，暂时不能生成回答。可以先阅读手册，或到社区交流。</p><button onClick={()=>setRetry(n=>n+1)}>重新检查</button></div>:!role?<div className="assistant-unavailable"><h2>登录后，继续这次咨询。</h2><p>使用你的领养人账号，即可向助手提问。</p><Link className="social-primary" to="/member">登录领养人账号<ArrowRight size={18}/></Link></div>:null}
 {messages.length===0&&configured&&role&&<div className="assistant-starters"><h2>不妨从一个具体问题开始。</h2>{[context.post?'帮我梳理这篇求助帖的问题，还缺哪些信息？':context.animals.length?'结合这些档案，领养前有哪些需要逐只确认的问题？':'第一次领养，需要提前准备哪些事情？','接回家后的第一周，应该怎样安排？',state?.answers?'结合我选择使用的问卷和动物档案，解释适合与需要考虑的地方。':'如何和家人一起做好长期照护安排？'].map(text=><button key={text} onClick={()=>{setQuestion(text);requestAnimationFrame(focusInput)}}>{text}<ArrowRight size={17}/></button>)}</div>}
 <div className="assistant-messages" aria-busy={busy}>{messages.map((m,i)=><article key={i} className={`assistant-message ${m.role}`}><h2>{m.role==='user'?'你':'相伴助手 · AI'}</h2>{m.content?<p>{m.content}</p>:<p role="status">{m.failed?'这次没有生成完整回答。':'正在结合资料整理回答…'}</p>}{m.failed&&<small>这次回答未完成。</small>}{m.role==='assistant'&&m.sources?.length? <details><summary>本次提供给助手的参考资料</summary>{m.sources.map(s=><Link key={s.url} to={s.url}>{s.title}<ArrowUpRight size={14}/></Link>)}</details>:null}</article>)}</div>
 {error&&<p role="alert" className="social-error">{error}</p>}</div>{configured&&role&&<form className="assistant-compose" ref={composeRef} onSubmit={send}><label className="social-sr-only" htmlFor="assistant-question">想问助手什么？</label><div className="assistant-input-shell"><textarea ref={inputRef} id="assistant-question" rows={1} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(shouldSubmitMessage({key:e.key,shiftKey:e.shiftKey,isComposing:e.nativeEvent.isComposing,keyCode:e.nativeEvent.keyCode})){e.preventDefault();if(!busy&&question.trim())e.currentTarget.form?.requestSubmit()}}} aria-describedby="assistant-keyboard-hint" required placeholder="继续聊聊你的想法…"/><div className="assistant-input-actions"><span>{question.length} / 2000</span><div>{busy&&<button type="button" onClick={()=>controller.current?.abort()}><Stop size={16}/>停止生成</button>}<button className="social-primary" disabled={busy||!question.trim()}>发送<ArrowRight size={17}/></button></div></div></div><small id="assistant-keyboard-hint" className="assistant-keyboard-hint">{compact?'输入后点击发送，可随时继续追问。':'Enter 发送，Shift＋Enter 换行。'}</small></form>}

 </section></div></main></div>
}
