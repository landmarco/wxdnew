const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

let pool;
let requestsPool;
let ticketsPool;
let mongoClient;

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

function getTicketsPool() {
  if (!ticketsPool) {
    ticketsPool = mysql.createPool({
      host: process.env.TICKETS_DB_HOST,
      user: process.env.TICKETS_DB_USER,
      password: process.env.TICKETS_DB_PASSWORD,
      database: process.env.TICKETS_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return ticketsPool;
}

async function getMongo() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
  }
  return mongoClient.db();
}

module.exports = { getPool, getRequestsPool, getTicketsPool, getMongo };
