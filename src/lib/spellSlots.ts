import type { CharacterClass } from '../types'

export type SpellSlotsByLevel = number[] // index 0..9, where 1..9 are spell levels

const SPELLCASTING_SLOTS_TABLE: SpellSlotsByLevel[] = [
  // 0 (no spellcasting)
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // 1..20
  [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 2, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 1, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 1, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 2, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 2, 2, 1, 1],
]

export function spellSlotsForSpellcastingLevel(level: number): SpellSlotsByLevel {
  const l = Math.max(0, Math.min(20, Math.trunc(level)))
  return SPELLCASTING_SLOTS_TABLE[l] ?? SPELLCASTING_SLOTS_TABLE[0]
}

export function pactMagicForWarlockLevel(level: number): { slotLevel: number; slots: number } | null {
  const l = Math.max(0, Math.min(20, Math.trunc(level)))
  if (l <= 0) return null

  // Warlock Pact Magic slots (PHB table). Mystic Arcanum (6th+) is not modeled as slots.
  if (l === 1) return { slotLevel: 1, slots: 1 }
  if (l === 2) return { slotLevel: 1, slots: 2 }
  if (l <= 4) return { slotLevel: 2, slots: 2 }
  if (l <= 6) return { slotLevel: 3, slots: 2 }
  if (l <= 8) return { slotLevel: 4, slots: 2 }
  if (l <= 10) return { slotLevel: 5, slots: 2 }
  if (l <= 16) return { slotLevel: 5, slots: 3 }
  return { slotLevel: 5, slots: 4 }
}

function singleClassSpellcastingLevel(cls: CharacterClass): number {
  const level = Math.max(0, Math.min(20, Math.trunc(cls.level)))
  const idx = cls.classIndex
  if (level <= 0) return 0

  // Full casters
  if (
    idx === 'bard' ||
    idx === 'cleric' ||
    idx === 'druid' ||
    idx === 'sorcerer' ||
    idx === 'wizard'
  ) {
    return level
  }

  // Artificer (half, rounded up) and gains Spellcasting at level 1.
  if (idx === 'artificer') {
    return Math.ceil(level / 2)
  }

  // Paladin/Ranger (half) gain Spellcasting at level 2.
  if (idx === 'paladin' || idx === 'ranger') {
    if (level < 2) return 0
    return Math.floor((level + 1) / 2) // == ceil(level/2)
  }

  // EK/AT (third) gain Spellcasting at level 3.
  if (
    idx === 'eldritch_knight' ||
    idx === 'arcane_trickster' ||
    ((idx === 'fighter' || idx === 'rogue') && cls.spellcastingProgression === 'third')
  ) {
    if (level < 3) return 0
    return Math.floor((level + 2) / 3) // == ceil(level/3) for level>=3
  }

  return 0
}

function classSpellcastingKind(cls: CharacterClass):
  | 'full'
  | 'half'
  | 'halfUp'
  | 'third'
  | 'pact'
  | 'none' {
  const idx = cls.classIndex

  // Explicit override for special subclasses.
  if (cls.spellcastingProgression === 'third') return 'third'

  // Pact Magic is separate from the multiclass spellcasting table.
  if (idx === 'warlock') return 'pact'

  // 1/3 casters (already modeled as their own class options in this app)
  if (idx === 'eldritch_knight') return 'third'
  if (idx === 'arcane_trickster') return 'third'

  // Full casters
  if (idx === 'bard') return 'full'
  if (idx === 'cleric') return 'full'
  if (idx === 'druid') return 'full'
  if (idx === 'sorcerer') return 'full'
  if (idx === 'wizard') return 'full'

  // Half casters
  if (idx === 'paladin') return 'half'
  if (idx === 'ranger') return 'half'

  // Artificer counts as half rounded UP for multiclass spell slots.
  if (idx === 'artificer') return 'halfUp'

  // Default: no spell slots progression.
  return 'none'
}

export function multiclassSpellSlots(classes: CharacterClass[]): {
  spellcastingLevel: number
  slotsByLevel: SpellSlotsByLevel
  warlockLevel: number
  pact: { slotLevel: number; slots: number } | null
} {
  let spellcastingLevel = 0
  let warlockLevel = 0

  const slotClasses = classes.filter((c) => {
    const lvl = Math.max(0, Math.min(20, Math.trunc(c.level)))
    if (lvl <= 0) return false
    const kind = classSpellcastingKind(c)
    return kind !== 'none' && kind !== 'pact'
  })

  // If there's only one spellcasting class (excluding warlock pact), use that class table.
  // This matches PHB class/subclass tables (e.g. EK getting 2nd-level slots at fighter 7).
  if (slotClasses.length === 1) {
    const only = slotClasses[0]
    const single = singleClassSpellcastingLevel(only)
    const slotsByLevel = spellSlotsForSpellcastingLevel(single)
    // Still compute Pact Magic separately if there are warlock levels.
    for (const cls of classes) {
      const lvl = Math.max(0, Math.min(20, Math.trunc(cls.level)))
      if (lvl <= 0) continue
      if (classSpellcastingKind(cls) === 'pact') warlockLevel += lvl
    }
    warlockLevel = Math.max(0, Math.min(20, Math.trunc(warlockLevel)))
    const pact = pactMagicForWarlockLevel(warlockLevel)
    return { spellcastingLevel: single, slotsByLevel, warlockLevel, pact }
  }

  for (const cls of classes) {
    const lvl = Math.max(0, Math.min(20, Math.trunc(cls.level)))
    if (lvl <= 0) continue

    const kind = classSpellcastingKind(cls)
    if (kind === 'pact') {
      warlockLevel += lvl
      continue
    }

    if (kind === 'full') spellcastingLevel += lvl
    else if (kind === 'half') spellcastingLevel += Math.floor(lvl / 2)
    else if (kind === 'halfUp') spellcastingLevel += Math.ceil(lvl / 2)
    else if (kind === 'third') spellcastingLevel += Math.floor(lvl / 3)
  }

  spellcastingLevel = Math.max(0, Math.min(20, Math.trunc(spellcastingLevel)))
  warlockLevel = Math.max(0, Math.min(20, Math.trunc(warlockLevel)))

  const slotsByLevel = spellSlotsForSpellcastingLevel(spellcastingLevel)
  const pact = pactMagicForWarlockLevel(warlockLevel)
  return { spellcastingLevel, slotsByLevel, warlockLevel, pact }
}
