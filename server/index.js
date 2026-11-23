import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, query, lockAnimal } from './db.js';
import { resources, cleanData, keyClause, validateCareDates, validatePreferenceAges } from './resources.js';
import { isDateOnly, localDate, shiftedLocalDate } from './dates.js';
import { medicalPlans, followupPlans } from './care-plans.js';
import { cleanPhotoDrafts, commitPhotoDrafts, isUnpublishedAnimalPhoto, stagePhoto, useAnimalPhotoDraft } from './photo-drafts.js';
import { adoptionRouter } from './adoption.js';
import { migrate } from './migrations.js';
import { deliverReminders } from './reminders.js';
import { businessRouter, lockDonationPatrons, recalculateDonations } from './business.js';
import { authRouter, limitAuth, requireCurrentAccount } from './auth.js';
import { MySQLSessionStore } from './session-store.js';
import {communityRouter} from './community.js';
import {aiRouter} from './ai.js';
import {migrateCommunity} from './community-migrations.js';

import {backupRouter,recoverInterruptedRestore} from './backups.js';
import {backupGate,databaseRoute as route,runBackupAware} from './backup-gate.js';
const app = express();
app.use('/api',backupGate);
const port = Number(process.env.PORT || 27470);
const here = path.dirname(fileURLToPath(import.meta.url));
const secretFile = path.join(process.env.LOCALAPPDATA || here, 'AnimalShelterMySQL', 'session-secret');
async function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  await mkdir(path.dirname(secretFile), { recursive: true });
  try { return (await readFile(secretFile, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const secret = crypto.randomBytes(48).toString('hex');
    try { await writeFile(secretFile, secret, { flag: 'wx', mode: 0o600 }); return secret; }
    catch (writeError) { if (writeError.code === 'EEXIST') return (await readFile(secretFile, 'utf8')).trim(); throw writeError; }
  }
}
const secret = await sessionSecret();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
    try { if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: '请求来源不正确' }); }
    catch { return res.status(403).json({ error: '请求来源不正确' }); }
  }
  next();
});
app.use('/api',session({
  name: 'shelter.sid',
  secret,
  store: new MySQLSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 8 * 60 * 60 * 1000 },
}));
app.use('/imgs', (req,res,next) => {
  let pathname;
  try { pathname=path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g,'/')).toLowerCase(); }
  catch { return res.sendStatus(404); }
  runBackupAware(()=>isUnpublishedAnimalPhoto('imgs'+pathname)).then(draft=>{
    if (res.destroyed) return;
    if (draft===undefined) return res.sendStatus(503);
    return draft?res.sendStatus(404):next();
  },next);
}, express.static(path.join(here, 'imgs'), { redirect: false }), (_req, res) => res.sendStatus(404));

const requireAdmin = (req, res, next) => req.session.admin ? next() : res.status(401).json({ error: '请先登录管理账号' });

app.get('/api/health', route(async (req, res) => {
  const target = {
    dbHost: process.env.DB_HOST || '127.0.0.1',
    dbPort: String(Number(process.env.DB_PORT || 3306)),
    dbName: process.env.DB_NAME || 'animal_shelter_react',
  };
  if (Object.entries(target).some(([key, value]) => req.query[key] !== undefined && req.query[key] !== value)) {
    return res.status(409).json({ error: '服务连接的数据库与启动配置不一致' });
  }
  await query('SELECT 1');
  const targetVerified = Object.keys(target).every(key => req.query[key] !== undefined);
  res.json({ ok: true, service: 'shiguang-animal-shelter', ...(targetVerified ? { targetVerified } : {}) });
}));
app.use('/api', requireCurrentAccount);

app.get('/api/session', (req, res) => {
  const { admin, member } = req.session;
  res.json({
    authenticated: Boolean(admin || member),
    role: admin ? 'admin' : member ? 'member' : null,
    admin: admin || null,
    member: member ? { ...member, name: res.locals.memberName ?? member.name } : null,
  });
});

app.post('/api/login', limitAuth, route(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const rows = await query('SELECT adminID, username, password, credentialVersion FROM Admins WHERE username = ? LIMIT 1', [username]);
  const user = rows[0];
  const matches = user && await bcrypt.compare(password, user.password);
  if (!matches) return res.status(401).json({ error: '账号或密码错误' });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: '登录失败，请重试' });
    req.session.admin = { id: user.adminID, username: user.username, credentialVersion: user.credentialVersion };
    res.json({ authenticated: true, role: 'admin', admin: req.session.admin, member: null });
  });
}));

