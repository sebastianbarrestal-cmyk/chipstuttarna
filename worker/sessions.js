import { digest } from './tokens.js'

const sessionCookie = '__Host-chipstuttarna'
const sessionLifetime = 14 * 86400000

function cookieToken(request) {
  return /(?:^|;\s*)__Host-chipstuttarna=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1]
}

function sessionHeader(token = '', maxAge = 0) {
  return {'Set-Cookie':sessionCookie+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge}
}

async function accountSession(db, request) {
  const token = cookieToken(request)
  if (!token) return null
  return db.prepare(`SELECT m.id, m.name, m.role, m.status FROM guild_sessions s
    JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(await digest(token),Date.now()).first()
}

export { cookieToken, sessionHeader, accountSession, sessionLifetime }
