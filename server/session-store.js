import session from 'express-session';
import { pool } from './db.js';
import { trackDatabaseWork } from './backup-gate.js';

export class MySQLSessionStore extends session.Store {
  get(id, callback) {
    trackDatabaseWork(() => pool.execute('SELECT data FROM WebSessions WHERE sessionID=? AND expiresAt>NOW() LIMIT 1', [id]))
      .then(([[row]]) => callback(null, row ? JSON.parse(row.data) : null))
      .catch(callback);
  }

  set(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 8 * 60 * 60 * 1000);
    trackDatabaseWork(() => pool.execute(`INSERT INTO WebSessions(sessionID,data,expiresAt) VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE data=VALUES(data),expiresAt=VALUES(expiresAt)`, [id, JSON.stringify(value), expires]))
      .then(() => callback(null)).catch(callback);
  }

  destroy(id, callback = () => {}) {
    trackDatabaseWork(() => pool.execute('DELETE FROM WebSessions WHERE sessionID=?', [id])).then(() => callback(null)).catch(callback);
  }

  touch(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 8 * 60 * 60 * 1000);
    trackDatabaseWork(() => pool.execute('UPDATE WebSessions SET expiresAt=? WHERE sessionID=?', [expires, id]))
      .then(() => callback(null)).catch(callback);
  }
}
