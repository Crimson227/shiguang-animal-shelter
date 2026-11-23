import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, query, lockAnimal } from './db.js';
import { recommendForPatron } from './matching.js';
import { deliverReminders } from './reminders.js';
import { limitAuth, memberLoginError, dummyMemberPasswordHash } from './auth.js';
import { requireContactPhone } from './contact-phone.js';
import { isDateOnly, localDate } from './dates.js';

import {databaseRoute as wrap} from './backup-gate.js';

export const adoptionRouter = Router();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idOf = (value) => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) fail(400, '编号无效'); return id; };
const required = (value, name, max) => { const text = String(value ?? '').trim(); if (!text) fail(400, `请填写${name}`); if (text.length > max) fail(400, `${name}不能超过 ${max} 个字`); return text; };
const optional = (value, max) => { const text = String(value ?? '').trim(); if (text.length > max) fail(400, `内容不能超过 ${max} 个字`); return text; };
const memberOnly = (req, res, next) => req.session.member ? next() : res.status(401).json({ error: '请先登录领养人账号' });
const adminOnly = (req, res, next) => req.session.admin ? next() : res.status(401).json({ error: '请先登录管理账号' });
const dateValue = (value, label) => { if (!isDateOnly(value)) fail(400, `${label}格式不正确`); return value; };
const applicationSelect = `SELECT ap.*, a.animalName, a.species, a.age, a.size, a.pictureURL,
  CONCAT(p.lastName,p.firstName) AS patronName, p.phoneNumber, p.address, m.email,
  COALESCE(reviewer.displayName,reviewer.username) AS reviewerName,
  COALESCE(completer.displayName,completer.username) AS completerName
  FROM AdoptionApplications ap JOIN Animals a ON a.animalID=ap.animalID
  JOIN Patrons p ON p.patronID=ap.patronID LEFT JOIN MemberAccounts m ON m.patronID=p.patronID
  LEFT JOIN Admins reviewer ON reviewer.adminID=ap.reviewedBy
  LEFT JOIN Admins completer ON completer.adminID=ap.completedBy`;

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function applicationTransaction(applicationID, work, patronID = null) {
  const [reference] = await query('SELECT animalID,patronID FROM AdoptionApplications WHERE applicationID=?', [applicationID]);
  if (!reference || (patronID !== null && reference.patronID !== patronID)) fail(404, '申请不存在');
  return transaction(async (connection) => {
    const animal = await lockAnimal(connection, reference.animalID);
    const [[item]] = await connection.execute('SELECT * FROM AdoptionApplications WHERE applicationID=?', [applicationID]);
    if (!animal || !item) fail(404, '申请不存在');
    return work(connection, {...item,animalName:animal.animalName});
  });
}

async function notifyMember(connection, patronID, applicationID, title, body) {
  const [[account]] = await connection.execute('SELECT memberID FROM MemberAccounts WHERE patronID=?', [patronID]);
  if (account) await connection.execute(`INSERT INTO Notifications(recipientRole,recipientID,applicationID,title,body)
    VALUES('member',?,?,?,?)`, [account.memberID, applicationID, title, body]);
}

async function addEvent(connection, applicationID, actorRole, eventType, note = '') {
  await connection.execute('INSERT INTO ApplicationEvents(applicationID,actorRole,eventType,note) VALUES(?,?,?,?)', [applicationID, actorRole, eventType, note]);
}

adoptionRouter.post('/member/register', limitAuth, wrap(async (req, res) => {
  const firstName = required(req.body?.firstName, '名', 15);
  const lastName = required(req.body?.lastName, '姓', 15);
  const phoneNumber = requireContactPhone(req.body?.phoneNumber);
  const address = required(req.body?.address, '联系地址', 50);
  const email = required(req.body?.email, '邮箱', 190).toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '邮箱格式不正确');
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) fail(400, '密码需要 8 至 72 字节');
  const passwordHash = await bcrypt.hash(password, 12);
  const member = await transaction(async (connection) => {
    const [patron] = await connection.execute('INSERT INTO Patrons(firstName,lastName,phoneNumber,address) VALUES(?,?,?,?)', [firstName, lastName, phoneNumber, address]);
    const [account] = await connection.execute('INSERT INTO MemberAccounts(patronID,email,passwordHash) VALUES(?,?,?)', [patron.insertId, email, passwordHash]);
    return { id: account.insertId, patronID: patron.insertId, name: `${lastName}${firstName}`, email, credentialVersion: 1 };
  });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: '注册成功，请重新登录' });
    req.session.member = member;
    res.status(201).json({ authenticated: true, role: 'member', admin: null, member });
  });
}));

