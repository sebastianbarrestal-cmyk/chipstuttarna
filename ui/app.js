import { $, main, dialog, icon, e, roleName, btn, field, initials, api, toast, show, form, submit, input, select } from './components.js'
import { state, demo, nativeLogin, registrationMode, adminData, pollsData, officerData, officerPollResults, officerSection, priorityItem,
  setState, setDemo, setAuthConfig, setAdminData, setPollsData, setOfficerData, setOfficerPollResults, setFilter, setAdminSection,
  setAccountSearch, setOfficerSection, setOfficerHistory, setOpenRaid, officer, administrator, activeTab } from './model.js'
import { eventsPage, hero, details, eventForm, updateRolePreview, attendanceForm, findEvent, upcoming, ownSignup, stockholmTime } from './events.js'
import { charactersPage, characterForm, showAccountStats, showCharacterStats, syncVisibleArmory, gearDialog } from './characters.js'
import { adminPage, membersPage, memberRows, canManageMember, displayedAccounts, manageMember, officialSettingsForm, registrationLabels } from './admin.js'
import { pollForm, pollsPage, officerPollArchive } from './polls.js'
import { officersPage, raidLootCatalog, raidLootRanking } from './officers.js'
import { accountForm, showAccountLink } from './auth.js'

const tabs = {events:['Speltillfällen','calendar'],characters:['Mina karaktärer','sword'],members:['Guilden','users'],polls:['Omröstningar','chart'],officers:['Officerare','chart'],admin:['Admin','shield']}
let renderVersion = 0
let officerSyncTimer

function chrome(tab) {
  const allowed = Object.keys(tabs).filter(key => key === 'events' || ((state?.user || demo) && (key !== 'officers' || officer() || demo) && (key !== 'admin' || administrator() && !demo)))
  $('#nav').innerHTML = '<span class="nav-title">Guilden</span>' + allowed.map(key => '<a class="nav-item" href="#' + key + '"' + (key === tab ? ' aria-current="page"' : '') + '>' + icon(tabs[key][1]) + tabs[key][0] + '</a>').join('')
  $('#top-title').textContent = tabs[tab]?.[0] || 'Speltillfällen'
  $('#mode').innerHTML = demo ? btn('Stäng exempel','demo-off') : 'WoW Forever · EU'
  const user = state?.user
  const signOut = nativeLogin ? '<button class="exit btn icon-only" type="button" aria-label="Logga ut" data-action="auth-logout">' + icon('exit') + '</button>' :
    '<a class="exit btn icon-only" aria-label="Logga ut" href="/signout-with-chatgpt?return_to=%2F" target="_top">' + icon('exit') + '</a>'
  $('#identity').innerHTML = user ? '<span class="avatar">' + e(initials(user.name)) + '</span><span><strong>' + e(user.name) + '</strong><small>' + roleName[user.role] + '</small></span>' + signOut : ''
}

