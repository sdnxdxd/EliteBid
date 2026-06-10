const mysql = require('mysql2/promise');

require('dotenv').config();

const database = process.env.DB_NAME || 'elitebid';

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {})
};

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...baseConfig,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false
    });
  }

  return pool;
}

async function connectWithoutDatabase() {
  return mysql.createConnection(baseConfig);
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function first(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return {
    affectedRows: result.affectedRows,
    insertId: result.insertId,
    lastInsertRowId: result.insertId
  };
}

module.exports = {
  connectWithoutDatabase,
  database,
  first,
  getPool,
  query,
  run
};
