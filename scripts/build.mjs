import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'

await rm('dist/server', { recursive: true, force: true })
await mkdir('dist/server', { recursive: true })
await mkdir('dist/.openai', { recursive: true })
const files = {
  '/': ['ui/index.html', 'text/html; charset=utf-8'],
  '/style.css': ['ui/style.css', 'text/css; charset=utf-8'],
  '/guild-icon.png': ['assets/guild-icon.png', 'image/png'],
  '/guild-mark.webp': ['assets/guild-mark.webp', 'image/webp'],
  '/guild-logo.webp': ['assets/guild-logo.webp', 'image/webp'],
  '/choppergang.webp': ['assets/choppergang.webp', 'image/webp'],
}
for (const name of await readdir('ui')) {
  if (name.endsWith('.js')) files['/' + name] = ['ui/' + name, 'text/javascript; charset=utf-8']
}
const assets = {}
for (const [url, [file, type]] of Object.entries(files)) {
  const bytes = await readFile(file)
  const binary = !type.startsWith('text/')
  assets[url] = { type, body: binary ? bytes.toString('base64') : bytes.toString(), binary }
}
const raidCatalog = JSON.parse(await readFile('data/raids.json', 'utf8'))
for (const name of await readdir('worker')) {
  if (name.endsWith('.js')) await copyFile('worker/' + name, 'dist/server/' + name)
}
await writeFile('dist/server/data.js', 'export const assets = ' + JSON.stringify(assets) +
  '\nexport const raidCatalog = ' + JSON.stringify(raidCatalog) + '\n')
try {
  await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await rm('dist/.openai/hosting.json', { force: true })
}
