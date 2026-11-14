import { json, bounded, requireValue } from './http.js'
import { roles, editorRoles, adminRoles } from './roles.js'
import { parseArmoryUrl } from './armory-links.js'

const expectedSignups = `SELECT s.member_id AS id, m.name, c.name AS character_name
  FROM booked_signups b JOIN signups s ON s.event_id=b.event_id AND s.member_id=b.member_id
  JOIN members m ON m.id=s.member_id LEFT JOIN characters c ON c.id=s.character_id
  WHERE b.event_id = ?
  ORDER BY s.joined_at, s.member_id`

async function changeEvent(db,member,body,path) {
  const id = member.id
  if (path === '/api/event') {
    const title = bounded(body.title, 70)
    const description = bounded(body.description, 650, false)
    requireValue(['raid', 'dungeon', 'pvp'].includes(body.kind), 'Välj raid, dungeon eller PvP.')
    requireValue(Number.isInteger(body.starts_at) && body.starts_at > Date.now() && body.starts_at < Date.now() + 731 * 86400000, 'Välj en framtida tid inom två år.')
    requireValue(Number.isInteger(body.capacity) && body.capacity >= 1 && body.capacity <= 80, 'Ange 1 till 80 platser.')
    const storageKind = body.kind === 'pvp' ? 'dungeon' : body.kind
    const isPvp = Number(body.kind === 'pvp')
    const tankSlots = isPvp ? null : body.tank_slots ?? null
    const healerSlots = isPvp ? null : body.healer_slots ?? null
    const roleSlotsValid = tankSlots === null && healerSlots === null ||
      Number.isInteger(tankSlots) && Number.isInteger(healerSlots) &&
      tankSlots >= 0 && healerSlots >= 0 && tankSlots + healerSlots <= body.capacity
    requireValue(roleSlotsValid, 'Fyll i både tanks och healers. Summan får inte överstiga antalet platser.')
    const officer = editorRoles.includes(member.role)
    requireValue(body.official === undefined || typeof body.official === 'boolean','Välj en giltig nivå för speltillfället.')
    const rule = await db.prepare('SELECT creator_role FROM official_event_settings WHERE id=1').first()
    const canPublish = adminRoles.includes(member.role) || (officer && rule?.creator_role !== 'admin')
    requireValue(!body.official || canPublish,'Du har inte behörighet att skapa officiella speltillfällen.',403)
    const official = typeof body.official === 'boolean' && canPublish ? Number(body.official) : null
    if (body.id) {
      const result = await db.prepare('UPDATE events SET title = ?, description = ?, kind = ?, is_pvp = ?, starts_at = ?, capacity = ?, tank_slots = ?, healer_slots = ?, official = COALESCE(?,official) WHERE id = ? AND canceled = 0 AND starts_at > ? AND (created_by=? OR ?)')
        .bind(title, description, storageKind, isPvp, body.starts_at, body.capacity, tankSlots, healerSlots, official, body.id, Date.now(), id, Number(officer)).run()
      requireValue(result.meta.changes, 'Speltillfället kan inte längre ändras.', 409)
    } else {
      await db.prepare('INSERT INTO events (id, title, description, kind, is_pvp, starts_at, capacity, tank_slots, healer_slots, official, created_by) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, id FROM members WHERE id=? AND status=\'active\'')
        .bind(crypto.randomUUID(), title, description, storageKind, isPvp, body.starts_at, body.capacity, tankSlots, healerSlots, official ?? 0, id).run()
    }
  } else if (path === '/api/cancel') {
    const result = await db.prepare('UPDATE events SET canceled = 1 WHERE id = ? AND canceled = 0 AND (created_by=? OR ?)').bind(body.id ?? '', id, Number(editorRoles.includes(member.role))).run()
    requireValue(result.meta.changes, 'Speltillfället kan inte längre ställas in.', 409)
  } else if (path === '/api/signup') {
    requireValue(['yes', 'maybe', 'no'].includes(body.status), 'Välj ditt svar.')
    const event = await db.prepare('SELECT is_pvp FROM events WHERE id=? AND canceled=0 AND starts_at>?')
      .bind(body.event_id ?? '',Date.now()).first()
    requireValue(event, 'Anmälan är stängd.', 409)
    requireValue(event.is_pvp || roles.includes(body.role), 'Välj spelroll.')
    if (body.status !== 'no') {
      requireValue(typeof body.character_id === 'string' && body.character_id, 'Välj en karaktär med Armory-länk för att anmäla dig.')
      const character = await db.prepare('SELECT armory_url FROM characters WHERE id = ? AND member_id = ? AND archived_at IS NULL').bind(body.character_id, id).first()
      requireValue(parseArmoryUrl(character?.armory_url), 'Välj en av dina egna karaktärer med Armory-länk.')
    }
    const role = roles.includes(body.role) ? body.role : null
    const result = await db.prepare(`INSERT INTO signups (event_id, member_id, character_id, role, status, joined_at)
      SELECT id, ?, ?, CASE WHEN is_pvp=1 THEN 'DPS' ELSE ? END, ?, ?
      FROM events WHERE id = ? AND canceled = 0 AND starts_at > ?
        AND (is_pvp=1 OR ? IS NOT NULL)
        AND EXISTS (SELECT 1 FROM members WHERE id=? AND status='active')
        AND (? = 'no' OR EXISTS (SELECT 1 FROM characters WHERE id=? AND member_id=? AND archived_at IS NULL))
      ON CONFLICT(event_id, member_id) DO UPDATE SET character_id = excluded.character_id,
      role = excluded.role, status = excluded.status, joined_at = CASE
      WHEN signups.status = excluded.status AND (signups.role = excluded.role OR
        (SELECT tank_slots FROM events WHERE id = excluded.event_id) IS NULL)
      THEN signups.joined_at ELSE excluded.joined_at END`)
      .bind(id, body.status === 'no' ? null : body.character_id, role, body.status, Date.now(), body.event_id ?? '', Date.now(), role, id, body.status, body.status === 'no' ? null : body.character_id, id).run()
    requireValue(result.meta.changes, 'Anmälan är stängd.', 409)
  } else if (path === '/api/attendance') {
    requireValue(editorRoles.includes(member.role), 'Du behöver vara officerare eller admin.', 403)
    const event = await db.prepare('SELECT id, capacity FROM events WHERE id = ? AND canceled = 0 AND starts_at <= ?').bind(body.id ?? '', Date.now()).first()
    requireValue(event, 'Närvaro kan registreras när speltillfället har börjat.', 409)
    const { missing, extra, minutes } = body
    requireValue([missing, extra].every(list => Array.isArray(list) && list.length <= 80
      && list.every(id => typeof id === 'string') && new Set(list).size === list.length), 'Kontrollera deltagarlistan.')
    requireValue(minutes === null || (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440), 'Ange en längd mellan 1 och 1440 minuter.')
    const [expected, existing, members] = await db.batch([
      db.prepare(expectedSignups).bind(event.id),
      db.prepare('SELECT member_id, minutes, duration_known FROM attendance WHERE event_id = ?').bind(event.id),
      db.prepare(`SELECT id FROM members WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(extra)),
    ])
    const expectedIds = new Set(expected.results.map(row => row.id))
    requireValue(missing.every(id => expectedIds.has(id)) && extra.every(id => !expectedIds.has(id))
      && members.results.length === extra.length, 'Deltagarlistan har ändrats. Öppna närvaron igen.')
    requireValue(expectedIds.size > 0 || extra.length > 0, 'Lägg till minst en deltagare för att spara närvaron.')
    const prior = new Map(existing.results.map(row => [row.member_id, row]))
    const absent = new Set(missing)
    const rows = [...expectedIds, ...extra].map(id => {
      if (absent.has(id)) return { id, minutes: 0, known: 1 }
      const previous = prior.get(id)
      const length = minutes ?? (previous?.minutes || null)
      return { id, minutes: length ?? 0, known: Number(length !== null) }
    })
    const [saved] = await db.batch([
      db.prepare('UPDATE events SET attendance_finalized = 1 WHERE id = ? AND canceled = 0').bind(event.id),
      db.prepare('DELETE FROM attendance WHERE event_id IN (SELECT id FROM events WHERE id = ? AND canceled = 0)').bind(event.id),
      db.prepare(`INSERT INTO attendance (event_id, member_id, minutes, duration_known)
        SELECT e.id, json_extract(j.value, '$.id'), json_extract(j.value, '$.minutes'), json_extract(j.value, '$.known')
        FROM events e CROSS JOIN json_each(?) j WHERE e.id = ? AND e.canceled = 0`).bind(JSON.stringify(rows), event.id),
    ])
    requireValue(saved.meta.changes, 'Speltillfället är inställt.', 409)
  }
  return json({ok:true})
}

export { expectedSignups, changeEvent }
