import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Plus } from '@phosphor-icons/react'
import { useMotionPreference } from './motionPreferenceContext'
import './PublicTypography.css'
import './AdoptionGuide.css'

const sources = {
  cats: {name:'Cats Protection · 迎接猫咪回家',url:'https://www.cats.org.uk/help-and-advice/getting-a-cat/bringing-a-cat-home'},
  dogs: {name:'Dogs Trust · 帮助领养犬适应新家',url:'https://www.dogstrust.org.uk/dog-advice/life-with-your-dog/at-home/settle-rescue-dog'},
  health: {name:'ASPCA · 与兽医讨论接种计划',url:'https://www.aspca.org/pet-care/general-pet-care/vaccinations-your-pet'},
  emergency: {name:'CDC · 宠物应急准备',url:'https://www.cdc.gov/healthy-pets/emergency-preparedness/index.html'},
}
const chapters = [['prepare','决定之前'],['arrival','初到新家'],['everyday','日常照护'],['settle','慢慢适应'],['health','健康与回访']] as const
const checklist = ['与家人、房东确认养宠安排','布置安静的休息位置与安全空间','备好食水、用品和安全接送工具','记下照护习惯、健康记录与联系人','安排日常陪伴、备用照护与预算']
function Reference({items}: {items:(keyof typeof sources)[]}) {
  return <div className="guide-references"><span>延伸阅读</span>{items.map(key=><a key={key} href={sources[key].url} target="_blank" rel="noreferrer">{sources[key].name}<ArrowUpRight size={14}/><span className="sr-only">（英文，新窗口）</span></a>)}</div>
}
export default function AdoptionGuide({role=null}: {role?:'member'|'admin'|null}) {
  const [params] = useSearchParams()
  const animal = params.get('animal') || ''
  const back = /^\d{1,9}$/.test(animal) && Number(animal)>0 ? params.get('from')==='apply' ? {to:`/member/apply/${animal}`,label:'返回这份申请'} : {to:`/catalog/${animal}`,label:'返回动物档案'} : {to:'/catalog',label:'返回领养档案'}
  const [checked,setChecked] = useState<number[]>([])
  const {reduced} = useMotionPreference()
  const location = useLocation()
  useEffect(()=>{
    const target = document.getElementById(location.hash.slice(1))
    if (target) { target.scrollIntoView({behavior:'instant',block:'start'}); target.focus({preventScroll:true}) }
    else window.scrollTo({top:0,behavior:'instant'})
  },[location.hash])
  return <div className="adoption-guide" data-motion={reduced?'reduced':'full'}>
    <a className="guide-skip" href="#guide-reading">跳到相伴手册</a>
    <header className="guide-header"><Link className="guide-brand" to="/catalog">拾光守护</Link><nav aria-label="相伴手册导航"><Link to={back.to}><ArrowLeft size={16}/>{back.label}</Link><Link to={role==='admin'?'/':'/member'}>{role==='admin'?'管理工作台':role==='member'?'我的领养':'领养人登录'}<ArrowUpRight size={16}/></Link></nav></header>
    <main>
      <section className="guide-cover" aria-labelledby="guide-title"><div><h1 id="guide-title">相伴，<br/>是每一天<span>。</span></h1><p>领养须知与照护手册</p><p className="guide-cover-copy">从迎接它的那一刻，<br/>到那些平凡、珍贵的日常。<br/>把准备做在前面，让相伴慢慢发生。</p><a href="#prepare" className="guide-primary">从准备开始 <ArrowRight size={20}/></a></div><figure><img src="/catalog-c/hero-hand.webp" alt="手轻抚在阳光下休息的犬只" width={1454} height={1082} fetchPriority="high"/><figcaption>给彼此时间，也给未来一点准备。</figcaption></figure></section>
      <div className="guide-reading" id="guide-reading" tabIndex={-1}><aside className="guide-index"><h2>相伴手册</h2><nav aria-label="手册章节">{chapters.map(([id,title],index)=><a key={id} href={`#${id}`}><span>0{index+1}</span>{title}<ArrowUpRight size={14}/></a>)}</nav><a href="#packing" className="guide-check-link">出发前的准备清单 <ArrowRight size={16}/></a></aside>
        <div className="guide-chapters">
          <section id="prepare" tabIndex={-1} className="guide-chapter"><h2>先想一想，<br/>未来的生活。</h2><p className="guide-lead">喜欢是开始，持续的照护才是日常。</p><ul><li>与同住家人、租住时的房东沟通，确认养宠许可和照护分工。</li><li>考虑每天能投入的时间、日常开支、就医预算，以及出差或搬家时的安排。</li><li>逐只了解档案与照护需要；有儿童或其他宠物时，先和工作人员讨论相处安排。</li></ul><details><summary>在这里，领养需要经过哪些步骤？<Plus size={19}/></summary><p>了解动物并填写申请，等待工作人员沟通和审核；审核通过后，按通知安排办理。完成领养后，可在个人中心查看回访记录与消息。提交申请并不代表已经获准领养。</p></details><Link className="guide-inline" to="/match">用相伴问卷梳理我的安排 <ArrowUpRight size={16}/></Link></section>
          <section id="arrival" tabIndex={-1} className="guide-chapter"><h2>欢迎回家，<br/>不用急着熟悉。</h2><p className="guide-lead">先准备好一个安静的位置，再慢慢认识整个家。</p><p>接回前向工作人员了解它的饮食、作息和既有照护需要。收好药品、清洁剂、电线等潜在危险物，并确认接送工具安全合适。</p><details><summary>迎接猫咪，要准备什么？<Plus size={19}/></summary><p>准备安静的独立空间、藏身处、休息位置、抓挠用品和猫砂盆。食物、水和猫砂盆分开放置。使用安全的航空箱接送，让它按自己的节奏探索，不要强行抱出藏身处。</p></details><details><summary>迎接狗狗，要准备什么？<Plus size={19}/></summary><p>准备床垫、食水碗、牵引工具与安静的休息区。最初减少访客和密集活动，先熟悉附近的短程外出路线；了解原有习惯，再建立稳定的生活节奏。</p></details><Reference items={['cats','dogs']}/></section>
          <section id="everyday" tabIndex={-1} className="guide-chapter"><h2>把照护，<br/>放进小事里。</h2><ul><li>与工作人员确认原有饮食及特殊需求，保持稳定的喂食、休息与活动安排。</li><li>留意进食、饮水、排泄与行为变化，简单记下观察，方便沟通。</li><li>让每只动物有自己的休息空间；互动需要尊重它愿意靠近的节奏。</li><li>提前找好可信任的备用照护人，整理联系信息和健康记录。</li></ul><Reference items={['dogs','cats','emergency']}/></section>
          <section id="settle" tabIndex={-1} className="guide-chapter guide-settle"><h2>慢一点，<br/>也没有关系。</h2><p className="guide-lead">适应没有统一的倒计时。</p><p>新环境中的躲藏、谨慎或暂时不愿互动，需要耐心观察。减少打扰，让它主动靠近；与家人、其他宠物的认识也应循序渐进。不要把短时间的表现当成它全部的性格。</p><details><summary>它一直紧张、不愿靠近，怎么办？<Plus size={19}/></summary><p>先保持安静和稳定，不强迫互动。把饮食、排泄和行为变化记下来，向工作人员寻求具体帮助；若持续没有改善，或伴随身体不适，联系兽医评估。</p></details><Reference items={['cats','dogs']}/></section>
          <section id="health" tabIndex={-1} className="guide-chapter"><h2>关心它，<br/>也记得求助。</h2><ul><li>接回时确认已有健康、接种及用药记录，将持续照护需要与兽医沟通。</li><li>疫苗计划需要结合年龄、健康史、环境与生活方式，由兽医具体判断。</li><li>保存常用动物医院、应急联系人和备用照护人的信息，外出时带好必要的记录。</li><li>留意站内消息，按工作人员安排配合后续回访，反馈真实的适应与照护情况。</li></ul><p className="guide-health-note">身体不适时请及时联系兽医；这份手册用于日常准备，不代替个体诊疗。</p><Reference items={['health','emergency']}/><Link className="guide-inline" to="/member">查看我的申请、消息与回访 <ArrowUpRight size={16}/></Link></section>
        </div>
      </div>
      <section className="guide-packing" id="packing" tabIndex={-1}><div><h2>出发前，<br/>再核对一遍。</h2><p>勾选只帮助你整理准备，<br/>不会作为领养审批结果。</p><p className="guide-check-count" role="status">已核对 {checked.length} / {checklist.length} 项 · 离开页面后不保留</p></div><div>{checklist.map((text,index)=><label key={text}><input type="checkbox" checked={checked.includes(index)} onChange={e=>setChecked(current=>e.target.checked?[...current,index]:current.filter(value=>value!==index))}/><span className="guide-check-box" aria-hidden="true"><Check size={18}/></span><span>{text}</span></label>)}</div></section>
      <section className="guide-next"><h2>准备好，<br/>再去相遇。</h2><div><p>带着对生活的了解，认识正在等待新家的伙伴。</p><Link className="guide-primary" to={back.to}>{back.label}<ArrowRight size={18}/></Link><Link className="guide-inline" to="/catalog#catalog-list">浏览全部待领养伙伴 <ArrowUpRight size={16}/></Link></div></section>
    </main><footer className="guide-footer"><span>拾光守护 · 好好相伴</span><p>照护资料核对于 2026年10月22日 · 各章节附英文原文</p><Link to="/catalog">返回领养档案 <ArrowUpRight size={15}/></Link></footer>
  </div>
}
