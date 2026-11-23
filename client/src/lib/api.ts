export type Row = Record<string, unknown>

export type Meta = {
  animals: { animalID: number; animalName: string; species: string }[]
  patrons: { patronID: number; firstName: string; lastName: string }[]
  vaccines: { vaccineID: number; name: string; species: string; doses: number | null }[]
  medicalVisits: { visitID: number; animalID: number; visitDate: string; diagnosis: string }[]
  adoptable: { animalID: number }[]
}

const authRoutes = ['/api/login', '/api/member/login', '/api/member/register']
const accountChanged = 'shelter:account-changed'
let apiAccount = { key: 'guest' }
let reloading = false

export function bindApiAccount(role: 'admin' | 'member' | null, id?: number) {
  const key = role && id !== undefined ? `${role}:${id}` : 'guest'
  if (key !== apiAccount.key) apiAccount = { key }
}

function reloadForAccountChange() {
  if (reloading || typeof window === 'undefined') return
  reloading = true
  window.location.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === accountChanged && event.newValue) reloadForAccountChange()
  })
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const requestAccount = apiAccount
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (url.startsWith('/api/')) headers.set('X-Shelter-Account', requestAccount.key)
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (requestAccount === apiAccount) {
      if (response.status === 409 && payload.code === 'session_changed') reloadForAccountChange()
      else notifySessionExpired(response.status, url, payload.code)
    }
    throw new Error(payload.error || `请求失败（${response.status}）`)
  }
  if (options.method === 'POST' && [...authRoutes, '/api/logout', '/api/account/password'].includes(url)) {
    try {
      window.localStorage.setItem(accountChanged, `${Date.now()}-${Math.random()}`)
    } catch { /* Requests still verify the account when storage is unavailable. */ }
  }
  return payload as T
}

export const getRows = (name: string) => api<Row[]>(`/api/resources/${name}`)
export const getMeta = () => api<Meta>('/api/meta')
export const createRow = (name: string, data: Row, signal?: AbortSignal) => api(`/api/resources/${name}`, { method: 'POST', body: JSON.stringify({ data }), signal })
export const updateRow = (name: string, key: Row, data: Row, signal?: AbortSignal) => api(`/api/resources/${name}`, { method: 'PUT', body: JSON.stringify({ key, data }), signal })
export const deleteRow = (name: string, key: Row) => api(`/api/resources/${name}`, { method: 'DELETE', body: JSON.stringify({ key }) })

export async function uploadAnimalPhoto(file: File, signal?: AbortSignal): Promise<string> {
  const {pictureURL} = await api<{pictureURL:string}>('/api/animal-photo', {
    method:'POST', headers:{'Content-Type':file.type}, body:file, signal,
  })
  return pictureURL
}

export function notifySessionExpired(status:number,url:string,code?:string){
  if(status!==401||authRoutes.includes(url.split('?')[0])||typeof window==='undefined')return
  window.dispatchEvent(code==='temporary_password_expired'
    ? new CustomEvent('shelter:session-expired',{detail:{code}})
    : new Event('shelter:session-expired'))
}
