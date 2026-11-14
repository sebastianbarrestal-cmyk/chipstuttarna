import { json, bounded, requireValue } from './http.js'
import { adminRoles } from './roles.js'
import { nativeAccounts, normalEmail, rateLimit, createAccountLink } from './accounts.js'

function audit(db, actor, action, target, detail, conditional = true) {
  return db.prepare(`INSERT INTO admin_audit(recorded_at,actor_name,action,target,detail)
    SELECT ?,?,?,?,? ${conditional ? 'WHERE changes()>0' : ''}`).bind(Date.now(),actor.name,action,target,detail)
}

function adminGate(member) {
  requireValue(adminRoles.includes(member?.role),'Endast admins har åtkomst.',403)
}

async function readAdmin(db, env) {
  const [accounts, emails, mode, history, pending] = await db.batch([
    db.prepare(`SELECT m.id,m.name,m.role,m.status,c.email,c.username FROM members m
      LEFT JOIN guild_credentials c ON c.member_id=m.id ORDER BY m.name COLLATE NOCASE`),
    db.prepare('SELECT email,kind FROM registration_emails ORDER BY email'),
    db.prepare('SELECT mode FROM registration_settings WHERE id=1'),
    db.prepare('SELECT recorded_at,actor_name,action,target,detail FROM admin_audit ORDER BY id DESC LIMIT 100'),
    db.prepare(`SELECT l.email,MAX(l.expires_at) AS expires_at FROM guild_account_links l
      WHERE l.purpose='register' AND l.expires_at>? AND NOT EXISTS(SELECT 1 FROM guild_credentials c WHERE c.email=l.email)
      GROUP BY l.email ORDER BY expires_at DESC LIMIT 100`).bind(Date.now()),
  ])
  return json({accounts:accounts.results,emails:emails.results,mode:mode.results[0]?.mode ?? 'open',
    history:history.results,pending:pending.results,mail_ready:nativeAccounts(env)})
}

async function changeRegistration(db,member,body,path) {
  if (path === '/api/registration-mode') {
    requireValue(['open','invite','paused'].includes(body.mode),'Välj ett giltigt registreringsläge.')
    const [,log] = await db.batch([
      db.prepare(`INSERT INTO registration_settings(id,mode) VALUES (1,?)
        ON CONFLICT(id) DO UPDATE SET mode=excluded.mode WHERE mode!=excluded.mode`).bind(body.mode),
      audit(db,member,'registration_mode','Registrering',body.mode),
    ])
    return json({ok:true,changed:Boolean(log.meta.changes)})
  }
  const email = normalEmail(body.email)
  requireValue(['blocked','invited'].includes(body.kind) && typeof body.remove==='boolean','Välj en giltig åtgärd.')
  const statement = body.remove
    ? db.prepare('DELETE FROM registration_emails WHERE email=? AND kind=?')
    : db.prepare('INSERT OR IGNORE INTO registration_emails(email,kind) VALUES (?,?)')
  await db.batch([
    statement.bind(email,body.kind),
    audit(db,member,body.remove?'email_remove':'email_add',email,body.kind),
  ])
  return json({ok:true})
}

function memberAudit(db,actor,action,target,detail) {
  return db.prepare(`INSERT INTO admin_audit(recorded_at,actor_name,action,target,detail)
    SELECT ?,?,?,name,? FROM members WHERE id=? AND changes()>0`).bind(Date.now(),actor.name,action,detail,target)
}

