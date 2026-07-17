-- Schema + least-privilege user for stream Shazam recognition.
-- Run once on the MySQL server as an admin user. The iMac recognizer posts
-- matches to /api/shazam, which writes here via the dedicated wxdu_shazam user
-- (INSERT only). Adrenalin's playlist entry page reads the 5 most recent rows.
-- Set the matching SHAZAM_DB_* values in api/.env (see api/.env.example).
--
-- This table lives in the existing plmanager DB (so adrenalin reads it with its
-- own connection). It is utf8mb4 even though the legacy plmanager tables are
-- latin1 -- charset is per-table in MySQL, so a utf8mb4 table coexists fine and
-- stores Shazam's UTF-8 metadata losslessly.

CREATE TABLE IF NOT EXISTS plmanager.shazamplaying (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  created TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  artist  VARCHAR(255) NOT NULL DEFAULT '',
  song    VARCHAR(255) NOT NULL DEFAULT '',
  album   VARCHAR(255) NOT NULL DEFAULT '',
  label   VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replace <strong_password> with a real secret (and use the same value in api/.env).
CREATE USER 'wxdu_shazam'@'localhost' IDENTIFIED BY '<strong_password>';
GRANT INSERT ON plmanager.shazamplaying TO 'wxdu_shazam'@'localhost';  -- least privilege: INSERT only
FLUSH PRIVILEGES;

-- The adrenalin reader connects as wxdu_pl. If that user has database-level
-- privileges on plmanager (typical), it can already SELECT the new table. If it
-- was granted per-table, add:
--   GRANT SELECT ON plmanager.shazamplaying TO 'wxdu_pl'@'localhost';
