import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, MagnifyingGlass, PawPrint } from '@phosphor-icons/react'
import { api, type Row } from './lib/api'
import { useMotionPreference } from './motionPreferenceContext'
import CatalogHero from './CatalogHero'
import { LivingSignature } from './LivingCompanions'
import AnimalPhoto from './AnimalPhoto'
import {SaveAnimal,useShortlist} from './ShortlistStore'
import './PublicTypography.css'
import './CatalogEditorial.css'
import './AnimalPhoto.css'

type CatalogResult = { items: Row[]; total: number; page: number; pageCount: number }
type CatalogRole = 'member' | 'admin' | null

const speciesText = (value: unknown) => ({ Canine: '犬', Feline: '猫', D: '犬', C: '猫' }[String(value)] || String(value || '-'))
export default function Catalog(props: { role?: CatalogRole; returningFromAnimal?: boolean }) {
  return <CatalogView {...props} />
}

function CatalogView({ role = null, returningFromAnimal = false }: { role?: CatalogRole; returningFromAnimal?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogResult>({ items: [], total: 0, page: 1, pageCount: 1 })
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const search = params.get('search') || ''
  const [searchInput, setSearchInput] = useState(search)
  useEffect(() => {
    if (window.location.search===location.search) setSearchInput(search)
  }, [search, location.search])
  const species = params.get('species') || 'all'
  const size = params.get('size') || 'all'
  const requestedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const listStartRef = useRef<HTMLDivElement>(null)
  const scrollToList = useRef(returningFromAnimal || location.hash==='#catalog-list')
  useEffect(() => {
    if (!hasLoaded || !scrollToList.current) return
    scrollToList.current = false
    const main = document.getElementById('catalog-list')
    main?.scrollIntoView({block:'start',behavior:'instant'})
    main?.focus({preventScroll:true})
  }, [hasLoaded])
  const { reduced, setReduced } = useMotionPreference()
  const {ids:savedIDs}=useShortlist()
  const pageSize = 9

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), search, species, size })
      api<CatalogResult>(`/api/catalog-page?${params}`, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) { setCatalog(result); setHasLoaded(true) } })
        .catch(err => { if (!controller.signal.aborted) setError(err instanceof TypeError ? '暂时无法连接服务，请检查系统是否已启动。' : (err as Error).message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search ? 250 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [page, search, species, size, retryKey])

  const retry = () => { setError(''); setLoading(true); setRetryKey(value => value + 1) }

  const updateFilters = (updates: Record<string,string>) => {
    if (window.location.pathname!==location.pathname) return
    // Browser history is updated before React commits the next location.
    const current = new URLSearchParams(window.location.search)
    const next = new URLSearchParams(current)
    for (const [key,value] of Object.entries(updates)) {
      if (!value || ((key==='species' || key==='size') && value==='all') || (key==='page' && value==='1')) next.delete(key)
      else next.set(key,value)
    }
    if (next.toString()===current.toString()) return
    setLoading(true)
    setError('')
    navigate({search:next.toString(),hash:window.location.hash},{replace:true})
  }

  const goToPage = (nextPage: number) => {
    if (nextPage === catalog.page) return
    updateFilters({page:String(nextPage)})
    listStartRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }

  return <div className="catalog-page c-editorial">
    <a className="c-skip" href="#catalog-list">跳到领养档案</a>
    <CatalogHero role={role} reduced={reduced} />
    <main id="catalog-list" tabIndex={-1} className="catalog-main" aria-busy={loading}>
      <div className="catalog-filterbar" ref={listStartRef}>
        <div className="catalog-heading">
          <h2>等一次相遇。</h2>
          <div className="catalog-summary"><strong>正在等待一个家</strong><span role="status">{error ? '列表暂时无法更新' : loading ? '正在加载…' : `共 ${catalog.total} 只 · 第 ${catalog.page}/${catalog.pageCount} 页`}</span></div>
        </div>
        <div className="catalog-toolbar">
          <nav className="catalog-discovery" aria-label="领养浏览工具">
            <Link className="catalog-quiz-link" to="/match">还没想好？做个相伴问卷 <ArrowUpRight size={16} /></Link>
            <Link className="catalog-shortlist-link" to="/shortlist">心仪名单与对比（{savedIDs.length}）<ArrowUpRight size={16}/></Link>
          </nav>
          <label className="catalog-search"><MagnifyingGlass size={17} /><input id="catalog-search" type="search" value={searchInput} onChange={event => {
            setSearchInput(event.target.value)
            updateFilters({search:event.target.value,page:'1'})
          }} placeholder="搜索名字或品种" aria-label="搜索动物" /></label>
        </div>
      </div>
      <div className="catalog-filterrow">
        <div className="catalog-chips" aria-label="按动物种类筛选">{[['all','全部'],['Canine','犬'],['Feline','猫']].map(([value,label]) => <button type="button" key={value} className={species === value ? 'selected' : ''} aria-pressed={species === value} onClick={() => updateFilters({species:value,page:'1'})}>{label}{species === value && <motion.span className="catalog-chip-indicator" layoutId="catalog-chip-indicator" transition={{ duration: reduced ? 0 : .24, ease: [.77, 0, .175, 1] }} />}</button>)}</div>
        <select aria-label="筛选体型" value={size} onChange={event => updateFilters({size:event.target.value,page:'1'})}><option value="all">所有体型</option><option value="小型">小型</option><option value="中型">中型</option><option value="大型">大型</option></select>
      </div>
      <div className={`catalog-progress ${loading && hasLoaded ? 'is-active' : ''}`} aria-hidden="true"><span /></div>
      {loading && hasLoaded && <span className="sr-only" role="status">正在更新筛选结果</span>}
      {error && <div className="error-box catalog-error" role="alert"><span>{error}</span><button type="button" onClick={retry}>重新加载</button></div>}
      {!hasLoaded && !error && <div className="loading-panel">正在加载动物…</div>}
      {hasLoaded && !error && <div className="catalog-grid"><AnimatePresence mode="popLayout" initial>
        {catalog.items.map((animal, index) => <motion.article
          className="animal-card" key={String(animal.animalID)} layout={reduced ? false : "position"}
          initial={reduced ? { opacity: .5 } : { opacity: 0, transform: 'translateY(18px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-12px)' }}
          transition={{ opacity: { duration: .2, delay: reduced ? 0 : Math.min(index, 3) * .025 }, transform: { duration: .26, ease: [.23, 1, .32, 1], delay: reduced ? 0 : Math.min(index, 3) * .025 }, layout: { duration: .28, ease: [.77, 0, .175, 1] } }}>
          <AnimalPhoto animal={animal} eager={index < 3} tone={index} /><div className="catalog-card-save"><SaveAnimal id={Number(animal.animalID)} name={String(animal.animalName)}/></div>
          <div className="animal-card-body"><div className="animal-card-meta"><span>领养档案 / {String(animal.animalID).padStart(3, '0')}</span><span className="status-pill available">等待领养</span></div><h2>{String(animal.animalName || '未命名')}</h2><p>{speciesText(animal.species)} · {String(animal.breed || '品种未填')} · {animal.age == null || animal.age === '' ? '年龄未填' : `${animal.age} 岁`} · {String(animal.size || '体型未填')}</p><div className="animal-card-actions"><Link className="catalog-detail" to={`/catalog/${animal.animalID}`} state={{catalogSearch:location.search}}>查看档案</Link><Link className="catalog-apply" to={`/member/apply/${animal.animalID}`}>申请领养 <ArrowRight size={15} /></Link></div></div>
        </motion.article>)}
      </AnimatePresence></div>}
      {hasLoaded && !loading && !error && catalog.total === 0 && <div className="empty"><PawPrint size={35} weight="duotone" /><strong>没有找到符合条件的动物</strong><p>换个名字或筛选条件再看看。</p></div>}
      {hasLoaded && !error && catalog.pageCount > 1 && <nav className="catalog-pagination" aria-label="动物列表分页"><button type="button" onClick={() => goToPage(catalog.page - 1)} disabled={loading || catalog.page === 1}>上一页</button><div>{Array.from({ length: catalog.pageCount }, (_, index) => index + 1).map(number => <button type="button" key={number} disabled={loading} className={number === catalog.page ? 'active' : ''} aria-current={number === catalog.page ? 'page' : undefined} onClick={() => goToPage(number)}>{number}</button>)}</div><button type="button" onClick={() => goToPage(catalog.page + 1)} disabled={loading || catalog.page === catalog.pageCount}>下一页</button></nav>}
    </main>
    <section className="c-responsibility"><h2>一时的心动，<br />长久的责任。</h2><div><p>先了解它的性格与照护需要，也想一想未来的生活。</p><p>和家人确认陪伴时间、居住条件与日常安排。真实领养需要申请、工作人员沟通、审核与办理。</p></div></section>
    <footer className="c-footer"><div><p>每一个小生命，<br />都值得好好相伴。</p><nav aria-label="页尾导航"><Link to="/guide">领养须知 <ArrowUpRight size={16}/></Link><a href="#catalog-list">领养档案 <ArrowUpRight size={16} /></a><Link to="/member">{role === 'member' ? '我的领养' : '领养人登录'} <ArrowUpRight size={16} /></Link><Link to={role === 'admin' ? '/' : '/login'}>{role === 'admin' ? '返回工作台' : '管理登录'} <ArrowUpRight size={16} /></Link></nav></div><LivingSignature reduced={reduced} /><div className="c-footer-settings"><small>用记录守护每一个生命。</small><button type="button" aria-pressed={reduced} onClick={() => setReduced(!reduced)}>{reduced ? '动效：精简' : '动效：完整'}</button></div></footer>
  </div>
}