app.post('/api/logout', route((req, res) => req.session.destroy(() => res.json({ ok: true }))));
app.use('/api', authRouter);

app.get('/api/catalog', route(async (_req, res) => {
  const rows = await query(`SELECT a.animalID, a.animalName, a.species, a.age, a.gender, a.breed, a.size, a.healthStatus, a.pictureURL, d.restrictions
    FROM Adoptable d JOIN Animals a ON a.animalID = d.animalID
    WHERE NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=a.animalID AND ap.status IN ('approved','completed'))
    AND NOT EXISTS (SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=a.animalID)
    AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=a.animalID AND f.status='active')
    ORDER BY a.animalID DESC`);
  res.json(rows);
}));

app.get('/api/catalog-page', route(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 9);
  const search = String(req.query.search || '').trim();
  const species = String(req.query.species || 'all');
  const size = String(req.query.size || 'all');
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 24) return res.status(400).json({ error: '分页参数无效' });
  if (search.length > 80) return res.status(400).json({ error: '搜索内容不能超过80字' });
  if (!['all', 'Canine', 'Feline'].includes(species) || !['all', '小型', '中型', '大型'].includes(size)) return res.status(400).json({ error: '筛选条件无效' });
  const filters = [];
  const values = [];
  if (species !== 'all') { filters.push('a.species=?'); values.push(species); }
  if (size !== 'all') { filters.push('a.size=?'); values.push(size); }
  if (search) { filters.push('(a.animalName LIKE ? OR a.breed LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }
  const where = `FROM Adoptable d JOIN Animals a ON a.animalID=d.animalID
    WHERE NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=a.animalID AND ap.status IN ('approved','completed'))
    AND NOT EXISTS (SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=a.animalID)
    AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=a.animalID AND f.status='active')
    ${filters.length ? `AND ${filters.join(' AND ')}` : ''}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${where}`, values);
  const pages = Math.max(1, Math.ceil(Number(total) / limit));
  const currentPage = Math.min(page, pages);
  const [rows] = await pool.query(`SELECT a.animalID,a.animalName,a.species,a.age,a.gender,a.breed,a.size,a.healthStatus,a.pictureURL,d.restrictions,
    ROW_NUMBER() OVER (PARTITION BY a.species ORDER BY a.animalID DESC) AS speciesRank ${where}
    ORDER BY speciesRank, CASE WHEN a.species='Canine' THEN 0 ELSE 1 END, a.animalID DESC LIMIT ? OFFSET ?`, [...values, limit, (currentPage - 1) * limit]);
  res.json({ items: rows, total: Number(total), page: currentPage, pageCount: pages, limit });
}));

app.get('/api/catalog/:id', route(async (req, res) => {
  const animalID=Number(req.params.id);
  if(!Number.isSafeInteger(animalID)||animalID<1) return res.status(400).json({error:'动物编号无效'});
  const rows=await query(`SELECT a.animalID,a.animalName,a.species,a.age,a.gender,a.breed,a.size,a.pictureURL,a.intakeDate,a.description,d.restrictions
    FROM Adoptable d JOIN Animals a ON a.animalID=d.animalID WHERE a.animalID=?
    AND NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=a.animalID AND ap.status IN ('approved','completed'))
    AND NOT EXISTS (SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=a.animalID)
    AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=a.animalID AND f.status='active')`,[animalID]);
  if(!rows[0]) return res.status(404).json({error:'这只动物当前不在待领养名单'});
  res.json(rows[0]);
}));

app.use('/api', communityRouter);
app.use('/api', aiRouter);
app.use('/api', backupRouter);
app.use('/api', adoptionRouter);
app.use('/api', requireAdmin);
app.use('/api', businessRouter);

app.post('/api/animal-photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), route(async (req, res) => {
  const pictureURL=await stagePhoto('animal',req.body,{role:'admin',id:req.session.admin.id});
  res.status(201).json({pictureURL});
}));

