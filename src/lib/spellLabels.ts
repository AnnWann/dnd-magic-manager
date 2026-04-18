import type { Ability, CharacterClass, DndApiRef } from '../types'

export const CLASS_OPTIONS: Array<{ index: string; name: string; defaultAbility: Ability }> = [
  { index: 'artificer', name: 'Artífice', defaultAbility: 'int' },
  { index: 'bard', name: 'Bardo', defaultAbility: 'cha' },
  { index: 'cleric', name: 'Clérigo', defaultAbility: 'wis' },
  { index: 'druid', name: 'Druida', defaultAbility: 'wis' },
  { index: 'eldritch_knight', name: 'Cavaleiro Arcano', defaultAbility: 'int' },
  { index: 'paladin', name: 'Paladino', defaultAbility: 'cha' },
  { index: 'ranger', name: 'Patrulheiro', defaultAbility: 'wis' },
  { index: 'arcane_trickster', name: 'Trapaceiro Arcano', defaultAbility: 'int' },
  { index: 'sorcerer', name: 'Feiticeiro', defaultAbility: 'cha' },
  { index: 'warlock', name: 'Bruxo', defaultAbility: 'cha' },
  { index: 'wizard', name: 'Mago', defaultAbility: 'int' },
]

export const CLASS_NAME_BY_INDEX = Object.fromEntries(
  CLASS_OPTIONS.map((c) => [c.index, c.name] as const),
) as Record<string, string>

export const SCHOOL_NAME_PT: Record<string, string> = {
  Abjuration: 'Abjuração',
  Conjuration: 'Conjuração',
  Divination: 'Adivinhação',
  Enchantment: 'Encantamento',
  Evocation: 'Evocação',
  Illusion: 'Ilusão',
  Necromancy: 'Necromancia',
  Transmutation: 'Transmutação',
}

const API_CLASS_NAME_PT: Record<string, string> = {
  artificer: 'Artífice',
  barbarian: 'Bárbaro',
  bard: 'Bardo',
  cleric: 'Clérigo',
  druid: 'Druida',
  monk: 'Monge',
  paladin: 'Paladino',
  ranger: 'Patrulheiro',
  sorcerer: 'Feiticeiro',
  warlock: 'Bruxo',
  wizard: 'Mago',
  fighter: 'Guerreiro',
  rogue: 'Ladino',
}

export function schoolLabel(name: string): string {
  return SCHOOL_NAME_PT[name] ?? name
}

export function apiClassLabel(ref: DndApiRef): string {
  const byIndex = API_CLASS_NAME_PT[String(ref.index).toLowerCase()]
  if (byIndex) return byIndex
  const byName = API_CLASS_NAME_PT[String(ref.name).toLowerCase()]
  if (byName) return byName
  return ref.name
}

export function classLabel(c: CharacterClass): string {
  return CLASS_NAME_BY_INDEX[c.classIndex] ?? c.className ?? c.classIndex
}

export function classDisplayName(c: CharacterClass): string {
  return `${classLabel(c)} ${c.level}`
}
