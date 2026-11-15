import { integrationEnv } from './integration-config.js'
import { fetchBattleNetEquipment, hasBattleNetCredentials } from './armory.js'
import { generatedArmoryUrl } from './armory-links.js'
import { discordBot, discordRequest, snowflake } from './discord-api.js'
import { bounded, requireValue } from './http.js'

async function checkArmory(env, body) {
  requireValue(hasBattleNetCredentials(env), 'Aktivera Battle.net API och spara båda nycklarna först.')
  const url = generatedArmoryUrl(bounded(body.character,55).normalize('NFC').replace(/\s+/g,' '))
  try {
    const items = await fetchBattleNetEquipment(env,url)
    return { message: 'Armory svarade. Antal utrustade föremål: ' + items.length + '.' }
  } catch (error) {
    const messages = {
      api_auth:'Battle.net nekade API-åtkomst. Kontrollera nycklarna och åtkomsten till Forever-profilen.',
      not_found:'Profilen hittades inte. Testa med en EU-karaktär som syns i WoW Forever Armory.',
      rate_limited:'Battle.net begränsar anrop just nu. Försök igen om en stund.',
      format:'Armory svarade i ett format som guildsidan inte kunde läsa.',
    }
    requireValue(false,messages[error.armoryStatus] ?? 'Det gick inte att hämta utrustning från Battle.net.',502)
  }
}

async function checkDiscord(env) {
  const bot = discordBot(env)
  requireValue(bot, 'Aktivera Discord och spara bottoken, server-ID och kanal-ID först.')
  let appResponse, channelResponse
  try {
    [appResponse,channelResponse] = await Promise.all([
      discordRequest('/applications/@me','GET',undefined,bot.token),
      discordRequest('/channels/' + bot.channel,'GET',undefined,bot.token),
    ])
  } catch {
    requireValue(false,'Kunde inte nå Discord. Försök igen om en stund.',502)
  }
  requireValue(appResponse.ok,'Discord accepterade inte bottoken eller kunde inte läsa applikationen.',502)
  requireValue(channelResponse.ok,'Boten kunde inte läsa kanalen. Kontrollera kanal-ID och att boten får se kanalen.',502)
  const [app,channel] = await Promise.all([appResponse.json(),channelResponse.json()])
  requireValue(channel.guild_id === bot.guild && [0,5].includes(channel.type),
    'Välj en textkanal eller aviseringskanal på den angivna Discord-servern.',400)
  if (snowflake.test(env.DISCORD_CLIENT_ID ?? '')) {
    requireValue(app.id === env.DISCORD_CLIENT_ID, 'Discords klient-ID och bottoken tillhör olika applikationer.')
  }
  if (env.DISCORD_PUBLIC_KEY) {
    requireValue(app.verify_key?.toLowerCase() === env.DISCORD_PUBLIC_KEY.toLowerCase(),
      'Den publika nyckeln tillhör en annan Discord-applikation.')
  }
  return { message:'Discord bekräftade boten och att den kan läsa kanalen. Testet skickade inget meddelande.' }
}

async function testIntegration(env, body) {
  requireValue(['armory','discord'].includes(body.id),'Välj en integration.')
  const effective = await integrationEnv(env,body.id)
  return body.id === 'armory' ? checkArmory(effective,body) : checkDiscord(effective)
}

export { testIntegration }
