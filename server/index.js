import { createHttpServer } from './http.js'
import { openDatabase } from './sqlite.js'
import { integrationEnv } from '../dist/server/integration-config.js'
import { runDiscordJobs } from '../dist/server/discord-notices.js'

const env = { ...process.env }
for (const name of ['GUILD_PUBLIC_ORIGIN', 'GUILD_IDENTITY_KEY', 'GUILD_OWNER_EMAIL', 'RESEND_API_KEY', 'GUILD_FROM_EMAIL']) {
  if (!env[name]?.trim()) throw new Error(`Ange ${name} innan du startar hemservern.`)
}
const url = URL.parse(env.GUILD_PUBLIC_ORIGIN)
if (url?.protocol !== 'https:' || url.href !== url.origin + '/') {
  throw new Error('GUILD_PUBLIC_ORIGIN måste vara en HTTPS-adress utan sökväg, som https://guild.example.com.')
}
env.GUILD_PUBLIC_ORIGIN = url.origin
env.DB = openDatabase(env.GUILD_DATABASE_PATH || 'storage/chipstuttarna.sqlite')

const host = env.HOST || '127.0.0.1'
const port = Number(env.PORT || 3000)
const { server, close } = createHttpServer(env, { trustCaddy: env.TRUST_CADDY === '1' })
server.listen(port, host, () => console.info('Chipstuttarna lyssnar på port', server.address().port))

let discordRun
function processDiscordQueue() {
  if (discordRun) return
  discordRun = integrationEnv(env,'discord').then(runDiscordJobs)
    .catch(() => console.error('Discord-kön kunde inte bearbetas.'))
    .finally(() => { discordRun = undefined })
}
processDiscordQueue()
const discordTimer = setInterval(processDiscordQueue, 60_000)
discordTimer.unref()

function shutdown() {
  clearInterval(discordTimer)
  Promise.all([close(), discordRun]).then(() => env.DB.close()).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
