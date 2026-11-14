import { requireValue } from './http.js'

function parseArmoryUrl(value) {
  if (typeof value !== 'string' || value.length > 350) return null
  try {
    const url = new URL(value.trim())
    const profilePath = /^\/(?:[a-z]{2}-[a-z]{2}\/)?forever\/(?:eu|us|kr|tw)\/armory\/character\/[^/]+\/?$/i
    if (url.origin !== 'https://worldofwarcraft.blizzard.com' || url.username || url.password || !profilePath.test(url.pathname)) return null
    return url.origin + url.pathname
  } catch {
    return null
  }
}

function armoryCharacterKey(name) {
  return name.normalize('NFC').trim().toLowerCase().split(/\s+/).join('-')
}

function generatedArmoryUrl(name) {
  const parts = name.split(' ')
  requireValue(parts.length === 2 && parts.every(part => /^[\p{L}\p{M}][\p{L}\p{M}'’\u2010-]*$/u.test(part)),
    'Ange karaktärens förnamn och efternamn, till exempel Meathead Peet.')
  const slug = encodeURIComponent(armoryCharacterKey(name))
  const url = parseArmoryUrl('https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory/character/' + slug)
  requireValue(url, 'Karaktärens namn är för långt för en Armory-länk.')
  return url
}

export { parseArmoryUrl, armoryCharacterKey, generatedArmoryUrl }
