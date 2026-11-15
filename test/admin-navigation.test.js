import assert from 'node:assert/strict'
import test from 'node:test'

test('Admin loads Konton and switches to Integrationer and back', async t => {
  const nodes = new Map()
  const click = new Map()
  const requests = []
  const response = {
    '/api/auth/config': { native: true, mode: 'open' },
    '/api/state': { user: { id: 'owner', name: 'Testägare', role: 'owner' } },
    '/api/admin': { accounts: [], pending: [], mail_ready: true },
    '/api/admin/integrations': {
      can_save: true,
      armory: {
        enabled: true, revision: 0, equipment_api: true,
        fields: { BATTLENET_CLIENT_ID: { value: 'test-id' }, BATTLENET_CLIENT_SECRET: { saved: true } },
      },
      discord: {
        enabled: true, revision: 0,
        fields: {
          DISCORD_CLIENT_ID: { value: '' }, DISCORD_CLIENT_SECRET: { saved: false },
          DISCORD_BOT_TOKEN: { saved: false }, DISCORD_PUBLIC_KEY: { value: '' },
          DISCORD_GUILD_ID: { value: '' }, DISCORD_CHANNEL_ID: { value: '' },
        },
      },
    },
  }
  t.mock.method(globalThis, 'fetch', async path => {
    requests.push(path)
    assert.ok(Object.hasOwn(response, path), 'Unexpected request: ' + path)
    return Response.json(response[path])
  })
  const globals = {
    document: {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { addEventListener() {} })
        return nodes.get(selector)
      },
      addEventListener(event, handler) { click.set(event, handler) },
    },
    window: { addEventListener() {} },
    location: { hash: '#admin', pathname: '/' },
  }
  for (const [key, value] of Object.entries(globals)) {
    globalThis[key] = value
    t.after(() => { delete globalThis[key] })
  }

  await import('../ui/app.js')
  const main = nodes.get('#main')
  assert.match(main.innerHTML, /<h3>Konton<\/h3>/)
  assert.match(main.innerHTML, /data-action="admin-section\/integrations"/)
  async function navigate(section) {
    await click.get('click')({ target: { closest: () => ({
      dataset: { action: 'admin-section/' + section },
    }) } })
  }
  await navigate('integrations')
  assert.match(main.innerHTML, /<h3>WoW Forever Armory<\/h3>/)
  assert.match(main.innerHTML, /<h3>Discord<\/h3>/)
  assert.match(main.innerHTML, /data-form="integration-test\/armory"/)
  await navigate('accounts')
  assert.match(main.innerHTML, /<h3>Konton<\/h3>/)
  assert.deepEqual(requests,['/api/auth/config','/api/state','/api/admin','/api/admin/integrations','/api/admin'])
})
