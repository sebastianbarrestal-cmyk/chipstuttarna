import { discordBot, discordRequest, safeMentions, snowflake, uuid, row, button, link } from './discord-api.js'
import { changeEvent } from './events.js'
import { parseArmoryUrl } from './armory-links.js'
import { roles } from './roles.js'
import { json, requireValue } from './http.js'

const interactionsPath = '/api/discord/interactions'
const statuses = { yes: 'Kommer', maybe: 'Kanske', no: 'Kan inte' }
const interactionAge = 300_000

async function verifiedInteraction(request, key) {
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? ''
  const signature = request.headers.get('X-Signature-Ed25519') ?? ''
  requireValue(/^\d{10}$/.test(timestamp) && Math.abs(Date.now() - Number(timestamp) * 1000) <= interactionAge &&
    /^[a-f0-9]{128}$/i.test(signature), 'Ogiltig Discord-signatur.', 401)
  const raw = await request.text()
  requireValue(raw.length <= 32000, 'För stort anrop.', 413)
  const publicKey = await crypto.subtle.importKey('raw', Buffer.from(key,'hex'), 'Ed25519', false, ['verify'])
  const valid = await crypto.subtle.verify('Ed25519', publicKey, Buffer.from(signature,'hex'), new TextEncoder().encode(timestamp + raw))
  requireValue(valid, 'Ogiltig Discord-signatur.', 401)
  try { return JSON.parse(raw) } catch {
    requireValue(false, 'Ogiltigt Discord-anrop.')
  }
}

function reply(content, ...components) {
  return { content, components, allowed_mentions: safeMentions }
}

async function recordSignup(db, member, id, status, character, role) {
  await changeEvent(db, member, { event_id: id, status, character_id: character, role }, '/api/signup')
  return reply('Ditt svar är sparat på guildsidan: **' + statuses[status] + '**.')
}

async function signupReply(db, bot, interaction, id, status, step, value) {
  const member = await db.prepare(`SELECT m.id,m.role FROM guild_discord_links l
    JOIN members m ON m.id=l.member_id WHERE l.discord_id=? AND m.status='active'`)
    .bind(interaction.member.user.id).first()
  if (!member) return reply('Logga in med Discord på guildsidan och koppla ditt konto först.',
    row(link('Öppna guildsidan', bot.origin)))
  const event = await db.prepare('SELECT is_pvp FROM events WHERE id=? AND canceled=0 AND starts_at>?')
    .bind(id, Date.now()).first()
  if (!event) return reply('Anmälan är stängd.')
  if (status === 'no') return recordSignup(db, member, id, status, null, 'DPS')
  const eventLink = row(link('Öppna på guildsidan', bot.origin + '/#events/' + id))
  if (step === 'rsvp') {
    const { results } = await db.prepare(`SELECT id,name,role,armory_url FROM characters
      WHERE member_id=? AND archived_at IS NULL ORDER BY name COLLATE NOCASE`).bind(member.id).all()
    const characters = results.filter(item => parseArmoryUrl(item.armory_url))
    if (!characters.length) return reply('Lägg till en karaktär med Armory på guildsidan först.',
      row(link('Mina karaktärer', bot.origin + '/#characters')))
    const options = characters.slice(0, 25).map(item => ({
      label: (item.name + (event.is_pvp ? '' : ' · ' + item.role)).slice(0, 100), value: item.id,
    }))
    return reply('Välj karaktär för **' + statuses[status] + '**.',
      row({type: 3, custom_id: 'pick:' + status + ':' + id, placeholder: 'Välj karaktär', options }), eventLink)
  }
  const character = step === 'pick' ? interaction.data.values?.[0] : value?.split('.')[0]
  requireValue(uuid.test(character ?? ''), 'Välj en karaktär.')
  const own = await db.prepare(`SELECT role,armory_url FROM characters
    WHERE id=? AND member_id=? AND archived_at IS NULL`).bind(character, member.id).first()
  requireValue(parseArmoryUrl(own?.armory_url), 'Välj en av dina egna karaktärer med Armory-länk.')
  if (event.is_pvp) return recordSignup(db, member, id, status, character, null)
  if (step === 'pick') return reply('Välj spelroll för **' + statuses[status] + '**.',
    row(...roles.map(role => button(role, 'role:' + status + ':' + id + ':' + character + '.' + role, role === own.role ? 1 : 2))),
    eventLink)
  return recordSignup(db, member, id, status, character, value.split('.')[1])
}

async function finishSignup(env, bot, interaction, id, status, step, value) {
  let message
  try {
    const now = Date.now()
    const [, receipt] = await env.DB.batch([
      env.DB.prepare('DELETE FROM guild_discord_interactions WHERE expires_at<?').bind(now),
      env.DB.prepare('INSERT OR IGNORE INTO guild_discord_interactions VALUES (?,?)').bind(interaction.id, now + 2 * interactionAge),
    ])
    if (!receipt.meta.changes) return
    message = await signupReply(env.DB, bot, interaction, id, status, step, value)
  } catch (error) {
    message = reply(error.status ? error.message : 'Svaret kunde inte sparas. Försök igen.')
  }
  const response = await discordRequest('/webhooks/' + interaction.application_id + '/' +
    encodeURIComponent(interaction.token) + '/messages/@original', 'PATCH', message)
  if (!response.ok) console.error('Discord-svaret kunde inte skickas:', response.status)
}

async function discordInteractions(request, env, context) {
  const key = env.DISCORD_PUBLIC_KEY?.trim()
  requireValue(request.method === 'POST' && /^[a-f0-9]{64}$/i.test(key ?? ''), 'Sidan finns inte.', 404)
  const interaction = await verifiedInteraction(request, key)
  if (interaction?.type === 1) return json({ type: 1 })
  const bot = discordBot(env)
  requireValue(bot && interaction?.type === 3 && interaction.guild_id === bot.guild &&
    interaction.application_id === env.DISCORD_CLIENT_ID && snowflake.test(interaction.id ?? '') &&
    snowflake.test(interaction.member?.user?.id ?? '') && typeof interaction.token === 'string' &&
    interaction.token.length > 0 && interaction.token.length <= 512, 'Åtkomst nekad.', 403)
  const [step, status, id, value] = (interaction.data?.custom_id ?? '').split(':')
  requireValue(['rsvp','pick','role'].includes(step) && Object.hasOwn(statuses,status) && uuid.test(id ?? '') &&
    (step !== 'role' || value?.includes('.')), 'Ogiltigt svar.')
  context.waitUntil(finishSignup(env, bot, interaction, id, status, step, value)
    .catch(() => console.error('Discord-svaret kunde inte uppdateras.')))
  return json({ type: 5, data: { flags: 64 } })
}

export { discordInteractions, interactionsPath }