async function administer(request,env,member,body,path) {
  const db = env.DB
  const id = member.id
  if (path === '/api/registration-mode' || path === '/api/registration-email') {
    adminGate(member)
    return changeRegistration(db,member,body,path)
  } else if (path === '/api/account-reset') {
    adminGate(member)
    requireValue(nativeAccounts(env),'Anslut mejltjänsten för att skicka återställningslänkar.',503)
    const target = await db.prepare(`SELECT m.name,m.role,m.status,c.email FROM members m
      JOIN guild_credentials c ON c.member_id=m.id WHERE m.id=?`).bind(bounded(body.id,150)).first()
    requireValue(target?.status==='active' && body.id!==id && target.role!=='owner' &&
      (target.role!=='admin' || member.role==='owner'),'Kontot kan inte återställas här.',409)
    await rateLimit(db,request,'mail',target.email)
    await createAccountLink(env,target.email,'reset')
    await audit(db,member,'password_reset',target.name,'',false).run()
  } else if (path === '/api/official-settings') {
    adminGate(member)
    const label = bounded(body.label,24)
    requireValue(typeof body.pin_first === 'boolean' && ['officer','admin'].includes(body.creator_role),'Välj giltiga inställningar.')
    const [result] = await db.batch([
      db.prepare(`INSERT INTO official_event_settings(id,label,pin_first,creator_role)
        SELECT 1,?,?,? FROM members WHERE id=? AND status='active' AND role IN ('owner','admin')
        ON CONFLICT(id) DO UPDATE SET label=excluded.label,pin_first=excluded.pin_first,creator_role=excluded.creator_role`)
        .bind(label,Number(body.pin_first),body.creator_role,id),
      audit(db,member,'official_settings','Officiella tillfällen',JSON.stringify({label,pin_first:body.pin_first,creator_role:body.creator_role})),
    ])
    requireValue(result.meta.changes,'Endast admins kan ändra inställningen.',403)
  } else if (path === '/api/permissions' || path === '/api/account-status') {
    requireValue(adminRoles.includes(member.role), 'Endast admins kan hantera konton.', 403)
    const target = bounded(body.id, 150)
    requireValue(target !== id, 'Välj ett annat konto.')
    const ownerOnly = Number(member.role === 'owner')
    const canManage = `id=? AND role!='owner' AND (role!='admin' OR ?) AND status!='removed'
      AND EXISTS (SELECT 1 FROM members actor WHERE actor.id=? AND actor.status='active'
        AND (actor.role='owner' OR (actor.role='admin' AND ?=0)))`
    if (path === '/api/permissions') {
      requireValue(['admin','officer','member'].includes(body.role) && (body.role !== 'admin' || ownerOnly),
        'Endast ägaren kan ge adminbehörighet.')
      const [result] = await db.batch([
        db.prepare(`UPDATE members SET role=? WHERE ${canManage} AND status='active'`).bind(body.role,target,ownerOnly,id,ownerOnly),
        memberAudit(db,member,'role',target,body.role),
      ])
      requireValue(result.meta.changes, 'Kontot kan inte ändras.', 409)
    } else {
      requireValue(['active','blocked','removed'].includes(body.status), 'Välj en giltig kontoåtgärd.')
      const [,result] = await db.batch([
        db.prepare(`INSERT INTO admin_audit(recorded_at,actor_name,action,target,detail)
          SELECT ?,?,'account_status',name,? FROM members WHERE ${canManage}`)
          .bind(Date.now(),member.name,body.status,target,ownerOnly,id,ownerOnly),
        db.prepare(`UPDATE members SET status=? WHERE ${canManage}`).bind(body.status,target,ownerOnly,id,ownerOnly),
        db.prepare(`DELETE FROM signups WHERE member_id=? AND event_id IN
          (SELECT id FROM events WHERE starts_at>? AND canceled=0)
          AND EXISTS (SELECT 1 FROM members WHERE id=? AND status IN ('blocked','removed'))
          AND changes() > 0`).bind(target,Date.now(),target),
        db.prepare(`DELETE FROM guild_sessions WHERE member_id=? AND EXISTS
          (SELECT 1 FROM members WHERE id=? AND status IN ('blocked','removed'))`).bind(target,target),
      ])
      requireValue(result.meta.changes, 'Kontot kan inte ändras.', 409)
    }
  }
  return json({ok:true})
}

export { adminGate, readAdmin, administer }
