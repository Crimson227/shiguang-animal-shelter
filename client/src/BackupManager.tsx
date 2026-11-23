import {useEffect,useState,type FormEvent} from 'react'
import {api} from './lib/api'
import './BackupManager.css'

type Backup={id:string;createdAt:string;bytes:number;fileCount:number;reason:string;encrypted:boolean;overdue:boolean;legacyLocation:boolean}
type Inventory={items:Backup[];directory:string;legacyDirectory:string|null;encryption:{ready:boolean;message:string};retentionDays:number;totalBytes:number;overdueCount:number}
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
const size=(bytes:number)=>`${(bytes/1024/1024).toFixed(2)} MB`

export default function BackupManager(){
  const [data,setData]=useState<Inventory|null>(null),[loading,setLoading]=useState(true)
  const [busy,setBusy]=useState<'backup'|'verify'|'restore'|null>(null)
  const [error,setError]=useState(''),[message,setMessage]=useState('')
  const [selected,setSelected]=useState<Backup|null>(null),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
  const refresh=async()=>{
    setLoading(true)
    setError('')
    try { setData(await api<Inventory>('/api/admin/backups')) }
    catch(e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(()=>{void refresh()},[])

  const action=async(kind:'backup'|'verify'|'restore',work:()=>Promise<void>)=>{
    setBusy(kind);setError('');setMessage('')
    try { await work() }
    catch(e) { setError((e as Error).message);if(kind==='restore')setPassword('') }
    finally { setBusy(null) }
  }

  const create=()=>action('backup',async()=>{
    await api('/api/admin/backups',{method:'POST'})
    await refresh()
    setMessage('加密备份已完成。数据库、动物照片和社区照片已保存。')
  })
  const verify=(item:Backup)=>action('verify',async()=>{
    await api(`/api/admin/backups/${item.id}/verify`,{method:'POST'})
    setMessage(`${date(item.createdAt)} 的备份校验通过。`)
  })
  const restore=(event:FormEvent)=>{
    event.preventDefault()
    if(!selected||confirmation!=='恢复')return
    void action('restore',async()=>{
      await api(`/api/admin/backups/${selected.id}/restore`,{method:'POST',body:JSON.stringify({password,confirmation})})
      window.location.assign('/login')
    })
  }

  return <div className="backup-manager">
    <div className="page-heading"><div><h1>备份与恢复</h1><p>一起保存数据库、动物照片和社区照片。</p></div>
      <button className="button primary" disabled={Boolean(busy)||loading||!data?.encryption.ready} onClick={()=>void create()}>立即备份</button>
    </div>
    {data&&<>
      <p className="backup-location">新备份保存于 {data.directory}</p>
      {data.legacyDirectory&&<p className="backup-location">原目录的备份也可在此查找。{data.legacyDirectory}</p>}
      <p>已列出 {data.items.length} 份备份，占用 {size(data.totalBytes)}。{data.overdueCount} 份超过 {data.retentionDays} 天的保留提示期，仍会继续保留。</p>
      {!data.encryption.ready&&<div className="flow-error" role="alert">{data.encryption.message} 请在本机运行项目中的备份配置脚本，完成后重新读取。</div>}
    </>}
    <p>恢复前会先校验所选备份，并加密保存当前状态。恢复会替换当前数据和照片，完成后所有账号需要重新登录。</p>
    {busy&&<p role="status">{busy==='restore'?'正在校验并恢复，完成后将返回登录页。':busy==='verify'?'正在校验备份…':'正在加密保存数据库和照片…'}</p>}
    {message&&!busy&&<p role="status">{message}</p>}
    {error&&<div className="flow-error" role="alert">{error}</div>}
    <button className="button secondary" disabled={Boolean(busy)||loading} onClick={()=>void refresh()}>重新读取备份</button>
    {loading?<p role="status">正在读取备份记录…</p>:data&&!data.items.length?<div className="flow-empty"><h2>还没有完整备份</h2></div>:
      data&&<section aria-label="已有备份" className="backup-list">{data.items.map(item=><article key={item.id}>
        <div><h2>{date(item.createdAt)}</h2>
          <p>{size(item.bytes)} · {item.fileCount} 个文件 · {item.encrypted?'已加密':'旧版明文'} · {item.reason==='before-restore'?'恢复前自动保存':'手动备份'}</p>
          <small>{item.id}{item.legacyLocation?' · 原备份目录':''}{item.overdue?' · 超过保留提示期':''}</small>
        </div>
        <div className="backup-actions">
          <button className="button secondary" disabled={Boolean(busy)||(item.encrypted&&!data.encryption.ready)} onClick={()=>void verify(item)}>校验备份</button>
          <button className="button secondary" disabled={Boolean(busy)||!data.encryption.ready} onClick={()=>{setSelected(item);setPassword('');setConfirmation('');setError('');setMessage('')}}>恢复此备份</button>
        </div>
      </article>)}</section>
    }
    {selected&&<form className="backup-restore" onSubmit={restore}>
      <h2>确认恢复到 {date(selected.createdAt)}</h2>
      <p>此时间点之后的修改会被替换。恢复遇到故障时，系统会用恢复前的数据和照片回退。</p>
      <label>当前管理员密码<input type="password" autoComplete="current-password" required value={password} disabled={Boolean(busy)} onChange={e=>setPassword(e.target.value)}/></label>
      <label>输入“恢复”确认<input required value={confirmation} disabled={Boolean(busy)} onChange={e=>setConfirmation(e.target.value)}/></label>
      <div><button className="button primary" disabled={Boolean(busy)||confirmation!=='恢复'||!data?.encryption.ready}>确认恢复</button>
        <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={()=>setSelected(null)}>取消</button></div>
    </form>}
  </div>
}
