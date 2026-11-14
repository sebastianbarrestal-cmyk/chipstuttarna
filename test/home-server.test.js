import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import test from 'node:test'
import { createHttpServer } from '../server/http.js'
import { openDatabase } from '../server/sqlite.js'

test('SQLite batches roll back together on failure', () => {
  const db = openDatabase(':memory:')
  try {
    db.prepare('CREATE TABLE example (id INTEGER PRIMARY KEY)').run()
    assert.throws(() => db.batch([
      db.prepare('INSERT INTO example VALUES (1)'),
      db.prepare('INSERT INTO example VALUES (1)'),
    ]), /UNIQUE constraint failed/)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM example').first().count, 0)
  } finally {
    db.close()
  }
})

test('home server verifies a guild account and keeps data across restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'chipstuttarna-'))
  let instance
  t.after(async () => {
    try {
      await instance?.stop()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  const realFetch = globalThis.fetch
  const mail = []
  t.mock.method(globalThis, 'fetch', (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails')
    mail.push(JSON.parse(init.body))
    return Promise.resolve(new Response(null, { status: 200 }))
  })
  const origin = 'https://guild.example.com'
  const email = 'owner@example.com'
  async function start() {
    const db = openDatabase(join(directory, 'guild.sqlite'))
    const { server, close } = createHttpServer({
      DB: db,
      GUILD_PUBLIC_ORIGIN: origin,
      GUILD_IDENTITY_KEY: 'test-only-private-key',
      GUILD_OWNER_EMAIL: email,
      GUILD_FROM_EMAIL: 'guild@example.com',
      RESEND_API_KEY: 'test-only-mail-key',
    }, { trustCaddy: true })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = 'http://127.0.0.1:' + server.address().port
    return {
      get: (path, headers) => realFetch(address + path, { headers }),
      post: (path, body, headers) => realFetch(address + path, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
      async stop() {
        await close()
        db.close()
      },
    }
  }

  instance = await start()
  assert.equal((await instance.get('/')).status, 200)
  assert.deepEqual(await (await instance.get('/api/auth/config')).json(), { native: true, mode: 'open' })
  assert.equal((await instance.get('/api/admin', { 'oai-authenticated-user-email': email })).status, 401)
  const password = 'test-password-with-12-chars'
  const registration = { email, username: 'Barrebus', password }
  assert.equal((await instance.post('/api/auth/register', registration, { Origin: 'https://elsewhere.example' })).status, 403)
  assert.equal((await instance.post('/api/auth/register', { payload: 'x'.repeat(65_536) })).status, 413)
  assert.equal((await instance.post('/api/auth/register', registration)).status, 200)
  assert.deepEqual(mail[0].to, [email])
  assert.ok(mail[0].text.includes(origin + '/#verify-account/'))
  const token = mail[0].text.match(/verify-account\/([a-f0-9]{64})/)[1]
  assert.equal((await instance.post('/api/auth/verify', { token, password })).status, 200)
  const login = await instance.post('/api/auth/login', { login: 'Barrebus', password })
  assert.equal(login.status, 200)
  const [cookie] = login.headers.getSetCookie()
  assert.match(cookie, /^__Host-chipstuttarna=.*; Secure; HttpOnly;/)
  const signedIn = { Cookie: cookie.split(';')[0] }
  const admin = await instance.get('/api/admin', signedIn)
  assert.equal(admin.status, 200)
  assert.equal((await admin.json()).accounts[0].role, 'owner')
  assert.equal((await instance.post('/api/registration-mode', { mode: 'invite' }, signedIn)).status, 200)
  assert.equal((await instance.post('/api/event', {
    title: 'Dungeon-test', description: '', kind: 'dungeon',
    starts_at: Date.now() + 3_600_000, capacity: 5, tank_slots: 1, healer_slots: 1,
  }, signedIn)).status, 200)

  await instance.stop()
  instance = undefined
  instance = await start()
  const state = await instance.get('/api/state', signedIn)
  assert.equal(state.status, 200)
  assert.equal((await state.json()).events[0].title, 'Dungeon-test')
  assert.equal((await (await instance.get('/api/admin', signedIn)).json()).history[0].action, 'registration_mode')
})
