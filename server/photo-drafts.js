import crypto from 'node:crypto';
import path from 'node:path';
import {link,lstat,mkdir,readdir,unlink,writeFile} from 'node:fs/promises';
import {pool,query} from './db.js';
import {validatePhoto} from './photo-validation.js';

const stageDirectory=path.join(import.meta.dirname,'photo-drafts');
const draftMinutes=30;
const kinds={
  animal:{prefix:'imgs/animals/',filename:'animal-photo-',directory:path.join(import.meta.dirname,'imgs','animals')},
  community:{prefix:'/api/community/photos/',filename:'community-',directory:path.join(import.meta.dirname,'community-photos')},
};
const imageName=/^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const unavailable=message=>Object.assign(new Error(message),{status:400});

function photoPaths(kind,url) {
  const {prefix,filename,directory}=kinds[kind];
  if (typeof url!=='string'||!url.startsWith(prefix+filename)) return null;
  const name=url.slice(prefix.length);
  if (!imageName.test(name.slice(filename.length))) return null;
  return {url,name,directory,staged:path.join(stageDirectory,name),published:path.join(directory,name)};
}

const statFile=filename=>lstat(filename,{bigint:true}).catch(error=>{
  if (error.code!=='ENOENT') throw error;
});
const remove=filename=>unlink(filename).catch(error=>{
  if (error.code!=='ENOENT') throw error;
});
async function isDraftLink(photo) {
  const [staged,published]=await Promise.all([statFile(photo.staged),statFile(photo.published)]);
  return staged?.isFile()&&published?.isFile()&&staged.dev===published.dev&&staged.ino===published.ino;
}
async function removeDraftLink(photo) {
  // A pending upload can only remove the hard link to its own staged file.
  if (await isDraftLink(photo)) await remove(photo.published);
}

export async function stagePhoto(kind,bytes,owner) {
  const extension=await validatePhoto(bytes);
  const {prefix,filename}=kinds[kind];
  const url=prefix+filename+crypto.randomUUID()+'.'+extension;
  const {staged}=photoPaths(kind,url);
  await mkdir(stageDirectory,{recursive:true});
  await writeFile(staged,bytes,{flag:'wx'});
  try {
    await query('INSERT INTO PhotoDrafts(url,actorRole,actorID,expiresAt) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))',
      [url,owner.role,owner.id,draftMinutes]);
  } catch (error) {
    await remove(staged).catch(cleanupError=>console.error('Photo staging cleanup failed:',cleanupError));
    throw error;
  }
  return url;
}

export async function communityPhotoDraft(url,owner) {
  if (!owner) return null;
  const photo=photoPaths('community',url);
  if (!photo) return null;
  const [draft]=await query('SELECT url FROM PhotoDrafts WHERE url=? AND actorRole=? AND actorID=? AND expiresAt>NOW()',
    [url,owner.role,owner.id]);
  return draft?photo.staged:null;
}

export async function isUnpublishedAnimalPhoto(url) {
  const photo=photoPaths('animal',url);
  if (!photo) return false;
  const [draft]=await query('SELECT url FROM PhotoDrafts WHERE url=?',[url]);
  return Boolean(draft);
}

export async function usePhotoDrafts(connection,kind,urls,owner) {
  const photos=[];
  for (const url of [...urls].sort()) {
    const photo=photoPaths(kind,url);
    if (kind==='animal'&&!photo) continue;
    const [[draft]]=await connection.execute(
      'SELECT actorRole,actorID,expiresAt<=NOW() expired FROM PhotoDrafts WHERE url=? FOR UPDATE',[url]);
    if (!photo||!draft) {
      if (kind==='animal') {
        if ((await statFile(photo.published))?.isFile()) continue;
        throw unavailable('照片已失效，请重新选择。');
      }
      const [[existing]]=await connection.execute(
        'SELECT uploadID FROM CommunityUploads WHERE url=? AND actorRole=? AND actorID=? FOR SHARE',[url,owner.role,owner.id]);
      if (!existing) throw unavailable('请使用本人上传的社区图片，过期照片请重新选择。');
      continue;
    }
    if (draft.actorRole!==owner.role||draft.actorID!==owner.id||draft.expired||!(await statFile(photo.staged))?.isFile()) {
      throw unavailable('照片不可用，请重新选择本人上传的图片。');
    }
    await connection.execute('DELETE FROM PhotoDrafts WHERE url=?',[url]);
    if (kind==='community') await connection.execute(
      'INSERT INTO CommunityUploads(url,actorRole,actorID) VALUES(?,?,?)',[url,owner.role,owner.id]);
    photos.push(photo);
  }
  return photos;
}

export function useAnimalPhotoDraft(connection,pictureURL,adminID) {
  const url=typeof pictureURL==='string'?pictureURL.replace(/^\//,''):null;
  return usePhotoDrafts(connection,'animal',[url],{role:'admin',id:adminID});
}

export async function commitPhotoDrafts(connection,photos) {
  const linked=[];
  try {
    for (const photo of photos) {
      await mkdir(photo.directory,{recursive:true});
      try { await link(photo.staged,photo.published); }
      catch (error) { if (error.code!=='EEXIST'||!await isDraftLink(photo)) throw error; }
      linked.push(photo);
    }
  } catch (error) {
    await Promise.allSettled(linked.map(removeDraftLink));
    throw error;
  }
  // If the connection drops during commit, only the database can tell whether the links are live.
  await connection.commit();
  await Promise.allSettled(photos.map(photo=>remove(photo.staged)));
}

export async function cleanPhotoDrafts(recover=false) {
  const drafts=await query('SELECT url FROM PhotoDrafts'+(recover?'':' WHERE expiresAt<=NOW()'));
  for (const {url} of drafts) {
    const photo=photoPaths('animal',url)||photoPaths('community',url);
    if (!photo) continue;
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[draft]]=await connection.execute('SELECT expiresAt<=NOW() expired FROM PhotoDrafts WHERE url=? FOR UPDATE',[url]);
      if (draft&&(recover||draft.expired)) {
        await removeDraftLink(photo);
        if (draft.expired) {
          await remove(photo.staged);
          await connection.execute('DELETE FROM PhotoDrafts WHERE url=?',[url]);
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  const names=await readdir(stageDirectory).catch(error=>{
    if (error.code==='ENOENT') return [];
    throw error;
  });
  const cutoff=Date.now()-draftMinutes*60*1000;
  for (const name of names) {
    const photo=photoPaths('animal',kinds.animal.prefix+name)||photoPaths('community',kinds.community.prefix+name);
    if (!photo) continue;
    const staged=await statFile(photo.staged);
    if (!staged?.isFile()||Number(staged.mtimeMs)>cutoff) continue;
    const [draft]=await query('SELECT url FROM PhotoDrafts WHERE url=?',[photo.url]);
    if (!draft) await remove(photo.staged);
  }
}
