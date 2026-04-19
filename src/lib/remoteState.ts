import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, DndSpell, SpellEffect } from '../types'
import { readLocalStorageJson, writeLocalStorageJson } from './storage'

export type AppStateV1 = {
  version: 1
  characters: Character[]
  activeCharacterId: string

  /** Optional: cached official spell details synced across devices. */
  spellCache?: Record<string, DndSpell>

  /** Optional: reusable modifier presets by spellIndex (synced across devices). */
  effectPresets?: Record<string, SpellEffect[]>
}

const LOCAL_STATE_KEY = 'dndmm.appState.v1'
const SYNC_KEY_STORAGE = 'dndmm.syncKey.v1'

type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'synced'; at: number }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }

function defaultState(): AppStateV1 {
  return { version: 1, characters: [], activeCharacterId: '', spellCache: {}, effectPresets: {} }
}

function getKeyFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  const k = url.searchParams.get('k') ?? url.searchParams.get('key') ?? ''
  return k
}

function removeKeyFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('k')
  url.searchParams.delete('key')
  window.history.replaceState({}, '', url.toString())
}

export function readSyncKey(): string {
  if (typeof window === 'undefined') return ''
  const fromUrl = getKeyFromUrl()
  if (fromUrl) {
    window.localStorage.setItem(SYNC_KEY_STORAGE, fromUrl)
    removeKeyFromUrl()
    return fromUrl
  }
  return window.localStorage.getItem(SYNC_KEY_STORAGE) ?? ''
}

export function writeSyncKey(key: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SYNC_KEY_STORAGE, key)
}

async function apiGetState(syncKey: string): Promise<{ state: AppStateV1 | null }> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(syncKey)}`)
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'API /api/state não encontrada (HTTP 404). Em desenvolvimento local, use "vercel dev" (Vite não executa a pasta /api). Em produção, confirme que o deploy está na Vercel e que a função /api/state existe.',
      )
    }
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return (await res.json()) as { state: AppStateV1 | null }
}

async function apiPutState(syncKey: string, state: AppStateV1): Promise<void> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(syncKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'API /api/state não encontrada (HTTP 404). Em desenvolvimento local, use "vercel dev" (Vite não executa a pasta /api). Em produção, confirme que o deploy está na Vercel e que a função /api/state existe.',
      )
    }
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export function useRemoteAppState() {
  const [syncKey, setSyncKey] = useState<string>(() => readSyncKey())
  const [state, setState] = useState<AppStateV1>(() => {
    return readLocalStorageJson<AppStateV1>(LOCAL_STATE_KEY) ?? defaultState()
  })
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' })

  const stateRef = useRef<AppStateV1>(state)

  const hydratedFromRemote = useRef(false)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    writeLocalStorageJson(LOCAL_STATE_KEY, state)
  }, [state])

  useEffect(() => {
    writeSyncKey(syncKey)
  }, [syncKey])

  const canSync = useMemo(() => syncKey.trim().length >= 12, [syncKey])

  const pullFromServer = useCallback(async () => {
    if (!canSync) {
      setStatus({ kind: 'error', message: 'Chave de sync inválida (mínimo 12 caracteres).' })
      return
    }
    setStatus({ kind: 'loading' })
    try {
      const data = await apiGetState(syncKey)
      hydratedFromRemote.current = true
      if (data.state) {
        setState(data.state)
      } else {
        // Bootstrap: if the key has no remote state yet, persist the current local state
        // so subsequent pulls work across devices without requiring an extra local change.
        await apiPutState(syncKey, stateRef.current)
      }
      setStatus({ kind: 'synced', at: Date.now() })
    } catch (err: unknown) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Falha ao carregar.' })
    }
  }, [canSync, syncKey])

  useEffect(() => {
    if (!canSync) return
    const t = window.setTimeout(() => {
      void pullFromServer()
    }, 0)
    return () => window.clearTimeout(t)
  }, [canSync, pullFromServer, syncKey])

  useEffect(() => {
    if (!canSync) return
    if (!hydratedFromRemote.current) return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setStatus({ kind: 'saving' })

    saveTimer.current = window.setTimeout(() => {
      apiPutState(syncKey, state)
        .then(() => {
          setStatus({ kind: 'synced', at: Date.now() })
        })
        .catch((err: unknown) => {
          setStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Falha ao salvar.',
          })
        })
    }, 800)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [canSync, state, syncKey])

  return {
    syncKey,
    setSyncKey,
    canSync,
    state,
    setState,
    status,
    pullFromServer,
  }
}
