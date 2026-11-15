import { nativeAccounts, rateLimit } from './accounts.js'
import { requireValue } from './http.js'
import { sessionHeader, sessionLifetime } from './sessions.js'
import { digest, randomToken } from './tokens.js'

const discordOrigin = 'https://discord.com'
const authorizeUrl = discordOrigin + '/api/oauth2/authorize'
const tokenUrl = discordOrigin + '/api/oauth2/token'
const userUrl = discordOrigin + '/api/v10/users/@me'
const startPath = '/api/auth/discord'
const callbackPath = startPath + '/callback'
const stateCookie = '__Host-chipstuttarna-discord'
const stateLifetime = 600
const isState = /^[a-f0-9]{64}$/

function discordConfig(env) {
  const origin = URL.parse(env.GUILD_PUBLIC_ORIGIN || '')
  const clientId = env.DISCORD_CLIENT_ID?.trim()
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim()
  if (!nativeAccounts(env) || origin?.protocol !== 'https:' || origin.href !== origin.origin + '/' ||
      !/^[0-9]{17,20}$/.test(clientId ?? '') || !clientSecret) return null
  return { clientId, clientSecret, origin: origin.origin, redirectUri: origin.origin + callbackPath }
}

function flowCookie(state = '') {
  return stateCookie + '=' + state + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + (state ? stateLifetime : 0)
}

function redirect(location, cookies) {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 303, headers })
}

async function startDiscordLogin(request, db, config) {
  await rateLimit(db, request, 'discord')
  const state = randomToken()
  const verifier = randomToken()
  const now = Date.now()
  const hash = await digest(state)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const challenge = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  await db.batch([
    db.prepare('DELETE FROM guild_discord_states WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO guild_discord_states VALUES (?,?,?)').bind(hash, verifier, now + stateLifetime * 1000),
  ])
  const url = new URL(authorizeUrl)
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: 'identify email', state, code_challenge: challenge, code_challenge_method: 'S256',
  })
  return redirect(url.href, [flowCookie(state)])
}

async function discordJson(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Discord svarade med HTTP ' + response.status)
  return response.json()
}

async function redeemDiscordLogin(db, config, params, request) {
  const state = params.get('state') ?? ''
  const cookie = request.headers.get('cookie')?.split(/;\s*/).find(value => value.startsWith(stateCookie + '='))
  if (!isState.test(state) || cookie !== stateCookie + '=' + state) return { error: 'expired' }
  const [consumed] = await db.batch([
    db.prepare('DELETE FROM guild_discord_states WHERE state_hash=? AND expires_at>? RETURNING verifier')
      .bind(await digest(state), Date.now()),
  ])
  const verifier = consumed.results[0]?.verifier
  if (!verifier) return { error: 'expired' }

  if (params.has('error')) return { error: 'cancelled' }
  const code = params.get('code')
  const issuer = params.get('iss')
  if (!code || code.length > 512 || (issuer !== null && issuer !== discordOrigin)) return { error: 'expired' }

  const { access_token: accessToken } = await discordJson(tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId, client_secret: config.clientSecret, code,
      grant_type: 'authorization_code', redirect_uri: config.redirectUri, code_verifier: verifier,
    }),
  })
  if (typeof accessToken !== 'string' || !accessToken) return { error: 'unavailable' }
  const user = await discordJson(userUrl, { headers: { Authorization: 'Bearer ' + accessToken } })
  if (typeof user.id !== 'string' || !/^[0-9]{17,20}$/.test(user.id) ||
      user.verified !== true || typeof user.email !== 'string' || !user.email.trim()) return { error: 'account' }

  const now = Date.now()
  const token = randomToken()
  const [, , saved] = await db.batch([
    db.prepare('DELETE FROM guild_sessions WHERE expires_at<=?').bind(now),
    db.prepare(`INSERT OR IGNORE INTO guild_discord_links (discord_id,member_id)
      SELECT ?,m.id FROM guild_credentials c JOIN members m ON m.id=c.member_id
      WHERE c.email=? AND m.status='active'`).bind(user.id, user.email.trim().toLowerCase()),
    db.prepare(`INSERT INTO guild_sessions(token_hash,member_id,expires_at)
      SELECT ?,m.id,? FROM guild_discord_links l JOIN members m ON m.id=l.member_id
      WHERE l.discord_id=? AND m.status='active'`).bind(await digest(token), now + sessionLifetime, user.id),
  ])
  return saved.meta.changes ? { token } : { error: 'account' }
}

async function discordAuth(request, env, path) {
  const config = discordConfig(env)
  requireValue(config && request.method === 'GET', 'Sidan finns inte.', 404)
  requireValue(new URL(request.url).origin === config.origin, 'Öppna inloggningen från guildsidans ordinarie adress.', 400)
  if (path === startPath) return startDiscordLogin(request, env.DB, config)
  try {
    const result = await redeemDiscordLogin(env.DB, config, new URL(request.url).searchParams, request)
    if (result.token) return redirect('/', [flowCookie(), sessionHeader(result.token, sessionLifetime / 1000)['Set-Cookie']])
    return redirect('/#discord-' + result.error, [flowCookie()])
  } catch {
    console.error('Discord-inloggningen kunde inte slutföras.')
    return redirect('/#discord-unavailable', [flowCookie()])
  }
}

export { discordConfig, discordAuth, startPath, callbackPath }
