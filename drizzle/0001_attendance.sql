CREATE TABLE attendance (
  event_id TEXT NOT NULL REFERENCES events(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  minutes INTEGER NOT NULL CHECK(minutes BETWEEN 0 AND 1440),
  PRIMARY KEY (event_id, member_id)
);
--> statement-breakpoint
ALTER TABLE events ADD COLUMN attendance_finalized INTEGER NOT NULL DEFAULT 0 CHECK (attendance_finalized IN (0,1));
