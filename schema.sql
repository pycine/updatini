-- Updatini release index (Cloudflare D1).
--
-- Apply locally:  npm run db:init:local
-- Apply remotely: npm run db:init
--
CREATE TABLE IF NOT EXISTS bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  compatible TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',   -- 'all' or 'board:<id>'
  size INTEGER,
  created_at INTEGER NOT NULL
);
