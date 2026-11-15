import { e, initials, icon, roleName, fullDate, btn, field, input, select, form, submit, show } from './components.js'
import { integrationsPage } from './integrations.js'
import { state, demo, administrator, adminData, adminSection, accountSearch } from './model.js'

function canManageMember(member) {
  return administrator() && state.user.id !== member.id && member.role !== 'owner' &&
    (member.role !== 'admin' || state.user.role === 'owner') && member.status !== 'removed'
}

function memberRows(members, manage = false) {
  const statusLabels = {blocked:'Blockerat',removed:'Borttaget'}
  return members.length ? members.map(member => '<div class="row"><div class="left"><span class="avatar">' + e(initials(member.name)) +
    '</span><div><strong>' + e(member.name) + '</strong>' + (statusLabels[member.status] ? '<small>' + statusLabels[member.status] + '</small>' : '') +
    (manage ? '<small>' + (member.email ? e(member.email) + ' · Verifierad' : 'Äldre konto · Ingen verifierad e-post kopplad') +
      (member.username ? ' · @' + e(member.username) : '') + '</small>' : '') +
    '</div></div><div class="right"><span class="tag neutral">' + roleName[member.role] + '</span>' +
    (manage && canManageMember(member) ? btn('Hantera','permissions/'+member.id) : '') + '</div></div>').join('') :
    '<p class="kicker">Här visas medlemmar när de har skapat sina konton.</p>'
}

function membersPage() {
  const members = (state.members || []).filter(member => member.status === 'active')
  return '<div class="page-head"><div><h1>Guilden</h1></div>' + (demo ? '' : btn('Mitt namn','profile')) +
    '</div><section class="card member-table">' + memberRows(members) + '</section>'
}

const adminSections = {accounts:'Konton',registration:'Registrering',official:'Officiella tillfällen',integrations:'Integrationer',history:'Historik'}
const registrationLabels = {open:'Öppen',invite:'Endast inbjudna',paused:'Pausad'}
const activityLabels = {role:'Ändrade roll',account_status:'Ändrade kontostatus',password_reset:'Skickade lösenordsåterställning',
  registration_mode:'Ändrade registreringsläge',email_add:'Lade till e-postadress',email_remove:'Tog bort e-postadress',official_settings:'Ändrade regler för officiella tillfällen',integration_settings:'Ändrade integration'}

function auditDetail(entry) {
  if (entry.action === 'role') return roleName[entry.detail]
  if (entry.action === 'account_status') return {active:'Aktivt',blocked:'Blockerat',removed:'Borttaget'}[entry.detail]
  if (entry.action === 'registration_mode') return registrationLabels[entry.detail]
  if (entry.action.startsWith('email_')) return entry.detail === 'blocked' ? 'Spärrlista' : 'Inbjudningslista'
  if (entry.action === 'integration_settings') return entry.detail
  if (entry.action === 'official_settings') {
    const settings = JSON.parse(entry.detail)
    return settings.label + ' · ' + (settings.pin_first ? 'Visas först' : 'Efter starttid') +
      ' · ' + (settings.creator_role === 'admin' ? 'Admins' : 'Officerare och admins')
  }
  return ''
}

function displayedAccounts() {
  const search = accountSearch.trim().toLowerCase()
  return adminData.accounts.filter(item => [item.name,item.email,item.username].some(value=>value?.toLowerCase().includes(search)))
}

