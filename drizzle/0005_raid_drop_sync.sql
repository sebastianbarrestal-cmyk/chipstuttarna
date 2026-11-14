CREATE TABLE raid_drop_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);
