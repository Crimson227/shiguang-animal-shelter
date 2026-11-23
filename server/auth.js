import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool, query } from './db.js';
import {databaseRoute as wrap} from './backup-gate.js';

export const authRouter = Router();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const validPassword = value => {
  const password = String(value || '');
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) fail(400, '新密码需至少 8 个字符，且不超过 72 字节');
  return password;
};
const attempts = new Map();
export const memberLoginError = '邮箱或密码不正确。临时密码自签发起 24 小时有效，过期请联系工作人员重新签发。';
export const dummyMemberPasswordHash = '$2b$12$JwlC1JvgO.mq4GK/1kPNkOjXy/0F8XjnrxPxnIPvtJB4dXy5gqG6.';
const expiredTemporaryPassword = '临时密码已过期或需要重新签发，请联系工作人员。';
export function limitAuth(req, res, next) {
  const now = Date.now();
  const identity = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
  const keys = [[`ip:${req.ip}:${req.path}`, 30], [`account:${req.ip}:${req.path}:${identity}`, 8]];
  if (keys.some(([key, limit]) => { const entry = attempts.get(key); return entry && entry.until > now && entry.count >= limit; })) {
    return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
  }
  for (const [key] of keys) {
    const entry = attempts.get(key);
    if (!entry || entry.until <= now) attempts.set(key, { count: 1, until: now + 15 * 60_000 });
    else entry.count++;
  }
  if (attempts.size > 5000) for (const [candidate, state] of attempts) if (state.until <= now) attempts.delete(candidate);
  next();
}

export const requireCurrentAccount = wrap(async (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  if (['/api/login','/api/member/login','/api/member/register','/api/member/recovery-requests'].includes(path)) return next();
  const account = req.session.admin || req.session.member;
  const admin = Boolean(req.session.admin);
  const expected = req.get('X-Shelter-Account');
  const actual = account ? `${admin ? 'admin' : 'member'}:${account.id}` : 'guest';
  if (path !== '/api/session' && expected !== undefined && expected !== actual) {
    return res.status(409).json({ error:'登录账号已变更，请刷新页面后再操作', code:'session_changed' });
  }
  if (!account) return next();
  const rows = await query(admin
    ? 'SELECT credentialVersion FROM Admins WHERE adminID=?'
    : `SELECT m.credentialVersion,m.mustChangePassword,
       COALESCE(m.temporaryPasswordExpiresAt>NOW(),0) temporaryPasswordValid,
       CONCAT(p.lastName,p.firstName) memberName
       FROM MemberAccounts m JOIN Patrons p ON p.patronID=m.patronID WHERE m.memberID=?`, [account.id]);
  if (!rows[0] || rows[0].credentialVersion !== account.credentialVersion) {
    return req.session.destroy(() => res.status(401).json({ error: '账号凭据已更新，请重新登录' }));
  }
  res.locals.memberName = rows[0].memberName;
  if (!admin && rows[0].mustChangePassword) {
    if (!rows[0].temporaryPasswordValid) {
      return req.session.destroy(() => res.status(401).json({ error: expiredTemporaryPassword, code:'temporary_password_expired' }));
    }
    if (!['/api/account/password','/api/session','/api/logout'].includes(path)) {
      return res.status(403).json({ error: '请先修改临时密码' });
    }
  }
  next();
});

async function accountTransaction(work) {
  const connection = await pool.getConnection();
  try {
    // Each account row serializes its own writes without locking gaps for other accounts.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function closeRecoveryRequests(connection, memberID, keepRequestID = null) {
  return connection.execute(`UPDATE PasswordRecoveryRequests SET status='closed',tokenHash=NULL
    WHERE memberID=? AND status IN ('pending','issued') AND (? IS NULL OR requestID<>?)`,
    [memberID,keepRequestID,keepRequestID]);
}

authRouter.post('/member/recovery-requests', limitAuth, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) fail(400, '请输入有效邮箱');
  await accountTransaction(async connection => {
    const [[member]] = await connection.execute('SELECT memberID FROM MemberAccounts WHERE email=? FOR UPDATE', [email]);
    if (!member) return;
    const [[recent]] = await connection.execute(`SELECT requestID FROM PasswordRecoveryRequests
      WHERE memberID=? AND status='pending' AND requestedAt>DATE_SUB(NOW(),INTERVAL 1 DAY)
      ORDER BY requestedAt DESC,requestID DESC LIMIT 1 FOR UPDATE`, [member.memberID]);
    await closeRecoveryRequests(connection,member.memberID,recent?.requestID);
    if (recent) return;
    await connection.execute("INSERT INTO PasswordRecoveryRequests(memberID,status,requestedAt) VALUES(?,'pending',NOW())", [member.memberID]);
    await connection.execute(`INSERT INTO Notifications(recipientRole,recipientID,title,body)
      SELECT 'admin',adminID,'领养人账号找回请求','有新的账号找回请求，请到账号安全页面核验并处理。' FROM Admins`);
  });
  res.json({ ok: true, message: '如该邮箱已注册，工作人员会通过档案中的联系电话核验身份并提供临时密码，临时密码自签发起 24 小时有效。' });
}));

