import type { DndSpell } from '../types'

export function spellListClassIndex(classIndex: string): string {
  if (classIndex === 'eldritch_knight') return 'wizard'
  if (classIndex === 'arcane_trickster') return 'wizard'
  return classIndex
}

export function isAllowedSchoolForClass(classIndex: string, spell?: DndSpell): boolean {
  if (!spell?.school?.name) return true
  const school = spell.school.name
  if (classIndex === 'eldritch_knight') return school === 'Abjuration' || school === 'Evocation'
  if (classIndex === 'arcane_trickster') return school === 'Enchantment' || school === 'Illusion'
  return true
}
