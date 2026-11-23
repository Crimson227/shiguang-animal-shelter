import test from 'node:test'
import assert from 'node:assert/strict'
import {api,bindApiAccount} from '../src/lib/api.ts'

test('protected 401 clears stale client authentication while surfacing server error',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,events=[]
  globalThis.window={dispatchEvent:event=>events.push(event.type)}
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'请重新登录'}),{status:401})
  try {
    await assert.rejects(api('/api/member/applications',{method:'POST',body:'{}'}),/请重新登录/)
    assert.deepEqual(events,['shelter:session-expired'])
  } finally {globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow}
})
test('invalid sign-in credentials stay in their form without a session-expired event',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,events=[]
  globalThis.window={dispatchEvent:event=>events.push(event.type)}
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'账号或密码错误'}),{status:401})
  try {
    for(const route of ['/api/login','/api/member/login','/api/member/register'])await assert.rejects(api(route,{method:'POST'}),/账号或密码错误/)
    assert.deepEqual(events,[])
  } finally {globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow}
})
test('permission and availability errors do not incorrectly sign out a valid session',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,events=[]
  globalThis.window={dispatchEvent:event=>events.push(event.type)}
  try {
    for(const status of [403,409,503]) {
      globalThis.fetch=async()=>new Response(JSON.stringify({error:'当前操作暂不可用'}),{status})
      await assert.rejects(api('/api/member/applications'),/当前操作暂不可用/)
    }
    assert.deepEqual(events,[])
  } finally {globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow}
})

test('a delayed 401 from another account cannot clear the active login',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,events=[]
  let finish,headers
  globalThis.window={dispatchEvent:event=>events.push(event.type)}
  globalThis.fetch=(_url,options)=>new Promise(resolve=>{
    headers=options.headers
    finish=resolve
  })
  try {
    bindApiAccount('member',8)
    const oldRequest=assert.rejects(api('/api/member/profile'),/请重新登录/)
    assert.equal(headers.get('X-Shelter-Account'),'member:8')
    bindApiAccount('member',9)
    finish(new Response(JSON.stringify({error:'请重新登录'}),{status:401}))
    await oldRequest
    assert.deepEqual(events,[])
  } finally {
    bindApiAccount(null)
    globalThis.fetch=beforeFetch
    if(beforeWindow===undefined)delete globalThis.window
    else globalThis.window=beforeWindow
  }
})
