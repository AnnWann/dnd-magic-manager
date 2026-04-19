import { Fragment, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type {
  Ability,
  AddedSpell,
  ActionEconomyKey,
  Character,
  ConditionKey,
  DndSpell,
  MagicCircleLevel,
  SpellEffect,
  SpellEffectMode,
  SpellEffectTarget,
} from '../types'
import {
  formatSigned,
  magicCircleOptions,
  spellAttackBonus,
  spellSaveDc,
} from '../lib/rules'
import { homebrewToDndSpell } from '../lib/homebrew'
import { estimateSpellDamageDice, upcastRuleLabel } from '../lib/spellDamage'
import { isAllowedSchoolForClass } from '../lib/spellAccess'
import { spellMeta } from '../lib/spellMeta'
import { castTimeKindFromText, castTimeKindLabelPt, castTimeReactionWhenFromApi } from '../lib/castTime'
import {
  apiClassLabel,
  classDisplayName,
  classLabel,
  schoolLabel,
} from '../lib/spellLabels'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader } from './ui/Card'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Textarea } from './ui/Textarea'
import { InlineMarkdown } from './InlineMarkdown'
import { useI18n } from '../i18n/I18nContext'

type PreparedMeta = {
  limitsByClassId: Record<string, number>
  preparedCountByClassId: Record<string, number>
}

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

function badge(text: string, opts?: { title?: string; limit?: boolean; kind?: 'inline' | 'grid' }) {
  const base =
    'items-center rounded-md border border-accentBorder bg-accentBg px-2 py-1 text-xs leading-4 text-textH whitespace-nowrap'
  const inline = 'inline-flex flex-none'
  const grid = 'inline-flex min-w-0 justify-self-start'
  const limit = 'max-w-[380px] truncate'
  const gridLimit = 'max-w-[380px] truncate'
  return (
    <span
      className={
        `${base} ${opts?.kind === 'grid' ? grid : inline}${opts?.kind === 'grid' ? ` ${gridLimit}` : opts?.limit ? ` ${limit}` : ''}`
      }
      title={opts?.title ?? (opts?.limit ? text : undefined)}
    >
      {text}
    </span>
  )
}

