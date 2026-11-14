import { parseArmoryUrl } from './armory-links.js'

const armoryRefreshAge = 15 * 60000
const armoryManualAge = 45000
const armoryRequests = new Map()
let battleNetToken
let battleNetTokenRequest
const equipmentSlots = ['HEAD','NECK','SHOULDER','SHIRT','CHEST','WAIST','LEGS','FEET','WRIST','HANDS',
  'FINGER_1','FINGER_2','TRINKET_1','TRINKET_2','BACK','MAIN_HAND','OFF_HAND','RANGED','TABARD']

function armoryFailure(status) {
  return Object.assign(new Error(status), { armoryStatus: status })
}

function armoryText(value) {
  return typeof value === 'string' ? value.trim().slice(0, 130) : ''
}

function slotName(value) {
  const name = armoryText(value).toUpperCase().replace(/[ -]/g, '_').replace(/([A-Z])([12])$/, '$1_$2')
  return ({ SHOULDERS:'SHOULDER', MAINHAND:'MAIN_HAND', OFFHAND:'OFF_HAND', CLOAK:'BACK' })[name] ?? name
}

function readEquipment(root) {
  const keys = ['equipped_items','equippedItems','equipment','characterEquipment','equippedGear','gear','items','slots','data','character','profile','characterProfile','summary']
  function find(node, depth) {
    if (!node || typeof node !== 'object' || depth > 7) return null
    if (Array.isArray(node)) return node
    for (const key of keys) {
      const list = find(node[key], depth + 1)
      if (list) return list
    }
    const slots = Object.entries(node).filter(([key]) => equipmentSlots.includes(slotName(key)))
    return slots.length ? slots.map(([slot,item]) => ({ ...item, slot })) : null
  }
  const raw = find(root, 0)
  if (!raw || raw.length > 80) throw armoryFailure('format')
  const items = new Map()
  for (const entry of raw) {
    const slot = slotName(entry?.slot?.type ?? entry?.slot?.name ?? entry?.slot?.id ?? entry?.slot)
    const id = Number(entry?.item?.id ?? entry?.itemId ?? entry?.item_id ?? entry?.id)
    if (!equipmentSlots.includes(slot) || !Number.isSafeInteger(id) || id < 1) continue
    const name = armoryText(entry.name?.en_GB ?? entry.name?.en_US ?? entry.name ?? entry.item?.name) || 'Föremål #' + id
    const level = Number(entry.level?.value ?? entry.itemLevel?.value ?? entry.itemLevel ?? entry.level)
    items.set(slot, { slot, id, name, level: Number.isInteger(level) && level > 0 ? level : null })
  }
  if (raw.length && !items.size) throw armoryFailure('format')
  return equipmentSlots.flatMap(slot => items.has(slot) ? [items.get(slot)] : [])
}

function publicArmoryState(html) {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)
  for (const [,attributes,body] of scripts) {
    if (/\bid=["']characterProfileInitialState["']/i.test(attributes)) return JSON.parse(body)
    const assignment = /\bcharacterProfileInitialState["']?\s*[:=]\s*/.exec(body)
    if (!assignment) continue
    const rest = body.slice(assignment.index + assignment[0].length)
    const boundary = rest.search(/[\[{]/)
    if (boundary !== 0) continue
    let depth = 0
    let quoted = false
    let escaped = false
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') quoted = false
      } else if (ch === '"') quoted = true
      else if (ch === '[' || ch === '{') depth++
      else if ((ch === ']' || ch === '}') && --depth === 0) return JSON.parse(rest.slice(0, i + 1))
    }
  }
  throw armoryFailure('format')
}

async function fetchPublicArmoryEquipment(url) {
  const response = await fetch(url, {
    headers: { Accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(7000),
  })
  if (response.status === 404) throw armoryFailure('not_found')
  if (response.status === 429) throw armoryFailure('rate_limited')
  if (response.status === 401 || response.status === 403) throw armoryFailure('web_unavailable')
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location')
    const target = location && parseArmoryUrl(new URL(location, url).href)
    if (!target || target === url) throw armoryFailure('web_unavailable')
    const fromPath = new URL(url).pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/)/i,'').replace(/\/$/,'')
    const toPath = new URL(target).pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/)/i,'').replace(/\/$/,'')
    if (toPath !== fromPath) throw armoryFailure('web_unavailable')
    return fetchPublicArmoryEquipmentOnce(target)
  }
  return parsePublicArmoryResponse(response)
}

async function fetchPublicArmoryEquipmentOnce(url) {
  const response = await fetch(url, { headers:{Accept:'text/html'}, redirect:'manual', signal:AbortSignal.timeout(7000) })
  return parsePublicArmoryResponse(response)
}

async function parsePublicArmoryResponse(response) {
  if (response.status === 404) throw armoryFailure('not_found')
  if (response.status === 429) throw armoryFailure('rate_limited')
  if (!response.ok) throw armoryFailure('web_unavailable')
  const html = await response.text()
  if (html.length > 3500000) throw armoryFailure('format')
  try {
    return readEquipment(publicArmoryState(html))
  } catch {
    throw armoryFailure('format')
  }
}

function hasBattleNetCredentials(env) {
  return Boolean(env.BATTLENET_CLIENT_ID && env.BATTLENET_CLIENT_SECRET)
}

