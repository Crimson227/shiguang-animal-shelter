// Explicitly imported only by the isolated test process; never used by index.js.
import {existsSync,writeFileSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
import bcrypt from 'bcryptjs';

const compare=bcrypt.compare;
bcrypt.compare=async(...args)=>{
  if(args[0]!=='隔离恢复预检')return compare(...args);
  const marker=process.env.SMOKE_AI_CAPTURE+'.restore-precheck';
  writeFileSync(marker,'waiting');
  while(!existsSync(marker+'.release'))await pause(20);
  return false;
};

const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url)!=='https://fixture.invalid/v1/chat/completions')return realFetch(url,options);
  const payload=JSON.parse(options.body),message=payload.messages.at(-1).content;
  const capture=process.env.SMOKE_AI_CAPTURE;
  if(message.startsWith('合成联系资料检查'))writeFileSync(capture,JSON.stringify(payload),{flag:'wx'});
  if(message==='隔离缺失上下文')writeFileSync(capture+'.unexpected','provider invoked');
  if(message==='模拟上游拒绝')return new Response(null,{status:429});
  if(message==='模拟回答达到长度上限')return new Response('data: {"choices":[{"delta":{"content":"未完整回答"}}]}\n\ndata: {"choices":[{"finish_reason":"length"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":50}}\n\ndata: [DONE]\n\n');
  if(message==='模拟调用后中止'||message==='模拟备份期间中止'){
    writeFileSync(capture+(message==='模拟调用后中止'?'.started':'.backup-started'),'provider invoked',{flag:'wx'});
    await new Promise((resolve,reject)=>{
      const {signal}=options;
      if(signal.aborted)reject(signal.reason);
      else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
  }
  return new Response('data: {"choices":[{"delta":{"content":"这是隔离测试模型的回答，用于验证流式接入。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":50,"completion_tokens":8}}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
};
