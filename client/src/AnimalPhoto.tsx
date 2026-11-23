import { useId, useRef, useState } from 'react'
import { ArrowUpRight, PawPrint, X } from '@phosphor-icons/react'
import type { Row } from './lib/api'
import './AnimalGallery.css'

export default function AnimalPhoto({ animal, eager, tone }: { animal: Row; eager: boolean; tone: number }) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [failed, setFailed] = useState(false)
  const noteId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const open = pinned || hovered
  const name = String(animal.animalName || '这位小伙伴')
  const raw = String(animal.pictureURL || '')
  const src = /^https?:\/\//.test(raw) || raw.startsWith('/') ? raw : `/${raw.replace(/^\.\/?/, '')}`
  const species = ['Canine', 'D'].includes(String(animal.species)) ? '犬' : ['Feline', 'C'].includes(String(animal.species)) ? '猫' : '种类未填'
  const care = String(animal.restrictions || '').trim()

  return <div className="animal-photo interactive-photo" data-open={open} data-pinned={pinned} data-tone={tone % 4}
    onPointerEnter={event => { if (event.pointerType === 'mouse' && window.matchMedia('(min-width:601px) and (hover:hover) and (pointer:fine)').matches) setHovered(true) }}
    onPointerLeave={() => setHovered(false)} onKeyDown={event => { if (event.key === 'Escape') { setHovered(false); setPinned(false); trigger.current?.focus() } }}>
    <button ref={trigger} type="button" className="photo-discover" aria-controls={noteId} aria-expanded={open}
      aria-label={pinned ? `收起${name}的相处档案` : hovered ? `留住${name}的相处档案` : `认识${name}`}
      onClick={() => { setPinned(!pinned); setHovered(false) }}>
      <span>{pinned ? '收起' : hovered ? '留住这页' : '认识它'}</span>{pinned ? <X size={16} /> : <ArrowUpRight size={16} />}
    </button>
    <div className="photo-note" id={noteId} aria-hidden={!open} inert={!open}>
      <div className="photo-note-intro"><h3>{name}</h3><p>{species} · {String(animal.size || '体型未填')}</p><span>{animal.age == null || animal.age === '' ? '年龄未填' : `${String(animal.age)} 岁`}</span></div>
      <div className="photo-note-care" role="region" aria-label={`${name}的照护说明`} tabIndex={open ? 0 : -1}><strong>相处之前</strong><p>{care || '照护需要尚未记录，申请前可以向工作人员进一步了解。'}</p></div>
      <span className="photo-note-number" aria-hidden="true">{String(animal.animalID).padStart(3, '0')}</span>
    </div>
    <PawPrint className="photo-placeholder" size={52} aria-hidden="true" />
    {raw && !failed && <img className="photo-cover" loading={eager ? 'eager' : 'lazy'} src={src} alt={name} onError={() => setFailed(true)} />}
  </div>
}
