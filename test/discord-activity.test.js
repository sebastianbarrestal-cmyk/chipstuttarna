import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import app from '../dist/server/index.js'
import { changeEvent } from '../dist/server/events.js'
import { changePoll } from '../dist/server/polls.js'
import { runDiscordJobs } from '../dist/server/discord-notices.js'
import { openDatabase } from '../server/sqlite.js'

test('Discord announces events and records signed RSVPs in the guild signup list', async t => {
  const DB = openDatabase(':memory:')
  t.after(() => DB.close())
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
  const discordUser = '189144401488693410'
  const env = {
    DB, GUILD_PUBLIC_ORIGIN: 'https://guild.example.com', DISCORD_BOT_TOKEN: 'bot-key',
    DISCORD_PUBLIC_KEY: key, DISCORD_GUILD_ID: '189144401488693411', DISCORD_CHANNEL_ID: '189144401488693412',
    DISCORD_CLIENT_ID: '189144401488693413', DISCORD_JOB_SECRET: 'example-job-secret-at-least-32-characters',
  }
  const member = { id: 'existing', role: 'officer' }
  DB.prepare('INSERT INTO members(id,name,role) VALUES (?,?,?)').bind(member.id,'Tank',member.role).run()
  DB.prepare('INSERT INTO guild_credentials VALUES (?,?,?,?)').bind(member.id,'tank@example.com','tank','unused').run()
  DB.prepare('INSERT INTO guild_discord_links VALUES (?,?)').bind(discordUser,member.id).run()
  const character = crypto.randomUUID()
  DB.prepare('INSERT INTO characters (id,member_id,name,class,role,armory_url) VALUES (?,?,?,?,?,?)').bind(
    character, member.id, 'Dungeon Tank', 'Warrior', 'Tank',
    'https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory/character/dungeon-tank',
  ).run()
  let sendStatus = 200
  const posted = []
  const replies = []
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    if (request.method === 'POST') {
      assert.equal(url,'https://discord.com/api/v10/channels/' + env.DISCORD_CHANNEL_ID + '/messages')
      assert.equal(request.headers.Authorization, 'Bot bot-key')
      posted.push(JSON.parse(request.body))
      return new Response(null,{status:sendStatus})
    }
    assert.match(url, /\/messages\/@original$/)
    replies.push(JSON.parse(request.body))
    return new Response(null,{status:200})
  })

  const starts = Date.now()+35*60_000
  await changeEvent(DB, member,{ title:'Dungeon @everyone', description:'', kind:'dungeon', starts_at:starts, capacity:5 },'/api/event',env)
  const event = DB.prepare('SELECT id FROM events').first().id
  const poll = {question:'Öppen fråga?',description:'', options:['Ja','Nej']}
  await changePoll(DB,member,poll,'/api/poll-create',env)
  await changePoll(DB,member,{...poll,restricted:true,invites:[member.id]},'/api/poll-create',env)
  const concurrent = await Promise.all([runDiscordJobs(env),runDiscordJobs(env)])
  assert.equal(concurrent[0].sent + concurrent[1].sent, 2)
  assert.equal(posted.length,2)
  const announcement = posted.find(x=>x.content.includes('Nytt speltillfälle'))
  assert.deepEqual(announcement.allowed_mentions, {parse:[]})
  assert.match(announcement.components[0].components[0].custom_id, /^rsvp:yes:/)
  assert.match(announcement.components[0].components.at(-1).url, new RegExp(event+'$'))
  assert.equal(posted.filter(x=>x.content.includes('omröstning')).length,1)

  let interactionCount = 1
  const interactionRequest = async (data, valid = true, older = 0) => {
    const raw = JSON.stringify(data)
    const timestamp = String(Math.floor(Date.now()/1000) - older)
    const signature = valid ? sign(null,Buffer.from(timestamp+raw),privateKey).toString('hex') : '0'.repeat(128)
    const request = new Request(env.GUILD_PUBLIC_ORIGIN+'/api/discord/interactions',{
      method:'POST',headers:{'X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':signature},body:raw,
    })
    const work = []
    const response = await app.fetch(request,env,{waitUntil:task=>work.push(task)})
    await Promise.all(work)
    return response
  }
  const makeInteraction = (custom_id, values) => ({
    id:'18914440148869' + String(interactionCount++).padStart(4,'0'), type:3, guild_id:env.DISCORD_GUILD_ID,
    application_id:env.DISCORD_CLIENT_ID, member:{user:{id:discordUser}}, token:'short-interaction-token',
    data:{custom_id, values},
  })
  assert.equal((await interactionRequest({type:1},false)).status,401)
  assert.equal((await interactionRequest({type:1},true,360)).status,401)
  assert.deepEqual(await (await interactionRequest({type:1})).json(),{type:1})
  const denied = {...makeInteraction('rsvp:yes:'+event),guild_id:'189144401488699999'}
  assert.equal((await interactionRequest(denied)).status,403)
  const choose = await interactionRequest(makeInteraction('rsvp:yes:'+event))
  assert.deepEqual(await choose.json(),{type:5,data:{flags:64}})
  const select = replies.at(-1).components[0].components[0]
  assert.equal(select.options[0].value,character)
  await interactionRequest(makeInteraction(select.custom_id,[character]))
  const roles = replies.at(-1).components[0].components
  const selected = makeInteraction(roles.find(role=>role.label==='Healer').custom_id)
  await interactionRequest(selected)
  const signup = DB.prepare('SELECT character_id,role,status FROM signups WHERE event_id=?').bind(event).first()
  assert.deepEqual({...signup},{character_id:character,role:'Healer',status:'yes'})
  const numberOfReplies = replies.length
  await interactionRequest(selected)
  assert.equal(replies.length,numberOfReplies)
  await interactionRequest(makeInteraction('rsvp:no:'+event))
  assert.equal(DB.prepare('SELECT status FROM signups').first().status,'no')

  const reminderTime=starts-25*60_000
  assert.equal((await runDiscordJobs(env,reminderTime)).sent,1)
  assert.match(posted.at(-1).content,/Påminnelse/)
  assert.equal((await runDiscordJobs(env,reminderTime+60_000)).sent,0)
  await changeEvent(DB,member,{id:event},'/api/cancel',env)
  sendStatus = 429
  assert.equal((await runDiscordJobs(env)).failed,1)
  sendStatus = 200
  assert.equal((await runDiscordJobs(env,Date.now()+3*60_000)).sent,1)
  assert.match(posted.at(-1).content,/Inställt/)
  await interactionRequest(makeInteraction('rsvp:maybe:'+event))
  assert.equal(replies.at(-1).content,'Anmälan är stängd.')
  const jobsUrl = env.GUILD_PUBLIC_ORIGIN+'/api/discord/jobs'
  assert.equal((await app.fetch(new Request(jobsUrl,{method:'POST'}),env,{})).status,401)
  const jobs = await app.fetch(new Request(jobsUrl,{method:'POST',headers:{Authorization:'Bearer '+env.DISCORD_JOB_SECRET}}),env,{})
  assert.equal(jobs.status,200)
})
