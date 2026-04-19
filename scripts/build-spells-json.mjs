import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const API_BASE = 'https://www.dnd5eapi.co'
const OUT_FILE = resolve(process.cwd(), 'public', 'spells.v1.json')
const OUT_METAMAGIC_FILE = resolve(process.cwd(), 'public', 'metamagics.v1.json')

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

function buildMetamagicsPayloadV1() {
  // NOTE: This list is intentionally static and kept in-repo so the app can work fully offline.
  // It includes short PT-BR paraphrases for quick in-app reference.
  // IDs are stable and used in Character.metamagics.
  const metamagics = [
    {
      id: 'careful-spell',
      nameEn: 'Careful Spell',
      namePt: 'Feitiço Cuidadoso',
      descPt: [
        'Gaste 1 ponto ao conjurar magia com TR: escolha até seu mod. Carisma (mín. 1).',
        'As criaturas escolhidas passam automaticamente no TR.',
      ],
    },
    {
      id: 'distant-spell',
      nameEn: 'Distant Spell',
      namePt: 'Feitiço Distante',
      descPt: [
        'Gaste 1 ponto: dobre o alcance de uma magia (>= 1,5 m).',
        'Ou transforme alcance de toque em 9 m.',
      ],
    },
    {
      id: 'empowered-spell',
      nameEn: 'Empowered Spell',
      namePt: 'Feitiço Potencializado',
      descPt: [
        'Gaste 1 ponto ao rolar dano: rerrole até mod. Carisma (mín. 1) dados de dano e use os novos.',
        'Pode combinar com outra Metamagia na mesma conjuração.',
      ],
    },
    {
      id: 'extended-spell',
      nameEn: 'Extended Spell',
      namePt: 'Feitiço Estendido',
      descPt: [
        'Gaste 1 ponto: dobre a duração de uma magia (>= 1 minuto), até 24h.',
      ],
    },
    {
      id: 'heightened-spell',
      nameEn: 'Heightened Spell',
      namePt: 'Feitiço Intensificado',
      descPt: [
        'Gaste 3 pontos: 1 alvo tem desvantagem no primeiro TR contra a magia.',
      ],
    },
    {
      id: 'quickened-spell',
      nameEn: 'Quickened Spell',
      namePt: 'Feitiço Acelerado',
      descPt: [
        'Gaste 2 pontos: conjuração de 1 ação vira ação bônus (para essa magia).',
      ],
    },
    {
      id: 'seeking-spell',
      nameEn: 'Seeking Spell',
      namePt: 'Feitiço Buscador',
      descPt: [
        'Se errar um ataque de magia, gaste 2 pontos para rerrolar o d20 e usar o novo resultado.',
        'Pode combinar com outra Metamagia na mesma conjuração.',
      ],
    },
    {
      id: 'seeking-spell-ua',
      nameEn: 'Seeking Spell (UA)',
      namePt: 'Feitiço Buscador (UA)',
      descPt: [
        'Gaste 1 ponto: a magia ignora meia cobertura e 3/4 contra os alvos (ataque de magia ou TR de Des).',
      ],
    },
    {
      id: 'subtle-spell',
      nameEn: 'Subtle Spell',
      namePt: 'Feitiço Sutil',
      descPt: [
        'Gaste 1 ponto: conjure sem componentes verbais e somáticos.',
      ],
    },
    {
      id: 'transmuted-spell',
      nameEn: 'Transmuted Spell',
      namePt: 'Feitiço Transmutado',
      descPt: [
        'Gaste 1 ponto: troque o tipo de dano entre ácido, frio, fogo, relâmpago, veneno e trovão.',
      ],
    },
    {
      id: 'twinned-spell',
      nameEn: 'Twinned Spell',
      namePt: 'Feitiço Duplicado',
      descPt: [
        'Gaste pontos iguais ao nível da magia (truque = 1) para afetar 2 alvos com a mesma magia.',
        'Só vale para magias que miram 1 criatura (não “self”) e não podem mirar mais de 1 no nível atual.',
      ],
    },
  ]

  return {
    version: 1,
    generatedAt: Date.now(),
    metamagics,
  }
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

await mkdir(resolve(process.cwd(), 'public'), { recursive: true })

// Always (re)write the metamagic list.
await writeFile(OUT_METAMAGIC_FILE, JSON.stringify(buildMetamagicsPayloadV1()))
process.stdout.write('Wrote metamagics to public/metamagics.v1.json\n')

if (await existsFreshEnough()) {
  process.stdout.write('Spell DB already present and fresh; skipping.\n')
  process.exit(0)
}

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
