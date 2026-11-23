import { pool } from './db.js';
import { localDate, shiftedLocalDate } from './dates.js';
import { medicalPlans, followupPlans } from './care-plans.js';
import { runBackupAware } from './backup-gate.js';

export function deliverReminders() {
  return runBackupAware(sendReminders);
}

async function sendReminders() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [admins] = await connection.execute('SELECT adminID FROM Admins');
    const now = new Date(), today = localDate(now), week = [today,shiftedLocalDate(7,now)];
    const [followups] = await connection.execute(`SELECT planned.*,m.memberID
      FROM (${followupPlans}) planned LEFT JOIN MemberAccounts m ON m.patronID=planned.patronID
      WHERE planned.nextVisitDate BETWEEN ? AND ?`,week);
    const [medical] = await connection.execute(`SELECT * FROM (${medicalPlans}) planned
      WHERE nextVisitDate BETWEEN ? AND ?`,week);
    const [vaccines] = await connection.execute(`WITH doses AS (
      SELECT animalID,vaccineID,vaccineName,dateGiven,dateExpires,vaccinationID,
        TRIM(CONVERT(vaccineName USING utf8mb4)) COLLATE utf8mb4_unicode_ci normalizedName
      FROM VaccinationEvents
    ), knownNames AS (
      SELECT animalID,normalizedName,MIN(vaccineID) vaccineID
      FROM doses WHERE vaccineID IS NOT NULL
      GROUP BY animalID,normalizedName HAVING COUNT(DISTINCT vaccineID)=1
    ), ranked AS (
      SELECT v.animalID,v.vaccineName,v.dateExpires,ROW_NUMBER() OVER (
        PARTITION BY v.animalID,COALESCE(CONCAT('id:',COALESCE(v.vaccineID,k.vaccineID,d.vaccineID)),
          CONCAT('name:',v.normalizedName))
        ORDER BY v.dateGiven DESC,v.vaccinationID DESC
      ) AS doseRank
      FROM doses v
      LEFT JOIN knownNames k ON v.vaccineID IS NULL AND k.animalID=v.animalID AND k.normalizedName=v.normalizedName
      LEFT JOIN Vaccines d ON v.vaccineID IS NULL AND d.name=v.normalizedName COLLATE utf8mb4_unicode_ci
    )
    SELECT a.animalID,a.animalName,v.vaccineName,v.dateExpires
    FROM ranked v JOIN Animals a ON a.animalID=v.animalID
    WHERE v.doseRank=1 AND v.dateExpires BETWEEN ? AND ?`,[today,shiftedLocalDate(30,now)]);
    const deliver = async (type, recordID, dueDate, role, recipientID, applicationID, title, body) => {
      const [insert] = await connection.execute(`INSERT IGNORE INTO ReminderDispatch(reminderType,recordID,dueDate,recipientRole,recipientID)
        VALUES(?,?,?,?,?)`, [type,recordID,dueDate,role,recipientID]);
      if (insert.affectedRows) await connection.execute(`INSERT INTO Notifications(recipientRole,recipientID,applicationID,title,body)
        VALUES(?,?,?,?,?)`, [role,recipientID,applicationID,title,body]);
    };
    for (const item of followups) {
      const initial = item.visitID < 0;
      const type = initial ? 'initialFollowup' : 'followup';
      const recordID = initial ? item.applicationID : item.visitID;
      const action = initial ? '进行首次回访' : '回访';
      for (const admin of admins) await deliver(type,recordID,item.nextVisitDate,'admin',admin.adminID,item.applicationID,
        initial?'首次回访提醒':'领养回访计划提醒',`${item.animalName}计划于 ${item.nextVisitDate} ${action}。`);
      if (item.memberID) await deliver(type,recordID,item.nextVisitDate,'member',item.memberID,item.applicationID,
        initial?'首次回访安排':'即将进行领养回访',`${item.animalName}计划于 ${item.nextVisitDate} ${action}，请留意工作人员联系。`);
    }
    for (const item of medical) for (const admin of admins) await deliver('medical',item.visitID,item.nextVisitDate,'admin',admin.adminID,null,'动物复诊提醒',`${item.animalName}计划于 ${item.nextVisitDate} 复诊。`);
    for (const item of vaccines) for (const admin of admins) await deliver('vaccine',`${item.animalID}:${item.vaccineName}`,item.dateExpires,'admin',admin.adminID,null,'疫苗有效期提醒',`${item.animalName}的${item.vaccineName}于 ${item.dateExpires} 到期。`);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
