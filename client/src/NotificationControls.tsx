import type {useNotificationInbox} from './lib/useNotifications'

type Inbox = ReturnType<typeof useNotificationInbox>

export function NotificationFilter({inbox}:{inbox:Inbox}) {
  return <div className="flow-filter" role="group" aria-label="按消息状态筛选">
    <button type="button" className={inbox.filter==='all'?'selected':''} aria-pressed={inbox.filter==='all'} onClick={()=>inbox.changeFilter('all')}>全部消息</button>
    <button type="button" className={inbox.filter==='unread'?'selected':''} aria-pressed={inbox.filter==='unread'} onClick={()=>inbox.changeFilter('unread')}>仅看未读（{inbox.data.unreadCount}）</button>
  </div>
}

export function NotificationPager({inbox}:{inbox:Inbox}) {
  if (inbox.data.pageCount<=1) return null
  return <nav className="flow-inbox-pager" aria-label="消息分页">
    <button type="button" className="button secondary" disabled={inbox.loading||inbox.data.page<=1} onClick={()=>inbox.setPage(inbox.data.page-1)}>上一页</button>
    <span>第 {inbox.data.page} / {inbox.data.pageCount} 页</span>
    <button type="button" className="button secondary" disabled={inbox.loading||inbox.data.page>=inbox.data.pageCount} onClick={()=>inbox.setPage(inbox.data.page+1)}>下一页</button>
  </nav>
}
