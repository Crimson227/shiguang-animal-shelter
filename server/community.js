import express from 'express';
import path from 'node:path';
import {pool,query} from './db.js';
import {databaseRoute as route} from './backup-gate.js';
import {commitPhotoDrafts,communityPhotoDraft,stagePhoto,usePhotoDrafts} from './photo-drafts.js';
import {publishCommunityReply} from './community-replies.js';
export const communityRouter=express.Router();
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const positiveID=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'编号无效');return id};
export const content=(value,name,max,min=1)=>{if(typeof value!=='string')throw fail(400,`请填写${name}`);const text=value.trim();if(text.length<min||text.length>max)throw fail(400,`${name}需为${min}–${max}字`);return text};
export const actor=req=>req.session.admin?{role:'admin',id:req.session.admin.id}:req.session.member?{role:'member',id:req.session.member.id}:null;
const login=(req,res,next)=>actor(req)?next():res.status(401).json({error:'请先登录领养人账号'});
const admin=(req,res,next)=>req.session.admin?next():res.status(403).json({error:'只有工作人员可以管理社区'});
const member=(req,res,next)=>req.session.member?next():res.status(403).json({error:'请使用领养人账号'});
const categories=['diary','experience','help','announcement'];
const owner=(row,user)=>user&&(user.role==='admin'||(row.authorRole===user.role&&Number(row.authorID)===user.id));
const nickname="CASE WHEN p.authorRole='admin' THEN '拾光守护 · 工作人员' ELSE COALESCE(cp.nickname,sp.nickname,CONCAT('相伴者',p.authorID)) END";
const selectPost=`SELECT p.postID,p.title,p.body,p.category,p.animalID,p.images,p.authorRole,p.authorID,p.createdAt,p.updatedAt,p.status,p.pinned,p.moderationReason,${nickname} nickname,a.animalName,
 (SELECT COUNT(*) FROM CommunityComments c WHERE c.postID=p.postID AND c.status='published') commentCount,
 (SELECT COUNT(*) FROM CommunityReactions r WHERE r.postID=p.postID AND r.kind='like') likeCount
 FROM CommunityPosts p LEFT JOIN CommunityProfiles cp ON p.authorRole='member' AND cp.memberID=p.authorID LEFT JOIN CommunitySeedProfiles sp ON p.authorRole='member' AND sp.authorID=p.authorID LEFT JOIN Animals a ON a.animalID=p.animalID`;
function expose(row,user){const images=typeof row.images==='string'?JSON.parse(row.images):row.images;return {...row,images:images||[],canEdit:!!user&&row.authorRole===user.role&&Number(row.authorID)===user.id,canModerate:user?.role==='admin',authorID:undefined,moderationReason:user?.role==='admin'?row.moderationReason:undefined}}
async function post(id,user,read=query){const [row]=await read(`${selectPost} WHERE p.postID=?`,[id]);if(!row||(row.status!=='published'&&user?.role!=='admin'))throw fail(404,'帖子不存在或暂不可见');return row}
const actionTimes=new Map();
function limitWrite(req,_res,next){const a=actor(req),key=`${a?.role}:${a?.id}`;const now=Date.now();let list=(actionTimes.get(key)||[]).filter(t=>now-t<60000);if(list.length>=30)return next(fail(429,'操作较频繁，请稍后再试'));list.push(now);actionTimes.set(key,list);if(actionTimes.size>2000)for(const [k,v]of actionTimes)if(now-v.at(-1)>60000)actionTimes.delete(k);next()}

