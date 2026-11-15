import { nativeAccounts } from './accounts.js'
import { hasBattleNetCredentials } from './armory.js'
import { discordConfig, callbackPath } from './discord.js'
import { discordBot, snowflake } from './discord-api.js'
import { interactionsPath } from './discord-interactions.js'
import { requireValue } from './http.js'

const integrationFields = {
  armory: {
    BATTLENET_CLIENT_ID: /^[a-zA-Z0-9_-]{1,128}$/,
    BATTLENET_CLIENT_SECRET: /^[!-~]{1,256}$/,
  },
  discord: {
    DISCORD_CLIENT_ID: snowflake,
    DISCORD_CLIENT_SECRET: /^[!-~]{1,256}$/,
    DISCORD_BOT_TOKEN: /^[!-~]{1,256}$/,
    DISCORD_PUBLIC_KEY: /^[a-fA-F0-9]{64}$/,
    DISCORD_GUILD_ID: snowflake,
    DISCORD_CHANNEL_ID: snowflake,
  },
}

const hiddenFields = new Set(['BATTLENET_CLIENT_SECRET','DISCORD_CLIENT_SECRET','DISCORD_BOT_TOKEN'])
const hostedOrigin = 'https://chipstuttarna.sebastian-barrestal.chatgpt.site'
const encoding = new TextEncoder()
const decoding = new TextDecoder()

async function encryptionKey(env) {
  requireValue(env.GUILD_IDENTITY_KEY, 'Serverns identitetsnyckel saknas.', 503)
  const root = await crypto.subtle.importKey('raw', encoding.encode(env.GUILD_IDENTITY_KEY), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({
    name:'HKDF', hash:'SHA-256', salt:encoding.encode('chipstuttarna.integrations.v1'),
    info:encoding.encode('settings.encryption'),
  }, root, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt'])
}

async function seal(env, provider, config) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({
    name:'AES-GCM', iv, additionalData:encoding.encode(provider),
  }, await encryptionKey(env), encoding.encode(JSON.stringify(config)))
  return Buffer.concat([iv, new Uint8Array(encrypted)]).toString('base64')
}

async function open(env, provider, encrypted) {
  try {
    const bytes = Buffer.from(encrypted,'base64')
    const decrypted = await crypto.subtle.decrypt({
      name:'AES-GCM', iv:bytes.subarray(0,12), additionalData:encoding.encode(provider),
    }, await encryptionKey(env), bytes.subarray(12))
    return JSON.parse(decoding.decode(decrypted))
  } catch {
    requireValue(false, 'De sparade inställningarna kan inte läsas med serverns identitetsnyckel.', 503)
  }
}

async function storedIntegration(env, provider) {
  const row = await env.DB.prepare('SELECT encrypted_config, revision FROM guild_integrations WHERE provider=?').bind(provider).first()
  return { config: row ? await open(env,provider,row.encrypted_config) : {enabled:true,values:{}}, revision: row?.revision ?? 0 }
}

function applyIntegration(env, provider, config) {
  const effective = { ...env, GUILD_PUBLIC_ORIGIN: env.GUILD_PUBLIC_ORIGIN || hostedOrigin }
  for (const key of Object.keys(integrationFields[provider])) {
    effective[key] = config.enabled ? config.values[key] ?? env[key] : undefined
  }
  return effective
}

async function integrationEnv(env, provider) {
  const { config } = await storedIntegration(env, provider)
  return applyIntegration(env,provider,config)
}

async function readIntegrations(env) {
  const providers = await Promise.all(Object.keys(integrationFields).map(async provider => {
    const { config, revision } = await storedIntegration(env,provider)
    const effective = applyIntegration(env,provider,config)
    const fields = Object.fromEntries(Object.keys(integrationFields[provider]).map(key => {
      const value = config.values[key] ?? env[key] ?? ''
      return [key, hiddenFields.has(key) ? {saved:Boolean(value)} : {value}]
    }))
    const status = provider === 'armory'
      ? { equipment_api: hasBattleNetCredentials(effective) }
      : {
          login: Boolean(discordConfig(effective)),
          notices: Boolean(discordBot(effective)),
          signups: Boolean(discordBot(effective) && snowflake.test(effective.DISCORD_CLIENT_ID ?? '') &&
            integrationFields.discord.DISCORD_PUBLIC_KEY.test(effective.DISCORD_PUBLIC_KEY ?? '')),
        }
    return [provider,{enabled:config.enabled, fields, revision, ...status}]
  }))
  const origin = URL.parse(env.GUILD_PUBLIC_ORIGIN || hostedOrigin)?.origin
  return { ...Object.fromEntries(providers), can_save:Boolean(env.GUILD_IDENTITY_KEY), mail_ready:nativeAccounts(env),
    discord_callback:origin + callbackPath, discord_interactions:origin + interactionsPath }
}

async function saveIntegration(env, actor, body) {
  const provider = body.id
  requireValue(Object.hasOwn(integrationFields,provider), 'Välj en integration.')
  const { config, revision } = await storedIntegration(env,provider)
  requireValue(typeof body.enabled === 'boolean' && body.revision === revision &&
    body.values && typeof body.values === 'object' && !Array.isArray(body.values), 'Ladda om inställningarna och försök igen.', 409)
  const values = { ...config.values }
  for (const [key, pattern] of Object.entries(integrationFields[provider])) {
    const raw = body.values[key] ?? ''
    requireValue(typeof raw === 'string' && raw.length <= 256, 'Kontrollera fältens längd.')
    const value = raw.trim()
    if (!value) continue
    requireValue(pattern.test(value), 'Kontrollera värdet i ' + key + '.')
    values[key] = value
  }
  const encrypted = await seal(env,provider,{enabled:body.enabled,values})
  const next = revision + 1
  const [saved] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO guild_integrations(provider, encrypted_config, revision)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM members WHERE id=? AND status='active' AND role IN ('admin','owner'))
      ON CONFLICT(provider) DO UPDATE SET encrypted_config=excluded.encrypted_config, revision=excluded.revision
      WHERE guild_integrations.revision=?`).bind(provider,encrypted,next,actor.id,revision),
    env.DB.prepare(`INSERT INTO admin_audit(recorded_at,actor_name,action,target,detail)
      SELECT ?,?,'integration_settings',?,? WHERE changes()>0`)
      .bind(Date.now(),actor.name,provider === 'armory' ? 'Armory' : 'Discord',body.enabled ? 'Aktiverad' : 'Avstängd'),
  ])
  requireValue(saved.meta.changes, 'Inställningarna ändrades. Ladda om sidan och försök igen.', 409)
}

export { integrationEnv, readIntegrations, saveIntegration }
