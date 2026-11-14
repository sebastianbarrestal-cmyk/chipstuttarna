CREATE TABLE armory_equipment (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  armory_url TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  synced_at INTEGER,
  status TEXT NOT NULL,
  equipment TEXT,
  previous_equipment TEXT,
  changed_at INTEGER
);
