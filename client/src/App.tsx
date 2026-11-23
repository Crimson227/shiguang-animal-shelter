import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { ArrowRight, Bell, ChartBar, Heart, House, List, MagnifyingGlass, PawPrint, Plus, SignOut, Trash, X, PencilSimple, UsersThree, Syringe, FirstAid, Gift, Package, ClipboardText, Pill, Stethoscope, CaretDown } from '@phosphor-icons/react'
import Community from './Community'
import BackupManager from './BackupManager'
import CompanionAssistant from './CompanionAssistant'
import AdminCommunity from './AdminCommunity'
import { api, bindApiAccount, createRow, deleteRow, getMeta, getRows, updateRow, uploadAnimalPhoto, type Meta, type Row } from './lib/api'
import { labels, moduleById, type Field, type Module } from './lib/modules'
import type { ShelterSession } from './AdoptionFlow'
import { AnimalHistory, FosterManager, InventoryMovements, MaterialDonations, PatronHistory } from './BusinessPages'
import PublicAnimal from './PublicAnimal'
import Shortlist from './Shortlist'
import { MotionPreferenceProvider } from './MotionPreference'
import { AccountSecurity, AdminRecoveryHelp, MemberRecovery } from './AccountSecurity'
import { useAccessibleDialog } from './lib/useAccessibleDialog'
import { useUnreadNotifications } from './lib/useNotifications'
import { localDate } from './lib/localDate'
import { isContactPhone, contactPhoneHint } from './lib/contactPhone'
import './App.css'
import './Extras.css'
import './Motion.css'
import './PublicTypography.css'
import './AdminEditorial.css'
import './RecordsEditorial.css'
import './OperationsEditorial.css'
import './DossierEditorial.css'

