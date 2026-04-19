import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const API_BASE = 'https://www.dnd5eapi.co'
const OUT_FILE = resolve(process.cwd(), 'public', 'spells.v1.json')

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_AGE_MS = 14 * ONE_DAY_MS

const argv = new Set(process.argv.slice(2))
const force = argv.has('--force') || process.env.FORCE_SPELL_DB === '1'
const skip = process.env.SKIP_SPELL_DB === '1'
const concurrency = Number(process.env.SPELL_DB_CONCURRENCY ?? '8')

if (skip) {
  process.stdout.write('SKIP_SPELL_DB=1 set; skipping spell DB generation.\n')
  process.exit(0)
}

async function existsFreshEnough() {
  try {
    const s = await stat(OUT_FILE)
    if (force) return false
    return Date.now() - s.mtimeMs < MAX_AGE_MS
  } catch {
    return false
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} fetching ${url}${text ? `: ${text}` : ''}`)
  }
  return await res.json()
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker())
  await Promise.all(workers)
  return results
}

if (await existsFreshEnough()) {
  process.stdout.write('Spell DB already present and fresh; skipping.\n')
  process.exit(0)
}

await mkdir(resolve(process.cwd(), 'public'), { recursive: true })

process.stdout.write('Fetching spell list...\n')
const list = await fetchJson(`${API_BASE}/api/spells`)
const results = Array.isArray(list?.results) ? list.results : []

process.stdout.write(`Fetching ${results.length} spell details (concurrency=${concurrency})...\n`)
const details = await mapLimit(results, concurrency, async (ref) => {
  const idx = ref?.index
  if (!idx) return null
  return await fetchJson(`${API_BASE}/api/spells/${encodeURIComponent(idx)}`)
})

const spells = {}
for (const s of details) {
  if (!s || typeof s.index !== 'string') continue
  spells[s.index] = s
}

const payload = {
  version: 1,
  generatedAt: Date.now(),
  spells,
}

await writeFile(OUT_FILE, JSON.stringify(payload))
process.stdout.write(`Wrote ${Object.keys(spells).length} spells to public/spells.v1.json\n`)