app.get('/api/meta', route(async (_req, res) => {
  const [animals, patrons, vaccines, adoptable, medicalVisits] = await Promise.all([
    query('SELECT animalID, animalName, species FROM Animals ORDER BY animalID'),
    query('SELECT patronID, firstName, lastName FROM Patrons ORDER BY patronID'),
    query('SELECT vaccineID, name, species, doses FROM Vaccines ORDER BY vaccineID'),
    query("SELECT d.animalID FROM Adoptable d WHERE NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=d.animalID AND ap.status='approved') AND NOT EXISTS (SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=d.animalID) AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=d.animalID AND f.status='active') ORDER BY d.animalID"),
    query('SELECT visitID,animalID,visitDate,diagnosis FROM MedicalVisits ORDER BY visitDate DESC,visitID DESC'),
  ]);
  res.json({ animals, patrons, vaccines, adoptable, medicalVisits });
}));

app.get('/api/dashboard', route(async (_req, res) => {
  const [counts, species, donations, inventory, placements, recent] = await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM Animals) AS animals,
      (SELECT COUNT(*) FROM Adoptable d WHERE NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=d.animalID AND ap.status='approved') AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=d.animalID AND f.status='active')) AS adoptable,
      (SELECT COUNT(*) FROM Patrons) AS patrons,
      (SELECT COUNT(*) FROM AdoptionApplications WHERE status='pending') AS pendingApplications,
      (SELECT COUNT(*) FROM FostersAndAdoptions WHERE fosteredOrAdopted = 'A') AS adopted,
      (SELECT COUNT(*) FROM FosterRecords WHERE status='active') AS fostered,
      (SELECT COALESCE(SUM(amount),0) FROM Donations WHERE status='active') AS donated`),
    query('SELECT species AS name, COUNT(*) AS value FROM Animals GROUP BY species ORDER BY value DESC'),
    query(`SELECT DATE_FORMAT(donationDate, '%Y-%m') AS month, SUM(amount) AS amount FROM Donations WHERE status='active'
      AND donationDate >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
      AND donationDate < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
      GROUP BY DATE_FORMAT(donationDate, '%Y-%m')`),
    query('SELECT COALESCE(category,\'未分类\') AS name, SUM(quantity) AS value FROM Inventory GROUP BY category ORDER BY value DESC'),
    query(`SELECT 'A' AS type, COUNT(*) AS value FROM FostersAndAdoptions WHERE fosteredOrAdopted='A'
      UNION ALL SELECT 'F' AS type, COUNT(*) AS value FROM FosterRecords`),
    query(`SELECT activity.animalID,a.animalName,activity.date,activity.fosteredOrAdopted,CONCAT(p.lastName,p.firstName) AS patronName
      FROM (SELECT animalID,patronID,date,fosteredOrAdopted FROM FostersAndAdoptions WHERE fosteredOrAdopted='A'
        UNION ALL SELECT animalID,patronID,startDate AS date,'F' AS fosteredOrAdopted FROM FosterRecords) activity
      JOIN Animals a ON a.animalID=activity.animalID
      LEFT JOIN Patrons p ON p.patronID=activity.patronID ORDER BY activity.date DESC LIMIT 5`),
  ]);
  const donationTotals = new Map(donations.map(row => [row.month, Number(row.amount)]));
  const today = new Date();
  const sixMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { month, amount: donationTotals.get(month) || 0 };
  });
  res.json({ counts: counts[0], species, donations: sixMonths, inventory, placements, recent });
}));

app.get('/api/analytics', route(async (req, res) => {
  const now = new Date(), today = localDate(now);
  const from = String(req.query.from || shiftedLocalDate(-365,now)), to = String(req.query.to || today);
  if (!isDateOnly(from) || !isDateOnly(to) || from>to) return res.status(400).json({error:'请选择有效的统计时间范围'});
  const completedDay = 'COALESCE(completedDate,DATE(completedAt))';
  const planWindow = [today,shiftedLocalDate(30,now)];
  const [applicationStatus, monthlyApplications, monthlyAdoptions, health, statusDistribution, lowStock, dueMedical, dueFollowups, overview, operations] = await Promise.all([
    query('SELECT status,COUNT(*) AS total FROM AdoptionApplications WHERE DATE(submittedAt) BETWEEN ? AND ? GROUP BY status',[from,to]),
    query("SELECT DATE_FORMAT(submittedAt,'%Y-%m') AS month,COUNT(*) AS total FROM AdoptionApplications WHERE DATE(submittedAt) BETWEEN ? AND ? GROUP BY month ORDER BY month",[from,to]),
    query(`SELECT DATE_FORMAT(${completedDay},'%Y-%m') AS month,COUNT(*) AS total FROM AdoptionApplications
      WHERE status='completed' AND ${completedDay} BETWEEN ? AND ? GROUP BY month ORDER BY month`,[from,to]),
    query('SELECT healthStatus AS name,COUNT(*) AS total FROM Animals GROUP BY healthStatus ORDER BY total DESC'),
    query(`SELECT state.name,COUNT(*) total FROM (
      SELECT CASE WHEN placed.animalID IS NOT NULL THEN '已领养'
        WHEN foster.animalID IS NOT NULL THEN '寄养中'
        WHEN approved.animalID IS NOT NULL THEN '待办理'
        WHEN d.animalID IS NOT NULL THEN '待领养' ELSE '收容中' END name
      FROM Animals a
      LEFT JOIN FostersAndAdoptions placed ON placed.animalID=a.animalID AND placed.fosteredOrAdopted='A'
      LEFT JOIN (SELECT DISTINCT animalID FROM FosterRecords WHERE status='active') foster ON foster.animalID=a.animalID
      LEFT JOIN (SELECT DISTINCT animalID FROM AdoptionApplications WHERE status='approved') approved ON approved.animalID=a.animalID
      LEFT JOIN Adoptable d ON d.animalID=a.animalID
    ) state GROUP BY state.name ORDER BY total DESC`),
    query('SELECT itemID,itemName,category,quantity,unit FROM Inventory WHERE quantity<=10 ORDER BY quantity,itemName LIMIT 20'),
    query(`SELECT visitID,animalName,nextVisitDate FROM (${medicalPlans}) planned
      WHERE nextVisitDate BETWEEN ? AND ? ORDER BY nextVisitDate,visitID LIMIT 20`,planWindow),
    query(`SELECT visitID,animalName,nextVisitDate FROM (${followupPlans}) planned
      WHERE nextVisitDate BETWEEN ? AND ? ORDER BY nextVisitDate,visitID LIMIT 20`,planWindow),
    query(`SELECT COUNT(*) AS applications,
      SUM(status='completed') AS completed,
      SUM(status IN ('approved','completed','cancelled')) AS approved,
      SUM(status IN ('approved','completed','rejected','cancelled')) AS reviewed,
      SUM(status='pending') AS pending,
      ROUND(AVG(CASE WHEN reviewedAt IS NOT NULL THEN TIMESTAMPDIFF(HOUR,submittedAt,reviewedAt) END),1) AS avgReviewHours
      FROM AdoptionApplications WHERE DATE(submittedAt) BETWEEN ? AND ?`,[from,to]),
    query(`SELECT
      (SELECT COUNT(*) FROM Animals) AS animals,
      (SELECT COUNT(*) FROM FosterRecords WHERE status='active') AS activeFosters,
      (SELECT COUNT(*) FROM FosterRecords WHERE startDate BETWEEN ? AND ?) AS fosterStarts,
      (SELECT COUNT(*) FROM AdoptionApplications WHERE status='completed' AND ${completedDay} BETWEEN ? AND ?) AS completedInRange,
      (SELECT COUNT(*) FROM MedicalVisits WHERE visitDate BETWEEN ? AND ?) AS medicalVisits,
      (SELECT COUNT(*) FROM VaccinationEvents WHERE dateGiven BETWEEN ? AND ?) AS vaccinations,
      (SELECT COALESCE(SUM(amount),0) FROM Donations WHERE status='active' AND donationDate BETWEEN ? AND ?) AS donated,
      (SELECT COUNT(*) FROM MaterialDonations WHERE status='active' AND donationDate BETWEEN ? AND ?) AS materialDonations,
      (SELECT COUNT(*) FROM Inventory) AS stockTypes`,[from,to,from,to,from,to,from,to,from,to,from,to,from,to]),
  ]);
  res.json({ range:{from,to}, applicationStatus, monthlyApplications, monthlyAdoptions, health, statusDistribution, lowStock, dueMedical, dueFollowups, overview: overview[0], operations: operations[0] });
}));

app.get('/api/resources/:name', route(async (req, res) => {
  const resource = resources[req.params.name];
  if (!resource) return res.status(404).json({ error: '没有这个模块' });
  if (req.params.name === 'animals') {
    const rows = await query(`SELECT a.*, CASE WHEN p.animalID IS NOT NULL THEN
      CASE WHEN p.fosteredOrAdopted = 'A' THEN '已领养' ELSE '寄养中' END
      WHEN foster.animalID IS NOT NULL THEN '寄养中'
      WHEN approved.animalID IS NOT NULL THEN '待办理'
      WHEN d.animalID IS NOT NULL THEN '待领养' ELSE '收容中' END AS status
      FROM Animals a LEFT JOIN FostersAndAdoptions p ON p.animalID = a.animalID
      LEFT JOIN Adoptable d ON d.animalID = a.animalID
      LEFT JOIN (SELECT DISTINCT animalID FROM AdoptionApplications WHERE status='approved') approved ON approved.animalID=a.animalID
      LEFT JOIN (SELECT DISTINCT animalID FROM FosterRecords WHERE status='active') foster ON foster.animalID=a.animalID
      ORDER BY a.animalID DESC`);
    return res.json(rows);
  }
  if (req.params.name === 'medical') {
    return res.json(await query(`SELECT v.*,EXISTS(SELECT 1 FROM PrescriptionCourses p WHERE p.visitID=v.visitID) hasPrescriptions
      FROM MedicalVisits v ORDER BY v.visitID DESC`));
  }
  const order = resource.keys.map((field) => `\`${field}\` DESC`).join(', ');
  const rows = await query(`SELECT * FROM \`${resource.table}\` ORDER BY ${order}`);
  res.json(rows);
}));

