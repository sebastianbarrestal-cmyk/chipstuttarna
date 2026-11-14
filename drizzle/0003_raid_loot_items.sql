CREATE TABLE raid_loot_items (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  rarity TEXT NOT NULL CHECK (rarity IN ('unknown','common','uncommon','rare','epic','legendary')),
  demand TEXT NOT NULL CHECK (demand IN ('unclassified','low','normal','high','exceptional'))
);
