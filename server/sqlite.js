import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const migrations = new URL('../drizzle/', import.meta.url)

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function migrate(db) {
  const { entries } = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8'))
  transaction(db, () => {
    db.exec('CREATE TABLE IF NOT EXISTS home_migrations (tag TEXT PRIMARY KEY)')
    const applied = db.prepare('SELECT 1 FROM home_migrations WHERE tag=?')
    const record = db.prepare('INSERT INTO home_migrations (tag) VALUES (?)')
    for (const { tag } of entries) {
      if (applied.get(tag)) continue
      db.exec(readFileSync(new URL(tag + '.sql', migrations), 'utf8'))
      record.run(tag)
    }
  })
}

function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL')
    migrate(db)
  } catch (error) {
    db.close()
    throw error
  }
  const changes = db.prepare('SELECT changes() AS count')
  const execute = new WeakMap()

  function bindStatement(statement, args = []) {
    const binding = {
      bind: (...values) => bindStatement(statement, values),
      first: () => statement.get(...args) ?? null,
      all: () => ({ results: statement.all(...args) }),
      run: () => ({ meta: { changes: statement.run(...args).changes } }),
    }
    execute.set(binding, () => {
      if (!statement.columns().length) return { results: [], ...binding.run() }
      const { results } = binding.all()
      return { results, meta: { changes: changes.get().count } }
    })
    return binding
  }

  return {
    prepare: sql => bindStatement(db.prepare(sql)),
    batch: statements => transaction(db, () => statements.map(statement => execute.get(statement)())),
    close: () => db.close(),
  }
}

export { openDatabase }
