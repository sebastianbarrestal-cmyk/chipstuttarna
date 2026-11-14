import { json, bounded, requireValue } from './http.js'
import { editorRoles } from './roles.js'

const pollHasNoVotes = 'NOT EXISTS (SELECT 1 FROM guild_poll_votes WHERE poll_id=p.id)'

async function readPolls(db,member,closedOnly = false, before = null) {
  const filter = closedOnly ? `AND p.closed_at IS NOT NULL AND (? IS NULL OR p.closed_at<? OR (p.closed_at=? AND p.id>?))` : ''
  const page = closedOnly ? [before?.time ?? null,before?.time ?? null,before?.time ?? null,before?.id ?? ''] : []
  const order = closedOnly ? 'p.closed_at DESC' : 'p.closed_at IS NOT NULL,p.created_at DESC'
  const visible = `(p.restricted=0 OR p.created_by=? OR ? OR
    EXISTS(SELECT 1 FROM guild_poll_invites i WHERE i.poll_id=p.id AND i.member_id=?))`
  const inspect = [member.id, Number(editorRoles.includes(member.role)), member.id]
  const [polls,counts] = await db.batch([
    db.prepare(`SELECT p.id,p.question,p.description,p.options,p.created_at,p.closed_at,p.restricted,p.revision,
      (p.closed_at IS NULL AND ${pollHasNoVotes}) AS editable,
      CASE WHEN ? AND p.closed_at IS NULL AND ${pollHasNoVotes} THEN
        (SELECT json_group_array(i.member_id) FROM guild_poll_invites i WHERE i.poll_id=p.id)
      END AS invited_ids,
      m.name AS organizer,v.option_index AS own_vote,
      (p.restricted=0 OR EXISTS (SELECT 1 FROM guild_poll_invites i WHERE i.poll_id=p.id AND i.member_id=?)) AS can_vote
      FROM guild_polls p JOIN members m ON m.id=p.created_by
      LEFT JOIN guild_poll_votes v ON v.poll_id=p.id AND v.member_id=?
      WHERE ${visible} ${filter} ORDER BY ${order},p.id LIMIT 101`).bind(Number(editorRoles.includes(member.role) && !closedOnly),member.id,member.id,...inspect,...page),
    db.prepare(`SELECT v.poll_id,v.option_index,COUNT(*) AS votes FROM guild_poll_votes v
      JOIN guild_polls p ON p.id=v.poll_id WHERE p.closed_at IS NOT NULL AND ${visible} GROUP BY v.poll_id,v.option_index`).bind(...inspect),
  ])
  const grouped = new Map()
  for (const row of counts.results) {
    if (!grouped.has(row.poll_id)) grouped.set(row.poll_id,new Map())
    grouped.get(row.poll_id).set(row.option_index,row.votes)
  }
  const rows = polls.results.slice(0,100)
  const last = rows.at(-1)
  const next = closedOnly && polls.results.length > 100 ? {time:last.closed_at,id:last.id} : null
  return json({next,polls:rows.map(poll => {
    const options = JSON.parse(poll.options)
    const {editable,invited_ids,...summary} = poll
    if (closedOnly) {
      const {own_vote,can_vote,revision,...record} = summary
      return {...record,options,results:options.map((_,index)=>grouped.get(poll.id)?.get(index) ?? 0)}
    }
    const edit = invited_ids === null ? {} : {can_edit:Boolean(editable),invites:JSON.parse(invited_ids)}
    return {...summary,...edit,options,results:poll.closed_at === null ? null :
      options.map((_,index)=>grouped.get(poll.id)?.get(index) ?? 0)}
  })})
}