async function lockPrescriptionVisit(connection, visitID) {
  if (visitID == null) return null;
  const [[visit]] = await connection.execute('SELECT animalID FROM MedicalVisits WHERE visitID=? FOR UPDATE', [visitID]);
  if (!visit) throw Object.assign(new Error('关联的诊疗记录不存在'), { status: 400 });
  return visit;
}

function verifyPrescriptionAnimal(visit, animalID) {
  if (visit && Number(visit.animalID) !== Number(animalID)) {
    throw Object.assign(new Error('处方与诊疗记录必须属于同一只动物'), { status: 400 });
  }
}

async function deductVaccineDose(connection, data) {
  const [[vaccine]] = await connection.execute('SELECT vaccineID,name,species,doses FROM Vaccines WHERE name=? FOR UPDATE', [data.vaccineName]);
  if (!vaccine) throw Object.assign(new Error('请从疫苗目录选择疫苗'), { status: 400 });
  if (data.vaccineID && Number(data.vaccineID) !== Number(vaccine.vaccineID)) throw Object.assign(new Error('疫苗编号与名称不一致'), { status: 400 });
  if (vaccine.doses == null || Number(vaccine.doses) < 1) throw Object.assign(new Error('疫苗库存不足，请先补充库存剂量'), { status: 409 });
  const [[animal]] = await connection.execute('SELECT species FROM Animals WHERE animalID=?', [data.animalID]);
  if (!animal) throw Object.assign(new Error('动物档案不存在'), { status: 400 });
  if (vaccine.species && ({ D: 'Canine', C: 'Feline' }[vaccine.species]) !== animal.species) throw Object.assign(new Error('该疫苗不适用于这只动物的种类'), { status: 400 });
  await connection.execute('UPDATE Vaccines SET doses=doses-1 WHERE vaccineID=?', [vaccine.vaccineID]);
  data.vaccineID = vaccine.vaccineID;
  data.stockDeducted = 1;
}