communityRouter.get('/community/unread',route(async(req,res)=>{const a=actor(req);const rows=a?await query('SELECT COUNT(*) total FROM Notifications WHERE recipientRole=? AND recipientID=? AND isRead=0',[a.role,a.id]):[];res.json({role:a?.role||null,count:Number(rows[0]?.total||0)})}));
communityRouter.get('/community/profile',login,route(async(req,res)=>{const a=actor(req);const [profile]=a.role==='member'?await query('SELECT nickname FROM CommunityProfiles WHERE memberID=?',[a.id]):[];res.json({role:a.role,nickname:a.role==='admin'?'拾光守护 · 工作人员':profile?.nickname||`相伴者${a.id}`})}));
communityRouter.put('/community/profile',login,member,route(async(req,res)=>{const nickname=content(req.body.nickname,'昵称',20,2);await query('INSERT INTO CommunityProfiles(memberID,nickname) VALUES(?,?) ON DUPLICATE KEY UPDATE nickname=VALUES(nickname)',[req.session.member.id,nickname]);res.json({nickname})}));
communityRouter.get('/community/my-animals',login,route(async(req,res)=>{if(!req.session.member)return res.json([]);res.json(await query(`SELECT DISTINCT a.animalID,a.animalName FROM Animals a JOIN FostersAndAdoptions f ON f.animalID=a.animalID WHERE f.patronID=? AND f.fosteredOrAdopted='A'`,[req.session.member.patronID]))}));
communityRouter.get('/community/posts',route(async(req,res)=>{
 const page=Number(req.query.page||1),q=String(req.query.q||'').trim(),category=String(req.query.category||'all'),view=String(req.query.view||'all'),a=actor(req);
 if(!Number.isSafeInteger(page)||page<1||q.length>80||!['all',...categories].includes(category)||!['all','saved','mine'].includes(view))throw fail(400,'筛选参数无效');
 if(view!=='all'&&!a)throw fail(401,'请先登录后查看');
 const clauses=["p.status='published'"],values=[];
 if(category!=='all'){clauses.push('p.category=?');values.push(category)}if(q){clauses.push('(p.title LIKE ? OR p.body LIKE ?)');values.push(`%${q}%`,`%${q}%`)}
 if(view==='mine'){clauses.push('p.authorRole=? AND p.authorID=?');values.push(a.role,a.id)}
 if(view==='saved'){clauses.push("EXISTS(SELECT 1 FROM CommunityReactions r WHERE r.postID=p.postID AND r.actorRole=? AND r.actorID=? AND r.kind='save')");values.push(a.role,a.id)}
 const where=clauses.join(' AND '),[{total}]=await query(`SELECT COUNT(*) total FROM CommunityPosts p WHERE ${where}`,values),pages=Math.max(1,Math.ceil(total/12)),current=Math.min(page,pages);
 const rows=await query(`${selectPost} WHERE ${where} ORDER BY p.pinned DESC,p.createdAt DESC,p.postID DESC LIMIT 12 OFFSET ${Number((current-1)*12)}`,values);
 res.json({items:rows.map(row=>expose(row,a)),total:Number(total),page:current,pages});
}));
communityRouter.get('/community/posts/:id',route(async(req,res)=>{
 const id=positiveID(req.params.id),a=actor(req);
 const requestedPage=positiveID(req.query.commentsPage??1);
 const targetID=req.query.commentID==null?null:positiveID(req.query.commentID);
 const pageSize=30;
 const connection=await pool.getConnection();
 try {
  // Count, target rank and rows must reflect the same set of published replies.
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION READ ONLY');
  const read=async(sql,values)=>(await connection.execute(sql,values))[0];
  const row=await post(id,a,read);
  const commentPages=Math.max(1,Math.ceil(row.commentCount/pageSize));
  const [target]=targetID===null?[]:await read(`SELECT (
    SELECT COUNT(*) FROM CommunityComments earlier
    WHERE earlier.postID=c.postID AND earlier.status='published' AND earlier.commentID<c.commentID
   ) AS preceding FROM CommunityComments c
   WHERE c.commentID=? AND c.postID=? AND c.status='published'`,[targetID,id]);
  const commentsPage=target ? Math.floor(target.preceding/pageSize)+1 : Math.min(requestedPage,commentPages);
  const comments=await read(`SELECT c.commentID,c.body,c.parentID,c.createdAt,c.authorRole,c.authorID,
    CASE WHEN c.authorRole='admin' THEN '拾光守护 · 工作人员' ELSE COALESCE(cp.nickname,sp.nickname,CONCAT('相伴者',c.authorID)) END nickname
   FROM CommunityComments c
   LEFT JOIN CommunityProfiles cp ON c.authorRole='member' AND cp.memberID=c.authorID
   LEFT JOIN CommunitySeedProfiles sp ON c.authorRole='member' AND sp.authorID=c.authorID
   WHERE c.postID=? AND c.status='published' ORDER BY c.commentID LIMIT ? OFFSET ?`,[id,pageSize,(commentsPage-1)*pageSize]);
  const reactions=a?await read('SELECT kind FROM CommunityReactions WHERE postID=? AND actorRole=? AND actorID=?',[id,a.role,a.id]):[];
  await connection.commit();
  res.json({...expose(row,a),liked:reactions.some(r=>r.kind==='like'),saved:reactions.some(r=>r.kind==='save'),
   commentsPage,commentPages,commentUnavailable:targetID!==null&&!target,
   comments:comments.map(c=>({...c,canDelete:owner(c,a),authorID:undefined}))});
 } catch (error) {
  await connection.rollback();
  throw error;
 } finally {
  connection.release();
 }
}));
async function postInput(req){
 const a=actor(req),title=content(req.body.title,'标题',80,2),body=content(req.body.body,'正文',6000,5),category=req.body.category;
 if(!categories.includes(category)||(category==='announcement'&&a.role!=='admin'))throw fail(400,'请选择有效的讨论分类');
 const animalID=req.body.animalID?positiveID(req.body.animalID):null;
 if(animalID){if(a.role==='admin'){if(!(await query('SELECT animalID FROM Animals WHERE animalID=?',[animalID])).length)throw fail(400,'动物档案不存在')}
 else if(!(await query("SELECT animalID FROM FostersAndAdoptions WHERE animalID=? AND patronID=? AND fosteredOrAdopted='A'",[animalID,req.session.member.patronID])).length)throw fail(403,'只能关联自己已经领养的动物')}
 const images=req.body.images??[];if(!Array.isArray(images)||images.length>4||images.some(s=>typeof s!=='string'))throw fail(400,'每篇最多4张图片');
 return {title,body,category,animalID,images:[...new Set(images)]};
}
async function savePost(req,res){
 const a=actor(req),id=req.params.id?positiveID(req.params.id):null,p=await postInput(req);
 const connection=await pool.getConnection();
 try {
  await connection.beginTransaction();
  if(id){
   const [[row]]=await connection.execute('SELECT authorRole,authorID,status FROM CommunityPosts WHERE postID=? FOR UPDATE',[id]);
   if(!row||(row.status!=='published'&&a.role!=='admin'))throw fail(404,'帖子不存在或暂不可见');
   if(row.authorRole!==a.role||Number(row.authorID)!==a.id)throw fail(403,'只能编辑自己的帖子');
   if(row.status!=='published')throw fail(409,'请先恢复帖子再编辑');
  }
  const photos=await usePhotoDrafts(connection,'community',p.images,a);
  const fields=[p.title,p.body,p.category,p.animalID,JSON.stringify(p.images)];
  if(id){
   await connection.execute('UPDATE CommunityPosts SET title=?,body=?,category=?,animalID=?,images=? WHERE postID=?',[...fields,id]);
   await commitPhotoDrafts(connection,photos);
   return res.json({ok:true});
  }
  const [result]=await connection.execute('INSERT INTO CommunityPosts(title,body,category,animalID,images,authorRole,authorID) VALUES(?,?,?,?,?,?,?)',[...fields,a.role,a.id]);
  await commitPhotoDrafts(connection,photos);
  res.status(201).json({postID:result.insertId});
 } catch(error){
  await connection.rollback();
  throw error;
 } finally{connection.release()}
}
communityRouter.post('/community/posts',login,limitWrite,route(savePost));
communityRouter.put('/community/posts/:id',login,limitWrite,route(savePost));
communityRouter.delete('/community/posts/:id',login,route(async(req,res)=>{const a=actor(req),id=positiveID(req.params.id),row=await post(id,a);if(row.authorRole!==a.role||Number(row.authorID)!==a.id)throw fail(403,'只能撤下自己的帖子');await query("UPDATE CommunityPosts SET status='deleted' WHERE postID=?",[id]);res.json({ok:true})}));
communityRouter.post('/community/posts/:id/reactions',login,limitWrite,route(async(req,res)=>{const id=positiveID(req.params.id),a=actor(req),kind=req.body.kind;await post(id,a);if(!['like','save'].includes(kind)||typeof req.body.active!=='boolean')throw fail(400,'操作参数无效');if(req.body.active)await query('INSERT IGNORE INTO CommunityReactions(postID,actorRole,actorID,kind) VALUES(?,?,?,?)',[id,a.role,a.id,kind]);else await query('DELETE FROM CommunityReactions WHERE postID=? AND actorRole=? AND actorID=? AND kind=?',[id,a.role,a.id,kind]);res.json({ok:true})}));
communityRouter.post('/community/posts/:id/comments',login,limitWrite,route(async(req,res)=>{const id=positiveID(req.params.id),a=actor(req),body=content(req.body.body,'回复',2000),parentID=req.body.parentID?positiveID(req.body.parentID):null;const commentID=await publishCommunityReply({postID:id,actor:a,body,parentID});res.status(201).json({commentID})}));
communityRouter.delete('/community/comments/:id',login,route(async(req,res)=>{const a=actor(req),id=positiveID(req.params.id),[row]=await query('SELECT authorRole,authorID FROM CommunityComments WHERE commentID=?',[id]);if(!row)throw fail(404,'回复不存在');if(row.authorRole!==a.role||Number(row.authorID)!==a.id)throw fail(403,'只能撤下自己的回复');await query("UPDATE CommunityComments SET status='deleted' WHERE commentID=?",[id]);res.json({ok:true})}));
communityRouter.post('/community/reports',login,member,limitWrite,route(async(req,res)=>{const targetID=positiveID(req.body.targetID),type=req.body.targetType,reason=content(req.body.reason,'举报原因',300,2);if(!['post','comment'].includes(type))throw fail(400,'举报对象无效');if(type==='post')await post(targetID,actor(req));else if(!(await query("SELECT c.commentID FROM CommunityComments c JOIN CommunityPosts p ON p.postID=c.postID WHERE c.commentID=? AND c.status='published' AND p.status='published'",[targetID])).length)throw fail(404,'回复已不可见');await query("INSERT INTO CommunityReports(targetType,targetID,memberID,reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),status='open',resolution=NULL",[type,targetID,req.session.member.id,reason]);res.status(201).json({ok:true})}));
communityRouter.get('/community/photos/:filename',route(async(req,res)=>{
 const name=req.params.filename;if(!/^community-[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name))throw fail(404,'照片不存在');
 const url=`/api/community/photos/${name}`,a=actor(req),[upload]=await query('SELECT actorRole,actorID FROM CommunityUploads WHERE url=?',[url]);
 if(!upload){
  const draft=await communityPhotoDraft(url,a);
  if(!draft)throw fail(404,'照片当前不可见');
  res.set('Cache-Control','no-store');return res.sendFile(draft);
 }
 const published=(await query("SELECT postID FROM CommunityPosts WHERE status='published' AND JSON_CONTAINS(images,?) LIMIT 1",[JSON.stringify(url)])).length;
 if(!published&&!(a&&(a.role==='admin'||(upload.actorRole===a.role&&upload.actorID===a.id))))throw fail(404,'照片当前不可见');
 res.set('Cache-Control','no-store');res.sendFile(path.join(import.meta.dirname,'community-photos',name));
}));
communityRouter.post('/community/photos',login,limitWrite,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),route(async(req,res)=>{
 const url=await stagePhoto('community',req.body,actor(req));
 res.status(201).json({url});
}));
communityRouter.get('/admin/community',login,admin,route(async(req,res)=>{
 const tab=String(req.query.tab||'posts'),page=Number(req.query.page||1);if(!['posts','comments','reports'].includes(tab)||!Number.isSafeInteger(page)||page<1)throw fail(400,'分页参数无效');
 const table={posts:'CommunityPosts',comments:'CommunityComments',reports:'CommunityReports'}[tab],count=await query(`SELECT COUNT(*) total FROM ${table}`),pages=Math.max(1,Math.ceil(count[0].total/30)),current=Math.min(page,pages),offset=(current-1)*30;
 let rows;if(tab==='posts')rows=(await query(`${selectPost} ORDER BY p.postID DESC LIMIT 30 OFFSET ${offset}`)).map(r=>expose(r,actor(req)));else if(tab==='comments')rows=await query(`SELECT c.commentID,c.postID,c.body,c.status,c.createdAt,c.moderationReason,p.title FROM CommunityComments c JOIN CommunityPosts p ON p.postID=c.postID ORDER BY c.commentID DESC LIMIT 30 OFFSET ${offset}`);else rows=await query(`SELECT r.reportID,r.targetType,r.targetID,r.reason,r.status,r.resolution,r.createdAt,CASE WHEN r.targetType='post' THEN p.postID ELSE c.postID END postID,CASE WHEN r.targetType='post' THEN p.title ELSE c.body END targetText FROM CommunityReports r LEFT JOIN CommunityPosts p ON r.targetType='post' AND p.postID=r.targetID LEFT JOIN CommunityComments c ON r.targetType='comment' AND c.commentID=r.targetID ORDER BY r.status='open' DESC,r.reportID DESC LIMIT 30 OFFSET ${offset}`);
 res.json({items:rows,pages,page:current,total:Number(count[0].total)});
}));
communityRouter.put('/admin/community/:type/:id',login,admin,route(async(req,res)=>{
 const id=positiveID(req.params.id),type=req.params.type,reason=content(req.body.reason,'处理说明',300,2);if(!['post','comment','report'].includes(type))throw fail(400,'管理对象无效');
 const status=req.body.status,table={post:'CommunityPosts',comment:'CommunityComments',report:'CommunityReports'}[type],key={post:'postID',comment:'commentID',report:'reportID'}[type];
 if(!(type==='report'?['resolved']:['published','hidden']).includes(status))throw fail(400,'处理状态无效');if(!(await query(`SELECT ${key} FROM ${table} WHERE ${key}=?`,[id])).length)throw fail(404,'记录不存在');
 await query(type==='report'?`UPDATE ${table} SET status=?,resolution=? WHERE ${key}=?`:`UPDATE ${table} SET status=?,moderationReason=?${type==='post'?',pinned=?':''} WHERE ${key}=?`,type==='post'?[status,reason,req.body.pinned?1:0,id]:[status,reason,id]);res.json({ok:true});
}));
