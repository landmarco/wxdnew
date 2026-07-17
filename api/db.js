const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

let pool;
let requestsPool;
let feedbackPool;
let ticketsPool;
let shazamPool;
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

function getFeedbackPool() {
  if (!feedbackPool) {
    feedbackPool = mysql.createPool({
      host: process.env.FEEDBACK_DB_HOST,
      user: process.env.FEEDBACK_DB_USER,
      password: process.env.FEEDBACK_DB_PASSWORD,
      database: process.env.FEEDBACK_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return feedbackPool;
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

// Dedicated, least-privilege pool (INSERT-only user) for stream Shazam
// ingest. Points at the plmanager DB, but its own user so an ingest-path
// compromise can't touch anything but the shazamplaying table. utf8mb4 so
// UTF-8 track metadata stores cleanly (the table is utf8mb4).
function getShazamPool() {
  if (!shazamPool) {
    shazamPool = mysql.createPool({
      host: process.env.SHAZAM_DB_HOST,
      user: process.env.SHAZAM_DB_USER,
      password: process.env.SHAZAM_DB_PASSWORD,
      database: process.env.SHAZAM_DB_NAME,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
    });
  }
  return shazamPool;
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

module.exports = { getPool, getRequestsPool, getFeedbackPool, getTicketsPool, getShazamPool, getMongo };
