import { e, fullDate, tag, officialBadge, icon, btn, field, select, show } from './components.js'
import { state, demo, officerData, officerSection, officerHistory, canPublishOfficial, openRaid, setPriorityItem } from './model.js'
import { officerPollArchive } from './polls.js'

const rarities = {unknown:'Okänd',poor:'Poor',artifact:'Artifact',heirloom:'Heirloom',common:'Common',uncommon:'Uncommon',rare:'Rare',epic:'Epic',legendary:'Legendary'}
const demands = {unclassified:'Ej klassad',low:'Låg',normal:'Normal',high:'Hög',exceptional:'Exceptionell'}
const handOfRagnaros = {name:'Sulfuras, Hand of Ragnaros',rarity:'legendary',demand:'exceptional'}
function estimatedDemand(item) {
  if (item.rarity === 'legendary' || item.rarity === 'artifact') return 'exceptional'
  if (item.rarity === 'epic') return item.samples >= 30 && item.chance <= 10 ? 'high' : 'normal'
  if (['rare','uncommon','common','poor','heirloom'].includes(item.rarity)) return 'low'
  return 'unclassified'
}

function raidLootCatalog(data) {
  const { observations = [], metadata = {} } = data.drops || {}
  const raids = (data.raidCatalog || []).map(raid => {
    const items = raid.items.map(item => ({ ...item, boss: item.boss || raid.bosses[0] }))
    for (const drop of observations.filter(row => row.raid === raid.id)) {
      const meta = metadata[drop.itemId]
      const existing = items.find(item => item.boss === drop.boss && (item.itemId === drop.itemId ||
        (!item.itemId && meta?.name.toLowerCase() === item.name.toLowerCase())))
      if (existing) Object.assign(existing, drop)
      else items.push({ name:meta?.name || 'Föremål #' + drop.itemId, ...drop })
    }
    return { ...raid, items:items.map(item => ({ ...item, rarity:metadata[item.itemId]?.quality || item.rarity })) }
  })
  return raids.concat({ id:'reference', name:'Classic-exempel', bosses:[], items:[handOfRagnaros] })
}


function raidLootPage(data) {
  const catalog = raidLootCatalog(data)
  const sync = data.drops
  const status = sync?.error ? (sync.syncedAt ? 'Everloot kunde inte nås. Senast hämtade data visas.' : 'Everloot kunde inte nås. Sidan försöker igen automatiskt vid nästa besök.') :
    sync?.updating ? 'Hämtar data från Everloot…' :
    sync?.syncedAt ? 'Senast hämtat ' + fullDate(sync.syncedAt) : 'Inväntar första hämtningen från Everloot.'
  return '<section class="card raid-loot"><div class="loot-head"><div><h3>' + icon('sword') + ' Raidloot</h3>' +
    '<p class="hint">Efterfrågan uppskattas från raritet och observerad droppchans. ' + e(status) +
    '</p><p class="hint">Droppdata från <a class="link" href="https://everloot.app/docs/api/rollups-drops" target="_blank" rel="noopener">Everloot</a> · <a class="link" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Föremålsdata från <a class="link" href="https://ahledger.com/data" target="_blank" rel="noopener">AHledger</a>.</p></div></div>' +
    catalog.map(raid => {
      const itemRows = raid.items.map((item,index) => {
        const actionId = raid.id + '~' + index
        const rarity = rarities[item.rarity] || 'Okänd'
        const demand = demands[estimatedDemand(item)]
        return '<tr><td><strong>' + e(item.name) + '</strong></td><td>' + e(item.boss || '—') + '</td><td>' + rarity + '</td><td>' + demand + '</td><td>' +
          (item.chance == null ? 'Okänd' : item.chance.toLocaleString('sv-SE',{maximumFractionDigits:2}) + ' % <small>(' + item.samples + ' lootfönster)</small>') +
          '</td><td>' + (item.classicChance == null ? '—' : item.classicChance + ' %') + '</td><td><div class="actions">' +
          (demo ? '' : btn('Prioriteringsunderlag','raid-loot-rank/'+actionId)) + '</div></td></tr>'
      }).join('')
      return '<details class="raid-details" name="raid-loot-catalog" data-raid="' + raid.id + '"' + (openRaid === raid.id ? ' open' : '') +
        '><summary><strong>' + e(raid.name) + '</strong><span class="kicker">' + (raid.size ? raid.size + ' spelare · ' + raid.bosses.length + ' bossar · öppnar 9 dec 2026' : 'Föremål som exempel från Classic') + '</span></summary>' +
        (raid.bosses.length ? '<p class="hint"><strong>Bossar</strong> · ' + raid.bosses.map(e).join(' · ') + '</p>' : '') +
        (raid.id === 'onyxias-lair' ? '<p class="hint">Föremål och referensprocent från Classic. Loot och droppchanser i Forever väntar på bekräftelse.</p>' :
          raid.size ? '<p class="hint">Spelklienten kopplar föremålen nedan till bossarna. Full loot och droppchanser väntar på bekräftelse.</p>' :
          '<p class="hint">Classic-exemplet Sulfuras tillverkas med Eye of Sulfuras, som kan droppa från Ragnaros i Molten Core.</p>') +
        (itemRows ? '<div class="table-wrap"><table><thead><tr><th>Föremål</th><th>Boss</th><th>Raritet</th><th>Efterfrågan</th><th>Drop % Forever</th><th>Classic-referens</th><th>Åtgärder</th></tr></thead><tbody>' + itemRows + '</tbody></table></div>' : '<p class="hint">Inga föremål inlagda.</p>') +
        (raid.source ? '<div class="actions raid-sources"><a class="link" href="' + raid.source + '" target="_blank" rel="noopener">Datakälla ↗</a>' +
          (raid.extraSource ? '<a class="link" href="' + raid.extraSource + '" target="_blank" rel="noopener">Fler Classic-drops ↗</a>' : '') +
          '<a class="link" href="https://news.blizzard.com/en-gb/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement" target="_blank" rel="noopener">Blizzard ↗</a></div>' :
          '<div class="raid-sources"><a class="link" href="https://www.wowhead.com/classic/guide/sulfuras-hand-of-ragnaros" target="_blank" rel="noopener">Classic-källa för Sulfuras ↗</a></div>') + '</details>'
    }).join('') + '</section>'
}

