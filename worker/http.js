

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } })
}

function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status })
}

function bounded(value, limit, required = true) {
  requireValue(typeof value === 'string', 'Kontrollera formuläret.')
  const clean = value.trim()
  requireValue(clean.length <= limit && (!required || clean.length > 0), 'Kontrollera längden på textfälten.')
  return clean
}

async function requestJson(request) {
  requireValue(request.method === 'POST', 'Sidan finns inte.', 404)
  requireValue(request.headers.get('origin') === new URL(request.url).origin, 'Öppna formuläret från guildsidan.', 403)
  requireValue(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'Fel format.')
  const raw = await request.text()
  requireValue(raw.length <= 14000, 'Formuläret är för stort.', 413)
  let body
  try { body = JSON.parse(raw) } catch {}
  requireValue(body && typeof body === 'object' && !Array.isArray(body), 'Ogiltigt formulär.')
  return body
}

export { json, bounded, requireValue, requestJson }
