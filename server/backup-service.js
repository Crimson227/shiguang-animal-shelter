import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,readdir,lstat,copyFile,rename,rm,realpath} from 'node:fs/promises';
import {Readable,Writable} from 'node:stream';
import path from 'node:path';
import {photoDraftTable} from './migrations.js';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import {backupError,encryptedSize,encryptBackupFile,decryptBackupFile} from './backup-crypto.js';
import {normalizeBackupPath} from './backup-paths.js';
import {readRestoreState,saveRestoreState,clearRestoreState,restoreWorkspace} from './restore-state.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const validName = value => typeof value==='string' && /^[a-zA-Z0-9_]+$/.test(value);
const maxManifestBytes = 16*1024*1024;
const manifestAAD = m => JSON.stringify(['shelter-backup-v2',m.id,m.database,m.createdAt,m.reason,m.bytes,m.fileCount]);
const entryAAD = (id,index) => JSON.stringify(['shelter-backup-v2',id,index]);
const entryName = index => `file-${String(index+1).padStart(6,'0')}.enc`;
const samePath = (a,b) => path.relative(a,b)==='';

async function safeDirectory(directory,create=false) {
  const resolved=await normalizeBackupPath(directory);
  if (create) await mkdir(resolved,{recursive:true,mode:0o700});
  const info=await lstat(resolved);
  if (!info.isDirectory() || !samePath(resolved,await realpath(resolved))) {
    throw backupError('备份目录必须是本机或指定磁盘上的实际目录。',409);
  }
  return resolved;
}

async function directoryEntries(directory) {
  try {
    await safeDirectory(directory);
    return await readdir(directory,{withFileTypes:true});
  } catch(error) {
    if (error.code==='ENOENT') return [];
    throw error;
  }
}

export async function copyMedia(from,to) {
  await mkdir(to,{recursive:true,mode:0o700});
  for (const item of await directoryEntries(from)) {
    const src=path.join(from,item.name),dest=path.join(to,item.name);
    if (item.isSymbolicLink()) throw backupError('照片或备份目录包含链接，无法安全复制。');
    if (item.isDirectory()) await copyMedia(src,dest);
    else if (item.isFile()) await copyFile(src,dest);
    else throw backupError('备份目录包含不支持的文件。');
  }
}

async function files(root,relative='') {
  const result=[];
  for (const item of await directoryEntries(path.join(root,relative))) {
    const name=path.posix.join(relative,item.name);
    if (item.isDirectory()) result.push(...await files(root,name));
    else if (item.isFile()) result.push(name);
    else throw backupError('照片或备份目录包含链接或不支持的文件。');
  }
  return result.sort();
}

