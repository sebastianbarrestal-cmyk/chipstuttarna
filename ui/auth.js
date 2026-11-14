import { btn, e, field, input, form, submit, show } from './components.js'
import { nativeLogin } from './model.js'

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
  show(title,form('auth-'+kind,fields,submit(label) + secondary))
}

function showAccountLink() {
  if (!nativeLogin) return
  const match = /^#(verify-account|reset-password)\/([a-f0-9]{64})$/.exec(location.hash)
  if (match) accountForm(match[1] === 'verify-account' ? 'verify' : 'reset',match[2])
}

export { accountForm, showAccountLink }
