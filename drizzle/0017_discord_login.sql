CREATE TABLE guild_discord_links (
  discord_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE REFERENCES guild_credentials(member_id)
);
--> statement-breakpoint
CREATE TABLE guild_discord_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guild_discord_states_expiry ON guild_discord_states(expires_at);
