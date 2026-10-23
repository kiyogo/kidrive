-- Storage pools, datasets, and network shares persistence
-- Timestamps are unix milliseconds

CREATE TABLE IF NOT EXISTS storage_pools (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  layout          TEXT NOT NULL DEFAULT 'mirror',
  status          TEXT NOT NULL DEFAULT 'healthy',
  total_bytes     INTEGER NOT NULL DEFAULT 0,
  used_bytes      INTEGER NOT NULL DEFAULT 0,
  auto_trim       INTEGER NOT NULL DEFAULT 1,
  scrub_schedule  TEXT NOT NULL DEFAULT 'weekly',
  disks_json      TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  pool            TEXT NOT NULL DEFAULT 'tank',
  mount           TEXT NOT NULL,
  quota_bytes     INTEGER NOT NULL DEFAULT 0,
  used_bytes      INTEGER NOT NULL DEFAULT 0,
  recordsize      TEXT NOT NULL DEFAULT '128K',
  compression     TEXT NOT NULL DEFAULT 'lz4',
  atime           TEXT NOT NULL DEFAULT 'off',
  dedup           TEXT NOT NULL DEFAULT 'off',
  sync_mode       TEXT NOT NULL DEFAULT 'standard',
  status          TEXT NOT NULL DEFAULT 'mounted',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_datasets_pool ON datasets (pool);

CREATE TABLE IF NOT EXISTS network_shares (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  purpose         TEXT NOT NULL DEFAULT 'general',
  path            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  read_only       INTEGER NOT NULL DEFAULT 0,
  browseable      INTEGER NOT NULL DEFAULT 1,
  hide_unreadable INTEGER NOT NULL DEFAULT 0,
  guest_ok        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
