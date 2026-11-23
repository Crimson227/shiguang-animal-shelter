import path from 'node:path';
import {lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {normalizeBackupPath} from './backup-paths.js';

const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export const restoreWorkspace=new RegExp(`^\\.restore-${uuid}$`);
const backupID=new RegExp(`^${uuid}$`);

function statePath(workRoot,database) {
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('数据库名称无效。');
  return path.join(workRoot,`recovery-${database}.json`);
}

export async function readRestoreState(workRoot,database) {
  const file=statePath(workRoot,database);
  let info;
  try { info=await lstat(file); }
  catch(error) { if(error.code==='ENOENT')return null; throw error; }
  const invalid=()=>new Error('恢复状态文件无效，请保留安全备份和状态文件并联系维护人员。');
  if (!info.isFile() || info.size>16384) throw invalid();
  const resolved=await normalizeBackupPath(file);
  let state;
  try { state=JSON.parse(await readFile(resolved,'utf8')); } catch { throw invalid(); }
  if (state?.version!==1 || state.database!==database || !['rollback','cleanup'].includes(state.phase)
      || typeof state.safetyBackupID!=='string' || !backupID.test(state.safetyBackupID)
      || typeof state.workName!=='string' || !restoreWorkspace.test(state.workName)
      || typeof state.root!=='string' || !path.isAbsolute(state.root)
      || typeof state.host!=='string' || !Number.isSafeInteger(state.port)
      || !state.media || typeof state.media!=='object' || Array.isArray(state.media)) {
    throw invalid();
  }
  return state;
}

export async function saveRestoreState(workRoot,state) {
  const file=statePath(await normalizeBackupPath(workRoot),state.database), next=`${file}.next`;
  await unlink(next).catch(error=>{if(error.code!=='ENOENT')throw error});
  await writeFile(next,JSON.stringify(state),{flag:'wx',mode:0o600,flush:true});
  await rename(next,file);
}

export async function clearRestoreState(workRoot,database) {
  const file=statePath(await normalizeBackupPath(workRoot),database);
  await unlink(`${file}.next`).catch(error=>{if(error.code!=='ENOENT')throw error});
  await unlink(file);
}
