import { backupError } from './backup-crypto.js';

export const recoveryMessage = '上次恢复尚未完成。请保留安全备份和恢复状态，重启系统以重试。';
const maintenanceMessage = '系统正在备份或恢复，请稍后再试。';
const requests = new Set();
let maintenance = false;
let recoveryRequired = false;
let activeWork = 0;

export function requireBackupRecovery() {
  recoveryRequired = true;
}

export async function trackDatabaseWork(work) {
  activeWork++;
  try { return await work(); }
  finally { activeWork--; }
}

export function databaseRoute(handler) {
  return (req, res, next) => {
    if (!res.destroyed) void trackDatabaseWork(() => handler(req, res, next)).catch(next);
  };
}

export async function runBackupAware(work) {
  if (!maintenance && !recoveryRequired) return trackDatabaseWork(work);
}

export function backupGate(req, res, next) {
  if (recoveryRequired) return res.status(503).json({error:recoveryMessage});
  if (maintenance) return res.status(503).json({error:maintenanceMessage});
  requests.add(req);
  const done = () => requests.delete(req);
  res.once('finish', done);
  res.once('close', done);
  next();
}

export async function withBackupMaintenance(req, work) {
  if (maintenance) throw backupError('备份或恢复正在进行。',409);
  if (recoveryRequired) throw backupError(recoveryMessage,503);
  maintenance = true;
  try {
    const start = Date.now();
    while (activeWork || requests.size > Number(requests.has(req))) {
      if (Date.now() - start > 90000) throw backupError('仍有业务正在处理，请稍后再备份。',409);
      await new Promise(resolve => setTimeout(resolve,100));
    }
    return await work();
  } finally {
    maintenance = false;
  }
}
