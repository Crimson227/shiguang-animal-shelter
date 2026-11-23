import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import { unrecordedOpeningReason } from './resources.js';

const applicationStatusColumn = "ENUM('pending','approved','rejected','completed','withdrawn','cancelled') NOT NULL DEFAULT 'pending'";

export const photoDraftTable = (table = 'PhotoDrafts') => `CREATE TABLE IF NOT EXISTS ${table} (
    url VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    actorRole ENUM('member','admin') NOT NULL,
    actorID INT NOT NULL,
    expiresAt DATETIME NOT NULL,
    INDEX(expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const statements = [
  `CREATE TABLE IF NOT EXISTS WebSessions (
    sessionID VARCHAR(128) NOT NULL PRIMARY KEY,
    data TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    INDEX idx_web_sessions_expiry (expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  photoDraftTable(),
  `CREATE TABLE IF NOT EXISTS MemberAccounts (
    memberID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patronID INT NOT NULL UNIQUE,
    email VARCHAR(190) NOT NULL UNIQUE,
    passwordHash VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_member_patron FOREIGN KEY (patronID) REFERENCES Patrons(patronID) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS PasswordRecoveryRequests (
    requestID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    memberID INT NOT NULL,
    status ENUM('pending','issued','used','closed') NOT NULL DEFAULT 'pending',
    requestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issuedAt DATETIME NULL,
    expiresAt DATETIME NULL,
    usedAt DATETIME NULL,
    tokenHash CHAR(64) NULL,
    issuedBy INT NULL,
    INDEX idx_recovery_member (memberID,requestedAt),
    INDEX idx_recovery_status (status,requestedAt),
    CONSTRAINT fk_recovery_member FOREIGN KEY (memberID) REFERENCES MemberAccounts(memberID) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_admin FOREIGN KEY (issuedBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS PasswordResetAudit (
    resetID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    memberID INT NOT NULL,
    adminID INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_reset_member (memberID,createdAt),
    CONSTRAINT fk_password_reset_member FOREIGN KEY (memberID) REFERENCES MemberAccounts(memberID) ON DELETE RESTRICT,
    CONSTRAINT fk_password_reset_admin FOREIGN KEY (adminID) REFERENCES Admins(adminID) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS AdoptionApplications (
    applicationID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    patronID INT NOT NULL,
    status ${applicationStatusColumn},
    applicationNote TEXT,
    reviewNote TEXT,
    reviewedBy INT NULL,
    submittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewedAt DATETIME NULL,
    completedAt DATETIME NULL,
    INDEX idx_application_animal_status (animalID,status),
    INDEX idx_application_patron (patronID,submittedAt),
    CONSTRAINT fk_application_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_application_patron FOREIGN KEY (patronID) REFERENCES Patrons(patronID) ON DELETE RESTRICT,
    CONSTRAINT fk_application_reviewer FOREIGN KEY (reviewedBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ApplicationEvents (
    eventID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    applicationID INT NOT NULL,
    actorRole ENUM('member','admin') NOT NULL,
    eventType VARCHAR(30) NOT NULL,
    note TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_application (applicationID,createdAt),
    CONSTRAINT fk_event_application FOREIGN KEY (applicationID) REFERENCES AdoptionApplications(applicationID) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS FollowUpVisits (
    visitID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    applicationID INT NOT NULL,
    visitDate DATE NOT NULL,
    channel VARCHAR(20) NOT NULL,
    animalCondition VARCHAR(20) NOT NULL,
    note TEXT NOT NULL,
    nextVisitDate DATE NULL,
    createdBy INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_followup_application (applicationID,visitDate),
    CONSTRAINT fk_followup_application FOREIGN KEY (applicationID) REFERENCES AdoptionApplications(applicationID) ON DELETE RESTRICT,
    CONSTRAINT fk_followup_admin FOREIGN KEY (createdBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS Notifications (
    notificationID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipientRole ENUM('member','admin') NOT NULL,
    recipientID INT NOT NULL,
    applicationID INT NULL,
    title VARCHAR(100) NOT NULL,
    body VARCHAR(255) NOT NULL,
    isRead TINYINT(1) NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_recipient (recipientRole,recipientID,isRead,createdAt),
    CONSTRAINT fk_notification_application FOREIGN KEY (applicationID) REFERENCES AdoptionApplications(applicationID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS MedicalVisits (
    visitID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    visitDate DATE NOT NULL,
    visitType VARCHAR(20) NOT NULL,
    diagnosis VARCHAR(255) NOT NULL,
    treatment TEXT,
    veterinarian VARCHAR(50),
    nextVisitDate DATE NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_medical_animal_date (animalID,visitDate),
    INDEX idx_medical_next_date (nextVisitDate),
    CONSTRAINT fk_medical_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ReminderDispatch (
    reminderID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    reminderType VARCHAR(20) NOT NULL,
    recordID VARCHAR(100) NOT NULL,
    dueDate DATE NOT NULL,
    recipientRole ENUM('admin','member') NOT NULL,
    recipientID INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_delivery (reminderType,recordID,dueDate,recipientRole,recipientID)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS FosterRecords (
    fosterID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    patronID INT NULL,
    startDate DATE NOT NULL,
    expectedEndDate DATE NOT NULL,
    actualEndDate DATE NULL,
    status ENUM('active','ended') NOT NULL DEFAULT 'active',
    startNote TEXT NULL,
    endNote TEXT NULL,
    createdBy INT NULL,
    activeAnimalID INT GENERATED ALWAYS AS (CASE WHEN status='active' THEN animalID ELSE NULL END) STORED,
    UNIQUE KEY uq_active_foster (activeAnimalID),
    INDEX idx_foster_animal_date (animalID,startDate),
    CONSTRAINT fk_foster_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_foster_patron FOREIGN KEY (patronID) REFERENCES Patrons(patronID) ON DELETE RESTRICT,
    CONSTRAINT fk_foster_admin FOREIGN KEY (createdBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS InventoryMovements (
    movementID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    itemID INT NOT NULL,
    movementType ENUM('opening','in','out','correction') NOT NULL,
    quantityChange INT NOT NULL,
    balanceAfter INT NOT NULL,
    reason TEXT NOT NULL,
    handledBy INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inventory_movement (itemID,createdAt),
    CONSTRAINT fk_movement_item FOREIGN KEY (itemID) REFERENCES Inventory(itemID) ON DELETE RESTRICT,
    CONSTRAINT fk_movement_admin FOREIGN KEY (handledBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS MaterialDonations (
    donationID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patronID INT NOT NULL,
    itemID INT NOT NULL,
    quantity INT NOT NULL,
    donationDate DATE NOT NULL,
    note TEXT NULL,
    status ENUM('active','void') NOT NULL DEFAULT 'active',
    voidReason VARCHAR(255) NULL,
    voidedAt DATETIME NULL,
    createdBy INT NULL,
    INDEX idx_material_date (donationDate),
    CONSTRAINT fk_material_patron FOREIGN KEY (patronID) REFERENCES Patrons(patronID) ON DELETE RESTRICT,
    CONSTRAINT fk_material_item FOREIGN KEY (itemID) REFERENCES Inventory(itemID) ON DELETE RESTRICT,
    CONSTRAINT fk_material_admin FOREIGN KEY (createdBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS AnimalHealthHistory (
    historyID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    oldStatus VARCHAR(20) NULL,
    newStatus VARCHAR(20) NOT NULL,
    note TEXT NOT NULL,
    changedBy INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_health_animal_date (animalID,createdAt),
    CONSTRAINT fk_health_history_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_health_history_admin FOREIGN KEY (changedBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS AnimalStatusHistory (
    historyID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    eventType ENUM('adoptable_added','adoptable_removed','foster_started','foster_ended','adopted') NOT NULL,
    note TEXT NOT NULL,
    changedBy INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status_animal_date (animalID,createdAt),
    CONSTRAINT fk_status_history_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_status_history_admin FOREIGN KEY (changedBy) REFERENCES Admins(adminID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS VaccinationEvents (
    vaccinationID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    vaccineName VARCHAR(50) NOT NULL,
    vaccineID INT NULL,
    dateGiven DATE NOT NULL,
    dateExpires DATE NULL,
    batchNumber VARCHAR(80) NULL,
    notes TEXT NULL,
    stockDeducted TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_vaccination_animal_date (animalID,dateGiven),
    INDEX idx_vaccination_due (dateExpires),
    CONSTRAINT fk_vaccination_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_vaccination_vaccine FOREIGN KEY (vaccineID) REFERENCES Vaccines(vaccineID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS PrescriptionCourses (
    prescriptionID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animalID INT NOT NULL,
    visitID INT NULL,
    prescribedAt DATE NULL,
    name VARCHAR(100) NOT NULL,
    frequency VARCHAR(255) NULL,
    dosage VARCHAR(100) NULL,
    durationDays INT NULL,
    notes TEXT NULL,
    legacyAnimalID INT NULL,
    legacyName VARCHAR(100) NULL,
    UNIQUE KEY uq_prescription_legacy (legacyAnimalID, legacyName),
    INDEX idx_prescription_animal_date (animalID, prescribedAt),
    CONSTRAINT fk_prescription_animal FOREIGN KEY (animalID) REFERENCES Animals(animalID) ON DELETE RESTRICT,
    CONSTRAINT fk_prescription_visit FOREIGN KEY (visitID) REFERENCES MedicalVisits(visitID) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS PatronPreferenceArchive (
    preferenceID INT NOT NULL PRIMARY KEY,
    patronID INT NOT NULL,
    preferredSpecies VARCHAR(30) NULL,
    preferredSize VARCHAR(30) NULL,
    minAge INT NULL,
    maxAge INT NULL,
    acceptsSpecialCare TINYINT(1) NULL,
    archivedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function protectDonationHistory(connection) {
  const [[foreignKey]] = await connection.query(`SELECT k.CONSTRAINT_NAME name,r.UPDATE_RULE updateRule
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='Donations' AND k.COLUMN_NAME='patronID'
      AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='Patrons'
      AND k.REFERENCED_COLUMN_NAME='patronID' AND r.DELETE_RULE IN ('CASCADE','SET NULL')`);
  if (!foreignKey) return;
  // Replace the existing constraint in one DDL operation, keeping other sessions' checks enabled.
  await connection.query('SET SESSION foreign_key_checks=0');
  try {
    await connection.query(`ALTER TABLE Donations DROP FOREIGN KEY ${connection.escapeId(foreignKey.name)},
      ADD CONSTRAINT fk_donations_patron_history FOREIGN KEY (patronID) REFERENCES Patrons(patronID)
      ON DELETE RESTRICT ON UPDATE ${foreignKey.updateRule}, ALGORITHM=INPLACE`);
  } finally {
    await connection.query('SET SESSION foreign_key_checks=1');
  }
}

export async function migrate() {
  const connection = await pool.getConnection();
  try {
    for (const sql of statements) await connection.query(sql);
    await protectDonationHistory(connection);
    const [[statusColumn]] = await connection.query("SHOW COLUMNS FROM AdoptionApplications LIKE 'status'");
    if (!statusColumn.Type.includes("'cancelled'")) {
      await connection.query(`ALTER TABLE AdoptionApplications MODIFY COLUMN status ${applicationStatusColumn}`);
    }
    const columns = [
      ['Notifications','communityPostID','INT NULL'],
      ['Notifications','communityCommentID','INT NULL'],
      ['Animals','healthStatus',"VARCHAR(20) NOT NULL DEFAULT '待评估'"],
      ['Animals','healthNotes','TEXT NULL'],
      ['Animals','intakeDate','DATE NULL'],
      ['Animals','description','TEXT NULL'],
      ['PatronPreferences','acceptsSpecialCare','TINYINT(1) NOT NULL DEFAULT 0'],
      ['MedicalVisits','symptoms','TEXT NULL'],
      ['MedicalVisits','medication','TEXT NULL'],
      ['VaccinesAdministered','batchNumber','VARCHAR(80) NULL'],
      ['VaccinesAdministered','notes','TEXT NULL'],
      ['AdoptionApplications','appointmentDate','DATE NULL'],
      ['AdoptionApplications','completedBy','INT NULL'],
      ['AdoptionApplications','completedDate','DATE NULL'],
      ['AdoptionApplications','followUpDueDate','DATE NULL'],
      ['AdoptionApplications','completionNote','TEXT NULL'],
      ['Donations','status',"ENUM('active','void') NOT NULL DEFAULT 'active'"],
      ['Donations','voidReason','VARCHAR(255) NULL'],
      ['Donations','voidedAt','DATETIME NULL'],
      ['Admins','displayName','VARCHAR(60) NULL'],
      ['Admins','credentialVersion','INT NOT NULL DEFAULT 1'],
      ['MemberAccounts','credentialVersion','INT NOT NULL DEFAULT 1'],
      ['MemberAccounts','mustChangePassword','TINYINT(1) NOT NULL DEFAULT 0'],
      ['MemberAccounts','temporaryPasswordExpiresAt','DATETIME NULL'],
      ['VaccinationEvents','stockDeducted','TINYINT(1) NOT NULL DEFAULT 0'],
    ];
    for (const [table, column, definition] of columns) {
      const [[existing]] = await connection.execute(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [table,column]);
      if (!existing.total) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
    const [[phoneColumn]] = await connection.query("SHOW COLUMNS FROM Patrons LIKE 'phoneNumber'");
    if (Number(phoneColumn.Type.match(/^varchar\((\d+)\)/i)?.[1]) < 24) {
      await connection.query('ALTER TABLE Patrons MODIFY COLUMN phoneNumber VARCHAR(24) NULL');
    }
    const [[totalColumn]] = await connection.query("SHOW COLUMNS FROM Patrons LIKE 'totalDonated'");
    if (Number(totalColumn.Type.match(/^decimal\((\d+),2\)/i)?.[1]) < 18) {
      await connection.query('ALTER TABLE Patrons MODIFY COLUMN totalDonated DECIMAL(18,2) DEFAULT 0');
    }
    const [[reasonColumn]] = await connection.query("SHOW COLUMNS FROM InventoryMovements LIKE 'reason'");
    if (reasonColumn.Type.startsWith('varchar')) {
      await connection.query('ALTER TABLE InventoryMovements MODIFY COLUMN reason TEXT NOT NULL');
    }
    await connection.query(`UPDATE MemberAccounts m
      JOIN (SELECT memberID,MAX(createdAt) issuedAt FROM PasswordResetAudit GROUP BY memberID) audit ON audit.memberID=m.memberID
      SET m.temporaryPasswordExpiresAt=DATE_ADD(audit.issuedAt,INTERVAL 24 HOUR)
      WHERE m.mustChangePassword=1 AND m.temporaryPasswordExpiresAt IS NULL AND audit.issuedAt<=NOW()`);
    const [[preferenceIndex]] = await connection.execute("SELECT COUNT(*) total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PatronPreferences' AND INDEX_NAME='uq_preference_patron'");
    if (!preferenceIndex.total) {
      await connection.query(`INSERT IGNORE INTO PatronPreferenceArchive(preferenceID,patronID,preferredSpecies,preferredSize,minAge,maxAge,acceptsSpecialCare)
        SELECT p.preferenceID,p.patronID,p.preferredSpecies,p.preferredSize,p.minAge,p.maxAge,p.acceptsSpecialCare
        FROM PatronPreferences p JOIN (SELECT patronID,MIN(preferenceID) keepID FROM PatronPreferences GROUP BY patronID HAVING COUNT(*)>1) d ON d.patronID=p.patronID
        WHERE p.preferenceID<>d.keepID`);
      await connection.query(`DELETE p FROM PatronPreferences p JOIN PatronPreferenceArchive a ON a.preferenceID=p.preferenceID`);
      await connection.query('ALTER TABLE PatronPreferences ADD UNIQUE KEY uq_preference_patron (patronID)');
    }
    const [legacyAdmins] = await connection.execute('SELECT adminID,password FROM Admins');
    for (const admin of legacyAdmins) {
      if (!String(admin.password).startsWith('$2')) {
        await connection.execute('UPDATE Admins SET password=? WHERE adminID=?', [await bcrypt.hash(String(admin.password), 12), admin.adminID]);
      }
    }
    await connection.query("UPDATE Admins SET displayName=CASE WHEN username='demo' THEN '收容管理员' ELSE username END WHERE displayName IS NULL");
    await connection.beginTransaction();
    try {
      await connection.query(`INSERT IGNORE INTO PrescriptionCourses(animalID,name,frequency,legacyAnimalID,legacyName)
        SELECT animalID,name,frequency,animalID,name FROM Prescriptions`);
      await connection.query(`INSERT INTO FosterRecords(animalID,patronID,startDate,expectedEndDate,status,startNote)
        SELECT f.animalID,f.patronID,COALESCE(f.date,CURDATE()),DATE_ADD(COALESCE(f.date,CURDATE()),INTERVAL 30 DAY),'active','历史寄养记录迁入'
        FROM FostersAndAdoptions f WHERE f.fosteredOrAdopted='F'
        AND NOT EXISTS (SELECT 1 FROM FosterRecords r WHERE r.animalID=f.animalID AND r.status='active')`);
      await connection.query("DELETE FROM FostersAndAdoptions WHERE fosteredOrAdopted='F'");
      await connection.query(`INSERT INTO VaccinationEvents(animalID,vaccineName,vaccineID,dateGiven,dateExpires,batchNumber,notes)
        SELECT v.animalID,v.vaccineName,v.vaccineID,v.dateGiven,v.dateExpires,v.batchNumber,v.notes
        FROM VaccinesAdministered v WHERE v.dateGiven IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM VaccinationEvents e WHERE e.animalID=v.animalID AND BINARY e.vaccineName=BINARY v.vaccineName AND e.dateGiven=v.dateGiven)`);
      await connection.query('DELETE FROM VaccinesAdministered WHERE dateGiven IS NOT NULL');
      await connection.query(`INSERT INTO InventoryMovements(itemID,movementType,quantityChange,balanceAfter,reason)
        SELECT i.itemID,'opening',COALESCE(i.quantity,0),COALESCE(i.quantity,0),
          CASE WHEN i.quantity IS NULL THEN ? ELSE '期初库存' END
        FROM Inventory i WHERE NOT EXISTS (SELECT 1 FROM InventoryMovements m WHERE m.itemID=i.itemID)`,[unrecordedOpeningReason]);
      await connection.query(`UPDATE Patrons p LEFT JOIN (
        SELECT patronID,COALESCE(SUM(amount),0) total FROM Donations WHERE status='active' GROUP BY patronID
      ) d ON d.patronID=p.patronID
      SET p.totalDonated=COALESCE(d.total,0),
        p.patronLevel=CASE WHEN COALESCE(d.total,0)>=1000 THEN '黄金会员'
          WHEN COALESCE(d.total,0)>=200 THEN '白银会员' ELSE '普通会员' END`);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
  } finally {
    connection.release();
  }
}
