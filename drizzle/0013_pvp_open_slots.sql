UPDATE events SET tank_slots=NULL, healer_slots=NULL
WHERE is_pvp=1 AND tank_slots IS NOT NULL AND attendance_finalized=0 AND canceled=0;