const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export function AddedSpellsCard(props: {
  activeCharacter: Character
  activeCharacterSchools: string[]
  activeCharacterTotalLevel: number
  filteredAddedSpells: AddedSpell[]
  spellDetails: Record<string, DndSpell | undefined>
  spellDetailsError: Record<string, string | undefined>
  preparedMeta: PreparedMeta

  addedNameFilter: string
  setAddedNameFilter: Dispatch<SetStateAction<string>>
  addedLevelFilter: MagicCircleLevel | 'any'
  setAddedLevelFilter: Dispatch<SetStateAction<MagicCircleLevel | 'any'>>
  addedSchoolFilter: string
  setAddedSchoolFilter: Dispatch<SetStateAction<string>>
  addedPreparedFilter: 'any' | 'prepared' | 'notPrepared'
  setAddedPreparedFilter: Dispatch<SetStateAction<'any' | 'prepared' | 'notPrepared'>>
  addedClassFilter: string
  setAddedClassFilter: Dispatch<SetStateAction<string>>

  openSpellIndex: string | null
  setOpenSpellIndex: Dispatch<SetStateAction<string | null>>
  openSpellTab: 'official' | 'modifiers' | 'headcanon'
  setOpenSpellTab: Dispatch<SetStateAction<'official' | 'modifiers' | 'headcanon'>>

  translateStatus: TranslateStatus
  translateOfficialToPt: (args: { spellIndex: string; desc: string[]; higher: string[] }) => Promise<void>

  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
  removeSpellFromActive: (spellIndex: string) => void
}) {
  const { abilityShort } = useI18n()

  const {
    activeCharacter,
    activeCharacterSchools,
    activeCharacterTotalLevel,
    filteredAddedSpells,
    spellDetails,
    spellDetailsError,
    preparedMeta,
    addedNameFilter,
    setAddedNameFilter,
    addedLevelFilter,
    setAddedLevelFilter,
    addedSchoolFilter,
    setAddedSchoolFilter,
    addedPreparedFilter,
    setAddedPreparedFilter,
    addedClassFilter,
    setAddedClassFilter,
    openSpellIndex,
    setOpenSpellIndex,
    openSpellTab,
    setOpenSpellTab,
    translateStatus,
    translateOfficialToPt,
    updateCharacter,
    removeSpellFromActive,
  } = props

  const preparedClasses = activeCharacter.classes
    .map((c) => {
      const limit = preparedMeta.limitsByClassId[c.id]
      if (typeof limit !== 'number') return null
      const used = preparedMeta.preparedCountByClassId[c.id] ?? 0
      return { classId: c.id, label: classLabel(c), used, limit }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  const preparedTotal = preparedClasses.reduce(
    (acc, x) => ({ used: acc.used + x.used, limit: acc.limit + x.limit }),
    { used: 0, limit: 0 },
  )

  const [openUpcastSpellIndex, setOpenUpcastSpellIndex] = useState<string | null>(null)
  const [openMaterialSpellIndex, setOpenMaterialSpellIndex] = useState<string | null>(null)
  const [openDetailsSpellIndex, setOpenDetailsSpellIndex] = useState<string | null>(null)
  const [openDamageInfoSpellIndex, setOpenDamageInfoSpellIndex] = useState<string | null>(null)
  const [openSourceInfoSpellIndex, setOpenSourceInfoSpellIndex] = useState<string | null>(null)

  const effectTargetOptions: Array<{ value: SpellEffectTarget; label: string }> = [
    { value: 'ac', label: 'CA' },
    { value: 'speed', label: 'Deslocamento' },
    { value: 'initiative', label: 'Iniciativa' },
    { value: 'attack', label: 'Ataque (ATQ)' },
    { value: 'save', label: 'Teste de resistência' },
    { value: 'ability', label: 'Atributo' },
    { value: 'condition', label: 'Condição' },
    { value: 'economy', label: 'Remover (ações)' },
  ]

  const conditionOptions: Array<{ value: ConditionKey; label: string }> = [
    { value: 'blinded', label: 'Cegueira' },
    { value: 'deafened', label: 'Surdez' },
    { value: 'frightened', label: 'Amedrontado' },
    { value: 'poisoned', label: 'Envenenado' },
    { value: 'prone', label: 'Caído' },
    { value: 'restrained', label: 'Contido' },
    { value: 'stunned', label: 'Atordoado' },
    { value: 'paralyzed', label: 'Paralisado' },
    { value: 'charmed', label: 'Enfeitiçado' },
  ]

  const modeLabel = (m: SpellEffectMode) =>
    m === 'add'
      ? '+'
      : m === 'sub'
        ? '− (reduz)'
        : m === 'set'
          ? 'Definir'
          : m === 'adv'
            ? 'Vantagem'
            : m === 'dis'
              ? 'Desvantagem'
              : m === 'remove'
                ? 'Remover'
                : 'Aplicar'

  const modeOptionsForTarget = (t: SpellEffectTarget): SpellEffectMode[] => {
    if (t === 'condition') return ['apply']
    if (t === 'economy') return ['remove']
    if (t === 'ability') return ['add', 'sub', 'set']
    if (t === 'ac' || t === 'speed' || t === 'initiative') return ['add', 'sub', 'set']
    return ['add', 'sub', 'set', 'adv', 'dis']
  }

  const abilityLabel = (a: Ability) => abilityShort(a)

  const conditionLabel = (c: ConditionKey) =>
    conditionOptions.find((x) => x.value === c)?.label ?? c

  const economyLabel = (k: ActionEconomyKey): string => {
    if (k === 'action') return 'Ação'
    if (k === 'bonusAction') return 'Ação bônus'
    if (k === 'reaction') return 'Reação'
    if (k === 'movement') return 'Movimento'
    return 'Turno'
  }

  const formatEffectBadge = (eff: SpellEffect): string | null => {
    const round1 = (n: number) => Math.round(n * 10) / 10
    const fmt = (n: number) => {
      const r = round1(n)
      const isInt = Math.abs(r - Math.round(r)) < 1e-9
      return isInt ? String(Math.round(r)) : String(r).replace('.', ',')
    }
    const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : `-${fmt(Math.abs(n))}`)
    const delta = (n: number) => (eff.mode === 'sub' ? -Math.abs(n) : n)
    const needsAbility = eff.target === 'attack' || eff.target === 'save' || eff.target === 'ability'
    const abilitySuffix = needsAbility && eff.ability ? ` ${abilityLabel(eff.ability)}` : ''

    if (eff.mode === 'remove') {
      if (eff.target !== 'economy') return null
      if (!eff.economy) return null
      return `Remove: ${economyLabel(eff.economy)}`
    }

    if (eff.mode === 'apply') {
      if (eff.target !== 'condition') return null
      if (!eff.condition) return null
      return `Condição: ${conditionLabel(eff.condition)}`
    }

    if (eff.mode === 'adv') {
      if (eff.target === 'attack') return `Vantagem ATQ${abilitySuffix}`
      if (eff.target === 'save') return `Vantagem Teste${abilitySuffix}`
      return 'Vantagem'
    }
    if (eff.mode === 'dis') {
      if (eff.target === 'attack') return `Desvantagem ATQ${abilitySuffix}`
      if (eff.target === 'save') return `Desvantagem Teste${abilitySuffix}`
      return 'Desvantagem'
    }

    if (typeof eff.value !== 'number' || Number.isNaN(eff.value)) return null
    const value = eff.mode === 'set' ? eff.value : delta(eff.value)

    if (eff.target === 'ac') return eff.mode === 'set' ? `CA = ${value}` : `CA ${signed(value)}`
    if (eff.target === 'initiative') return eff.mode === 'set' ? `Ini = ${value}` : `Ini ${signed(value)}`
    if (eff.target === 'ability') {
      const a = eff.ability ? abilityLabel(eff.ability) : 'ATR'
      return eff.mode === 'set' ? `${a} = ${value}` : `${a} ${signed(value)}`
    }

    if (eff.target === 'speed') {
      const unit = eff.unit ?? 'ft'
      const meters = unit === 'm' ? value : value * 0.3
      const m = round1(meters)
      return eff.mode === 'set'
        ? `Desloc. = ${fmt(m)} m`
        : `Desloc. ${signed(m)} m`
    }

    if (eff.target === 'attack') {
      return eff.mode === 'set'
        ? `ATQ${abilitySuffix} = ${value}`
        : `ATQ${abilitySuffix} ${signed(value)}`
    }
    if (eff.target === 'save') {
      return eff.mode === 'set'
        ? `Teste${abilitySuffix} = ${value}`
        : `Teste${abilitySuffix} ${signed(value)}`
    }

    return null
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-textH">Magias adicionadas</div>
            <div className="mt-1 text-xs text-text">Aqui aparecem apenas as magias adicionadas.</div>
            {preparedClasses.length ? (
              <div className="mt-2">
                <div className="flex flex-wrap gap-2">
                  <div className="w-full sm:w-[132px]">
                    <div className="text-[11px] text-text">Preparadas (total)</div>
                    <Input readOnly value={`${preparedTotal.used}/${preparedTotal.limit}`} />
                  </div>

                  {preparedClasses.map((x) => (
                    <div key={x.classId} className="w-full sm:w-[132px]">
                      <div className="text-[11px] text-text">{x.label}</div>
                      <Input readOnly value={`${x.used}/${x.limit}`} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="text-xs text-text">{activeCharacter.spells.length} no total</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="text-xs text-text">Nome</label>
            <Input
              className="mt-1 h-9 w-full px-2 text-xs"
              value={addedNameFilter}
              onChange={(e) => setAddedNameFilter(e.target.value)}
              placeholder="ex: fire"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-text">Nível (círculo)</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={addedLevelFilter}
              onChange={(e) => {
                const v = e.target.value
                setAddedLevelFilter(v === 'any' ? 'any' : (Number(v) as MagicCircleLevel))
              }}
            >
              <option value="any">Qualquer</option>
              {magicCircleOptions().map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-text">Escola</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={addedSchoolFilter}
              onChange={(e) => setAddedSchoolFilter(e.target.value)}
            >
              <option value="any">Qualquer</option>
              {activeCharacterSchools.map((s) => (
                <option key={s} value={s}>
                  {schoolLabel(s)}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-text">Preparadas</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={addedPreparedFilter}
              onChange={(e) => setAddedPreparedFilter(e.target.value as typeof addedPreparedFilter)}
            >
              <option value="any">Todas</option>
              <option value="prepared">Só preparadas</option>
              <option value="notPrepared">Só não preparadas</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-text">Fonte</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={addedClassFilter}
              onChange={(e) => setAddedClassFilter(e.target.value)}
            >
              <option value="any">Qualquer</option>
              <option value="feat">Feat</option>
              {activeCharacter.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3 w-full overflow-x-auto rounded-lg border border-border md:overflow-visible">
          <table className="w-full min-w-[980px] table-auto border-collapse md:min-w-full">
            <thead className="bg-accentBg">
              <tr className="text-left text-xs text-text">
                <th className="whitespace-nowrap p-2">Prep.</th>
                <th className="p-2">Nome</th>
                <th className="whitespace-nowrap p-2">Nível</th>
                <th className="p-2">Escola</th>
                <th className="whitespace-nowrap p-2">Comp.</th>
                <th className="p-2">Dano / Detalhes</th>
                <th className="p-2">Conjurar como</th>
                <th className="p-2">Classes (API)</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAddedSpells.length === 0 ? (
                <tr>
                  <td className="p-3 text-sm text-text" colSpan={9}>
                    Nenhuma magia bate com os filtros.
                    <div className="text-xs text-text">{activeCharacter.spells.length} no total</div>
                  </td>
                </tr>
              ) : (
                filteredAddedSpells.map((entry) => {
                  const detail = entry.homebrew
                    ? homebrewToDndSpell({ entry, hb: entry.homebrew })
                    : spellDetails[entry.spellIndex]
                  const err = entry.homebrew ? undefined : spellDetailsError[entry.spellIndex]
                  const apiClasses = (detail?.classes?.map((c) => apiClassLabel(c)) ?? [])
                  const apiClassesFinal = apiClasses.length
                    ? apiClasses
                    : entry.homebrew
                      ? ['(homebrew)']
                      : []
                  const sourceType = entry.sourceType ?? 'class'
                  const castAs =
                    sourceType === 'feat'
                      ? undefined
                      : activeCharacter.classes.find((c) => c.id === entry.sourceClassId)
                  const allowedSchool =
                    castAs && sourceType !== 'feat'
                      ? isAllowedSchoolForClass(castAs.classIndex, detail)
                      : true

                  const castingAbility: Ability | undefined =
                    sourceType === 'feat'
                      ? (entry.featAbility ?? 'cha')
                      : castAs?.castingAbility
                  const castingAbilityScore = castingAbility
                    ? activeCharacter.abilities[castingAbility]
                    : undefined
                  const classLevelForSpell =
                    sourceType === 'feat'
                      ? activeCharacterTotalLevel
                      : (castAs?.level ?? activeCharacterTotalLevel)

                  const atkSpell =
                    castingAbilityScore !== undefined
                      ? spellAttackBonus({
                          proficiencyMode: activeCharacter.proficiencyMode,
                          totalCharacterLevel: activeCharacterTotalLevel,
                          classLevel: classLevelForSpell,
                          abilityScore: castingAbilityScore,
                        })
                      : null

                  const dcSpell =
                    castingAbilityScore !== undefined
                      ? spellSaveDc({
                          proficiencyMode: activeCharacter.proficiencyMode,
                          totalCharacterLevel: activeCharacterTotalLevel,
                          classLevel: classLevelForSpell,
                          abilityScore: castingAbilityScore,
                        })
                      : null

                  const descLower = (detail?.desc ?? []).join(' ').toLowerCase()

                  const saveAbility = ((): Ability | null => {
                    const idx = detail?.dc?.dc_type?.index?.trim()
                    if (idx && (ABILITY_KEYS as string[]).includes(idx)) return idx as Ability
                    const name = detail?.dc?.dc_type?.name?.trim().toLowerCase()
                    if (!name) return null
                    if (name === 'str' || name === 'strength') return 'str'
                    if (name === 'dex' || name === 'dexterity') return 'dex'
                    if (name === 'con' || name === 'constitution') return 'con'
                    if (name === 'int' || name === 'intelligence') return 'int'
                    if (name === 'wis' || name === 'wisdom') return 'wis'
                    if (name === 'cha' || name === 'charisma') return 'cha'
                    return null
                  })()
                  const saveTypeName = saveAbility
                    ? abilityShort(saveAbility)
                    : (detail?.dc?.dc_type?.name?.trim() || undefined)

                  const usesSave = Boolean(saveTypeName) || descLower.includes('saving throw')
                  const usesAttack = typeof detail?.attack_type === 'string' || descLower.includes('spell attack')

                  const displayName = entry.displayNamePt?.trim() || entry.spellName
                  const isOpen = openSpellIndex === entry.spellIndex

                  const spellBaseLevel = (detail?.level ?? 1) as MagicCircleLevel
                  const effectiveSlot = ((): MagicCircleLevel => {
                    if (spellBaseLevel === 0) return 0
                    const v = entry.castSlotLevel
                    if (!v) return spellBaseLevel
                    return (Math.max(spellBaseLevel, v) as MagicCircleLevel) ?? spellBaseLevel
                  })()

                  const damageEstimate = estimateSpellDamageDice({
                    spell: detail,
                    characterLevel: activeCharacterTotalLevel,
                    slotLevel: effectiveSlot,
                  })

                  const textForNumericMods = (() => {
                    if (entry.homebrew) {
                      const a = entry.homebrew.desc ?? ''
                      const b = entry.homebrew.higherLevel ?? ''
                      return `${a}\n${b}`
                    }
                    const desc = entry.officialDescPt?.length
                      ? entry.officialDescPt
                      : (detail?.desc ?? [])
                    const higher = entry.officialHigherLevelPt?.length
                      ? entry.officialHigherLevelPt
                      : (detail?.higher_level ?? [])
                    return `${desc.join('\n')}\n${higher.join('\n')}`
                  })()

                  const meta = spellMeta({
                    spell: detail,
                    hb: entry.homebrew,
                    textForNumericMods,
                  })

                  const castTimeKind =
                    entry.castTimeKind ?? castTimeKindFromText((detail as DndSpell | undefined)?.casting_time)

                  const reactionWhenAuto = castTimeReactionWhenFromApi({
                    castingTime: (detail as DndSpell | undefined)?.casting_time,
                    desc: (detail as DndSpell | undefined)?.desc ?? null,
                  })

                  const manualEffects = entry.effects ?? []

                  const combatBadgeNodes: ReactNode[] = []
                  if (usesAttack && atkSpell !== null) combatBadgeNodes.push(badge(`ATQ\u00A0${formatSigned(atkSpell)}`, { kind: 'grid' }))
                  if (usesSave && dcSpell !== null) combatBadgeNodes.push(badge(`CD\u00A0${dcSpell}`, { kind: 'grid' }))
                  if (usesSave && saveTypeName) {
                    const t = `Teste ${saveTypeName}`
                    const nb = t.split(' ').join('\u00A0')
                    combatBadgeNodes.push(badge(nb, { kind: 'grid', title: t }))
                  }
                  const upcastLabel = upcastRuleLabel(detail)
                  meta.numericMods.forEach((m) => combatBadgeNodes.push(badge(m, { kind: 'grid', title: m })))

                  const infoBadgeNodes: ReactNode[] = []
                  if (castTimeKind) {
                    const label = castTimeKindLabelPt(castTimeKind)
                    const t = `Conjuração: ${label}`
                    const nb = `Conj. ${label}`.split(' ').join('\u00A0')
                    infoBadgeNodes.push(badge(nb, { kind: 'grid', title: t }))
                  }
                  if (meta.range) {
                    const t = `Alc. ${meta.range}`
                    const nb = t.split(' ').join('\u00A0')
                    infoBadgeNodes.push(badge(nb, { kind: 'grid', title: t }))
                  }
                  if (meta.area) {
                    const t = `Área: ${meta.area}`
                    const nb = t.split(' ').join('\u00A0')
                    infoBadgeNodes.push(badge(nb, { kind: 'grid', title: t }))
                  }
                  if (meta.duration) {
                    const t = `Dur. ${meta.duration}`
                    const nb = t.split(' ').join('\u00A0')
                    infoBadgeNodes.push(badge(nb, { kind: 'grid', title: t }))
                  }
                  if (meta.concentration) infoBadgeNodes.push(badge('Concentração', { kind: 'grid' }))
                  manualEffects.forEach((eff) => {
                    const txt = formatEffectBadge(eff)
                    if (txt) {
                      const nb = txt.split(' ').join('\u00A0')
                      infoBadgeNodes.push(badge(nb, { kind: 'grid', title: txt }))
                    }
                  })

                  const slotOptions: MagicCircleLevel[] =
                    spellBaseLevel === 0
                      ? [0]
                      : (magicCircleOptions().filter((x) => x >= spellBaseLevel) as MagicCircleLevel[])

                  const prepClassId = entry.sourceType === 'feat' ? undefined : entry.sourceClassId
                  const prepLimit = prepClassId ? preparedMeta.limitsByClassId[prepClassId] : undefined
                  const prepCount = prepClassId
                    ? (preparedMeta.preparedCountByClassId[prepClassId] ?? 0)
                    : 0
                  const isPrepared = Boolean(entry.prepared)
                  const canPrepare = typeof prepLimit === 'number'
                  const limitReached = canPrepare ? prepCount >= prepLimit : true
                  const disablePrepare = !isPrepared && (!canPrepare || limitReached)
                  const prepTitle = !canPrepare
                    ? 'Esta fonte não usa lista de magias preparadas.'
                    : limitReached && !isPrepared
                      ? `Limite de preparadas atingido (${prepCount}/${prepLimit}).`
                      : `Preparadas: ${prepCount}/${prepLimit}`

                  const isDamageInfoOpen = openDamageInfoSpellIndex === entry.spellIndex
                  const isSourceInfoOpen = openSourceInfoSpellIndex === entry.spellIndex

                  return (
                    <Fragment key={entry.spellIndex}>
                      <tr className="border-t border-border text-sm odd:bg-[color:var(--social-bg)] hover:bg-accentBg">
                        <td className="p-2 align-top text-text" title={prepTitle}>
                          <div className="flex items-center justify-start">
                            {canPrepare || isPrepared ? (
                              <input
                                type="checkbox"
                                checked={isPrepared}
                                disabled={disablePrepare}
                                onChange={(e) => {
                                  const next = e.target.checked
                                  if (next) {
                                    if (!canPrepare) return
                                    if (limitReached) return
                                  }
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) =>
                                      s.spellIndex === entry.spellIndex
                                        ? { ...s, prepared: next || undefined }
                                        : s,
                                    ),
                                  }))
                                }}
                                aria-label="Marcar como preparada"
                              />
                            ) : (
                              <span className="text-xs text-text">—</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 align-top text-textH break-words">
                          <button
                            className="w-full text-left"
                            onClick={() => {
                              setOpenSpellIndex((prev) =>
                                prev === entry.spellIndex ? null : entry.spellIndex,
                              )
                              setOpenSpellTab('official')
                            }}
                            title="Abrir descrição / editar"
                          >
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              <span className="min-w-0 break-words underline decoration-accentBorder underline-offset-2">
                                {displayName}
                              </span>
                              {!allowedSchool ? badge('Fora da escola') : null}
                            </div>
                            {err ? <div className="mt-1 text-xs text-text">{err}</div> : null}
                          </button>
                        </td>
                        <td className="p-2 align-top text-text">{detail ? detail.level : '…'}</td>
                        <td className="p-2 align-top text-text break-words">{detail ? schoolLabel(detail.school.name) : '…'}</td>
                        <td className="p-2 align-top text-text">
                          {detail ? (
                            (() => {
                              const comps = Array.isArray(detail.components) ? detail.components : []
                              const text = ['V', 'S', 'M'].filter((c) => comps.includes(c)).join('')
                              if (!text) return <span className="text-xs text-text">—</span>
                              const hasMaterial = comps.includes('M') && typeof detail.material === 'string' && detail.material.trim()
                              return (
                                <div className="relative inline-block">
                                  {hasMaterial ? (
                                    <button
                                      type="button"
                                      className="inline-flex items-center rounded-md border border-accentBorder bg-accentBg px-1.5 py-0.5 text-[11px] leading-4 text-textH whitespace-nowrap hover:opacity-90"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setOpenMaterialSpellIndex((prev) =>
                                          prev === entry.spellIndex ? null : entry.spellIndex,
                                        )
                                      }}
                                      aria-expanded={openMaterialSpellIndex === entry.spellIndex}
                                      aria-controls={`material-${entry.spellIndex}`}
                                      title="Ver componentes materiais"
                                    >
                                      {text}
                                    </button>
                                  ) : (
                                    badge(text)
                                  )}

                                  {hasMaterial && openMaterialSpellIndex === entry.spellIndex ? (
                                    <div
                                      id={`material-${entry.spellIndex}`}
                                      className="absolute left-0 top-full z-10 mt-1 w-[min(520px,90vw)] rounded-md border border-border bg-bg p-2 text-xs text-text shadow-theme whitespace-normal break-words"
                                    >
                                      {detail.material}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })()
                          ) : (
                            '…'
                          )}
                        </td>
                        <td className="p-2 align-top text-text">
                          <div className="md:hidden">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenUpcastSpellIndex(null)
                                setOpenMaterialSpellIndex(null)
                                setOpenDetailsSpellIndex(entry.spellIndex)
                              }}
                              title="Abrir dano e detalhes"
                            >
                              Ver detalhes
                            </Button>
                          </div>

                          <div className="hidden md:block">
                            <div
                              className="cursor-pointer select-none"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDamageInfoSpellIndex((prev) =>
                                  prev === entry.spellIndex ? null : entry.spellIndex,
                                )
                                setOpenUpcastSpellIndex(null)
                              }}
                              aria-expanded={isDamageInfoOpen}
                              title={
                                isDamageInfoOpen
                                  ? 'Ocultar detalhes'
                                  : 'Mostrar detalhes'
                              }
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono">{damageEstimate}</span>

                                {spellBaseLevel === 0 ? null : (
                                  <Select
                                    className="h-8 !w-[92px] shrink-0 px-2 text-xs"
                                    value={effectiveSlot}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const castSlotLevel = Number(e.target.value) as MagicCircleLevel
                                      updateCharacter(activeCharacter.id, (c) => ({
                                        ...c,
                                        spells: c.spells.map((s) =>
                                          s.spellIndex === entry.spellIndex
                                            ? { ...s, castSlotLevel }
                                            : s,
                                        ),
                                      }))
                                    }}
                                    title="Círculo usado (para dano/escala)"
                                  >
                                    {slotOptions.map((lvl) => (
                                      <option key={lvl} value={lvl}>
                                        Círc. {lvl}
                                      </option>
                                    ))}
                                  </Select>
                                )}

                                {(combatBadgeNodes.length || infoBadgeNodes.length || upcastLabel) ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenDamageInfoSpellIndex((prev) =>
                                        prev === entry.spellIndex ? null : entry.spellIndex,
                                      )
                                      setOpenUpcastSpellIndex(null)
                                    }}
                                    title={isDamageInfoOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                  >
                                    {isDamageInfoOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            {isDamageInfoOpen && (combatBadgeNodes.length || infoBadgeNodes.length || upcastLabel) ? (
                              <div className="relative mt-1">
                                <div className="flex flex-col items-start gap-1.5">
                                  {combatBadgeNodes}
                                  {infoBadgeNodes}
                                </div>

                                {upcastLabel ? (
                                  <div className="mt-1 flex">
                                    <button
                                      type="button"
                                      className="inline-flex shrink-0 items-center rounded-md border border-accentBorder bg-accentBg px-2 py-1 text-xs leading-4 text-textH whitespace-nowrap hover:opacity-90"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setOpenUpcastSpellIndex((prev) =>
                                          prev === entry.spellIndex ? null : entry.spellIndex,
                                        )
                                      }}
                                      aria-expanded={openUpcastSpellIndex === entry.spellIndex}
                                      aria-controls={`upcast-${entry.spellIndex}`}
                                      title="Ver escala (níveis superiores)"
                                    >
                                      Ver escala
                                    </button>
                                  </div>
                                ) : null}

                                {upcastLabel && openUpcastSpellIndex === entry.spellIndex ? (
                                  <div
                                    id={`upcast-${entry.spellIndex}`}
                                    className="absolute left-0 top-full z-10 mt-1 w-[min(520px,90vw)] rounded-md border border-border bg-bg p-2 text-xs text-text shadow-theme whitespace-normal break-words"
                                  >
                                    {upcastLabel}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 align-top">
                          <div
                            className="cursor-pointer select-none"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenSourceInfoSpellIndex((prev) =>
                                prev === entry.spellIndex ? null : entry.spellIndex,
                              )
                            }}
                            aria-expanded={isSourceInfoOpen}
                            title={isSourceInfoOpen ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                          >
                            <Select
                              className="h-9 w-full min-w-0 truncate px-2 py-1 text-sm"
                              value={entry.sourceType === 'feat' ? '__feat__' : (entry.sourceClassId ?? '')}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const v = e.target.value
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) =>
                                    s.spellIndex === entry.spellIndex
                                      ? v === '__feat__'
                                        ? {
                                            ...s,
                                            sourceType: 'feat',
                                            sourceClassId: undefined,
                                            featAbility:
                                              s.featAbility ??
                                              c.classes.find((x) => x.id === s.sourceClassId)?.castingAbility ??
                                              c.classes[0]?.castingAbility ??
                                              'cha',
                                          }
                                        : v
                                          ? {
                                              ...s,
                                              sourceType: 'class',
                                              sourceClassId: v,
                                              featName: undefined,
                                              featAbility: undefined,
                                            }
                                          : {
                                              ...s,
                                              sourceType: 'class',
                                              sourceClassId: undefined,
                                              featName: undefined,
                                              featAbility: undefined,
                                            }
                                      : s,
                                  ),
                                }))
                              }}
                            >
                              <option value="">(nenhuma)</option>
                              <option value="__feat__">Feat</option>
                              {activeCharacter.classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {classDisplayName(c)}
                                </option>
                              ))}
                            </Select>

                            <div className="mt-1 text-[11px] text-text">
                              Atributo:{' '}
                              {entry.sourceType === 'feat'
                                ? abilityShort(entry.featAbility ?? 'cha')
                                : castAs
                                  ? abilityShort(castAs.castingAbility)
                                  : '—'}
                            </div>

                            {entry.sourceType === 'feat' ? (
                              <div className="mt-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenSourceInfoSpellIndex((prev) =>
                                      prev === entry.spellIndex ? null : entry.spellIndex,
                                    )
                                  }}
                                  title={isSourceInfoOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                >
                                  {isSourceInfoOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          {isSourceInfoOpen && entry.sourceType === 'feat' ? (
                            <div className="mt-1 grid grid-cols-1 gap-1">
                              <Input
                                className="h-8 w-full px-2 text-xs"
                                value={entry.featName ?? ''}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const featName = e.target.value || undefined
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) =>
                                      s.spellIndex === entry.spellIndex ? { ...s, featName } : s,
                                    ),
                                  }))
                                }}
                                placeholder="Nome do feat (ex: Fey Touched)"
                              />
                              <Select
                                className="h-8 w-full min-w-0 truncate px-2 text-xs"
                                value={entry.featAbility ?? 'cha'}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const featAbility = e.target.value as Ability
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) =>
                                      s.spellIndex === entry.spellIndex ? { ...s, featAbility } : s,
                                    ),
                                  }))
                                }}
                                title="Atributo usado para conjurar via feat"
                              >
                                {ABILITY_KEYS.map((key) => (
                                  <option key={key} value={key}>
                                    {abilityShort(key)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 align-top text-text break-words">
                          {apiClassesFinal.length ? apiClassesFinal.join(', ') : detail ? '(none)' : '…'}
                        </td>
                        <td className="p-2 align-top">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => removeSpellFromActive(entry.spellIndex)}
                            title="Remover magia"
                          >
                            Remover
                          </Button>
                        </td>
                      </tr>

                      {openDetailsSpellIndex === entry.spellIndex ? (
                        <tr className="md:hidden">
                          <td colSpan={9} className="p-0">
                            <div
                              className="fixed inset-0 z-50 bg-black/40 p-4"
                              onClick={() => setOpenDetailsSpellIndex(null)}
                              role="presentation"
                            >
                              <div
                                className="mx-auto w-full max-w-[560px] rounded-xl border border-border bg-bg shadow-theme"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Detalhes da magia"
                              >
                                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-textH break-words">{displayName}</div>
                                    <div className="mt-1 text-xs text-text">Dano / detalhes</div>
                                  </div>
                                  <Button size="sm" variant="secondary" onClick={() => setOpenDetailsSpellIndex(null)}>
                                    Fechar
                                  </Button>
                                </div>

                                <div className="p-4">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm text-textH">{damageEstimate}</span>

                                    {spellBaseLevel === 0 ? null : (
                                      <Select
                                        className="h-8 !w-[92px] shrink-0 px-2 text-xs"
                                        value={effectiveSlot}
                                        onChange={(e) => {
                                          const castSlotLevel = Number(e.target.value) as MagicCircleLevel
                                          updateCharacter(activeCharacter.id, (c) => ({
                                            ...c,
                                            spells: c.spells.map((s) =>
                                              s.spellIndex === entry.spellIndex
                                                ? { ...s, castSlotLevel }
                                                : s,
                                            ),
                                          }))
                                        }}
                                        title="Círculo usado (para dano/escala)"
                                      >
                                        {slotOptions.map((lvl) => (
                                          <option key={lvl} value={lvl}>
                                            Círc. {lvl}
                                          </option>
                                        ))}
                                      </Select>
                                    )}
                                  </div>

                                  {combatBadgeNodes.length || infoBadgeNodes.length ? (
                                    <div className="mt-3 flex flex-col items-start gap-1.5">
                                      {combatBadgeNodes}
                                      {infoBadgeNodes}
                                    </div>
                                  ) : null}

                                  {upcastLabel ? (
                                    <div className="mt-3 rounded-lg border border-border bg-[color:var(--social-bg)] p-3 text-xs text-text whitespace-normal break-words">
                                      <div className="text-[11px] font-semibold text-textH">Escala (níveis superiores)</div>
                                      <div className="mt-1">{upcastLabel}</div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}

                      {isOpen ? (
                        <tr className="border-t border-border">
                          <td className="p-3" colSpan={9}>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[320px_minmax(0,1fr)]">
                              <div>
                                <div className="text-xs font-semibold text-textH">Nome em português</div>
                                <div className="mt-1 text-xs text-text">Opcional. Se preenchido, aparece na lista.</div>
                                <Input
                                  className="mt-2"
                                  value={entry.displayNamePt ?? ''}
                                  onChange={(e) => {
                                    const displayNamePt = e.target.value || undefined
                                    updateCharacter(activeCharacter.id, (c) => ({
                                      ...c,
                                      spells: c.spells.map((s) =>
                                        s.spellIndex === entry.spellIndex ? { ...s, displayNamePt } : s,
                                      ),
                                    }))
                                  }}
                                  placeholder="ex: Aperto Chocante"
                                />

                                <div className="mt-3">
                                  <div className="text-xs font-semibold text-textH">Conjuração</div>
                                  <div className="mt-1 text-xs text-text">
                                    Define se a magia usa Ação, Bônus ou Reação.
                                  </div>
                                  <Select
                                    className="mt-2"
                                    value={entry.castTimeKind ?? ''}
                                    onChange={(e) => {
                                      const raw = e.target.value
                                      const castTimeKind = (raw || undefined) as AddedSpell['castTimeKind']
                                      updateCharacter(activeCharacter.id, (c) => ({
                                        ...c,
                                        spells: c.spells.map((s) =>
                                          s.spellIndex === entry.spellIndex
                                            ? {
                                                ...s,
                                                castTimeKind,
                                                reactionWhen:
                                                  castTimeKind === 'reaction'
                                                    ? (reactionWhenAuto ?? s.reactionWhen)
                                                    : undefined,
                                              }
                                            : s,
                                        ),
                                      }))
                                    }}
                                  >
                                    <option value="">Auto</option>
                                    <option value="action">Ação</option>
                                    <option value="bonus">Bônus</option>
                                    <option value="reaction">Reação</option>
                                  </Select>

                                  {castTimeKind === 'reaction' ? (
                                    <div className="mt-2">
                                      <div className="text-xs text-text">Quando (reação)</div>
                                      <Input
                                        className="mt-1"
                                        value={entry.reactionWhen ?? reactionWhenAuto ?? ''}
                                        onChange={(e) => {
                                          const reactionWhen = e.target.value || undefined
                                          updateCharacter(activeCharacter.id, (c) => ({
                                            ...c,
                                            spells: c.spells.map((s) =>
                                              s.spellIndex === entry.spellIndex ? { ...s, reactionWhen } : s,
                                            ),
                                          }))
                                        }}
                                        placeholder={'ex: quando você for atingido por um ataque…'}
                                      />
                                    </div>
                                  ) : null}
                                </div>

                                <div className="mt-3 flex gap-2">
                                  <Button
                                    size="sm"
                                    variant={openSpellTab === 'official' ? 'primary' : 'secondary'}
                                    onClick={() => setOpenSpellTab('official')}
                                  >
                                    Oficial
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={openSpellTab === 'modifiers' ? 'primary' : 'secondary'}
                                    onClick={() => setOpenSpellTab('modifiers')}
                                  >
                                    Modificadores
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={openSpellTab === 'headcanon' ? 'primary' : 'secondary'}
                                    onClick={() => setOpenSpellTab('headcanon')}
                                  >
                                    Headcanon
                                  </Button>
                                </div>
                              </div>

                              <div>
                                {openSpellTab === 'official' ? (
                                  <div>
                                    {entry.homebrew ? (
                                      <div>
                                        <div className="text-xs font-semibold text-textH">Homebrew</div>
                                        <div className="mt-1 text-xs text-text">
                                          Somente visualização (edite no criador de homebrew).
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-bg p-3 md:grid-cols-2">
                                          <div>
                                            <div className="text-[11px] text-text">Nome</div>
                                            <div className="mt-1 text-sm font-medium text-textH break-words">
                                              {entry.homebrew.name}
                                            </div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Nível</div>
                                            <div className="mt-1 text-sm text-textH">{entry.homebrew.level}</div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Escola</div>
                                            <div className="mt-1 text-sm text-textH">{schoolLabel(entry.homebrew.school)}</div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Componentes</div>
                                            <div className="mt-1 text-sm text-textH">
                                              {(() => {
                                                const comps = Array.isArray(entry.homebrew.components)
                                                  ? entry.homebrew.components
                                                  : ([] as Array<'V' | 'S' | 'M'>)
                                                const base = (['V', 'S', 'M'] as const).filter((c) => comps.includes(c))
                                                if (!base.length && !entry.homebrew.material?.trim()) return '—'
                                                const parts: string[] = [...base]
                                                const mat = entry.homebrew.material?.trim()
                                                if (mat) parts.push(`M (${mat})`)
                                                return parts.join(', ')
                                              })()}
                                            </div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Alcance</div>
                                            <div className="mt-1 text-sm text-textH">{entry.homebrew.range?.trim() || '—'}</div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Área</div>
                                            <div className="mt-1 text-sm text-textH">{entry.homebrew.area?.trim() || '—'}</div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Duração</div>
                                            <div className="mt-1 text-sm text-textH">
                                              {entry.homebrew.duration?.trim() || '—'}
                                              {entry.homebrew.concentration ? ' (Concentração)' : ''}
                                            </div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Dano (base)</div>
                                            <div className="mt-1 text-sm text-textH">{entry.homebrew.damageDice?.trim() || '—'}</div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] text-text">Mecânica</div>
                                            <div className="mt-1 text-sm text-textH">
                                              {entry.homebrew.mechanic === 'attack'
                                                ? 'Ataque'
                                                : entry.homebrew.mechanic === 'save'
                                                  ? 'Teste de resistência'
                                                  : entry.homebrew.mechanic === 'both'
                                                    ? 'Ataque + Teste'
                                                    : 'Nenhuma'}
                                              {(entry.homebrew.mechanic === 'save' || entry.homebrew.mechanic === 'both')
                                                ? ` (${abilityShort(entry.homebrew.saveAbility ?? 'dex')})`
                                                : ''}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="mt-3">
                                          <div className="text-xs font-semibold text-textH">Descrição</div>
                                          <div className="mt-2 space-y-2 text-sm text-text">
                                            {(entry.homebrew.desc?.trim() ? [entry.homebrew.desc.trim()] : []).map((p, i) => (
                                              <p key={i}>
                                                <InlineMarkdown text={p} />
                                              </p>
                                            ))}
                                            {!entry.homebrew.desc?.trim() ? <div className="text-xs text-text">—</div> : null}
                                          </div>
                                        </div>

                                        {entry.homebrew.higherLevel?.trim() ? (
                                          <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                                            <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
                                            <div className="mt-2 space-y-2 text-sm text-text">
                                              <p>
                                                <InlineMarkdown text={entry.homebrew.higherLevel.trim()} />
                                              </p>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div>
                                        <div>
                                          <div className="text-xs font-semibold text-textH">Descrição (API)</div>
                                          <div className="mt-2">
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="text-xs text-text">
                                                {entry.officialDescPt?.length
                                                  ? 'Traduzido (PT-BR)'
                                                  : 'Original (EN)'}
                                              </div>

                                              <div className="flex items-center gap-2">
                                                {translateStatus.kind === 'error' &&
                                                translateStatus.spellIndex === entry.spellIndex ? (
                                                  <div className="text-[11px] text-text">
                                                    {translateStatus.message}
                                                  </div>
                                                ) : null}

                                                <Button
                                                  size="sm"
                                                  variant="secondary"
                                                  disabled={
                                                    !detail ||
                                                    translateStatus.kind === 'loading' ||
                                                    Boolean(entry.officialDescPt?.length)
                                                  }
                                                  onClick={() => {
                                                    if (!detail) return
                                                    void translateOfficialToPt({
                                                      spellIndex: entry.spellIndex,
                                                      desc: detail.desc ?? [],
                                                      higher: detail.higher_level ?? [],
                                                    })
                                                  }}
                                                  title={
                                                    entry.officialDescPt?.length
                                                      ? 'Já traduzido'
                                                      : 'Traduzir descrição para PT-BR'
                                                  }
                                                >
                                                  {translateStatus.kind === 'loading' &&
                                                  translateStatus.spellIndex === entry.spellIndex
                                                    ? 'Traduzindo…'
                                                    : 'Traduzir PT-BR'}
                                                </Button>
                                              </div>
                                            </div>

                                            <div className="mt-2 space-y-2 text-sm text-text">
                                              {!detail ? (
                                                <div>Carregando…</div>
                                              ) : (
                                                <>
                                                  {(entry.officialDescPt?.length
                                                    ? entry.officialDescPt
                                                    : detail.desc ?? []
                                                  ).map((p, i) => (
                                                    <p key={i}>
                                                      <InlineMarkdown text={p} />
                                                    </p>
                                                  ))}

                                                  {(detail.higher_level ?? []).length ? (
                                                    <div className="mt-2 rounded-lg border border-border bg-bg p-3">
                                                      <div className="text-xs font-semibold text-textH">
                                                        Em níveis superiores
                                                      </div>
                                                      <div className="mt-2 space-y-2 text-sm text-text">
                                                        {(entry.officialHigherLevelPt?.length
                                                          ? entry.officialHigherLevelPt
                                                          : detail.higher_level!
                                                        ).map((p, i) => (
                                                          <p key={i}>
                                                            <InlineMarkdown text={p} />
                                                          </p>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : openSpellTab === 'modifiers' ? (
                                  <div>
                                    <div className="rounded-lg border border-border bg-bg p-3">
                                      <div className="text-xs font-semibold text-textH">Modificadores</div>
                                      <div className="mt-1 text-xs text-text">
                                        Defina efeitos estruturados para esta magia neste personagem (ex: CA +2, Condição: Cegueira).
                                      </div>

                                      <div className="mt-2 space-y-2">
                                        {(entry.effects ?? []).length ? (
                                          (entry.effects ?? []).map((eff, idx) => {
                                            const target = eff.target
                                            const modeChoices = modeOptionsForTarget(target)
                                            const needsValue =
                                              eff.mode === 'add' || eff.mode === 'sub' || eff.mode === 'set'
                                            const needsAbility =
                                              target === 'attack' || target === 'save' || target === 'ability'
                                            const needsCondition = target === 'condition'
                                            const needsEconomy = target === 'economy'

                                            const gridColsMd = needsAbility || needsCondition || needsEconomy
                                              ? 'md:grid-cols-[170px_140px_160px_1fr_96px]'
                                              : 'md:grid-cols-[170px_140px_1fr_96px]'

                                            return (
                                              <div
                                                key={idx}
                                                className={`grid grid-cols-1 gap-2 rounded-lg border border-border p-2 ${gridColsMd}`}
                                              >
                                                <div>
                                                  <label className="text-[11px] text-text">Afeta</label>
                                                  <Select
                                                    className="mt-1 h-9"
                                                    value={eff.target}
                                                    onChange={(e) => {
                                                      const nextTarget = e.target.value as SpellEffectTarget
                                                      updateCharacter(activeCharacter.id, (c) => ({
                                                        ...c,
                                                        spells: c.spells.map((s) => {
                                                          if (s.spellIndex !== entry.spellIndex) return s
                                                          const effects = [...(s.effects ?? [])]
                                                          const prev = effects[idx] ?? { target: 'ac', mode: 'add' }
                                                          const nextMode = modeOptionsForTarget(nextTarget).includes(prev.mode)
                                                            ? prev.mode
                                                            : modeOptionsForTarget(nextTarget)[0]
                                                          const prevSpeedUnit = prev.target === 'speed' ? (prev.unit ?? 'ft') : undefined
                                                          const prevSpeedValueMeters =
                                                            prev.target === 'speed' && typeof prev.value === 'number'
                                                              ? prevSpeedUnit === 'm'
                                                                ? prev.value
                                                                : prev.value * 0.3
                                                              : undefined
                                                          effects[idx] = {
                                                            ...prev,
                                                            target: nextTarget,
                                                            mode: nextMode,
                                                            ability:
                                                              nextTarget === 'attack' || nextTarget === 'save' || nextTarget === 'ability'
                                                                ? (prev.ability ?? 'cha')
                                                                : undefined,
                                                            unit: nextTarget === 'speed' ? 'm' : undefined,
                                                            condition:
                                                              nextTarget === 'condition'
                                                                ? (prev.condition ?? 'blinded')
                                                                : undefined,
                                                            economy: nextTarget === 'economy' ? (prev.economy ?? 'action') : undefined,
                                                            value:
                                                              nextTarget === 'condition' || nextTarget === 'economy' || nextMode === 'adv' || nextMode === 'dis' || nextMode === 'apply' || nextMode === 'remove'
                                                                ? undefined
                                                                : nextTarget === 'speed'
                                                                  ? prevSpeedValueMeters ?? prev.value
                                                                  : prev.value,
                                                          }
                                                          return { ...s, effects }
                                                        }),
                                                      }))
                                                    }}
                                                  >
                                                    {effectTargetOptions.map((opt) => (
                                                      <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                      </option>
                                                    ))}
                                                  </Select>
                                                </div>

                                                <div>
                                                  <label className="text-[11px] text-text">Como</label>
                                                  <Select
                                                    className="mt-1 h-9"
                                                    value={eff.mode}
                                                    onChange={(e) => {
                                                      const mode = e.target.value as SpellEffectMode
                                                      updateCharacter(activeCharacter.id, (c) => ({
                                                        ...c,
                                                        spells: c.spells.map((s) => {
                                                          if (s.spellIndex !== entry.spellIndex) return s
                                                          const effects = [...(s.effects ?? [])]
                                                          const next = { ...effects[idx], mode }
                                                          if (mode === 'adv' || mode === 'dis' || mode === 'apply' || mode === 'remove') {
                                                            next.value = undefined
                                                          }
                                                          effects[idx] = next
                                                          return { ...s, effects }
                                                        }),
                                                      }))
                                                    }}
                                                  >
                                                    {modeChoices.map((m) => (
                                                      <option key={m} value={m}>
                                                        {modeLabel(m)}
                                                      </option>
                                                    ))}
                                                  </Select>
                                                </div>

                                                {needsAbility || needsCondition || needsEconomy ? (
                                                  <div>
                                                    <label className="text-[11px] text-text">
                                                      {needsEconomy ? 'Remover' : needsCondition ? 'Condição' : 'Atributo'}
                                                    </label>
                                                    <Select
                                                      className="mt-1 h-9"
                                                      value={
                                                        needsEconomy
                                                          ? (eff.economy ?? 'action')
                                                          : needsCondition
                                                            ? (eff.condition ?? 'blinded')
                                                            : (eff.ability ?? 'cha')
                                                      }
                                                      onChange={(e) => {
                                                        const raw = e.target.value
                                                        updateCharacter(activeCharacter.id, (c) => ({
                                                          ...c,
                                                          spells: c.spells.map((s) => {
                                                            if (s.spellIndex !== entry.spellIndex) return s
                                                            const effects = [...(s.effects ?? [])]
                                                            effects[idx] = needsEconomy
                                                              ? { ...effects[idx], economy: raw as ActionEconomyKey }
                                                              : needsCondition
                                                                ? { ...effects[idx], condition: raw as ConditionKey }
                                                                : { ...effects[idx], ability: raw as Ability }
                                                            return { ...s, effects }
                                                          }),
                                                        }))
                                                      }}
                                                    >
                                                      {needsEconomy
                                                        ? (
                                                            <>
                                                              <option value="action">Ação</option>
                                                              <option value="bonusAction">Ação bônus</option>
                                                              <option value="reaction">Reação</option>
                                                              <option value="movement">Movimento</option>
                                                              <option value="turn">Turno</option>
                                                            </>
                                                          )
                                                        : needsCondition
                                                        ? conditionOptions.map((c) => (
                                                            <option key={c.value} value={c.value}>
                                                              {c.label}
                                                            </option>
                                                          ))
                                                        : ABILITY_KEYS.map((a) => (
                                                            <option key={a} value={a}>
                                                              {abilityShort(a)}
                                                            </option>
                                                          ))}
                                                    </Select>
                                                  </div>
                                                ) : null}

                                                <div>
                                                  <label className="text-[11px] text-text">{target === 'speed' ? 'Valor (m)' : 'Valor'}</label>
                                                  <Input
                                                    className="mt-1 h-9"
                                                    type="number"
                                                    disabled={!needsValue}
                                                    value={(() => {
                                                      if (!needsValue) return ''
                                                      if (target !== 'speed') return String(eff.value ?? '')
                                                      if (typeof eff.value !== 'number') return ''
                                                      const unit = eff.unit ?? 'ft'
                                                      const meters = unit === 'm' ? eff.value : eff.value * 0.3
                                                      const rounded = Math.round(meters * 10) / 10
                                                      return String(rounded)
                                                    })()}
                                                    onChange={(e) => {
                                                      const raw = e.target.value
                                                      const value = raw === '' ? undefined : Number(raw)
                                                      updateCharacter(activeCharacter.id, (c) => ({
                                                        ...c,
                                                        spells: c.spells.map((s) => {
                                                          if (s.spellIndex !== entry.spellIndex) return s
                                                          const effects = [...(s.effects ?? [])]
                                                          effects[idx] = {
                                                            ...effects[idx],
                                                            value,
                                                            unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                                          }
                                                          return { ...s, effects }
                                                        }),
                                                      }))
                                                    }}
                                                    placeholder={needsValue ? 'ex: 2' : '—'}
                                                  />
                                                </div>

                                                <div className="flex items-end justify-end">
                                                  <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                      updateCharacter(activeCharacter.id, (c) => ({
                                                        ...c,
                                                        spells: c.spells.map((s) => {
                                                          if (s.spellIndex !== entry.spellIndex) return s
                                                          const effects = [...(s.effects ?? [])]
                                                          effects.splice(idx, 1)
                                                          return { ...s, effects: effects.length ? effects : undefined }
                                                        }),
                                                      }))
                                                    }}
                                                    title="Remover efeito"
                                                  >
                                                    Remover
                                                  </Button>
                                                </div>
                                              </div>
                                            )
                                          })
                                        ) : (
                                          <div className="text-xs text-text">Nenhum modificador definido.</div>
                                        )}
                                      </div>

                                      <div className="mt-2">
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            updateCharacter(activeCharacter.id, (c) => ({
                                              ...c,
                                              spells: c.spells.map((s) => {
                                                if (s.spellIndex !== entry.spellIndex) return s
                                                const next: SpellEffect = { target: 'ac', mode: 'add', value: 1 }
                                                const effects = [...(s.effects ?? []), next]
                                                return { ...s, effects }
                                              }),
                                            }))
                                          }}
                                        >
                                          Adicionar modificador
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-xs font-semibold text-textH">Descrição (Headcanon)</div>
                                    <div className="mt-1 text-xs text-text">Salva junto do personagem/sincronização.</div>
                                    <Textarea
                                      className="mt-2"
                                      value={entry.headcanon ?? ''}
                                      onChange={(e) => {
                                        const headcanon = e.target.value || undefined
                                        updateCharacter(activeCharacter.id, (c) => ({
                                          ...c,
                                          spells: c.spells.map((s) =>
                                            s.spellIndex === entry.spellIndex ? { ...s, headcanon } : s,
                                          ),
                                        }))
                                      }}
                                      placeholder="Escreva aqui sua versão/descrição personalizada da magia…"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