async function render() {
  const version = ++renderVersion
  clearTimeout(officerSyncTimer)
  let tab = activeTab()
  if (!tabs[tab] || (tab === 'officers' && !officer() && !demo) || (tab === 'admin' && (!administrator() || demo))) tab = 'events'
  chrome(tab)
  if (state?.error && !demo) {
    const signIn = '/signin-with-chatgpt?return_to=%2F'
    if (state.status === 401) {
      main.innerHTML = nativeLogin
        ? hero(btn('Logga in','auth-login','primary') + ' ' + btn('Skapa konto','auth-register')) +
          '<section class="card onboard"><h3>Gå med i Chipstuttarna</h3><p>' + (registrationMode === 'invite' ? 'En inbjuden e-postadress behövs för nya konton.' : registrationMode === 'paused' ? 'Nyregistrering är pausad. Befintliga medlemmar kan logga in.' : 'Skapa ett konto och verifiera din e-postadress.') + '</p></section>'
        : hero('<a class="btn primary" href="' + signIn + '" target="_top">Logga in</a> ' +
          '<a class="btn" href="' + signIn + '" target="_top">Skapa konto</a>') +
          '<section class="card onboard"><h3>Gå med i Chipstuttarna</h3><p>Verifieringsmejl är ännu inte anslutna. ChatGPT-inloggning är tillgänglig under tiden.</p></section>'
    } else if (state.status === 403) {
      main.innerHTML = hero(nativeLogin ? btn('Logga ut','auth-logout') :
        '<a class="btn" href="/signout-with-chatgpt?return_to=%2F" target="_top">Logga ut</a>') +
        '<section class="card onboard"><h3>Åtkomst spärrad</h3><p>' + e(state.error) + '</p></section>'
    } else {
      main.innerHTML = '<section class="card onboard"><h3>Spelplaneringen kunde inte laddas</h3><p>' + e(state.error) + '</p>' +
        btn('Försök igen','reload') + '</section>'
    }
    return
  }
  if (state.onboarding && !demo) {
    main.innerHTML = hero(btn('Skapa konto','profile','primary','plus')) + '<section class="card onboard"><h3>Välkommen till guilden</h3>' +
      '<p>Välj namnet som de andra ska se när du skapar eller anmäler dig till en speltillfälle.</p></section>'
    return
  }
  if (tab === 'officers' && !demo) {
    try {
      setOfficerData(await api('officers'))
      if (officerSection === 'pollResults') {
        const results = await api('officers/poll-results')
        if (version !== renderVersion) return
        setOfficerPollResults(results)
      }
      if (officerSection === 'loot') officerData.drops = await api('officers/drops').catch(() => ({ error:true }))
    }
    catch (error) { if (version === renderVersion) main.innerHTML = '<p class="error">' + e(error.message) + '</p>'; return }
    if (version !== renderVersion) return
    if (officerSection === 'loot' && officerData.drops?.updating) {
      officerSyncTimer = setTimeout(() => {
        if (dialog.open || document.hidden) return
        void render()
      }, 8000)
    }
  }
  if (tab === 'admin') {
    try {
      const data = await api('admin')
      if (version !== renderVersion) return
      setAdminData(data)
    } catch (error) {
      if (version === renderVersion) main.innerHTML = '<p class="error">' + e(error.message) + '</p>'
      return
    }
  }
  if (tab === 'polls' && !demo) {
    try {
      const data = await api('polls')
      if (version !== renderVersion) return
      setPollsData(data.polls)
    } catch (error) {
      if (version === renderVersion) main.innerHTML = '<p class="error">' + e(error.message) + '</p>'
      return
    }
  }
  const pages = {events:eventsPage,characters:charactersPage,members:membersPage,officers:officersPage,admin:adminPage,polls:pollsPage}
  main.innerHTML = (demo ? '<div class="banner"><span>Exempeldata för att visa hur guildsidan ser ut.</span></div>' : '') + pages[tab]()
  if (tab === 'characters' && !demo) {
    syncVisibleArmory()
    void showAccountStats()
  }
}

