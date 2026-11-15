import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../dist/server/index.js'
import { integrationEnv } from '../dist/server/integration-config.js'
import { digest, randomToken } from '../dist/server/tokens.js'
import { openDatabase } from '../server/sqlite.js'

test('only active admins can configure integrations, and stored secrets stay out of responses', async t => {
  const DB = openDatabase(':memory:')
  t.after(() => DB.close())
  const origin = 'https://guild.example.com'
  const env = {
    DB, GUILD_PUBLIC_ORIGIN: origin, GUILD_IDENTITY_KEY: 'test-only-key',
    RESEND_API_KEY: 'test-mail-key', GUILD_FROM_EMAIL: 'guild@example.com',
    BATTLENET_CLIENT_ID: 'env-id', BATTLENET_CLIENT_SECRET: 'env-secret',
  }
  const sessions = {}
  for (const role of ['owner','admin','officer','member']) {
    DB.prepare('INSERT INTO members(id,name,role) VALUES (?,?,?)').bind(role,role,role).run()
    const token = randomToken()
    DB.prepare('INSERT INTO guild_sessions VALUES (?,?,?)').bind(await digest(token),role,Date.now()+60000).run()
    sessions[role] = '__Host-chipstuttarna=' + token
  }
  const send = (role, route, body, requestOrigin = origin) => app.fetch(new Request(origin + '/api/' + route,{
    method:body ? 'POST' : 'GET',
    headers:{Cookie:sessions[role] || '',Origin:requestOrigin,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined,
  }),env,{})
  const route = 'admin/integrations'
  assert.equal((await send('',route)).status,401)
  assert.equal((await send('officer',route)).status,403)
  assert.equal((await send('member',route,{id:'armory'})).status,403)
  const fields = (await (await send('owner',route)).json()).armory.fields
  assert.deepEqual(fields.BATTLENET_CLIENT_SECRET,{saved:true})
  assert.deepEqual(fields.BATTLENET_CLIENT_ID,{value:'env-id'})

  const armory = {
    id:'armory', enabled:true, revision:0,
    values:{BATTLENET_CLIENT_ID:'stored-id',BATTLENET_CLIENT_SECRET:'hidden-armory-secret'},
  }
  assert.equal((await send('admin',route,armory,'https://unrelated.example')).status,403)
  assert.equal((await send('admin',route,armory)).status,200)
  assert.equal((await send('owner',route,armory)).status,409)
  const payload = await (await send('owner',route)).text()
  assert.equal(payload.includes('hidden-armory-secret'),false)
  assert.equal(payload.includes('env-secret'),false)
  const row = DB.prepare("SELECT encrypted_config FROM guild_integrations WHERE provider='armory'").first()
  assert.equal(row.encrypted_config.includes('hidden-armory-secret'),false)
  assert.equal((await integrationEnv(env,'armory')).BATTLENET_CLIENT_SECRET,'hidden-armory-secret')
  assert.equal((await send('owner',route,{...armory,enabled:false,revision:1,values:{}})).status,200)
  assert.equal((await integrationEnv(env,'armory')).BATTLENET_CLIENT_ID,undefined)
  assert.equal((await send('owner',route,{...armory,revision:2,values:{}})).status,200)
  assert.equal((await integrationEnv(env,'armory')).BATTLENET_CLIENT_SECRET,'hidden-armory-secret')

  const discord = {
    id:'discord', enabled:true, revision:0,
    values:{
      DISCORD_CLIENT_ID:'189144401488693413', DISCORD_CLIENT_SECRET:'hidden-discord-secret',
      DISCORD_BOT_TOKEN:'hidden-bot-token', DISCORD_PUBLIC_KEY:'a'.repeat(64),
      DISCORD_GUILD_ID:'189144401488693411', DISCORD_CHANNEL_ID:'189144401488693412',
    },
  }
  assert.equal((await send('owner',route,discord)).status,200)
  assert.equal((await (await send('', 'auth/config')).json()).discord,true)
  const configured = (await (await send('admin',route)).json()).discord
  assert.deepEqual([configured.login,configured.notices,configured.signups],[true,true,true])
  assert.deepEqual(configured.fields.DISCORD_BOT_TOKEN,{saved:true})
  const audit = await (await send('owner','admin')).text()
  assert.equal(audit.includes('hidden-bot-token'),false)
  assert.equal(audit.includes('hidden-armory-secret'),false)
  assert.equal(audit.includes('integration_settings'),true)

  t.mock.method(globalThis,'fetch',async (url, options) => {
    if (url === 'https://oauth.battle.net/token') {
      assert.equal(options.headers.Authorization,'Basic '+btoa('stored-id:hidden-armory-secret'))
      return Response.json({access_token:'battle-token',expires_in:3600})
    }
    if (url.startsWith('https://eu.api.blizzard.com/')) {
      assert.match(url,/test-character\/equipment/)
      return Response.json({equipped_items:[{slot:{type:'HEAD'},item:{id:20},name:'Helmet'}]})
    }
    assert.equal(options.method,'GET')
    assert.equal(options.headers.Authorization,'Bot hidden-bot-token')
    return Response.json(url.endsWith('/applications/@me')
      ? {id:discord.values.DISCORD_CLIENT_ID,verify_key:discord.values.DISCORD_PUBLIC_KEY}
      : {guild_id:discord.values.DISCORD_GUILD_ID,type:0})
  })
  assert.match((await (await send('admin','admin/integration-test',{id:'armory',character:'Test Character'})).json()).message,/1\./)
  assert.match((await (await send('admin','admin/integration-test',{id:'discord'})).json()).message,/läsa kanalen/)
  assert.equal((await send('officer','admin/integration-test',{id:'discord'})).status,403)
})
