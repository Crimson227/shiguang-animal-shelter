import {useSyncExternalStore} from 'react'
import {Heart} from '@phosphor-icons/react'
import {parseShortlist,shortlistKey,shortlistLimit,toggleShortlist} from './lib/shortlist'
import './Shortlist.css'

let ids=parseShortlist(localStorageSafe()),persistent=true
const listeners=new Set<()=>void>()
function localStorageSafe(){try{return localStorage.getItem(shortlistKey)}catch{return null}}
function emit(){listeners.forEach(listener=>listener())}
window.addEventListener('storage',event=>{if(event.key===shortlistKey||event.key===null){ids=parseShortlist(localStorageSafe());emit()}})
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export function useShortlist(){
  const saved=useSyncExternalStore(subscribe,()=>ids)
  return {ids:saved,persistent,toggle:(id:number)=>{
    ids=toggleShortlist(ids,id)
    try{localStorage.setItem(shortlistKey,JSON.stringify(ids));persistent=true}catch{persistent=false}
    emit()
  }}
}
export function SaveAnimal({id,name}:{id:number;name:string}){
  const {ids,toggle}=useShortlist(),saved=ids.includes(id),full=!saved&&ids.length>=shortlistLimit
  return <button className="save-animal" type="button" aria-pressed={saved} disabled={full} aria-label={full?'心仪名单已满，请先移出其他动物':`${saved?'移出心仪名单':'加入心仪名单'}：${name}`} onClick={()=>toggle(id)}><Heart size={18} weight={saved?'fill':'regular'}/>{saved?'已心仪':full?'名单已满':'心仪'}</button>
}
