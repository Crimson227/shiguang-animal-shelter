import test from 'node:test'
import assert from 'node:assert/strict'
import {parseShortlist,normalizeShortlist,toggleShortlist,shortlistLimit} from '../src/lib/shortlist.ts'
test('invalid or corrupt saved data cannot add fake IDs or exceed the shortlist limit',()=>{
  for(const raw of ['bad','null','{}','"45"'])assert.deepEqual(parseShortlist(raw),[])
  assert.deepEqual(normalizeShortlist([45,45,0,-1,2.4,'44',null,Infinity,44]),[45,44])
  assert.equal(normalizeShortlist(Array.from({length:30},(_,i)=>i+1)).length,shortlistLimit)
})
test('save and remove preserve other IDs; full lists allow removal and invalid IDs never enter',()=>{
  assert.deepEqual(toggleShortlist([45,44],41),[45,44,41])
  assert.deepEqual(toggleShortlist([45,44],45),[44])
  const full=Array.from({length:shortlistLimit},(_,i)=>i+1)
  assert.deepEqual(toggleShortlist(full,45),full)
  assert.equal(toggleShortlist(full,1).length,shortlistLimit-1)
  assert.deepEqual(toggleShortlist([45],-2),[45])
})
