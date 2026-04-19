import { Fragment, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type {
  Ability,
  AddedSpell,
  ActionEconomyKey,
  Character,
  ConditionKey,
  DndSpell,
  HomebrewSpellMechanic,
  MagicCircleLevel,
  SpellEffect,
  SpellEffectMode,
  SpellEffectTarget,
} from '../types'
import {
  cantripDiceMultiplier,
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
  SCHOOL_NAME_PT,
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
  ensureSpellDetailsLoaded: (index: string, signal?: AbortSignal) => Promise<void>
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
  const { abilityShort, t } = useI18n()

  const {
    activeCharacter,
    activeCharacterSchools,
    activeCharacterTotalLevel,
    filteredAddedSpells,
    spellDetails,
    spellDetailsError,
    ensureSpellDetailsLoaded,
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

  const [openMaterialSpellIndex, setOpenMaterialSpellIndex] = useState<string | null>(null)
  const [openDetailsSpellIndex, setOpenDetailsSpellIndex] = useState<string | null>(null)
  const [openSourceInfoSpellIndex, setOpenSourceInfoSpellIndex] = useState<string | null>(null)
  const [openHomebrewEditSpellIndex, setOpenHomebrewEditSpellIndex] = useState<string | null>(null)

  const effectTargetOptions: Array<{ value: SpellEffectTarget; label: string }> = [
    { value: 'ac', label: 'CA' },
    { value: 'speed', label: 'Deslocamento' },
    { value: 'initiative', label: 'Iniciativa' },
    { value: 'attack', label: 'Ataque (ATQ)' },
    { value: 'save', label: 'Teste de resistência' },
    { value: 'ability', label: 'Atributo' },
    { value: 'condition', label: 'Condição' },
    { value: 'economy', label: 'Remover (ações)' },
    { value: 'forcedMove', label: t('effects.forcedMove') },
    { value: 'conditionalDamage', label: 'Dano condicional' },
    { value: 'saveOutcomeDamage', label: 'Resultado do TR' },
    { value: 'rollDice', label: 'Dado em rolagens' },
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
    if (t === 'forcedMove') return ['apply']
    if (t === 'condition') return ['apply']
    if (t === 'conditionalDamage') return ['apply']
    if (t === 'saveOutcomeDamage') return ['apply']
    if (t === 'rollDice') return ['apply']
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

  const formatEffectBadge = (
    eff: SpellEffect,
    ctx?: { spell?: DndSpell; characterLevel: number; slotLevel: MagicCircleLevel },
  ): string | null => {
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

    const parseDice = (text: string): { count: number; size: number } | null => {
      const m = /(\d+)d(\d+)/i.exec(text)
      if (!m) return null
      const count = Number(m[1])
      const size = Number(m[2])
      if (!Number.isFinite(count) || !Number.isFinite(size) || count < 0 || size <= 0) return null
      return { count, size }
    }

    const formatDice = (d: { count: number; size: number }): string => `${d.count}d${d.size}`

    if (eff.mode === 'remove') {
      if (eff.target !== 'economy') return null
      if (!eff.economy) return null
      return `Remove: ${economyLabel(eff.economy)}`
    }

    if (eff.mode === 'apply') {
      if (eff.target === 'forcedMove') {
        if (typeof eff.value !== 'number' || Number.isNaN(eff.value)) return null
        const meters = round1(eff.value)
        const dir = eff.forcedMoveDirection ?? 'any'
        const ref = eff.forcedMoveReference?.trim()
        const dirText = eff.forcedMoveDirectionText?.trim()

        const suffix =
          dir === 'away'
            ? ` para longe de ${ref || 'X'}`
            : dir === 'towards'
              ? ` para perto de ${ref || 'X'}`
              : dir === 'direction'
                ? ` direção: ${dirText || '—'}`
                : ''

        // Keep badge short-ish.
        return `${t('effects.forcedMove')}: ${fmt(meters)} m${suffix}`
      }

      if (eff.target === 'conditionalDamage') {
        const when = eff.damageWhen?.trim() ? eff.damageWhen.trim() : undefined
        const rawDice = eff.damageDice?.trim() ? eff.damageDice.trim() : undefined
        if (!rawDice) return null

        const parsed = parseDice(rawDice)
        const spell = ctx?.spell

        const scaled = (() => {
          if (!parsed) return rawDice

          if (spell?.level === 0) {
            const mult = cantripDiceMultiplier(ctx?.characterLevel ?? 1)
            const count = parsed.count === 0 ? Math.max(0, mult - 1) : parsed.count * mult
            return formatDice({ count, size: parsed.size })
          }

          if (spell && typeof spell.level === 'number' && spell.level > 0) {
            const base = spell.level
            const slot = Math.max(base, ctx?.slotLevel ?? base)
            const extra = Math.max(0, slot - base)
            return formatDice({ count: parsed.count + extra, size: parsed.size })
          }

          return rawDice
        })()

        return when ? `Dano (${when}): ${scaled}` : `Dano cond.: ${scaled}`
      }

      if (eff.target === 'saveOutcomeDamage') {
        const outcome = eff.saveOutcome ?? 'success'
        const op = eff.saveDamageOp ?? 'div'
        const value = eff.saveDamageValue

        const text = eff.saveOutcomeText?.trim() ? eff.saveOutcomeText.trim() : undefined

        const when = outcome === 'failure' ? 'TR falhou' : 'TR passou'

        if (text) return `${when}: ${text}`

        const opLabel = op === 'mul' ? '×' : op === 'div' ? '÷' : op === 'add' ? '+' : '−'
        const v = typeof value === 'number' && Number.isFinite(value) ? fmt(value) : '—'
        return `${when}: ${opLabel} ${v}`
      }

      if (eff.target === 'rollDice') {
        const dice = eff.rollDice?.trim() ? eff.rollDice.trim() : undefined
        const applies = eff.rollAppliesTo ?? []
        const labels = applies
          .map((k) => (k === 'attack' ? 'ATQ' : k === 'save' ? 'TR' : 'Perícia'))
          .join('/')
        const where = labels ? ` (${labels})` : ''
        return `Dado${where}: ${dice ?? '—'}`
      }

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
          <table className="w-full min-w-[1060px] table-auto border-collapse md:min-w-full">
            <thead className="bg-accentBg">
              <tr className="text-left text-xs text-text">
                <th className="whitespace-nowrap p-2">Prep.</th>
                <th className="p-2">Nome</th>
                <th className="whitespace-nowrap p-2">Nível</th>
                <th className="p-2">Escola</th>
                <th className="whitespace-nowrap p-2">Comp.</th>
                <th className="whitespace-nowrap p-2">{t('spell.ritual')}</th>
                <th className="p-2">Dano / Detalhes</th>
                <th className="p-2">Conjurar como</th>
                <th className="p-2">Classes (API)</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAddedSpells.length === 0 ? (
                <tr>
                  <td className="p-3 text-sm text-text" colSpan={10}>
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

                  const primaryRollLabel = (() => {
                    if (damageEstimate !== '—') return damageEstimate
                    if (usesSave) {
                      if (dcSpell !== null && saveTypeName) return `CD ${dcSpell} ${saveTypeName}`
                      if (dcSpell !== null) return `CD ${dcSpell}`
                      if (saveTypeName) return `TR ${saveTypeName}`
                      return 'TR'
                    }
                    if (usesAttack && atkSpell !== null) return `ATQ ${formatSigned(atkSpell)}`
                    return damageEstimate
                  })()

                  const detailsSubtitle = damageEstimate === '—' && usesSave ? 'Teste / detalhes' : 'Dano / detalhes'

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
                  if (detail?.ritual) infoBadgeNodes.push(badge(t('spell.ritual'), { kind: 'grid' }))
                  manualEffects.forEach((eff) => {
                    const txt = formatEffectBadge(eff, {
                      spell: detail,
                      characterLevel: activeCharacterTotalLevel,
                      slotLevel: effectiveSlot,
                    })
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
                  const isCantrip = (detail?.level ?? 1) === 0
                  const isPrepared = isCantrip ? true : Boolean(entry.prepared)
                  const canPrepare = typeof prepLimit === 'number' && !isCantrip
                  const limitReached = canPrepare ? prepCount >= prepLimit : true
                  const disablePrepare = isCantrip ? true : (!isPrepared && (!canPrepare || limitReached))
                  const prepTitle = isCantrip
                    ? 'Cantrip é sempre preparada.'
                    : !canPrepare
                      ? 'Esta fonte não usa lista de magias preparadas.'
                      : limitReached && !isPrepared
                        ? `Limite de preparadas atingido (${prepCount}/${prepLimit}).`
                        : `Preparadas: ${prepCount}/${prepLimit}`

                  const isDetailsOpen = openDetailsSpellIndex === entry.spellIndex
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
                                  if (isCantrip) return
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
                              if (!entry.homebrew) void ensureSpellDetailsLoaded(entry.spellIndex)
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
                          {detail ? (
                            detail.ritual ? (
                              badge(t('spell.ritual'))
                            ) : (
                              <span className="text-xs text-text">—</span>
                            )
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
                                setOpenMaterialSpellIndex(null)
                                if (!entry.homebrew) void ensureSpellDetailsLoaded(entry.spellIndex)
                                setOpenDetailsSpellIndex(entry.spellIndex)
                              }}
                              title="Abrir dano e detalhes"
                            >
                              Ver detalhes
                            </Button>
                          </div>

                          <div className="hidden md:block">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{primaryRollLabel}</span>

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

                              {combatBadgeNodes.length || infoBadgeNodes.length || upcastLabel ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMaterialSpellIndex(null)
                                    if (!entry.homebrew) void ensureSpellDetailsLoaded(entry.spellIndex)
                                    setOpenDetailsSpellIndex((prev) => (prev === entry.spellIndex ? null : entry.spellIndex))
                                  }}
                                  title={isDetailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                >
                                  {isDetailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                                </Button>
                              ) : null}
                            </div>
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
                        <tr>
                          <td colSpan={10} className="p-0">
                            <div
                              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                              onClick={() => setOpenDetailsSpellIndex(null)}
                              role="presentation"
                            >
                              <div
                                className="w-full max-w-[560px] rounded-xl border border-border bg-bg bg-[color:color-mix(in_srgb,var(--bg)_96%,transparent)] backdrop-blur-sm shadow-theme"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Detalhes da magia"
                              >
                                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-textH break-words">{displayName}</div>
                                    <div className="mt-1 text-xs text-text">{detailsSubtitle}</div>
                                  </div>
                                  <Button size="sm" variant="secondary" onClick={() => setOpenDetailsSpellIndex(null)}>
                                    Fechar
                                  </Button>
                                </div>

                                <div className="p-4">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm text-textH">{primaryRollLabel}</span>

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
                                    <div className="mt-3 rounded-lg border border-border bg-codeBg p-3 text-xs text-text whitespace-normal break-words">
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
                        <tr className="h-0">
                          <td className="p-0" colSpan={10}>
                            <div
                              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                              onClick={() => setOpenSpellIndex(null)}
                              role="presentation"
                            >
                              <div
                                className="w-full max-w-[980px] rounded-xl border border-border bg-bg bg-[color:color-mix(in_srgb,var(--bg)_96%,transparent)] backdrop-blur-sm shadow-theme"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Descrição / modificadores / headcanon"
                              >
                                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-textH break-words">{displayName}</div>
                                    <div className="mt-1 text-xs text-text">Descrição / modificadores / headcanon</div>
                                  </div>
                                  <Button size="sm" variant="secondary" onClick={() => setOpenSpellIndex(null)}>
                                    Fechar
                                  </Button>
                                </div>

                                <div className="max-h-[80svh] overflow-y-auto p-4">
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

                                <div className="mt-3 flex flex-wrap gap-2">
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
                                        {(() => {
                                          const hb = entry.homebrew
                                          const isEditing = openHomebrewEditSpellIndex === entry.spellIndex
                                          const mechanic = (hb.mechanic ?? 'none') as HomebrewSpellMechanic
                                          const needsSaveAbility = mechanic === 'save' || mechanic === 'both'
                                          const baseClasses = Array.isArray(hb.classes) ? hb.classes : []
                                          const comps = Array.isArray(hb.components)
                                            ? hb.components
                                            : ([] as Array<'V' | 'S' | 'M'>)
                                          const compSet = new Set(comps)

                                          const setHb = (next: typeof hb, opts?: { syncName?: boolean; syncLevel?: boolean }) => {
                                            updateCharacter(activeCharacter.id, (c) => ({
                                              ...c,
                                              spells: c.spells.map((s) => {
                                                if (s.spellIndex !== entry.spellIndex) return s
                                                return {
                                                  ...s,
                                                  spellName: opts?.syncName ? next.name : s.spellName,
                                                  castSlotLevel: opts?.syncLevel ? next.level : s.castSlotLevel,
                                                  homebrew: next,
                                                }
                                              }),
                                            }))
                                          }

                                          return (
                                            <>
                                              <div className="flex items-start justify-between gap-2">
                                                <div>
                                                  <div className="text-xs font-semibold text-textH">Homebrew</div>
                                                  <div className="mt-1 text-xs text-text">
                                                    {isEditing ? 'Editando este homebrew.' : 'Você pode editar este homebrew aqui.'}
                                                  </div>
                                                </div>
                                                <Button
                                                  size="sm"
                                                  variant="secondary"
                                                  onClick={() =>
                                                    setOpenHomebrewEditSpellIndex((prev) =>
                                                      prev === entry.spellIndex ? null : entry.spellIndex,
                                                    )
                                                  }
                                                >
                                                  {isEditing ? 'Fechar edição' : 'Editar'}
                                                </Button>
                                              </div>

                                              {!isEditing ? (
                                                <>
                                                  <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-bg p-3 md:grid-cols-2">
                                                    <div>
                                                      <div className="text-[11px] text-text">Nome</div>
                                                      <div className="mt-1 text-sm font-medium text-textH break-words">
                                                        {hb.name}
                                                      </div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Nível</div>
                                                      <div className="mt-1 text-sm text-textH">{hb.level}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Escola</div>
                                                      <div className="mt-1 text-sm text-textH">{schoolLabel(hb.school)}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">{t('spell.ritual')}</div>
                                                      <div className="mt-1 text-sm text-textH">{hb.ritual ? t('spell.ritual') : '—'}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Componentes</div>
                                                      <div className="mt-1 text-sm text-textH">
                                                        {(() => {
                                                          const base = (['V', 'S', 'M'] as const).filter((c) => compSet.has(c))
                                                          if (!base.length && !hb.material?.trim()) return '—'
                                                          const parts: string[] = [...base]
                                                          const mat = hb.material?.trim()
                                                          if (mat) parts.push(`M (${mat})`)
                                                          return parts.join(', ')
                                                        })()}
                                                      </div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Alcance</div>
                                                      <div className="mt-1 text-sm text-textH">{hb.range?.trim() || '—'}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Área</div>
                                                      <div className="mt-1 text-sm text-textH">{hb.area?.trim() || '—'}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Duração</div>
                                                      <div className="mt-1 text-sm text-textH">
                                                        {hb.duration?.trim() || '—'}
                                                        {hb.concentration ? ' (Concentração)' : ''}
                                                      </div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Dano (base)</div>
                                                      <div className="mt-1 text-sm text-textH">{hb.damageDice?.trim() || '—'}</div>
                                                    </div>

                                                    <div>
                                                      <div className="text-[11px] text-text">Mecânica</div>
                                                      <div className="mt-1 text-sm text-textH">
                                                        {mechanic === 'attack'
                                                          ? 'Ataque'
                                                          : mechanic === 'save'
                                                            ? 'Teste de resistência'
                                                            : mechanic === 'both'
                                                              ? 'Ataque + Teste'
                                                              : 'Nenhuma'}
                                                        {needsSaveAbility ? ` (${abilityShort(hb.saveAbility ?? 'dex')})` : ''}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div className="mt-3">
                                                    <div className="text-xs font-semibold text-textH">Descrição</div>
                                                    <div className="mt-2 space-y-2 text-sm text-text break-words">
                                                      {(hb.desc?.trim() ? [hb.desc.trim()] : []).map((p, i) => (
                                                        <p key={i}>
                                                          <InlineMarkdown text={p} />
                                                        </p>
                                                      ))}
                                                      {!hb.desc?.trim() ? <div className="text-xs text-text">—</div> : null}
                                                    </div>
                                                  </div>

                                                  {hb.higherLevel?.trim() ? (
                                                    <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                                                      <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
                                                      <div className="mt-2 space-y-2 text-sm text-text break-words">
                                                        <p>
                                                          <InlineMarkdown text={hb.higherLevel.trim()} />
                                                        </p>
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                </>
                                              ) : (
                                                <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-bg p-3">
                                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    <div>
                                                      <label className="text-xs text-text">Nome</label>
                                                      <Input
                                                        className="mt-1"
                                                        value={hb.name}
                                                        onChange={(e) => {
                                                          const name = e.target.value
                                                          setHb({ ...hb, name }, { syncName: true })
                                                        }}
                                                      />
                                                    </div>

                                                    <div>
                                                      <label className="text-xs text-text">Nível</label>
                                                      <Select
                                                        className="mt-1"
                                                        value={hb.level}
                                                        onChange={(e) => {
                                                          const level = Number(e.target.value) as MagicCircleLevel
                                                          setHb({ ...hb, level }, { syncLevel: true })
                                                        }}
                                                      >
                                                        {magicCircleOptions().map((lvl) => (
                                                          <option key={lvl} value={lvl}>
                                                            {lvl}
                                                          </option>
                                                        ))}
                                                      </Select>
                                                    </div>
                                                  </div>

                                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    <div>
                                                      <label className="text-xs text-text">Escola</label>
                                                      <Select
                                                        className="mt-1"
                                                        value={hb.school}
                                                        onChange={(e) => setHb({ ...hb, school: e.target.value })}
                                                      >
                                                        {Object.keys(SCHOOL_NAME_PT)
                                                          .sort((a, b) => schoolLabel(a).localeCompare(schoolLabel(b), 'pt-BR'))
                                                          .map((k) => (
                                                            <option key={k} value={k}>
                                                              {schoolLabel(k)}
                                                            </option>
                                                          ))}
                                                      </Select>
                                                    </div>

                                                    <div>
                                                      <label className="text-xs text-text">{t('spell.ritual')}</label>
                                                      <div className="mt-2 flex items-center gap-2">
                                                        <input
                                                          type="checkbox"
                                                          checked={Boolean(hb.ritual)}
                                                          onChange={(e) => setHb({ ...hb, ritual: e.target.checked || undefined })}
                                                        />
                                                        <span className="text-xs text-text">Pode ser conjurada como ritual</span>
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                                    <div>
                                                      <label className="text-xs text-text">Alcance</label>
                                                      <Input
                                                        className="mt-1"
                                                        value={hb.range ?? ''}
                                                        onChange={(e) => setHb({ ...hb, range: e.target.value || undefined })}
                                                        placeholder="ex: 18 m / Toque / Pessoal"
                                                      />
                                                    </div>
                                                    <div>
                                                      <label className="text-xs text-text">Área</label>
                                                      <Input
                                                        className="mt-1"
                                                        value={hb.area ?? ''}
                                                        onChange={(e) => setHb({ ...hb, area: e.target.value || undefined })}
                                                        placeholder="ex: Cone 4,5 m"
                                                      />
                                                    </div>
                                                    <div>
                                                      <label className="text-xs text-text">Duração</label>
                                                      <Input
                                                        className="mt-1"
                                                        value={hb.duration ?? ''}
                                                        onChange={(e) => setHb({ ...hb, duration: e.target.value || undefined })}
                                                        placeholder="ex: 1 minuto"
                                                      />
                                                      <div className="mt-2 flex items-center gap-2">
                                                        <input
                                                          type="checkbox"
                                                          checked={Boolean(hb.concentration)}
                                                          onChange={(e) => setHb({ ...hb, concentration: e.target.checked || undefined })}
                                                        />
                                                        <span className="text-xs text-text">Concentração</span>
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div>
                                                    <label className="text-xs text-text">Componentes</label>
                                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                                      {(['V', 'S', 'M'] as const).map((comp) => {
                                                        const checked = compSet.has(comp)
                                                        return (
                                                          <label key={comp} className="flex items-center gap-2 text-xs text-text">
                                                            <input
                                                              type="checkbox"
                                                              checked={checked}
                                                              onChange={(e) => {
                                                                const nextChecked = e.target.checked
                                                                const nextSet = new Set(compSet)
                                                                if (nextChecked) nextSet.add(comp)
                                                                else nextSet.delete(comp)
                                                                const components = Array.from(nextSet) as Array<'V' | 'S' | 'M'>
                                                                const material =
                                                                  components.includes('M') ? hb.material : undefined
                                                                setHb({ ...hb, components: components.length ? components : undefined, material })
                                                              }}
                                                            />
                                                            <span>{comp}</span>
                                                          </label>
                                                        )
                                                      })}
                                                    </div>

                                                    {(hb.components ?? []).includes('M') ? (
                                                      <div className="mt-2">
                                                        <Input
                                                          className="mt-1"
                                                          value={hb.material ?? ''}
                                                          onChange={(e) => setHb({ ...hb, material: e.target.value || undefined })}
                                                          placeholder="Material (opcional)"
                                                        />
                                                      </div>
                                                    ) : null}
                                                  </div>

                                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    <div>
                                                      <label className="text-xs text-text">Dano (base)</label>
                                                      <Input
                                                        className="mt-1"
                                                        value={hb.damageDice ?? ''}
                                                        onChange={(e) => setHb({ ...hb, damageDice: e.target.value || undefined })}
                                                        placeholder="ex: 2d6+3"
                                                      />
                                                    </div>
                                                    <div>
                                                      <label className="text-xs text-text">Mecânica</label>
                                                      <Select
                                                        className="mt-1"
                                                        value={mechanic}
                                                        onChange={(e) => {
                                                          const nextMechanic = e.target.value as HomebrewSpellMechanic
                                                          setHb({
                                                            ...hb,
                                                            mechanic: nextMechanic,
                                                            saveAbility:
                                                              nextMechanic === 'save' || nextMechanic === 'both'
                                                                ? (hb.saveAbility ?? 'dex')
                                                                : undefined,
                                                          })
                                                        }}
                                                      >
                                                        <option value="none">Nenhuma</option>
                                                        <option value="attack">Ataque</option>
                                                        <option value="save">Teste de resistência</option>
                                                        <option value="both">Ataque + Teste</option>
                                                      </Select>

                                                      {needsSaveAbility ? (
                                                        <div className="mt-2">
                                                          <label className="text-xs text-text">Resistência (atributo)</label>
                                                          <Select
                                                            className="mt-1"
                                                            value={hb.saveAbility ?? 'dex'}
                                                            onChange={(e) =>
                                                              setHb({ ...hb, saveAbility: e.target.value as Ability })
                                                            }
                                                          >
                                                            {ABILITY_KEYS.map((key) => (
                                                              <option key={key} value={key}>
                                                                {abilityShort(key)}
                                                              </option>
                                                            ))}
                                                          </Select>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>

                                                  <div>
                                                    <label className="text-xs text-text">Classes base</label>
                                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                                      {(
                                                        [
                                                          'artificer',
                                                          'barbarian',
                                                          'bard',
                                                          'cleric',
                                                          'druid',
                                                          'fighter',
                                                          'monk',
                                                          'paladin',
                                                          'ranger',
                                                          'rogue',
                                                          'sorcerer',
                                                          'warlock',
                                                          'wizard',
                                                        ] as const
                                                      ).map((idx) => {
                                                        const checked = baseClasses.includes(idx)
                                                        const label = apiClassLabel({ index: idx, name: idx, url: '' })
                                                        return (
                                                          <label key={idx} className="flex items-center gap-2 text-xs text-text">
                                                            <input
                                                              type="checkbox"
                                                              checked={checked}
                                                              onChange={(e) => {
                                                                const set = new Set(baseClasses)
                                                                if (e.target.checked) set.add(idx)
                                                                else set.delete(idx)
                                                                const classes = Array.from(set).sort()
                                                                setHb({ ...hb, classes: classes.length ? classes : undefined })
                                                              }}
                                                            />
                                                            <span>{label}</span>
                                                          </label>
                                                        )
                                                      })}
                                                    </div>
                                                  </div>

                                                  <div>
                                                    <label className="text-xs text-text">Descrição</label>
                                                    <Textarea
                                                      className="mt-1"
                                                      value={hb.desc ?? ''}
                                                      onChange={(e) => setHb({ ...hb, desc: e.target.value || undefined })}
                                                      placeholder="Opcional. Texto livre."
                                                    />
                                                  </div>

                                                  <div>
                                                    <label className="text-xs text-text">Em níveis superiores</label>
                                                    <Textarea
                                                      className="mt-1"
                                                      value={hb.higherLevel ?? ''}
                                                      onChange={(e) => setHb({ ...hb, higherLevel: e.target.value || undefined })}
                                                      placeholder="Opcional."
                                                    />
                                                  </div>
                                                </div>
                                              )}
                                            </>
                                          )
                                        })()}
                                      </div>
                                    ) : (
                                      <div>
                                        <div>
                                          <div className="text-xs font-semibold text-textH">Descrição (API)</div>
                                          <div className="mt-2">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                              <div className="min-w-0 text-xs text-text">
                                                {entry.officialDescPt?.length
                                                  ? 'Traduzido (PT-BR)'
                                                  : 'Original (EN)'}
                                              </div>

                                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
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

                                            <div className="mt-2 space-y-2 text-sm text-text break-words">
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
                                                      <div className="mt-2 space-y-2 text-sm text-text break-words">
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
                                              (eff.mode === 'add' || eff.mode === 'sub' || eff.mode === 'set') &&
                                              target !== 'conditionalDamage' &&
                                              target !== 'saveOutcomeDamage'
                                            const needsAbility =
                                              target === 'attack' || target === 'save' || target === 'ability'
                                            const needsCondition = target === 'condition'
                                            const needsEconomy = target === 'economy'
                                            const needsConditionalDamage = target === 'conditionalDamage'
                                            const needsSaveOutcomeDamage = target === 'saveOutcomeDamage'
                                            const needsRollDice = target === 'rollDice'
                                            const needsForcedMove = target === 'forcedMove'

                                            return (
                                              <div
                                                key={idx}
                                                className="flex flex-col gap-2 rounded-lg border border-border p-2"
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
                                                            unit: nextTarget === 'speed' || nextTarget === 'forcedMove' ? 'm' : undefined,
                                                            condition:
                                                              nextTarget === 'condition'
                                                                ? (prev.condition ?? 'blinded')
                                                                : undefined,
                                                            economy: nextTarget === 'economy' ? (prev.economy ?? 'action') : undefined,
                                                            damageWhen:
                                                              nextTarget === 'conditionalDamage'
                                                                ? (prev.damageWhen ?? 'ao se mover')
                                                                : undefined,
                                                            damageDice:
                                                              nextTarget === 'conditionalDamage'
                                                                ? (prev.damageDice ?? '1d6')
                                                                : undefined,
                                                            saveOutcome:
                                                              nextTarget === 'saveOutcomeDamage'
                                                                ? (prev.saveOutcome ?? 'success')
                                                                : undefined,
                                                            saveOutcomeText:
                                                              nextTarget === 'saveOutcomeDamage'
                                                                ? (prev.saveOutcomeText ?? '')
                                                                : undefined,
                                                            saveDamageOp:
                                                              nextTarget === 'saveOutcomeDamage'
                                                                ? (prev.saveDamageOp ?? 'div')
                                                                : undefined,
                                                            saveDamageValue:
                                                              nextTarget === 'saveOutcomeDamage'
                                                                ? (typeof prev.saveDamageValue === 'number'
                                                                    ? prev.saveDamageValue
                                                                    : 2)
                                                                : undefined,
                                                            rollDice:
                                                              nextTarget === 'rollDice'
                                                                ? (prev.rollDice ?? '1d4')
                                                                : undefined,
                                                            rollAppliesTo:
                                                              nextTarget === 'rollDice'
                                                                ? (prev.rollAppliesTo ?? ['attack'])
                                                                : undefined,
                                                            forcedMoveDirection:
                                                              nextTarget === 'forcedMove'
                                                                ? (prev.forcedMoveDirection ?? 'any')
                                                                : undefined,
                                                            forcedMoveReference:
                                                              nextTarget === 'forcedMove'
                                                                ? (prev.forcedMoveReference ?? '')
                                                                : undefined,
                                                            forcedMoveDirectionText:
                                                              nextTarget === 'forcedMove'
                                                                ? (prev.forcedMoveDirectionText ?? '')
                                                                : undefined,
                                                            value:
                                                              nextTarget === 'condition' || nextTarget === 'economy' || nextMode === 'adv' || nextMode === 'dis' || nextMode === 'apply' || nextMode === 'remove'
                                                                ? (nextTarget === 'forcedMove'
                                                                    ? (typeof prev.value === 'number' ? prev.value : 3)
                                                                    : undefined)
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
                                                          if (mode === 'adv' || mode === 'dis' || mode === 'remove') {
                                                            next.value = undefined
                                                          }
                                                          if (mode === 'apply' && next.target !== 'forcedMove') {
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

                                                {needsForcedMove ? (
                                                  <>
                                                    <div>
                                                      <div className="flex flex-col gap-2">
                                                        <div>
                                                          <label className="text-[11px] text-text">{t('effects.forcedMove.direction')}</label>
                                                          <Select
                                                            className="mt-1 h-9"
                                                            value={eff.forcedMoveDirection ?? 'any'}
                                                            onChange={(e) => {
                                                              const forcedMoveDirection = e.target.value as NonNullable<SpellEffect['forcedMoveDirection']>
                                                              updateCharacter(activeCharacter.id, (c) => ({
                                                                ...c,
                                                                spells: c.spells.map((s) => {
                                                                  if (s.spellIndex !== entry.spellIndex) return s
                                                                  const effects = [...(s.effects ?? [])]
                                                                  effects[idx] = { ...effects[idx], forcedMoveDirection }
                                                                  return { ...s, effects }
                                                                }),
                                                              }))
                                                            }}
                                                          >
                                                            <option value="any">{t('effects.forcedMove.direction.any')}</option>
                                                            <option value="towards">{t('effects.forcedMove.direction.towards')}</option>
                                                            <option value="away">{t('effects.forcedMove.direction.away')}</option>
                                                            <option value="direction">{t('effects.forcedMove.direction.direction')}</option>
                                                          </Select>
                                                        </div>

                                                        <div>
                                                          <label className="text-[11px] text-text">{t('effects.forcedMove.distance')}</label>
                                                          <div className="mt-1 flex items-center gap-2">
                                                            <Button
                                                              type="button"
                                                              size="sm"
                                                              variant="secondary"
                                                              className="h-9 w-9 px-0"
                                                              title="Diminuir"
                                                              onClick={() => {
                                                                const current = typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                                                const next = Math.max(0, Math.round((current - 0.5) * 10) / 10)
                                                                updateCharacter(activeCharacter.id, (c) => ({
                                                                  ...c,
                                                                  spells: c.spells.map((s) => {
                                                                    if (s.spellIndex !== entry.spellIndex) return s
                                                                    const effects = [...(s.effects ?? [])]
                                                                    effects[idx] = { ...effects[idx], value: next, unit: 'm' }
                                                                    return { ...s, effects }
                                                                  }),
                                                                }))
                                                              }}
                                                            >
                                                              −
                                                            </Button>

                                                            <Input
                                                              className="h-9 !w-auto flex-1 min-w-0"
                                                              type="number"
                                                              inputMode="decimal"
                                                              value={typeof eff.value === 'number' ? String(eff.value) : ''}
                                                              onFocus={(e) => e.currentTarget.select()}
                                                              onChange={(e) => {
                                                                const raw = e.target.value
                                                                const value = raw === '' ? undefined : Number(raw)
                                                                updateCharacter(activeCharacter.id, (c) => ({
                                                                  ...c,
                                                                  spells: c.spells.map((s) => {
                                                                    if (s.spellIndex !== entry.spellIndex) return s
                                                                    const effects = [...(s.effects ?? [])]
                                                                    effects[idx] = { ...effects[idx], value, unit: 'm' }
                                                                    return { ...s, effects }
                                                                  }),
                                                                }))
                                                              }}
                                                              min={0}
                                                              step={0.5}
                                                              placeholder="ex: 3"
                                                            />

                                                            <Button
                                                              type="button"
                                                              size="sm"
                                                              variant="secondary"
                                                              className="h-9 w-9 px-0"
                                                              title="Aumentar"
                                                              onClick={() => {
                                                                const current = typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                                                const next = Math.max(0, Math.round((current + 0.5) * 10) / 10)
                                                                updateCharacter(activeCharacter.id, (c) => ({
                                                                  ...c,
                                                                  spells: c.spells.map((s) => {
                                                                    if (s.spellIndex !== entry.spellIndex) return s
                                                                    const effects = [...(s.effects ?? [])]
                                                                    effects[idx] = { ...effects[idx], value: next, unit: 'm' }
                                                                    return { ...s, effects }
                                                                  }),
                                                                }))
                                                              }}
                                                            >
                                                              +
                                                            </Button>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">
                                                        {(eff.forcedMoveDirection ?? 'any') === 'direction'
                                                          ? t('effects.forcedMove.directionText')
                                                          : t('effects.forcedMove.reference')}
                                                      </label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        disabled={(eff.forcedMoveDirection ?? 'any') === 'any'}
                                                        value={
                                                          (eff.forcedMoveDirection ?? 'any') === 'direction'
                                                            ? (eff.forcedMoveDirectionText ?? '')
                                                            : (eff.forcedMoveReference ?? '')
                                                        }
                                                        onChange={(e) => {
                                                          const v = e.target.value
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] =
                                                                (eff.forcedMoveDirection ?? 'any') === 'direction'
                                                                  ? { ...effects[idx], forcedMoveDirectionText: v }
                                                                  : { ...effects[idx], forcedMoveReference: v }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        placeholder={
                                                          (eff.forcedMoveDirection ?? 'any') === 'direction'
                                                            ? t('effects.forcedMove.directionText.placeholder')
                                                            : t('effects.forcedMove.reference.placeholder')
                                                        }
                                                      />
                                                    </div>
                                                  </>
                                                ) : null}

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

                                                {needsSaveOutcomeDamage ? (
                                                  <>
                                                    <div>
                                                      <label className="text-[11px] text-text">Quando</label>
                                                      <Select
                                                        className="mt-1 h-9"
                                                        value={eff.saveOutcome ?? 'success'}
                                                        onChange={(e) => {
                                                          const saveOutcome = e.target.value as NonNullable<SpellEffect['saveOutcome']>
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], saveOutcome }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                      >
                                                        <option value="success">TR passou</option>
                                                        <option value="failure">TR falhou</option>
                                                      </Select>
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">Texto (opcional)</label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        value={eff.saveOutcomeText ?? ''}
                                                        onChange={(e) => {
                                                          const raw = e.target.value
                                                          const saveOutcomeText = raw
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], saveOutcomeText }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        placeholder='ex: metade do dano'
                                                      />
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">Ajuste</label>
                                                      <Select
                                                        className="mt-1 h-9"
                                                        value={eff.saveDamageOp ?? 'div'}
                                                        onChange={(e) => {
                                                          const saveDamageOp = e.target.value as NonNullable<SpellEffect['saveDamageOp']>
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], saveDamageOp }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                      >
                                                        <option value="mul">× (multiplicar)</option>
                                                        <option value="div">÷ (dividir)</option>
                                                        <option value="add">+ (somar)</option>
                                                        <option value="sub">− (subtrair)</option>
                                                      </Select>
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">Valor</label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={typeof eff.saveDamageValue === 'number' ? String(eff.saveDamageValue) : ''}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => {
                                                          const raw = e.target.value
                                                          const saveDamageValue = raw === '' ? undefined : Number(raw)
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], saveDamageValue }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        min={0}
                                                        step={0.5}
                                                        placeholder="ex: 2"
                                                      />
                                                    </div>
                                                  </>
                                                ) : needsConditionalDamage ? (
                                                  <>
                                                    <div>
                                                      <label className="text-[11px] text-text">Quando</label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        value={eff.damageWhen ?? ''}
                                                        onChange={(e) => {
                                                          const damageWhen = e.target.value || undefined
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], damageWhen }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        placeholder="ex: ao se mover"
                                                      />
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">Dados (NdN)</label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        value={eff.damageDice ?? ''}
                                                        onChange={(e) => {
                                                          const damageDice = e.target.value || undefined
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], damageDice }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        placeholder="ex: 2d6"
                                                      />
                                                    </div>
                                                  </>
                                                ) : needsRollDice ? (
                                                  <>
                                                    <div>
                                                      <label className="text-[11px] text-text">Aplica em</label>
                                                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-text">
                                                        <label className="flex items-center gap-2">
                                                          <input
                                                            type="checkbox"
                                                            checked={(eff.rollAppliesTo ?? []).includes('attack')}
                                                            onChange={(e) => {
                                                              const set = new Set(eff.rollAppliesTo ?? [])
                                                              if (e.target.checked) set.add('attack')
                                                              else set.delete('attack')
                                                              updateCharacter(activeCharacter.id, (c) => ({
                                                                ...c,
                                                                spells: c.spells.map((s) => {
                                                                  if (s.spellIndex !== entry.spellIndex) return s
                                                                  const effects = [...(s.effects ?? [])]
                                                                  effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                                                  return { ...s, effects }
                                                                }),
                                                              }))
                                                            }}
                                                          />
                                                          ATQ
                                                        </label>

                                                        <label className="flex items-center gap-2">
                                                          <input
                                                            type="checkbox"
                                                            checked={(eff.rollAppliesTo ?? []).includes('save')}
                                                            onChange={(e) => {
                                                              const set = new Set(eff.rollAppliesTo ?? [])
                                                              if (e.target.checked) set.add('save')
                                                              else set.delete('save')
                                                              updateCharacter(activeCharacter.id, (c) => ({
                                                                ...c,
                                                                spells: c.spells.map((s) => {
                                                                  if (s.spellIndex !== entry.spellIndex) return s
                                                                  const effects = [...(s.effects ?? [])]
                                                                  effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                                                  return { ...s, effects }
                                                                }),
                                                              }))
                                                            }}
                                                          />
                                                          TR
                                                        </label>

                                                        <label className="flex items-center gap-2">
                                                          <input
                                                            type="checkbox"
                                                            checked={(eff.rollAppliesTo ?? []).includes('skill')}
                                                            onChange={(e) => {
                                                              const set = new Set(eff.rollAppliesTo ?? [])
                                                              if (e.target.checked) set.add('skill')
                                                              else set.delete('skill')
                                                              updateCharacter(activeCharacter.id, (c) => ({
                                                                ...c,
                                                                spells: c.spells.map((s) => {
                                                                  if (s.spellIndex !== entry.spellIndex) return s
                                                                  const effects = [...(s.effects ?? [])]
                                                                  effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                                                  return { ...s, effects }
                                                                }),
                                                              }))
                                                            }}
                                                          />
                                                          Perícia
                                                        </label>
                                                      </div>
                                                    </div>

                                                    <div>
                                                      <label className="text-[11px] text-text">Dado (NdN)</label>
                                                      <Input
                                                        className="mt-1 h-9"
                                                        value={eff.rollDice ?? ''}
                                                        onChange={(e) => {
                                                          const rollDice = e.target.value || undefined
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = { ...effects[idx], rollDice }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                        placeholder="ex: 1d4"
                                                      />
                                                    </div>
                                                  </>
                                                ) : needsForcedMove ? null : (
                                                  <div>
                                                    <label className="text-[11px] text-text">{target === 'speed' ? 'Valor (m)' : 'Valor'}</label>
                                                    <div className="mt-1 flex items-center gap-2">
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-9 w-9 px-0"
                                                        title="Diminuir"
                                                        disabled={!needsValue}
                                                        onClick={() => {
                                                          if (!needsValue) return

                                                          const current = (() => {
                                                            if (target !== 'speed') {
                                                              return typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                                            }
                                                            if (typeof eff.value !== 'number' || !Number.isFinite(eff.value)) return 0
                                                            const unit = eff.unit ?? 'ft'
                                                            const meters = unit === 'm' ? eff.value : eff.value * 0.3
                                                            return Math.round(meters * 10) / 10
                                                          })()

                                                          const next = Math.round((current - 1) * 10) / 10
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = {
                                                                ...effects[idx],
                                                                value: next,
                                                                unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                                              }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                      >
                                                        −
                                                      </Button>

                                                      <Input
                                                        className="h-9 !w-auto flex-1 min-w-0"
                                                        type="number"
                                                        inputMode="decimal"
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
                                                        onFocus={(e) => e.currentTarget.select()}
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

                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-9 w-9 px-0"
                                                        title="Aumentar"
                                                        disabled={!needsValue}
                                                        onClick={() => {
                                                          if (!needsValue) return

                                                          const current = (() => {
                                                            if (target !== 'speed') {
                                                              return typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                                            }
                                                            if (typeof eff.value !== 'number' || !Number.isFinite(eff.value)) return 0
                                                            const unit = eff.unit ?? 'ft'
                                                            const meters = unit === 'm' ? eff.value : eff.value * 0.3
                                                            return Math.round(meters * 10) / 10
                                                          })()

                                                          const next = Math.round((current + 1) * 10) / 10
                                                          updateCharacter(activeCharacter.id, (c) => ({
                                                            ...c,
                                                            spells: c.spells.map((s) => {
                                                              if (s.spellIndex !== entry.spellIndex) return s
                                                              const effects = [...(s.effects ?? [])]
                                                              effects[idx] = {
                                                                ...effects[idx],
                                                                value: next,
                                                                unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                                              }
                                                              return { ...s, effects }
                                                            }),
                                                          }))
                                                        }}
                                                      >
                                                        +
                                                      </Button>
                                                    </div>
                                                  </div>
                                                )}

                                                <div className="flex justify-end">
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
                                </div>
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
