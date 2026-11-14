CREATE TABLE guild_polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  description TEXT NOT NULL,
  options TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES members(id),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE guild_poll_votes (
  poll_id TEXT NOT NULL REFERENCES guild_polls(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  option_index INTEGER NOT NULL CHECK(option_index BETWEEN 0 AND 7),
  PRIMARY KEY(poll_id,member_id)
);
--> statement-breakpoint
ALTER TABLE guild_polls ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0 CHECK(restricted IN (0,1));
--> statement-breakpoint
CREATE TABLE guild_poll_invites (
  poll_id TEXT NOT NULL REFERENCES guild_polls(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY(poll_id,member_id)
);
