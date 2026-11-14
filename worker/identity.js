import { requireValue } from './http.js'
import { hex } from './tokens.js'

async function guildIdentity(request, env) {
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()
  requireValue(email, 'Logga in för att öppna guildsidan.', 401)
  requireValue(env.GUILD_IDENTITY_KEY, 'Inloggningen är inte tillgänglig just nu.', 503)
  const platformId = request.headers.get('oai-authenticated-user-id')
  return { id:await guildMemberId(email,env), platformId, email }
}

async function guildMemberId(email,env) {
  requireValue(env.GUILD_IDENTITY_KEY, 'Inloggningen är inte tillgänglig just nu.', 503)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.GUILD_IDENTITY_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(email))
  return 'guild:' + hex(new Uint8Array(signature))
}

export { guildIdentity, guildMemberId }
