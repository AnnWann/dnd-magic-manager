export function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function readLocalStorageJson<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(key)
  if (!raw) return undefined
  return safeJsonParse<T>(raw)
}

export function writeLocalStorageJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function removeLocalStorage(key: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(key)
}

export type CachedValue<T> = {
  savedAt: number
  value: T
}

export function readCachedLocalStorage<T>(
  key: string,
  maxAgeMs: number,
): T | undefined {
  const cached = readLocalStorageJson<CachedValue<T>>(key)
  if (!cached) return undefined
  if (Date.now() - cached.savedAt > maxAgeMs) return undefined
  return cached.value
}

export function writeCachedLocalStorage<T>(key: string, value: T): void {
  writeLocalStorageJson(key, { savedAt: Date.now(), value } satisfies CachedValue<T>)
}
