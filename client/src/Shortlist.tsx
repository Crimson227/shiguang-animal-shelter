import {useEffect,useState} from 'react'
import {Link} from 'react-router'
import {ArrowLeft,ArrowRight,Heart} from '@phosphor-icons/react'
import {api,type Row} from './lib/api'
import {photoURL} from './lib/animalPhotos'
import {useShortlist} from './ShortlistStore'
import './PublicTypography.css'

const text=(value:unknown)=>value==null||value===''?'未记录':String(value)
export default function Shortlist(){
  const {ids,toggle,persistent}=useShortlist()
  const [animals,setAnimals]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [selected,setSelected]=useState<number[]>(()=>ids.slice(0,3)),[message,setMessage]=useState('')
  useEffect(()=>{window.scrollTo(0,0)},[])
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('')
    api<Row[]>('/api/catalog',{signal:controller.signal}).then(rows=>{if(!controller.signal.aborted)setAnimals(rows)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof TypeError?'暂时无法连接服务，请重试。':e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[retry])
  const available=animals.filter(a=>ids.includes(Number(a.animalID)))
  const compared=available.filter(a=>selected.includes(Number(a.animalID)))
  const select=(id:number)=>{const current=compared.map(a=>Number(a.animalID));setSelected(current.includes(id)?current.filter(n=>n!==id):[...current,id]);setMessage('')}
  const rows:[string,(animal:Row)=>string][]=[['种类',a=>a.species==='Feline'?'猫':a.species==='Canine'?'犬':'未记录'],['品种',a=>text(a.breed)],['年龄',a=>a.age==null||a.age===''?'未记录':`${a.age} 岁`],['体型',a=>text(a.size)],['健康记录',a=>text(a.healthStatus)],['照护要求',a=>text(a.restrictions)]]
  return <div className="shortlist-page"><header><Link to="/catalog"><ArrowLeft size={18}/>返回领养档案</Link><Link to="/match">做个相伴问卷 <ArrowRight size={18}/></Link></header><main><h1>认真考虑，<br/>再靠近一点。</h1><p className="shortlist-intro">心仪名单 {ids.length} / 12 · 最多同时对比 3 只。选择时，也把自己的生活安排考虑进去。</p><p className="shortlist-storage" role="status">{persistent?'名单仅保存在当前浏览器。':'浏览器未能保存，名单仅在本次页面访问期间保留。'}</p>
    {ids.length===0?<div className="shortlist-empty"><Heart size={36}/><h2>还没有心仪的伙伴</h2><p>在领养档案或动物详情中点“心仪”，再回来慢慢比较。</p><Link to="/catalog#catalog-list">去认识它们 <ArrowRight size={18}/></Link></div>:<>
      <div className="shortlist-toolbar"><h2>放在心上的伙伴</h2><button type="button" disabled={loading} onClick={()=>setRetry(n=>n+1)}>{loading?'正在读取…':'更新档案状态'}</button></div>
      {error?<div role="alert"><p>{error} 名单仍然保留。</p><button type="button" onClick={()=>setRetry(n=>n+1)}>重新读取</button></div>:loading?<p role="status">正在读取最新档案…</p>:<>
      <div className="shortlist-picks">{ids.map(id=>{const animal=available.find(a=>Number(a.animalID)===id),checked=compared.some(a=>Number(a.animalID)===id);return <article key={id}>{animal?<><div className="shortlist-portrait">{animal.pictureURL?<img src={photoURL(animal.pictureURL)} alt={String(animal.animalName)} onError={event=>{event.currentTarget.style.visibility='hidden'}}/>:<Heart size={28}/>}</div><div><h3><Link to={`/catalog/${id}`}>{text(animal.animalName)}</Link></h3><p>{text(animal.breed)} · {text(animal.size)}</p><label><input type="checkbox" checked={checked} disabled={!checked&&compared.length>=3} onChange={()=>select(id)}/>加入对比</label></div></>:<div><h3>档案 #{id}</h3><p>当前不在待领养名单中。</p></div>}<button type="button" aria-label={`移出${animal?text(animal.animalName):`档案${id}`}`} onClick={()=>{toggle(id);setMessage('已从心仪名单移出。')}}>移出</button></article>})}</div>
      <p className="shortlist-selection" role="status">{message||`已选择 ${compared.length} / 3 只${compared.length===3?'，取消一只后可选择其他伙伴。':'，勾选上方伙伴开始比较。'}`}</p>
      {compared.length>0&&<section aria-labelledby="comparison-title"><h2 id="comparison-title">一起看看，是否适合你的生活</h2><Link to={`/assistant?animals=${compared.map(a=>a.animalID).join(',')}`}>请相伴助手解释这些差异 <ArrowRight size={17}/></Link><p>以下为当前档案记录；健康记录不代替专业评估，匹配也不代表领养审核通过。</p><div className="shortlist-table" tabIndex={0} role="region" aria-label="动物资料对比，可横向滚动"><table><thead><tr><th scope="col">档案项目</th>{compared.map(a=><th scope="col" key={Number(a.animalID)}>{text(a.animalName)}</th>)}</tr></thead><tbody>{rows.map(([label,render])=><tr key={label}><th scope="row">{label}</th>{compared.map(a=><td key={Number(a.animalID)}>{render(a)}</td>)}</tr>)}<tr><th scope="row">申请前确认</th>{compared.map(a=><td key={Number(a.animalID)}>与家人、现有宠物是否适合相处，仍需向工作人员了解。</td>)}</tr><tr><th scope="row">下一步</th>{compared.map(a=><td key={Number(a.animalID)}><Link to={`/catalog/${a.animalID}`}>认真了解它</Link><Link to={`/member/apply/${a.animalID}`}>申请领养 <ArrowRight size={15}/></Link></td>)}</tr></tbody></table></div></section>}
      </>}
    </>}
    <aside className="shortlist-preparation"><h2>也留一点时间，想想自己</h2><p>每天能陪伴多久？居住条件是否允许？外出时谁来照顾？先和家人商量，再决定是否申请。</p><Link to="/guide#prepare">读一读领养前的准备 <ArrowRight size={17}/></Link></aside></main></div>
}
