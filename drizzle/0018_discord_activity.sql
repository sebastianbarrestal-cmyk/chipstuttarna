CREATE TABLE guild_discord_outbox (
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_until INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  PRIMARY KEY (kind, subject_id, version)
);
--> statement-breakpoint
CREATE INDEX guild_discord_outbox_pending ON guild_discord_outbox(due_at) WHERE done_at IS NULL;
--> statement-breakpoint
CREATE TABLE guild_discord_interactions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guild_discord_interactions_expiry ON guild_discord_interactions(expires_at);
