import type { Ability, MagicCircleLevel, ProficiencyMode } from '../types'

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function proficiencyBonus(level: number): number {
  if (level <= 0) return 2
  if (level <= 4) return 2
  if (level <= 8) return 3
  if (level <= 12) return 4
  if (level <= 16) return 5
  return 6
}

export function cantripDiceMultiplier(characterLevel: number): number {
  if (characterLevel >= 17) return 4
  if (characterLevel >= 11) return 3
  if (characterLevel >= 5) return 2
  return 1
}

export function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export function totalLevel(classLevels: number[]): number {
  return classLevels.reduce((acc, level) => acc + level, 0)
}

export function effectiveLevel(
  proficiencyMode: ProficiencyMode,
  totalCharacterLevel: number,
  selectedClassLevel: number,
): number {
  return proficiencyMode === 'classLevel' ? selectedClassLevel : totalCharacterLevel
}

export function spellAttackBonus(args: {
  proficiencyMode: ProficiencyMode
  totalCharacterLevel: number
  classLevel: number
  abilityScore: number
}): number {
  const level = effectiveLevel(
    args.proficiencyMode,
    args.totalCharacterLevel,
    args.classLevel,
  )
  return proficiencyBonus(level) + abilityModifier(args.abilityScore)
}

export function spellSaveDc(args: {
  proficiencyMode: ProficiencyMode
  totalCharacterLevel: number
  classLevel: number
  abilityScore: number
}): number {
  return 8 + spellAttackBonus(args)
}

export function magicCircleOptions(): MagicCircleLevel[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
}

export const ABILITIES: Array<{ key: Ability; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]
