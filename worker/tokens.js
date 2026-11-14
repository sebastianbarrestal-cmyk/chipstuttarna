const encoder = new TextEncoder()

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('')
}

function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))))
}

export { hex, randomToken, digest }
