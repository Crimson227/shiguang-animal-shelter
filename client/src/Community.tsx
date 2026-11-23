import {useEffect,useRef,useState,type ChangeEvent,type FormEvent} from 'react'
import {Link,Route,Routes,useLocation,useNavigate,useParams} from 'react-router'
import {ArrowLeft,ArrowRight,ArrowUpRight,Heart,Bookmark,ChatCircle,Plus,Trash} from '@phosphor-icons/react'
import {api} from './lib/api'
import {useUnreadNotifications} from './lib/useNotifications'
import './PublicTypography.css'
import './Community.css'

export type CommunityRole='admin'|'member'|null
export const categoryNames:Record<string,string>={all:'全部讨论',diary:'领养日记',experience:'经验交流',help:'求助讨论',announcement:'官方公告'}
type Comment={commentID:number;body:string;parentID:number|null;createdAt:string;nickname:string;canDelete:boolean;authorRole:string}
type Post={postID:number;title:string;body:string;category:string;animalID:number|null;animalName:string|null;images:string[];nickname:string;createdAt:string;updatedAt:string;pinned:boolean;likeCount:number;commentCount:number;canEdit:boolean;canModerate:boolean;liked?:boolean;saved?:boolean;comments?:Comment[];status:string}
const date=(value:string)=>value?.slice(0,16).replace('T',' ')
function CommunityMessages(){
 const notice=useUnreadNotifications()
 return notice.role?<Link to={notice.role==='admin'?'/notifications':'/member?tab=notifications'}>消息{notice.count>0&&<span aria-label={`${notice.count}条未读消息`}>（{notice.count>99?'99+':notice.count}）</span>}</Link>:null
}
export function PublicHeader({active}:{active?:string}){return <header className="social-header"><Link className="social-brand" to="/catalog">拾光守护</Link><nav aria-label="领养服务"><Link to="/catalog#catalog-list">领养档案</Link><Link aria-current={active==='community'?'page':undefined} to="/community">相伴社区</Link><Link aria-current={active==='assistant'?'page':undefined} to="/assistant">相伴助手</Link><CommunityMessages/><Link to="/member">我的领养<ArrowUpRight size={15}/></Link></nav></header>}
export default function Community({role}:{role:CommunityRole}){const location=useLocation();useEffect(()=>{window.scrollTo(0,0)},[location.pathname]);return <div className="social-page"><a className="social-skip" href="#community-content">跳至社区内容</a><PublicHeader active="community"/><main id="community-content"><Routes><Route path="/community" element={<CommunityFeed role={role}/>}/><Route path="/community/new" element={<PostEditor key={location.pathname} role={role}/>}/><Route path="/community/:id/edit" element={<PostEditor key={location.pathname} role={role}/>}/><Route path="/community/:id" element={<PostDetail role={role}/>}/><Route path="*" element={<p>页面不存在。<Link to="/community">返回社区</Link></p>}/></Routes></main><footer className="social-footer"><span>把一次相遇，写成长久的相伴。</span><Link to="/guide">相伴手册<ArrowUpRight size={16}/></Link></footer></div>}
function CommunityProfile(){const [nickname,setNickname]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{api<{nickname:string}>('/api/community/profile').then(p=>setNickname(p.nickname)).catch(e=>setMessage(e.message))},[]);return <details className="social-profile"><summary>我的社区昵称</summary><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api('/api/community/profile',{method:'PUT',body:JSON.stringify({nickname})});setMessage('昵称已保存。')}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}}><label>公开昵称<input required minLength={2} maxLength={20} value={nickname} onChange={e=>setNickname(e.target.value)}/></label><button disabled={busy}>{busy?'保存中…':'保存昵称'}</button><p role="status">{message}</p><small>帖子与回复展示昵称，不展示账号联系方式。</small></form></details>}
function CommunityFeed({role}:{role:CommunityRole}){
 const [category,setCategory]=useState('all'),[view,setView]=useState('all'),[search,setSearch]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[data,setData]=useState<{items:Post[];pages:number;page:number;total:number}>({items:[],pages:1,page:1,total:0})
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');api<typeof data>(`/api/community/posts?category=${category}&view=${view}&q=${encodeURIComponent(q)}&page=${page}`,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setData(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[category,view,q,page,retry])
 return <><section className="community-intro"><div><h1>相伴之后，<br/>故事还在继续。</h1><p>分享一起生活的小事，也把困惑交给走过同一段路的人。</p></div><div className="community-intro-actions"><Link className="social-primary" to={role?'/community/new':'/member'}><Plus size={18}/>{role?'写一篇分享':'登录后分享'}</Link>{role==='member'&&<CommunityProfile/>}{role==='admin'&&<Link to="/community-admin">管理社区<ArrowRight size={16}/></Link>}</div></section>
 <div className="community-tools"><nav aria-label="讨论分类">{Object.entries(categoryNames).map(([key,label])=><button key={key} className={category===key?'active':''} aria-pressed={category===key} onClick={()=>{setCategory(key);setPage(1)}}>{label}</button>)}</nav><form role="search" onSubmit={e=>{e.preventDefault();setQ(search.trim());setPage(1)}}><label className="social-sr-only" htmlFor="community-search">搜索帖子</label><input id="community-search" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)} placeholder="搜索故事与问题"/><button>搜索</button></form></div>
 {role&&<nav className="community-views" aria-label="我的讨论">{[['all','全部'],['mine','我的发布'],['saved','我的收藏']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>{setView(key);setPage(1)}}>{label}</button>)}</nav>}
 {loading?<p role="status" className="social-state">正在翻开相伴的故事…</p>:error?<div className="social-state" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取</button></div>:data.items.length?<><div className="community-feed">{data.items.map(p=><article key={p.postID} className={p.images.length?'has-photo':''}><div className="community-post-copy"><div className="community-meta"><span>{categoryNames[p.category]}{p.pinned?' · 置顶':''}</span><span>{date(p.createdAt)}</span></div><h2><Link to={`/community/${p.postID}`}>{p.title}<ArrowUpRight size={21}/></Link></h2><p>{p.body.slice(0,150)}{p.body.length>150?'…':''}</p><div className="community-meta"><span>{p.nickname}{p.animalName?` · 与${p.animalName}的生活`:''}</span><span><Heart size={15}/>{p.likeCount}<ChatCircle size={15}/>{p.commentCount}</span></div></div>{p.images[0]&&<Link className="community-feed-photo" to={`/community/${p.postID}`} aria-label={`阅读：${p.title}`}><img src={p.images[0]} loading="lazy" alt="分享中的生活照片"/></Link>}</article>)}</div><nav className="social-pagination" aria-label="社区分页"><button disabled={data.page<=1} onClick={()=>setPage(data.page-1)}>上一页</button><span>{data.page} / {data.pages}</span><button disabled={data.page>=data.pages} onClick={()=>setPage(data.page+1)}>下一页</button></nav></>:<section className="social-state"><h2>{q?'还没有找到相关讨论。':view==='saved'?'还没有收藏的故事。':view==='mine'?'把你的第一篇故事留在这里。':'这里，等着第一个相伴的故事。'}</h2><p>{q?'试试其他关键词，或发帖说说你的问题。':'可以分享近况、交流经验，也可以认真问一个问题。'}</p><Link to={role?'/community/new':'/member'}>写下我的故事<ArrowRight size={18}/></Link></section>}
 </>
}
function PostEditor({role}:{role:CommunityRole}){
 const {id}=useParams(),navigate=useNavigate()
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[category,setCategory]=useState('diary'),[animalID,setAnimalID]=useState('')
 const [images,setImages]=useState<string[]>([]),[selected,setSelected]=useState<{file:File;url:string}[]>([])
 const [animals,setAnimals]=useState<{animalID:number;animalName:string}[]>([]),[loading,setLoading]=useState(!!id)
 const [originalLoaded,setOriginalLoaded]=useState(!id),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false)
 const [error,setError]=useState(''),[retry,setRetry]=useState(0)
 const previews=useRef(new Set<string>()),request=useRef<AbortController|null>(null)
 useEffect(()=>{
  const urls=previews.current
  return ()=>{request.current?.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear()}
 },[])
 useEffect(()=>{const c=new AbortController();if(role)api<typeof animals>('/api/community/my-animals',{signal:c.signal}).then(setAnimals).catch(()=>{});if(id){setLoading(true);setOriginalLoaded(false);setError('');api<Post>(`/api/community/posts/${id}`,{signal:c.signal}).then(p=>{if(!p.canEdit)throw new Error('只能编辑自己的帖子');setTitle(p.title);setBody(p.body);setCategory(p.category);setAnimalID(p.animalID?String(p.animalID):'');setImages(p.images);setOriginalLoaded(true)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})}return()=>c.abort()},[id,role,retry])

 const removePreview=(url:string)=>{
  if(previews.current.delete(url)){
   URL.revokeObjectURL(url)
   setSelected(old=>old.filter(photo=>photo.url!==url))
  }else setImages(old=>old.filter(image=>image!==url))
 }
 const photoCount=images.length+selected.length
 const selectPhotos=(event:ChangeEvent<HTMLInputElement>)=>{
  const files=Array.from(event.target.files||[])
  event.target.value=''
  if(photoCount+files.length>4){setError('每篇最多4张图片');return}
  if(files.some(file=>file.size>5*1024*1024)){setError('单张图片不能超过5MB');return}
  const photos=files.map(file=>{
   const url=URL.createObjectURL(file)
   previews.current.add(url)
   return {file,url}
  })
  setSelected(old=>[...old,...photos])
  setError('')
 }
 const submit=async(event:FormEvent)=>{
  event.preventDefault()
  if(request.current)return
  const controller=new AbortController()
  request.current=controller
  const {signal}=controller
  setBusy(true);setUploading(selected.length>0);setError('')
  try{
   const attachments=[...images]
   for(const {file} of selected){
    const {url}=await api<{url:string}>('/api/community/photos',{method:'POST',headers:{'Content-Type':file.type},body:file,signal})
    attachments.push(url)
   }
   signal.throwIfAborted()
   setUploading(false)
   const post=await api<{postID:number}>(id?`/api/community/posts/${id}`:'/api/community/posts',{
    method:id?'PUT':'POST',body:JSON.stringify({title,body,category,animalID:animalID?Number(animalID):null,images:attachments}),signal
   })
   navigate(`/community/${id||post.postID}`)
  }catch(err){if(!signal.aborted)setError((err as Error).message)}
  finally{
   request.current=null
   if(!signal.aborted){setBusy(false);setUploading(false)}
  }
 }

 if(!role)return <section className="social-state"><h1>登录后，分享你的故事。</h1><Link to="/member">登录领养人账号<ArrowRight size={18}/></Link></section>
 if(loading)return <p role="status">正在读取原稿…</p>
 if(id&&!originalLoaded)return <section className="social-state" role="alert"><h1>暂时无法读取原稿。</h1><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取原稿</button><Link className="social-back" to={`/community/${id}`}>返回讨论</Link></section>
 return <section className="post-editor">
  <Link className="social-back" to={id?`/community/${id}`:'/community'}><ArrowLeft size={17}/>返回讨论</Link>
  <h1>{id?'再写得完整一点。':'把相伴，写成故事。'}</h1>
  <p>分享真实经历，尊重彼此；不要发布他人的联系方式或私人资料。</p>
  <form onSubmit={submit}>
   <div className="social-fields">
    <label>讨论分类<select disabled={busy} value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categoryNames).filter(([key])=>key!=='all'&&(key!=='announcement'||role==='admin')).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <label>关联已领养伙伴（可选）<select disabled={busy} value={animalID} onChange={e=>setAnimalID(e.target.value)}><option value="">不关联动物</option>{animals.map(a=><option key={a.animalID} value={a.animalID}>{a.animalName}</option>)}</select></label>
   </div>
   <label>标题<input disabled={busy} required minLength={2} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="今天，想分享什么？"/></label>
   <label>正文<textarea disabled={busy} required minLength={5} maxLength={6000} rows={12} value={body} onChange={e=>setBody(e.target.value)} placeholder="记录一次进步、一点经验，或把你的疑问说清楚。"/></label>
   <div className="post-photo-tools">
    <label>生活照片（最多4张，每张5MB）<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||photoCount>=4} onChange={selectPhotos}/></label>
    {uploading&&<p role="status">正在上传照片…</p>}
    <div className="post-photo-previews">{[...images,...selected.map(photo=>photo.url)].map((url,i)=>
     <figure key={url}><img src={url} alt={`分享照片${i+1}`}/><button type="button" disabled={busy} aria-label={`移除照片${i+1}`} onClick={()=>removePreview(url)}><Trash size={15}/>移除</button></figure>)}</div>
   </div>
   {error&&<p role="alert" className="social-error">{error}</p>}
   <div className="social-form-actions">
    <button className="social-primary" disabled={busy}>{busy?'正在保存…':id?'保存修改':'发布分享'}<ArrowRight size={18}/></button>
    <Link to="/community">取消</Link>
    {id&&error&&<button type="button" onClick={()=>{for(const photo of selected)removePreview(photo.url);setRetry(n=>n+1)}}>重读原稿</button>}
   </div>
  </form>
 </section>
}

