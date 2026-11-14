import { $, main, dialog, e, fullDate, btn, eventTypes, api, field, input, select, form, submit, show, classes, gameRoles } from './components.js'
import { state, demo } from './model.js'

const armoryStatus = {pending:'Väntar på hämtning',ok:'Synkad',not_found:'Profilen hittades inte',
  unavailable:'Kunde inte nå Armory',format:'Armorys utrustning gick inte att läsa',
  api_setup_required:'Armory behöver API-anslutning',api_auth:'Battle.net nekade API-åtkomst',
  rate_limited:'Armory ber oss vänta'}
function charactersPage() {
  const characters = state.characters || []
  return '<div class="page-head"><div><h1>Mina karaktärer</h1><p>Välj en av dina karaktärer när du anmäler dig till en speltillfälle.</p></div>' +
    (demo ? '' : btn('Lägg till','character','primary','plus')) + '</div><section id="my-stats" class="card section"><h3>Totalt för hela kontot</h3><p>Hämtar deltagande och speltid…</p></section><section class="card section">' +
    (characters.length ? characters.map(char => '<div class="row"><div><strong>' + e(char.name) + '</strong><small>' + e(char.class) + ' · ' + e(char.role) + '</small></div><div class="right">' +
      (char.armory_ready ? '<span data-armory-for="' + e(char.id) + '">' + armoryBadge(char) + '</span>' + btn('Utrustning','gear/'+char.id) : '<span class="tag neutral">Armory saknas</span>') + btn('Statistik','character-stats/'+char.id) + btn(char.armory_ready ? 'Ändra' : 'Lägg till länk','character/'+char.id) + '</div></div>').join('') :
      '<p class="kicker">Här visas karaktärer du lägger till. Varje karaktär behöver en länk till sin WoW Forever Armory-profil.</p>') + '</section>'
}

async function showAccountStats() {
  const target = $('#my-stats')
  if (!target) return
  try {
    const {stats} = await api('my-stats')
    if (!target.isConnected) return
    const totals = stats.reduce((sum,row) => ({attended:sum.attended+row.attended, recorded:sum.recorded+row.recorded,
      minutes:sum.minutes+row.minutes,timed:sum.timed+row.timed}),{attended:0,recorded:0,minutes:0,timed:0})
    const time = totals.timed ? (totals.timed < totals.attended ? 'Minst ' : '') +
      Math.floor(totals.minutes/60) + ' h ' + totals.minutes%60 + ' min' : '—'
    const entries = [['Deltog',totals.attended],['Speltid',time],
      ['Närvaro',totals.recorded ? Math.round(100*totals.attended/totals.recorded) + ' %' : '—'],
      ...Object.keys(eventTypes).map(kind=>[kind === 'pvp' ? 'PvP' : eventTypes[kind] + 's',stats.find(row=>row.kind===kind)?.attended ?? 0])]
    target.innerHTML = '<h3>Totalt för hela kontot</h3><ul class="role-summary account-summary">' +
      entries.map(([label,value])=>'<li><span>' + label + '</span><strong>' + value + '</strong></li>').join('') +
      '</ul><p class="hint">Varje rapporterat tillfälle räknas en gång, oavsett karaktär. Speltiden bygger på sparade minuter.</p>'
  } catch {
    if (target.isConnected) target.innerHTML = '<h3>Totalt för hela kontot</h3><p>Statistiken kunde inte hämtas.</p>'
  }
}

async function showCharacterStats(id) {
  const character = state.characters?.find(item => item.id === id)
  if (!character) return
  show(character.name,'<p class="kicker" role="status">Hämtar statistik…</p>')
  const pending = dialog.querySelector('[role="status"]')
  try {
    const {stats} = await api('character-stats/'+id)
    if (!dialog.open || !pending.isConnected) return
    const rows = Object.keys(eventTypes).map(kind => {
      const row = stats.find(item => item.kind === kind)
      const label = kind === 'pvp' ? 'PvP' : eventTypes[kind] + 's'
      const participation = row ? row.attended + ' av ' + row.recorded : 'Inget registrerat'
      const rate = row ? Math.round(100*row.attended/row.recorded) + ' %' : '—'
      const minutes = row?.timed ? (row.timed < row.attended ? 'Minst ' : '') + Math.floor(row.minutes/60) + ' h ' + row.minutes%60 + ' min' : '—'
      return '<tr><td>' + label + '</td><td>' + participation + '</td><td>' + rate + '</td><td>' + minutes + '</td></tr>'
    }).join('')
    show(character.name,'<div class="table-wrap"><table><thead><tr><th>Typ</th><th>Deltog</th><th>Närvaro</th><th>Speltid</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><div class="row roster"><strong>Lootfrekvens i raids</strong><span>Okänd</span></div>' +
      '<p class="hint">Statistiken bygger på rapporterade speltillfällen där du anmälde den här karaktären. Lootfrekvens visas när en utdelningslogg är ansluten.</p>', 'Karaktärsstatistik')
  } catch (error) {
    if (dialog.open && pending.isConnected) show(character.name,'<p class="error">' + e(error.message) + '</p>')
  }
}

