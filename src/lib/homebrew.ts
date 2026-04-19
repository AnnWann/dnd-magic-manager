import type {
  Ability,
  AddedSpell,
  DndApiRef,
  DndSpell,
  HomebrewSpell,
  HomebrewSpellMechanic,
} from '../types'

export function isHomebrewIndex(index: string): boolean {
  return index.startsWith('hb:')
}

export function homebrewToDndSpell(args: { entry: AddedSpell; hb: HomebrewSpell }): DndSpell {
  const mechanic: HomebrewSpellMechanic = args.hb.mechanic ?? 'none'
  const saveAbility: Ability | undefined = args.hb.saveAbility

  const componentsRaw = Array.isArray(args.hb.components) ? args.hb.components : []
  const components = (['V', 'S', 'M'] as const).filter((c) => componentsRaw.includes(c))
  const material = args.hb.material?.trim() ? args.hb.material.trim() : undefined
  const componentsFinal = ((): string[] | undefined => {
    const base = [...components]
    if (material && !base.includes('M')) base.push('M')
    return base.length ? base : undefined
  })()

  const descParts: string[] = []
  if (args.hb.damageDice?.trim()) {
    descParts.push(`Dano: ${args.hb.damageDice.trim()}.`)
  }
  if (args.hb.desc?.trim()) descParts.push(args.hb.desc.trim())

  const dcRef: DndApiRef | undefined =
    mechanic === 'save' || mechanic === 'both'
      ? {
          index: String(saveAbility ?? 'dex').toLowerCase(),
          name: String(saveAbility ?? 'dex').toUpperCase(),
          url: '',
        }
      : undefined

  return {
    index: args.entry.spellIndex,
    name: args.hb.name,
    url: '',
    level: args.hb.level,
    school: { index: args.hb.school.toLowerCase(), name: args.hb.school, url: '' },
    classes: (args.hb.classes ?? []).map((index) => ({ index, name: index, url: '' })),
    components: componentsFinal,
    material: componentsFinal?.includes('M') ? material : undefined,
    range: args.hb.range?.trim() ? args.hb.range.trim() : undefined,
    duration: args.hb.duration?.trim() ? args.hb.duration.trim() : undefined,
    concentration: args.hb.concentration ? true : undefined,
    desc: descParts.length ? descParts : undefined,
    higher_level: args.hb.higherLevel?.trim() ? [args.hb.higherLevel.trim()] : undefined,
    dc: dcRef
      ? {
          dc_type: dcRef,
          dc_success: 'none',
        }
      : undefined,
    attack_type: mechanic === 'attack' || mechanic === 'both' ? 'ranged' : undefined,
  }
}
