import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'animal_app',
  password: process.env.ANIMAL_SHELTER_DB_PASSWORD,
  database: process.env.DB_NAME || 'animal_shelter_react',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
});

export async function lockAnimal(connection, animalID) {
  // Take the animal lock before the first ordinary read in a lifecycle transaction.
  const [[animal]] = await connection.execute('SELECT animalID,animalName FROM Animals WHERE animalID=? FOR UPDATE', [animalID]);
  return animal;
}

export async function query(sql, values = []) {
  const [rows] = await pool.execute(sql, values);
  return rows;
}
