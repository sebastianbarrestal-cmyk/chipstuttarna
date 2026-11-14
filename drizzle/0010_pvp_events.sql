ALTER TABLE events ADD COLUMN is_pvp INTEGER NOT NULL DEFAULT 0 CHECK (is_pvp IN (0,1) AND (is_pvp=0 OR kind='dungeon'));
