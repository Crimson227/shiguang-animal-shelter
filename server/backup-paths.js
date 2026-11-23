import path from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {backupError} from './backup-crypto.js';

export function pathsOverlap(first,second) {
  const within=(parent,child)=>{
    const relative=path.relative(parent,child);
    return relative==='' || (relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative));
  };
  return within(first,second)||within(second,first);
}

export function assertBackupKeyOutside(keyFile,directories) {
  if (directories.some(directory=>pathsOverlap(keyFile,directory))) {
    throw backupError('备份加密密钥必须放在独立的本机配置目录，不能放在源码、公开媒体或工作目录中。',409);
  }
}

export async function normalizeBackupPath(input) {
  const absolute=path.resolve(input), {root}=path.parse(absolute);
  const parts=absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current=root;
  for (const [index,part] of parts.entries()) {
    const next=path.join(current,part);
    let info;
    try { info=await lstat(next); }
    catch(error) {
      if (error.code==='ENOENT') {
        const base=await realpath(current).catch(err=>{
          if (err.code==='ENOENT' && current===root) return root;
          throw err;
        });
        return path.join(base,...parts.slice(index));
      }
      throw error;
    }
    if (info.isSymbolicLink()) throw backupError('备份路径包含链接或目录联接，请指定实际位置。',409);
    current=next;
  }
  // Windows can redirect a normal per-user folder without exposing a junction.
  return realpath(current);
}

const localPath=value=>typeof value==='string' && path.isAbsolute(value)
  && (process.platform!=='win32' || /^[a-z]:[\\/]/i.test(value));

export async function resolveBackupLocations(runtime,serverDirectory,rootPath,keyPath) {
  if (!localPath(rootPath)||!localPath(keyPath)) {
    throw backupError('备份和密钥需要本机磁盘的绝对路径。',409);
  }
  const [root,keyFile,legacyRoot,workRoot,animalImages,communityImages,staticSite,photoDrafts]=await Promise.all([
    normalizeBackupPath(rootPath),normalizeBackupPath(keyPath),
    normalizeBackupPath(path.join(runtime,'system-backups')),normalizeBackupPath(path.join(runtime,'backup-work')),
    normalizeBackupPath(path.join(serverDirectory,'imgs')),normalizeBackupPath(path.join(serverDirectory,'community-photos')),
    normalizeBackupPath(path.resolve(serverDirectory,'../client/dist')),normalizeBackupPath(path.join(serverDirectory,'photo-drafts')),
  ]);
  const publicDirectories=[animalImages,communityImages,staticSite];
  const project=path.resolve(serverDirectory,'..');
  const hasRepository=await lstat(path.join(project,'.git')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error});
  assertBackupKeyOutside(keyFile,[...publicDirectories,workRoot,...(hasRepository?[project]:[])]);
  const protectedPaths=[workRoot,keyFile,path.join(runtime,'credentials.json'),path.join(runtime,'backup-settings.json'),photoDrafts,...publicDirectories];
  if (protectedPaths.some(value=>pathsOverlap(root,value)||pathsOverlap(legacyRoot,value)) ||
      (path.relative(root,legacyRoot)!=='' && pathsOverlap(root,legacyRoot))) {
    throw backupError('备份目录必须与密钥、本机配置、工作目录、原备份目录和网站媒体分开。',409);
  }
  return {root,keyFile,legacyRoot,workRoot,media:{'animal-images':animalImages,'community-images':communityImages}};
}

if (process.argv[1] && path.relative(fileURLToPath(import.meta.url),path.resolve(process.argv[1]))==='') {
  try {
    const [runtime,serverDirectory,rootPath,keyPath]=process.argv.slice(2);
    await resolveBackupLocations(await normalizeBackupPath(runtime),serverDirectory,rootPath,keyPath);
  } catch(error) {
    console.error(error.status ? error.message : '无法核对备份目录，请检查本机路径与权限。');
    process.exitCode=1;
  }
}
