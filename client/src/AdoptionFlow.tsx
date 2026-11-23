import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, Heart, PawPrint, SignOut, X } from '@phosphor-icons/react'
import { api } from './lib/api'
import { localDate } from './lib/localDate'
import { isContactPhone, contactPhoneHint } from './lib/contactPhone'
import { useNotificationInbox, type Notification } from './lib/useNotifications'
import { NotificationFilter, NotificationPager } from './NotificationControls'
import './AdoptionFlow.css'
import './PublicTypography.css'
import './MemberEditorial.css'
import ApplicationTimeline from './ApplicationTimeline'
import ApplicationQuestions from './ApplicationQuestions'
import ApplicationAnswers from './ApplicationAnswers'
import { useAccessibleDialog } from './lib/useAccessibleDialog'

export type ShelterSession = { authenticated: boolean; role: 'admin' | 'member' | null; admin: { id: number; username: string } | null; member: { id: number; patronID: number; name: string; email: string; mustChangePassword?: boolean; temporaryPasswordExpiresAt?: string|null } | null }
type Application = { applicationID: number; animalID: number; animalName: string; patronName: string; phoneNumber: string; address: string; email: string | null; status: string; applicationNote: string; reviewNote: string | null; submittedAt: string; reviewedAt: string | null; reviewerName:string|null;completerName:string|null; appointmentDate: string | null; completedAt: string | null; completedDate: string | null; completionNote: string | null; followUpDueDate: string | null; pictureURL: string | null }
type FollowUp = { visitID: number; applicationID: number; animalName: string; patronName?: string; visitDate: string; channel: string; animalCondition: string; note: string; nextVisitDate: string | null }
type Profile = { firstName: string; lastName: string; phoneNumber: string | null; address: string; email: string; preferredSpecies: string | null; preferredSize: string | null; minAge: number | null; maxAge: number | null; acceptsSpecialCare: number | null }
type Match = { animalID: number; animalName: string; species: string; age: string; size: string; healthStatus: string; pictureURL: string | null; matchScore: number; matchReason: string }
const statusName: Record<string,string> = { pending: '待审核', approved: '审核通过 · 待办理', rejected: '未通过', completed: '已完成领养', withdrawn: '已撤回', cancelled: '已取消' }
const suggestedFollowUp = () => localDate(14)
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : '—'
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后再试'
const fallbackImage = (src: string | null) => src ? (/^https?:\/\//.test(src) || src.startsWith('/') ? src : `/${src.replace(/^\.\/?/, '')}`) : ''

export function MemberAuth({ onLogin, expiredMessage }: { onLogin: (session: ShelterSession) => void; expiredMessage?: string }) {
  const [register, setRegister] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phoneNumber: '', address: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); if(register&&!isContactPhone(form.phoneNumber)){setError(contactPhoneHint);return} setBusy(true); try { const session = await api<ShelterSession>(register ? '/api/member/register' : '/api/member/login', { method: 'POST', body: JSON.stringify(form) }); onLogin(session); navigate(session.member?.mustChangePassword ? '/member/account' : location.pathname.startsWith('/member/apply/') ? location.pathname : '/member') } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }
  return <div className="member-auth member-c"><header className="member-auth-header"><Link className="member-auth-home" to="/catalog"><ArrowLeft size={17}/>返回领养档案</Link><Link className="member-c-brand" to="/catalog">拾光守护</Link><Link to="/login">工作人员入口<ArrowUpRight size={17}/></Link></header><div className="member-auth-image"><div><h1>相遇之后，<br />还有很多故事。</h1><p>给每一次认真的领养，一个清晰而温暖的开始。</p></div><figure><img src="/catalog-c/hero-hand.webp" alt="轻抚休息中的犬只"/><figcaption>先认真了解，再决定是否相伴。</figcaption></figure></div><div className="member-auth-main"><form onSubmit={submit} className="member-auth-card"><h2>{register ? '开启领养之旅' : '欢迎回到这里'}</h2><p>{register ? '填写真实联系方式，工作人员会通过这些信息与你沟通。' : '登录后查看申请进度、消息和回访记录。'}</p>{register && <div className="flow-two"><label>姓<input required maxLength={15} autoComplete="family-name" value={form.lastName} onChange={e => setForm({...form,lastName:e.target.value})} /></label><label>名<input required maxLength={15} autoComplete="given-name" value={form.firstName} onChange={e => setForm({...form,firstName:e.target.value})} /></label></div>}{register && <><label>联系电话<input type="tel" aria-label="联系电话" aria-describedby="registration-phone-hint" required maxLength={24} autoComplete="tel" value={form.phoneNumber} onChange={e => setForm({...form,phoneNumber:e.target.value})} /><small id="registration-phone-hint">{contactPhoneHint}</small></label><label>联系地址<input required maxLength={50} autoComplete="street-address" value={form.address} onChange={e => setForm({...form,address:e.target.value})} /></label></>}<label>邮箱<input type="email" required autoComplete="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></label><label>密码<input type="password" required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({...form,password:e.target.value})} /></label>{!register&&<p className="security-hint">临时密码自签发起 24 小时有效，过期请联系工作人员重新签发。</p>}{(error||expiredMessage) && <div className="flow-error" role="alert">{error||expiredMessage}</div>}<button className="button primary wide" disabled={busy}>{busy ? '请稍候…' : register ? '注册并进入' : '登录领养人账号'} <ArrowRight size={17} /></button><button type="button" disabled={busy} className="flow-switch" onClick={() => { setRegister(!register); setError('') }}>{register ? '已有账号？去登录' : '还没有账号？立即注册'}</button><Link to="/member/recover" className="flow-admin-link">忘记密码？</Link></form></div></div>
}

