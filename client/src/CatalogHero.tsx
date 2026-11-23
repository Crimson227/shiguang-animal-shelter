import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ArrowUpRight, MagnifyingGlass } from '@phosphor-icons/react'
import { PeekCompanion } from './LivingCompanions'

type Props = {
  role: 'member' | 'admin' | null
  reduced: boolean
}

/** The approved C composition is presentation; every archive below is live API data. */
export default function CatalogHero({ role, reduced }: Props) {
  const hero = useRef<HTMLElement>(null)
  useEffect(() => {
    if (reduced || !hero.current) return
    const animations = Array.from(hero.current.querySelectorAll('.c-photo')).map((photo, index) =>
      photo.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
        duration: 700, delay: index * 90, easing: 'cubic-bezier(.23,1,.32,1)',
      }),
    )
    return () => animations.forEach(animation => animation.cancel())
  }, [reduced])

  useEffect(() => {
    const root=hero.current
    if(reduced||!root)return
    const layers=Array.from(root.querySelectorAll<HTMLElement>('.c-idle'))
    const animations=layers.map((layer,index)=>layer.animate(layer.classList.contains('c-photo-life')?
      [{transform:'scale(1.04) rotate(-.4deg)'},{transform:'scale(1.075) rotate(.4deg)'},{transform:'scale(1.04) rotate(-.4deg)'}]:
      [{transform:'translateY(0) rotate(0deg)'},{transform:`translateY(${index===3?-12:3}px) rotate(${index===3?1:0}deg)`},{transform:'translateY(0) rotate(0deg)'}],
      {duration:index===3?6800:8400+index*600,iterations:Infinity,easing:'ease-in-out'}))
    let visible=true
    const sync=()=>animations.forEach(a=>visible&&!document.hidden?a.play():a.pause())
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync()})
    observer.observe(root);document.addEventListener('visibilitychange',sync)
    const reset=()=>layers.forEach(layer=>{layer.style.translate='0px 0px'})
    const move=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse'||!matchMedia('(hover:hover) and (pointer:fine)').matches)return
      const box=root.getBoundingClientRect(),x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5
      layers.forEach((layer,index)=>{const depth=index===3?24:index<3?10:4;layer.style.translate=`${x*depth}px ${y*depth}px`})
    }
    root.addEventListener('pointermove',move);root.addEventListener('pointerleave',reset)
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',reset);animations.forEach(a=>a.cancel());reset()}
  },[reduced])

  return <section ref={hero} className="c-hero" aria-labelledby="c-hero-title" data-motion={reduced ? 'reduced' : 'full'}>
    <link rel="preload" as="image" href="/catalog-c/hero-dog.webp" fetchPriority="high" />
    <div className="c-photo c-dog"><div className="c-photo-life c-idle"><img src="/catalog-c/hero-dog.webp" alt="人与犬在阳光下相伴" width="1589" height="990" fetchPriority="high" /></div></div>
    <div className="c-ground" aria-hidden="true" /><div className="c-ground-extension" aria-hidden="true" />
    <header className="c-header">
      <Link className="c-brand" to="/catalog">拾光守护</Link>
      <nav className="c-navigation" aria-label="领养导航">
        <a href="#catalog-list">领养档案</a>
        <Link to="/community">相伴社区</Link>
        <Link to="/assistant">相伴助手</Link>

      </nav>
      <div className="c-utility"><a href="#catalog-search" aria-label="搜索动物档案"><MagnifyingGlass size={23} /></a><nav className="c-account-navigation" aria-label="账号入口">
        <Link to="/member">{role === 'member' ? '我的领养' : '领养人登录'}</Link>
        <Link to={role === 'admin' ? '/' : '/login'}>{role === 'admin' ? '返回工作台' : '管理登录'}</Link>
      </nav></div>
    </header>
    <h1 id="c-hero-title" aria-label="生活，多一个你。"><span className="c-title-line">生活，<PeekCompanion pet="terrier" reduced={reduced} className="hero-companion" delay={400} /></span><span className="c-title-line">多一个<span className="c-title-you">你</span>。</span></h1>
    <p className="c-introduction">领养，不只是给它一个家，<br />也是让生活，多了一份温柔的陪伴。</p>
    <Link className="c-primary" to="/match">寻找我的伙伴 <ArrowRight size={23} /></Link>
    <div className="c-photo c-cat"><div className="c-photo-life c-idle"><img src="/catalog-c/hero-cat.webp" alt="阳光下的虎斑猫" width="1575" height="998" /></div></div>
    <a className="c-photo-caption" href="#catalog-list">认真认识每一个它 <ArrowUpRight size={20} /></a>
    <div className="c-photo c-hand"><div className="c-photo-life c-idle"><img src="/catalog-c/hero-hand.webp" alt="轻抚休息中的犬只" width="1454" height="1082" /></div></div>
    <div className="c-together" aria-hidden="true"><span className="c-idle">together</span></div>
    <p className="c-manifesto"><span className="c-idle">或许，<br />你正是它一直在等的<br />那个人。</span></p>
    <p className="c-side-note"><span className="c-idle">不同的生命<br />相遇时<br />生活会变得<br />更完整</span></p>
  </section>
}
