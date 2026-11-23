import { Router } from 'express';
import { pool, query, lockAnimal } from './db.js';
import { isDateOnly, localDate } from './dates.js';
import { stockQuantity, unrecordedOpeningReason } from './resources.js';

import {databaseRoute as wrap} from './backup-gate.js';

export const businessRouter = Router();
const fail = (status,message) => { throw Object.assign(new Error(message), {status}); };
const id = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<1) fail(400,'编号无效'); return n; };
const date = (value,label) => { if(!isDateOnly(value)) fail(400,`${label}无效`); return value; };
const dateOnly = value => value instanceof Date ? localDate(value) : String(value).slice(0,10);
const note = (value,label,required=false) => { const s=String(value||'').trim(); if(required&&!s) fail(400,`请填写${label}`); if(s.length>255) fail(400,`${label}不能超过255字`); return s; };

businessRouter.get('/fosters', wrap(async (_req,res) => {
  res.json(await query(`SELECT f.*,a.animalName,CONCAT(p.lastName,p.firstName) patronName
    FROM FosterRecords f JOIN Animals a ON a.animalID=f.animalID
    LEFT JOIN Patrons p ON p.patronID=f.patronID
    ORDER BY (f.status='active') DESC,f.startDate DESC,f.fosterID DESC`));
}));

