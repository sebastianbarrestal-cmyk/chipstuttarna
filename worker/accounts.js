import { scrypt, timingSafeEqual } from 'node:crypto'
import { json, bounded, requireValue, requestJson } from './http.js'
import { guildMemberId } from './identity.js'
import { hex, randomToken, digest } from './tokens.js'
import { cookieToken, sessionHeader, sessionLifetime } from './sessions.js'
import { registrationArgs, registrationGuard, mayRegister } from './registration.js'

const defaultGuildOrigin = 'https://chipstuttarna.sebastian-barrestal.chatgpt.site'
const linkLifetime = 60 * 60000
const encoder = new TextEncoder()

function nativeAccounts(env) {
  return Boolean(env.RESEND_API_KEY && env.GUILD_FROM_EMAIL)
}

async function passwordHash(password, salt = randomToken()) {
  const key = await new Promise((resolve,reject) => {
    scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:48*1024*1024},(error,result) => error ? reject(error) : resolve(result))
  })
  return salt + ':' + hex(key)
}

async function matchesPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false
  const hash = await passwordHash(password,stored?.split(':')[0] ?? 'dummy-guild-password-salt')
  return Boolean(stored && timingSafeEqual(encoder.encode(hash),encoder.encode(stored)))
}

function normalEmail(value) {
  const email = bounded(value,254).toLowerCase()
  requireValue(/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email),'Ange en giltig e-postadress.')
  return email
}

function normalUsername(value) {
  const name = bounded(value,32).normalize('NFKC')
  requireValue(/^[\p{L}\p{N}_.-]{3,32}$/u.test(name),'Användarnamn ska ha 3–32 tecken. Använd bokstäver, siffror, punkt, bindestreck eller understreck.')
  return name
}

function newPassword(value) {
  requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 256,'Ange ett lösenord med 12–256 tecken.')
  return value
}

async function rateLimit(db, request, area, account = '') {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const now = Date.now()
  const expires = now + 15 * 60000
  const keys = [[area+':ip:'+await digest(ip), area === 'mail' ? 12 : 45]]
  if (account) keys.push([area+':account:'+await digest(account), area === 'mail' ? 3 : 10])
  const statements = keys.map(([key]) => db.prepare(`INSERT INTO guild_auth_limits(id,expires_at,attempts) VALUES(?,?,1)
    ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key,expires,now,now))
  const results = await db.batch(statements)
  requireValue(results.every((result,i)=>result.results[0].attempts<=keys[i][1]),'För många försök. Försök igen om en stund.',429)
}

async function sendAccountLink(env, to, purpose, token) {
  const origin = new URL(env.GUILD_PUBLIC_ORIGIN || defaultGuildOrigin)
  requireValue(origin.protocol === 'https:' && !origin.username && !origin.password,
    'Mejllänkens adress behöver konfigureras.',503)
  const link = origin.origin+'/#'+(purpose === 'reset' ? 'reset-password' : 'verify-account')+'/'+token
  const subject = purpose === 'reset' ? 'Välj nytt lösenord för Chipstuttarna' : 'Verifiera ditt Chipstuttarna-konto'
  const response = await fetch('https://api.resend.com/emails',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(9000),
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'chipstuttarna-'+token},
    body:JSON.stringify({from:env.GUILD_FROM_EMAIL,to:[to],subject,
      text:subject+'\n\n'+link+'\n\nLänken gäller i en timme. Om du inte bad om detta kan du ignorera mejlet.'}),
  }).catch(()=>null)
  requireValue(response?.ok,'Mejlet kunde inte skickas. Försök igen om en stund.',503)
}

async function startAccountLink(env, request, body, purpose) {
  const email = normalEmail(body.email)
  const db = env.DB
  await rateLimit(db,request,'mail',email)
  const credentials = await db.prepare(`SELECT m.status FROM guild_credentials c JOIN members m ON m.id=c.member_id WHERE c.email=?`).bind(email).first()
  let username = null
  let password = null
  if (purpose === 'register') {
    username = normalUsername(body.username)
    const secret = newPassword(body.password)
    if (credentials) return json({ok:true})
    const existingId = await guildMemberId(email,env)
    const existing = await db.prepare('SELECT status FROM members WHERE id=?').bind(existingId).first()
    if (existing && existing.status !== 'active') return json({ok:true})
    requireValue(await mayRegister(db,email,Boolean(existing)), 'Registrering är inte tillgänglig för den här adressen.',403)
    const taken = await db.prepare('SELECT 1 FROM guild_credentials WHERE username=?').bind(username.toLowerCase()).first()
    requireValue(!taken,'Användarnamnet är upptaget.',409)
    password = await passwordHash(secret)
  } else if (credentials?.status !== 'active') {
    return json({ok:true})
  }
  await createAccountLink(env,email,purpose,username,password)
  return json({ok:true})
}

async function createAccountLink(env,email,purpose,username=null,password=null) {
  const db = env.DB
  const token = randomToken()
  const hash = await digest(token)
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM guild_account_links WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM guild_auth_limits WHERE expires_at<=?').bind(now),
    db.prepare('INSERT INTO guild_account_links(token_hash,email,purpose,username,password,expires_at) VALUES(?,?,?,?,?,?)')
      .bind(hash,email,purpose,username,password,now+linkLifetime),
  ])
  try {
    await sendAccountLink(env,email,purpose,token)
  } catch (error) {
    await db.prepare('DELETE FROM guild_account_links WHERE token_hash=?').bind(hash).run()
    throw error
  }
}

async function completeAccountLink(env, request, body, purpose) {
  requireValue(typeof body.token==='string' && /^[a-f0-9]{64}$/.test(body.token),'Länken är ogiltig.',400)
  const password = newPassword(body.password)
  const db = env.DB
  const hash = await digest(body.token)
  await rateLimit(db,request,'verify',hash)
  const now = Date.now()
  const link = await db.prepare('SELECT * FROM guild_account_links WHERE token_hash=? AND expires_at>? AND purpose=?')
    .bind(hash,now,purpose).first()
  requireValue(link,'Länken har gått ut eller redan använts.',410)
  const stillValid = 'EXISTS (SELECT 1 FROM guild_account_links WHERE token_hash=? AND expires_at>?)'
  if (purpose === 'register') {
    requireValue(await matchesPassword(password,link.password),'Ange samma lösenord som när du registrerade dig.',400)
    const memberId = await guildMemberId(link.email,env)
    const owner = link.email === env.GUILD_OWNER_EMAIL?.trim().toLowerCase()
    const username = link.username.toLowerCase()
    const existing = await db.prepare('SELECT status FROM members WHERE id=?').bind(memberId).first()
    const registration = registrationArgs(link.email,Boolean(existing))
    requireValue(await mayRegister(db,link.email,Boolean(existing)), 'Registrering är inte tillgänglig för den här adressen.',403)
    const [,created] = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO members(id,name,role) SELECT ?,?,? WHERE ${stillValid}
        AND ${registrationGuard} AND NOT EXISTS (SELECT 1 FROM guild_credentials WHERE email=? OR username=?)`)
        .bind(memberId,link.username,owner?'owner':'member',hash,now,...registration,link.email,username),
      db.prepare(`INSERT OR IGNORE INTO guild_credentials(member_id,email,username,password)
        SELECT id,?,?,? FROM members WHERE id=? AND status='active' AND ${stillValid} AND ${registrationGuard}`)
        .bind(link.email,username,link.password,memberId,hash,now,...registration),
      db.prepare(`DELETE FROM registration_emails WHERE email=? AND kind='invited' AND changes()>0`).bind(link.email),
      db.prepare(`DELETE FROM guild_account_links WHERE email=? AND purpose=?
        AND EXISTS(SELECT 1 FROM guild_credentials WHERE email=?)`).bind(link.email,purpose,link.email),
    ])
    requireValue(created.meta.changes,'Kontot kunde inte aktiveras. Prova att logga in eller välj ett annat användarnamn.',409)
  } else {
    const stored = await passwordHash(password)
    const [updated] = await db.batch([
      db.prepare(`UPDATE guild_credentials SET password=? WHERE email=? AND ${stillValid}
         AND EXISTS (SELECT 1 FROM members WHERE id=member_id AND status='active')`).bind(stored,link.email,hash,now),
      db.prepare('DELETE FROM guild_sessions WHERE member_id=(SELECT member_id FROM guild_credentials WHERE email=?) AND changes()>0').bind(link.email),
      db.prepare('DELETE FROM guild_account_links WHERE email=? AND purpose=?').bind(link.email,purpose),
    ])
    requireValue(updated.meta.changes,'Kontot är inte tillgängligt.',403)
  }
  return json({ok:true})
}

