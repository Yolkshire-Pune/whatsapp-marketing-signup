-- Yolkshire WhatsApp Opt-in Signups
-- Cloudflare D1 schema
CREATE TABLE IF NOT EXISTS signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  given_name  TEXT NOT NULL,
  family_name TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,
  branch      TEXT NOT NULL DEFAULT 'General',
  consent     TEXT NOT NULL DEFAULT 'Yes',
  source      TEXT NOT NULL DEFAULT 'QR Poster',
  status      TEXT NOT NULL DEFAULT 'New'
);

-- Enforce phone uniqueness: first occurrence wins for WABA CSV deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone ON signups(phone);

-- Speed up range-based analytics queries
CREATE INDEX IF NOT EXISTS idx_timestamp ON signups(timestamp);
CREATE INDEX IF NOT EXISTS idx_branch    ON signups(branch);