businessRouter.post('/fosters', wrap(async (req,res) => {
  const animalID=id(req.body?.animalID), patronID=id(req.body?.patronID);
  const startDate=date(req.body?.startDate,'开始日期'), expectedEndDate=date(req.body?.expectedEndDate,'预计结束日期');
  if(startDate>localDate()) fail(400,'开始日期不能晚于今天');
  if(expectedEndDate<startDate) fail(400,'预计结束日期不能早于开始日期');
  const startNote=note(req.body?.startNote,'寄养备注');
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const animal=await lockAnimal(connection,animalID);
    if(!animal) fail(404,'动物不存在');
    const [[patron]]=await connection.execute('SELECT patronID FROM Patrons WHERE patronID=?',[patronID]);
    if(!patron) fail(404,'寄养人不存在');
    const [[placed]]=await connection.execute('SELECT animalID FROM FostersAndAdoptions WHERE animalID=?',[animalID]);
    const [[active]]=await connection.execute("SELECT fosterID FROM FosterRecords WHERE animalID=? AND status='active'",[animalID]);
    const [[application]]=await connection.execute("SELECT applicationID FROM AdoptionApplications WHERE animalID=? AND status IN ('pending','approved') LIMIT 1",[animalID]);
    if(placed||active||application) fail(409,'该动物已办理领养、正在寄养或有待处理申请');
    const [[overlap]]=await connection.execute(`SELECT fosterID FROM FosterRecords
      WHERE animalID=? AND status='ended' AND actualEndDate>? LIMIT 1`,[animalID,startDate]);
    if(overlap) fail(409,'开始日期与已有寄养记录重叠，请核对上次寄养的实际结束日期');
    const [result]=await connection.execute(`INSERT INTO FosterRecords(animalID,patronID,startDate,expectedEndDate,startNote,createdBy)
      VALUES(?,?,?,?,?,?)`,[animalID,patronID,startDate,expectedEndDate,startNote,req.session.admin.id]);
    await connection.execute('INSERT INTO AnimalStatusHistory(animalID,eventType,note,changedBy) VALUES(?,?,?,?)',[animalID,'foster_started',`寄养记录 #${result.insertId}，预计 ${expectedEndDate} 结束。${startNote}`,req.session.admin.id]);
    await connection.commit();
    res.status(201).json({ok:true,fosterID:result.insertId});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.post('/fosters/:id/end', wrap(async (req,res) => {
  const fosterID=id(req.params.id), actualEndDate=date(req.body?.actualEndDate,'结束日期');
  if(actualEndDate>localDate()) fail(400,'结束日期不能晚于今天');
  const endNote=note(req.body?.endNote,'结束说明',true);
  const [reference]=await query('SELECT animalID FROM FosterRecords WHERE fosterID=?',[fosterID]);
  if(!reference) fail(404,'寄养记录不存在');
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockAnimal(connection,reference.animalID);
    const [[record]]=await connection.execute('SELECT * FROM FosterRecords WHERE fosterID=?',[fosterID]);
    if(!record) fail(404,'寄养记录不存在');
    if(record.status!=='active') fail(409,'寄养已结束');
    if(actualEndDate<dateOnly(record.startDate)) fail(400,'结束日期不能早于开始日期');
    await connection.execute("UPDATE FosterRecords SET status='ended',actualEndDate=?,endNote=? WHERE fosterID=?",[actualEndDate,endNote,fosterID]);
    await connection.execute('INSERT INTO AnimalStatusHistory(animalID,eventType,note,changedBy) VALUES(?,?,?,?)',[record.animalID,'foster_ended',`寄养记录 #${fosterID} 于 ${actualEndDate} 结束。${endNote}`,req.session.admin.id]);
    await connection.commit();
    res.json({ok:true});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.get('/inventory/:id/movements', wrap(async (req,res) => {
  const itemID=id(req.params.id);
  res.json(await query(`SELECT m.*,COALESCE(a.displayName,a.username) handledByName,
    (m.movementType='opening' AND m.reason=?) AS openingUnrecorded
    FROM InventoryMovements m LEFT JOIN Admins a ON a.adminID=m.handledBy
    WHERE m.itemID=? ORDER BY m.movementID DESC`,[unrecordedOpeningReason,itemID]));
}));

businessRouter.post('/inventory/:id/movements', wrap(async (req,res) => {
  const itemID=id(req.params.id), type=String(req.body?.movementType||'');
  if(!['in','out'].includes(type)) fail(400,'请选择入库或出库');
  const quantity=stockQuantity(req.body?.quantity,'数量',1);
  const reason=note(req.body?.reason,'变动原因',true);
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[item]]=await connection.execute('SELECT quantity FROM Inventory WHERE itemID=? FOR UPDATE',[itemID]);
    if(!item) fail(404,'物资不存在');
    if(item.quantity==null) fail(409,'该物资的期初库存未录入，请先盘点');
    const change=type==='in'?quantity:-quantity, balance=Number(item.quantity)+change;
    if(balance<0) fail(409,'库存不足，不能出库');
    stockQuantity(balance,'调整后的库存数量');
    await connection.execute('UPDATE Inventory SET quantity=? WHERE itemID=?',[balance,itemID]);
    await connection.execute(`INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason,handledBy)
      VALUES(?,?,?,?,?,?)`,[itemID,type,change,balance,reason,req.session.admin.id]);
    await connection.commit();
    res.status(201).json({ok:true,balance});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.post('/inventory/:id/correct', wrap(async (req,res) => {
  const itemID=id(req.params.id), balance=stockQuantity(req.body?.balance,'盘点数量');
  const reason=note(req.body?.reason,'盘点原因',true);
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[item]]=await connection.execute('SELECT quantity FROM Inventory WHERE itemID=? FOR UPDATE',[itemID]);
    if(!item) fail(404,'物资不存在');
    const change=balance-Number(item.quantity);
    if(!change&&item.quantity!=null) fail(400,'盘点数量与当前库存相同');
    await connection.execute('UPDATE Inventory SET quantity=? WHERE itemID=?',[balance,itemID]);
    await connection.execute("INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason,handledBy) VALUES(?,'correction',?,?,?,?)",[itemID,change,balance,reason,req.session.admin.id]);
    await connection.commit();
    res.json({ok:true,balance});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.get('/material-donations', wrap(async (_req,res) => {
  res.json(await query(`SELECT d.*,i.itemName,i.unit,CONCAT(p.lastName,p.firstName) patronName
    FROM MaterialDonations d JOIN Inventory i ON i.itemID=d.itemID JOIN Patrons p ON p.patronID=d.patronID
    ORDER BY d.donationDate DESC,d.donationID DESC`));
}));

export async function lockDonationPatrons(connection,patronID,otherPatronID=patronID) {
  await connection.execute('SELECT patronID FROM Patrons WHERE patronID IN (?,?) ORDER BY patronID FOR UPDATE',
    [patronID,otherPatronID]);
}

export async function recalculateDonations(connection,patronID) {
  if (!patronID) return;
  const [[{total}]]=await connection.execute(
    "SELECT CAST(COALESCE(SUM(amount),0) AS CHAR) total FROM Donations WHERE patronID=? AND status='active'",[patronID]);
  const level=total>=1000?'黄金会员':total>=200?'白银会员':'普通会员';
  await connection.execute('UPDATE Patrons SET totalDonated=?,patronLevel=? WHERE patronID=?',[total,level,patronID]);
}

businessRouter.post('/donations/:id/void', wrap(async (req,res) => {
  const donationID=id(req.params.id), reason=note(req.body?.reason,'撤销原因',true);
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[record]]=await connection.execute('SELECT patronID,status FROM Donations WHERE donationID=? FOR UPDATE',[donationID]);
    if(!record) fail(404,'捐赠记录不存在');
    if(record.status!=='active') fail(409,'该捐赠记录已撤销');
    await lockDonationPatrons(connection,record.patronID);
    await connection.execute("UPDATE Donations SET status='void',voidReason=?,voidedAt=NOW() WHERE donationID=?",[reason,donationID]);
    await recalculateDonations(connection,record.patronID);
    await connection.commit();
    res.json({ok:true});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.post('/material-donations', wrap(async (req,res) => {
  const patronID=id(req.body?.patronID),itemID=id(req.body?.itemID),quantity=stockQuantity(req.body?.quantity,'捐赠数量',1);
  const donationDate=date(req.body?.donationDate,'捐赠日期'), remark=note(req.body?.note,'备注');
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[patron]]=await connection.execute('SELECT patronID FROM Patrons WHERE patronID=?',[patronID]);
    if(!patron) fail(404,'捐赠人不存在');
    const [[item]]=await connection.execute('SELECT quantity FROM Inventory WHERE itemID=? FOR UPDATE',[itemID]);
    if(!item) fail(404,'物资不存在');
    if(item.quantity==null) fail(409,'该物资的期初库存未录入，请先盘点');
    const balance=stockQuantity(Number(item.quantity)+quantity,'捐赠后的库存数量');
    const [result]=await connection.execute(`INSERT INTO MaterialDonations(patronID,itemID,quantity,donationDate,note,createdBy)
      VALUES(?,?,?,?,?,?)`,[patronID,itemID,quantity,donationDate,remark,req.session.admin.id]);
    await connection.execute('UPDATE Inventory SET quantity=? WHERE itemID=?',[balance,itemID]);
    await connection.execute(`INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason,handledBy)
      VALUES(?,'in',?,?,?,?)`,[itemID,quantity,balance,`物资捐赠 #${result.insertId}`,req.session.admin.id]);
    await connection.commit();
    res.status(201).json({ok:true,donationID:result.insertId});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.post('/material-donations/:id/void', wrap(async (req,res) => {
  const donationID=id(req.params.id), reason=note(req.body?.reason,'撤销原因',true);
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[record]]=await connection.execute('SELECT * FROM MaterialDonations WHERE donationID=? FOR UPDATE',[donationID]);
    if(!record) fail(404,'捐赠记录不存在');
    if(record.status!=='active') fail(409,'该记录已撤销');
    const [[item]]=await connection.execute('SELECT quantity FROM Inventory WHERE itemID=? FOR UPDATE',[record.itemID]);
    const balance=Number(item.quantity)-Number(record.quantity);
    if(balance<0) fail(409,'库存已使用，无法直接撤销；请先核对或补足库存');
    await connection.execute("UPDATE MaterialDonations SET status='void',voidReason=?,voidedAt=NOW() WHERE donationID=?",[reason,donationID]);
    await connection.execute('UPDATE Inventory SET quantity=? WHERE itemID=?',[balance,record.itemID]);
    await connection.execute(`INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason,handledBy)
      VALUES(?,'out',?,?,?,?)`,[record.itemID,-Number(record.quantity),balance,`撤销物资捐赠 #${donationID}：${reason}`,req.session.admin.id]);
    await connection.commit();
    res.json({ok:true});
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

businessRouter.get('/animals/:id/history', wrap(async (req,res) => {
  const animalID=id(req.params.id);
  const [animals,medical,vaccinations,prescriptions,fosters,applications,placements,healthHistory,statusHistory]=await Promise.all([
    query('SELECT * FROM Animals WHERE animalID=?',[animalID]),
    query('SELECT * FROM MedicalVisits WHERE animalID=? ORDER BY visitDate DESC,visitID DESC',[animalID]),
    query('SELECT * FROM VaccinationEvents WHERE animalID=? ORDER BY dateGiven DESC,vaccinationID DESC',[animalID]),
    query('SELECT pc.*,m.diagnosis AS visitDiagnosis FROM PrescriptionCourses pc LEFT JOIN MedicalVisits m ON m.visitID=pc.visitID AND m.animalID=pc.animalID WHERE pc.animalID=? ORDER BY pc.prescribedAt DESC,pc.prescriptionID DESC',[animalID]),
    query(`SELECT f.*,CONCAT(p.lastName,p.firstName) patronName FROM FosterRecords f LEFT JOIN Patrons p ON p.patronID=f.patronID
      WHERE f.animalID=? ORDER BY f.startDate DESC`,[animalID]),
    query('SELECT applicationID,status,submittedAt,reviewedAt,completedAt FROM AdoptionApplications WHERE animalID=? ORDER BY applicationID DESC',[animalID]),
    query('SELECT * FROM FostersAndAdoptions WHERE animalID=?',[animalID]),
    query('SELECT * FROM AnimalHealthHistory WHERE animalID=? ORDER BY historyID DESC',[animalID]),
    query('SELECT * FROM AnimalStatusHistory WHERE animalID=? ORDER BY historyID DESC',[animalID]),
  ]);
  if(!animals[0]) fail(404,'动物不存在');
  res.json({animal:animals[0],medical,vaccinations,prescriptions,fosters,applications,placements,healthHistory,statusHistory});
}));

businessRouter.get('/patrons/:id/history', wrap(async (req,res) => {
  const patronID=id(req.params.id);
  const [patrons,applications,donations,materials,fosters]=await Promise.all([
    query(`SELECT p.*,m.email FROM Patrons p LEFT JOIN MemberAccounts m ON m.patronID=p.patronID WHERE p.patronID=?`,[patronID]),
    query(`SELECT ap.applicationID,ap.status,ap.submittedAt,ap.reviewedAt,ap.completedAt,a.animalName
      FROM AdoptionApplications ap JOIN Animals a ON a.animalID=ap.animalID WHERE ap.patronID=? ORDER BY ap.applicationID DESC`,[patronID]),
    query('SELECT donationID,amount,donationDate,note,status,voidReason FROM Donations WHERE patronID=? ORDER BY donationDate DESC,donationID DESC',[patronID]),
    query(`SELECT d.donationID,d.quantity,d.donationDate,d.status,i.itemName,i.unit FROM MaterialDonations d
      JOIN Inventory i ON i.itemID=d.itemID WHERE d.patronID=? ORDER BY d.donationID DESC`,[patronID]),
    query(`SELECT f.fosterID,f.startDate,f.actualEndDate,f.status,a.animalName FROM FosterRecords f
      JOIN Animals a ON a.animalID=f.animalID WHERE f.patronID=? ORDER BY f.fosterID DESC`,[patronID]),
  ]);
  if(!patrons[0]) fail(404,'领养人不存在');
  res.json({patron:patrons[0],applications,donations,materials,fosters});
}));
