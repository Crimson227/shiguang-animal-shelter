import test from 'node:test'
import assert from 'node:assert/strict'
import {shouldSubmitMessage} from '../src/lib/assistantInput.ts'

test('Enter sends, while Shift+Enter and ordinary keys keep editing',()=>{
  assert.equal(shouldSubmitMessage({key:'Enter',shiftKey:false,isComposing:false}),true)
  assert.equal(shouldSubmitMessage({key:'Enter',shiftKey:true,isComposing:false}),false)
  assert.equal(shouldSubmitMessage({key:'a',shiftKey:false,isComposing:false}),false)
})
test('confirming Chinese IME composition never sends, including the legacy 229 key',()=>{
  assert.equal(shouldSubmitMessage({key:'Enter',shiftKey:false,isComposing:true}),false)
  assert.equal(shouldSubmitMessage({key:'Enter',shiftKey:false,isComposing:false,keyCode:229}),false)
})