adoptionRouter.post('/member/login', limitAuth, wrap(async (req, res) => {
  const email = required(req.body?.email, '邮箱', 190).toLowerCase();
  const password = String(req.body?.password || '');
  const rows = await query(`SELECT m.memberID,m.patronID,m.email,m.passwordHash,m.credentialVersion,m.mustChangePassword,p.firstName,p.lastName
    FROM MemberAccounts m JOIN Patrons p ON p.patronID=m.patronID WHERE m.email=? LIMIT 1`, [email]);
  const account = rows[0];
  const matches = await bcrypt.compare(password, account?.passwordHash || dummyMemberPasswordHash);
  if (!account || !matches) fail(401, memberLoginError);
  const [valid] = await query(`SELECT temporaryPasswordExpiresAt FROM MemberAccounts WHERE memberID=? AND credentialVersion=?
    AND (mustChangePassword=0 OR temporaryPasswordExpiresAt>NOW())`, [account.memberID,account.credentialVersion]);
  if (!valid) fail(401, memberLoginError);
  const member = { id: account.memberID, patronID: account.patronID, name: `${account.lastName}${account.firstName}`, email: account.email, credentialVersion: account.credentialVersion, mustChangePassword: Boolean(account.mustChangePassword), temporaryPasswordExpiresAt:valid.temporaryPasswordExpiresAt };
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: '登录失败，请重试' });
    req.session.member = member;
    res.json({ authenticated: true, role: 'member', admin: null, member });
  });
}));

adoptionRouter.use('/member', memberOnly);

adoptionRouter.get('/member/profile', wrap(async (req, res) => {
  const rows = await query(`SELECT p.patronID,p.firstName,p.lastName,p.phoneNumber,p.address,m.email,
    pref.preferredSpecies,pref.preferredSize,pref.minAge,pref.maxAge,pref.acceptsSpecialCare
    FROM MemberAccounts m JOIN Patrons p ON p.patronID=m.patronID
    LEFT JOIN PatronPreferences pref ON pref.patronID=p.patronID
    WHERE m.memberID=?`, [req.session.member.id]);
  if (!rows[0]) fail(404, '账号不存在');
  res.json(rows[0]);
}));

adoptionRouter.get('/member/matches', wrap(async (req, res) => {
  res.json(await recommendForPatron(req.session.member.patronID));
}));

adoptionRouter.put('/member/profile', wrap(async (req, res) => {
  const firstName = required(req.body?.firstName, '名', 15);
  const lastName = required(req.body?.lastName, '姓', 15);
  const phoneNumber = requireContactPhone(req.body?.phoneNumber);
  const address = required(req.body?.address, '联系地址', 50);
  const preferredSpecies = optional(req.body?.preferredSpecies, 10) || null;
  const preferredSize = optional(req.body?.preferredSize, 10) || null;
  const minAge = req.body?.minAge === '' || req.body?.minAge == null ? null : Number(req.body.minAge);
  const maxAge = req.body?.maxAge === '' || req.body?.maxAge == null ? null : Number(req.body.maxAge);
  const acceptsSpecialCare = req.body?.acceptsSpecialCare === true || req.body?.acceptsSpecialCare === 1 ? 1 : 0;
  if ([minAge,maxAge].some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 50)) || (minAge !== null && maxAge !== null && minAge > maxAge)) fail(400, '年龄偏好范围无效');
  await transaction(async (connection) => {
    await connection.execute('UPDATE Patrons SET firstName=?,lastName=?,phoneNumber=?,address=? WHERE patronID=?', [firstName,lastName,phoneNumber,address,req.session.member.patronID]);
    const [[preference]] = await connection.execute('SELECT preferenceID FROM PatronPreferences WHERE patronID=? ORDER BY preferenceID LIMIT 1 FOR UPDATE', [req.session.member.patronID]);
    if (preference) await connection.execute('UPDATE PatronPreferences SET preferredSpecies=?,preferredSize=?,minAge=?,maxAge=?,acceptsSpecialCare=? WHERE preferenceID=?', [preferredSpecies,preferredSize,minAge,maxAge,acceptsSpecialCare,preference.preferenceID]);
    else await connection.execute('INSERT INTO PatronPreferences(patronID,preferredSpecies,preferredSize,minAge,maxAge,acceptsSpecialCare) VALUES(?,?,?,?,?,?)', [req.session.member.patronID,preferredSpecies,preferredSize,minAge,maxAge,acceptsSpecialCare]);
  });
  // A late profile response must not save the session again after logout.
  res.json({ ok: true, member: { ...req.session.member, name: `${lastName}${firstName}` } });
}));

