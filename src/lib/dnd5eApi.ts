import type { DndApiRef, DndSpell, SpellListResponse } from '../types'
import { readCachedLocalStorage, writeCachedLocalStorage } from './storage'

const API_BASE = 'https://www.dnd5eapi.co'

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} fetching ${url}${text ? `: ${text}` : ''}`)
  }
  return (await res.json()) as T
}

const SPELL_LIST_KEY = 'dndmm.cache.spellList.v1'
const SPELL_DETAIL_PREFIX = 'dndmm.cache.spellDetail.v1.'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function listSpells(signal?: AbortSignal): Promise<DndApiRef[]> {
  const cached = readCachedLocalStorage<SpellListResponse>(SPELL_LIST_KEY, 7 * ONE_DAY_MS)
  if (cached) return cached.results
  const data = await fetchJson<SpellListResponse>(`${API_BASE}/api/spells`, signal)
  writeCachedLocalStorage(SPELL_LIST_KEY, data)
  return data.results
}

export async function getSpell(index: string, signal?: AbortSignal): Promise<DndSpell> {
  const key = `${SPELL_DETAIL_PREFIX}${index}`
  const cached = readCachedLocalStorage<DndSpell>(key, 30 * ONE_DAY_MS)
  if (cached) return cached
  const data = await fetchJson<DndSpell>(`${API_BASE}/api/spells/${index}`, signal)
  writeCachedLocalStorage(key, data)
  return data
}
