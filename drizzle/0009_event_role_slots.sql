ALTER TABLE events ADD COLUMN tank_slots INTEGER CHECK (tank_slots IS NULL OR tank_slots BETWEEN 0 AND 80);
--> statement-breakpoint
ALTER TABLE events ADD COLUMN healer_slots INTEGER CHECK (
  (healer_slots IS NULL AND tank_slots IS NULL) OR
  (healer_slots IS NOT NULL AND tank_slots IS NOT NULL AND healer_slots >= 0 AND tank_slots + healer_slots <= capacity)
);
--> statement-breakpoint
CREATE VIEW booked_signups AS
SELECT event_id, member_id
FROM (
  SELECT s.event_id, s.member_id, e.tank_slots,
    CASE s.role WHEN 'Tank' THEN e.tank_slots WHEN 'Healer' THEN e.healer_slots
      ELSE e.capacity - e.tank_slots - e.healer_slots END AS role_limit,
    e.capacity,
    ROW_NUMBER() OVER (PARTITION BY s.event_id ORDER BY s.joined_at, s.member_id) AS event_position,
    ROW_NUMBER() OVER (PARTITION BY s.event_id, s.role ORDER BY s.joined_at, s.member_id) AS role_position
  FROM signups s JOIN events e ON e.id=s.event_id
  WHERE s.status='yes'
)
WHERE (tank_slots IS NULL AND event_position <= capacity)
   OR (tank_slots IS NOT NULL AND role_position <= role_limit);
