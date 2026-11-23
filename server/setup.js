import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error('请设置 ADMIN_USERNAME 和 ADMIN_PASSWORD 后再运行初始化。');
  process.exit(1);
}
if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
  console.error('管理员密码需至少 8 个字符，且不超过 72 字节。');
  process.exit(1);
}

try {
  await pool.execute(`CREATE TABLE IF NOT EXISTS Admins (
    adminID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    credentialVersion INT NOT NULL DEFAULT 1
  )`);
  const [[column]] = await pool.execute(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Admins' AND COLUMN_NAME='credentialVersion'`);
  if (!column.total) await pool.execute('ALTER TABLE Admins ADD COLUMN credentialVersion INT NOT NULL DEFAULT 1');
  const hash = await bcrypt.hash(password, 12);
  await pool.execute(`INSERT INTO Admins (username, password) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE password = VALUES(password),credentialVersion=credentialVersion+1`, [username, hash]);
  console.log('管理员账号已创建。');
} finally {
  await pool.end();
}
