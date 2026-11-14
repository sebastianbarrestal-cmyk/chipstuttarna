import { raidCatalog } from './data.js'

const everloot = 'https://everloot.app'
const itemApi = 'https://api.ahledger.com'
const qualityNames = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact', 'heirloom']
const syncInterval = 6 * 3600000
const retryInterval = 15 * 60000
const dropPath = '/api/rollups/drops'
let catalogRefresh

async function publicJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' })
  if (!response.ok) throw new Error('Public raid data HTTP ' + response.status)
  return response.json()
}

function npcName(value) {
  return String(value ?? '').trim().toLowerCase()
}

function raidBoss(row) {
  for (const raid of raidCatalog) {
    if (raid.id === 'onyxias-lair') {
      if (row.sourceNpcId === 10184) return { raid: raid.id, boss: 'Onyxia' }
      continue
    }
    const boss = raid.bosses.find(name => npcName(name) === npcName(row.sourceName))
    if (boss) return { raid: raid.id, boss }
  }
  return null
}

async function itemMetadata(id) {
  const body = await publicJson(itemApi + '/v1/items/' + id + '?game=forever')
  const item = body.item ?? body
  const quality = typeof item.quality === 'number' ? qualityNames[item.quality] : String(item.quality ?? '').toLowerCase()
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, 140) : ''
  if (!name || !qualityNames.includes(quality)) return null
  return { name, quality, fetchedAt: Date.now() }
}

async function refreshRaidDrops(snapshot) {
  const now = Date.now()
  const start = snapshot.next ?? everloot + dropPath + '?limit=500'
  let next = start
  let dataAsOf = snapshot.dataAsOf ?? null
  const rates = new Map((snapshot.next ? snapshot.pending : []).map(row => [row.key, row]))
  const metadata = { ...snapshot.metadata }
  let feedError = false
  try {
    for (let page = 0; next && page < 12; page++) {
      const url = new URL(next, everloot)
      if (url.origin !== everloot || url.pathname !== dropPath) throw new Error('Invalid drop page')
      const body = await publicJson(url.href)
      if (body.unreachable || !Array.isArray(body.rates) || !(body.next === null || typeof body.next === 'string')) {
        throw new Error('Invalid drop response')
      }
      dataAsOf = typeof body.dataAsOf === 'string' ? body.dataAsOf : null
      for (const row of body.rates) {
        if (!row.public || !Number.isSafeInteger(row.sourceNpcId) || row.sourceNpcId < 1 || !Number.isSafeInteger(row.itemId) || row.itemId < 1 ||
            !Number.isSafeInteger(row.kills) || row.kills < 1 || !Number.isSafeInteger(row.drops) || row.drops < 1 || row.drops > row.kills) continue
        const match = raidBoss(row)
        if (!match) continue
        const key = match.raid + ':' + match.boss + ':' + row.itemId
        const record = { ...match, key, itemId: row.itemId, samples: row.kills, chance: row.drops / row.kills * 100 }
        if ((rates.get(key)?.samples ?? 0) < record.samples) rates.set(key, record)
      }
      if (body.next === next) throw new Error('Repeated drop page')
      next = body.next
    }
  } catch {
    feedError = true
  }
  const observations = next || feedError ? snapshot.observations : [...rates.values()]
  const builtInIds = raidCatalog.flatMap(raid => raid.items.map(item => item.itemId).filter(Boolean))
  const ids = [...new Set([...builtInIds, ...(observations || []).map(row => row.itemId)])]
  const refreshIds = ids.filter(id => !metadata[id] || now - metadata[id].fetchedAt > 7 * 86400000)
    .sort((a,b) => (metadata[a]?.fetchedAt ?? 0) - (metadata[b]?.fetchedAt ?? 0)).slice(0,16)
  for (let offset = 0; offset < refreshIds.length; offset += 5) {
    const results = await Promise.allSettled(refreshIds.slice(offset,offset+5).map(async id => {
      const item = await itemMetadata(id)
      if (item) metadata[id] = item
    }))
    if (results.every(result => result.status === 'rejected')) break
  }
  if (feedError) return { ...snapshot, metadata, error: true }
  return { observations: observations ?? [], pending: next ? [...rates.values()] : [], next, metadata, dataAsOf,
    syncedAt: next ? snapshot.syncedAt : now, error: false }
}

async function readRaidDrops(db, context) {
  const row = await db.prepare('SELECT checked_at, snapshot FROM raid_drop_sync WHERE id = 1').first()
  const snapshot = row ? JSON.parse(row.snapshot) : {}
  const now = Date.now()
  const interval = snapshot.error || snapshot.next ? retryInterval : syncInterval
  if (!row || now - row.checked_at >= interval) {
    if (!catalogRefresh) {
      catalogRefresh = (async () => {
        const refreshed = await refreshRaidDrops(snapshot)
        await db.prepare(`INSERT INTO raid_drop_sync (id, checked_at, snapshot) VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at, snapshot=excluded.snapshot
          WHERE excluded.checked_at > raid_drop_sync.checked_at`).bind(now, JSON.stringify(refreshed)).run()
      })().catch(error => console.error('Raid catalog sync:', error.message)).finally(() => { catalogRefresh = null })
    }
    context?.waitUntil(catalogRefresh)
  }
  const { observations = [], metadata = {}, syncedAt = null, error = false } = snapshot
  return { observations, metadata, syncedAt, error, updating: Boolean(catalogRefresh || snapshot.next) }
}

export { readRaidDrops }