async function getBattleNetToken(env) {
  const cacheKey = env.BATTLENET_CLIENT_ID
  if (battleNetToken?.key === cacheKey && battleNetToken.expiresAt > Date.now() + 60000) return battleNetToken.value
  if (battleNetTokenRequest) return battleNetTokenRequest
  battleNetTokenRequest = (async () => {
    const authorization = 'Basic ' + btoa(env.BATTLENET_CLIENT_ID + ':' + env.BATTLENET_CLIENT_SECRET)
    const response = await fetch('https://oauth.battle.net/token', {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(7000),
      headers:{ Authorization:authorization, 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json' },
      body:'grant_type=client_credentials',
    })
    if (response.status === 401 || response.status === 400) throw armoryFailure('api_auth')
    if (response.status === 429) throw armoryFailure('rate_limited')
    if (!response.ok) throw armoryFailure('unavailable')
    const body = await response.json()
    if (typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(body.expires_in)) throw armoryFailure('api_auth')
    battleNetToken = { key:cacheKey, value:body.access_token, expiresAt:Date.now() + body.expires_in * 1000 }
    return battleNetToken.value
  })().finally(() => { battleNetTokenRequest = null })
  return battleNetTokenRequest
}

async function fetchBattleNetEquipment(env, armoryUrl) {
  const [,region,slug] = /\/forever\/(eu|us|kr|tw)\/armory\/character\/([^/]+)\/?$/i.exec(new URL(armoryUrl).pathname)
  const safeSlug = encodeURIComponent(decodeURIComponent(slug).toLowerCase())
  const apiRegion = region.toLowerCase()
  const url = new URL('https://' + apiRegion + '.api.blizzard.com/profile/wow/character/' + safeSlug + '/equipment')
  url.searchParams.set('namespace', 'profile-forever-' + apiRegion)
  url.searchParams.set('locale', apiRegion === 'kr' ? 'ko_KR' : apiRegion === 'tw' ? 'zh_TW' : apiRegion === 'us' ? 'en_US' : 'en_GB')
  const token = await getBattleNetToken(env)
  const response = await fetch(url.href, {
    headers:{Authorization:'Bearer ' + token, Accept:'application/json'}, redirect:'error', signal:AbortSignal.timeout(7000),
  })
  if (response.status === 401) {
    battleNetToken = null
    throw armoryFailure('api_auth')
  }
  if (response.status === 403) throw armoryFailure('api_auth')
  if (response.status === 404) throw armoryFailure('not_found')
  if (response.status === 429) throw armoryFailure('rate_limited')
  if (!response.ok) throw armoryFailure('unavailable')
  return readEquipment(await response.json())
}

function armorySummary(row) {
  return {
    status: row?.status ?? 'pending',
    checked_at: row?.checked_at ?? null,
    synced_at: row?.synced_at ?? null,
    changed_at: row?.changed_at ?? null,
  }
}

function armoryDetails(row) {
  return { ...armorySummary(row), equipment: row?.equipment ? JSON.parse(row.equipment) : null,
    previous_equipment: row?.previous_equipment ? JSON.parse(row.previous_equipment) : null }
}

async function syncArmory(db, env, character, manual) {
  const url = parseArmoryUrl(character.armory_url)
  if (!url) return armoryDetails(null)
  const useApi = hasBattleNetCredentials(env)
  const key = character.id + ':' + url
  if (armoryRequests.has(key)) return armoryRequests.get(key)
  const operation = (async () => {
    const saved = await db.prepare('SELECT * FROM armory_equipment WHERE character_id=? AND armory_url=?')
      .bind(character.id, character.armory_url).first()
    const now = Date.now()
    if (saved && (!useApi || !['api_setup_required','web_unavailable','unavailable','format'].includes(saved.status)) && now - saved.checked_at < (manual ? armoryManualAge : armoryRefreshAge)) return armoryDetails(saved)
    const row = { ...saved, status:'ok', checked_at: now }
    try {
      const current = await (useApi ? fetchBattleNetEquipment(env,url) : fetchPublicArmoryEquipment(url))
      const signature = items => JSON.stringify(items.map(({slot,id,level}) => [slot,id,level]))
      if (saved?.equipment && signature(current) !== signature(JSON.parse(saved.equipment))) {
        row.previous_equipment = saved.equipment
        row.changed_at = now
      }
      row.equipment = JSON.stringify(current)
      row.synced_at = now
    } catch (error) {
      row.status = error.armoryStatus ?? 'unavailable'
      if (!useApi && row.status === 'web_unavailable') row.status = 'api_setup_required'
    }
    await db.prepare(`INSERT INTO armory_equipment
      (character_id, armory_url, checked_at, synced_at, status, equipment, previous_equipment, changed_at)
      SELECT id, armory_url, ?, ?, ?, ?, ?, ? FROM characters WHERE id = ? AND armory_url = ? AND archived_at IS NULL
      ON CONFLICT(character_id) DO UPDATE SET armory_url=excluded.armory_url, checked_at=excluded.checked_at,
        synced_at=excluded.synced_at, status=excluded.status, equipment=excluded.equipment,
        previous_equipment=excluded.previous_equipment, changed_at=excluded.changed_at
      WHERE armory_equipment.armory_url != excluded.armory_url OR armory_equipment.checked_at < excluded.checked_at`)
      .bind(now, row.synced_at ?? null, row.status, row.equipment ?? null, row.previous_equipment ?? null,
        row.changed_at ?? null, character.id, character.armory_url).run()
    return armoryDetails(row)
  })().finally(() => armoryRequests.delete(key))
  armoryRequests.set(key, operation)
  return operation
}

export { syncArmory }