function adminPage() {
  const settings = state.officialSettings
  const header = '<div class="page-head"><div><h1>Admin</h1></div></div><nav class="filters officer-nav" aria-label="Adminvyer">' +
    Object.entries(adminSections).map(([id,label]) => '<button type="button" class="filter" aria-pressed="' +
      (id === adminSection) + '" data-action="admin-section/'+id+'">' + label + '</button>').join('') + '</nav>'
  if (adminSection === 'integrations') return header + integrationsPage(adminData.integrations)
  if (adminSection === 'accounts') return header +
    '<section class="card member-table"><h3>Konton</h3>' +
    (!adminData.mail_ready ? '<p>Återställningsmejl blir tillgängliga när mejltjänsten är ansluten.</p>' : '') +
    '<div class="form">' + field('Sök konto',input('account-search',accountSearch,'type="search" placeholder="Användarnamn eller e-post"')) + '</div>' +
    '<div id="account-list">' + memberRows(displayedAccounts(),true) + '</div></section>' +
    (adminData.pending.length ? '<section class="card section"><h3>Väntar på verifiering</h3>' +
      adminData.pending.map(row=>'<div class="row"><strong>' + e(row.email) + '</strong><small>Gäller till ' + fullDate(row.expires_at) + '</small></div>').join('') + '</section>' : '')
  if (adminSection === 'registration') {
    const list = (kind,title,button) => '<section class="card"><div class="loot-head"><h3>' + title + '</h3>' +
      btn(button,'registration-add/'+kind) + '</div>' + (adminData.emails.some(row=>row.kind===kind)
        ? adminData.emails.filter(row=>row.kind===kind).map(row=>'<div class="row"><strong>' + e(row.email) + '</strong>' +
          btn('Ta bort','registration-remove/'+kind+'/'+encodeURIComponent(row.email),'danger') + '</div>').join('')
        : '<p class="kicker">Inga adresser.</p>') + '</section>'
    return header + '<section class="card"><h3>Registreringsläge</h3><p>' + registrationLabels[adminData.mode] + '</p>' +
      btn('Ändra läge','registration-mode') + '</section><div class="grid admin-grid section">' +
      list('blocked','Spärrade e-postadresser','Spärra adress') + list('invited','Inbjudna adresser','Tillåt adress') +
      '</div><p class="hint section">Adresspärrar gäller nya registreringar. Hantera befintlig åtkomst under Konton. Inbjudningslistan ger rätt att registrera sig och skickar inga mejl.</p>'
  }
  if (adminSection === 'history') return header + '<section class="card"><h3>Senaste ändringar</h3>' +
    (adminData.history.length ? '<div class="table-wrap"><table><thead><tr><th>Tid</th><th>Admin</th><th>Åtgärd</th><th>Gäller</th><th>Ändring</th></tr></thead><tbody>' +
      adminData.history.map(entry=>'<tr><td>' + fullDate(entry.recorded_at) + '</td><td>' + e(entry.actor_name) +
        '</td><td>' + activityLabels[entry.action] + '</td><td>' + e(entry.target) + '</td><td>' + e(auditDetail(entry)) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p>Inga ändringar har loggats ännu.</p>') + '</section>'
  return header + '<section class="card"><h3>Officiella tillfällen</h3><ul class="stats"><li><span>Märkning</span><b>' + e(settings.label) + '</b></li>' +
    '<li><span>Placering</span><b>' + (settings.pin_first ? 'Visas först' : 'Efter starttid') + '</b></li>' +
    '<li><span>Får skapa officiella</span><b>' + (settings.creator_role === 'admin' ? 'Admins' : 'Officerare och admins') + '</b></li></ul>' +
    '<p class="hint section">Officiella tillfällen kräver uppföljning i officersvyn. Arrangören väljer gruppstorlek per tillfälle.</p>' +
    btn('Ändra inställningar','official-settings') + '</section>'
}

function manageMember(member) {
  if (!member || !canManageMember(member)) return
  const roles = [['member','Medlem'],['officer','Officerare']]
  if (state.user.role === 'owner') roles.push(['admin','Admin'])
  const role = member.status === 'active' ? form('permissions/'+member.id,
    field('Guildroll',select('role',roles,member.role)),submit('Spara roll')) : ''
  const action = member.status === 'blocked' ? btn('Avblockera','account-active/'+member.id) :
    btn('Blockera','account-blocked/'+member.id,'danger')
  const reset = adminData.mail_ready && member.email && member.status === 'active'
    ? btn('Skicka lösenordsåterställning','account-reset/'+member.id) : ''
  show('Hantera konto',role + '<div class="actions roster">' + reset + action + btn('Ta bort konto','account-removed/'+member.id,'danger') + '</div>',member.name)
}

function officialSettingsForm() {
  if (!administrator()) return
  const settings = state.officialSettings
  const fields = field('Märkning',input('label',settings.label,'maxlength="24" required')) +
    field('Placering i listan',select('pin_first',[['1','Visa officiella först'],['0','Sortera alla efter starttid']],String(settings.pin_first))) +
    field('Vem får skapa officiella tillfällen?',select('creator_role',[['officer','Officerare och admins'],['admin','Endast admins']],settings.creator_role))
  show('Officiella tillfällen',form('official-settings',fields,submit('Spara inställningar')))
}

export { adminPage, membersPage, memberRows, canManageMember, displayedAccounts, manageMember, officialSettingsForm, registrationLabels }
