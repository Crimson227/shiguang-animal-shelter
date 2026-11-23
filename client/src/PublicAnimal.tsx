import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { api } from './lib/api'
import './PublicTypography.css'
import './PublicAnimal.css'
import AnimalGallery from './AnimalGallery'
import {SaveAnimal,useShortlist} from './ShortlistStore'

type Animal = { animalID:number; animalName:string; species:string; age:string|number|null; gender:string; breed:string; size:string; pictureURL:string|null; intakeDate:string|null; description:string|null; restrictions:string|null }
type LoadState = { id:number; animal:Animal|null; error:string }

export default function PublicAnimal({ id }:{ id:number }) {
  const location = useLocation()
  const catalogSearch = location.state?.catalogSearch
  const listLocation = {pathname:'/catalog', search:typeof catalogSearch==='string'?catalogSearch:'', hash:'#catalog-list'}
  const [result,setResult] = useState<LoadState>({ id,animal:null,error:'' })
  const [retryKey,setRetryKey] = useState(0)
  const titleRef=useRef<HTMLHeadingElement>(null),actionRef=useRef<HTMLDivElement>(null)
  const [showApply,setShowApply]=useState(false)
  const {ids}=useShortlist()
  useEffect(() => {
    window.scrollTo({ top:0,left:0,behavior:'instant' })
  },[id])
  useEffect(() => {
    const controller = new AbortController()
    setResult({ id,animal:null,error:'' })
    api<Animal>(`/api/catalog/${id}`,{ signal:controller.signal })
      .then(animal => { if (!controller.signal.aborted) setResult({ id,animal,error:'' }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ id,animal:null,error:error instanceof TypeError ? '暂时无法连接服务，请稍后重试。' : (error as Error).message }) })
    return () => controller.abort()
  },[id,retryKey])
  const animal = result.id === id ? result.animal : null
  const error = result.id === id ? result.error : ''
  useEffect(()=>{
    setShowApply(false)
    if(!animal||!titleRef.current||!actionRef.current)return
    let pastTitle=false,actionVisible=false
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.target===titleRef.current)pastTitle=entry.boundingClientRect.bottom<0;if(entry.target===actionRef.current)actionVisible=entry.isIntersecting}
      setShowApply(pastTitle&&!actionVisible)
    })
    observer.observe(titleRef.current);observer.observe(actionRef.current)
    return()=>observer.disconnect()
  },[animal])

  const facts = animal ? [
    ['种类',animal.species === 'Canine' ? '犬' : animal.species === 'Feline' ? '猫' : '未记录'],
    ['品种',animal.breed || '未记录'],
    ['年龄',animal.age === null || animal.age === '' ? '未记录' : `${animal.age} 岁`],
    ['体型',animal.size || '未记录'],
    ['性别',animal.gender === 'M' ? '公' : animal.gender === 'F' ? '母' : '未记录'],
    ['入所日期',animal.intakeDate ? animal.intakeDate.slice(0,10) : '未记录'],
  ] : []
  return <div className="public-animal">
    <a className="public-animal-skip" href="#animal-content">跳至动物档案</a>
    <header className="public-animal-header">
      <Link className="public-animal-back" to={listLocation}><ArrowLeft size={18}/>返回待领养名单</Link>
      <Link className="public-animal-brand" to="/catalog">拾光守护</Link>
      <Link className="public-animal-member" to="/member">我的领养<ArrowUpRight size={18}/></Link>
    </header>
    {animal ? <main className="public-animal-layout" id="animal-content" tabIndex={-1}>
      <div className="public-animal-gallery">
        <AnimalGallery key={animal.animalID} animalID={animal.animalID} name={animal.animalName} pictureURL={animal.pictureURL}/>
        <p className="public-animal-photo-note">慢慢了解，<br/>好好相伴。</p>
      </div>
      <div className="public-animal-info">
        <h1 ref={titleRef}>{animal.animalName}<span>。</span></h1>
        <div className="animal-shortlist-actions"><SaveAnimal id={animal.animalID} name={animal.animalName}/><Link to="/shortlist">心仪名单与对比（{ids.length}）<ArrowUpRight size={16}/></Link></div>
        <div className="public-animal-record"><span>等待领养</span><span>动物档案 #{animal.animalID}</span></div>
        <p className="public-animal-lead">每一段相遇，都从认真了解彼此开始。</p>
        <dl className="public-animal-facts">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {animal.description && <section className="public-animal-story"><h2>它的故事</h2><p>{animal.description}</p></section>}
        <section className="public-animal-care"><h2>日常照护</h2><p>{animal.restrictions || '照护要求尚未记录，申请前请向工作人员了解。'}</p></section>
        <Link className="application-guide-link" to={`/assistant?animals=${animal.animalID}`}>和相伴助手聊聊它 <ArrowUpRight size={17}/></Link><section className="animal-readiness"><h2>迎接它之前</h2><p>先把生活中的这些位置，为它留出来。</p><ul><li>和同住家人确认领养意愿，核实住所允许养宠。</li><li>{animal.species==='Feline'?'准备猫砂盆、猫抓板和安静的适应空间，做好门窗与阳台防护。':animal.species==='Canine'?'准备合适的牵引用品和休息区，安排每天的陪伴与外出时间。':'准备安全的休息空间，并向工作人员了解适用的日常用品。'}</li><li>商量日常开销与外出时的照顾安排，再决定是否申请。</li></ul></section>
        <section className="animal-questions"><h2>见面时，再确认</h2><p>以下情况仍需沟通确认，请带着问题去了解它。</p><details><summary>它目前的健康与照护安排？</summary><p>请工作人员说明近期观察、既有医疗记录和后续照护安排，个别健康问题由兽医评估。</p></details><details><summary>它和家人、现有宠物能否相处？</summary><p>了解它在实际接触中的反应及是否有相关观察记录，不能仅凭照片或品种判断。</p></details><details><summary>接回家后，怎样慢慢适应？</summary><p>询问原有饮食、作息和适应建议，并确认遇到问题时如何联系工作人员。</p></details></section>
        <Link className="application-guide-link" to={`/guide?animal=${animal.animalID}#prepare`}>领养前，读一读相伴手册 <ArrowUpRight size={17}/></Link><div className="public-animal-action" ref={actionRef}><Link to={`/member/apply/${animal.animalID}`}>申请领养 {animal.animalName}<ArrowRight size={20}/></Link><p>先认真了解，再决定是否相伴。</p></div>
      </div>
    </main> : <main className="public-animal-state" id="animal-content" tabIndex={-1} aria-busy={!error}>
      <h1>{error ? <>这份档案，<br/>暂时无法打开。</> : <>正在翻开<br/>它的档案。</>}</h1>
      {error ? <><p role="alert">{error}</p><div className="public-animal-state-actions"><button type="button" onClick={() => setRetryKey(key => key+1)}>重新读取<ArrowRight size={18}/></button><Link to={listLocation}>返回待领养名单</Link></div></> : <p role="status">正在读取动物档案…</p>}
    </main>}
    <footer className="public-animal-footer"><span>拾光守护 · 让相遇成为相伴</span><Link to="/catalog">认识更多待领养伙伴<ArrowUpRight size={17}/></Link></footer>
    {animal&&showApply&&<aside className="mobile-adoption-bar" aria-label="当前动物领养入口"><strong>{animal.animalName}</strong><Link to={`/member/apply/${animal.animalID}`}>申请领养 <ArrowRight size={18}/></Link></aside>}
  </div>
}