async function authApi(request, env, path) {
  const body = await requestJson(request)
  const db = env.DB
  if (path==='/api/auth/logout') {
    const token = cookieToken(request)
    if (token) await db.prepare('DELETE FROM guild_sessions WHERE token_hash=?').bind(await digest(token)).run()
    return json({ok:true},200,sessionHeader())
  }
  requireValue(nativeAccounts(env),'Verifieringsmejl är ännu inte anslutna.',503)
  if (path==='/api/auth/register' || path==='/api/auth/forgot') return startAccountLink(env,request,body,path.endsWith('register')?'register':'reset')
  if (path==='/api/auth/verify' || path==='/api/auth/reset') return completeAccountLink(env,request,body,path.endsWith('verify')?'register':'reset')
  requireValue(path==='/api/auth/login','Sidan finns inte.',404)
  const entered = bounded(body.login,254)
  const login = (entered.includes('@') ? entered : entered.normalize('NFKC')).toLowerCase()
  await rateLimit(db,request,'login',login)
  const credentials = await db.prepare(`SELECT c.member_id,c.password,m.status FROM guild_credentials c
    JOIN members m ON m.id=c.member_id WHERE c.email=? OR c.username=?`).bind(login,login).first()
  const matches = await matchesPassword(body.password,credentials?.password)
  requireValue(matches && credentials.status==='active','Inloggningen misslyckades. Kontrollera uppgifterna och att e-posten är verifierad.',401)
  const token = randomToken()
  const now = Date.now()
  const [,saved] = await db.batch([
    db.prepare('DELETE FROM guild_sessions WHERE expires_at<=?').bind(now),
    db.prepare(`INSERT INTO guild_sessions(token_hash,member_id,expires_at)
      SELECT ?,m.id,? FROM members m JOIN guild_credentials c ON c.member_id=m.id
      WHERE m.id=? AND m.status='active' AND c.password=?`)
      .bind(await digest(token),now+sessionLifetime,credentials.member_id,credentials.password),
  ])
  requireValue(saved.meta.changes,'Kontot är inte tillgängligt.',403)
  return json({ok:true},200,sessionHeader(token,sessionLifetime/1000))
}

export { authApi, nativeAccounts, rateLimit, createAccountLink, normalEmail }