type MemberPortalProps = { session: ShelterSession; onLogout: () => void; onMemberUpdate: (member: ShelterSession['member']) => void }
export function MemberPortal(props: MemberPortalProps) {
  return <MemberPortalView {...props} />
}
function MemberPortalView({ session, onLogout, onMemberUpdate }: MemberPortalProps) {
  const [applications,setApplications] = useState<Application[]>([]), [followups,setFollowups] = useState<FollowUp[]>([]), [profile,setProfile] = useState<Profile | null>(null)
  const inbox=useNotificationInbox('member')
  const [tab,setTab] = useState<'applications'|'notifications'|'profile'|'recommendations'>('applications'), [error,setError] = useState(''), [message,setMessage] = useState('')
  const [recommendationKey,setRecommendationKey] = useState(0)
  const [savingProfile,setSavingProfile] = useState(false)
  const profileSubmitting = useRef(false)
  const [endingApplication,setEndingApplication] = useState<number|null>(null)
  const [loading,setLoading] = useState(true)
  const location = useLocation()
  const openNotifications = () => {
    setTab('notifications')
    inbox.refresh(true)
  }
  const openNotificationsFromURL = useEffectEvent(openNotifications)
  useEffect(()=>{
    if(new URLSearchParams(location.search).get('tab')==='notifications')openNotificationsFromURL()
  },[location.key,location.search])
  const animalID = location.pathname.match(/^\/member\/apply\/(\d+)$/)?.[1]
  useEffect(() => { window.scrollTo({top:0,left:0,behavior:'instant'}); if (animalID) setMessage('') },[location.pathname,animalID])
  const navigate = useNavigate()
  const refresh = useCallback(async () => { setLoading(true); try { const [a,f,p] = await Promise.all([api<Application[]>('/api/member/applications'),api<FollowUp[]>('/api/member/followups'),api<Profile>('/api/member/profile')]); setApplications(a); setFollowups(f); setProfile(p); setError('') } catch(e) { setError(errorText(e)) } finally { setLoading(false) } }, [])
  useEffect(() => { void refresh() }, [refresh])
  const endApplication = async (id: number, action: 'withdraw'|'cancel') => {
    const cancelling = action==='cancel'
    if (endingApplication || !window.confirm(cancelling ? '确定放弃这次领养吗？申请和办理预约将取消，工作人员会收到通知。' : '确定撤回这份申请吗？')) return
    setEndingApplication(id)
    setError('')
    setMessage('')
    try {
      await api(`/api/member/applications/${id}/${action}`,{method:'POST'})
      if(cancelling)inbox.refresh()
      await refresh()
      setMessage(cancelling ? '领养申请已取消' : '申请已撤回')
    } catch(e) { setError(errorText(e)) }
    finally { setEndingApplication(null) }
  }
  const read = async (item: Notification) => { try { if(!item.isRead)await inbox.markRead(item.notificationID); if(item.communityPostID)navigate(`/community/${item.communityPostID}${item.communityCommentID?`#comment-${item.communityCommentID}`:""}`);else if (item.applicationID) setTab("applications") } catch(e) { setError(errorText(e)) } }
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile || profileSubmitting.current) return
    setError('')
    setMessage('')
    if (!isContactPhone(profile.phoneNumber)) {
      setError(contactPhoneHint)
      return
    }
    profileSubmitting.current = true
    setSavingProfile(true)
    try {
      const result = await api<{member: ShelterSession['member']}>('/api/member/profile', { method:'PUT', body:JSON.stringify(profile) })
      onMemberUpdate(result.member)
      setMessage('个人资料与领养偏好已保存')
      await refresh()
      setRecommendationKey(value => value + 1)
    } catch (error) {
      setError(errorText(error))
    } finally {
      profileSubmitting.current = false
      setSavingProfile(false)
    }
  }
  return <div className="member-page member-c"><header className="member-top"><Link to="/catalog" className="member-logo"><strong>拾光守护</strong></Link><nav><Link to="/catalog">看看它们</Link><button onClick={() => { setTab('applications'); navigate('/member') }}>我的申请</button><button onClick={() => { openNotifications(); navigate('/member') }}>消息{inbox.data.unreadCount>0 && <i aria-label={`${inbox.data.unreadCount}条未读消息`}/>}</button><Link to="/member/account">账号安全</Link><button onClick={onLogout} title="退出登录" aria-label="退出登录"><SignOut size={18} /></button></nav></header><main className="member-main"><div className="member-welcome"><h1>{animalID ? '为相伴，认真准备。' : <>你好，{profile ? `${profile.lastName}${profile.firstName}` : session.member?.name}<span>。</span></>}</h1><p>{animalID ? '填写你的领养计划，工作人员会据此与你沟通。' : '从申请到相伴，每一步都可以在这里找到。'}</p></div>{error && <div className="flow-error" role="alert">{error}</div>}{message && <div className="flow-success" role="status">{message}</div>}{animalID ? <ApplyAnimal key={`${session.member?.id}-${animalID}`} memberID={session.member!.id} animalID={Number(animalID)} onDone={async () => { await refresh(); navigate('/member'); setTab('applications'); setMessage('申请已提交，工作人员审核后会通知你。') }} /> : loading ? <div className="member-load-state" role="status">正在读取你的领养记录…</div> : error && !profile ? <div className="member-load-state"><button className="button secondary" onClick={() => void refresh()}>重新读取个人中心</button></div> : <><div className="member-tabs" aria-label="个人中心栏目"><button aria-pressed={tab==='applications'} className={tab==='applications'?'selected':''} onClick={()=>setTab('applications')}>领养申请 <span>{applications.length}</span>{tab==='applications'&&<motion.i aria-hidden="true" className="member-tab-indicator" layoutId="member-tab-indicator" transition={{duration:.24,ease:[.77,0,.175,1]}}/>}</button><button aria-pressed={tab==='notifications'} className={tab==='notifications'?'selected':''} onClick={openNotifications}>站内消息 <span>{inbox.data.unreadCount}</span>{tab==='notifications'&&<motion.i aria-hidden="true" className="member-tab-indicator" layoutId="member-tab-indicator" transition={{duration:.24,ease:[.77,0,.175,1]}}/>}</button><button aria-pressed={tab==='profile'} className={tab==='profile'?'selected':''} onClick={()=>setTab('profile')}>个人资料与偏好{tab==='profile'&&<motion.i aria-hidden="true" className="member-tab-indicator" layoutId="member-tab-indicator" transition={{duration:.24,ease:[.77,0,.175,1]}}/>}</button><button aria-pressed={tab==='recommendations'} className={tab==='recommendations'?'selected':''} onClick={()=>setTab('recommendations')}>为你推荐{tab==='recommendations'&&<motion.i aria-hidden="true" className="member-tab-indicator" layoutId="member-tab-indicator" transition={{duration:.24,ease:[.77,0,.175,1]}}/>}</button></div>{tab==='applications' && <div className="flow-stack">{applications.length ? applications.map(item=><article className="flow-application" key={item.applicationID}><div className="flow-application-main"><div className="flow-photo"><PawPrint size={28} />{item.pictureURL && <img src={fallbackImage(item.pictureURL)} alt="" />}</div><div><h2>{item.animalName}</h2><div className="member-record-meta">申请 #{item.applicationID} · {date(item.submittedAt)}</div><ApplicationAnswers note={item.applicationNote}/></div><span className={`flow-status ${item.status}`}>{statusName[item.status]}</span></div><div className="flow-application-foot"><ApplicationTimeline key={item.status} applicationID={item.applicationID}/>{item.reviewNote && <p><strong>审核说明：</strong>{item.reviewNote}</p>}{item.status==='approved' && <p>审核已通过，等待工作人员办理领养。</p>}{item.appointmentDate&&<p>{item.status==='cancelled'?'原办理预约（已取消）':'计划办理日期'}：{date(item.appointmentDate)}</p>}{item.status==='completed' && <p>领养办理完成于 {date(item.completedDate||item.completedAt)}。{item.completionNote&&` ${item.completionNote}`}</p>}{item.status==='completed'&&item.followUpDueDate&&<p>首次回访计划：{date(item.followUpDueDate)}</p>}{item.status==='pending' && <button className="flow-text-button" disabled={endingApplication!==null} onClick={()=>endApplication(item.applicationID,'withdraw')}>撤回申请</button>}{item.status==='approved' && <button className="flow-text-button" disabled={endingApplication!==null} onClick={()=>endApplication(item.applicationID,'cancel')}>放弃领养</button>}{followups.filter(f=>f.applicationID===item.applicationID).map(f=><div className="flow-followup" key={f.visitID}><strong>回访 · {date(f.visitDate)} · {f.channel}</strong><p>动物状况：{f.animalCondition}。{f.note}</p>{f.nextVisitDate && <small>下次计划：{date(f.nextVisitDate)}</small>}</div>)}</div></article>) : <div className="flow-empty"><Heart size={33} /><h2>还没有领养申请</h2><p>去认识一下正在等待新家的小伙伴吧。</p><Link className="button primary" to="/catalog">浏览待领养动物 <ArrowRight size={16} /></Link></div>}</div>}{tab==='notifications' && <div className="flow-stack">
      <NotificationFilter inbox={inbox}/>
      {inbox.error&&<div className="flow-error" role="alert">{inbox.error} <button type="button" onClick={()=>inbox.refresh(true)}>重新读取消息</button></div>}
      {inbox.loading?<p role="status">正在读取消息…</p>:inbox.data.items.length ? inbox.data.items.map(n=><button key={n.notificationID} className={`flow-notification ${n.isRead?'':'unread'}`} onClick={()=>read(n)}><span><Bell size={20} /></span><div><strong>{n.title}</strong><p>{n.body}</p><small>{date(n.createdAt)}</small></div>{!n.isRead && <i>未读</i>}</button>) : <div className="flow-empty"><Bell size={32} /><h2>{inbox.filter==='unread'?'暂无未读消息':'暂无消息'}</h2><p>申请审核、回访更新和社区回复会出现在这里。</p></div>}
      <NotificationPager inbox={inbox}/>
    </div>}{tab==='profile' && profile && <form className="flow-profile" onSubmit={saveProfile} aria-busy={savingProfile}><div className="flow-panel-heading"><h2>个人资料</h2><p>工作人员会使用这些信息与你联系。</p></div><div className="flow-two"><label>姓<input required maxLength={15} value={profile.lastName} onChange={e=>setProfile({...profile,lastName:e.target.value})} /></label><label>名<input required maxLength={15} value={profile.firstName} onChange={e=>setProfile({...profile,firstName:e.target.value})} /></label></div><div className="flow-two"><label>联系电话<input type="tel" aria-label="联系电话" aria-describedby="profile-phone-hint" required maxLength={24} autoComplete="tel" value={profile.phoneNumber??''} onChange={e=>setProfile({...profile,phoneNumber:e.target.value})} /><small id="profile-phone-hint">{!isContactPhone(profile.phoneNumber)?'当前号码格式需核对。':''}{contactPhoneHint}</small></label><label>邮箱<input value={profile.email} disabled /></label></div><label>联系地址<input required maxLength={50} value={profile.address} onChange={e=>setProfile({...profile,address:e.target.value})} /></label><div className="flow-panel-heading"><h2>领养偏好</h2><p>可以帮助工作人员了解你的期待，也用于匹配推荐。</p></div><div className="flow-two"><label>偏好种类<select value={profile.preferredSpecies||''} onChange={e=>setProfile({...profile,preferredSpecies:e.target.value})}><option value="">不限</option><option value="Canine">犬</option><option value="Feline">猫</option></select></label><label>偏好体型<select value={profile.preferredSize||''} onChange={e=>setProfile({...profile,preferredSize:e.target.value})}><option value="">不限</option><option value="小型">小型</option><option value="中型">中型</option><option value="大型">大型</option></select></label></div><div className="flow-two"><label>最小年龄<input type="number" min="0" max="50" value={profile.minAge??''} onChange={e=>setProfile({...profile,minAge:e.target.value===''?null:Number(e.target.value)})} /></label><label>最大年龄<input type="number" min="0" max="50" value={profile.maxAge??''} onChange={e=>setProfile({...profile,maxAge:e.target.value===''?null:Number(e.target.value)})} /></label></div><label className="flow-care-toggle"><input type="checkbox" checked={Boolean(Number(profile.acceptsSpecialCare))} onChange={e=>setProfile({...profile,acceptsSpecialCare:e.target.checked?1:0})} />愿意照护需要特殊健康关注的动物</label><button className="button primary" disabled={savingProfile}>{savingProfile ? '正在保存…' : '保存资料'}</button></form>}{tab==='recommendations' && <MemberRecommendations key={recommendationKey} />}</>}</main></div>
}

function ApplyAnimal({ animalID, memberID, onDone }: { animalID: number; memberID: number; onDone: () => Promise<void> }) {
  const [animal,setAnimal] = useState<{animalID:number;animalName:string;pictureURL:string|null} | null>(null),[error,setError]=useState('')
  const [loading,setLoading] = useState(true),[retryKey,setRetryKey] = useState(0)
  useEffect(()=>{
    const controller = new AbortController()
    setLoading(true); setError(''); setAnimal(null)
    api<{animalID:number;animalName:string;pictureURL:string|null}[]>('/api/catalog',{signal:controller.signal})
      .then(rows=>{if(!controller.signal.aborted)setAnimal(rows.find(a=>a.animalID===animalID)||null)})
      .catch(e=>{if(!controller.signal.aborted)setError(errorText(e))})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[animalID,retryKey])
  return <div className="flow-apply"><Link className="member-return" to="/catalog"><ArrowLeft size={17}/>返回领养档案</Link>{loading ? <div className="member-load-state" role="status">正在读取申请对象…</div> : error && !animal ? <div className="member-load-state"><p role="alert">{error}</p><button type="button" className="button secondary" onClick={()=>setRetryKey(key=>key+1)}>重新读取动物档案</button></div> : animal ? <><div className="flow-apply-animal"><div className="flow-photo large"><PawPrint size={40} />{animal.pictureURL && <img src={fallbackImage(animal.pictureURL)} alt="" />}</div><div><h2>申请领养 · {animal.animalName}</h2><p>请介绍你的养宠经验、居住环境和照顾计划，方便工作人员了解你。</p></div></div><ApplicationQuestions animalID={animalID} memberID={memberID} onDone={onDone}/></> : <div className="flow-empty"><h2>这只动物当前不可申请</h2><p>可能已被领养，或正在办理中。</p><Link className="button secondary" to="/catalog">浏览其他动物</Link></div>}</div>
}

function MemberRecommendations() {
  const [items,setItems]=useState<Match[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{setLoading(true);try{setItems(await api<Match[]>('/api/member/matches'));setError('')}catch(e){setError(errorText(e))}finally{setLoading(false)}},[])
  useEffect(()=>{void refresh()},[refresh])
  return <section className="member-recommendations"><div className="flow-panel-heading"><h2>适合认识的动物</h2><p>先从生活和期待出发，做个相伴问卷；以下也保留按账户基础偏好生成的推荐。</p></div><div className="member-recommend-actions"><Link className="button primary" to="/match">做个相伴问卷 <ArrowRight size={16}/></Link><button type="button" className="flow-text-button" onClick={()=>void refresh()} disabled={loading}>{loading?'正在更新…':'更新推荐'}</button></div>{error&&<div className="flow-error" role="alert">{error}</div>}{loading&&<p role="status" className="member-load-state">正在读取匹配推荐…</p>}<div className="member-recommend-list">{items.length?items.map(item=><article key={item.animalID}><div className="flow-photo"><PawPrint size={24}/>{item.pictureURL&&<img src={fallbackImage(item.pictureURL)} alt=""/>}</div><div><strong>{item.animalName}</strong><small>{item.species==='Feline'?'猫':'犬'} · {item.age} 岁 · {item.size}</small><p>{item.matchReason}</p></div><Link to={`/catalog/${item.animalID}`}>查看详情</Link><Link to={`/member/apply/${item.animalID}`}>申请领养 <ArrowRight size={14}/></Link></article>):!loading&&<p className="member-recommend-empty">暂无合适的待领养动物，可调整偏好后重新查看。</p>}</div></section>
}

export function AdminApplications() {
  const [items,setItems]=useState<Application[]>([]),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<Application|null>(null),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const reviewDialogRef = useAccessibleDialog(Boolean(selected), () => setSelected(null))
  const [cancelReason,setCancelReason]=useState('')
  const [appointmentDate,setAppointmentDate]=useState(''),[completedDate,setCompletedDate]=useState(localDate()),[completionNote,setCompletionNote]=useState(''),[followUpDueDate,setFollowUpDueDate]=useState(suggestedFollowUp())
  const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{setLoading(true);try{setItems(await api<Application[]>('/api/admin/applications'));setError('')}catch(e){setError(errorText(e))}finally{setLoading(false)}},[])
  useEffect(()=>{void refresh()},[refresh])
  const act=async(kind:'approved'|'rejected'|'complete')=>{if(!selected)return;setBusy(true);setError('');try{await api(`/api/admin/applications/${selected.applicationID}/${kind==='complete'?'complete':'review'}`,{method:'POST',body:JSON.stringify(kind==='complete'?{completedDate,completionNote,followUpDueDate}:{decision:kind,reviewNote:note})});setMessage(kind==='approved'?'申请已通过':kind==='rejected'?'申请已驳回':'领养已办理');setSelected(null);setNote('');setCompletionNote('');await refresh()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
  const schedule=async()=>{
    if(!selected||!appointmentDate||busy)return
    setBusy(true);setError('')
    try {
      const result=await api<{changed:boolean}>(`/api/admin/applications/${selected.applicationID}/schedule`,{method:'POST',body:JSON.stringify({appointmentDate})})
      setMessage(result.changed?'办理安排已通知申请人':'该日期已安排，未重复发送通知')
      setSelected(null)
      await refresh()
    } catch(e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const cancel=async()=>{
    if(!selected||!cancelReason.trim()||busy||!window.confirm('确定取消这份已通过的申请吗？申请人会收到通知，原办理预约也将取消。'))return
    setBusy(true);setError('')
    try {
      await api(`/api/admin/applications/${selected.applicationID}/cancel`,{method:'POST',body:JSON.stringify({reason:cancelReason})})
      setMessage('领养申请已取消')
      setSelected(null)
      await refresh()
    } catch(e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!selected) return
    const previous = document.body.style.overflow
    const background = [...document.querySelectorAll<HTMLElement>('.admin-c .sidebar, .admin-c .topbar, .admin-skip')].map(element => ({ element, inert:element.inert, hidden:element.getAttribute('aria-hidden') }))
    document.body.style.overflow='hidden'
    background.forEach(({element}) => { element.inert=true; element.setAttribute('aria-hidden','true') })
    return () => { document.body.style.overflow=previous; background.forEach(({element,inert,hidden}) => { element.inert=inert; if(hidden===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',hidden) }) }
  }, [selected])
  const visible=filter==='all'?items:items.filter(i=>i.status===filter)
  return <div className="admin-operations"><div inert={Boolean(selected)} aria-hidden={Boolean(selected)}><div className="page-heading"><div><h1>领养申请</h1><p>集中查看申请、审核意见与领养办理进度。</p></div><div className="flow-summary"><strong>{items.filter(i=>i.status==='pending').length}</strong><span>待审核</span></div></div>{message && <div className="flow-success" role="status">{message}</div>}{error && <div className="operations-error"><div className="flow-error" role="alert">{error}</div><button className="button secondary" onClick={()=>void refresh()} disabled={loading}>重新读取</button></div>}{loading&&<p className="operations-loading" role="status">正在读取业务记录…</p>}<div className="flow-filter" role="group" aria-label="按申请状态筛选">{[['all','全部'],['pending','待审核'],['approved','待办理'],['completed','已完成'],['rejected','未通过'],['withdrawn','已撤回'],['cancelled','已取消']].map(([value,label])=><button key={value} className={filter===value?'selected':''} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><div className="flow-admin-list">{loading?null:visible.length?visible.map(item=><button className="flow-admin-row" key={item.applicationID} onClick={()=>{setAppointmentDate(item.appointmentDate||'');setCancelReason('');setCompletionNote('');setCompletedDate(localDate());setFollowUpDueDate(suggestedFollowUp());setSelected(item);setNote(item.reviewNote||'')}}><span className="flow-admin-number">#{item.applicationID}</span><span className="flow-admin-animal"><strong>{item.animalName}</strong><small>{item.patronName} · {item.phoneNumber}</small></span><span className={`flow-status ${item.status}`}>{statusName[item.status]}</span><span className="flow-admin-date">{date(item.submittedAt)}</span><ArrowRight size={17}/></button>):<div className="flow-empty"><h2>暂无相关申请</h2><p>收到申请后会显示在这里。</p></div>}</div></div>{selected && <div className="dialog-backdrop operations-review-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section ref={reviewDialogRef} tabIndex={-1} className="flow-review-dialog" role="dialog" aria-modal="true" aria-label="申请详情"><header className="operations-review-header"><button className="flow-close" aria-label="关闭申请详情" onClick={()=>setSelected(null)}><X size={21}/></button><p className="operations-reference">申请 #{selected.applicationID}</p><h2>{selected.animalName}的领养申请</h2><span className={`flow-status ${selected.status}`}>{statusName[selected.status]}</span></header><div className="operations-review-body">{error && <div className="flow-error" role="alert">{error}</div>}<div className="flow-detail-grid"><div><small>申请人</small><strong>{selected.patronName}</strong></div><div><small>联系电话</small><strong>{selected.phoneNumber}</strong></div><div><small>邮箱</small><strong>{selected.email||'未绑定账号'}</strong></div><div><small>提交时间</small><strong>{date(selected.submittedAt)}</strong></div><div className="wide"><small>联系地址</small><strong>{selected.address}</strong></div></div><div className="flow-detail-note"><small>申请说明</small><ApplicationAnswers note={selected.applicationNote}/></div>{selected.reviewNote && selected.status!=='pending' && <div className="flow-detail-note"><small>审核说明 · {date(selected.reviewedAt)}{selected.reviewerName&&` · ${selected.reviewerName}`}</small><p>{selected.reviewNote}</p></div>}{selected.status==='pending' && <><label className="flow-review-note">审核说明<textarea required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="请填写通过或驳回的理由，申请人可以看到这段说明。" /></label><div className="flow-dialog-actions"><button className="button secondary" disabled={busy||!note.trim()} onClick={()=>act('rejected')}>驳回申请</button><button className="button primary" disabled={busy||!note.trim()} onClick={()=>act('approved')}><Check size={17}/>通过审核</button></div></>}{selected.appointmentDate&&<div className="flow-detail-note"><small>{selected.status==='cancelled'?'原办理预约（已取消）':'计划办理'}</small><p>{date(selected.appointmentDate)}</p></div>}{selected.status!=='pending'&&<ApplicationTimeline role="admin" applicationID={selected.applicationID}/>}
{selected.completionNote&&<div className="flow-detail-note"><small>办理结果 · {date(selected.completedDate||selected.completedAt)}{selected.completerName&&` · ${selected.completerName}`}</small><p>{selected.completionNote}</p></div>}{selected.status==='approved' && <div className="flow-appointment"><label>计划办理日期<input type="date" min={localDate()} value={appointmentDate} onChange={e=>setAppointmentDate(e.target.value)}/></label><button className="button secondary" disabled={busy||!appointmentDate||(appointmentDate<localDate()&&appointmentDate!==selected.appointmentDate)} onClick={schedule}>通知办理安排</button><label>实际办理日期<input type="date" required max={localDate()} value={completedDate} onChange={e=>setCompletedDate(e.target.value)}/></label><label>办理结果<textarea required maxLength={1000} value={completionNote} onChange={e=>setCompletionNote(e.target.value)} placeholder="记录实际办理情况"/></label><label>首次回访计划日期<input type="date" required min={completedDate} value={followUpDueDate} onChange={e=>setFollowUpDueDate(e.target.value)}/></label><div className="flow-dialog-actions"><button className="button primary" disabled={busy||!completedDate||completedDate>localDate()||!completionNote.trim()||!followUpDueDate||followUpDueDate<completedDate} onClick={()=>act('complete')}>确认已办理领养 <ArrowRight size={16}/></button></div>
<label>取消原因<textarea maxLength={1000} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="申请人可在申请进度中查看原因。"/></label>
<button className="button secondary" disabled={busy||!cancelReason.trim()} onClick={cancel}>取消领养申请</button></div>}</div></section></div>}</div>
}

export function AdminFollowups() {
  const [applications,setApplications]=useState<Application[]>([]),[visits,setVisits]=useState<FollowUp[]>([]),[form,setForm]=useState({applicationID:'',visitDate:localDate(),channel:'电话',animalCondition:'良好',note:'',nextVisitDate:''}),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{setLoading(true);try{const [a,v]=await Promise.all([api<Application[]>('/api/admin/applications'),api<FollowUp[]>('/api/admin/followups')]);setApplications(a.filter(i=>i.status==='completed'));setVisits(v);setError('')}catch(e){setError(errorText(e))}finally{setLoading(false)}},[])
  useEffect(()=>{void refresh()},[refresh])
  const adopted=applications.find(a=>String(a.applicationID)===form.applicationID)
  const submit=async(event:FormEvent)=>{event.preventDefault();if(form.visitDate>localDate()){setError('实际回访日期不能晚于今天');return}setBusy(true);setError('');try{await api(`/api/admin/applications/${form.applicationID}/followups`,{method:'POST',body:JSON.stringify(form)});setMessage('回访已保存，领养人会收到站内通知');setForm({...form,note:'',nextVisitDate:''});await refresh()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
  return <div className="admin-operations"><div className="page-heading"><div><h1>领养回访</h1><p>记录动物进入新家后的情况，让关怀延续下去。</p></div></div>{error && <div className="operations-error"><div className="flow-error" role="alert">{error}</div><button className="button secondary" onClick={()=>void refresh()} disabled={loading}>重新读取</button></div>}{loading&&<p className="operations-loading" role="status">正在读取业务记录…</p>}{message && <div className="flow-success" role="status">{message}</div>}<div className="flow-followup-layout"><form className="flow-followup-form" onSubmit={submit}><h2>记录一次回访</h2><label>已完成的领养<select required value={form.applicationID} onChange={e=>setForm({...form,applicationID:e.target.value})}><option value="">请选择领养记录</option>{applications.map(a=><option key={a.applicationID} value={a.applicationID}>{a.animalName} · {a.patronName} · #{a.applicationID}</option>)}</select></label><div className="flow-two"><label>回访日期<input type="date" required min={adopted ? date(adopted.completedDate||adopted.completedAt) : undefined} max={localDate()} value={form.visitDate} onChange={e=>setForm({...form,visitDate:e.target.value})}/></label><label>回访方式<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}><option>电话</option><option>上门</option><option>视频</option><option>线上消息</option></select></label></div><label>动物状况<select value={form.animalCondition} onChange={e=>setForm({...form,animalCondition:e.target.value})}><option>良好</option><option>需关注</option><option>需就医</option></select></label><label>回访内容<textarea required maxLength={2000} rows={5} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="记录饮食、健康、适应情况及需要跟进的事项。"/></label><label>下次计划日期（可选）<input type="date" min={form.visitDate} value={form.nextVisitDate} onChange={e=>setForm({...form,nextVisitDate:e.target.value})}/></label><button className="button primary" disabled={busy||!applications.length}>{busy?'保存中…':'保存回访'}</button></form><section className="flow-followup-history"><h2>回访记录 <span>{visits.length}</span></h2>{visits.length?visits.map(v=><article key={v.visitID}><div><strong>{v.animalName}</strong><span>{date(v.visitDate)}</span></div><small>{v.patronName} · {v.channel} · {v.animalCondition}</small><p>{v.note}</p>{v.nextVisitDate && <small>下次计划：{date(v.nextVisitDate)}</small>}</article>):<div className="flow-empty"><h2>还没有回访记录</h2><p>办理领养后，可以在左侧记录第一次回访。</p></div>}</section></div></div>
}

export function AdminNotifications() {
  const inbox=useNotificationInbox('admin')
  const [actionError,setActionError]=useState('')
  const read=async(id:number)=>{
    setActionError('')
    try { await inbox.markRead(id) }
    catch(e) { setActionError(errorText(e)) }
  }
  return <div className="admin-operations">
    <div className="page-heading"><div><h1>站内消息</h1><p>新申请、业务提醒和社区回复会集中显示在这里。</p></div></div>
    <NotificationFilter inbox={inbox}/>
    {(inbox.error||actionError)&&<div className="operations-error"><div className="flow-error" role="alert">{inbox.error||actionError}</div><button className="button secondary" onClick={()=>{setActionError('');inbox.refresh(true)}} disabled={inbox.loading}>重新读取</button></div>}
    {inbox.loading?<p className="operations-loading" role="status">正在读取消息…</p>:<div className="flow-stack">
      {inbox.data.items.length?inbox.data.items.map(item=><article key={item.notificationID} className={`flow-notification ${item.isRead?'':'unread'}`}>
        <span><Bell size={20}/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{date(item.createdAt)}</small></div>
        <div className="flow-notice-actions">
          {!item.isRead&&<button onClick={()=>void read(item.notificationID)}>标为已读</button>}
          {item.communityPostID&&<Link onClick={()=>{if(!item.isRead)void read(item.notificationID)}} to={`/community/${item.communityPostID}${item.communityCommentID?`#comment-${item.communityCommentID}`:''}`}>查看回复 <ArrowRight size={14}/></Link>}
          {item.applicationID&&<Link to="/applications">查看申请 <ArrowRight size={14}/></Link>}
          {item.title==='领养人账号找回请求'&&<Link to="/account">处理请求 <ArrowRight size={14}/></Link>}
        </div>
      </article>):<div className="flow-empty"><Bell size={32}/><h2>{inbox.filter==='unread'?'暂无未读消息':'暂无消息'}</h2></div>}
      <NotificationPager inbox={inbox}/>
    </div>}
  </div>
}
