import { e, format, clock, fullDate, tag, officialBadge, icon, btn, statusName, gameRoles, field, input, select, form, submit, show } from './components.js'
import { state, demo, filter, officer, canManageEvent, canPublishOfficial } from './model.js'
import { armoryBadge, syncVisibleArmory } from './characters.js'

const upcoming = event => !event.canceled && event.starts_at > Date.now()
const booked = event => event.signups.filter(row => row.booked)
const roleLabels = {Tank:'Tanks',Healer:'Healers',DPS:'DPS'}
const roleTargets = event => ({
  Tank:event.tank_slots, Healer:event.healer_slots,
  DPS:event.tank_slots == null ? null : event.capacity - event.tank_slots - event.healer_slots,
})
function groupSummary(event) {
  if (event.kind === 'pvp') {
    const reserves = event.signups.filter(row => row.status === 'yes' && !row.booked).length
    return reserves ? '<p class="kicker pvp-reserves">' + reserves + ' i reserv</p>' : ''
  }
  const targets = roleTargets(event)
  const group = booked(event)
  return '<ul class="role-summary" aria-label="Gruppens roller">' + gameRoles.map(role => {
    const count = group.filter(row => row.role === role).length
    const goal = targets[role]
    const missing = goal == null ? 0 : Math.max(0, goal - count)
    const waiting = event.signups.filter(row => row.status === 'yes' && !row.booked && row.role === role).length
    return '<li><span>' + roleLabels[role] + '</span><strong>' + count + (goal == null ? '' : ' / ' + goal) + '</strong>' +
      (missing ? '<small>' + missing + ' ledig' + (missing === 1 ? '' : 'a') + '</small>' : '') +
      (waiting ? '<small>' + waiting + ' i reserv</small>' : '') + '</li>'
  }).join('') + '</ul>'
}
const ownSignup = event => event.signups.find(row => row.member_id === state.user?.id)
const signLabel = (event, row) => row.status === 'yes' && !row.booked ? 'Reserv' : statusName[row.status]
const demoEvents = [
  ['Onyxia’s Lair','raid',2,20,'Samling vid ingången 15 minuter före pull.'],
  ['Scarlet Monastery','dungeon',4,5,'Vi tar Armory och Cathedral.'],
  ['Blackrock Depths','dungeon',7,5,'Ta med nyckel om du har.'],
].map(([title,kind,days,capacity,description],i) => ({
  id:'demo'+i,title,kind,capacity,description,organizer:'Exempelspelare',starts_at:Date.now() + (days*24 + 10)*3600000,
  signups:i === 0 ? [{member_id:'example',member_name:'Exempelspelare',role:'Tank',status:'yes',booked:true}] : [],
}))

function hero(action) {
  return '<section class="hero"><div class="hero-content"><div class="eyebrow">' + icon('sword') + ' Chipstuttarna</div><h1>Speltillfällen</h1><p>Planera raids, dungeons och PvP och se vilka som hänger på.</p>' + action + '</div></section>'
}

function eventCard(event) {
  const own = ownSignup(event)
  const label = event.canceled ? 'Inställt' : own ? signLabel(event,own) : ''
  return '<article class="event"><div class="date-chip"><b>' + format(event.starts_at,{day:'numeric'}) + '</b><small>' + format(event.starts_at,{month:'short'}).replace('.','') + '</small></div><div>' + tag(event) + officialBadge(event) + '<h3 class="event-name">' + e(event.title) + '</h3><div class="event-meta"><span>' + icon('clock') + clock(event.starts_at) + '</span><span>' + icon('users') + booked(event).length + '/' + event.capacity + ' platser</span>' + (label ? '<span class="tag neutral">' + label + '</span>' : '') + '</div>' + (!event.canceled ? groupSummary(event) : '') + '</div>' + btn('Visa', 'details/'+event.id, '', 'arrow') + '</article>'
}