function raidLootRanking(item, eventId = '') {
  const highPriority = ['high','exceptional'].includes(estimatedDemand(item))
  const minimum = highPriority ? 3 : 1
  const raids = officerData.events.filter(event => event.kind === 'raid' && event.attendance_finalized && !event.canceled)
  const roster = eventId ? new Set(officerData.raidParticipants.filter(row => row.event_id === eventId).map(row => row.member_id)) : null
  const candidates = (officerData.raidStats || []).filter(row => roster ? roster.has(row.id) : row.attended > 0).sort((a,b) =>
    (b.recorded >= minimum) - (a.recorded >= minimum) || b.attended / b.recorded - a.attended / a.recorded || b.attended - a.attended)
  const chooser = '<div class="form">' + field('Rapporterad raid för deltagarurval',
    select('priority_event',[['','Alla med registrerat deltagande'],...raids.map(event => [event.id,event.title + ' · ' + fullDate(event.starts_at)])],eventId)) + '</div>'
  const content = chooser + '<p class="hint priority-note">' + (highPriority ? 'Minst tre rapporterade raidtillfällen krävs för ordinarie närvarounderlag. ' : '') +
    'Sorterat på raidnärvaro i procent, sedan antal deltagna raids under 90 dagar. Intresse, main spec och utdelad loot är ännu okända.</p>' +
    (candidates.length ? '<div class="table-wrap"><table><thead><tr><th>Medlem</th><th>Raids</th><th>Närvaro</th><th>Underlag</th></tr></thead><tbody>' +
      candidates.map(row => '<tr><td>' + e(row.name) + '</td><td>' + row.attended + ' av ' + row.recorded + '</td><td>' +
        Math.round(row.attended / row.recorded * 100) + ' %</td><td>' + (row.recorded < minimum ? 'Begränsat' : 'Närvaro') + '</td></tr>').join('') + '</tbody></table></div>' :
      '<p class="kicker">Ingen registrerad raidnärvaro för urvalet.</p>')
  setPriorityItem(item)
  show(item.name,content,(rarities[item.rarity] || 'Okänd raritet') + ' · ' + demands[estimatedDemand(item)] + ' efterfrågan')
}

const officerSections = {followup:'Uppföljning',members:'Medlemsstatistik',loot:'Raidloot',pollResults:'Omröstningsresultat'}

