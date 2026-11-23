import {access,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool} from './db.js';
import {migrateCommunity} from './community-migrations.js';
import {communitySeedKey,communityWriters,communityStories} from './community-content-data.js';

// Reserved negative author IDs identify fictional contributors, never login accounts.
const authors=new Map(communityWriters.map((writer,index)=>[writer.key,-28001-index]));
const here=path.dirname(fileURLToPath(import.meta.url));
const connection=await pool.getConnection();
const run=async(sql,args=[])=>(await connection.execute(sql,args))[0];
let locked=false;
try{
 await migrateCommunity();
 await run('CREATE TABLE IF NOT EXISTS ContentSeedRuns(seedKey VARCHAR(80) PRIMARY KEY,appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
 const [lock]=await run('SELECT GET_LOCK(?,10) acquired',[communitySeedKey]);
 if(lock.acquired!==1)throw new Error('社区内容正在补充，请稍后再试。');
 locked=true;
 const [already]=await run('SELECT seedKey FROM ContentSeedRuns WHERE seedKey=?',[communitySeedKey]);
 if(already){console.log(JSON.stringify({skipped:true,reason:'This content batch is already present.'}));}
 else{
  const [staff]=await run('SELECT adminID FROM Admins ORDER BY adminID LIMIT 1');
  if(!staff)throw new Error('缺少工作人员账号，未写入内容。');
  for(const story of communityStories)for(const image of story.images||[])await access(path.join(here,image.replace(/^\/imgs\//,'imgs/')));
  const tables=['CommunityProfiles','CommunityPosts','CommunityComments','CommunityReactions','CommunityReports','CommunityUploads'];
  const backup={version:1,beforeSeed:communitySeedKey,tables:{}};
  for(const table of tables)backup.tables[table]=await run(`SELECT * FROM ${table}`);
  const backupDir=path.join(process.env.LOCALAPPDATA||path.join(here,'..'),'AnimalShelterMySQL','backups');
  await mkdir(backupDir,{recursive:true});
  const backupFile=path.join(backupDir,`community-before-${Date.now()}.json`);
  await writeFile(backupFile,JSON.stringify(backup,null,2),{flag:'wx'});
  await connection.beginTransaction();
  const postIDs=[];
  let comments=0,likes=0;
  for(const writer of communityWriters){
   const id=authors.get(writer.key);
   const [collision]=await run('SELECT authorID FROM CommunitySeedProfiles WHERE authorID=?',[id]);
   if(collision)throw new Error('社区预设作者编号已占用，未覆盖原有资料。');
   await run('INSERT INTO CommunitySeedProfiles(authorID,nickname,seedKey) VALUES(?,?,?)',[id,writer.nickname,communitySeedKey]);
  }
  for(const [index,story] of communityStories.entries()){
   const authorRole=story.by==='staff'?'admin':'member';
   const authorID=story.by==='staff'?staff.adminID:authors.get(story.by);
   const inserted=await run('INSERT INTO CommunityPosts(authorRole,authorID,title,body,category,animalID,images,pinned,createdAt,updatedAt) VALUES(?,?,?,?,?,NULL,?,?,DATE_SUB(NOW(),INTERVAL ? MINUTE),DATE_SUB(NOW(),INTERVAL ? MINUTE))',[authorRole,authorID,story.title,story.body,story.category,JSON.stringify(story.images||[]),story.pinned?1:0,story.ageMinutes,story.ageMinutes]);
   postIDs.push(inserted.insertId);
   const commentIDs=[];
   for(const [replyIndex,reply] of story.comments.entries()){
    const delay=Math.min(story.ageMinutes-10,17+replyIndex*29+(index%5)*7);
    const result=await run('INSERT INTO CommunityComments(postID,authorRole,authorID,parentID,body,createdAt) VALUES(?,\'member\',?,?,?,DATE_SUB(NOW(),INTERVAL ? MINUTE))',[inserted.insertId,authors.get(reply.by),reply.replyTo==null?null:commentIDs[reply.replyTo],reply.text,story.ageMinutes-delay]);
    commentIDs.push(result.insertId);comments++;
   }
   const participants=communityWriters.filter(w=>w.key!==story.by);
   for(let n=0;n<2+index%5;n++){
    const voter=participants[(index+n)%participants.length];
    await run('INSERT IGNORE INTO CommunityReactions(postID,actorRole,actorID,kind) VALUES(?,\'member\',?,\'like\')',[inserted.insertId,authors.get(voter.key)]);likes++;
   }
  }
  await run('INSERT INTO ContentSeedRuns(seedKey) VALUES(?)',[communitySeedKey]);
  await connection.commit();
  console.log(JSON.stringify({skipped:false,posts:postIDs.length,comments,writers:authors.size,likes,photoPosts:communityStories.filter(p=>p.images?.length).length,postIDs,backupFile}));
 }
}catch(error){await connection.rollback();console.error(error.message);process.exitCode=1}
finally{if(locked)await run('SELECT RELEASE_LOCK(?)',[communitySeedKey]);connection.release();await pool.end()}
