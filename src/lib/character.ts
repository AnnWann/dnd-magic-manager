import type { Ability, Character } from '../types'

export function defaultAbilities(): Record<Ability, number> {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
}

export function newCharacter(name = 'Novo personagem'): Character {
  return {
    id: crypto.randomUUID(),
    name,
    abilities: defaultAbilities(),
    classes: [],
    spells: [],
    proficiencyMode: 'totalLevel',
  }
}
