-- Privacy-light page metrics (aggregate counts only — no user IDs, IPs, or query strings)
CREATE TABLE IF NOT EXISTS page_metrics (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
