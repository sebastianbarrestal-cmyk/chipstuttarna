CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','officer','member'))
);
--> statement-breakpoint
CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Tank','Healer','DPS')),
  armory_url TEXT,
  UNIQUE(member_id, name)
);
--> statement-breakpoint
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('raid','dungeon')),
  starts_at INTEGER NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 80),
  description TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES members(id),
  canceled INTEGER NOT NULL DEFAULT 0 CHECK (canceled IN (0,1))
);
--> statement-breakpoint
CREATE TABLE signups (
  event_id TEXT NOT NULL REFERENCES events(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('Tank','Healer','DPS')),
  status TEXT NOT NULL CHECK (status IN ('yes','maybe','no')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, member_id)
);
--> statement-breakpoint
CREATE INDEX events_starts ON events(starts_at);
--> statement-breakpoint
CREATE INDEX signups_member ON signups(member_id);
