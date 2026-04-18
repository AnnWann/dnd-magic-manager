import type { Ability } from '../types'

export const ABILITY_ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const PT_BR_ABILITY: Record<Ability, { short: string; long: string }> = {
  str: { short: 'FOR', long: 'Força' },
  dex: { short: 'DES', long: 'Destreza' },
  con: { short: 'CON', long: 'Constituição' },
  int: { short: 'INT', long: 'Inteligência' },
  wis: { short: 'SAB', long: 'Sabedoria' },
  cha: { short: 'CAR', long: 'Carisma' },
}

export function abilityShortPtBr(a: Ability): string {
  return PT_BR_ABILITY[a]?.short ?? String(a).toUpperCase()
}

export function abilityLongPtBr(a: Ability): string {
  return PT_BR_ABILITY[a]?.long ?? String(a).toUpperCase()
}
