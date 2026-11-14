ALTER TABLE attendance ADD COLUMN duration_known INTEGER NOT NULL DEFAULT 1 CHECK (duration_known IN (0,1));
