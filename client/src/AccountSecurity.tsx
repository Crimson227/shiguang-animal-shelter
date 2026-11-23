import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, ShieldCheck } from '@phosphor-icons/react'
import { api } from './lib/api'
import './AccountSecurity.css'
import './PublicTypography.css'
import './MemberEditorial.css'

const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请稍后重试'

export function MemberRecovery() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { const result = await api<{message: string}>('/api/member/recovery-requests', { method: 'POST', body: JSON.stringify({ email }) }); setMessage(result.message) }
    catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  return <div className="security-page member-recovery member-c"><div className="security-panel"><Link className="member-c-brand" to="/catalog">拾光守护</Link><Link className="security-back" to="/member"><ArrowLeft size={17}/> 返回领养人登录</Link><h1>忘记密码</h1><p>填写注册邮箱即可提交申请。工作人员会通过档案中登记的电话联系你，核验后提供临时密码。</p>{error&&<div className="security-error" role="alert">{error}</div>}{message&&<div className="security-success" role="status">{message}</div>}<form onSubmit={submit}><label>注册邮箱<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button primary wide" disabled={busy}>{busy?'提交中…':'申请重置密码'}</button></form><div className="security-hint">系统不会发送邮件或短信。临时密码自签发起 24 小时有效。登录后请立即设置自己的新密码。</div></div></div>
}

export function AdminRecoveryHelp() {
  return <div className="security-page admin-recovery admin-c"><div className="security-panel"><Link className="security-back" to="/login"><ArrowLeft size={17}/> 返回管理登录</Link><div className="security-icon"><ShieldCheck size={27}/></div><h1>找回管理账号</h1><p>管理账号由系统部署负责人维护。请联系部署负责人核验身份并重置密码。</p><div className="security-hint">部署负责人可按项目部署说明，使用初始化命令为指定管理员设置新密码。重置后原有登录会话自动失效。</div></div></div>
}

export function AdminResetPasswordButton({ patronID, requestID }: { patronID: number; requestID?: number }) {
  const [busy, setBusy] = useState(false), [issued, setIssued] = useState<{temporaryPassword:string;expiresAt:string}|null>(null), [error, setError] = useState('')
  const reset = async () => {
    if (busy || (requestID !== undefined && issued)) return
    if (!window.confirm('请先通过档案中的联系电话核验本人身份。确认已完成核验并签发新临时密码？原密码将立即失效。')) return
    setError(''); setIssued(null); setBusy(true)
    try {
      setIssued(await api<{temporaryPassword:string;expiresAt:string}>(`/api/admin/patrons/${patronID}/reset-password`, {
        method:'POST', body: requestID === undefined ? undefined : JSON.stringify({ requestID }),
      }))
    }
    catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  return <div className="security-reset"><button type="button" className="button secondary" disabled={busy || Boolean(requestID !== undefined && issued)} onClick={reset}>{busy?'重置中…':'核验后重置密码'}</button>{error&&<div className="security-error" role="alert">{error}</div>}{issued&&<div className="security-code" role="status"><span>临时密码（仅显示这一次）</span><strong>{issued.temporaryPassword}</strong><small>24 小时有效，截止 {issued.expiresAt.replace('T',' ')}。请通过已核验的联系方式交给本人，登录后立即改密。</small></div>}</div>
}

type RecoveryItem = { requestID:number; patronID:number; status:string; requestedAt:string; email:string; name:string; phoneNumber:string }
export function AccountSecurity({ role, onChanged, required = false, expiresAt }: { role: 'admin'|'member'; onChanged: () => void; required?: boolean; expiresAt?:string|null }) {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [requests, setRequests] = useState<RecoveryItem[]>([])
  const refresh = () => { if (role==='admin') api<RecoveryItem[]>('/api/admin/recovery-requests').then(setRequests).catch(err=>setError(messageOf(err))) }
  useEffect(refresh, [role])
  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (newPassword !== confirm) { setError('两次输入的新密码不一致'); return }
    setBusy(true)
    try { await api('/api/account/password', { method:'POST', body:JSON.stringify({ currentPassword, newPassword }) }); onChanged(); navigate(role==='admin'?'/login':'/member') }
    catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  const close = async (id:number) => { try { await api(`/api/admin/recovery-requests/${id}/close`,{method:'POST'}); refresh() } catch(err) { setError(messageOf(err)) } }
  return <div className={`security-account ${role==='member'?'member-account member-c':'admin-account'}`}><div className="security-account-heading"><div><h1>账号安全</h1><p>{required?`请在临时密码有效期内设置新密码。${expiresAt?`截止 ${expiresAt.replace('T',' ')}。`:'临时密码自签发起 24 小时有效。'}`:'修改密码后需要重新登录。'}</p></div>{!required&&<Link to={role==='admin'?'/':'/member'}>返回{role==='admin'?'工作台':'个人中心'} <ArrowRight size={16}/></Link>}</div>{error&&<div className="security-error" role="alert">{error}</div>}
    <section className="security-section"><h2>修改登录密码</h2><form onSubmit={changePassword}><label>当前密码<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>新密码<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>再次输入新密码<input required minLength={8} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="button primary" disabled={busy}>{busy?'正在修改…':'修改密码'}</button></form></section>
    {role==='admin'&&<section className="security-section"><h2>待处理的密码找回</h2><p>核对档案中的电话后，重置该领养人账号。临时密码只在签发时显示一次，24 小时有效。</p>{requests.length?<div className="security-request-list">{requests.map(item=><article key={item.requestID}><div><strong>{item.name}</strong><span>{item.email} · {item.phoneNumber}</span><small>申请于 {item.requestedAt.replace('T',' ').slice(0,16)}</small><Link to={`/patrons/${item.patronID}`}>查看领养人档案</Link></div><div><AdminResetPasswordButton patronID={item.patronID} requestID={item.requestID}/><button className="security-text-button" onClick={()=>close(item.requestID)}>关闭请求</button></div></article>)}</div>:<div className="security-empty">暂无待处理的找回请求</div>}</section>}</div>
}
