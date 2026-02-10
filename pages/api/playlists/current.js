import {query} from '../../../lib/db'

// Returns the currently active show and its playlist rows.
export default async function handler(req, res) {
	try {
		const [activeShow] = await query('SELECT * FROM shows WHERE active = 1 LIMIT 1')
		if (!activeShow) return res.status(404).json({message: 'No active show'})

		const tracks = await query(
			'\
SELECT * FROM playlist WHERE showID = ? ORDER BY orderkey\
'
			,
			[activeShow.ID],
		)

		// Determine which columns to render (mimic setColBits)
		const columnSet = {}
		for (const row of tracks) {
			for (const key of Object.keys(row)) {
				if (row[key] && row[key] !== '*****' && row[key] !== 'OE') columnSet[key] = true
			}
		}

		return res.status(200).json({show: activeShow, tracks, columns: Object.keys(columnSet)})
	} catch (err) {
		console.error(err)
		return res.status(500).json({message: 'Server error'})
	}
}
