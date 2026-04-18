import { abilityModifier } from './rules'

export function preparedLimitForClass(args: {
  classIndex: string
  classLevel: number
  abilityScore: number
}): number | null {
  const mod = abilityModifier(args.abilityScore)
  const lvl = Math.max(0, Math.trunc(args.classLevel))

  // Prepared casters (5e rules-of-thumb)
  if (args.classIndex === 'cleric') return Math.max(0, mod + lvl)
  if (args.classIndex === 'druid') return Math.max(0, mod + lvl)
  if (args.classIndex === 'wizard') return Math.max(0, mod + lvl)
  if (args.classIndex === 'artificer') return Math.max(0, mod + lvl)
  if (args.classIndex === 'paladin') return Math.max(0, mod + Math.floor(lvl / 2))

  // Known-spell casters (and EK/AT) don't use "prepared" lists
  return null
}