async function digest(file) {
  const hash=crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export class BackupService {
  constructor(config) {
    this.config=config;
    this.roots=[config.root,...(config.legacyRoot&&!samePath(config.root,config.legacyRoot)?[config.legacyRoot]:[])];
    this.workRoot=config.workRoot || path.join(path.dirname(config.root),'backup-work');
    const suffix=crypto.createHash('sha256').update(config.database).digest('hex').slice(0,32);
    this.restoreLock=`shelter-restore-${suffix}`;
    this.importLock=`${this.restoreLock}-import`;
  }

  async db() { return mysql.createConnection(this.config.connection); }

  async cli(tool,args,input) {
    const c=this.config.connection;
    await new Promise((resolve,reject)=>{
      const p=spawn(path.join(this.config.bin,tool+(process.platform==='win32'?'.exe':'')),
        ['--no-defaults','--protocol=TCP',`--host=${c.host}`,`--port=${c.port}`,`--user=${c.user}`,...args],
        {env:{...process.env,MYSQL_PWD:c.password},windowsHide:true,stdio:[input?'pipe':'ignore','ignore','pipe']});
      p.stderr.resume();
      const timer=setTimeout(()=>p.kill(),180000);
      p.on('error',()=>{clearTimeout(timer);reject(new Error('找不到数据库备份工具，请检查本机 MySQL 安装。'))});
      p.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('数据库工具执行失败，请检查权限、磁盘空间与 MySQL 状态。'))});
      if (input) {
        const stream=createReadStream(input);
        stream.on('error',()=>p.kill());
        p.stdin.on('error',()=>{});
        p.on('close',()=>stream.destroy());
        stream.pipe(p.stdin);
      }
    });
  }

  async key() {
    const file=this.config.keyFile;
    if (!file) throw backupError('备份加密密钥未配置。请先配置本机密钥。',409);
    let content;
    try {
      const resolved=await normalizeBackupPath(file);
      const stat=await lstat(resolved);
      if (!stat.isFile() || stat.size>256 || !samePath(resolved,await realpath(resolved))) {
        throw backupError('备份加密密钥文件无效，请检查本机配置。',409);
      }
      content=(await readFile(resolved,'utf8')).trim();
    } catch(error) {
      if (error.status) throw error;
      if (error.code==='ENOENT') throw backupError('备份加密密钥未配置。请先配置本机密钥。',409);
      throw backupError('备份加密密钥文件无法读取，请检查本机配置。',409);
    }
    const key=Buffer.from(content,'base64');
    if (key.length!==32 || key.toString('base64')!==content) throw backupError('备份加密密钥文件无效，请检查本机配置。',409);
    return key;
  }

  async keyStatus() {
    try { await this.key(); return {ready:true,message:''}; }
    catch(error) { return {ready:false,message:error.message}; }
  }

  async readSummary(directory,id) {
    await safeDirectory(directory);
    const file=path.join(directory,'manifest.json');
    const stat=await lstat(file);
    if (!stat.isFile() || stat.size>maxManifestBytes) throw backupError('备份清单无效。');
    let m;
    try { m=JSON.parse(await readFile(file,'utf8')); } catch { throw backupError('备份清单无法读取。'); }
    if (!m || ![1,2].includes(m.version) || m.id!==id || m.database!==this.config.database) {
      throw backupError('备份不属于当前系统或格式无法识别。');
    }
    if (typeof m.createdAt!=='string' || !Number.isFinite(Date.parse(m.createdAt)) || !Number.isSafeInteger(m.bytes) || m.bytes<0
        || (m.version===1 ? !Array.isArray(m.files) : !Number.isSafeInteger(m.fileCount) || m.fileCount<1)) {
      throw backupError('备份清单无效。');
    }
    return {manifest:m,manifestBytes:stat.size};
  }

  async list() {
    const listed=new Map();
    for (const root of this.roots) {
      for (const entry of await directoryEntries(root)) {
        const id=entry.name;
        if (!entry.isDirectory() || !uuid.test(id) || listed.has(id)) continue;
        try {
          const {manifest:m,manifestBytes}=await this.readSummary(path.join(root,id),id);
          listed.set(id,{id,createdAt:m.createdAt,bytes:m.bytes+manifestBytes,reason:m.reason,
            fileCount:m.version===1?m.files.length:m.fileCount,encrypted:m.version===2,legacyLocation:!samePath(root,this.config.root)});
        } catch { /* A missing or malformed manifest does not describe a complete backup. */ }
      }
    }
    return [...listed.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }

  async locate(id,roots=this.roots) {
    if (!uuid.test(id)) throw backupError('备份编号无效。',400);
    for (const root of roots) {
      const directory=path.join(root,id);
      try {
        await safeDirectory(directory);
      } catch(error) {
        if (error.code==='ENOENT') continue;
        throw error;
      }
      try { return {directory,...await this.readSummary(directory,id)}; }
      catch(error) {
        if (error.code==='ENOENT') throw backupError('备份清单缺失。');
        throw error;
      }
    }
    throw backupError('找不到该备份，请检查保存目录或磁盘。',404);
  }

  async createWork() {
    await safeDirectory(this.workRoot,true);
    const directory=path.join(this.workRoot,`.restore-${crypto.randomUUID()}`);
    await mkdir(directory,{mode:0o700});
    return directory;
  }

  async removeTemporary(directory,parent) {
    const name=path.basename(directory);
    if (!samePath(path.dirname(directory),parent) || !name.startsWith('.restore-') && !name.startsWith('.backup-')
        || !uuid.test(name.slice(name.indexOf('-')+1))) throw new Error('拒绝清理非备份临时目录。');
    let resolved;
    try { resolved=await safeDirectory(directory); }
    catch(error) { if (error.code==='ENOENT') return; throw error; }
    if (!samePath(path.dirname(resolved),await normalizeBackupPath(parent))) throw new Error('拒绝清理不在预期位置的临时目录。');
    await rm(resolved,{recursive:true});
  }

  async dumpDatabase(file) {
    await this.cli('mysqldump',['--single-transaction','--routines','--triggers','--events','--no-tablespaces',
      '--set-gtid-purged=OFF','--default-character-set=utf8mb4',`--ignore-table=${this.config.database}.WebSessions`,
      `--ignore-table=${this.config.database}.PhotoDrafts`,`--result-file=${file}`,this.config.database]);
  }

  async tables(database) {
    const db=await this.db();
    try {
      const [rows]=await db.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ('WebSessions','PhotoDrafts')",[database]);
      return rows.map(item=>item.name).sort();
    } finally { await db.end(); }
  }

  async snapshot(reason='manual',configuredKey) {
    const key=configuredKey ?? await this.key();
    const id=crypto.randomUUID(),root=this.config.root;
    await safeDirectory(root,true);
    const work=await this.createWork(),pending=path.join(root,`.backup-${id}`);
    let created=false;
    try {
      await mkdir(pending,{mode:0o700});
      created=true;
      const sql=path.join(work,'database.sql');
      await this.dumpDatabase(sql);
      const entries=[],sources=[{name:'database.sql',source:sql}];
      for (const [name,directory] of Object.entries(this.config.media)) {
        for (const file of await files(directory)) sources.push({name:path.posix.join(name,file),source:path.join(directory,file)});
      }
      let bytes=0;
      for (const {name,source} of sources) {
        const size=(await lstat(source)).size;
        const target=path.join(pending,entryName(entries.length));
        await encryptBackupFile(createReadStream(source),target,key,entryAAD(id,entries.length));
        const stored=(await lstat(target)).size;
        if (stored!==encryptedSize(size)) throw backupError('备份期间源文件大小发生变化，请重试。',409);
        entries.push({name,bytes:size});
        bytes+=stored;
      }
      const privateData=Buffer.from(JSON.stringify({tables:await this.tables(this.config.database),files:entries}));
      if (privateData.length>maxManifestBytes) throw backupError('备份清单过大，请联系维护人员。',409);
      const manifest={version:2,id,database:this.config.database,createdAt:new Date().toISOString(),
        reason,bytes:bytes+encryptedSize(privateData.length),fileCount:entries.length};
      await encryptBackupFile(Readable.from([privateData]),path.join(pending,'contents.enc'),key,manifestAAD(manifest));
      await writeFile(path.join(pending,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
      await rename(pending,path.join(root,id));
      created=false;
      return manifest;
    } finally {
      try { if (created) await this.removeTemporary(pending,root); }
      finally { await this.removeTemporary(work,this.workRoot); }
    }
  }

  checkEntries(manifest) {
    if (!Array.isArray(manifest.tables) || !manifest.tables.length || !manifest.tables.every(validName)
        || !Array.isArray(manifest.files) || !manifest.files.some(f=>f?.name==='database.sql')) {
      throw backupError('备份清单缺少数据库或文件目录。');
    }
    const media=Object.keys(this.config.media);
    const names=new Set();
    for (const file of manifest.files) {
      const name=file?.name;
      if (typeof name!=='string' || /[\\:\u0000]/.test(name) || name.split('/').some(part=>!part || part==='..' || part==='.')
          || (name!=='database.sql' && (!name.includes('/') || !media.includes(name.split('/')[0])))
          || names.has(process.platform==='win32'?name.toLowerCase():name) || !Number.isSafeInteger(file.bytes) || file.bytes<0) {
        throw backupError('备份文件路径或大小无效。');
      }
      names.add(process.platform==='win32'?name.toLowerCase():name);
    }
  }

  async readBackup(id,{key,destination,recoveryRoot}={}) {
    const {directory,manifest}=await this.locate(id,recoveryRoot?[recoveryRoot]:undefined);
    if (recoveryRoot && (manifest.version!==2 || manifest.reason!=='before-restore')) {
      throw backupError('无法确认恢复前的加密安全备份。');
    }
    if (manifest.version===1) {
      this.checkEntries(manifest);
      if (destination) await copyMedia(directory,destination);
      const source=destination??directory;
      const actual=(await files(source)).filter(name=>name!=='manifest.json');
      if (JSON.stringify(actual)!==JSON.stringify(manifest.files.map(f=>f.name).sort())) throw backupError('备份文件不完整。');
      for (const entry of manifest.files) {
        const file=path.join(source,entry.name);
        if ((await lstat(file)).size!==entry.bytes || await digest(file)!==entry.sha256) throw backupError('备份校验失败，文件已损坏或被修改。');
      }
      return manifest;
    }

    const decryptionKey=key??await this.key();
    const stored=(await files(directory)).filter(name=>name!=='manifest.json');
    if (stored.length!==manifest.fileCount+1 || !stored.includes('contents.enc')) throw backupError('备份文件不完整。');
    const contents=path.join(directory,'contents.enc'),size=(await lstat(contents)).size;
    if (size>encryptedSize(maxManifestBytes)) throw backupError('备份清单过大。');
    const chunks=[];
    await decryptBackupFile(contents,decryptionKey,manifestAAD(manifest),new Writable({write(chunk,_encoding,next){chunks.push(chunk);next()}}));
    let privateManifest;
    try { privateManifest=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw backupError('备份清单无法读取。'); }
    if (!privateManifest || privateManifest.files?.length!==manifest.fileCount) throw backupError('备份清单不完整。');
    this.checkEntries(privateManifest);
    const expected=['contents.enc',...privateManifest.files.map((_file,index)=>entryName(index))].sort();
    if (JSON.stringify(stored)!==JSON.stringify(expected)) throw backupError('备份文件不完整。');
    if (manifest.bytes!==size+privateManifest.files.reduce((sum,entry)=>sum+encryptedSize(entry.bytes),0)) throw backupError('备份清单大小不符。');
    for (const [index,entry] of privateManifest.files.entries()) {
      const target=destination?path.join(destination,entry.name):null;
      if (target) await mkdir(path.dirname(target),{recursive:true,mode:0o700});
      await decryptBackupFile(path.join(directory,entryName(index)),decryptionKey,entryAAD(id,index),target,entry.bytes);
    }
    return {...manifest,...privateManifest};
  }

  async verify(id) {
    const manifest=await this.readBackup(id);
    return {id,encrypted:manifest.version===2,fileCount:manifest.files.length};
  }

  async replaceDatabase(database,sql) {
    if (!validName(database)) throw new Error('数据库名称无效。');
    const target=database===this.config.database;
    if (target && !this.restoreConnection) throw new Error('恢复缺少数据库互斥锁。');
    const db=target?this.restoreConnection:await this.db();
    const args=['--default-character-set=utf8mb4',`--database=${database}`];
    try {
      if (target) {
        const [[{held}]]=await db.query('SELECT GET_LOCK(?,60) held',[this.importLock]);
        if (held!==1) throw backupError('恢复正在等待上一次数据库导入结束，请稍后重启。',409);
        await db.query('DO RELEASE_LOCK(?)',[this.importLock]);
        // A surviving importer must finish first, and a stale child may not start a new import.
        args.push('--skip-reconnect',`--init-command=DO IF(
          GET_LOCK('${this.importLock}',60)=1 AND IS_USED_LOCK('${this.restoreLock}')=${this.restoreOwner},
          1,JSON_EXTRACT('restore authorization required','$'))`);
      }
      await db.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    } finally { if (!target) await db.end(); }
    await this.cli('mysql',args,sql);
  }

  async checkRestore(directory,manifest) {
    const temporary='shelter_restore_check_'+crypto.randomBytes(8).toString('hex');
    try {
      await this.replaceDatabase(temporary,path.join(directory,'database.sql'));
      if (JSON.stringify(await this.tables(temporary))!==JSON.stringify([...manifest.tables].sort())) throw backupError('备份数据库结构不完整。');
    } finally {
      const db=await this.db();
      try { await db.query(`DROP DATABASE IF EXISTS \`${temporary}\``); }
      finally { await db.end(); }
    }
  }

  async withRestoreLock(work) {
    const db=await this.db();
    let acquired=false;
    try {
      const [[{held,owner}]]=await db.query('SELECT GET_LOCK(?,0) held,CONNECTION_ID() owner',[this.restoreLock]);
      if (held!==1) throw backupError('此数据库正在恢复，请等待恢复完成。',409);
      acquired=true;
      this.restoreConnection=db;
      this.restoreOwner=Number(owner);
      return await work();
    } finally {
      if (acquired) {
        this.restoreConnection=undefined;
        this.restoreOwner=undefined;
      }
      await db.end();
    }
  }

  mediaParents() {
    return new Set(Object.values(this.config.media).map(target=>path.dirname(target)));
  }

  async cleanMediaWorkspace(workName) {
    for (const parent of this.mediaParents()) await this.removeTemporary(path.join(parent,workName),parent);
  }

  async apply(directory) {
    const workName=path.basename(path.dirname(directory));
    if (!restoreWorkspace.test(workName)) throw new Error('恢复工作目录无效。');
    await this.cleanMediaWorkspace(workName);
    for (const [key,target] of Object.entries(this.config.media)) {
      const workspace=await safeDirectory(path.join(path.dirname(target),workName),true);
      await copyMedia(path.join(directory,key),path.join(workspace,key));
    }
    await this.replaceDatabase(this.config.database,path.join(directory,'database.sql'));
    const db=await this.db();
    try {
      await db.query(`CREATE TABLE \`${this.config.database}\`.WebSessions(sessionID VARCHAR(128) PRIMARY KEY,data TEXT NOT NULL,expiresAt DATETIME NOT NULL,INDEX(expiresAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await db.query(photoDraftTable(`\`${this.config.database}\`.PhotoDrafts`));
    } finally { await db.end(); }
    for (const [key,target] of Object.entries(this.config.media)) {
      const workspace=path.join(path.dirname(target),workName);
      const stage=path.join(workspace,key),previous=path.join(workspace,`${key}-previous`);
      let moved=false;
      try {
        try {
          await safeDirectory(target);
          await rename(target,previous);
          moved=true;
        } catch(error) { if (error.code!=='ENOENT') throw error; }
        await rename(stage,target);
      } catch(error) {
        if (moved) await rename(previous,target);
        throw error;
      }
    }
    await this.config.afterRestore?.();
  }

  restoreState() {
    return readRestoreState(this.workRoot,this.config.database);
  }

  async finishRestore(state) {
    if (state.phase!=='cleanup') await saveRestoreState(this.workRoot,{...state,phase:'cleanup'});
    await this.cleanMediaWorkspace(state.workName);
    await this.removeTemporary(path.join(this.workRoot,state.workName),this.workRoot);
    await clearRestoreState(this.workRoot,state.database);
  }

  async resumeInterruptedRestore() {
    return this.withRestoreLock(async()=>{
      const state=await this.restoreState();
      if (!state) return false;
      const {host,port}=this.config.connection, media=this.config.media;
      if (!samePath(state.root,this.config.root) || state.host!==host || state.port!==Number(port)
          || Object.keys(state.media).length!==Object.keys(media).length
          || Object.entries(media).some(([key,target])=>typeof state.media[key]!=='string'||!path.isAbsolute(state.media[key])||!samePath(state.media[key],target))) {
        throw new Error('恢复目标与中断前的配置不符，请核对数据库和照片目录。');
      }
      if (state.phase==='rollback') {
        const key=await this.key();
        const work=await safeDirectory(path.join(this.workRoot,state.workName),true);
        const recovery=path.join(work,state.workName);
        await this.removeTemporary(recovery,work);
        await mkdir(recovery,{mode:0o700});
        await this.readBackup(state.safetyBackupID,{key,destination:recovery,recoveryRoot:state.root});
        await this.apply(recovery);
      }
      await this.finishRestore(state);
      return true;
    });
  }

  async restore(id) {
    return this.withRestoreLock(async()=>{
      if (await this.restoreState()) throw backupError('恢复尚未完成，请重启系统以处理上次的恢复状态。',409);
      const key=await this.key(), work=await this.createWork();
      const candidate=path.join(work,'candidate'), rollback=path.join(work,'rollback');
      let recorded=false;
      try {
        await mkdir(candidate,{mode:0o700});
        const manifest=await this.readBackup(id,{key,destination:candidate});
        await this.checkRestore(candidate,manifest);
        const safety=await this.snapshot('before-restore',key);
        await mkdir(rollback,{mode:0o700});
        await this.readBackup(safety.id,{key,destination:rollback,recoveryRoot:this.config.root});
        const {host,port}=this.config.connection;
        const state={version:1,phase:'rollback',database:this.config.database,host,port:Number(port),
          root:this.config.root,safetyBackupID:safety.id,workName:path.basename(work),media:this.config.media};
        await saveRestoreState(this.workRoot,state);
        recorded=true;
        try { await this.apply(candidate); }
        catch {
          try { await this.apply(rollback); }
          catch { throw new Error('恢复与自动回退未完成，请保留恢复前备份并重启系统重试。'); }
          await this.finishRestore(state);
          throw new Error('恢复未完成，已自动还原恢复前的数据和照片。');
        }
        await this.finishRestore(state);
        return {safetyBackupID:safety.id};
      } finally {
        if (!recorded) await this.removeTemporary(work,this.workRoot);
      }
    });
  }
}
