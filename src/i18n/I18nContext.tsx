import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Ability } from '../types'

export type Locale = 'pt-BR' | 'en'

type I18n = {
  locale: Locale
  abilityShort: (ability: Ability) => string
  abilityLong: (ability: Ability) => string
}

const I18nContext = createContext<I18n | null>(null)

const PT_ABILITIES: Record<Ability, { short: string; long: string }> = {
  str: { short: 'FOR', long: 'Força' },
  dex: { short: 'DES', long: 'Destreza' },
  con: { short: 'CON', long: 'Constituição' },
  int: { short: 'INT', long: 'Inteligência' },
  wis: { short: 'SAB', long: 'Sabedoria' },
  cha: { short: 'CAR', long: 'Carisma' },
}

const EN_ABILITIES: Record<Ability, { short: string; long: string }> = {
  str: { short: 'STR', long: 'Strength' },
  dex: { short: 'DEX', long: 'Dexterity' },
  con: { short: 'CON', long: 'Constitution' },
  int: { short: 'INT', long: 'Intelligence' },
  wis: { short: 'WIS', long: 'Wisdom' },
  cha: { short: 'CHA', long: 'Charisma' },
}

export function I18nProvider(props: { locale?: Locale; children: ReactNode }) {
  const locale: Locale = props.locale ?? 'pt-BR'

  const value = useMemo<I18n>(() => {
    const abilities = locale === 'pt-BR' ? PT_ABILITIES : EN_ABILITIES
    return {
      locale,
      abilityShort: (a) => abilities[a]?.short ?? String(a).toUpperCase(),
      abilityLong: (a) => abilities[a]?.long ?? String(a).toUpperCase(),
    }
  }, [locale])

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within <I18nProvider>.')
  }
  return ctx
}
