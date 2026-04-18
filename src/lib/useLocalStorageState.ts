import { useEffect, useState } from 'react'
import { readLocalStorageJson, writeLocalStorageJson } from './storage'

export function useLocalStorageState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = readLocalStorageJson<T>(key)
    if (saved !== undefined) return saved
    return typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue
  })

  useEffect(() => {
    writeLocalStorageJson(key, value)
  }, [key, value])

  return [value, setValue]
}
