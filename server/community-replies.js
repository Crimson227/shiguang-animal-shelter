import {pool} from './db.js';
export async function publishCommunityReply({postID,actor,body,parentID}){
 const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [[post]]=await c.execute("SELECT authorRole,authorID,title FROM CommunityPosts WHERE postID=? AND status='published' FOR UPDATE",[postID]);
  if(!post)throw Object.assign(new Error('帖子不存在或暂不可见'),{status:404});
  let parent;
  if(parentID){[[parent]]=await c.execute("SELECT authorRole,authorID FROM CommunityComments WHERE commentID=? AND postID=? AND status='published' FOR UPDATE",[parentID,postID]);if(!parent)throw Object.assign(new Error('原回复已不可见，请刷新'),{status:400})}
  const [result]=await c.execute('INSERT INTO CommunityComments(postID,body,parentID,authorRole,authorID) VALUES(?,?,?,?,?)',[postID,body,parentID,actor.role,actor.id]);
  const recipients=new Map();
  for(const target of [post,parent])if(target&&target.authorID>0&&!(target.authorRole===actor.role&&Number(target.authorID)===actor.id))recipients.set(`${target.authorRole}:${target.authorID}`,target);
  for(const target of recipients.values()){
   const table=target.authorRole==='admin'?'Admins':'MemberAccounts',key=target.authorRole==='admin'?'adminID':'memberID';
   const [[exists]]=await c.query(`SELECT ${key} FROM ${table} WHERE ${key}=?`,[target.authorID]);if(!exists)continue;
   const isReply=parent&&parent.authorRole===target.authorRole&&Number(parent.authorID)===Number(target.authorID);
   await c.execute('INSERT INTO Notifications(recipientRole,recipientID,title,body,communityPostID,communityCommentID) VALUES(?,?,?,?,?,?)',[target.authorRole,target.authorID,isReply?'有人回复了你的留言':'你的社区帖子有新回复',`《${post.title}》有了新的讨论，点击查看。`,postID,result.insertId]);
  }
  await c.commit();return result.insertId;
 }catch(e){await c.rollback();throw e}finally{c.release()}
}
