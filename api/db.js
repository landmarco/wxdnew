const mysql = require('mysql2/promise');

let pool;
let requestsPool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

function getRequestsPool() {
  if (!requestsPool) {
    requestsPool = mysql.createPool({
      host: process.env.REQUESTS_DB_HOST,
      user: process.env.REQUESTS_DB_USER,
      password: process.env.REQUESTS_DB_PASSWORD,
      database: process.env.REQUESTS_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return requestsPool;
}

module.exports = { getPool, getRequestsPool };
