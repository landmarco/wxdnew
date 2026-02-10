import {query} from '../../../lib/db'

// Shows from the last 10 days (matches legacy last10.php window)
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000

export default async function handler(req, res) {
	try {
		const now = Date.now()
		const start = Math.floor((now - TEN_DAYS_MS) / 1000) // legacy uses seconds
		const end = Math.floor(now / 1000)

		const shows = await query(
			'\
SELECT * FROM shows WHERE starttime >= ? AND starttime <= ? ORDER BY starttime DESC\
'
			,
			[start, end],
		)

		return res.status(200).json({shows})
	} catch (err) {
		console.error(err)
		return res.status(500).json({message: 'Server error'})
	}
}

