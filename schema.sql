CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('redirect', 'direct')),
  target_url TEXT NOT NULL,
  page_title TEXT NOT NULL DEFAULT '安全访问',
  page_description TEXT NOT NULL DEFAULT '请确认目标地址后继续访问。',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  visits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domains_hostname_enabled
ON domains(hostname, enabled);
