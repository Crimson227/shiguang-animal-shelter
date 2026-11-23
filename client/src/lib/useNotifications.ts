import {useCallback,useEffect,useRef,useState} from 'react'
import {api} from './api'

export type InboxRole = 'member'|'admin'
export type Notification = {notificationID:number;applicationID:number|null;communityPostID?:number|null;communityCommentID?:number|null;title:string;body:string;isRead:number;createdAt:string}
type NotificationPage = {items:Notification[];unreadCount:number;total:number;page:number;pageCount:number}
const notificationsChanged = 'shelter:notifications-changed'

function watchNotifications(refresh:()=>void) {
  const update=()=>{if(document.visibilityState==='visible')refresh()}
  const timer=window.setInterval(update,30000)
  window.addEventListener('focus',update)
  window.addEventListener(notificationsChanged,update)
  document.addEventListener('visibilitychange',update)
  return ()=>{
    window.clearInterval(timer)
    window.removeEventListener('focus',update)
    window.removeEventListener(notificationsChanged,update)
    document.removeEventListener('visibilitychange',update)
  }
}

export function useUnreadNotifications(enabled=true) {
  const [notice,setNotice]=useState<{role:InboxRole|null;count:number}>({role:null,count:0})
  useEffect(()=>{
    if(!enabled)return
    let active:AbortController|undefined
    const refresh=()=>{
      active?.abort()
      const controller=new AbortController()
      active=controller
      void api<typeof notice>('/api/community/unread',{signal:controller.signal})
        .then(data=>{if(!controller.signal.aborted)setNotice(data)}).catch(()=>{})
    }
    refresh()
    const stop=watchNotifications(refresh)
    return()=>{stop();active?.abort()}
  },[enabled])
  return enabled?notice:{role:null,count:0}
}

export function useNotificationInbox(role:InboxRole) {
  const [data,setData]=useState<NotificationPage>({items:[],unreadCount:0,total:0,page:1,pageCount:1})
  const [page,setPage]=useState(1), [filter,setFilter]=useState<'all'|'unread'>('all')
  const [loading,setLoading]=useState(true), [error,setError]=useState('')
  const active=useRef<AbortController|null>(null)
  const refresh=useCallback((showLoading=false)=>{
    active.current?.abort()
    const controller=new AbortController()
    active.current=controller
    if(showLoading)setLoading(true)
    void api<NotificationPage>(`/api/${role}/notifications/page?page=${page}&filter=${filter}`,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setData(result);setError('');if(result.page!==page)setPage(result.page)}})
      .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  },[role,page,filter])
  useEffect(()=>{
    refresh(true)
    const stop=watchNotifications(refresh)
    return()=>{stop();active.current?.abort()}
  },[refresh])
  const changeFilter=(value:'all'|'unread')=>{if(value!==filter){setPage(1);setFilter(value)}}
  const markRead=async(id:number)=>{
    await api(`/api/${role}/notifications/${id}/read`,{method:'POST'})
    window.dispatchEvent(new Event(notificationsChanged))
  }
  return {data,filter,changeFilter,setPage,loading,error,refresh,markRead}
}
