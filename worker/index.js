import { assets } from './data.js'
import { json, requireValue, requestJson } from './http.js'
import { editorRoles } from './roles.js'
import { authApi, nativeAccounts } from './accounts.js'
import { accountSession } from './sessions.js'
import { discordAuth, discordConfig, startPath, callbackPath } from './discord.js'
import { discordInteractions, interactionsPath } from './discord-interactions.js'
import { discordJobRequest, jobPath, runDiscordJobs } from './discord-notices.js'
import { discordBot } from './discord-api.js'
import { guildIdentity } from './identity.js'
import { adminGate, readAdmin, administer } from './admin.js'
import { readPolls, changePoll } from './polls.js'
import { readState } from './state.js'
import { saveProfile } from './profile.js'
import { readStatistics } from './statistics.js'
import { changeCharacter } from './characters.js'
import { integrationEnv, readIntegrations, saveIntegration } from './integration-config.js'
import { testIntegration } from './integration-check.js'
import { changeEvent } from './events.js'

function sendPendingDiscordNotices(env, context) {
  if (discordBot(env)) context.waitUntil(runDiscordJobs(env).catch(() => console.error('Discord-kön kunde inte bearbetas.')))
}

async function api(request, env, path, context) {
  if (path === interactionsPath || path === jobPath || path === startPath || path === callbackPath ||
      ['/api/auth/config','/api/event','/api/cancel','/api/poll-create'].includes(path)) {
    env = await integrationEnv(env,'discord')
  }
  if (path === interactionsPath) return discordInteractions(request,env,context)
  if (path === jobPath) return discordJobRequest(request,env)
  if (path === startPath || path === callbackPath) return discordAuth(request,env,path)
  if (request.method === 'GET' && path === '/api/auth/config') {
    return json({
      native: nativeAccounts(env),
      discord: Boolean(discordConfig(env)),
      mode: (await env.DB.prepare('SELECT mode FROM registration_settings WHERE id=1').first())?.mode ?? 'open',
    })
  }
  if (path.startsWith('/api/auth/')) return authApi(request,env,path)
  const db = env.DB
  requireValue(db, 'Databasen är inte tillgänglig just nu.', 503)
  const useNative = nativeAccounts(env)
  const identity = useNative ? null : await guildIdentity(request,env)
  const owner = identity?.email === env.GUILD_OWNER_EMAIL?.trim().toLowerCase()
  const member = useNative ? await accountSession(db,request) : await db.prepare(
    'SELECT id, name, role, status FROM members WHERE id IN (?, ?) ORDER BY id = ? DESC LIMIT 1')
    .bind(identity.id, identity.platformId, identity.id).first()
  if (useNative) requireValue(member,'Logga in för att öppna guildsidan.',401)
  const id = member?.id ?? identity?.id
  requireValue(!member || member.status === 'active', 'Ditt konto har inte längre åtkomst till guilden.', 403)

  if (request.method === 'GET' && path === '/api/officers/poll-results') {
    requireValue(editorRoles.includes(member?.role),'Vyn är för officerare och admins.',403)
    const params = new URL(request.url).searchParams
    const time = params.get('before')
    const id = params.get('id')
    requireValue(time===null || (/^[0-9]{1,15}$/.test(time) && id?.length<=64),'Ogiltig sidmarkör.')
    return readPolls(db,member,true,time===null?null:{time:Number(time),id})
  }
  if (request.method === 'GET' && path === '/api/polls') {
    requireValue(member,'Skapa ditt guildkonto först.',403)
    return readPolls(db,member)
  }
  if (request.method === 'GET' && path === '/api/admin') {
    adminGate(member)
    return readAdmin(db,env)
  }
  if (path === '/api/admin/integrations') {
    adminGate(member)
    if (request.method === 'GET') return json(await readIntegrations(env))
    const body = await requestJson(request)
    await saveIntegration(env,member,body)
    return json({ok:true})
  }
  if (path === '/api/admin/integration-test') {
    adminGate(member)
    return json(await testIntegration(env,await requestJson(request)))
  }
  const statistics = await readStatistics(request,db,member,id,path,context)
  if (statistics) return statistics
  if (request.method === 'GET' && path === '/api/state') {
    return json(member ? await readState(db, member) : { onboarding: true })
  }
  const body = await requestJson(request)

  if (path === '/api/profile') return saveProfile(db,member,identity,owner,id,body)
  requireValue(member, 'Skapa din guildprofil först.', 403)

  if (['/api/poll-create','/api/poll-edit','/api/poll-close','/api/poll-vote'].includes(path)) {
    const response = await changePoll(db,member,body,path,env)
    if (path === '/api/poll-create') sendPendingDiscordNotices(env,context)
    return response
  }
  if (path === '/api/armory') return changeCharacter(await integrationEnv(env,'armory'),member,body,path)
  if (['/api/character','/api/character/remove'].includes(path)) return changeCharacter(env,member,body,path)
  if (['/api/event','/api/signup','/api/cancel','/api/attendance'].includes(path)) {
    const response = await changeEvent(db,member,body,path,env)
    if (path === '/api/event' || path === '/api/cancel') sendPendingDiscordNotices(env,context)
    return response
  }
  if (['/api/registration-mode','/api/registration-email','/api/account-reset','/api/official-settings',
    '/api/permissions','/api/account-status'].includes(path)) return administer(request,env,member,body,path)
  return json({error:'Sidan finns inte.'},404)
}

export default {
  scheduled(_event, env, context) {
    context.waitUntil(integrationEnv(env,'discord').then(runDiscordJobs))
  },
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname
    if (path.startsWith('/api/')) {
      try {
        return await api(request, env, path, context)
      } catch (error) {
        if (!error.status) console.error(error.message)
        return json({ error: error.status ? error.message : 'Något gick fel. Försök igen.' }, error.status || 500)
      }
    }
    const asset = assets[path]
    if (!asset || !['GET', 'HEAD'].includes(request.method)) return new Response('Sidan finns inte.', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : asset.binary ? Uint8Array.from(atob(asset.body), char => char.charCodeAt(0)) : asset.body, {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control': asset.binary ? 'public, max-age=3600' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; form-action 'self'; object-src 'none'",
      },
    })
  },
}