type ReportTarget={type:'post'|'comment';id:number}
function ReportForm({target,onClose}:{target:ReportTarget;onClose:(submitted:boolean)=>void}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const field=useRef<HTMLTextAreaElement>(null)
 useEffect(()=>{field.current?.focus()},[])
 const submit=async(event:FormEvent)=>{
  event.preventDefault()
  setBusy(true);setError('')
  try{
   await api('/api/community/reports',{method:'POST',body:JSON.stringify({targetType:target.type,targetID:target.id,reason})})
   onClose(true)
  }catch(err){setError((err as Error).message)}
  finally{setBusy(false)}
 }
 return <form className="social-report" aria-label={target.type==='post'?'举报帖子':'举报评论'} onSubmit={submit}>
  <label>举报原因<textarea ref={field} required minLength={2} maxLength={300} value={reason} onChange={event=>setReason(event.target.value)} rows={3}/></label>
  <button type="submit" disabled={busy}>{busy?'提交中…':'提交举报'}</button>
  <button type="button" disabled={busy} onClick={()=>onClose(false)}>取消</button>
  {error&&<p role="alert">{error}</p>}
 </form>
}

type PostWithComments=Post&{comments:Comment[];commentsPage:number;commentPages:number;commentUnavailable:boolean}

function PostDetail({role}:{role:CommunityRole}){
 const location=useLocation()
 const {id}=useParams(),navigate=useNavigate(),[post,setPost]=useState<PostWithComments|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[reply,setReply]=useState(''),[parent,setParent]=useState<Comment|null>(null),[message,setMessage]=useState('')
 const [loadedRoute,setLoadedRoute]=useState('')
 const [report,setReport]=useState<ReportTarget|null>(null)
 const reportTrigger=useRef<HTMLButtonElement|null>(null)
 const openReport=(target:ReportTarget,trigger:HTMLButtonElement)=>{reportTrigger.current=trigger;setMessage('');setReport(target)}
 const closeReport=(submitted:boolean)=>{
  setReport(null)
  if(submitted)setMessage('举报已提交，工作人员会进行核对。')
  reportTrigger.current?.focus()
 }

 const targetID=location.hash.match(/^#comment-(\d+)$/)?.[1]
 const page=new URLSearchParams(location.search).get('commentsPage')
 const detailRoute=`/api/community/posts/${id}?${new URLSearchParams({
  ...(page?{commentsPage:page}:{}),...(targetID?{commentID:targetID}:{})
 })}`
 useEffect(()=>{
  const controller=new AbortController()
  setLoading(true);setError('')
  api<PostWithComments>(detailRoute,{signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted){setPost(result);setLoadedRoute(detailRoute)}})
   .catch(e=>{if(!controller.signal.aborted){setPost(null);setError(e.message);setLoadedRoute(detailRoute)}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[detailRoute,retry])
 useEffect(()=>{
  if(!post||loadedRoute!==detailRoute||loading)return
  const target=post.commentUnavailable?'comment-unavailable':targetID?`comment-${targetID}`:location.hash==='#post-comments'?'post-comments':null
  if(!target)return
  const element=document.getElementById(target)
  element?.scrollIntoView({block:targetID?'center':'start'})
  element?.focus({preventScroll:true})
 },[post,detailRoute,loadedRoute,loading,location.hash,targetID])
 async function action(work:()=>Promise<unknown>,success=''){setBusy(true);setError('');try{await work();if(success)setMessage(success);setRetry(n=>n+1);return true}catch(err){setError((err as Error).message);return false}finally{setBusy(false)}}
 if(loading||loadedRoute!==detailRoute)return <p role="status" className="social-state">正在翻开故事…</p>
 if(!post)return <div role="alert" className="social-state"><p>{error||'帖子暂不可见'}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取</button><Link to="/community">返回社区</Link></div>
 const reportingPost=report?.type==='post'&&report.id===post.postID
 return <article className="post-detail"><Link className="social-back" to="/community"><ArrowLeft size={17}/>回到相伴社区</Link><div className="community-meta"><span>{categoryNames[post.category]}{post.pinned?' · 置顶':''}</span><span>{date(post.createdAt)}</span></div><h1>{post.title}</h1><p className="post-byline">{post.nickname}{post.animalName?` · 与${post.animalName}的生活`:''}{post.status!=='published'?' · 当前已撤下':''}</p><div className="post-body">{post.body}</div>{post.images.length>0&&<div className="post-gallery">{post.images.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`查看完整照片${i+1}`}><img src={url} alt={`分享中的生活照片${i+1}`} loading="lazy"/></a>)}</div>}
 <div className="post-actions">{role?<><button disabled={busy} aria-pressed={post.liked} onClick={()=>void action(()=>api(`/api/community/posts/${id}/reactions`,{method:'POST',body:JSON.stringify({kind:'like',active:!post.liked})}))}><Heart size={19} weight={post.liked?'fill':'regular'}/>{post.likeCount} 赞同</button><button disabled={busy} aria-pressed={post.saved} onClick={()=>void action(()=>api(`/api/community/posts/${id}/reactions`,{method:'POST',body:JSON.stringify({kind:'save',active:!post.saved})}))}><Bookmark size={19} weight={post.saved?'fill':'regular'}/>{post.saved?'已收藏':'收藏'}</button></>:<Link to="/member">登录后点赞与回复<ArrowRight size={16}/></Link>}{post.category==='help'&&<Link to={`/assistant?post=${post.postID}`}>请AI帮我梳理<ArrowUpRight size={16}/></Link>}{post.canEdit&&<><Link to={`/community/${id}/edit`}>编辑</Link><button disabled={busy} onClick={async()=>{if(await action(()=>api(`/api/community/posts/${id}`,{method:'DELETE'})))navigate('/community')}}>撤下帖子</button></>}{role==='member'&&<button type="button" aria-expanded={reportingPost} onClick={event=>openReport({type:'post',id:post.postID},event.currentTarget)}>举报帖子</button>}{role==='admin'&&<Link to="/community-admin">管理此讨论</Link>}</div>
 {role==='member'&&reportingPost&&report&&<ReportForm target={report} onClose={closeReport}/>}
 {message&&<p role="status">{message}</p>}{error&&<p className="social-error" role="alert">{error}</p>}
 <section className="post-comments" id="post-comments" tabIndex={-1} aria-labelledby="post-comments-title">
 <h2 id="post-comments-title">一起聊聊 <span>{post.commentCount}</span></h2>
 <p>经验来自每个人的实际经历，健康与用药问题请咨询兽医。</p>
 {post.commentUnavailable&&<p id="comment-unavailable" role="status" tabIndex={-1}>这条回复当前不可见，下面是仍可查看的回复。</p>}
 {post.comments.length?post.comments.map(c=><article key={c.commentID} id={`comment-${c.commentID}`} tabIndex={-1}><div className="community-meta"><strong>{c.nickname}</strong><time>{date(c.createdAt)}</time></div>{c.parentID&&<small>回复 #{c.parentID}</small>}<p>{c.body}</p><div className="comment-actions">{role&&<button onClick={()=>{setParent(c);document.getElementById('comment-body')?.focus()}}>回复</button>}{c.canDelete&&role!=='admin'&&<button disabled={busy} onClick={()=>void action(()=>api(`/api/community/comments/${c.commentID}`,{method:'DELETE'}),'回复已撤下。')}>撤下</button>}{role==='member'&&<button type="button" aria-expanded={report?.type==='comment'&&report.id===c.commentID} onClick={event=>openReport({type:'comment',id:c.commentID},event.currentTarget)}>举报评论</button>}{role==='admin'&&<Link to="/community-admin">管理回复</Link>}</div>{role==='member'&&report?.type==='comment'&&report.id===c.commentID&&<ReportForm target={report} onClose={closeReport}/>}</article>):<p>还没有回复。你的经验，可能正好能帮到它。</p>}
 {post.commentPages>1&&<nav className="social-pagination" aria-label="回复分页">
  {post.commentsPage>1&&<Link to={`?commentsPage=${post.commentsPage-1}#post-comments`}>上一页</Link>}
  <span>第 {post.commentsPage} / {post.commentPages} 页</span>
  {post.commentsPage<post.commentPages&&<Link to={`?commentsPage=${post.commentsPage+1}#post-comments`}>下一页</Link>}
 </nav>}
 {role?<form className="comment-form" onSubmit={async e=>{
  e.preventDefault()
  if(await action(async()=>{
   const {commentID}=await api<{commentID:number}>(`/api/community/posts/${id}/comments`,{method:'POST',body:JSON.stringify({body:reply,parentID:parent?.commentID})})
   navigate(`/community/${id}#comment-${commentID}`,{replace:true})
  },'回复已发布。')){setReply('');setParent(null)}
 }}>{parent&&<div>正在回复 {parent.nickname}<button type="button" onClick={()=>setParent(null)}>取消回复</button></div>}<label htmlFor="comment-body">写下你的经验或建议</label><textarea id="comment-body" rows={4} maxLength={2000} required value={reply} onChange={e=>setReply(e.target.value)}/><button className="social-primary" disabled={busy}>{busy?'发送中…':'发布回复'}<ArrowRight size={17}/></button></form>:<Link to="/member">登录后参与讨论<ArrowRight size={16}/></Link>}</section></article>
}
