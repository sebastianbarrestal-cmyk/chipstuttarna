const api = 'https://discord.com/api/v10'
const snowflake = /^[0-9]{17,20}$/
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const safeMentions = { parse: [] }

function discordBot(env) {
  const origin = URL.parse(env.GUILD_PUBLIC_ORIGIN || '')
  if (origin?.protocol !== 'https:' || origin.href !== origin.origin + '/' ||
      !snowflake.test(env.DISCORD_GUILD_ID ?? '') || !snowflake.test(env.DISCORD_CHANNEL_ID ?? '') ||
      !env.DISCORD_BOT_TOKEN?.trim()) return null
  return {
    origin: origin.origin,
    token: env.DISCORD_BOT_TOKEN.trim(),
    guild: env.DISCORD_GUILD_ID,
    channel: env.DISCORD_CHANNEL_ID,
  }
}

function discordRequest(path, method, data, botToken) {
  const headers = { 'Content-Type': 'application/json' }
  if (botToken) headers.Authorization = 'Bot ' + botToken
  return fetch(api + path, {
    method, headers, body: JSON.stringify(data), redirect: 'error', signal: AbortSignal.timeout(5000),
  })
}

const row = (...components) => ({ type: 1, components })
const button = (label, id, style = 2) => ({ type: 2, style, label, custom_id: id })
const link = (label, url) => ({ type: 2, style: 5, label, url })

export { discordBot, discordRequest, snowflake, uuid, safeMentions, row, button, link }
