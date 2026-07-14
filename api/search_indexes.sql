-- FULLTEXT indexes backing the site-wide search (api/routes/search.js).
--
-- Run these once, on the production MySQL box, before the search endpoints will
-- return anything. They power MATCH(...) AGAINST(... IN BOOLEAN MODE):
--   /api/search/playlists  -> playlist artist/song/album/label/comments
--   /api/search/shows      -> shows title/subtitle
--
-- Notes:
--  * FULLTEXT matches whole words and (because the app appends "*") word
--    prefixes; it does NOT match arbitrary mid-word substrings.
--  * Tokens shorter than the server's minimum are ignored. For InnoDB that's
--    `innodb_ft_min_token_size` (default 3); for MyISAM `ft_min_token_size`
--    (default 4). Lowering it requires a config change + rebuilding the index.
--  * ADD FULLTEXT rebuilds the index and can take a while on a large `playlist`
--    table; run during a quiet window.

ALTER TABLE playlist ADD FULLTEXT INDEX ft_playlist_search (artist, song, album, label, comments);
ALTER TABLE shows    ADD FULLTEXT INDEX ft_shows_search (title, subtitle);