type Session = ShelterSession
const Insights = lazy(() => import('./Insights'))
const DonationChart = lazy(() => import('./DonationChart'))
const Catalog = lazy(() => import('./Catalog'))
const MatchQuiz = lazy(() => import('./MatchQuiz'))
const AdoptionGuide = lazy(() => import('./AdoptionGuide'))
const MemberAuth = lazy(() => import('./AdoptionFlow').then(module => ({ default: module.MemberAuth })))
const MemberPortal = lazy(() => import('./AdoptionFlow').then(module => ({ default: module.MemberPortal })))
const AdminApplications = lazy(() => import('./AdoptionFlow').then(module => ({ default: module.AdminApplications })))
const AdminFollowups = lazy(() => import('./AdoptionFlow').then(module => ({ default: module.AdminFollowups })))
const AdminNotifications = lazy(() => import('./AdoptionFlow').then(module => ({ default: module.AdminNotifications })))
type DashboardData = {
  counts: { animals: number; adoptable: number; patrons: number; adopted: number; fostered: number; donated: number; pendingApplications: number }
  species: { name: string; value: number }[]
  donations: { month: string; amount: number }[]
  recent: { animalID: number; animalName: string; patronName: string; date: string; fosteredOrAdopted: string }[]
}
const navGroups = [
  { title: '工作台', links: [['/', '运营总览', ChartBar], ['/applications', '领养申请', ClipboardText], ['/followups', '领养回访', Heart], ['/notifications', '站内消息', Bell], ['/community-admin', '相伴社区', UsersThree], ['/backups', '备份与恢复', Package], ['/insights', '运营分析', ChartBar]] },
  { title: '动物与领养', links: [['/records/animals', '动物档案', PawPrint], ['/records/adoptable', '待领养名单', Heart], ['/records/patrons', '领养人档案', UsersThree], ['/records/preferences', '领养偏好', ClipboardText], ['/records/placements', '领养办理记录', House], ['/fosters', '寄养管理', House]] },
  { title: '医疗照护', links: [['/records/vaccines', '疫苗目录', FirstAid], ['/records/vaccinations', '接种记录', Syringe], ['/records/prescriptions', '处方记录', Pill], ['/records/medical', '诊疗记录', Stethoscope]] },
  { title: '捐赠与库存', links: [['/records/donations', '金额捐赠', Gift], ['/material-donations', '物资捐赠', Gift], ['/records/inventory', '物资库存', Package], ['/inventory-movements', '物资出入库', Package]] },
] as const
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateText = (value: unknown) => value ? String(value).slice(0, 10) : '-'
const speciesText = (value: unknown) => ({ Canine: '犬', Feline: '猫', D: '犬', C: '猫' }[String(value)] || String(value || '-'))
const imageUrl = (value: unknown) => { const raw = String(value || ''); if (!raw) return ''; if (/^https?:\/\//.test(raw) || raw.startsWith('/')) return raw; return `/${raw.replace(/^\.\/?/, '')}` }
function valueText(key: string, value: unknown, meta?: Meta) {
  if (value === null || value === undefined || value === '') return '-'
  if (key === 'animalID') return meta?.animals.find(a => a.animalID === Number(value))?.animalName || `#${value}`
  if (key === 'patronID') { const p = meta?.patrons.find(p => p.patronID === Number(value)); return p ? `${p.lastName}${p.firstName}` : `#${value}` }
  if (['species', 'preferredSpecies'].includes(key)) return speciesText(value)
  if (key === 'gender') return ({ M: '公', F: '母' }[String(value)] || String(value))
  if (key === 'fosteredOrAdopted') return value === 'A' ? '领养' : '寄养'
  if (key === 'amount' || key === 'totalDonated') return money(value)
  if (key === 'acceptsSpecialCare') return Number(value) ? '是' : '否'
  if (['date', 'dateGiven', 'dateExpires', 'donationDate', 'visitDate', 'nextVisitDate'].includes(key)) return dateText(value)
  return String(value)
}
function Empty({ title, description }: { title: string; description?: string }) { return <div className="empty"><PawPrint size={35} weight="duotone" /><strong>{title}</strong>{description && <p>{description}</p>}</div> }
function ErrorBox({ text }: { text: string }) { return <div className="error-box" role="alert">{text}</div> }

function AppBody() {
  const [session, setSession] = useState<Session | null>(null)
  const role = session?.role ?? null
  const accountID = (session?.admin || session?.member)?.id
  useLayoutEffect(() => bindApiAccount(role, accountID), [role, accountID])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobile,setMobile] = useState(() => window.matchMedia('(max-width:760px)').matches)
  const sidebarRef = useAccessibleDialog(mobile && menuOpen && session?.role === 'admin', () => setMenuOpen(false))
  useEffect(() => {
    const media = window.matchMedia('(max-width:760px)')
    const change = () => { setMobile(media.matches); if (!media.matches) setMenuOpen(false) }
    media.addEventListener('change',change)
    return () => media.removeEventListener('change',change)
  },[])
  useEffect(() => {
    if (!mobile || !menuOpen || session?.role !== 'admin') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  },[mobile,menuOpen,session?.role])
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState('')
  const [memberSessionError,setMemberSessionError] = useState('')
  const [noticeVisible, setNoticeVisible] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const adminUnread = useUnreadNotifications(session?.role==='admin' && !location.pathname.startsWith('/community')).count
  const previousPath = useRef('')
  const returningFromAnimal = navigationType==='POP' && /^\/catalog\/\d+$/.test(previousPath.current)
  useEffect(() => { previousPath.current = location.pathname },[location.pathname])
  useEffect(() => { setMenuOpen(false) },[location.pathname,session?.role])
  useEffect(() => { api<Session>('/api/session').then(setSession).catch(() => setSession({ authenticated: false, role: null, admin: null, member: null })).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    const expired = (event:Event) => {
      if (event instanceof CustomEvent && event.detail?.code==='temporary_password_expired') {
        setMemberSessionError('临时密码已过期或需要重新签发，请联系工作人员。')
      }
      setSession({authenticated:false,role:null,admin:null,member:null})
    }
    window.addEventListener('shelter:session-expired',expired)
    return () => window.removeEventListener('shelter:session-expired',expired)
  },[])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])
  useEffect(() => {
    if (noticeVisible || !notice) return
    const timer = window.setTimeout(() => setNotice(''), 220)
    return () => window.clearTimeout(timer)
  }, [notice, noticeVisible])
  const showNotice = (message: string) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(message)
    setNoticeVisible(true)
    noticeTimer.current = window.setTimeout(() => setNoticeVisible(false), 4000)
  }
  const assistantAccountCheck = useRef(0)
  const refreshAssistantAccount = useCallback((mismatch = false) => {
    const check = ++assistantAccountCheck.current
    if (mismatch) setSession({ authenticated:false, role:null, admin:null, member:null })
    void api<Session>('/api/session').then(current => {
      if (check === assistantAccountCheck.current && window.location.pathname === '/assistant') setSession(current)
    }).catch(() => {})
  },[])
  const logout = async () => { await api('/api/logout', { method: 'POST' }); setSession({ authenticated: false, role: null, admin: null, member: null }); navigate('/catalog') }
  useEffect(() => { if (session?.role === 'admin') window.scrollTo({top:0,left:0,behavior:'instant'}) },[location.pathname,session?.role])
  const currentDestination = navGroups.map(group => group.links.find(([href]) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href))).find(link => link !== undefined)?.[1] || (location.pathname === '/account' ? '账号安全' : '收容工作台')
  if (loading) return <div className="app-loading"><PawPrint size={42} weight="fill" />正在加载收容所工作台…</div>
  if (session?.role === 'member' && session.member?.mustChangePassword && location.pathname !== '/member/account') return <Navigate to="/member/account" replace />
  if (location.pathname === '/assistant') {
    const account = session?.admin || session?.member
    const actorKey = account ? `${session?.role}:${account.id}` : null
    return <CompanionAssistant key={`${location.key}:${actorKey}`} role={session?.role||null} actorKey={actorKey} onAccountCheck={refreshAssistantAccount}/>
  }
  if (location.pathname === '/community' || location.pathname.startsWith('/community/')) return <Community role={session?.role||null}/>
  if (location.pathname === '/shortlist') return <Shortlist />
  if (location.pathname === '/catalog') return <Catalog role={session?.role} returningFromAnimal={returningFromAnimal} />
  if (location.pathname === '/guide') return <AdoptionGuide role={session?.role} />
  if (location.pathname === '/match') return <MatchQuiz role={session?.role} />
  if (location.pathname === '/member/recover') return <MemberRecovery />
  if (location.pathname === '/admin/recover') return <AdminRecoveryHelp />
  const catalogDetail=location.pathname.match(/^\/catalog\/(\d+)$/)
  if (catalogDetail) return <PublicAnimal id={Number(catalogDetail[1])}/>
  if (location.pathname === '/member/account' && session?.role === 'member') return <AccountSecurity role="member" required={Boolean(session.member?.mustChangePassword)} expiresAt={session.member?.temporaryPasswordExpiresAt} onChanged={() => setSession({ authenticated:false,role:null,admin:null,member:null })}/>
  if (location.pathname.startsWith('/member')) return session?.role === 'member' ? <MemberPortal session={session} onLogout={logout} onMemberUpdate={member => setSession(current => current?.member && current.member.id === member?.id ? {...current, member} : current)} /> : <MemberAuth expiredMessage={memberSessionError} onLogin={value=>{setMemberSessionError('');setSession(value)}} />
  return <>{session?.role === 'admin' ? <div className="app-shell admin-c"><a className="admin-skip" href="#admin-content">跳至工作内容</a>
    <aside ref={sidebarRef} tabIndex={-1} id="admin-sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} role={mobile ? 'dialog' : undefined} aria-modal={mobile && menuOpen || undefined} aria-label="管理导航" aria-hidden={mobile && !menuOpen || undefined} inert={mobile && !menuOpen}><Link to="/" className="brand" onClick={() => setMenuOpen(false)}><span><strong>拾光守护</strong><small>流浪动物管理系统</small></span></Link><button type="button" className="icon-button admin-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="关闭管理导航"><X size={22}/></button>
      <nav className="nav-scroll" aria-label="后台导航">{navGroups.map(group => <details className="nav-group" key={group.title} open={openGroups[group.title] ?? group.links.some(([href]) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href))} onToggle={event => { const isOpen = event.currentTarget.open; setOpenGroups(current => current[group.title] === isOpen ? current : ({ ...current, [group.title]: isOpen })) }}><summary className="nav-section">{group.title}<CaretDown size={14}/></summary><div>{group.links.map(([href,title,Icon]) => <NavLink key={href} to={href} end={href === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}><Icon size={19}/>{title}{href==='/notifications'&&adminUnread>0&&<span className="admin-unread-count" aria-label={`${adminUnread}条未读消息`}>{adminUnread>99?'99+':adminUnread}</span>}</NavLink>)}</div></details>)}</nav>
      <div className="sidebar-foot"><div className="user-avatar">管</div><div className="user-info"><strong>收容管理员</strong><Link to="/account" onClick={() => setMenuOpen(false)}>账号安全</Link></div><button className="icon-button light" onClick={logout} title="退出登录" aria-label="退出登录"><SignOut size={20} /></button></div></aside>
    <button className={`mobile-scrim ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} aria-label="关闭菜单" aria-hidden={!menuOpen} disabled={!menuOpen} />
    <div className="main-area" inert={mobile && menuOpen} aria-hidden={mobile && menuOpen || undefined}><header className="topbar"><button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单" aria-controls="admin-sidebar" aria-expanded={menuOpen}><List size={24} /></button><span className="admin-current-destination">{currentDestination}</span><div className="topbar-actions"><Link to="/catalog">查看领养展示 <ArrowRight size={16} /></Link></div></header><main className="content" id="admin-content" tabIndex={-1}><div className="admin-scene"><Routes location={location}><Route path="/" element={<Dashboard />} /><Route path="/account" element={<AccountSecurity role="admin" onChanged={() => setSession({ authenticated:false,role:null,admin:null,member:null })}/>} /><Route path="/community-admin" element={<AdminCommunity/>}/><Route path="/backups" element={<BackupManager/>}/><Route path="/applications" element={<AdminApplications />} /><Route path="/followups" element={<AdminFollowups />} /><Route path="/notifications" element={<AdminNotifications />} /><Route path="/insights" element={<Suspense fallback={<div className="loading-panel">正在加载运营分析…</div>}><Insights /></Suspense>} /><Route path="/matching" element={<Navigate to="/records/preferences" replace />} /><Route path="/fosters" element={<FosterManager />} /><Route path="/inventory-movements" element={<InventoryMovements />} /><Route path="/material-donations" element={<MaterialDonations />} /><Route path="/animals/:id" element={<AnimalHistory />} /><Route path="/patrons/:id" element={<PatronHistory />} /><Route path="/records/:id" element={<Records key={location.pathname} notify={showNotice} />} /><Route path="*" element={<Empty title="页面走丢了" />} /></Routes></div></main></div></div> : <Routes><Route path="*" element={<Login onLogin={setSession} />} /></Routes>}{notice && <div role="status" aria-hidden={!noticeVisible} className={`toast ${noticeVisible ? 'is-visible' : ''}`}>{notice}</div>}</>
}
function Login({ onLogin }: { onLogin: (value: Session) => void }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const data = await api<Session>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }); onLogin(data); navigate('/') } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  return <div className="admin-login admin-c"><header className="admin-login-header"><Link to="/catalog">返回领养档案 <ArrowRight size={16}/></Link><Link className="admin-login-brand" to="/catalog">拾光守护</Link><Link to="/member">领养人入口 <ArrowRight size={16}/></Link></header><div className="admin-login-layout"><section className="admin-login-story"><h1>从收容到领养，<br/>妥善记录每一步。</h1><p>让关怀，有迹可循。</p><figure><img src="/catalog-c/hero-cat.webp" alt="阳光下的虎斑猫"/><figcaption>拾光守护 · 流浪动物爱心管理系统</figcaption></figure></section><div className="admin-login-panel"><form className="login-card" onSubmit={submit}><h2>登录管理工作台</h2><p>继续照顾好这里的每一位小伙伴。</p><div className="login-form-fields"><label>账号<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required placeholder="请输入管理员账号" /></label><label>密码<input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required placeholder="请输入密码" /></label></div>{error && <ErrorBox text={error} />}<button className="button primary wide" disabled={busy}>{busy ? '正在登录…' : '登录工作台'} <ArrowRight size={18} /></button><Link to="/admin/recover" className="security-login-link">忘记管理密码？</Link></form></div></div></div>
}
function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null), [error, setError] = useState('')
  const [retryKey,setRetryKey] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    api<DashboardData>('/api/dashboard',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(err=>{if(!controller.signal.aborted)setError(err.message)})
    return()=>controller.abort()
  },[retryKey])
  const stats = data ? [{ label: '在册动物', value: data.counts.animals, icon: PawPrint, tone: 'green', to: '/records/animals' }, { label: '待领养', value: data.counts.adoptable, icon: Heart, tone: 'coral', to: '/records/adoptable' }, { label: '领养人', value: data.counts.patrons, icon: UsersThree, tone: 'blue', to: '/records/patrons' }, { label: '累计捐赠', value: money(data.counts.donated), icon: Gift, tone: 'gold', to: '/records/donations' }] : []
  return <div className="admin-overview"><div className="page-heading dashboard-heading"><div><h1>运营总览</h1><p>一眼掌握收容、领养与爱心支持的最新情况。</p></div><Link to="/records/animals" className="button primary"><Plus size={18} />添加动物</Link></div>{error && <div className="admin-report-error"><ErrorBox text={error}/><button type="button" className="button secondary" onClick={()=>setRetryKey(key=>key+1)}>重新读取总览</button></div>}{!data && !error && <div className="loading-panel" role="status">正在加载数据…</div>}{data && <>{data.counts.pendingApplications > 0 && <Link className="dashboard-review-alert" to="/applications"><span><ClipboardText size={20} />有 <strong>{data.counts.pendingApplications}</strong> 份领养申请等待审核</span><span>前往处理 <ArrowRight size={16} /></span></Link>}<div className="stats-grid">{stats.map(s => { const Icon = s.icon; return <Link to={s.to} className={`stat-card ${s.tone}`} key={s.label}><span className="stat-icon"><Icon size={24} weight="duotone" /></span><span className="stat-label">{s.label}</span><strong>{s.value}</strong><span className="stat-open">查看详情 <ArrowRight size={15} /></span></Link> })}</div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>捐赠趋势</h2><p>近六个月收到的爱心支持</p></div><Link to="/records/donations">查看明细 <ArrowRight size={15} /></Link></div>{data.donations.length ? <div className="chart-wrap"><Suspense fallback={<div className="loading-panel">正在加载图表…</div>}><DonationChart data={data.donations} /></Suspense></div> : <Empty title="暂无捐赠数据" />}</section><section className="panel"><div className="panel-head"><div><h2>动物种类</h2><p>当前档案构成</p></div></div><div className="species-list">{data.species.map((item, i) => <div className="species-row" key={i}><span className="species-symbol">{item.name === 'Canine' ? <PawPrint size={20} /> : <Heart size={20} />}</span><div className="species-detail"><div><strong>{speciesText(item.name)}</strong><span>{item.value} 只</span></div><div className="progress"><i style={{ width: `${Math.round(item.value / Math.max(data.counts.animals, 1) * 100)}%` }} /></div></div></div>)}</div><div className="mini-summary"><span>已领养 <strong>{data.counts.adopted}</strong></span><span>寄养中 <strong>{data.counts.fostered}</strong></span></div></section></div><div className="dashboard-grid lower"><section className="panel"><div className="panel-head"><div><h2>最近办理</h2><p>最新的寄养与领养记录</p></div><Link to="/fosters">查看寄养 <ArrowRight size={15} /></Link></div>{data.recent.length ? <div className="activity-list">{data.recent.map((item, i) => <div className="activity" key={i}><span className="activity-avatar"><PawPrint size={20} /></span><div><strong>{item.animalName}</strong><p>{item.patronName || '-'} · {item.fosteredOrAdopted === 'A' ? '办理领养' : '办理寄养'}</p></div><span>{dateText(item.date)}</span></div>)}</div> : <Empty title="还没有办理记录" />}</section><section className="panel"><div className="panel-head"><div><h2>常用操作</h2><p>快速前往日常工作</p></div></div><div className="quick-links"><Link to="/applications"><ClipboardText size={21} />审核领养申请 <ArrowRight size={17} /></Link><Link to="/followups"><Heart size={21} />记录领养回访 <ArrowRight size={17} /></Link><Link to="/inventory-movements"><Package size={21} />更新物资库存 <ArrowRight size={17} /></Link></div></section></div></>}</div>
}
function Records({ notify }: { notify: (text: string) => void }) {
  const { id } = useParams(), module = id && Object.hasOwn(moduleById,id) ? moduleById[id] : undefined
  const [rows, setRows] = useState<Row[]>([]), [meta, setMeta] = useState<Meta | undefined>(), [search, setSearch] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [editing, setEditing] = useState<Row | null | undefined>(undefined)
  const [page,setPage]=useState(1),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[animalSpecies,setAnimalSpecies]=useState(''),[animalStatus,setAnimalStatus]=useState(''),[animalHealth,setAnimalHealth]=useState(''),[voiding,setVoiding]=useState<Row|null>(null),[voidReason,setVoidReason]=useState(''),[voidBusy,setVoidBusy]=useState(false)
  const voidDialogRef = useAccessibleDialog(Boolean(voiding), () => setVoiding(null))
  const refresh = useCallback(async () => { if (!module) return; setLoading(true); setError(''); try { const [r, m] = await Promise.all([getRows(module.id), getMeta()]); setRows(r); setMeta(m) } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }, [module])
  useEffect(() => { setSearch(''); setPage(1); setDateFrom(''); setDateTo(''); setAnimalSpecies(''); setAnimalStatus(''); setAnimalHealth(''); setEditing(undefined); setVoiding(null); void refresh() }, [refresh])
  const hasFilters = Boolean(search || dateFrom || dateTo || animalSpecies || animalStatus || animalHealth)
  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); setAnimalSpecies(''); setAnimalStatus(''); setAnimalHealth(''); setPage(1) }
  const recordDialogOpen = editing !== undefined || Boolean(voiding)
  useEffect(() => {
    if (!recordDialogOpen) return
    const previous = document.body.style.overflow
    const background = [...document.querySelectorAll<HTMLElement>('.admin-c .sidebar, .admin-c .topbar, .admin-skip')].map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    document.body.style.overflow = 'hidden'
    background.forEach(({element}) => { element.inert = true; element.setAttribute('aria-hidden', 'true') })
    return () => { document.body.style.overflow = previous; background.forEach(({element,inert,ariaHidden}) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden) }) }
  }, [recordDialogOpen])
  const filtered = useMemo(() => rows.filter(row => (module?.id!=='donations'||((!dateFrom||dateText(row.donationDate)>=dateFrom)&&(!dateTo||dateText(row.donationDate)<=dateTo)))&&(module?.id!=='animals'||((!animalSpecies||row.species===animalSpecies)&&(!animalStatus||row.status===animalStatus)&&(!animalHealth||row.healthStatus===animalHealth)))&&(Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())) || module?.columns.some(k => valueText(k, row[k], meta).toLowerCase().includes(search.toLowerCase())))), [rows, search, module, meta, dateFrom, dateTo, animalSpecies, animalStatus, animalHealth])
  const pageCount=Math.max(1,Math.ceil(filtered.length/20)), visible=filtered.slice((Math.min(page,pageCount)-1)*20,Math.min(page,pageCount)*20)
  if (!module) return <Empty title="没有这个模块" />
  const remove = async (row: Row) => { if (!window.confirm(`确定删除这条${module.singular}记录吗？关联数据可能同时受到影响。`)) return; try { await deleteRow(module.id, Object.fromEntries(module.keys.map(k => [k, row[k]]))); notify('记录已删除'); await refresh() } catch (err) { setError((err as Error).message) } }
  const voidDonation=async(event:React.FormEvent)=>{event.preventDefault();if(!voiding)return;setVoidBusy(true);setError('');try{await api(`/api/donations/${voiding.donationID}/void`,{method:'POST',body:JSON.stringify({reason:voidReason})});setVoiding(null);setVoidReason('');notify('捐赠已撤销，统计已更新');await refresh()}catch(err){setError((err as Error).message)}finally{setVoidBusy(false)}}
  return <div className="admin-records"><div className="records-workspace" inert={editing !== undefined || Boolean(voiding)} aria-hidden={editing !== undefined || Boolean(voiding)}><div className="page-heading"><div><h1>{module.title}</h1><p>{module.subtitle}</p></div><div className="records-heading-actions">{module.id==='donations'&&<Link to="/material-donations" className="button secondary">物资捐赠</Link>}{module.id!=='placements'&&<button className="button primary" onClick={() => setEditing(null)} disabled={module.id === "preferences" && Boolean(meta?.patrons.length) && meta!.patrons.every(p => rows.some(row => Number(row.patronID) === p.patronID))} title={module.id === "preferences" ? "每位领养人只能设置一份偏好；已有偏好请编辑" : undefined}><Plus size={18} />{module.id === "preferences" ? "设置偏好" : `新增${module.singular}`}</button>}</div></div><section className="panel records-panel" aria-busy={loading}><div className="records-toolbar"><div className="record-count" role="status"><strong>{rows.length}</strong> 条记录{hasFilters && <span> · 找到 {filtered.length} 条</span>}</div><div className="search-box"><MagnifyingGlass size={18} /><input value={search} onChange={e => {setSearch(e.target.value);setPage(1)}} placeholder={`搜索${module.title}`} aria-label={`搜索${module.title}`} /></div>{hasFilters && <button type="button" className="records-clear" onClick={clearFilters}>清除筛选</button>}{module.id==='donations'&&<div className="business-two"><label>起始日期<input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1)}}/></label><label>结束日期<input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1)}}/></label></div>}</div>{module.id==='animals'&&<div className="record-filters"><select aria-label="筛选动物种类" value={animalSpecies} onChange={e=>{setAnimalSpecies(e.target.value);setPage(1)}}><option value="">全部种类</option><option value="Canine">犬</option><option value="Feline">猫</option></select><select aria-label="筛选业务状态" value={animalStatus} onChange={e=>{setAnimalStatus(e.target.value);setPage(1)}}><option value="">全部业务状态</option>{['收容中','待领养','待办理','寄养中','已领养'].map(v=><option key={v} value={v}>{v}</option>)}</select><select aria-label="筛选健康状态" value={animalHealth} onChange={e=>{setAnimalHealth(e.target.value);setPage(1)}}><option value="">全部健康状态</option>{['待评估','健康','需观察','治疗中'].map(v=><option key={v} value={v}>{v}</option>)}</select></div>}{error && <div className="records-error" role="alert"><ErrorBox text={error} /><button type="button" className="button secondary" onClick={()=>void refresh()}>重新读取记录</button></div>}{loading ? <div className="loading-panel" role="status">正在加载记录…</div> : filtered.length ? <><p className="records-scroll-hint" id="records-scroll-help">左右滑动查看完整资料与操作</p><div className="table-scroll" role="region" aria-label={`${module.title}数据表，可横向滚动`} aria-describedby="records-scroll-help" tabIndex={0}><table><caption className="records-sr-only">{module.title}，共 {filtered.length} 条筛选结果</caption><thead><tr>{module.columns.map(key => <th scope="col" key={key}>{labels[key] || key}</th>)}<th scope="col" className="actions-head">操作</th></tr></thead><tbody>{visible.map((row, i) => <tr key={module.keys.map(k => row[k]).join('-') || i}>{module.columns.map((key, j) => <td key={key}>{module.id === 'animals' && j === 0 ? <div className="animal-cell"><span className="animal-thumb"><PawPrint size={20} />{Boolean(row.pictureURL) && <img src={imageUrl(row.pictureURL)} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />}</span><div className="records-animal-name"><strong>{valueText(key, row[key], meta)}</strong><Link className="animal-history-link" to={`/animals/${row.animalID}`}>查看档案</Link></div></div> : module.id === 'patrons' && j === 0 ? <div><strong>{valueText(key,row[key],meta)}</strong><Link className="animal-history-link" to={`/patrons/${row.patronID}`}>查看档案</Link></div> : key === 'status' ? <span className={`status-pill ${row[key] === '待领养' || row[key]==='active' ? 'available' : ''}`}>{module.id==='donations'?(row[key]==='active'?'有效':'已撤销'):valueText(key, row[key], meta)}</span> : valueText(key, row[key], meta)}</td>)}<td className="row-actions"><button className="icon-button" title={module.id==='placements'?'请通过领养申请维护':'编辑'} disabled={module.id==='placements'||(module.id==='donations'&&row.status==='void')} aria-label={`编辑第 ${i + 1} 条`} onClick={() => setEditing(row)}><PencilSimple size={18} /></button><button className="icon-button danger" title={module.id==='donations'?'撤销捐赠':module.id==='placements'?'办理记录不可删除':module.id==='inventory'?'库存变动请通过出入库维护':'删除'} disabled={module.id==='placements'||module.id==='inventory'||(module.id==='donations'&&row.status==='void')} aria-label={`${module.id==='donations'?'撤销':'删除'}第 ${i + 1} 条`} onClick={() => module.id==='donations'?(setVoiding(row),setVoidReason('')):remove(row)}><Trash size={18} /></button></td></tr>)}</tbody></table></div></> : <Empty title={hasFilters ? '没有找到符合条件的记录' : `还没有${module.title}记录`} description={hasFilters ? '调整条件或清除筛选后再试试。' : module.id === 'placements' ? '领养申请完成办理后，记录会显示在这里。' : '点击新增按钮添加第一条记录。'} />}<div className="table-footer">显示 {visible.length} / {filtered.length} 条筛选结果 · 共 {rows.length} 条记录 <span className="record-pager"><button disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button>{Math.min(page,pageCount)} / {pageCount}<button disabled={page>=pageCount} onClick={()=>setPage(page+1)}>下一页</button></span></div></section></div>{editing !== undefined && <RecordDialog module={module} current={editing} meta={meta} existingPatronIDs={module.id === "preferences" ? rows.map(row => Number(row.patronID)) : []} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); notify('记录已保存'); await refresh() }} />}{voiding&&<div className="dialog-backdrop records-sheet-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setVoiding(null)}}><section ref={voidDialogRef} tabIndex={-1} className="dialog records-sheet records-void-sheet" role="dialog" aria-modal="true" aria-label="撤销金额捐赠"><div className="dialog-head"><h2>撤销金额捐赠</h2><button className="icon-button" onClick={()=>setVoiding(null)} aria-label="关闭"><X size={21}/></button></div><p>捐赠 #{String(voiding.donationID)} · ¥{Number(voiding.amount).toLocaleString('zh-CN')}。撤销后保留原记录，并更新累计捐赠和统计。</p><form onSubmit={voidDonation}><label>撤销原因<textarea required maxLength={255} value={voidReason} onChange={e=>setVoidReason(e.target.value)} rows={3}/></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={()=>setVoiding(null)}>取消</button><button className="button primary" disabled={voidBusy}>确认撤销</button></div></form></section></div>}</div>
}
function RecordDialog({ module, current, meta, existingPatronIDs, onClose, onSaved }: { module: Module; current: Row | null; meta?: Meta; existingPatronIDs: number[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const isEdit = Boolean(current)
  const legacyUndatedPrescription = module.id==='prescriptions' && current !== null && current.prescribedAt == null
  const oldPhone = module.id==='patrons' && isEdit ? String(current?.phoneNumber??'') : null
  const today = localDate()
  const actualDateField = ['visitDate','dateGiven','prescribedAt']
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(module.fields.map(field => {
    const value=current?.[field.key]
    return [field.key, value!=null ? (field.type==='date'?dateText(value):String(value)) : field.key==='acceptsSpecialCare'?'0':(!isEdit&&actualDateField.includes(field.key)?today:'')]
  })))
  const preservePhone = oldPhone!==null && form.phoneNumber===oldPhone
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const saveRequest = useRef<AbortController | null>(null)
  useEffect(()=>()=>saveRequest.current?.abort(),[])
  const close = () => {
    saveRequest.current?.abort()
    onClose()
  }
  const dialogRef = useAccessibleDialog(true, close)
  const animalLocked = module.id==='medical' && Boolean(Number(current?.hasPrescriptions))
  const isLocked = (field: Field) => isEdit && (field.readOnlyOnEdit || (field.key==='animalID' && animalLocked))
  const optionsFor = (field: Field) => {
    if (field.source === 'animals') return meta?.animals.map(a => ({ value: String(a.animalID), label: `${a.animalName} · #${a.animalID}` })) || []
    if (field.source === 'patrons') return meta?.patrons.filter(p => module.id !== 'preferences' || isEdit || !existingPatronIDs.includes(p.patronID)).map(p => ({ value: String(p.patronID), label: `${p.lastName}${p.firstName} · #${p.patronID}` })) || []
    if (field.source === 'vaccines') return meta?.vaccines.map(v => ({ value: v.name, label: `${v.name} · ${speciesText(v.species)} · 库存 ${v.doses ?? '未设置'} 剂` })) || []
    if (field.source === 'medicalVisits') return meta?.medicalVisits.filter(v => Number(v.animalID) === Number(form.animalID)).map(v => ({ value: String(v.visitID), label: `#${v.visitID} · ${dateText(v.visitDate)} · ${v.diagnosis}` })) || []
    return field.options || []
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || saveRequest.current) return
    saveRequest.current = module.id==='animals' ? new AbortController() : null
    const signal = saveRequest.current?.signal
    setError('')
    setBusy(true)
    try {
      if (module.id==='patrons' && !preservePhone && !isContactPhone(form.phoneNumber)) throw new Error(contactPhoneHint)
      if (module.id==='donations' && (!/^\d+(?:\.\d{1,2})?$/.test(form.amount) || Number(form.amount)<0.01 || Number(form.amount)>99999999.99)) {
        throw new Error('捐赠金额须在 0.01 到 99,999,999.99 元之间，最多两位小数')
      }
      const data: Row = {}
      for (const field of module.fields) {
        const value=form[field.key]
        if (isLocked(field) || (field.key==='phoneNumber' && preservePhone) || (isEdit && field.key==='visitID' && value===String(current?.visitID??'')) ||
          (legacyUndatedPrescription && field.key==='prescribedAt' && !value)) continue
        if (value!=='' || isEdit || field.required) {
          const numberField=field.key!=='amount' && (field.type==='number' || ['animalID','patronID','visitID'].includes(field.key))
          data[field.key]=value==='' ? null : numberField ? Number(value) : value
        }
      }
      if (module.id==='animals' && photoFile) data.pictureURL=await uploadAnimalPhoto(photoFile,signal)
      if (module.id==='vaccinations' && !isEdit) data.vaccineID=meta?.vaccines.find(v=>v.name===form.vaccineName)?.vaccineID||null
      if (module.id==='preferences' && form.minAge && form.maxAge && Number(form.minAge)>Number(form.maxAge)) throw new Error('最小年龄不能大于最大年龄')
      signal?.throwIfAborted()
      if (isEdit && current) await updateRow(module.id,Object.fromEntries(module.keys.map(key=>[key,current[key]])),data,signal)
      else await createRow(module.id,data,signal)
      await onSaved()
    } catch(err) { if (!signal?.aborted) setError((err as Error).message) }
    finally {
      saveRequest.current = null
      if (!signal?.aborted) setBusy(false)
    }
  }
  return <div className="dialog-backdrop records-sheet-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
    <section ref={dialogRef} tabIndex={-1} className="dialog records-sheet" role="dialog" aria-modal="true" aria-label={`${isEdit?'编辑':'新增'}${module.singular}`}>
      <div className="dialog-head"><div><h2>{isEdit?'编辑':'新增'}{module.singular}</h2><p>{isEdit?'核对资料后保存更改。':'填写资料建立记录。'}标有 * 的项目为必填。</p></div><button className="icon-button" onClick={close} aria-label="关闭"><X size={21}/></button></div>
      <form onSubmit={submit}>
        <div className="form-grid">{module.fields.map(field=>{
          const options=field.type==='select'?optionsFor(field):[]
          const currentValue=form[field.key]
          const disabled=isLocked(field)
          const amount=field.key==='amount', phone=field.key==='phoneNumber'
          const optionalLegacyDate=legacyUndatedPrescription && field.key==='prescribedAt'
          const legacyPhone=phone && oldPhone!==null && !isContactPhone(oldPhone)
          const required=field.required && !optionalLegacyDate && !(legacyPhone && preservePhone)
          const hint=amount?'0.01 至 99,999,999.99 元，最多两位小数。':phone?`${legacyPhone?'旧号码格式待核对，可以先保存其他修改。':''}${contactPhoneHint}`:field.key==='animalID'&&animalLocked?'已有处方关联，动物不可更换。':optionalLegacyDate?'旧处方未记录日期，可以先保存其他修改。':''
          const min=amount?0.01:field.type==='number'?0:field.key==='dateExpires'?form.dateGiven:field.key==='nextVisitDate'?form.visitDate:undefined
          const max=amount?99999999.99:['age','minAge','maxAge'].includes(field.key)?50:actualDateField.includes(field.key)?today:undefined
          const setValue=(value:string)=>setForm({...form,[field.key]:value,...(module.id==='prescriptions'&&field.key==='animalID'?{visitID:''}:{})})
          const common={value:currentValue,disabled,required,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setValue(e.target.value)}
          return <label className={field.type==='textarea'||field.type==='url'?'wide-field':''} key={field.key}>
            {field.label}{required&&<em>*</em>}
            {field.type==='textarea'?<textarea {...common} rows={3}/>:field.type==='select'?<select {...common} aria-label={field.label} aria-describedby={hint?`record-hint-${field.key}`:undefined}>
              {field.key!=='acceptsSpecialCare'&&(field.key!=='healthStatus'||!isEdit)&&<option value="">请选择</option>}
              {field.key==='visitID'&&currentValue&&!options.some(option=>option.value===currentValue)&&<option value={currentValue} disabled>历史关联 #{currentValue}（待核对）</option>}
              {options.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}
            </select>:<input {...common} aria-label={field.label} aria-describedby={hint?`record-hint-${field.key}`:undefined} type={field.type||'text'} min={min} max={max}
              step={amount?'0.01':field.type==='number'?'1':undefined} maxLength={phone?24:undefined} autoComplete={phone?'tel':undefined}/>}
            {hint&&<small id={`record-hint-${field.key}`}>{hint}</small>}
          </label>
        })}{module.id==='animals'&&<label className="wide-field photo-upload">上传动物照片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>setPhotoFile(event.target.files?.[0]||null)}/><small>{photoFile?`已选择：${photoFile.name}`:'支持 JPG、PNG、WebP，最大 5 MB，单边不超过 6000 像素、总像素不超过 1600 万。'}</small></label>}</div>
        {error&&<ErrorBox text={error}/>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={close}>取消</button><button className="button primary" disabled={busy}>{busy?'保存中…':'保存记录'}</button></div>
      </form>
    </section>
  </div>
}
export default function App() { return <MotionPreferenceProvider><BrowserRouter><Suspense fallback={<div className="app-loading"><PawPrint size={42} weight="fill" />正在打开页面…</div>}><AppBody /></Suspense></BrowserRouter></MotionPreferenceProvider> }
