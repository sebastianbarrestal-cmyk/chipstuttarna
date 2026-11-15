import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../dist/server/index.js'
import { openDatabase } from '../server/sqlite.js'

test('Discord login links an active verified guild account and consumes OAuth state once', async t => {
  const DB = openDatabase(':memory:')
  t.after(() => DB.close())
  const origin = 'https://guild.example.com'
  const env = {
    DB, GUILD_PUBLIC_ORIGIN: origin, DISCORD_CLIENT_ID: '189144401488693400',
    DISCORD_CLIENT_SECRET: 'test-key', RESEND_API_KEY: 'test-mail-key', GUILD_FROM_EMAIL: 'guild@example.com',
  }
  DB.prepare('INSERT INTO members(id,name,role) VALUES (?,?,?)').bind('existing','Tank','officer').run()
  DB.prepare('INSERT INTO guild_credentials VALUES (?,?,?,?)').bind('existing','tank@example.com','tank','unused').run()
  const send = (path, cookie, configuredEnv = env) =>
    app.fetch(new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} }), configuredEnv, {})
  assert.equal((await (await send('/api/auth/config')).json()).discord, true)
  assert.equal((await (await send('/api/auth/config', '', { ...env, DISCORD_CLIENT_SECRET: '' })).json()).discord, false)

  let authorization
  let profile = { id: '189144401488693410', email: 'tank@example.com', verified: true }
  const provider = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://discord.com/api/oauth2/token') {
      const verifier = options.body.get('code_verifier')
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
      assert.equal(Buffer.from(bytes).toString('base64url'), authorization.searchParams.get('code_challenge'))
      assert.equal(options.body.get('redirect_uri'), origin + '/api/auth/discord/callback')
      return Response.json({ access_token: 'test-discord-token' })
    }
    assert.equal(url, 'https://discord.com/api/v10/users/@me')
    assert.equal(options.headers.Authorization, 'Bearer test-discord-token')
    return Response.json(profile)
  })
  async function begin() {
    const start = await send('/api/auth/discord')
    assert.equal(start.status, 303)
    authorization = new URL(start.headers.get('Location'))
    assert.equal(authorization.searchParams.get('scope'), 'identify email')
    const cookie = start.headers.getSetCookie()[0]
    assert.match(cookie, /; Secure; HttpOnly; SameSite=Lax;/)
    const path = '/api/auth/discord/callback?code=discord-code&iss=https%3A%2F%2Fdiscord.com&state=' + authorization.searchParams.get('state')
    return { path, cookie: cookie.split(';')[0] }
  }

  let flow = await begin()
  assert.equal((await send(flow.path)).headers.get('Location'), '/#discord-expired')
  assert.equal(provider.mock.callCount(), 0)
  const success = await send(flow.path, flow.cookie)
  assert.equal(success.headers.get('Location'), '/')
  assert.equal(success.headers.getSetCookie().length, 2)
  const session = success.headers.getSetCookie()[1].split(';')[0]
  const signedIn = await (await send('/api/state', session)).json()
  assert.equal(signedIn.user.id, 'existing')
  assert.equal(signedIn.user.role, 'officer')
  assert.equal((await send(flow.path, flow.cookie)).headers.get('Location'), '/#discord-expired')

  profile = { ...profile, email: 'new-discord-address@example.com' }
  flow = await begin()
  assert.equal((await send(flow.path, flow.cookie)).headers.get('Location'), '/')
  profile = { id: '189144401488693411', email: 'tank@example.com', verified: true }
  flow = await begin()
  assert.equal((await send(flow.path, flow.cookie)).headers.get('Location'), '/#discord-account')
  profile = { ...profile, verified: false }
  flow = await begin()
  assert.equal((await send(flow.path, flow.cookie)).headers.get('Location'), '/#discord-account')
  DB.prepare("UPDATE members SET status='blocked' WHERE id='existing'").run()
  profile = { id: '189144401488693410', email: 'tank@example.com', verified: true }
  flow = await begin()
  assert.equal((await send(flow.path, flow.cookie)).headers.get('Location'), '/#discord-account')
})
