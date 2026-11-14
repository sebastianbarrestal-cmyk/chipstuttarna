import { createServer } from 'node:http'
import { isIP } from 'node:net'
import app from '../dist/server/index.js'

const maxBodyBytes = 64 * 1024

async function readBody(incoming) {
  if (incoming.method === 'GET' || incoming.method === 'HEAD') {
    incoming.resume()
    return
  }
  const chunks = []
  let size = 0
  // Keep the socket open long enough to return a 413 if the request exceeds the limit.
  for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > maxBodyBytes) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

function requestHeaders(incoming, trustCaddy) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (name.startsWith('oai-authenticated-') || ['cf-connecting-ip', 'x-chipstuttarna-client-ip'].includes(name)) continue
    headers.set(name, value)
  }
  const proxyIP = incoming.headers['x-chipstuttarna-client-ip']
  const ip = trustCaddy && isIP(proxyIP) ? proxyIP : incoming.socket.remoteAddress
  if (ip) headers.set('cf-connecting-ip', ip)
  return headers
}

function createHttpServer(env, { trustCaddy = false } = {}) {
  const origin = env.GUILD_PUBLIC_ORIGIN
  const pending = new Set()
  const context = {
    waitUntil(work) {
      const task = Promise.resolve(work).catch(() => console.error('Bakgrundsjobbet misslyckades.'))
        .finally(() => pending.delete(task))
      pending.add(task)
    },
  }
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, async (incoming, outgoing) => {
    try {
      if (!['GET', 'HEAD', 'POST'].includes(incoming.method)) {
        outgoing.writeHead(405, { Allow: 'GET, HEAD, POST' }).end()
        return
      }
      const target = incoming.url
      if (!target?.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
        outgoing.writeHead(400).end()
        return
      }
      const body = await readBody(incoming)
      if (body === null) {
        outgoing.writeHead(413, { Connection: 'close' }).end()
        return
      }
      const request = new Request(origin + target, {
        method: incoming.method,
        headers: requestHeaders(incoming, trustCaddy),
        body,
      })
      const response = await app.fetch(request, env, context)
      const headers = Object.fromEntries(response.headers)
      if (response.headers.has('set-cookie')) headers['set-cookie'] = response.headers.getSetCookie()
      const bytes = response.body ? Buffer.from(await response.arrayBuffer()) : undefined
      outgoing.writeHead(response.status, headers).end(bytes)
    } catch (error) {
      if (incoming.aborted || outgoing.destroyed) return
      console.error('HTTP-anrop misslyckades:', error.name)
      outgoing.writeHead(500).end()
    }
  })
  return {
    server,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await Promise.all([...pending])
    },
  }
}

export { createHttpServer }
