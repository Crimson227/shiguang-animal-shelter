import { useEffect, useRef } from 'react'
import './LivingCompanions.css'

type Pet = 'terrier' | 'tabby'
type Props = { pet: Pet; reduced: boolean; className?: string; delay?: number }

/** Small photographic actors; neither represents a particular adoption record. */
export function PeekCompanion({ pet, reduced, className = '', delay = 0 }: Props) {
  const button = useRef<HTMLButtonElement>(null)
  const figure = useRef<HTMLSpanElement>(null)
  const gaze = useRef<HTMLImageElement>(null)
  const idle = useRef<Animation | null>(null)
  const greeting = useRef<Animation | null>(null)
  const look = useRef<Animation | null>(null)

  useEffect(() => {
    if (reduced || !button.current || !figure.current) return
    let inView = false
    const sync = () => {
      if (!inView || document.hidden) { idle.current?.pause(); greeting.current?.pause(); return }
      if (!idle.current) {
        idle.current = figure.current!.animate([
          { transform: 'translateY(45%) rotate(-8deg)', offset: 0 },
          { transform: 'translateY(3%) rotate(3deg)', offset: .10 },
          { transform: 'translateY(-3%) rotate(-3deg)', offset: .16 },
          { transform: 'translateY(8%) rotate(2deg)', offset: .23 },
          { transform: 'translateY(5%) rotate(0deg)', offset: .31 },
          { transform: 'translateY(5%) rotate(0deg)', offset: .68 },
          { transform: 'translateY(45%) rotate(7deg)', offset: .80 },
          { transform: 'translateY(45%) rotate(-8deg)', offset: 1 },
        ], { duration: 11500, delay, iterations: Infinity, easing: 'cubic-bezier(.77,0,.175,1)' })
      } else idle.current.play()
      greeting.current?.play()
    }
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync() }, { threshold: .15 })
    observer.observe(button.current)
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect(); document.removeEventListener('visibilitychange', sync)
      idle.current?.cancel(); idle.current = null
      greeting.current?.cancel(); look.current?.cancel()
    }
  }, [reduced, delay])

  const greet = () => {
    if (reduced || !figure.current) return
    const current = getComputedStyle(figure.current).transform
    greeting.current?.cancel()
    greeting.current = figure.current.animate([
      { transform: current },
      { transform: 'translateY(-3%) rotate(-8deg)', offset: .28 },
      { transform: 'translateY(2%) rotate(6deg)', offset: .50 },
      { transform: 'translateY(-2%) rotate(-3deg)', offset: .72 },
      { transform: current },
    ], { duration: 1250, easing: 'cubic-bezier(.23,1,.32,1)' })
  }
  const follow = (x: number, y: number) => {
    if (reduced || !gaze.current) return
    look.current?.cancel()
    look.current = gaze.current.animate({ transform: `translate(${x * 5}px,${y * 3}px) rotate(${x * 5}deg)` }, {
      duration: 250, fill: 'forwards', easing: 'cubic-bezier(.23,1,.32,1)',
    })
  }

  return <button ref={button} type="button" className={`peek-companion ${className}`} aria-label={`和小${pet === 'terrier' ? '狗' : '猫'}打个招呼`}
    onClick={greet} onPointerEnter={event => { if (event.pointerType === 'mouse') greet() }}
    onPointerMove={event => {
      if (event.pointerType !== 'mouse') return
      const rect = event.currentTarget.getBoundingClientRect()
      follow((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1)
    }} onPointerLeave={() => follow(0, 0)}>
    <span className="peek-window"><span ref={figure} className="peek-figure"><img ref={gaze} src={`/catalog-c/companions/${pet}.webp`} alt="" width="640" height="640" draggable="false" /></span></span>
  </button>
}

export function LivingSignature({ reduced }: { reduced: boolean }) {
  const stage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stage.current) return
    let visible = false
    const sync = () => { if (stage.current) stage.current.dataset.active = visible && !document.hidden ? 'yes' : 'no' }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer.observe(stage.current); document.addEventListener('visibilitychange', sync)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [])
  return <div ref={stage} className="living-signature" role="group" aria-label="拾光守护，和猫狗打个招呼" data-living={reduced ? 'still' : 'play'}>
    {['拾', '光', '守', '护'].map((letter, index) => <div className={`signature-cell signature-cell-${index}`} key={letter}>
      {index === 0 && <PeekCompanion pet="terrier" reduced={reduced} delay={250} />}
      {index === 2 && <PeekCompanion pet="tabby" reduced={reduced} delay={1750} />}
      <span className="signature-letter" aria-hidden="true">{letter}</span>
      <span className="signature-orbit" aria-hidden="true" />
    </div>)}
  </div>
}