authRouter.post('/account/password', limitAuth, wrap(async (req, res) => {
  const admin = Boolean(req.session.admin);
  const account = req.session.admin || req.session.member;
  if (!account) fail(401, '请先登录');
  const current = String(req.body?.currentPassword || '');
  const replacement = validPassword(req.body?.newPassword);
  if (current === replacement) fail(400, '新密码不能与原密码相同');
  const table = admin ? 'Admins' : 'MemberAccounts';
  const idColumn = admin ? 'adminID' : 'memberID';
  const passwordColumn = admin ? 'password' : 'passwordHash';
  const [row] = await query(`SELECT ${passwordColumn} AS hash FROM ${table} WHERE ${idColumn}=? AND credentialVersion=?`, [account.id,account.credentialVersion]);
  if (!row) return req.session.destroy(() => res.status(401).json({error:'账号凭据已更新，请重新登录'}));
  if (!await bcrypt.compare(current,row.hash)) fail(400, '原密码不正确');
  const passwordHash = await bcrypt.hash(replacement,12);
  const changed = await accountTransaction(async connection => {
    const [result] = await connection.execute(`UPDATE ${table} SET ${passwordColumn}=?,credentialVersion=credentialVersion+1
      ${admin ? '' : ',mustChangePassword=0,temporaryPasswordExpiresAt=NULL'}
      WHERE ${idColumn}=? AND credentialVersion=? ${admin ? '' : 'AND (mustChangePassword=0 OR temporaryPasswordExpiresAt>NOW())'}`,
      [passwordHash,account.id,account.credentialVersion]);
    if (!admin && result.affectedRows) await closeRecoveryRequests(connection,account.id);
    return Boolean(result.affectedRows);
  });
  if (!changed) return req.session.destroy(() => res.status(401).json({
    error:account.mustChangePassword ? expiredTemporaryPassword : '账号凭据已更新，请重新登录',
    ...(account.mustChangePassword ? {code:'temporary_password_expired'} : {}),
  }));
  req.session.destroy(() => res.json({ ok: true, message: '密码已修改，请重新登录' }));
}));

authRouter.get('/admin/recovery-requests', wrap(async (req, res) => {
  if (!req.session.admin) fail(401, '请先登录管理账号');
  res.json(await query(`SELECT r.requestID,r.status,r.requestedAt,m.email,m.patronID,
    CONCAT(p.lastName,p.firstName) AS name,p.phoneNumber FROM PasswordRecoveryRequests r
    JOIN MemberAccounts m ON m.memberID=r.memberID JOIN Patrons p ON p.patronID=m.patronID
    WHERE r.status IN ('pending','issued') ORDER BY r.requestedAt DESC LIMIT 100`));
}));
authRouter.post('/admin/patrons/:id/reset-password', limitAuth, wrap(async (req, res) => {
  if (!req.session.admin) fail(401, '请先登录管理账号');
  const patronID = Number(req.params.id);
  if (!Number.isSafeInteger(patronID) || patronID < 1) fail(400, '领养人编号无效');
  const requestID = req.body?.requestID === undefined ? null : Number(req.body.requestID);
  if (requestID !== null && (!Number.isSafeInteger(requestID) || requestID < 1)) fail(400, '请求编号无效');
  const [target] = await query('SELECT memberID,credentialVersion FROM MemberAccounts WHERE patronID=?', [patronID]);
  if (!target) fail(404, '该领养人没有登录账号');
  const temporaryPassword = `Sg-${crypto.randomBytes(9).toString('base64url')}`;
  const passwordHash = await bcrypt.hash(temporaryPassword,12);
  const expiresAt = await accountTransaction(async connection => {
    const [[member]] = await connection.execute('SELECT credentialVersion FROM MemberAccounts WHERE memberID=? FOR UPDATE', [target.memberID]);
    if (!member) fail(404, '该领养人没有登录账号');
    if (requestID !== null) {
      const [[request]] = await connection.execute(`SELECT requestID FROM PasswordRecoveryRequests
        WHERE requestID=? AND memberID=? AND status IN ('pending','issued') FOR UPDATE`, [requestID,target.memberID]);
      if (!request) fail(409, '这条找回请求已处理或已关闭，请刷新列表');
    }
    if (member.credentialVersion !== target.credentialVersion) fail(409, '账号密码刚刚更新，请重新核验后再操作');
    const [[timing]] = await connection.execute('SELECT NOW() issuedAt,DATE_ADD(NOW(),INTERVAL 24 HOUR) expiresAt');
    await connection.execute(`UPDATE MemberAccounts SET passwordHash=?,mustChangePassword=1,
      temporaryPasswordExpiresAt=?,credentialVersion=credentialVersion+1 WHERE memberID=?`, [passwordHash,timing.expiresAt,target.memberID]);
    await closeRecoveryRequests(connection,target.memberID);
    await connection.execute('INSERT INTO PasswordResetAudit(memberID,adminID,createdAt) VALUES(?,?,?)', [target.memberID,req.session.admin.id,timing.issuedAt]);
    return timing.expiresAt;
  });
  res.json({ ok: true, temporaryPassword, expiresAt });
}));

authRouter.post('/admin/recovery-requests/:id/close', wrap(async (req, res) => {
  if (!req.session.admin) fail(401, '请先登录管理账号');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, '请求编号无效');
  await query("UPDATE PasswordRecoveryRequests SET status='closed',tokenHash=NULL WHERE requestID=? AND status IN ('pending','issued')", [id]);
  res.json({ ok: true });
}));
