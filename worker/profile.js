import { json, bounded, requireValue } from './http.js'
import { registrationGuard, registrationArgs, mayRegister } from './registration.js'

async function saveProfile(db,member,identity,owner,id,body) {
    const name = bounded(body.name, 32)
    if (!member) requireValue(await mayRegister(db,identity.email,owner), 'Registrering är inte tillgänglig för den här adressen.',403)
    const result = await db.prepare(`INSERT INTO members (id, name, role)
      SELECT ?,?,? WHERE (? OR (${registrationGuard}))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name WHERE members.status='active'`)
      .bind(id,name,owner?'owner':'member',Number(Boolean(member)),...registrationArgs(identity?.email ?? '',owner)).run()
    requireValue(result.meta.changes,'Registrering är inte tillgänglig för den här adressen.',403)
    if (!member && !owner) await db.prepare("DELETE FROM registration_emails WHERE email=? AND kind='invited'").bind(identity.email).run()
    return json({ ok: true })
}

export { saveProfile }