async function changePoll(db,member,body,path) {
  if (path === '/api/poll-vote') {
    const index = body.option
    const revision = body.revision ?? 0
    requireValue(Number.isSafeInteger(revision) && revision >= 0,'Uppdatera omröstningen och försök igen.')
    requireValue(Number.isInteger(index) && index >= 0 && index < 8,'Välj ett svarsalternativ.')
    const result = await db.prepare(`INSERT INTO guild_poll_votes(poll_id,member_id,option_index)
      SELECT p.id,m.id,? FROM guild_polls p JOIN members m ON m.id=? AND m.status='active'
      WHERE p.id=? AND p.closed_at IS NULL AND p.revision=? AND ?<json_array_length(p.options)
      AND (p.restricted=0 OR EXISTS(SELECT 1 FROM guild_poll_invites i WHERE i.poll_id=p.id AND i.member_id=m.id))
      ON CONFLICT(poll_id,member_id) DO UPDATE SET option_index=excluded.option_index`)
      .bind(index,member.id,bounded(body.id,64),revision,index).run()
    requireValue(result.meta.changes,'Rösten kunde inte sparas. Omröstningen kan ha ändrats eller stängts. Öppna den på nytt.',409)
    return json({ok:true})
  }
  requireValue(editorRoles.includes(member.role),'Endast officerare och admins kan hantera omröstningar.',403)
  const activeOfficer = "status='active' AND role IN ('officer','admin','owner')"
  if (path === '/api/poll-close') {
    const result = await db.prepare(`UPDATE guild_polls SET closed_at=? WHERE id=? AND closed_at IS NULL
      AND EXISTS(SELECT 1 FROM members WHERE id=? AND ${activeOfficer})`)
      .bind(Date.now(),bounded(body.id,64),member.id).run()
    requireValue(result.meta.changes,'Omröstningen kunde inte stängas.',409)
    return json({ok:true})
  }
  const question = bounded(body.question,120)
  const description = bounded(body.description,1000,false)
  requireValue(Array.isArray(body.options) && body.options.length>=2 && body.options.length<=8,'Ange mellan två och åtta svarsalternativ.')
  const options = body.options.map(option=>bounded(option,80))
  requireValue(new Set(options.map(option=>option.toLowerCase())).size===options.length,'Skriv olika svarsalternativ.')
  const invites = body.invites ?? []
  const restricted = body.restricted ?? false
  requireValue(typeof restricted==='boolean' && Array.isArray(invites) && invites.length<=80 &&
    invites.every(id=>typeof id==='string' && id.length<=150) && (!restricted || invites.length>0),
    'Välj minst en medlem när omröstningen gäller utvalda.')
  const invited = JSON.stringify([...new Set(invites)])
  const validAudience = `(?=0 OR NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(
    SELECT 1 FROM members target WHERE target.id=j.value AND target.status='active')))`
  if (path === '/api/poll-edit') {
    requireValue(Number.isSafeInteger(body.revision) && body.revision>=0,'Öppna omröstningen på nytt.')
    const guard = `p.id=? AND p.closed_at IS NULL AND p.revision=? AND ${pollHasNoVotes}
      AND EXISTS (SELECT 1 FROM members WHERE id=? AND ${activeOfficer}) AND ${validAudience}`
    const checks = [bounded(body.id,64),body.revision,member.id,Number(restricted),invited]
    const [,,updated] = await db.batch([
      db.prepare(`DELETE FROM guild_poll_invites WHERE poll_id IN (SELECT p.id FROM guild_polls p WHERE ${guard})`).bind(...checks),
      db.prepare(`INSERT INTO guild_poll_invites(poll_id,member_id)
        SELECT p.id,j.value FROM guild_polls p CROSS JOIN json_each(?) j WHERE ? AND ${guard}`)
        .bind(invited,Number(restricted),...checks),
      db.prepare(`UPDATE guild_polls AS p SET question=?,description=?,options=?,restricted=?,revision=revision+1 WHERE ${guard}`)
        .bind(question,description,JSON.stringify(options),Number(restricted),...checks),
    ])
    requireValue(updated.meta.changes,'Ändringen kunde inte sparas. Omröstningen kan ha fått en röst, ändrats eller stängts. Öppna den på nytt och kontrollera inbjudningarna.',409)
    return json({ok:true})
  }
  const pollId = crypto.randomUUID()
  const [result] = await db.batch([
    db.prepare(`INSERT INTO guild_polls(id,question,description,options,created_by,created_at,restricted)
      SELECT ?,?,?,?,id,?,? FROM members WHERE id=? AND ${activeOfficer}
      AND ${validAudience}`)
      .bind(pollId,question,description,JSON.stringify(options),Date.now(),Number(restricted),member.id,Number(restricted),invited),
    db.prepare(`INSERT INTO guild_poll_invites(poll_id,member_id)
      SELECT p.id,j.value FROM guild_polls p CROSS JOIN json_each(?) j WHERE p.id=? AND p.restricted=1`).bind(invited,pollId),
  ])
  requireValue(result.meta.changes,'Omröstningen kunde inte skapas. Kontrollera inbjudna medlemmar och behörighet.',409)
  return json({ok:true})
}

export { readPolls, changePoll }
