const { Router } = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const { getMongo } = require('../db');

const router = Router();

const MEDIA_BASE = '/mnt/md1/music-database/public/media';

const RELEASE_PROJECTION = {
  reviewer: 0,
  edits: 0,
  __v: 0,
  alphabetize_by: 0,
  review: 0,
};

const DOWNLOADS_PROJECTION = {
  edits: 0,
  __v: 0,
  origfilename: 0,
  filename: 0,
  rec_alph: 0,
  assignee_id: 0,
  assignee_name: 0,
  checkedoutby_id: 0,
  checkedoutby_name: 0,
  reuploader_id: 0,
  reuploader_name: 0,
  reviewer: 0,
  review: 0,
  'tracks.absolute_path': 0,
  'tracks.itunes_unique_id': 0,
};

function pickCoverFile(nonaudio) {
  if (!Array.isArray(nonaudio)) return null;
  const jpgs = nonaudio.filter((f) => /\.jpe?g$/i.test(f));
  const namedCover = jpgs.find((f) => /cover/i.test(f) && f !== 'embeddedcover.jpg');
  if (namedCover) return namedCover;
  if (jpgs.includes('embeddedcover.jpg')) return 'embeddedcover.jpg';
  return jpgs[0] ?? null;
}

// GET /api/releases?limit=20&offset=0
router.get('/', async (req, res) => {
  try {
    const db = await getMongo();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const releases = await db
      .collection('releases')
      .find({}, { projection: RELEASE_PROJECTION })
      .sort({ playlist_date: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    const downloadsIds = releases
      .filter((r) => r.downloads_db_id)
      .map((r) => new ObjectId(r.downloads_db_id));

    const downloadsMap = {};
    if (downloadsIds.length) {
      const docs = await db
        .collection('downloads')
        .find({ _id: { $in: downloadsIds } }, { projection: { nonaudio: 1 } })
        .toArray();
      for (const d of docs) downloadsMap[d._id.toString()] = d;
    }

    const result = releases.map((r) => {
      const d = r.downloads_db_id ? downloadsMap[r.downloads_db_id] : null;
      const hasCover = d ? pickCoverFile(d.nonaudio) !== null : false;
      return { ...r, cover_url: hasCover ? `/api/releases/${r._id}/cover` : null };
    });

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('releases GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/releases/:id
// Supports comma-separated IDs: /api/releases/abc,def,ghi
// Single ID returns an object; multiple IDs return an array.
router.get('/:id', async (req, res) => {
  try {
    const db = await getMongo();
    const parts = req.params.id.split(',').map(s => s.trim());
    const ids = [];
    for (const p of parts) {
      try { ids.push(new ObjectId(p)); }
      catch { return res.status(400).json({ error: `Invalid id: ${p}` }); }
    }

    const releases = await db
      .collection('releases')
      .find({ _id: { $in: ids } }, { projection: RELEASE_PROJECTION })
      .toArray();
    if (!releases.length) return res.status(404).json({ error: 'Not found' });

    const downloadsIds = releases.filter(r => r.downloads_db_id).map(r => new ObjectId(r.downloads_db_id));
    const downloadsMap = {};
    if (downloadsIds.length) {
      const docs = await db
        .collection('downloads')
        .find({ _id: { $in: downloadsIds } }, { projection: DOWNLOADS_PROJECTION })
        .toArray();
      for (const d of docs) downloadsMap[d._id.toString()] = d;
    }

    const result = releases.map(release => {
      const downloads = release.downloads_db_id ? (downloadsMap[release.downloads_db_id] ?? null) : null;
      const coverFile = downloads ? pickCoverFile(downloads.nonaudio) : null;
      return { ...release, cover_url: coverFile ? `/api/releases/${release._id}/cover` : null, downloads };
    });

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(ids.length === 1 ? result[0] : result);
  } catch (err) {
    console.error('releases/:id GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/releases/:id/cover
router.get('/:id/cover', async (req, res) => {
  try {
    const db = await getMongo();
    let id;
    try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

    const release = await db
      .collection('releases')
      .findOne({ _id: id }, { projection: { downloads_db_id: 1 } });
    if (!release?.downloads_db_id) return res.status(404).json({ error: 'Not found' });

    const downloads = await db
      .collection('downloads')
      .findOne({ _id: new ObjectId(release.downloads_db_id) }, { projection: { nonaudio: 1, dirname: 1 } });
    if (!downloads?.dirname) return res.status(404).json({ error: 'Not found' });

    const coverFile = pickCoverFile(downloads.nonaudio);
    if (!coverFile) return res.status(404).json({ error: 'No cover art' });

    // path.basename prevents directory traversal via filenames in the nonaudio array
    const safeFile = path.basename(coverFile);
    const dir = path.join(MEDIA_BASE, downloads.dirname);

    res.sendFile(safeFile, { root: dir }, (err) => {
      if (err && !res.headersSent) {
        console.error(`cover sendFile failed — root: ${dir}, file: ${safeFile}`, err.message);
        res.status(404).json({ error: 'Cover art not found on disk' });
      }
    });
  } catch (err) {
    console.error('releases/:id/cover GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
