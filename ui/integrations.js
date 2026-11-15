import { e, field, form, input, select, submit } from './components.js'

function status(label, ready) {
  return '<li><span>' + label + '</span><b>' + (ready ? 'Konfigurerad' : 'Ej konfigurerad') + '</b></li>'
}

function settingsField(settings, key, label) {
  const current = settings.fields[key]
  if ('saved' in current) {
    return field(label + (current.saved ? ' · Sparad' : ''), input(key,'',
      'type="password" maxlength="256" autocomplete="new-password" spellcheck="false"'))
  }
  return field(label,input(key,current.value,'maxlength="128" autocomplete="off" spellcheck="false"'))
}

function settingsForm(settings, provider, specs) {
  const fields = field('Status',select('enabled',[['1','Aktiverad'],['0','Avstängd']],settings.enabled ? '1' : '0')) +
    specs.map(([key,label]) => settingsField(settings,key,label)).join('') +
    '<input name="revision" type="hidden" value="' + settings.revision + '">'
  return form('integration-save/' + provider,fields,submit('Spara inställningar'))
}

function integrationsPage(data) {
  if (!data.can_save) return '<section class="card"><p>Serverns identitetsnyckel behövs för att kunna spara integrationer.</p></section>'
  return '<p class="hint">Tomma fält behåller sina tidigare värden. Sparade hemligheter visas aldrig i formuläret.</p>' +
    '<div class="grid admin-grid"><section class="card"><h3>WoW Forever Armory</h3><ul class="stats">' +
    status('Battle.net API',data.armory.equipment_api) + '</ul>' +
    settingsForm(data.armory,'armory',[
      ['BATTLENET_CLIENT_ID','Client ID'],
      ['BATTLENET_CLIENT_SECRET','Client Secret'],
    ]) + '<p class="hint section">När Battle.net API är avstängt försöker sidan läsa den offentliga Armory-profilen.</p>' +
    (data.armory.equipment_api ? form('integration-test/armory',
      field('EU-karaktärens för- och efternamn',input('character','','required maxlength="55" placeholder="Meathead Peet"')) +
      '<p data-integration-result role="status" hidden></p>',submit('Testa Armory')) : '') +
    '</section><section class="card"><h3>Discord</h3><ul class="stats">' +
    status('Inloggning',data.discord.login) + status('Notiser',data.discord.notices) +
    status('Anmälningar',data.discord.signups) + '</ul>' +
    (!data.mail_ready ? '<p class="hint">Discord-inloggning kräver guildens verifieringsmejl.</p>' : '') +
    settingsForm(data.discord,'discord',[
      ['DISCORD_CLIENT_ID','Application ID / Client ID'],
      ['DISCORD_CLIENT_SECRET','Client Secret'],
      ['DISCORD_BOT_TOKEN','Bottoken'],
      ['DISCORD_PUBLIC_KEY','Publik nyckel'],
      ['DISCORD_GUILD_ID','Discord-serverns ID'],
      ['DISCORD_CHANNEL_ID','Notiskanalens ID'],
    ]) +
    (data.discord.notices ? '<div class="section">' + form('integration-test/discord',
      '<p data-integration-result role="status" hidden></p>',submit('Testa bot och kanal')) + '</div>' : '') +
    '<div class="section"><h3>Adresser i Discord Developer Portal</h3><p>OAuth2 Redirect URL<br><code class="integration-url">' +
    e(data.discord_callback) + '</code></p><p>Interactions Endpoint URL<br><code class="integration-url">' +
    e(data.discord_interactions) + '</code></p><a class="link" href="https://discord.com/developers/applications" target="_blank" rel="noopener">Öppna Discord Developer Portal ↗</a>' +
    '</div></section></div>'
}

export { integrationsPage }