adoptionRouter.get('/member/applications', wrap(async (req, res) => {
  res.json(await query(`${applicationSelect} WHERE ap.patronID=? ORDER BY ap.submittedAt DESC,ap.applicationID DESC`, [req.session.member.patronID]));
}));

adoptionRouter.post('/member/applications', wrap(async (req, res) => {
  const animalID = idOf(req.body?.animalID);
  const note = required(req.body?.applicationNote, '申请说明', 1000);
  const applicationID = await transaction(async (connection) => {
    const animal = await lockAnimal(connection, animalID);
    const [[adoptable]] = await connection.execute('SELECT animalID FROM Adoptable WHERE animalID=?', [animalID]);
    if (!animal || !adoptable) fail(409, '这只动物当前不可申请领养');
    const [[placement]] = await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=? LIMIT 1', [animalID]);
    if (placement) fail(409, '这只动物已办理寄养或领养');
    const [[foster]] = await connection.execute("SELECT fosterID FROM FosterRecords WHERE animalID=? AND status='active' LIMIT 1", [animalID]);
    if (foster) fail(409, '这只动物正在寄养中');
    const [[reserved]] = await connection.execute("SELECT applicationID FROM AdoptionApplications WHERE animalID=? AND status IN ('approved','completed') LIMIT 1", [animalID]);
    if (reserved) fail(409, '这只动物已有通过审核的申请');
    const [[duplicate]] = await connection.execute("SELECT applicationID FROM AdoptionApplications WHERE animalID=? AND patronID=? AND status IN ('pending','approved','completed') LIMIT 1", [animalID,req.session.member.patronID]);
    if (duplicate) fail(409, '你已申请过这只动物，请在个人中心查看进度');
    const [result] = await connection.execute('INSERT INTO AdoptionApplications(animalID,patronID,applicationNote) VALUES(?,?,?)', [animalID,req.session.member.patronID,note]);
    await addEvent(connection,result.insertId,'member','submitted',note);
    await connection.execute(`INSERT INTO Notifications(recipientRole,recipientID,applicationID,title,body)
      SELECT 'admin',adminID,?,'新的领养申请',? FROM Admins`, [result.insertId,`${res.locals.memberName ?? req.session.member.name}申请领养${animal.animalName}，请及时审核。`]);
    return result.insertId;
  });
  res.status(201).json({ ok: true, applicationID });
}));

adoptionRouter.post('/member/applications/:id/withdraw', wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  await applicationTransaction(applicationID, async (connection,item) => {
    if (item.status !== 'pending') fail(409, '只有待审核申请可以撤回');
    await connection.execute("UPDATE AdoptionApplications SET status='withdrawn' WHERE applicationID=?", [applicationID]);
    await addEvent(connection,applicationID,'member','withdrawn');
  },req.session.member.patronID);
  res.json({ ok: true });
}));

const cancelApplication = (role) => wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  const patronID = role === 'member' ? req.session.member.patronID : null;
  const reason = role === 'admin' ? required(req.body?.reason, '取消原因', 1000) : '申请人主动放弃领养';
  const changed = await applicationTransaction(applicationID, async (connection,item) => {
    if (item.status === 'cancelled') return false;
    if (item.status !== 'approved') fail(409, '只有已通过且尚未办理的申请可以取消');
    await connection.execute("UPDATE AdoptionApplications SET status='cancelled' WHERE applicationID=?", [applicationID]);
    await addEvent(connection, applicationID, role, 'cancelled', reason);
    const appointment = item.appointmentDate ? `原定 ${item.appointmentDate} 的办理预约已取消。` : '';
    const title = '领养申请已取消';
    const body = `${item.animalName}的领养申请 #${applicationID} 已取消。${appointment}请在申请进度中查看取消原因。`;
    await notifyMember(connection, item.patronID, applicationID, title, body);
    await connection.execute(`INSERT INTO Notifications(recipientRole,recipientID,applicationID,title,body)
      SELECT 'admin',adminID,?,?,? FROM Admins WHERE adminID<>?`, [applicationID, title, body, req.session.admin?.id ?? 0]);
    return true;
  },patronID);
  res.json({ ok: true, changed });
});

