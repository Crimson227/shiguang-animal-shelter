import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {communityWriters,communityStories} from '../community-content-data.js';

test('starter discussions have valid distinct writers, categories and reply chains',()=>{
 const keys=new Set(communityWriters.map(a=>a.key));
 assert.equal(keys.size,12);assert.equal(communityStories.length,20);
 assert.equal(new Set(communityStories.map(p=>p.key)).size,20);
 assert.equal(new Set(communityStories.map(p=>p.title)).size,20);
 assert.equal(communityStories.reduce((n,p)=>n+p.comments.length,0),64);
 for(const writer of communityWriters)assert.ok(writer.nickname.length>=2&&writer.nickname.length<=20);
 for(const story of communityStories){
  assert.ok(keys.has(story.by)||story.by==='staff');
  assert.ok(['diary','experience','help','announcement'].includes(story.category));
  assert.equal(story.category==='announcement',story.by==='staff');
  assert.ok(story.title.length>=2&&story.title.length<=80&&story.body.length>=5&&story.body.length<=6000);
  assert.ok(story.ageMinutes>120);
  assert.ok(!/仅供演示|测试数据|AI生成|示例内容/.test(story.body+story.title));
  for(const [i,c] of story.comments.entries()){
   assert.ok(keys.has(c.by));assert.ok(c.text.length>0&&c.text.length<=2000);
   if(c.replyTo!=null)assert.ok(Number.isInteger(c.replyTo)&&c.replyTo>=0&&c.replyTo<i);
  }
 }
});
test('story photos resolve to existing local public assets',async()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=path.resolve(here,'..');
 for(const story of communityStories)for(const photo of story.images||[]){
  assert.ok(photo.startsWith('/imgs/animals/'));
  await access(path.join(server,photo.slice(1)));
 }
});
