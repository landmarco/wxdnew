-- FULLTEXT indexes backing the site-wide search (api/routes/search.js).
--
-- Run these once, on the production MySQL box, before the search endpoints will
-- return anything. They power MATCH(...) AGAINST(... IN BOOLEAN MODE):
--   /api/search/playlists  -> playlist artist/song/album/label/shadow_comments
--   /api/search/shows      -> shows title/subtitle
--
-- Notes:
--  * FULLTEXT matches whole words and (because the app appends "*") word
--    prefixes; it does NOT match arbitrary mid-word substrings.
--  * Tokens shorter than the server's minimum are ignored. For InnoDB that's
--    `innodb_ft_min_token_size` (default 3); for MyISAM `ft_min_token_size`
--    (default 4). Lowering it requires a config change + rebuilding the index.
--  * ADD FULLTEXT / ADD COLUMN rebuild the table and can take a while on a large
--    `playlist` table; run during a quiet window.

-- `comments` is a BLOB (binary), which FULLTEXT cannot index. Rather than change
-- that column's type -- which would alter its encoding/comparison semantics for
-- OTHER services sharing this database -- we leave `comments` untouched and add a
-- read-only text mirror, `shadow_comments`, that FULLTEXT can index.
--
-- It is a STORED generated column: MySQL recomputes it from `comments` on every
-- INSERT/UPDATE automatically, so it can never drift and needs no maintenance.
-- CONVERT(... USING latin1) reinterprets the blob's bytes as latin1 (lossless --
-- latin1 maps every byte), matching how artist/song/album/label are stored, so
-- all five can share one FULLTEXT index. Requires MySQL 5.7.8+ / MariaDB 10.2+.

-- Legacy rows hold zero dates like '0000-00-00 00:00:00' (e.g. songstart) that a
-- strict sql_mode rejects when the ADD COLUMN / first FULLTEXT index rebuilds the
-- table. Relax sql_mode for THIS session only so the rebuild copies those values
-- through untouched. Session-scoped: no other connection is affected, it reverts
-- on disconnect, and no data is changed. Must precede the ALTERs in the same
-- session (so run this file in one mysql invocation, not as separate statements).
SET SESSION sql_mode = '';

ALTER TABLE playlist
  ADD COLUMN shadow_comments TEXT
    CHARACTER SET latin1 COLLATE latin1_swedish_ci
    GENERATED ALWAYS AS (CONVERT(comments USING latin1)) STORED;

ALTER TABLE playlist ADD FULLTEXT INDEX ft_playlist_search (artist, song, album, label, shadow_comments);
ALTER TABLE shows    ADD FULLTEXT INDEX ft_shows_search (title, subtitle);

-- ---------------------------------------------------------------------------
-- Fallback for MySQL older than 5.7.8 (no generated columns / no FULLTEXT on
-- them). Use INSTEAD of the ADD COLUMN above: a plain column kept in sync by
-- triggers, plus a one-time backfill. Still automatic after setup.
--
--   ALTER TABLE playlist
--     ADD COLUMN shadow_comments TEXT CHARACTER SET latin1 COLLATE latin1_swedish_ci;
--
--   UPDATE playlist SET shadow_comments = CONVERT(comments USING latin1);
--
--   DELIMITER //
--   CREATE TRIGGER playlist_shadow_comments_ins BEFORE INSERT ON playlist
--   FOR EACH ROW SET NEW.shadow_comments = CONVERT(NEW.comments USING latin1);//
--   CREATE TRIGGER playlist_shadow_comments_upd BEFORE UPDATE ON playlist
--   FOR EACH ROW SET NEW.shadow_comments = CONVERT(NEW.comments USING latin1);//
--   DELIMITER ;
--
-- Then run the two ADD FULLTEXT INDEX statements above as-is.
