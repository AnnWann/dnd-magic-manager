import type { DndApiRef, DndSpell } from '../types'

export type SpellDbPayloadV1 = {
  version: 1
  generatedAt: number
  spells: Record<string, DndSpell>
}

let cachedPayload: SpellDbPayloadV1 | null = null
let inflight: Promise<SpellDbPayloadV1> | null = null

export async function loadSpellDb(signal?: AbortSignal): Promise<SpellDbPayloadV1> {
  if (cachedPayload) return cachedPayload
  if (inflight) return inflight

  inflight = (async () => {
    const res = await fetch('/spells.v1.json', { signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status} fetching /spells.v1.json`)
    }
    const payload = (await res.json()) as SpellDbPayloadV1
    cachedPayload = payload
    return payload
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function spellDbToList(spells: Record<string, DndSpell>): DndApiRef[] {
  return Object.values(spells)
    .filter((s) => s && typeof s.index === 'string' && typeof s.name === 'string')
    .map((s) => ({ index: s.index, name: s.name, url: `/api/spells/${s.index}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}