adoptionRouter.post('/member/applications/:id/cancel', cancelApplication('member'));

adoptionRouter.get('/member/applications/:id/events', wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  const rows = await query('SELECT applicationID FROM AdoptionApplications WHERE applicationID=? AND patronID=?', [applicationID,req.session.member.patronID]);
  if (!rows[0]) fail(404, '申请不存在');
  res.json(await query('SELECT eventID,actorRole,eventType,note,createdAt FROM ApplicationEvents WHERE applicationID=? ORDER BY eventID', [applicationID]));
}));

adoptionRouter.get('/member/followups', wrap(async (req, res) => {
  res.json(await query(`SELECT f.*,a.animalName FROM FollowUpVisits f JOIN AdoptionApplications ap ON ap.applicationID=f.applicationID
    JOIN Animals a ON a.animalID=ap.animalID WHERE ap.patronID=? ORDER BY f.visitDate DESC,f.visitID DESC`, [req.session.member.patronID]));
}));

function notificationPage(role) {
  return wrap(async (req,res) => {
    const requestedPage = Number(req.query.page??1), filter = req.query.filter??'all';
    if (!Number.isSafeInteger(requestedPage) || requestedPage<1 || !['all','unread'].includes(filter)) {
      fail(400,'消息筛选参数无效');
    }
    const pageSize = 25, recipient = [role,req.session[role].id];
    const result = await transaction(async (connection) => {
      const [[counts]] = await connection.execute(`SELECT COUNT(*) total,COUNT(CASE WHEN isRead=0 THEN 1 END) unreadCount
        FROM Notifications WHERE recipientRole=? AND recipientID=?`,recipient);
      const total = filter==='unread' ? counts.unreadCount : counts.total;
      const pageCount = Math.max(1,Math.ceil(total/pageSize)), page = Math.min(requestedPage,pageCount);
      const [items] = await connection.execute(`SELECT * FROM Notifications WHERE recipientRole=? AND recipientID=?
        ${filter==='unread'?'AND isRead=0':''} ORDER BY createdAt DESC,notificationID DESC LIMIT ? OFFSET ?`,
        [...recipient,pageSize,(page-1)*pageSize]);
      return {items,total,page,pageCount,unreadCount:counts.unreadCount};
    });
    res.json(result);
  });
}

adoptionRouter.get('/member/notifications/page', notificationPage('member'));
adoptionRouter.get('/member/notifications', wrap(async (req, res) => {
  res.json(await query("SELECT * FROM Notifications WHERE recipientRole='member' AND recipientID=? ORDER BY createdAt DESC,notificationID DESC LIMIT 100", [req.session.member.id]));
}));
adoptionRouter.post('/member/notifications/:id/read', wrap(async (req, res) => {
  await query("UPDATE Notifications SET isRead=1 WHERE notificationID=? AND recipientRole='member' AND recipientID=?", [idOf(req.params.id),req.session.member.id]);
  res.json({ ok: true });
}));

adoptionRouter.use('/admin', adminOnly);
adoptionRouter.post('/admin/applications/:id/cancel', cancelApplication('admin'));

adoptionRouter.get('/admin/applications', wrap(async (_req, res) => {
  res.json(await query(`${applicationSelect} ORDER BY FIELD(ap.status,'pending','approved','completed','rejected','withdrawn','cancelled'),ap.submittedAt DESC,ap.applicationID DESC`));
}));

adoptionRouter.get('/admin/applications/:id/events', wrap(async (req, res) => {
  res.json(await query('SELECT * FROM ApplicationEvents WHERE applicationID=? ORDER BY eventID', [idOf(req.params.id)]));
}));

