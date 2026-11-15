import { btn, e, field, input, form, submit, show } from './components.js'
import { nativeLogin, discordLogin } from './model.js'

function discordButton() {
  return discordLogin ? '<a class="btn discord-login" href="/api/auth/discord" target="_top">Logga in med Discord</a>' : ''
}

function accountForm(kind,token = '') {
  const email = field('E-postadress',input('email','','type="email" required maxlength="254" autocomplete="email"'))
  const password = (label, attrs) => field(label,input('password','','type="password" required maxlength="256" ' + attrs))
  const newSecret = password('Lösenord (minst 12 tecken)','minlength="12" autocomplete="new-password"')
  const code = '<input type="hidden" name="token" value="' + e(token) + '">'
  const forms = {
    register:['Skapa konto',field('Användarnamn',input('username','','required minlength="3" maxlength="32" autocomplete="username"')) +
      email + newSecret,'Skicka verifieringsmejl'],
    login:['Logga in',field('Användarnamn eller e-post',input('login','','required maxlength="254" autocomplete="username"')) +
      password('Lösenord','autocomplete="current-password"'),'Logga in',btn('Glömt lösenordet?','auth-forgot')],
    forgot:['Återställ lösenord',email,'Skicka återställningsmejl'],
    verify:['Verifiera e-postadress',code + '<p class="hint">Bekräfta med lösenordet du valde vid registreringen.</p>' +
      password('Lösenord','autocomplete="current-password"'),'Aktivera konto'],
    reset:['Välj nytt lösenord',code + newSecret,'Spara nytt lösenord'],
  }
  const [title,fields,label,secondary = ''] = forms[kind]
  show(title,form('auth-'+kind,fields,submit(label) + secondary + (kind === 'login' ? discordButton() : '')))
}

function showAccountLink() {
  if (!nativeLogin) return
  const match = /^#(verify-account|reset-password)\/([a-f0-9]{64})$/.exec(location.hash)
  if (match) accountForm(match[1] === 'verify-account' ? 'verify' : 'reset',match[2])
}

function showDiscordLoginResult() {
  const discordMessage = new Map([
    ['#discord-expired', 'Discord-inloggningen har gått ut. Försök igen.'],
    ['#discord-cancelled', 'Discord-inloggningen avbröts.'],
    ['#discord-account', 'Första gången krävs samma verifierade e-postadress i Discord som på ett aktivt guildkonto.'],
    ['#discord-unavailable', 'Discord-inloggningen är tillfälligt otillgänglig. Försök igen eller använd lösenordet.'],
  ]).get(location.hash)
  if (discordMessage) {
    history.replaceState(null,'',location.pathname)
    show('Logga in med Discord', '<p>' + e(discordMessage) + '</p>' + btn('Logga in med lösenord','auth-login'))
  }
}

export { accountForm, discordButton, showAccountLink, showDiscordLoginResult }