async function load() {
  try { setState(await api('state')) }
  catch (error) { setState({error:error.message,status:error.status}) }
  await render()
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const [action,id] = button.dataset.action.split('/')
  if (action === 'close') dialog.close()
  else if (action === 'auth-logout') {
    try {
      await api('auth/logout',{})
      history.replaceState(null,'',location.pathname)
      dialog.close()
      await load()
    } catch (error) { toast(error.message) }
  }
  else if (['auth-login','auth-register','auth-forgot'].includes(action)) accountForm(action.slice(5))
  else if (action === 'characters-link') dialog.close()
  else if (action === 'reload') await load()
  else if (action === 'scroll') $('#game-list')?.scrollIntoView({block:'start',behavior:'smooth'})
  else if (action === 'demo-on' || action === 'demo-off') {
    setDemo(action === 'demo-on')
    if (!demo) location.hash = 'events'
    await render()
  } else if (action === 'officer-section') {
    setOfficerSection(id)
    await render()
    document.querySelector('[data-action="officer-section/'+id+'"]')?.focus({preventScroll:true})
  } else if (action === 'filter') {
    setFilter(id)
    await render()
    document.querySelector('[data-action="filter/'+id+'"]')?.focus({preventScroll:true})
  } else if (action === 'details') details(findEvent(id))
  else if (action === 'character-stats') await showCharacterStats(id)
  else if (action === 'profile') show(state.onboarding ? 'Skapa guildkonto' : 'Din guildprofil',form('profile',field('Visningsnamn',input('name',state.user?.name,'required maxlength="32" autocomplete="nickname"')),submit('Spara profil')))
  else if (action === 'event' || action === 'event-official') eventForm(id ? findEvent(id) : null,action === 'event-official')
  else if (action === 'poll-results-more' && officerPollResults.next) {
    button.disabled = true
    try {
      const marker = officerPollResults.next
      const result = await api('officers/poll-results?'+new URLSearchParams({before:marker.time,id:marker.id}))
      if (!button.isConnected) return
      setOfficerPollResults({polls:[...officerPollResults.polls,...result.polls],next:result.next})
      $('#poll-archive').innerHTML = officerPollArchive()
    } catch (error) { toast(error.message) }
    finally { button.disabled = false }
  }
  else if ((action === 'poll-create' || action === 'poll-edit') && officer()) {
    const poll = id ? pollsData.find(item=>item.id===id && item.can_edit) : null
    if (!id || poll) pollForm(poll)
  } else if (action === 'poll-close' && officer()) {
    const poll = pollsData.find(item=>item.id===id)
    if (poll) show('Stäng omröstningen?',form('poll-close/'+id,'<p>Resultatet visas direkt för guilden när omröstningen stängs.</p>',
      submit('Stäng och visa resultat') + btn('Avbryt','close')),poll.question)
  }
  else if (action === 'official-settings') officialSettingsForm()
  else if (action === 'character') characterForm(state.characters?.find(x => x.id === id))
  else if (action === 'remove-character') {
    const character = state.characters.find(item => item.id === id)
    if (!character) return
    const upcomingCount = state.events.filter(item => upcoming(item) && ownSignup(item)?.character_id === id).length
    const message = upcomingCount === 1 ? 'En kommande anmälan med karaktären tas bort.' :
      upcomingCount > 1 ? upcomingCount + ' kommande anmälningar med karaktären tas bort.' : ''
    show('Ta bort ' + character.name + '?',form('remove-character/'+id,'<p class="hint">' +
      (message ? message + ' ' : '') + 'Tidigare speltillfällen behåller karaktären i historiken.</p>',
      '<button type="submit" class="btn danger">Ta bort karaktär</button>' + btn('Avbryt','character/'+id)))
  }
  else if (action === 'raid-loot-rank') {
    const [raidId,index] = (id || '').split('~')
    const item = raidLootCatalog(officerData).find(raid => raid.id === raidId)?.items[Number(index)]
    if (item) raidLootRanking(item)
  } else if (action === 'attendance') {
    button.disabled = true
    try { attendanceForm(await api('officers/attendance/'+id)) }
    catch (error) { show('Närvaro', '<p class="error">' + e(error.message) + '</p>') }
    finally { button.disabled = false }
  }
  else if (action === 'permissions') manageMember(adminData.accounts.find(item => item.id === id))
  else if (action === 'account-reset') {
    const member = adminData.accounts.find(item=>item.id===id)
    if (!member || !canManageMember(member)) return
    show('Skicka lösenordsåterställning?',form('account-reset/'+id,'<p class="hint">En engångslänk skickas till ' +
      e(member.email) + '.</p>',submit('Skicka länk') + btn('Avbryt','permissions/'+id)),member.name)
  } else if (action === 'admin-section') {
    setAdminSection(id)
    await render()
  } else if (action === 'registration-mode') {
    show('Registreringsläge',form('registration-mode',field('Läge',select('mode',Object.entries(registrationLabels),adminData.mode)),submit('Spara')))
  } else if (action === 'registration-add' || action === 'registration-remove') {
    const remove = action === 'registration-remove'
    const address = remove ? decodeURIComponent(button.dataset.action.split('/')[2]) : ''
    const heading = remove ? 'Ta bort adress' : id === 'blocked' ? 'Spärra e-postadress' : 'Tillåt e-postadress'
    const fields = '<input type="hidden" name="kind" value="' + id + '"><input type="hidden" name="remove" value="' + remove + '">' +
      field('E-postadress',input('email',address,'type="email" maxlength="254" required' + (remove?' readonly':'')))
    show(heading,form('registration-email',fields,submit(remove?'Ta bort':'Spara')))
  } else if (action.startsWith('account-')) {
    const member = adminData.accounts.find(item => item.id === id)
    if (!member || !canManageMember(member)) return
    const next = action.slice('account-'.length)
    const labels = {active:'Avblockera konto',blocked:'Blockera konto',removed:'Ta bort konto'}
    const message = next === 'active' ? 'Medlemmen får åtkomst igen. Tidigare avbokade speltillfällen behöver anmälas på nytt.' :
      'Kontot förlorar åtkomsten och kommande anmälningar tas bort. Historiken sparas.' +
      (next === 'removed' ? ' Kontot kan inte återaktiveras från adminvyn.' : '')
    show(labels[next],form('account-status/'+id,'<input type="hidden" name="status" value="' + next + '"><p class="hint">' +
      message + '</p>',submit(labels[next]) + btn('Avbryt','permissions/'+id)),member.name)
  } else if (action === 'cancel') {
    const selected = findEvent(id) || officerData?.events.find(item => item.id === id)
    show('Markera speltillfället som inställt?',form('cancel/'+id,'<p class="hint">Anmälan stängs och kvällen tas bort från närvarostatistiken.</p>',
      submit('Markera inställt') + btn('Avbryt','close')),selected?.title)
  }
})