app.post('/api/resources/:name', route(async (req, res) => {
  const resource = resources[req.params.name];
  if (!resource) return res.status(404).json({ error: '没有这个模块' });
  if (req.params.name === 'placements') return res.status(409).json({error:'请在已通过的领养申请中完成正式办理'});
  const data = cleanData(resource, req.body?.data);
  validateCareDates(resource,data);
  if (req.params.name === 'preferences') validatePreferenceAges(data);
  const fields = Object.keys(data);
  if (!fields.length) return res.status(400).json({ error: '请填写记录内容' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (req.params.name === 'adoptable') {
      await lockAnimal(connection,data.animalID);
      const [[placed]] = await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=? LIMIT 1', [data.animalID]);
      if (placed) throw Object.assign(new Error('已办理寄养或领养的动物不能加入待领养名单'), { status: 409 });
      const [[foster]] = await connection.execute("SELECT fosterID FROM FosterRecords WHERE animalID=? AND status='active' LIMIT 1", [data.animalID]);
      if (foster) throw Object.assign(new Error('寄养中的动物不能加入待领养名单'), { status: 409 });
    }
    if (req.params.name === 'prescriptions') verifyPrescriptionAnimal(await lockPrescriptionVisit(connection,data.visitID),data.animalID);
    if (req.params.name === 'vaccinations') await deductVaccineDose(connection, data);
    if (req.params.name === 'preferences') {
      const [[existing]] = await connection.execute('SELECT preferenceID FROM PatronPreferences WHERE patronID=?', [data.patronID]);
      if (existing) throw Object.assign(new Error('该领养人已有偏好记录，请编辑现有记录'), { status: 409 });
    }
    if (req.params.name === 'vaccines' && data.doses == null) throw Object.assign(new Error('请填写库存剂量'), { status: 400 });
    if (req.params.name === 'donations') await lockDonationPatrons(connection,data.patronID);
    const insertFields = Object.keys(data);
    const [result] = await connection.execute(`INSERT INTO \`${resource.table}\` (${insertFields.map((f) => `\`${f}\``).join(',')}) VALUES (${insertFields.map(() => '?').join(',')})`, Object.values(data));
    if (req.params.name === 'animals' && data.healthStatus && data.healthStatus!=='待评估') await connection.execute('INSERT INTO AnimalHealthHistory(animalID,oldStatus,newStatus,note,changedBy) VALUES(?,NULL,?,?,?)',[result.insertId,data.healthStatus,data.healthNotes,req.session.admin.id]);
    if (req.params.name === 'adoptable') await connection.execute('INSERT INTO AnimalStatusHistory(animalID,eventType,note,changedBy) VALUES(?,?,?,?)',[data.animalID,'adoptable_added','加入待领养名单',req.session.admin.id]);
    if (req.params.name === 'inventory') await connection.execute("INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason,handledBy) VALUES(?,'opening',?,?,?,?)",[result.insertId,Number(data.quantity),Number(data.quantity),'期初库存',req.session.admin.id]);
    if (req.params.name === 'donations') await recalculateDonations(connection, data.patronID);
    const photos=req.params.name==='animals'?await useAnimalPhotoDraft(connection,data.pictureURL,req.session.admin.id):[];
    await commitPhotoDrafts(connection,photos);
    if (['medical','vaccinations'].includes(req.params.name)) void deliverReminders().catch(error => console.error('Reminder delivery failed:', error));
    res.status(201).json({ ok: true, insertId: result.insertId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

app.put('/api/resources/:name', route(async (req, res) => {
  const resource = resources[req.params.name];
  if (!resource) return res.status(404).json({ error: '没有这个模块' });
  if (req.params.name === 'placements') return res.status(409).json({error:'领养办理记录需通过申请流程维护'});
  const { sql: where, values: keys } = keyClause(resource, req.body?.key);
  const data = cleanData(resource, req.body?.data, true);
  if (req.params.name === 'inventory' && Object.hasOwn(data,'quantity')) return res.status(409).json({error:'库存数量请在物资出入库中调整并填写原因'});
  if (req.params.name === 'vaccines' && Object.hasOwn(data,'doses') && data.doses == null) return res.status(400).json({error:'请填写库存剂量'});
  const fields = Object.keys(data);
  if (!fields.length) return res.status(400).json({ error: '没有可保存的修改' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (req.params.name === 'adoptable') await lockAnimal(connection,keys[0]);
    if (req.params.name === 'preferences' && (Object.hasOwn(data,'minAge') || Object.hasOwn(data,'maxAge'))) {
      const [[old]] = await connection.execute(`SELECT minAge,maxAge FROM PatronPreferences WHERE ${where} FOR UPDATE`, keys);
      if (!old) throw Object.assign(new Error('偏好记录已不存在'), { status: 404 });
      validatePreferenceAges({...old,...data});
    }
    let oldPatron;
    let oldHealth;
    if (req.params.name === 'animals') {
      const [[animal]]=await connection.execute(`SELECT healthStatus,healthNotes FROM Animals WHERE ${where} FOR UPDATE`,keys);
      oldHealth=animal;
      if (animal && data.healthStatus && data.healthStatus!==animal.healthStatus) {
        const evidence=String(data.healthNotes||'').trim();
        if (!evidence || evidence===String(animal.healthNotes||'').trim() || evidence==='健康记录待补充') throw Object.assign(new Error('更改健康状态时请更新健康备注，写明本次评估依据'),{status:400});
      }
    }
    if (req.params.name === 'donations') {
      const [[old]] = await connection.execute(`SELECT patronID,status FROM Donations WHERE ${where} FOR UPDATE`, keys);
      if(old?.status==='void') throw Object.assign(new Error('已撤销的捐赠不能修改'),{status:409});
      oldPatron = old?.patronID;
      if (old) await lockDonationPatrons(connection,oldPatron,data.patronID??oldPatron);
    }
    if (req.params.name === 'medical') {
      const [[old]] = await connection.execute(`SELECT visitID,animalID,visitDate,nextVisitDate FROM MedicalVisits WHERE ${where} FOR UPDATE`, keys);
      if (!old) throw Object.assign(new Error('诊疗记录已不存在'), { status: 404 });
      if (Object.hasOwn(data,'animalID') && Number(data.animalID) !== Number(old.animalID)) {
        // A prescription must lock this visit before it can create a new link.
        const [[linked]] = await connection.execute('SELECT prescriptionID FROM PrescriptionCourses WHERE visitID=? LIMIT 1', [old.visitID]);
        if (linked) throw Object.assign(new Error('这条诊疗已关联处方，不能改为其他动物'), {status:409});
      }
      validateCareDates(resource,{...old,...data});
    }
    if (req.params.name === 'prescriptions') {
      const visit = await lockPrescriptionVisit(connection,data.visitID);
      const [[old]] = await connection.execute(`SELECT animalID,prescribedAt FROM PrescriptionCourses WHERE ${where} FOR UPDATE`, keys);
      if (!old) throw Object.assign(new Error('处方记录已不存在'), { status: 404 });
      if (Object.hasOwn(data,'animalID') && Number(data.animalID) !== Number(old.animalID)) throw Object.assign(new Error('处方所属动物不可修改'), { status: 409 });
      verifyPrescriptionAnimal(visit,old.animalID);
      validateCareDates(resource,{...old,...data});
    }
    if (req.params.name === 'vaccinations') {
      const [[old]] = await connection.execute(`SELECT animalID,vaccineName,vaccineID,dateGiven,dateExpires FROM VaccinationEvents WHERE ${where} FOR UPDATE`, keys);
      if (!old) throw Object.assign(new Error('接种记录已不存在'), { status: 404 });
      if (Object.hasOwn(data,'animalID') && Number(data.animalID) !== Number(old.animalID)) throw Object.assign(new Error('接种记录所属动物不可修改'), { status: 409 });
      const changedID = Object.hasOwn(data,'vaccineID') && (data.vaccineID===null ? old.vaccineID!==null : old.vaccineID===null || Number(data.vaccineID)!==Number(old.vaccineID));
      if (changedID || (Object.hasOwn(data,'vaccineName') && data.vaccineName !== old.vaccineName)) {
        throw Object.assign(new Error('接种疫苗不可直接更换，请删除记录后重新登记'), { status: 409 });
      }
      validateCareDates(resource,{...old,...data});
    }
    const [result] = await connection.execute(`UPDATE \`${resource.table}\` SET ${fields.map((f) => `\`${f}\` = ?`).join(', ')} WHERE ${where}`, [...Object.values(data), ...keys]);
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ error: '记录已不存在' }); }
    if (req.params.name === 'donations') {
      await recalculateDonations(connection, oldPatron);
      if (data.patronID && data.patronID !== oldPatron) await recalculateDonations(connection, data.patronID);
    }
    if (req.params.name === 'animals' && oldHealth && data.healthStatus && data.healthStatus!==oldHealth.healthStatus) {
      await connection.execute('INSERT INTO AnimalHealthHistory(animalID,oldStatus,newStatus,note,changedBy) VALUES(?,?,?,?,?)',[keys[0],oldHealth.healthStatus,data.healthStatus,String(data.healthNotes||oldHealth.healthNotes||'状态已重新评估'),req.session.admin.id]);
    }
    const photos=req.params.name==='animals'?await useAnimalPhotoDraft(connection,data.pictureURL,req.session.admin.id):[];
    await commitPhotoDrafts(connection,photos);
    if (['medical','vaccinations'].includes(req.params.name)) void deliverReminders().catch(error => console.error('Reminder delivery failed:', error));
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

app.delete('/api/resources/:name', route(async (req, res) => {
  const resource = resources[req.params.name];
  if (!resource) return res.status(404).json({ error: '没有这个模块' });
  if (req.params.name === 'placements') return res.status(409).json({error:'领养办理记录不能直接删除'});
  if (req.params.name === 'donations') return res.status(409).json({error:'金额捐赠请使用撤销操作，保留历史记录'});
  const { sql: where, values: keys } = keyClause(resource, req.body?.key);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (req.params.name === 'animals') {
      await lockAnimal(connection,keys[0]);
      const [[placement]] = await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=?', keys);
      if (placement) throw Object.assign(new Error('这只动物已有正式办理记录，不能删除档案'), { status: 409 });
    }
    if (req.params.name === 'prescriptions') {
      // Startup would import the source row again after its migrated copy is deleted.
      await connection.execute(`DELETE p FROM Prescriptions p JOIN PrescriptionCourses c
        ON p.animalID=c.legacyAnimalID AND BINARY p.name=BINARY c.legacyName
        WHERE c.prescriptionID=?`, keys);
    }
    if (req.params.name === 'adoptable') {
      await lockAnimal(connection,keys[0]);
      const [[linked]] = await connection.execute("SELECT applicationID FROM AdoptionApplications WHERE animalID=? AND status IN ('pending','approved') LIMIT 1", [keys[0]]);
      if (linked) throw Object.assign(new Error('这只动物有待处理的领养申请，不能移出待领养名单'), { status: 409 });
    }
    if (req.params.name === 'patrons') {
      await lockDonationPatrons(connection,keys[0]);
      const [[donation]] = await connection.execute('SELECT donationID FROM Donations WHERE patronID=? LIMIT 1',keys);
      if (donation) throw Object.assign(new Error('该人员已有金额捐赠记录，无法删除。有效和已撤销的记录都需保留。'), { status: 409 });
    }
    if (req.params.name === 'vaccines') {
      await connection.execute('SELECT vaccineID FROM Vaccines WHERE vaccineID=? FOR UPDATE', [keys[0]]);
      const [[charged]] = await connection.execute('SELECT vaccinationID FROM VaccinationEvents WHERE vaccineID=? AND stockDeducted=1 LIMIT 1', [keys[0]]);
      if (charged) throw Object.assign(new Error('此疫苗仍有已扣库存的接种记录，请先处理这些记录'), {status:409});
    }
    if (req.params.name === 'vaccinations') {
      const [[old]] = await connection.execute(`SELECT vaccineID,stockDeducted FROM VaccinationEvents WHERE ${where} FOR UPDATE`, keys);
      if (old?.stockDeducted) {
        if (old.vaccineID==null) throw Object.assign(new Error('该接种曾扣减库存但缺少疫苗关联，请先核对历史记录'), {status:409});
        await connection.execute('UPDATE Vaccines SET doses=COALESCE(doses,0)+1 WHERE vaccineID=?', [old.vaccineID]);
      }
    }
    const [result] = await connection.execute(`DELETE FROM \`${resource.table}\` WHERE ${where}`, keys);
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ error: '记录已不存在' }); }
    if (req.params.name === 'adoptable') await connection.execute('INSERT INTO AnimalStatusHistory(animalID,eventType,note,changedBy) VALUES(?,?,?,?)',[keys[0],'adoptable_removed','移出待领养名单',req.session.admin.id]);
    await connection.commit();
    if (['medical','vaccinations'].includes(req.params.name)) void deliverReminders().catch(error => console.error('Reminder delivery failed:', error));
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

