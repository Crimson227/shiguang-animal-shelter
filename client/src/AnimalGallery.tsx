import {useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,PawPrint} from '@phosphor-icons/react'
import {animalFrames} from './lib/animalPhotos'
import './AnimalGallery.css'

export default function AnimalGallery({animalID,name,pictureURL}:{animalID:number;name:string;pictureURL:string|null}) {
  const frames=animalFrames(pictureURL)
  const [page,setPage]=useState(0),[failed,setFailed]=useState<string[]>([])
  const buttons=useRef<(HTMLButtonElement|null)[]>([])
  const index=Math.min(page,Math.max(0,frames.length-1)),frame=frames[index]
  const change=(next:number)=>setPage((next+frames.length)%frames.length)
  return <div className="animal-gallery-view" role="region" aria-label={`${name}的照片集`} tabIndex={frames.length>1?0:undefined} onKeyDown={event=>{
    if(frames.length<2||!['ArrowLeft','ArrowRight'].includes(event.key))return
    event.preventDefault();const next=(index+(event.key==='ArrowRight'?1:-1)+frames.length)%frames.length;setPage(next);buttons.current[next]?.focus()
  }}>
    <figure><div className="public-animal-photo gallery-frame" data-multiple={frames.length>1}>{frame&&!failed.includes(frame.src)?<img key={frame.src} src={frame.src} alt={`${name} · ${frame.caption}`} fetchPriority={index===0?'high':'auto'} onError={()=>setFailed(current=>[...current,frame.src])}/>:<div className="public-animal-photo-empty" role="img" aria-label={`${name}的这张照片暂时无法显示`}><PawPrint size={48} weight="light"/><span>{frames.length?'照片暂时无法显示，请试试其他照片。':'照片暂未提供'}</span></div>}</div><figcaption><span>{name} · {frame?.caption||'档案照片'}</span><span role="status">#{animalID}{frames.length>1?` · ${index+1} / ${frames.length}`:null}</span></figcaption></figure>
    {frames.length>1&&<div className="gallery-controls"><button type="button" className="gallery-arrow" aria-label={`查看${name}的上一张照片`} onClick={()=>change(index-1)}><ArrowLeft size={20}/></button><div className="gallery-thumbs" aria-label="选择照片">{frames.map((item,i)=><button ref={element=>{buttons.current[i]=element}} type="button" key={item.src} aria-label={`查看${name}的${item.caption}`} aria-pressed={index===i} onClick={()=>setPage(i)}><img src={item.src} alt="" loading="lazy"/><span>{item.caption}</span></button>)}</div><button type="button" className="gallery-arrow" aria-label={`查看${name}的下一张照片`} onClick={()=>change(index+1)}><ArrowRight size={20}/></button></div>}
  </div>
}