function officersPage() {
  const data = officerData || {events:[],stats:[],raidStats:[]}
  const pending = data.events.filter(event => !event.attendance_finalized && !event.canceled)
  const reviewed = data.events.filter(event => event.attendance_finalized || event.canceled)
  const header = '<div class="page-head"><div><h1>Officerare</h1></div>' + (demo ? '' : canPublishOfficial() ? btn('Skapa officiellt tillfälle','event-official','primary','plus') : btn('Skapa speltillfälle','event','primary','plus')) + '</div>' +
    '<nav class="filters officer-nav" aria-label="Officersvyer">' + Object.entries(officerSections).map(([id,label]) =>
      '<button type="button" class="filter" aria-pressed="' + (officerSection === id) + '" data-action="officer-section/'+id+'">' +
      label + (id === 'followup' && pending.length ? ' · ' + pending.length : '') + '</button>').join('') + '</nav>'
  if (officerSection === 'loot') return header + raidLootPage(data)
  if (officerSection === 'pollResults') return header + '<section id="poll-archive">' + officerPollArchive() + '</section>'
  if (officerSection === 'members') {
    const raidStats = new Map(data.raidStats.map(row => [row.id,row]))
    return header + '<section class="card"><h3>' + icon('chart') + ' Medlemsstatistik · 90 dagar</h3>' +
      '<p>Rapporterade speltillfällen räknas här. Utdelningshistorik för guilden är ännu inte ansluten.</p>' +
      (data.stats.some(row => row.recorded) ? '<div class="table-wrap"><table><thead><tr><th>Medlem</th><th>Speltillfällen</th><th>Speltid</th><th>Raids</th><th>Raidnärvaro</th></tr></thead><tbody>' +
      data.stats.map(row => {
        const raid = raidStats.get(row.id)
        return '<tr><td>' + e(row.name) + '</td><td>' + row.attended + ' av ' + row.recorded + '</td><td>' +
          (row.timed ? (row.timed < row.attended ? 'Minst ' : '') + Math.floor(row.minutes/60) + ' h ' + row.minutes%60 + ' min' : '—') +
          '</td><td>' + (raid ? raid.attended + ' av ' + raid.recorded : '—') + '</td><td>' +
          (raid ? Math.round(100*raid.attended/raid.recorded) + ' %' : '—') + '</td></tr>'
      }).join('') + '</tbody></table></div>' : '<p class="kicker">Ingen närvaro rapporterad ännu.</p>') + '</section>'
  }
  const rows = events => events.map(event => '<div class="row officer-event"><div>' + tag(event) + officialBadge(event) + ' <strong>' + e(event.title) +
    '</strong><small>' + fullDate(event.starts_at) + (event.canceled ? ' · Inställt' : event.attendance_finalized ? ' · Närvaro sparad' : ' · ' + event.expected_count + ' bokade') +
    '</small></div>' + (event.canceled ? '' : '<div class="actions">' +
    btn(event.attendance_finalized ? 'Ändra närvaro' : 'Rapportera närvaro','attendance/'+event.id,event.attendance_finalized ? '' : 'primary') +
    btn('Markera inställt','cancel/'+event.id,'danger') + '</div>') + '</div>').join('')
  const official = pending.filter(event=>event.official)
  const regular = pending.filter(event=>!event.official)
  return header + '<section class="card"><h3>' + icon('calendar') + ' Officiella tillfällen att följa upp</h3>' +
    (official.length ? rows(official) : '<p class="kicker">Inga officiella tillfällen väntar.</p>') +
    '</section>' + (regular.length ? '<details class="card officer-history"><summary>Övriga speltillfällen · ' + regular.length + '</summary>' + rows(regular) + '</details>' : '') +
    '<section class="card officer-history"><h3>' + icon('sword') + ' Dungeon · kontrollera Armory</h3>' +
    '<p>Öppna gruppen för att se om karaktärernas utrustning synkar. Prova före start och igen efter ett utrustningsbyte och utloggning.</p>' +
    ((demo ? [] : state.events || []).filter(event => event.kind === 'dungeon' && !event.canceled).slice(-12).reverse().map(event =>
      '<div class="row"><div><strong>' + e(event.title) + '</strong><small>' + fullDate(event.starts_at) + '</small></div>' +
      btn('Visa grupp','details/'+event.id) + '</div>').join('') || '<p class="kicker">Här visas planerade och genomförda dungeontillfällen.</p>') +
    '</section>' + (reviewed.length ? '<details class="card officer-history" id="officer-history"' + (officerHistory ? ' open' : '') +
    '><summary>Tidigare uppföljda · ' + reviewed.length + '</summary>' + rows(reviewed) + '</details>' : '')
}

export { officersPage, raidLootCatalog, raidLootRanking }
