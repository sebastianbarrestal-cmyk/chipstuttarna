ALTER TABLE events ADD COLUMN official INTEGER NOT NULL DEFAULT 0 CHECK(official IN (0,1));
--> statement-breakpoint
CREATE TABLE official_event_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  label TEXT NOT NULL DEFAULT 'Officiellt',
  pin_first INTEGER NOT NULL DEFAULT 1 CHECK(pin_first IN (0,1)),
  raid_size INTEGER NOT NULL DEFAULT 20 CHECK(raid_size BETWEEN 1 AND 80),
  dungeon_size INTEGER NOT NULL DEFAULT 5 CHECK(dungeon_size BETWEEN 1 AND 80),
  pvp_size INTEGER NOT NULL DEFAULT 5 CHECK(pvp_size BETWEEN 1 AND 80)
);
