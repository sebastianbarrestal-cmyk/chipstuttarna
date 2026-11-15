CREATE TABLE guild_integrations (
  provider TEXT PRIMARY KEY CHECK(provider IN ('armory','discord')),
  encrypted_config TEXT NOT NULL,
  revision INTEGER NOT NULL
);
