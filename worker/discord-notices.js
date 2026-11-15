import { timingSafeEqual } from 'node:crypto'
import { discordBot, discordRequest, safeMentions, row, button, link } from './discord-api.js'
import { json, requireValue } from './http.js'
import { digest } from './tokens.js'

const minute = 60_000
const reminderLead = 30 * minute
const minimumReminderLead = 2 * minute
const jobPath = '/api/discord/jobs'
const jobLimit = 6
const queueAge = 30 * 1440 * minute

function queueDiscordNotice(db, kind, id) {
  return db.prepare(`INSERT OR IGNORE INTO guild_discord_outbox(kind,subject_id,due_at)
    SELECT ?,?,? WHERE changes()>0`).bind(kind, id, Date.now())
}

const discordText = text => text.replace(/[\\`*_~|<>\[\]]/g, '\\$&').replace(/\s+/g, ' ')

async function noticeMessage(db, bot, job, now) {
  const id = job.subject_id
  if (job.kind === 'poll') {
    const poll = await db.prepare('SELECT 1 FROM guild_polls WHERE id=? AND restricted=0 AND closed_at IS NULL').bind(id).first()
    if (!poll) return null
    return {
      content: 'En ny omröstning är öppen på guildsidan.',
      components: [row(link('Öppna omröstningarna', bot.origin + '/#polls'))],
    }
  }
  const event = await db.prepare('SELECT title, kind, is_pvp, official, starts_at, canceled FROM events WHERE id=?').bind(id).first()
  if (!event) return null
  const cancellation = job.kind === 'cancel'
  const reminder = job.kind === 'reminder'
  if (cancellation ? !event.canceled : event.canceled || event.starts_at <= now) return null
  if (reminder && (event.starts_at !== job.version || event.starts_at <= now + minimumReminderLead)) return null
  const prefix = cancellation ? 'Inställt' : reminder ? 'Påminnelse' : 'Nytt speltillfälle'
  const kind = event.is_pvp ? 'PvP' : event.kind === 'raid' ? 'Raid' : 'Dungeon'
  const eventTime = Math.floor(event.starts_at / 1000)
  const when = '<t:' + eventTime + ':F>' + (reminder ? ' · <t:' + eventTime + ':R>' : '')
  const open = link('Öppna på guildsidan', bot.origin + '/#events/' + id)
  return {
    content: '**' + prefix + ' · ' + (event.official ? 'Officiellt · ' : '') + kind + '**\n' +
      discordText(event.title) + '\n' + when,
    components: cancellation ? [row(open)] : [row(
      button('Kommer', 'rsvp:yes:' + id, 3), button('Kanske', 'rsvp:maybe:' + id),
      button('Kan inte', 'rsvp:no:' + id, 4), open,
    )],
  }
}

async function runDiscordJobs(env, now = Date.now()) {
  const bot = discordBot(env)
  if (!bot) return { enabled: false, sent: 0, failed: 0 }
  const db = env.DB
  const [,,claim] = await db.batch([
    db.prepare('DELETE FROM guild_discord_outbox WHERE done_at < ?').bind(now - queueAge),
    db.prepare(`INSERT OR IGNORE INTO guild_discord_outbox(kind, subject_id, version, due_at)
      SELECT 'reminder', id, starts_at, ?
      FROM events WHERE starts_at > ? AND starts_at <= ? AND canceled=0`)
      .bind(now, now + minimumReminderLead, now + reminderLead),
    db.prepare(`UPDATE guild_discord_outbox SET leased_until=?, attempts=attempts+1
      WHERE (kind,subject_id,version) IN (
        SELECT kind,subject_id,version FROM guild_discord_outbox
        WHERE done_at IS NULL AND due_at<=? AND leased_until<=?
        ORDER BY CASE kind WHEN 'reminder' THEN 0 ELSE 1 END, due_at LIMIT ?
      ) RETURNING *`).bind(now + minute, now, now, jobLimit),
  ])
  let sent = 0
  let failed = 0
  for (const job of claim.results) {
    const key = [job.kind, job.subject_id, job.version, job.leased_until]
    try {
      const message = await noticeMessage(db, bot, job, now)
      if (message) {
        const nonce = (await digest(JSON.stringify(key.slice(0, 3)))).slice(0, 25)
        const response = await discordRequest('/channels/' + bot.channel + '/messages', 'POST',
          { ...message, nonce, enforce_nonce: true, allowed_mentions: safeMentions }, bot.token)
        if (!response.ok) throw new Error(String(response.status))
        sent++
      }
      await db.prepare(`UPDATE guild_discord_outbox SET done_at=?
        WHERE kind=? AND subject_id=? AND version=? AND leased_until=?`).bind(now, ...key).run()
    } catch {
      failed++
      const delay = Math.min(2 ** job.attempts, 60) * minute
      await db.prepare(`UPDATE guild_discord_outbox SET due_at=?, leased_until=0,
        done_at=CASE WHEN attempts>=12 THEN ? ELSE NULL END
        WHERE kind=? AND subject_id=? AND version=? AND leased_until=?`).bind(now + delay, now, ...key).run()
    }
  }
  return { enabled: true, sent, failed }
}

async function discordJobRequest(request, env) {
  const secret = env.DISCORD_JOB_SECRET
  requireValue(request.method === 'POST' && secret?.length >= 32, 'Sidan finns inte.', 404)
  const auth = request.headers.get('Authorization') || ''
  const supplied = Buffer.from(await digest(auth))
  const expected = Buffer.from(await digest('Bearer ' + secret))
  requireValue(timingSafeEqual(supplied, expected), 'Åtkomst nekad.', 401)
  return json(await runDiscordJobs(env))
}

export { queueDiscordNotice, runDiscordJobs, discordJobRequest, jobPath }
