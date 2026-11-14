

const registrationModeSql = "COALESCE((SELECT mode FROM registration_settings WHERE id=1),'open')"
const registrationGuard = `NOT EXISTS(SELECT 1 FROM registration_emails WHERE email=? AND kind='blocked')
  AND (? OR ${registrationModeSql}='open' OR (${registrationModeSql}='invite'
    AND EXISTS(SELECT 1 FROM registration_emails WHERE email=? AND kind='invited')))`

function registrationArgs(email, existing) {
  return [email,Number(existing),email]
}

function mayRegister(db,email,existing) {
  return db.prepare(`SELECT 1 AS allowed WHERE ${registrationGuard}`).bind(...registrationArgs(email,existing)).first()
}

export { registrationArgs, registrationGuard, mayRegister }