app.use(express.static(path.join(here, '..', 'client', 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(here, '..', 'client', 'dist', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '这条记录已经存在，请检查编号或名称' });
  if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: '该记录仍被其他业务使用，暂时不能删除' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: '关联的动物、人员或疫苗不存在' });
  if (error.code === 'ER_DATA_TOO_LONG') return res.status(400).json({ error: '填写内容过长，请缩短后再保存' });
  res.status(500).json({ error: '保存失败，请稍后重试或查看服务日志' });
});

recoverInterruptedRestore().then(async () => {
  await migrate();
  await migrateCommunity();
  await cleanPhotoDrafts(true);
  const photoCleanup=setInterval(()=>runBackupAware(cleanPhotoDrafts).catch(error=>console.error('Photo cleanup failed:',error)),5*60*1000);
  photoCleanup.unref();
  await deliverReminders();
  const sessionCleanup = setInterval(() => runBackupAware(()=>query('DELETE FROM WebSessions WHERE expiresAt<NOW()')).catch(error => console.error('Session cleanup failed:', error)), 60 * 60 * 1000);
  sessionCleanup.unref();
  const timer = setInterval(() => deliverReminders().catch(error => console.error('Reminder delivery failed:', error)), 12 * 60 * 60 * 1000);
  timer.unref();
  app.listen(port, '127.0.0.1', () => console.log(`Shelter app ready at http://localhost:${port}`));
}).catch(error => { console.error('Shelter startup failed:', error); process.exitCode = 1; pool.end(); });