function eventsPage() {
  const all = demo ? demoEvents : state.events
  const sortUpcoming = events => state.officialSettings?.pin_first ?
    events.sort((a,b) => Number(Boolean(b.official)) - Number(Boolean(a.official)) || a.starts_at - b.starts_at) : events
  const open = sortUpcoming(all.filter(upcoming))
  const visible = filter === 'past' ? all.filter(event => !upcoming(event)) : open.filter(event => filter === 'all' || event.kind === filter)
  const mine = open.filter(event => ownSignup(event)?.status === 'yes')
  const filters = [['all','Alla'],['raid','Raids'],['dungeon','Dungeons'],['pvp','PvP'],['past','Tidigare']]
  return hero(state.user && !demo ? btn('Skapa speltillfälle','event','primary','plus') : btn('Se speltillfällen','scroll','primary','arrow')) +
    '<section class="section" id="game-list"><div class="section-head"><h2>' + (filter === 'past' ? 'Tidigare speltillfällen' : 'Kommande speltillfällen') + '</h2></div>' +
    '<div class="grid"><div class="stack"><div class="filters">' + filters.map(([id,label]) => '<button type="button" class="filter" aria-pressed="' + (filter === id) + '" data-action="filter/'+id+'">' + label + '</button>').join('') + '</div>' +
    (visible.length ? visible.map(eventCard).join('') : '<div class="empty"><h3>' + (filter === 'past' ? 'Inga tidigare speltillfällen' : 'Inga planerade speltillfällen här') + '</h3><p class="kicker">' + (filter === 'past' ? 'Tidigare och inställta speltillfällen visas här.' : state.user ? 'Skapa en raid, dungeon eller PvP-aktivitet när du vet vad ni vill köra.' : 'Här visas guildens planerade speltillfällen.') + '</p></div>') +
    '</div><aside class="stack sidecards"><section class="card"><h3>' + icon('calendar') + ' Mina anmälningar</h3>' + (mine.length ? '<ul class="stats">' + mine.map(event => '<li><span>' + e(event.title) + '</span><b>' + signLabel(event,ownSignup(event)) + '</b></li>').join('') + '</ul>' : '<p>Du har inga kommande anmälningar.</p>') +
    '</section><section class="card"><h3>' + icon('users') + ' Gruppstatus</h3><ul class="stats"><li><span>Planerade raids</span><b>' + open.filter(x => x.kind === 'raid').length + '</b></li><li><span>Planerade dungeons</span><b>' + open.filter(x => x.kind === 'dungeon').length + '</b></li><li><span>Planerade PvP</span><b>' + open.filter(x => x.kind === 'pvp').length + '</b></li></ul></section></aside></div></section>'
}