function armoryBadge(character) {
  const status = character.armory_status || (Object.hasOwn(armoryStatus, character.status) ? character.status : 'pending')
  return '<span class="tag neutral">' + (armoryStatus[status] || armoryStatus.pending) + '</span>' +
    (character.synced_at ? '<small>' + fullDate(character.synced_at) + '</small>' : '')
}

function syncVisibleArmory() {
  const queue = [...document.querySelectorAll('[data-armory-for]')]
  for (let i = 0; i < 3; i++) void (async () => {
    while (queue.length) {
      const node = queue.shift()
      if (!node.isConnected) continue
      try {
        const status = await api('armory', {character_id:node.dataset.armoryFor,manual:false})
        if (node.isConnected) node.innerHTML = armoryBadge(status)
      } catch {
        if (node.isConnected) node.innerHTML = armoryBadge({status:'unavailable'})
      }
    }
  })()
}

const slotLabels = {HEAD:'Huvud',NECK:'Hals',SHOULDER:'Axlar',SHIRT:'Skjorta',CHEST:'Bröst',WAIST:'Midja',LEGS:'Ben',
  FEET:'Fötter',WRIST:'Handleder',HANDS:'Händer',FINGER_1:'Ring 1',FINGER_2:'Ring 2',TRINKET_1:'Trinket 1',
  TRINKET_2:'Trinket 2',BACK:'Rygg',MAIN_HAND:'Huvudhand',OFF_HAND:'Off hand',RANGED:'Distans',TABARD:'Tabard'}

async function gearDialog(id, manual = false) {
  const own = state.characters?.find(character => character.id === id)
  const signup = state.events?.flatMap(event => event.signups).find(row => row.character_id === id)
  const title = own?.name || signup?.character_name || 'Utrustning'
  const url = own?.armory_url || signup?.armory_url
  show(title,'<p class="kicker" role="status">Kontrollerar Armory…</p>')
  const pending = dialog.querySelector('[role="status"]')
  try {
    const info = await api('armory',{character_id:id,manual})
    if (!dialog.open || !pending.isConnected) return
    const previous = new Map((info.previous_equipment || []).map(item => [item.slot,item]))
    const current = new Map((info.equipment || []).map(item => [item.slot,item]))
    const itemLabel = item => item ? e(item.name) + (item.level ? ' <small>ilvl ' + item.level + '</small>' : '') : '—'
    const rows = Object.entries(slotLabels).filter(([slot]) => current.has(slot) || previous.has(slot)).map(([slot,label]) => {
      const now = current.get(slot)
      const old = previous.get(slot)
      const changed = info.previous_equipment && (now?.id !== old?.id || now?.level !== old?.level)
      return '<tr><td>' + label + '</td><td>' + itemLabel(now) + '</td><td>' +
        (changed ? itemLabel(old) : '—') + '</td></tr>'
    }).join('')
    for (const badge of main.querySelectorAll('[data-armory-for]')) {
      if (badge.dataset.armoryFor === id) badge.innerHTML = armoryBadge(info)
    }
    show(title,'<div class="actions gear-actions">' + armoryBadge(info) + btn('Hämta igen','gear-refresh/'+id) +
      (url ? '<a class="link" href="' + e(url) + '" target="_blank" rel="noopener">Öppna Armory ↗</a>' : '') + '</div>' +
      (info.changed_at ? '<p class="hint">Senaste upptäckta utrustningsbyte · ' + fullDate(info.changed_at) + '</p>' : '') +
      (info.checked_at ? '<p class="hint">Senast kontrollerad · ' + fullDate(info.checked_at) + '</p>' : '') +
      (info.status === 'api_setup_required' ? '<p class="hint">Armorys webbsida avvisade hämtningen. En Battle.net API-klient behöver anslutas för automatisk synk.</p>' : '') +
      (info.status === 'not_found' ? '<p class="hint">Kontrollera profillänken. Blizzard visar karaktärer från nivå 10.</p>' : '') +
      (info.status !== 'ok' && info.synced_at ? '<p class="hint">Den senaste sparade utrustningen visas.</p>' : '') +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Plats</th><th>Utrustad</th><th>Före senaste byte</th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
        '<p class="hint">' + (info.status === 'ok' ? 'Armory rapporterade inga utrustade föremål.' : 'Ingen utrustning har kunnat hämtas ännu.') + '</p>') +
      '<p class="hint gear-hint">Byt utrustning i spelet och logga ut innan du testar igen. Sidan visar utrustade föremål.</p>')
  } catch (error) {
    if (dialog.open && pending.isConnected) show(title, '<p class="error">' + e(error.message) + '</p>')
  }
}

function characterForm(char) {
  const fields = field('Förnamn och efternamn',input('name',char?.name,'required maxlength="55" placeholder="Meathead Peet"')) +
    '<div class="cols">' + field('Klass',select('class',classes,char?.class)) + field('Spelroll',select('role',gameRoles,char?.role || 'DPS')) + '</div>' +
    '<p class="hint">Armory-länken skapas automatiskt från namnet på karaktären.</p>'
  const actions = submit('Spara karaktär') + (char ? btn('Ta bort karaktär','remove-character/'+char.id,'danger') : '')
  show(char ? 'Ändra karaktär' : 'Lägg till karaktär',form('character/'+(char?.id || ''),fields,actions))
}

export { charactersPage, characterForm, showAccountStats, showCharacterStats, armoryBadge, syncVisibleArmory, gearDialog }
