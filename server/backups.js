import express from 'express';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import {query} from './db.js';
import {BackupService} from './backup-service.js';
import {readRestoreState} from './restore-state.js';
import {backupError} from './backup-crypto.js';
import {normalizeBackupPath,resolveBackupLocations} from './backup-paths.js';
import {limitAuth} from './auth.js';
import {migrate} from './migrations.js';
import {migrateCommunity} from './community-migrations.js';
import {cleanPhotoDrafts} from './photo-drafts.js';
import {recoveryMessage,requireBackupRecovery,trackDatabaseWork,withBackupMaintenance} from './backup-gate.js';

const here=import.meta.dirname;
const runtimePath=path.resolve(process.env.LOCALAPPDATA||here,'AnimalShelterMySQL');
const database=process.env.DB_NAME||'animal_shelter_react';
let service;
async function getService(recoveryRoot) {
  if (service && !recoveryRoot) return service;
  const runtime=await normalizeBackupPath(runtimePath);
  let credentials;
  try { credentials=JSON.parse((await readFile(path.join(runtime,'credentials.json'),'utf8')).trim()); }
  catch { throw backupError('无法读取备份所需的本机数据库配置。',409); }
  if (typeof credentials?.rootPassword!=='string') {
    throw backupError('备份所需的本机数据库配置不完整。',409);
  }
  let settings={};
  if (!recoveryRoot) {
    try {
      settings=JSON.parse((await readFile(path.join(runtime,'backup-settings.json'),'utf8')).trim());
    } catch(error) {
      if (error.code!=='ENOENT') throw backupError('备份配置无法读取，请检查本机设置。',409);
    }
  }
  if (!settings || typeof settings!=='object' || Array.isArray(settings)) throw backupError('备份配置格式无效。',409);
  const rootPath=recoveryRoot||process.env.SHELTER_BACKUP_ROOT||settings.directory||path.join(runtime,'system-backups');
  const keyPath=process.env.SHELTER_BACKUP_KEY_FILE||path.join(runtime,'backup.key');
  const retentionDays=settings.retentionDays??90;
  if (!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>3650) {
    throw backupError('备份保留提示天数应为 1 到 3650。',409);
  }
  const locations=await resolveBackupLocations(runtime,here,rootPath,keyPath);
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('数据库名称无效。');
  const instance=new BackupService({database,...locations,retentionDays,
    afterRestore:recoveryRoot?undefined:async()=>{await migrate();await migrateCommunity()},
    bin:process.env.MYSQL_BIN||path.join(process.env.ProgramFiles||'C:/Program Files','MySQL/MySQL Server 8.4/bin'),
    connection:{host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:'root',password:credentials.rootPassword}});
  if (!recoveryRoot) service=instance;
  return instance;
}

export async function recoverInterruptedRestore() {
  const state=await readRestoreState(path.join(runtimePath,'backup-work'),database);
  if (!state) return;
  try {
    const recovery=await getService(state.root);
    if (await recovery.resumeInterruptedRestore()) console.log('已处理上次中断的恢复，并清理临时文件。');
  } catch(error) {
    throw new Error(`上次恢复中断，系统暂未启动。${error.message}请保留安全备份和恢复状态，核对配置后重新启动。`);
  }
}

function exclusively(req,work) {
  return withBackupMaintenance(req,async()=>{
    await cleanPhotoDrafts(true);
    return work(await getService());
  });
}

export const backupRouter=express.Router();
backupRouter.use('/admin/backups',(req,res,next)=>req.session.admin?next():res.status(403).json({error:'只有管理员可以管理备份。'}));
const wrap=fn=>(req,res)=>{
  if(res.destroyed)return;
  void Promise.resolve(fn(req,res)).catch(error=>{
    if (error.status) return res.status(error.status).json({error:error.message});
    const clear=['备份','恢复','数据库','找不到'].some(prefix=>error.message.startsWith(prefix));
    return res.status(500).json({error:clear?error.message:'备份服务不可用，请检查数据库工具、磁盘和本机配置。'});
  });
};
const readRoute=fn=>wrap((req,res)=>trackDatabaseWork(()=>fn(req,res)));

backupRouter.get('/admin/backups',readRoute(async(_req,res)=>{
  const s=await getService();
  const [listed,encryption]=await Promise.all([s.list(),s.keyStatus()]);
  const cutoff=Date.now()-s.config.retentionDays*86400000;
  const items=listed.map(item=>({...item,overdue:Date.parse(item.createdAt)<cutoff}));
  res.json({items,directory:s.config.root,legacyDirectory:s.roots[1]||null,encryption,retentionDays:s.config.retentionDays,
    totalBytes:items.reduce((sum,item)=>sum+item.bytes,0),overdueCount:items.filter(item=>item.overdue).length});
}));

backupRouter.post('/admin/backups',wrap(async(req,res)=>{
  const result=await exclusively(req,s=>s.snapshot());
  res.status(201).json({id:result.id,encrypted:true});
}));

backupRouter.post('/admin/backups/:id/verify',readRoute(async(req,res)=>{
  const s=await getService();
  res.json({ok:true,...await s.verify(req.params.id)});
}));

backupRouter.post('/admin/backups/:id/restore',limitAuth,wrap(async(req,res)=>{
  if (req.body?.confirmation!=='恢复') return res.status(400).json({error:'请填写“恢复”确认本次操作。'});
  const verified=await trackDatabaseWork(async()=>{
    const [admin]=await query('SELECT password FROM Admins WHERE adminID=?',[req.session.admin.id]);
    return admin&&typeof req.body.password==='string'&&req.body.password.length<=100&&await bcrypt.compare(req.body.password,admin.password);
  });
  if(res.destroyed)return;
  if(!verified)return res.status(403).json({error:'当前管理员密码不正确。'});
  const result=await exclusively(req,async s=>{
    try { return await s.restore(req.params.id); }
    catch(error) {
      if (await s.restoreState().catch(()=>true)) {
        requireBackupRecovery();
        throw backupError(recoveryMessage,503);
      }
      throw error;
    }
  });
  res.json({ok:true,...result});
}));
