ALTER TABLE official_event_settings ADD COLUMN creator_role TEXT NOT NULL DEFAULT 'officer' CHECK(creator_role IN ('officer','admin'));
--> statement-breakpoint
CREATE TABLE registration_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL CHECK(mode IN ('open','invite','paused'))
);
--> statement-breakpoint
CREATE TABLE registration_emails (
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('blocked','invited')),
  PRIMARY KEY(email,kind)
);
--> statement-breakpoint
CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY,
  recorded_at INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL
);
