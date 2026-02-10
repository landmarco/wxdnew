import {query} from '../../../../lib/db'

export default async function handler(req, res) {
	const {id} = req.query
	try {
		const [show] = await query('SELECT * FROM shows WHERE ID = ?', [id])
		if (!show) return res.status(404).json({message: 'Show not found'})
		const tracks = await query(
			'\
SELECT * FROM playlist WHERE showID = ? ORDER BY orderkey\
'
			,
			[id],
		)
		const columnSet = {}
		for (const row of tracks) {
			for (const key of Object.keys(row)) {
				if (row[key] && row[key] !== '*****' && row[key] !== 'OE') columnSet[key] = true
			}
		}
		res.status(200).json({show, tracks, columns: Object.keys(columnSet)})
	} catch (err) {
		console.error(err)
		res.status(500).json({message: 'Server error'})
	}
}

