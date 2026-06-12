const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getPool, getMongo } = require('../db');

const router = Router();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickCoverFile(nonaudio) {
  if (!Array.isArray(nonaudio)) return null;
  const jpgs = nonaudio.filter((f) => /\.jpe?g$/i.test(f));
  const namedCover = jpgs.find((f) => /cover/i.test(f) && f !== 'embeddedcover.jpg');
  if (namedCover) return namedCover;
  if (jpgs.includes('embeddedcover.jpg')) return 'embeddedcover.jpg';
  return jpgs[0] ?? null;
}

// GET /api/recenttracks?limit=10
// Returns the most recently played tracks across all shows, with cover art resolved from MongoDB.
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Step 1: fetch recent tracks from MySQL
    const pool = getPool();
    const [tracks] = await pool.query(
      `SELECT p.artist, p.song, p.album, p.label, s.starttime
       FROM playlist p
       JOIN shows s ON p.showID = s.ID
       WHERE p.artist IS NOT NULL AND p.artist != '' AND p.artist != '*****'
       ORDER BY s.starttime DESC, p.orderkey DESC
       LIMIT ?`,
      [limit]
    );

    if (!tracks.length) {
      return res.json([]);
    }

    // Step 2: batch-resolve cover art from MongoDB
    const db = await getMongo();
    const uniqueArtists = [...new Set(tracks.map((t) => t.artist))];

    const orClauses = uniqueArtists.map((a) => ({
      artist: { $regex: escapeRegex(a), $options: 'i' },
    }));

    const releases = await db
      .collection('releases')
      .find(
        { $or: orClauses },
        { projection: { _id: 1, artist: 1, title: 1, downloads_db_id: 1 } }
      )
      .toArray();

    // Fetch nonaudio + dirname for each release that has a downloads doc
    const downloadsIds = releases
      .filter((r) => r.downloads_db_id)
      .map((r) => new ObjectId(r.downloads_db_id));

    const downloadsMap = {};
    if (downloadsIds.length) {
      const docs = await db
        .collection('downloads')
        .find({ _id: { $in: downloadsIds } }, { projection: { nonaudio: 1, dirname: 1 } })
        .toArray();
      for (const d of docs) downloadsMap[d._id.toString()] = d;
    }

    // Build lookup: artist (lowercase) → best matching release with a cover
    const coverByArtist = {};
    for (const release of releases) {
      const artistKey = release.artist.toLowerCase();
      const downloads = release.downloads_db_id ? downloadsMap[release.downloads_db_id] : null;
      if (!downloads) continue;
      const coverFile = pickCoverFile(downloads.nonaudio);
      if (!coverFile) continue;
      const coverUrl = `/api/releases/${release._id}/cover`;
      // Prefer a release whose title matches the track album; otherwise keep first found
      if (!coverByArtist[artistKey]) {
        coverByArtist[artistKey] = { coverUrl, title: release.title };
      }
    }

    // Step 3: attach cover_url to each track, preferring album title match
    const result = tracks.map((track) => {
      const artistKey = track.artist.toLowerCase();
      const match = coverByArtist[artistKey] ?? null;

      // Re-check releases for a title match against the track's album
      let coverUrl = match?.coverUrl ?? null;
      if (match && track.album) {
        const albumMatch = releases.find(
          (r) =>
            r.artist.toLowerCase() === artistKey &&
            r.title?.toLowerCase().includes(track.album.toLowerCase())
        );
        if (albumMatch) {
          const d = albumMatch.downloads_db_id ? downloadsMap[albumMatch.downloads_db_id] : null;
          if (d && pickCoverFile(d.nonaudio)) {
            coverUrl = `/api/releases/${albumMatch._id}/cover`;
          }
        }
      }

      return { artist: track.artist, song: track.song, album: track.album, label: track.label, starttime: track.starttime, cover_url: coverUrl };
    });

    res.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json(result);
  } catch (err) {
    console.error('recenttracks error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