adoptionRouter.post('/admin/applications/:id/review', wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  const decision = String(req.body?.decision || '');
  if (!['approved','rejected'].includes(decision)) fail(400, '请选择通过或驳回');
  const note = required(req.body?.reviewNote, '审核说明', 1000);
  await applicationTransaction(applicationID, async (connection,item) => {
    if (item.status !== 'pending') fail(409, '申请已处理，请刷新页面');
    if (decision === 'approved') {
      const [[adoptable]] = await connection.execute('SELECT animalID FROM Adoptable WHERE animalID=?', [item.animalID]);
      const [[placement]] = await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=? LIMIT 1', [item.animalID]);
      const [[foster]] = await connection.execute("SELECT fosterID FROM FosterRecords WHERE animalID=? AND status='active' LIMIT 1", [item.animalID]);
      const [[reserved]] = await connection.execute("SELECT applicationID FROM AdoptionApplications WHERE animalID=? AND status IN ('approved','completed') LIMIT 1", [item.animalID]);
      if (!adoptable || placement || foster || reserved) fail(409, '动物当前不可领养，请检查档案和其他申请');
    }
    await connection.execute('UPDATE AdoptionApplications SET status=?,reviewNote=?,reviewedBy=?,reviewedAt=NOW() WHERE applicationID=?', [decision,note,req.session.admin.id,applicationID]);
    await addEvent(connection,applicationID,'admin',decision,note);
    await notifyMember(connection,item.patronID,applicationID,decision==='approved'?'领养申请已通过':'领养申请未通过',
      decision==='approved'?`${item.animalName}的申请已通过审核，等待工作人员办理领养。`:`${item.animalName}的申请未通过审核，请查看审核说明。`);
    if (decision === 'approved') {
      const [others] = await connection.execute("SELECT applicationID,patronID FROM AdoptionApplications WHERE animalID=? AND status='pending'", [item.animalID]);
      for (const other of others) {
        await connection.execute("UPDATE AdoptionApplications SET status='rejected',reviewNote='该动物已匹配其他申请',reviewedBy=?,reviewedAt=NOW() WHERE applicationID=?", [req.session.admin.id,other.applicationID]);
        await addEvent(connection,other.applicationID,'admin','rejected','该动物已匹配其他申请');
        await notifyMember(connection,other.patronID,other.applicationID,'领养申请结果',`${item.animalName}已匹配其他申请，可以继续看看其他等待领养的动物。`);
      }
    }
  });
  res.json({ ok: true });
}));

adoptionRouter.post('/admin/applications/:id/complete', wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  const today=localDate();
  const completedDate=dateValue(req.body?.completedDate||today,'办理日期');
  const completionNote=required(req.body?.completionNote,'办理结果',1000);
  const followUpDueDate=dateValue(req.body?.followUpDueDate,'首次回访计划日期');
  if(completedDate>today) fail(400,'办理日期不能晚于今天');
  if(followUpDueDate<completedDate) fail(400,'回访计划不能早于办理日期');
  await applicationTransaction(applicationID, async (connection,item) => {
    if (item.status !== 'approved') fail(409, '只有已通过的申请可以办理领养');
    const reviewedDate=item.reviewedAt instanceof Date?localDate(item.reviewedAt):String(item.reviewedAt).slice(0,10);
    if(completedDate<reviewedDate) fail(400,'办理日期不能早于审核日期');
    const [[placement]] = await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=?', [item.animalID]);
    if (placement) fail(409, '这只动物已有办理记录');
    const [[foster]] = await connection.execute("SELECT fosterID FROM FosterRecords WHERE animalID=? AND status='active' LIMIT 1", [item.animalID]);
    if (foster) fail(409, '寄养中的动物不能办理领养');
    await connection.execute("INSERT INTO FostersAndAdoptions(animalID,patronID,fosteredOrAdopted,date) VALUES(?,?,'A',?)", [item.animalID,item.patronID,completedDate]);
    await connection.execute('INSERT INTO AnimalStatusHistory(animalID,eventType,note,changedBy) VALUES(?,?,?,?)',[item.animalID,'adopted',`领养申请 #${applicationID} 于 ${completedDate} 完成办理。${completionNote}`,req.session.admin.id]);
    await connection.execute("UPDATE AdoptionApplications SET status='completed',completedAt=NOW(),completedDate=?,completedBy=?,completionNote=?,followUpDueDate=? WHERE applicationID=?", [completedDate,req.session.admin.id,completionNote,followUpDueDate,applicationID]);
    await addEvent(connection,applicationID,'admin','completed',`${completedDate} · ${completionNote}`);
    await notifyMember(connection,item.patronID,applicationID,'领养办理完成',`${item.animalName}的领养已办理完成，计划于 ${followUpDueDate} 进行首次回访。`);
  });
  void deliverReminders().catch(error => console.error('Reminder delivery failed:', error));
  res.json({ ok: true });
}));

