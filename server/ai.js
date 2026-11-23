import express from 'express';
import {query,pool} from './db.js';
import {actor,fail} from './community.js';
import {readAIConfig,sanitizeAIRequest,buildAIMessages,streamCompletion,knowledge} from './ai-service.js';
import {databaseRoute as route} from './backup-gate.js';
export const aiRouter=express.Router();
aiRouter.get('/ai/status',route(async(_req,res)=>{const config=await readAIConfig();res.json({configured:config.configured})}));
const inflight=new Set();
aiRouter.post('/ai/chat',route(async(req,res)=>{
 const user=actor(req);if(!user)throw fail(401,'请先登录再使用相伴助手');
 const key=`${user.role}:${user.id}`;
 let input;try{input=sanitizeAIRequest(req.body)}catch(e){throw fail(400,e.message)}
 const config=await readAIConfig();if(!config.configured)throw fail(503,config.error||'相伴助手尚未配置模型服务，请联系工作人员');
 if(inflight.has(key))throw fail(429,'请等待当前回答完成');inflight.add(key);
 let usageID,connection;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);const disconnected=()=>controller.abort();res.on('close',disconnected);
 try{
  let post=null;
  if(input.postID){
   [post]=await query("SELECT postID,title,body FROM CommunityPosts WHERE postID=? AND status='published'",[input.postID]);
   if(!post)throw fail(404,'这篇帖子当前不可见，请重新选择');
  }
  const animals=input.animalIDs.length&&input.answers.permission!=='no'
   ? await query(`SELECT a.animalID,a.animalName,a.species,a.breed,a.age,a.size,a.healthStatus,a.description,d.restrictions
     FROM Animals a JOIN Adoptable d ON d.animalID=a.animalID
     WHERE a.animalID IN (${input.animalIDs.map(()=>'?').join(',')})
       AND NOT EXISTS(SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=a.animalID)
       AND NOT EXISTS(SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=a.animalID AND ap.status IN ('approved','completed'))
       AND NOT EXISTS(SELECT 1 FROM FosterRecords f WHERE f.animalID=a.animalID AND f.status='active')
     ORDER BY a.animalID DESC`,input.animalIDs)
   : [];
  const sources=[...animals.map(a=>({title:`${a.animalName}的当前档案`,url:`/catalog/${a.animalID}`})),...knowledge.map(({title,url})=>({title,url})),...(post?[{title:post.title,url:`/community/${post.postID}`}]:[])];
  const messages=buildAIMessages(input,animals,post);
  if(res.destroyed)controller.abort();
  controller.signal.throwIfAborted();
  connection=await pool.getConnection();await connection.beginTransaction();
  const [[{day,acceptedAt}]]=await connection.execute('SELECT CURDATE() AS day, NOW() AS acceptedAt');
  await connection.execute('INSERT INTO AIDailyBudget(day,requests) VALUES(?,0) ON DUPLICATE KEY UPDATE requests=requests',[day]);
  const [[budget]]=await connection.execute('SELECT requests FROM AIDailyBudget WHERE day=? FOR UPDATE',[day]);
  if(budget.requests>=config.maxDailyRequests)throw fail(429,'今日AI咨询次数已达上限，明天再来看看');
  const [[hour]]=await connection.execute('SELECT COUNT(*) total FROM AIUsage WHERE actorRole=? AND actorID=? AND createdAt>DATE_SUB(?,INTERVAL 1 HOUR)',[user.role,user.id,acceptedAt]);if(hour.total>=10)throw fail(429,'每小时最多咨询10次，请稍后再来');
  const mode=input.postID?'community':Object.keys(input.answers).length?'matching':input.animalIDs.length?'animal':'guide';
  const [insert]=await connection.execute('INSERT INTO AIUsage(actorRole,actorID,mode,createdAt) VALUES(?,?,?,?)',[user.role,user.id,mode,acceptedAt]);
  await connection.execute('UPDATE AIDailyBudget SET requests=requests+1 WHERE day=?',[day]);
  controller.signal.throwIfAborted();await connection.commit();usageID=insert.insertId;connection.release();connection=null;
  res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();const send=value=>{if(!res.destroyed)res.write(`${JSON.stringify(value)}\n`)};
  send({type:'sources',sources});const usage=await streamCompletion(config,messages,delta=>send({type:'delta',text:delta}),controller.signal);
  await query("UPDATE AIUsage SET status='success',inputTokens=?,outputTokens=? WHERE usageID=?",[usage.inputTokens,usage.outputTokens,usageID]);send({type:'done'});res.end();
 }catch(error){
  if(connection){await connection.rollback();connection.release()}
  if(usageID)await query("UPDATE AIUsage SET status='failed',inputTokens=?,outputTokens=? WHERE usageID=?",
   [error.usage?.inputTokens??0,error.usage?.outputTokens??0,usageID]).catch(()=>{});
  const message=error.name==='AbortError'||controller.signal.aborted?'回答已停止或等待超时，可以重新提问。':error.status?error.message:error instanceof TypeError?'暂时无法连接模型服务，请检查网络后重试。':['模型','回答'].some(s=>error.message?.startsWith(s))?error.message:'咨询暂时不可用，请稍后重试。';
  if(res.headersSent){if(!res.destroyed){res.write(`${JSON.stringify({type:'error',error:message})}\n`);res.end()}}else res.status(error.status||502).json({error:message});
 }finally{clearTimeout(timer);res.off('close',disconnected);inflight.delete(key)}
}));
aiRouter.get('/admin/ai/usage',route(async(req,res)=>{if(!req.session.admin)throw fail(403,'只有工作人员可以查看AI用量');const config=await readAIConfig();const rows=await query("SELECT DATE(createdAt) day,COUNT(*) requests,SUM(status='success') successes,SUM(status='failed') failures,SUM(inputTokens) inputTokens,SUM(outputTokens) outputTokens FROM AIUsage GROUP BY DATE(createdAt) ORDER BY day DESC LIMIT 14");res.json({configured:config.configured,model:config.model,maxDailyRequests:config.maxDailyRequests,items:rows})}));
