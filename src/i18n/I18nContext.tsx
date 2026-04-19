import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Ability } from '../types'

export type Locale = 'pt-BR' | 'en'

export type I18nKey =
  | 'spell.ritual'
  | 'effects.forcedMove'
  | 'effects.forcedMove.distance'
  | 'effects.forcedMove.direction'
  | 'effects.forcedMove.direction.any'
  | 'effects.forcedMove.direction.towards'
  | 'effects.forcedMove.direction.away'
  | 'effects.forcedMove.direction.direction'
  | 'effects.forcedMove.reference'
  | 'effects.forcedMove.reference.placeholder'
  | 'effects.forcedMove.directionText'
  | 'effects.forcedMove.directionText.placeholder'

type I18n = {
  locale: Locale
  abilityShort: (ability: Ability) => string
  abilityLong: (ability: Ability) => string
  t: (key: I18nKey) => string
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

const MESSAGES: Record<Locale, Record<I18nKey, string>> = {
  'pt-BR': {
    'spell.ritual': 'Ritual',
    'effects.forcedMove': 'Deslocamento',
    'effects.forcedMove.distance': 'Distância (m)',
    'effects.forcedMove.direction': 'Direção',
    'effects.forcedMove.direction.any': 'Qualquer direção',
    'effects.forcedMove.direction.towards': 'Para perto de X',
    'effects.forcedMove.direction.away': 'Para longe de X',
    'effects.forcedMove.direction.direction': 'Uma direção',
    'effects.forcedMove.reference': 'X (referência)',
    'effects.forcedMove.reference.placeholder': 'ex: você / o conjurador / o alvo / X',
    'effects.forcedMove.directionText': 'Direção (texto)',
    'effects.forcedMove.directionText.placeholder': 'ex: norte / em linha reta / até a borda…',
  },
  en: {
    'spell.ritual': 'Ritual',
    'effects.forcedMove': 'Forced movement',
    'effects.forcedMove.distance': 'Distance (m)',
    'effects.forcedMove.direction': 'Direction',
    'effects.forcedMove.direction.any': 'Any direction',
    'effects.forcedMove.direction.towards': 'Towards X',
    'effects.forcedMove.direction.away': 'Away from X',
    'effects.forcedMove.direction.direction': 'A direction',
    'effects.forcedMove.reference': 'X (reference)',
    'effects.forcedMove.reference.placeholder': 'e.g. you / the caster / the target / X',
    'effects.forcedMove.directionText': 'Direction (text)',
    'effects.forcedMove.directionText.placeholder': 'e.g. north / straight line / to the edge…',
  },
}

export function I18nProvider(props: { locale?: Locale; children: ReactNode }) {
  const locale: Locale = props.locale ?? 'pt-BR'

  const value = useMemo<I18n>(() => {
    const abilities = locale === 'pt-BR' ? PT_ABILITIES : EN_ABILITIES
    return {
      locale,
      abilityShort: (a) => abilities[a]?.short ?? String(a).toUpperCase(),
      abilityLong: (a) => abilities[a]?.long ?? String(a).toUpperCase(),
      t: (key) => MESSAGES[locale]?.[key] ?? MESSAGES['pt-BR'][key] ?? key,
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