main.addEventListener('toggle', event => {
  if (event.target.matches('.raid-details[open]')) setOpenRaid(event.target.dataset.raid)
  if (event.target.id === 'officer-history') setOfficerHistory(event.target.open)
}, true)
document.addEventListener('input', event => {
  if (event.target.name === 'account-search') {
    setAccountSearch(event.target.value)
    $('#account-list').innerHTML = memberRows(displayedAccounts(),true)
  }
  if (['capacity','tank_slots','healer_slots'].includes(event.target.name)) updateRolePreview(event.target.form)
})
document.addEventListener('change', event => {
  if (event.target.name === 'audience') {
    const invites = event.target.form.querySelector('[data-poll-invites]')
    invites.hidden = invites.disabled = event.target.value !== 'selected'
  }
  if (event.target.name === 'kind' && event.target.form?.dataset.form === 'event/') {
    const {capacity,kind} = event.target.form.elements
    capacity.value = kind.value === 'raid' ? 20 : 5
  }
  if (event.target.name === 'kind' || event.target.name === 'official') updateRolePreview(event.target.form)
  if (event.target.name === 'priority_event') {
    raidLootRanking(priorityItem,event.target.value)
    dialog.querySelector('[name="priority_event"]').focus()
    return
  }
  if (event.target.name !== 'character_id') return
  const char = state.characters.find(x => x.id === event.target.value)
  if (char && event.target.form.elements.role) event.target.form.elements.role.value = char.role
})
document.addEventListener('submit', async event => {
  const element = event.target.closest('form[data-form]')
  if (!element) return
  event.preventDefault()
  const [kind,id] = element.dataset.form.split('/')
  const button = element.querySelector('[type=submit]')
  const errorField = element.querySelector('.error')
  const fields = new FormData(element)
  const data = Object.fromEntries(fields)
  button.disabled = true
  errorField.hidden = true
  try {
    if (id) data.id = id
    if (kind === 'event') {
      data.capacity = Number(data.capacity)
      if ('official' in data) data.official = data.official === 'yes'
      data.tank_slots = !data.tank_slots ? null : Number(data.tank_slots)
      data.healer_slots = !data.healer_slots ? null : Number(data.healer_slots)
      data.starts_at = stockholmTime(data.starts_at)
    } else if (kind === 'official-settings') {
      data.pin_first = data.pin_first === '1'
    } else if (kind === 'poll-create' || kind === 'poll-edit') {
      if (kind === 'poll-edit') data.revision = Number(data.revision)
      data.restricted = data.audience === 'selected'
      data.invites = fields.getAll('invited')
      data.options = data.options.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)
    } else if (kind === 'poll-vote') {
      data.option = Number(data.option)
      data.revision = Number(data.revision)
    } else if (kind === 'registration-email') {
      data.remove = data.remove === 'true'
    } else if (kind === 'signup') {
      data.event_id = id
    } else if (kind === 'attendance') {
      data.missing = fields.getAll('missing')
      data.extra = fields.getAll('extra')
      data.minutes = data.minutes ? Number(data.minutes) : null
    }
    if (kind.startsWith('auth-')) {
      const type = kind.slice(5)
      await api('auth/'+type,data)
      if (type === 'register' || type === 'forgot') {
        show('Kolla din inkorg','<p>Om adressen kan användas skickas en länk till den. Länken gäller i en timme.</p>' + btn('Till inloggning','auth-login'))
      } else if (type === 'verify' || type === 'reset') {
        history.replaceState(null,'',location.pathname)
        accountForm('login')
        toast(type === 'verify' ? 'E-postadressen är verifierad' : 'Lösenordet har sparats')
      } else {
        dialog.close()
        history.replaceState(null,'',location.pathname)
        await load()
      }
      return
    }
    await api(kind === 'remove-character' ? 'character/remove' : kind,data)
    dialog.close()
    await load()
    if (kind === 'signup' && findEvent(id)) details(findEvent(id))
    toast({'poll-edit':'Omröstningen uppdaterades','poll-create':'Omröstningen öppnades','poll-vote':'Rösten sparades','poll-close':'Resultatet är publicerat','account-reset':'Återställningslänken skickades','remove-character':'Karaktären togs bort',signup:'Anmälan sparad',cancel:'Speltillfället är inställt',attendance:'Närvaron sparad'}[kind] || 'Sparat')
  } catch (error) {
    errorField.textContent = error.message
    errorField.hidden = false
  } finally {
    button.disabled = false
  }
})
window.addEventListener('hashchange', async () => {
  if (!state) return
  await render()
  showAccountLink()
})
try {
  const config = await api('auth/config')
  setAuthConfig(config)
} catch {}
await load()
showAccountLink()
