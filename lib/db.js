import mysql from 'mysql2/promise'

// Simple pooled MySQL helper. Reads connection info from env.
// This file runs server-side only (API routes / getServerSideProps).

let pool

export function getPool() {
	if (!pool) {
		pool = mysql.createPool({
			host: process.env.MYSQL_HOST || 'localhost',
			user: process.env.MYSQL_USER,
			password: process.env.MYSQL_PASSWORD,
			database: process.env.MYSQL_DATABASE || 'plmanager',
			connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
			timeout: 20_000,
		})
	}
	return pool
}

export async function query(sql, params = []) {
	const [rows] = await getPool().execute(sql, params)
	return rows
}