function details(event) {
  if (!event) return
  const row = ownSignup(event)
  const yes = booked(event)
  const characters = (state.characters || []).filter(char => char.armory_ready)
  const fields = '<fieldset class="group"><legend>Ditt svar</legend><div class="rsp">' +
    Object.entries(statusName).map(([id,label]) => '<label><input type="radio" name="status" required value="' + id + '"' + (row?.status === id ? ' checked' : '') + '><span>' + label + '</span></label>').join('') +
    '</div></fieldset><div class="cols">' + field('Karaktär',select('character_id',[['','Välj karaktär'],...characters.map(char => [char.id,char.name])],row?.character_id)) +
    (event.kind === 'pvp' ? '' : field('Spelroll',select('role',gameRoles,row?.role || 'DPS'))) + '</div>' +
    (!characters.length ? '<p class="hint">Du behöver en karaktär med Armory-länk för att svara Kommer eller Kanske. <a class="link" href="#characters" data-action="characters-link">Mina karaktärer</a></p>' : '')
  const roster = event.signups.length ? event.signups.map(person => '<div class="row"><div><strong>' + e(person.member_name) + '</strong><small>' +
    (person.character_name ? e(person.character_name) : '') +
    (event.kind === 'pvp' ? '' : (person.character_name ? ' · ' : '') + e(person.role)) + '</small></div><div class="right">' +
    (person.armory_url ? (officer() && !demo && event.kind === 'dungeon'
      ? '<span data-armory-for="' + e(person.character_id) + '">' + armoryBadge(person) + '</span>' + btn('Utrustning','gear/'+person.character_id)
      : '<a class="link" target="_blank" rel="noopener" href="' + e(person.armory_url) + '">Armory ↗</a>') : '') +
    '<span class="tag neutral">' + signLabel(event,person) + '</span></div></div>').join('') : '<p class="kicker">Ingen har svarat än.</p>'
  show(event.title, '<div class="actions">' + tag(event) + officialBadge(event) + '<span class="kicker">' + yes.length + ' av ' + event.capacity + ' platser bokade</span></div>' + (!event.canceled ? groupSummary(event) : '') +
    '<p class="description">' + e(event.description) + '</p>' +
    (demo ? '<p class="hint">Skapa din guildprofil för att göra egna anmälningar.</p>' : upcoming(event) ? form('signup/'+event.id,fields,submit('Spara svar'),'details-form') : '<p class="hint">' + (event.canceled ? 'Speltillfället är inställt.' : 'Anmälan är stängd.') + '</p>') +
    '<section class="roster"><h3>Anmälningar</h3>' + roster + '</section>' +
    (canManageEvent(event) && !demo && !event.canceled ? '<div class="actions roster">' +
      (upcoming(event) ? btn('Redigera','event/'+event.id) : officer() ? btn(event.attendance_finalized ? 'Ändra närvaro' : 'Rapportera närvaro','attendance/'+event.id) : '') +
      btn(upcoming(event) ? 'Ställ in' : 'Markera inställt','cancel/'+event.id,'danger') + '</div>' : ''),
    fullDate(event.starts_at) + ' · Svensk tid · ' + event.organizer)
  if (event.kind === 'dungeon' && officer() && !demo) syncVisibleArmory()
}

function stockholmValue(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time).map(x => [x.type,x.value]))
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute
}
function stockholmTime(value) {
  const nominal = Date.parse(value+'Z')
  const guesses = [nominal-3600000,nominal-7200000].filter(time => stockholmValue(time) === value)
  if (!guesses.length) throw new Error('Välj en giltig svensk tid. Den valda tiden hoppas över vid sommartidsbytet.')
  if (guesses.length > 1) throw new Error('Tiden inträffar två gånger vid vintertidsbytet. Välj en annan tid.')
  return guesses[0]
}

function eventForm(event, startOfficial = false) {
  const official = Boolean(event?.official ?? startOfficial)
  const kind = event?.kind || 'dungeon'
  const capacity = event?.capacity || 5
  const tank = event ? event.tank_slots ?? '' : 1
  const healer = event ? event.healer_slots ?? '' : 1
  const level = canPublishOfficial() ? field('Nivå',select('official',[['no','Vanligt'],['yes',state.officialSettings.label]],official?'yes':'no')) : ''
  const fields = level + field('Namn',input('title',event?.title,'required maxlength="70" placeholder="Till exempel Scarlet Monastery"')) +
    '<div class="cols">' + field('Typ',select('kind',[['dungeon','Dungeon'],['raid','Raid'],['pvp','PvP']],kind)) +
    field('Antal platser',input('capacity',capacity,'type="number" min="1" max="80" required')) + '</div>' +
    '<div class="cols" data-role-fields>' + field('Tankplatser',input('tank_slots',tank,'type="number" min="0" max="80" placeholder="Inget platsmål"')) +
    field('Healerplatser',input('healer_slots',healer,'type="number" min="0" max="80" placeholder="Inget platsmål"')) + '</div>' +
    '<p class="hint" data-role-summary aria-live="polite"></p>' +
    field('Starttid (svensk tid)',input('starts_at',event ? stockholmValue(event.starts_at) : '', 'type="datetime-local" required')) +
    field('Beskrivning <span class="kicker">(valfritt)</span>','<textarea name="description" maxlength="650" placeholder="Samling, krav eller annan info">' + e(event?.description) + '</textarea>')
  show(event ? 'Redigera speltillfälle' : startOfficial ? 'Skapa officiellt tillfälle' : 'Skapa speltillfälle',form('event/'+(event?.id || ''),fields,submit('Spara speltillfälle')))
  updateRolePreview(dialog.querySelector('form'))
}

