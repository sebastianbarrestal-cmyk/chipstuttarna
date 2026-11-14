import { json, bounded, requireValue } from './http.js'
import { classes, roles, editorRoles } from './roles.js'
import { parseArmoryUrl, armoryCharacterKey, generatedArmoryUrl } from './armory-links.js'
import { syncArmory } from './armory.js'

async function changeCharacter(env,member,body,path) {
  const db = env.DB
  const id = member.id
  if (path === '/api/character') {
    const name = bounded(body.name, 55).normalize('NFC').replace(/\s+/g, ' ')
    requireValue(classes.includes(body.class) && roles.includes(body.role), 'Välj klass och spelroll.')
    const editing = body.id ? await db.prepare('SELECT name, armory_url FROM characters WHERE id = ? AND member_id = ? AND archived_at IS NULL')
      .bind(body.id, id).first() : null
    requireValue(!body.id || editing, 'Karaktären finns inte.', 404)
    const savedArmory = editing && armoryCharacterKey(editing.name) === armoryCharacterKey(name) && parseArmoryUrl(editing.armory_url)
    const armory = savedArmory || generatedArmoryUrl(name)
    const existing = await db.prepare(`SELECT id, archived_at, armory_url FROM characters
      WHERE member_id = ? AND lower(name) = lower(?) AND id != ? ORDER BY archived_at IS NOT NULL LIMIT 1`)
      .bind(id, name, body.id ?? '').first()
    requireValue(!existing || (!editing && existing.archived_at !== null), 'Du har redan lagt till den karaktären.', 409)
    if (editing) {
      const result = await db.prepare('UPDATE characters SET name = ?, class = ?, role = ?, armory_url = ? WHERE id = ? AND member_id = ? AND archived_at IS NULL')
        .bind(name, body.class, body.role, armory, body.id, id).run()
      requireValue(result.meta.changes, 'Karaktären finns inte.', 404)
    } else if (existing) {
      const result = await db.prepare(`UPDATE characters SET class=?, role=?, armory_url=?, archived_at=NULL WHERE id=? AND archived_at IS NOT NULL`)
        .bind(body.class, body.role, parseArmoryUrl(existing.armory_url) || armory, existing.id).run()
      requireValue(result.meta.changes, 'Du har redan lagt till den karaktären.', 409)
    } else {
      await db.prepare('INSERT INTO characters (id, member_id, name, class, role, armory_url) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, name, body.class, body.role, armory).run()
    }
  } else if (path === '/api/character/remove') {
    const characterId = bounded(body.id, 64)
    const character = await db.prepare('SELECT id FROM characters WHERE id=? AND member_id=?').bind(characterId, id).first()
    requireValue(character, 'Karaktären finns inte.', 404)
    const now = Date.now()
    await db.batch([
      db.prepare('UPDATE characters SET archived_at=? WHERE id=? AND member_id=? AND archived_at IS NULL').bind(now, character.id, id),
      db.prepare(`DELETE FROM signups WHERE member_id=? AND character_id=?
        AND EXISTS (SELECT 1 FROM characters WHERE id=? AND archived_at IS NOT NULL)
        AND event_id IN (SELECT id FROM events WHERE starts_at>? AND canceled=0)`).bind(id, character.id, character.id, now),
    ])
  } else if (path === '/api/armory') {
    requireValue(typeof body.character_id === 'string' && typeof body.manual === 'boolean', 'Välj en karaktär.')
    const character = await db.prepare('SELECT id, member_id, armory_url FROM characters WHERE id=? AND archived_at IS NULL').bind(body.character_id).first()
    requireValue(character && (character.member_id === id || editorRoles.includes(member.role)), 'Karaktären är inte tillgänglig.', 404)
    requireValue(parseArmoryUrl(character.armory_url), 'Karaktären behöver en WoW Forever Armory-länk.')
    return json(await syncArmory(db, env, character, body.manual))
  }
  return json({ok:true})
}

export { changeCharacter }
