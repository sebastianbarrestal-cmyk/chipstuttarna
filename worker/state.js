import { requireValue } from './http.js'
import { adminRoles } from './roles.js'
import { parseArmoryUrl } from './armory-links.js'

const defaultOfficialSettings = {label:'Officiellt',pin_first:1,creator_role:'officer'}

async function readState(db, user) {
  const [events, signups, ownCharacters, members, settings] = await db.batch([
    db.prepare(`SELECT e.*, m.name AS organizer FROM events e JOIN members m ON m.id = e.created_by
      WHERE e.starts_at >= ? ORDER BY e.starts_at, e.id LIMIT 300`).bind(Date.now() - 90 * 86400000),
    db.prepare(`SELECT s.event_id, s.member_id, s.character_id, s.role, s.status, s.joined_at, b.member_id IS NOT NULL AS booked,
      m.name AS member_name, c.name AS character_name, c.class, CASE WHEN c.archived_at IS NULL THEN c.armory_url END AS armory_url, g.status AS armory_status, g.synced_at FROM signups s
      JOIN members m ON m.id = s.member_id JOIN events e ON e.id = s.event_id
      LEFT JOIN booked_signups b ON b.event_id=s.event_id AND b.member_id=s.member_id
      LEFT JOIN characters c ON s.character_id = c.id
      LEFT JOIN armory_equipment g ON c.id=g.character_id AND c.armory_url=g.armory_url WHERE e.starts_at >= ?
      ORDER BY s.joined_at, s.member_id`).bind(Date.now() - 90 * 86400000),
    db.prepare(`SELECT c.id, c.name, c.class, c.role, c.armory_url, g.status AS armory_status, g.synced_at, g.checked_at, g.changed_at
      FROM characters c LEFT JOIN armory_equipment g ON c.id=g.character_id AND c.armory_url=g.armory_url
      WHERE c.member_id = ? AND c.archived_at IS NULL ORDER BY c.name`).bind(user.id),
    db.prepare(`SELECT id, name, role, status FROM members
      WHERE status='active' OR ? ORDER BY name COLLATE NOCASE`).bind(Number(adminRoles.includes(user.role))),
    db.prepare('SELECT label, pin_first, creator_role FROM official_event_settings WHERE id=1'),
  ])
  const byEvent = new Map()
  for (const signup of signups.results) {
    if (!byEvent.has(signup.event_id)) byEvent.set(signup.event_id, [])
    byEvent.get(signup.event_id).push(signup)
  }
  return {
    user,
    officialSettings: settings.results[0] ?? defaultOfficialSettings,
    events: events.results.map(event => ({ ...event, kind: event.is_pvp ? 'pvp' : event.kind, signups: byEvent.get(event.id) ?? [] })),
    characters: ownCharacters.results.map(character => ({ ...character, armory_ready: Boolean(parseArmoryUrl(character.armory_url)) })),
    members: members.results,
  }
}

export { readState }
