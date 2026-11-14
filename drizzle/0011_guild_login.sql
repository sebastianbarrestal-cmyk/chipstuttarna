CREATE TABLE guild_credentials (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE guild_account_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','reset')),
  username TEXT,
  password TEXT,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guild_links_expiry ON guild_account_links(expires_at);
--> statement-breakpoint
CREATE TABLE guild_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guild_sessions_expiry ON guild_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE guild_auth_limits (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