function updateRolePreview(form) {
  const {tank_slots:tank, healer_slots:healer, capacity, kind} = form.elements
  const output = form.querySelector('[data-role-summary]')
  const pvp = kind.value === 'pvp'
  form.querySelector('[data-role-fields]').hidden = pvp
  tank.disabled = healer.disabled = pvp
  if (pvp) {
    output.textContent = 'Platserna bokas i anmälningsordning.'
    return
  }
  if (tank.value === '' && healer.value === '') {
    output.textContent = 'Platserna bokas i anmälningsordning. Fyll i båda fälten för att reservera platser per roll.'
    return
  }
  const remaining = Number(capacity.value) - Number(tank.value) - Number(healer.value)
  output.textContent = tank.value === '' || healer.value === '' ? 'Fyll i båda fälten, även om antalet är 0.' :
    remaining < 0 ? 'Tank- och healerplatser ryms inte inom gruppstorleken.' :
      remaining + ' DPS-platser. När en roll är full hamnar nästa spelare i reserv för den rollen.'
}

function attendanceForm({ event, expected, rows }) {
  const recorded = new Map(rows.map(row => [row.member_id,row]))
  const expectedIds = new Set(expected.map(member => member.id))
  const extra = state.members.filter(member => !expectedIds.has(member.id) && (member.status === 'active' || recorded.has(member.id)))
  const wasPresent = row => row && (row.minutes > 0 || !row.duration_known)
  const check = (name, member, selected, caption) => '<label class="attendance-check"><span><strong>' + e(member.name) + '</strong>' +
    (member.character_name ? '<small>' + e(member.character_name) + '</small>' : '') + '</span><span class="check-caption"><input type="checkbox" name="' + name + '" value="' + e(member.id) + '"' +
    (selected ? ' checked' : '') + '>' + caption + '</span></label>'
  const fields = '<p class="hint">De som tackat ja och fått plats räknas som närvarande. Kryssa bara i de som uteblev.</p>' +
    (expected.length ? '<div class="attendance-list">' + expected.map(member => {
      const prior = recorded.get(member.id)
      return check('missing',member,prior?.duration_known === 1 && prior.minutes === 0,'Uteblev')
    }).join('') + '</div>' : '<p class="hint">Ingen hade en bokad plats. Lägg till de som deltog nedan.</p>') +
    (extra.length ? '<details class="attendance-extra"' + (!expected.length || extra.some(member => wasPresent(recorded.get(member.id))) ? ' open' : '') +
    '><summary>Lägg till deltagare</summary><div class="attendance-list">' + extra.map(member => check('extra',member,wasPresent(recorded.get(member.id)),'Deltog')).join('') + '</div></details>' : '') +
    field('Gemensam speltid i minuter (valfritt)',input('minutes','','type="number" min="1" max="1440" placeholder="Till exempel 90"')) +
    (rows.some(row => row.minutes > 0) ? '<p class="hint">Lämna speltiden tom för att behålla tidigare sparade minuter.</p>' : '')
  show('Rapportera närvaro',form('attendance/'+event.id,fields,submit('Spara närvaro')),event.title + ' · ' + fullDate(event.starts_at))
}

const findEvent = id => (demo ? demoEvents : state.events || []).find(event => event.id === id)

export { stockholmTime, eventsPage, hero, details, eventForm, updateRolePreview, attendanceForm, findEvent, upcoming, ownSignup }
