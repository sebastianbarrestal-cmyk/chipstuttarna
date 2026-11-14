import { json, requireValue } from './http.js'
import { editorRoles } from './roles.js'
import { expectedSignups } from './events.js'
import { raidCatalog } from './data.js'
import { readRaidDrops } from './raid-drops.js'

async function readStatistics(request, db, member, id, path, context) {
  if (request.method === 'GET' && path === '/api/my-stats') {
    requireValue(member, 'Skapa ditt guildkonto först.', 403)
    const result = await db.prepare(`SELECT CASE WHEN e.is_pvp=1 THEN 'pvp' ELSE e.kind END AS kind,
      COUNT(*) AS recorded, SUM(CASE WHEN a.minutes>0 OR a.duration_known=0 THEN 1 ELSE 0 END) AS attended,
      SUM(a.minutes) AS minutes, SUM(CASE WHEN a.minutes>0 THEN 1 ELSE 0 END) AS timed
      FROM attendance a JOIN events e ON e.id=a.event_id
      WHERE a.member_id=? AND e.canceled=0 AND e.attendance_finalized=1 GROUP BY e.kind,e.is_pvp`).bind(id).all()
    return json({stats:result.results})
  }
  if (request.method === 'GET' && path.startsWith('/api/character-stats/')) {
    requireValue(member, 'Skapa ditt guildkonto först.', 403)
    const character = await db.prepare('SELECT id, name FROM characters WHERE id=? AND member_id=? AND archived_at IS NULL')
      .bind(path.split('/').at(-1),id).first()
    requireValue(character, 'Karaktären finns inte.', 404)
    const rows = await db.prepare(`SELECT CASE WHEN e.is_pvp=1 THEN 'pvp' ELSE e.kind END AS kind,
      SUM(CASE WHEN a.minutes > 0 OR a.duration_known = 0 THEN 1 ELSE 0 END) AS attended,
      COUNT(*) AS recorded, SUM(a.minutes) AS minutes,
      SUM(CASE WHEN a.minutes > 0 THEN 1 ELSE 0 END) AS timed
      FROM signups s JOIN events e ON e.id=s.event_id
      JOIN attendance a ON a.event_id=e.id AND a.member_id=s.member_id
      WHERE s.member_id=? AND s.character_id=? AND e.canceled=0 AND e.attendance_finalized=1
      GROUP BY e.kind,e.is_pvp`).bind(id,character.id).all()
    return json({ character, stats: rows.results, loot: null })
  }

  if (request.method === 'GET' && path === '/api/officers') {
    requireValue(editorRoles.includes(member?.role), 'Vyn är för officerare och admins.', 403)
    const since = Date.now() - 90 * 86400000
    const [events, stats, raidStats, raidParticipants] = await db.batch([
      db.prepare(`SELECT e.id, CASE WHEN e.is_pvp=1 THEN 'pvp' ELSE e.kind END AS kind, e.title, e.starts_at, e.official, e.attendance_finalized, e.canceled,
        (SELECT COUNT(*) FROM booked_signups b WHERE b.event_id=e.id) AS expected_count
        FROM events e WHERE (e.starts_at >= ? OR (e.official=1 AND e.attendance_finalized=0 AND e.canceled=0))
        AND e.starts_at <= ? ORDER BY e.starts_at DESC`).bind(since, Date.now()),
      db.prepare(`SELECT m.id, m.name,
        SUM(CASE WHEN a.minutes > 0 OR a.duration_known = 0 THEN 1 ELSE 0 END) AS attended,
        COALESCE(SUM(a.minutes),0) AS minutes, COUNT(a.member_id) AS recorded,
        SUM(CASE WHEN a.minutes > 0 THEN 1 ELSE 0 END) AS timed
        FROM members m LEFT JOIN (attendance a JOIN events e
          ON a.event_id=e.id AND e.canceled=0 AND e.attendance_finalized=1 AND e.starts_at >= ?) ON m.id=a.member_id
        GROUP BY m.id ORDER BY attended DESC, m.name COLLATE NOCASE`).bind(since),
      db.prepare(`SELECT m.id, m.name, COUNT(a.member_id) AS recorded,
        SUM(CASE WHEN a.minutes > 0 OR a.duration_known = 0 THEN 1 ELSE 0 END) AS attended
        FROM members m LEFT JOIN (attendance a JOIN events e ON a.event_id=e.id AND e.kind='raid'
          AND e.canceled=0 AND e.attendance_finalized=1 AND e.starts_at >= ?) ON m.id=a.member_id
        GROUP BY m.id HAVING COUNT(a.member_id) > 0`).bind(since),
      db.prepare(`SELECT a.event_id, a.member_id FROM attendance a JOIN events e ON e.id=a.event_id
        WHERE e.kind='raid' AND e.canceled=0 AND e.attendance_finalized=1 AND e.starts_at >= ?
        AND (a.minutes > 0 OR a.duration_known=0)`).bind(since),
    ])
    return json({ events: events.results, stats: stats.results, raidStats: raidStats.results, raidParticipants: raidParticipants.results, raidCatalog })
  }
  if (request.method === 'GET' && path === '/api/officers/drops') {
    requireValue(editorRoles.includes(member?.role), 'Vyn är för officerare och admins.', 403)
    return json(await readRaidDrops(db, context))
  }
  if (request.method === 'GET' && path.startsWith('/api/officers/attendance/')) {
    requireValue(editorRoles.includes(member?.role), 'Vyn är för officerare och admins.', 403)
    const event = await db.prepare('SELECT id, title, starts_at, capacity FROM events WHERE id = ? AND canceled = 0 AND starts_at <= ?')
      .bind(path.split('/').at(-1), Date.now()).first()
    requireValue(event, 'Speltillfället kan inte längre närvarorapporteras.', 409)
    const [expected, rows] = await db.batch([
      db.prepare(expectedSignups).bind(event.id),
      db.prepare('SELECT member_id, minutes, duration_known FROM attendance WHERE event_id = ?').bind(event.id),
    ])
    return json({ event, expected: expected.results, rows: rows.results })
  }
  return null
}

export { readStatistics }
