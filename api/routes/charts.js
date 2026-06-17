const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

function checkDate(dateStr) {
  // 1. Check structural layout shape (yyyy-mm-dd)
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  // 2. Split into numeric parts using the hyphen
  const [year, month, day] = dateStr.split('-').map(Number);

  // 3. Create a real date object (Months are 0-indexed)
  const date = new Date(year, month - 1, day);

  // 4. Verify JavaScript didn't auto-correct an invalid day
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Formats a Date as YYYY-MM-DD using local date components.
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/charts/mostplayed?dateStart=&dateEnd=&limit=&isChart=
// Most played songs / albums within a given date range.
// If dateStart and dateEnd are both omitted, defaults to the last month.
router.get('/mostplayed', async (req, res) => {
  try {
    const pool = getPool();

    let { dateStart, dateEnd, limit, isChart } = req.query;

    if (!dateStart && !dateEnd) {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      dateEnd = formatDate(end);
      dateStart = formatDate(start);
    }

    if (!dateStart || !dateEnd || !checkDate(dateStart) || !checkDate(dateEnd)) {
      return res.status(400).json({ error: 'dateStart and dateEnd are required in YYYY-MM-DD format' });
    }

    // Turn "true" or "1" into a real boolean.
    const isChartFlag =
      String(isChart || '').toLowerCase() === 'true' || isChart === '1';

    // Default limit is 50. Clamp it between 1 and 500.
    const parsedLimit = Number(limit || 50);
    const safeLimit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 50;

    // Chart mode groups by album.
    // Non-chart mode groups by song.
    const selectClause = isChartFlag
      ? `p.artist, p.album, MIN(p.label) AS label, COUNT(*) AS spins`
      : `p.song, p.artist, p.album, COUNT(*) AS spins`;

    const groupByClause = isChartFlag
      ? `p.artist, p.album`
      : `p.song, p.artist, p.album`;

    // Non-chart query keeps the shows join so you can still filter userID.
    const fromClause = isChartFlag
      ? `playlist p`
      : `playlist p JOIN shows s ON p.showID = s.id`;

    // These WHERE conditions apply to both versions.
    const whereParts = [
      `p.songstart >= DATE(?)`,
      `p.songstart < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      `p.artist != '*****'`,
    ];

    // Only add this playlist filter when isChart=true.
    if (isChartFlag) {
      whereParts.push(
        `p.playlist IN ('red', 'black', 'red/nonrock', 'black/nonrock')`,
        `p.album IS NOT NULL`,
        `p.album != ''`
      );
    } else {
      // Exclude Otto, the automation DJ — its spins would otherwise dominate the song charts.
      whereParts.push(`s.userID != 346`);
    }

    const [rows] = await pool.query(
      `
        SELECT ${selectClause}
        FROM ${fromClause}
        WHERE ${whereParts.join('\n          AND ')}
        GROUP BY ${groupByClause}
        ORDER BY spins DESC
        LIMIT ?
      `,
      [dateStart, dateEnd, safeLimit]
    );

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows);
  } catch (err) {
    console.error('mostplayed error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