adoptionRouter.post('/admin/applications/:id/schedule', wrap(async (req,res)=>{
  const applicationID=idOf(req.params.id), appointmentDate=dateValue(req.body?.appointmentDate,'办理预约日期');
  const changed=await applicationTransaction(applicationID,async (connection,item)=>{
    if(item.status!=='approved') fail(409,'只有已通过的申请可以安排办理');
    if(item.appointmentDate===appointmentDate) return false;
    if(appointmentDate<localDate()) fail(400,'预约日期不能早于今天');
    await connection.execute('UPDATE AdoptionApplications SET appointmentDate=? WHERE applicationID=?',[appointmentDate,applicationID]);
    await addEvent(connection,applicationID,'admin','scheduled',`计划于 ${appointmentDate} 办理`);
    await notifyMember(connection,item.patronID,applicationID,'领养办理安排',`${item.animalName}计划于 ${appointmentDate} 办理领养，请与工作人员确认具体时间。`);
    return true;
  });
  res.json({ok:true,changed});
}));

adoptionRouter.get('/admin/followups', wrap(async (_req, res) => {
  res.json(await query(`SELECT f.*,a.animalName,CONCAT(p.lastName,p.firstName) AS patronName,p.phoneNumber
    FROM FollowUpVisits f JOIN AdoptionApplications ap ON ap.applicationID=f.applicationID
    JOIN Animals a ON a.animalID=ap.animalID JOIN Patrons p ON p.patronID=ap.patronID
    ORDER BY f.visitDate DESC,f.visitID DESC`));
}));

adoptionRouter.post('/admin/applications/:id/followups', wrap(async (req, res) => {
  const applicationID = idOf(req.params.id);
  const visitDate = dateValue(req.body?.visitDate, '回访日期');
  const channel = required(req.body?.channel, '回访方式', 20);
  const animalCondition = required(req.body?.animalCondition, '动物状况', 20);
  const note = required(req.body?.note, '回访内容', 2000);
  const nextVisitDate = req.body?.nextVisitDate ? dateValue(req.body.nextVisitDate,'下次回访日期') : null;
  if (visitDate > localDate()) fail(400, '实际回访日期不能晚于今天');
  if (nextVisitDate && nextVisitDate < visitDate) fail(400, '下次回访日期不能早于本次回访');
  const visitID = await applicationTransaction(applicationID, async (connection,item) => {
    if (item.status !== 'completed') fail(409, '办理领养后才能记录回访');
    if (visitDate < String(item.completedDate||item.completedAt).slice(0,10)) fail(400, '回访日期不能早于领养办理日期');
    const [result] = await connection.execute(`INSERT INTO FollowUpVisits(applicationID,visitDate,channel,animalCondition,note,nextVisitDate,createdBy)
      VALUES(?,?,?,?,?,?,?)`, [applicationID,visitDate,channel,animalCondition,note,nextVisitDate,req.session.admin.id]);
    await addEvent(connection,applicationID,'admin','followup',`${visitDate} · ${channel} · ${animalCondition}`);
    await notifyMember(connection,item.patronID,applicationID,'新增回访记录',`${item.animalName}的回访记录已更新，可在个人中心查看。`);
    return result.insertId;
  });
  void deliverReminders().catch(error => console.error('Reminder delivery failed:', error));
  res.status(201).json({ ok: true, visitID });
}));

adoptionRouter.get('/admin/notifications/page', notificationPage('admin'));
adoptionRouter.get('/admin/notifications', wrap(async (req, res) => {
  res.json(await query("SELECT * FROM Notifications WHERE recipientRole='admin' AND recipientID=? ORDER BY createdAt DESC,notificationID DESC LIMIT 100", [req.session.admin.id]));
}));
adoptionRouter.post('/admin/notifications/:id/read', wrap(async (req, res) => {
  await query("UPDATE Notifications SET isRead=1 WHERE notificationID=? AND recipientRole='admin' AND recipientID=?", [idOf(req.params.id),req.session.admin.id]);
  res.json({ ok: true });
}));
