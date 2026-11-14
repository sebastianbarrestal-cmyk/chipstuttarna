ALTER TABLE raid_loot_items ADD COLUMN raid_id TEXT;
--> statement-breakpoint
ALTER TABLE raid_loot_items ADD COLUMN boss TEXT;
--> statement-breakpoint
ALTER TABLE raid_loot_items ADD COLUMN forever_chance REAL CHECK (forever_chance BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE raid_loot_items ADD COLUMN source_url TEXT;
