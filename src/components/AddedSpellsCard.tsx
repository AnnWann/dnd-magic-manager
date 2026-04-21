import { Fragment, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type {
  Ability,
  AddedSpell,
  ActionEconomyKey,
  Character,
  ConditionKey,
  DndSpell,
  MagicCircleLevel,
  PrimaryRollDisplayMode,
  RestResetKind,
  SpellEffect,
  SpellTranslation,
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
import { loadMetamagicDb, metamagicDisplayName, type MetamagicOption } from '../lib/metamagicDb'
import { multiclassSpellSlots } from '../lib/spellSlots'
import { castTimeKindFromText, castTimeKindLabelPt } from '../lib/castTime'
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
import { useI18n } from '../i18n/I18nContext'
import { SpellQuickDetailsModalRow } from './addedSpells/SpellQuickDetailsModalRow'
import { SpellEditorModal } from './addedSpells/spellEditor/SpellEditorModal'

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

  hideUa: boolean
  setHideUa: Dispatch<SetStateAction<boolean>>

  openSpellIndex: string | null
  setOpenSpellIndex: Dispatch<SetStateAction<string | null>>
  openSpellTab: 'official' | 'modifiers' | 'headcanon'
  setOpenSpellTab: Dispatch<SetStateAction<'official' | 'modifiers' | 'headcanon'>>

  translateStatus: TranslateStatus
  translateOfficialToPt: (args: { spellIndex: string; desc: string[]; higher: string[]; material?: string }) => Promise<void>

  spellTranslations: Record<string, SpellTranslation>

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
    hideUa,
    setHideUa,
    openSpellIndex,
    setOpenSpellIndex,
    openSpellTab,
    setOpenSpellTab,
    translateStatus,
    translateOfficialToPt,
    spellTranslations,
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

  const slotMeta = useMemo(() => multiclassSpellSlots(activeCharacter.classes), [activeCharacter.classes])

  const slotUsage = activeCharacter.slotUsage ?? { usedByLevel: undefined, pactUsed: 0 }
  const usedByLevel = (() => {
    const arr = Array.isArray(slotUsage.usedByLevel) ? [...slotUsage.usedByLevel] : []
    while (arr.length < 10) arr.push(0)
    return arr
  })()
  const pactUsed = typeof slotUsage.pactUsed === 'number' && Number.isFinite(slotUsage.pactUsed)
    ? Math.max(0, Math.trunc(slotUsage.pactUsed))
    : 0

  const sorcererLevel = useMemo(
    () =>
      activeCharacter.classes.reduce(
        (acc, c) => acc + (c.classIndex === 'sorcerer' ? (typeof c.level === 'number' ? c.level : 0) : 0),
        0,
      ),
    [activeCharacter.classes],
  )
  const sorceryPointsMax = Math.max(0, Math.trunc(sorcererLevel))
  const sorceryPointsUsedRaw = activeCharacter.sorceryPointsUsed
  const sorceryPointsUsed =
    typeof sorceryPointsUsedRaw === 'number' && Number.isFinite(sorceryPointsUsedRaw)
      ? Math.max(0, Math.trunc(sorceryPointsUsedRaw))
      : 0
  const sorceryPointsUsedClamped = sorceryPointsMax > 0 ? Math.min(sorceryPointsUsed, sorceryPointsMax) : 0
  const sorceryPointsRemaining = sorceryPointsMax > 0 ? Math.max(0, sorceryPointsMax - sorceryPointsUsedClamped) : 0

  function isUaName(name: string) {
    return name.toLowerCase().includes('(ua)')
  }

  function isUaSpellEntry(s: AddedSpell) {
    return isUaName(s.displayNamePt?.trim() || s.spellName)
  }

  const [metamagicOptions, setMetamagicOptions] = useState<MetamagicOption[] | null>(null)
  const [metamagicError, setMetamagicError] = useState<string | null>(null)
  const [addMetamagicId, setAddMetamagicId] = useState<string>('')

  useEffect(() => {
    if (sorceryPointsMax <= 0) return
    const ctrl = new AbortController()
    loadMetamagicDb(ctrl.signal)
      .then((payload) => {
        const list = Array.isArray(payload?.metamagics) ? payload.metamagics : []
        const isUa = (m: MetamagicOption) => {
          const name = metamagicDisplayName(m).toLowerCase()
          return name.includes('(ua)') || m.id.toLowerCase().includes('-ua')
        }
        const filtered = hideUa ? list.filter((m) => !isUa(m)) : list
        const sorted = [...filtered].sort((a, b) =>
          metamagicDisplayName(a).toLocaleLowerCase('pt-BR').localeCompare(
            metamagicDisplayName(b).toLocaleLowerCase('pt-BR'),
            'pt-BR',
          ),
        )
        setMetamagicOptions(sorted)
        setMetamagicError(null)
        if (!addMetamagicId && sorted[0]?.id) setAddMetamagicId(sorted[0].id)
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return
        setMetamagicError(e instanceof Error ? e.message : String(e))
        setMetamagicOptions([])
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorceryPointsMax, hideUa])

  const selectedMetamagicIds = useMemo(() => {
    const raw = Array.isArray(activeCharacter.metamagics) ? activeCharacter.metamagics : []
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of raw) {
      const id = typeof v === 'string' ? v.trim() : ''
      if (!id) continue
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    return out
  }, [activeCharacter.metamagics])

  const metamagicById = useMemo(() => {
    const map: Record<string, MetamagicOption> = {}
    for (const m of metamagicOptions ?? []) map[m.id] = m
    return map
  }, [metamagicOptions])

  const visibleSelectedMetamagicIds = useMemo(() => {
    if (!hideUa) return selectedMetamagicIds
    return selectedMetamagicIds.filter((id) => {
      const m = metamagicById[id]
      if (m) return !isUaName(metamagicDisplayName(m))
      return !id.toLowerCase().includes('-ua')
    })
  }, [hideUa, metamagicById, selectedMetamagicIds])

  const metamagicAddCandidates = useMemo(() => {
    const selected = new Set(selectedMetamagicIds)
    return (metamagicOptions ?? []).filter((m) => !selected.has(m.id))
  }, [metamagicOptions, selectedMetamagicIds])

  const addMetamagic = addMetamagicId ? metamagicById[addMetamagicId] : undefined
  const addMetamagicDesc = (addMetamagic?.descPt ?? [])
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => x.trim())

  useEffect(() => {
    if (sorceryPointsMax <= 0) return
    const candidates = metamagicAddCandidates
    if (candidates.length === 0) return
    if (addMetamagicId && candidates.some((c) => c.id === addMetamagicId)) return
    setAddMetamagicId(candidates[0].id)
  }, [addMetamagicId, metamagicAddCandidates, sorceryPointsMax])

  const spellsForLists = useMemo(
    () => (hideUa ? activeCharacter.spells.filter((s) => !isUaSpellEntry(s)) : activeCharacter.spells),
    [activeCharacter.spells, hideUa],
  )

  const [addFreeUsesSpellIndex, setAddFreeUsesSpellIndex] = useState<string>(() => activeCharacter.spells[0]?.spellIndex ?? '')
  const [addFreeUsesMax, setAddFreeUsesMax] = useState<number>(1)
  const [addFreeUsesReset, setAddFreeUsesReset] = useState<RestResetKind>('longRest')

  useEffect(() => {
    const candidates = spellsForLists
    if (candidates.length === 0) {
      if (addFreeUsesSpellIndex) setAddFreeUsesSpellIndex('')
      return
    }
    if (addFreeUsesSpellIndex && candidates.some((c) => c.spellIndex === addFreeUsesSpellIndex)) return
    setAddFreeUsesSpellIndex(candidates[0].spellIndex)
  }, [addFreeUsesSpellIndex, spellsForLists])

  const freeUseSpells = useMemo(() => {
    const list = spellsForLists
      .map((s) => {
        const maxRaw = s.freeUses?.max
        const max = typeof maxRaw === 'number' && Number.isFinite(maxRaw) ? Math.max(0, Math.trunc(maxRaw)) : 0
        const reset = (s.freeUses?.reset ?? 'longRest') as RestResetKind
        const usedRaw = s.freeUses?.used
        const used = typeof usedRaw === 'number' && Number.isFinite(usedRaw) ? Math.max(0, Math.trunc(usedRaw)) : 0
        const usedClamped = max > 0 ? Math.min(used, max) : 0
        const remaining = max > 0 ? Math.max(0, max - usedClamped) : 0
        const name = s.displayNamePt?.trim() || s.spellName
        return {
          spellIndex: s.spellIndex,
          name,
          max,
          reset,
          used: usedClamped,
          remaining,
        }
      })
      .filter((x) => x.max > 0)

    return list.sort((a, b) => a.name.toLocaleLowerCase('pt-BR').localeCompare(b.name.toLocaleLowerCase('pt-BR'), 'pt-BR'))
  }, [spellsForLists])

  const hasAnySlots = slotMeta.spellcastingLevel > 0 || Boolean(slotMeta.pact)
  const canShowResources = hasAnySlots || activeCharacter.spells.length > 0

  const [openMaterialSpellIndex, setOpenMaterialSpellIndex] = useState<string | null>(null)
  const [editMaterialSpellIndex, setEditMaterialSpellIndex] = useState<string | null>(null)
  const [editMaterialValue, setEditMaterialValue] = useState('')
  const [openDetailsSpellIndex, setOpenDetailsSpellIndex] = useState<string | null>(null)
  const [openSourceInfoSpellIndex, setOpenSourceInfoSpellIndex] = useState<string | null>(null)
  const [openHomebrewEditSpellIndex, setOpenHomebrewEditSpellIndex] = useState<string | null>(null)

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
        <div className="space-y-3">
          <div className="min-w-0">
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

            {canShowResources ? (
              <div className="mt-3">
                {hasAnySlots ? (
                  <>
                    <div className="text-xs font-semibold text-textH">
                      Slots
                      {slotMeta.spellcastingLevel > 0 ? (
                        <span className="font-normal text-text"> - Nível conjurador: {slotMeta.spellcastingLevel}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="flex gap-2">
                        {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => {
                          const total = slotMeta.slotsByLevel[lvl] ?? 0
                          if (!total) return null
                          const used = Math.max(0, Math.trunc(usedByLevel[lvl] ?? 0))
                          const remaining = Math.max(0, total - used)
                          return (
                            <div key={lvl} className="rounded-md border border-border bg-bg px-2 py-1">
                              <div className="text-[11px] text-text">Círc. {lvl}</div>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className="font-mono text-xs text-textH">{remaining}/{total}</span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 w-7 px-0"
                                  title="Recuperar 1"
                                  disabled={used <= 0}
                                  onClick={() => {
                                    updateCharacter(activeCharacter.id, (c) => {
                                      const prev = c.slotUsage ?? {}
                                      const arr = Array.isArray(prev.usedByLevel) ? [...prev.usedByLevel] : []
                                      while (arr.length < 10) arr.push(0)
                                      arr[lvl] = Math.max(0, Math.trunc(arr[lvl] ?? 0) - 1)
                                      return { ...c, slotUsage: { ...prev, usedByLevel: arr } }
                                    })
                                  }}
                                >
                                  +
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 w-7 px-0"
                                  title="Gastar 1"
                                  disabled={remaining <= 0}
                                  onClick={() => {
                                    updateCharacter(activeCharacter.id, (c) => {
                                      const prev = c.slotUsage ?? {}
                                      const arr = Array.isArray(prev.usedByLevel) ? [...prev.usedByLevel] : []
                                      while (arr.length < 10) arr.push(0)
                                      arr[lvl] = Math.max(0, Math.trunc(arr[lvl] ?? 0)) + 1
                                      return { ...c, slotUsage: { ...prev, usedByLevel: arr } }
                                    })
                                  }}
                                >
                                  −
                                </Button>
                              </div>
                            </div>
                          )
                        })}

                        {slotMeta.pact ? (
                          (() => {
                            const total = slotMeta.pact.slots
                            const used = pactUsed
                            const remaining = Math.max(0, total - used)
                            return (
                              <div className="rounded-md border border-border bg-bg px-2 py-1">
                                <div className="text-[11px] text-text">Pacto (círc. {slotMeta.pact.slotLevel})</div>
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="font-mono text-xs text-textH">{remaining}/{total}</span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 w-7 px-0"
                                    title="Recuperar 1 (curto)"
                                    disabled={used <= 0}
                                    onClick={() => {
                                      updateCharacter(activeCharacter.id, (c) => {
                                        const prev = c.slotUsage ?? {}
                                        const nextUsed = Math.max(0, Math.trunc((prev.pactUsed ?? 0) as number) - 1)
                                        return { ...c, slotUsage: { ...prev, pactUsed: nextUsed } }
                                      })
                                    }}
                                  >
                                    +
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 w-7 px-0"
                                    title="Gastar 1 (curto)"
                                    disabled={remaining <= 0}
                                    onClick={() => {
                                      updateCharacter(activeCharacter.id, (c) => {
                                        const prev = c.slotUsage ?? {}
                                        const nextUsed = Math.max(0, Math.trunc((prev.pactUsed ?? 0) as number)) + 1
                                        return { ...c, slotUsage: { ...prev, pactUsed: nextUsed } }
                                      })
                                    }}
                                  >
                                    −
                                  </Button>
                                </div>
                              </div>
                            )
                          })()
                        ) : null}

                        {sorceryPointsMax > 0 ? (
                          <div className="rounded-md border border-border bg-bg px-2 py-1">
                            <div className="text-[11px] text-text">Metamagia (PF)</div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="font-mono text-xs text-textH">{sorceryPointsRemaining}/{sorceryPointsMax}</span>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 w-7 px-0"
                                title="Recuperar 1 (pontos de feitiçaria)"
                                disabled={sorceryPointsUsedClamped <= 0}
                                onClick={() => {
                                  updateCharacter(activeCharacter.id, (c) => {
                                    const max = c.classes.reduce(
                                      (acc, cls) => acc + (cls.classIndex === 'sorcerer' ? (typeof cls.level === 'number' ? cls.level : 0) : 0),
                                      0,
                                    )
                                    const m = Math.max(0, Math.trunc(max))
                                    if (m <= 0) return { ...c, sorceryPointsUsed: undefined }

                                    const prevUsedRaw = c.sorceryPointsUsed
                                    const prevUsed =
                                      typeof prevUsedRaw === 'number' && Number.isFinite(prevUsedRaw)
                                        ? Math.max(0, Math.trunc(prevUsedRaw))
                                        : 0
                                    const nextUsed = Math.max(0, Math.min(m, prevUsed - 1))
                                    return { ...c, sorceryPointsUsed: nextUsed }
                                  })
                                }}
                              >
                                +
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 w-7 px-0"
                                title="Gastar 1 (pontos de feitiçaria)"
                                disabled={sorceryPointsRemaining <= 0}
                                onClick={() => {
                                  updateCharacter(activeCharacter.id, (c) => {
                                    const max = c.classes.reduce(
                                      (acc, cls) => acc + (cls.classIndex === 'sorcerer' ? (typeof cls.level === 'number' ? cls.level : 0) : 0),
                                      0,
                                    )
                                    const m = Math.max(0, Math.trunc(max))
                                    if (m <= 0) return { ...c, sorceryPointsUsed: undefined }

                                    const prevUsedRaw = c.sorceryPointsUsed
                                    const prevUsed =
                                      typeof prevUsedRaw === 'number' && Number.isFinite(prevUsedRaw)
                                        ? Math.max(0, Math.trunc(prevUsedRaw))
                                        : 0
                                    const nextUsed = Math.max(0, Math.min(m, prevUsed + 1))
                                    return { ...c, sorceryPointsUsed: nextUsed }
                                  })
                                }}
                              >
                                −
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9"
                          title="Reset (descanso curto)"
                          onClick={() => {
                            updateCharacter(activeCharacter.id, (c) => {
                              const prev = c.slotUsage ?? {}
                              const nextSpells = c.spells.map((s) => {
                                const fu = s.freeUses
                                if (!fu) return s
                                const reset = (fu.reset ?? 'longRest') as RestResetKind
                                if (reset !== 'shortRest') return s
                                const used =
                                  typeof fu.used === 'number' && Number.isFinite(fu.used)
                                    ? Math.max(0, Math.trunc(fu.used))
                                    : 0
                                if (used === 0) return s
                                return { ...s, freeUses: { ...fu, used: 0 } }
                              })
                              return {
                                ...c,
                                spells: nextSpells,
                                slotUsage: { ...prev, pactUsed: 0 },
                              }
                            })
                          }}
                        >
                          Descanso curto
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9"
                          title="Reset (descanso longo)"
                          onClick={() => {
                            updateCharacter(activeCharacter.id, (c) => {
                              const prev = c.slotUsage ?? {}
                              const sorcLevel = c.classes.reduce(
                                (acc, cls) =>
                                  acc + (cls.classIndex === 'sorcerer' ? (typeof cls.level === 'number' ? cls.level : 0) : 0),
                                0,
                              )
                              const nextSpells = c.spells.map((s) => {
                                const fu = s.freeUses
                                if (!fu) return s
                                const reset = (fu.reset ?? 'longRest') as RestResetKind
                                if (reset !== 'longRest' && reset !== 'shortRest') return s
                                const used =
                                  typeof fu.used === 'number' && Number.isFinite(fu.used)
                                    ? Math.max(0, Math.trunc(fu.used))
                                    : 0
                                if (used === 0) return s
                                return { ...s, freeUses: { ...fu, used: 0 } }
                              })
                              return {
                                ...c,
                                spells: nextSpells,
                                sorceryPointsUsed: sorcLevel > 0 ? 0 : undefined,
                                slotUsage: { ...prev, pactUsed: 0, usedByLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
                              }
                            })
                          }}
                        >
                          Descanso longo
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}

                {sorceryPointsMax > 0 ? (
                  <div className={hasAnySlots ? 'mt-3' : 'mt-2'}>
                    <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                      <div className="text-xs font-semibold text-textH">Metamagias</div>
                      <div className="mt-1 text-xs text-text">Seleção por personagem (Feiticeiro).</div>

                      {metamagicError ? (
                        <div className="mt-2 text-xs text-text">Erro ao carregar: {metamagicError}</div>
                      ) : null}

                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                        <div className="md:col-span-3">
                          <label className="text-[11px] text-text">Adicionar</label>
                          <Select
                            className="mt-1 h-9"
                            value={addMetamagicId}
                            onChange={(e) => setAddMetamagicId(e.target.value)}
                            disabled={!metamagicAddCandidates.length}
                          >
                            {metamagicAddCandidates.map((m) => (
                              <option key={m.id} value={m.id}>
                                {metamagicDisplayName(m)}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="md:col-span-1 flex items-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 w-full"
                            disabled={!addMetamagicId || !metamagicAddCandidates.length}
                            onClick={() => {
                              const id = addMetamagicId.trim()
                              if (!id) return
                              updateCharacter(activeCharacter.id, (c) => {
                                const prev = Array.isArray(c.metamagics) ? c.metamagics : []
                                if (prev.includes(id)) return c
                                return { ...c, metamagics: [...prev, id] }
                              })
                            }}
                          >
                            Adicionar
                          </Button>
                        </div>
                      </div>

                      {addMetamagicDesc.length ? (
                        <div className="mt-2 space-y-1 text-xs text-text whitespace-normal break-words">
                          {addMetamagicDesc.map((p, i) => (
                            <div key={`${addMetamagicId}-preview-${i}`}>{p}</div>
                          ))}
                        </div>
                      ) : null}

                      {visibleSelectedMetamagicIds.length ? (
                        <div className="mt-2 space-y-2">
                          {visibleSelectedMetamagicIds.map((id) => {
                            const m = metamagicById[id]
                            const name = m ? metamagicDisplayName(m) : id
                            const desc = (m?.descPt ?? []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
                            return (
                              <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-textH break-words">{name}</div>
                                  {desc.length ? (
                                    <div className="mt-1 space-y-1 text-xs text-text whitespace-normal break-words">
                                      {desc.map((p, i) => (
                                        <div key={`${id}-${i}`}>{p}</div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8"
                                  onClick={() => {
                                    updateCharacter(activeCharacter.id, (c) => {
                                      const prev = Array.isArray(c.metamagics) ? c.metamagics : []
                                      const next = prev.filter((x) => x !== id)
                                      return { ...c, metamagics: next.length ? next : undefined }
                                    })
                                  }}
                                >
                                  Remover
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-text">Nenhuma metamagia selecionada.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className={hasAnySlots ? 'mt-3' : 'mt-2'}>
                  <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                    <div className="text-xs font-semibold text-textH">Conjurações grátis</div>
                    <div className="mt-1 text-xs text-text">Usos que não gastam slot (ex: Fey Touched).</div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="text-[11px] text-text">Magia</label>
                        <Select
                          className="mt-1 h-9"
                          value={addFreeUsesSpellIndex}
                          onChange={(e) => setAddFreeUsesSpellIndex(e.target.value)}
                        >
                          {spellsForLists
                            .map((s) => ({ idx: s.spellIndex, name: s.displayNamePt?.trim() || s.spellName }))
                            .sort((a, b) => a.name.toLocaleLowerCase('pt-BR').localeCompare(b.name.toLocaleLowerCase('pt-BR'), 'pt-BR'))
                            .map((s) => (
                              <option key={s.idx} value={s.idx}>
                                {s.name}
                              </option>
                            ))}
                        </Select>
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Qtd. (máx.)</label>
                        <Input
                          className="mt-1 h-9"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={String(addFreeUsesMax)}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const n = Math.max(1, Math.trunc(Number(e.target.value)))
                            setAddFreeUsesMax(Number.isFinite(n) ? n : 1)
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Reset</label>
                        <Select
                          className="mt-1 h-9"
                          value={addFreeUsesReset}
                          onChange={(e) => setAddFreeUsesReset(e.target.value as RestResetKind)}
                        >
                          <option value="longRest">Descanso longo</option>
                          <option value="shortRest">Descanso curto</option>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!addFreeUsesSpellIndex}
                        onClick={() => {
                          const idx = addFreeUsesSpellIndex
                          if (!idx) return
                          updateCharacter(activeCharacter.id, (c) => ({
                            ...c,
                            spells: c.spells.map((s) => {
                              if (s.spellIndex !== idx) return s
                              const prev = s.freeUses
                              const usedRaw = prev?.used
                              const used =
                                typeof usedRaw === 'number' && Number.isFinite(usedRaw)
                                  ? Math.max(0, Math.trunc(usedRaw))
                                  : 0
                              return {
                                ...s,
                                freeUses: {
                                  max: Math.max(1, Math.trunc(addFreeUsesMax)),
                                  used: Math.min(used, Math.max(1, Math.trunc(addFreeUsesMax))),
                                  reset: addFreeUsesReset,
                                },
                              }
                            }),
                          }))
                        }}
                      >
                        Adicionar / atualizar
                      </Button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {freeUseSpells.map((x) => (
                        <div key={x.spellIndex} className="flex flex-col gap-2 rounded-lg border border-border p-2 md:flex-row md:items-end">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-text">Magia</div>
                            <div className="mt-1 text-sm font-medium text-textH break-words">{x.name}</div>
                          </div>

                          <div className="w-full md:w-[140px]">
                            <label className="text-[11px] text-text">Qtd. (máx.)</label>
                            <Input
                              className="mt-1 h-9"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={String(x.max)}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const raw = e.target.value
                                const nextMax = raw === '' ? 0 : Math.max(0, Math.trunc(Number(raw)))
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== x.spellIndex) return s
                                    if (!Number.isFinite(nextMax) || nextMax <= 0) {
                                      return { ...s, freeUses: undefined }
                                    }
                                    const prev = s.freeUses
                                    const usedRaw = prev?.used
                                    const used =
                                      typeof usedRaw === 'number' && Number.isFinite(usedRaw)
                                        ? Math.max(0, Math.trunc(usedRaw))
                                        : 0
                                    const reset = (prev?.reset ?? x.reset) as RestResetKind
                                    return { ...s, freeUses: { max: nextMax, used: Math.min(used, nextMax), reset } }
                                  }),
                                }))
                              }}
                            />
                          </div>

                          <div className="w-full md:w-[160px]">
                            <label className="text-[11px] text-text">Reset</label>
                            <Select
                              className="mt-1 h-9"
                              value={x.reset}
                              onChange={(e) => {
                                const nextReset = e.target.value as RestResetKind
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== x.spellIndex) return s
                                    const prev = s.freeUses
                                    if (!prev) return s
                                    return { ...s, freeUses: { ...prev, reset: nextReset } }
                                  }),
                                }))
                              }}
                            >
                              <option value="longRest">Descanso longo</option>
                              <option value="shortRest">Descanso curto</option>
                            </Select>
                          </div>

                          <div className="w-full md:w-[220px]">
                            <label className="text-[11px] text-text">Restante</label>
                            <div className="mt-1 flex items-center gap-2">
                              <Input readOnly className="h-9 !w-auto flex-1 min-w-0" value={`${x.remaining}/${x.max}`} />
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 w-9 px-0"
                                title="Recuperar 1"
                                disabled={x.used <= 0}
                                onClick={() => {
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== x.spellIndex) return s
                                      const prev = s.freeUses
                                      if (!prev) return s
                                      const used = typeof prev.used === 'number' && Number.isFinite(prev.used)
                                        ? Math.max(0, Math.trunc(prev.used))
                                        : 0
                                      return { ...s, freeUses: { ...prev, used: Math.max(0, used - 1) } }
                                    }),
                                  }))
                                }}
                              >
                                +
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 w-9 px-0"
                                title="Gastar 1"
                                disabled={x.remaining <= 0}
                                onClick={() => {
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== x.spellIndex) return s
                                      const prev = s.freeUses
                                      if (!prev) return s
                                      const max = typeof prev.max === 'number' && Number.isFinite(prev.max)
                                        ? Math.max(0, Math.trunc(prev.max))
                                        : 0
                                      if (max <= 0) return { ...s, freeUses: undefined }
                                      const used = typeof prev.used === 'number' && Number.isFinite(prev.used)
                                        ? Math.max(0, Math.trunc(prev.used))
                                        : 0
                                      return { ...s, freeUses: { ...prev, used: Math.min(max, used + 1) } }
                                    }),
                                  }))
                                }}
                              >
                                −
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 px-2"
                                title="Reset"
                                disabled={x.used <= 0}
                                onClick={() => {
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== x.spellIndex) return s
                                      const prev = s.freeUses
                                      if (!prev) return s
                                      return { ...s, freeUses: { ...prev, used: 0 } }
                                    }),
                                  }))
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="text-right text-xs text-text">{activeCharacter.spells.length} no total</div>
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

          <div className="md:col-span-4">
            <label className="text-xs text-text">Conteúdo</label>
            <label className="mt-2 flex items-center gap-2 text-xs text-text">
              <input type="checkbox" checked={hideUa} onChange={(e) => setHideUa(e.target.checked)} />
              <span>Ocultar UA</span>
            </label>
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

                  const usesSaveRaw = Boolean(saveTypeName) || descLower.includes('saving throw')
                  const usesAttackRaw = typeof detail?.attack_type === 'string' || descLower.includes('spell attack')

                  const hideAutoSaveBadges = Boolean(entry.hideAutoSaveBadges)
                  const hideAutoAttackBadges = Boolean(entry.hideAutoAttackBadges)
                  const hideAutoNumericBadges = Boolean(entry.hideAutoNumericBadges)

                  const usesSave = usesSaveRaw && !hideAutoSaveBadges
                  const usesAttack = usesAttackRaw && !hideAutoAttackBadges

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

                  const autoPrimaryRollLabel = (() => {
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

                  const primaryRollMode = (entry.primaryRollMode ?? 'auto') as PrimaryRollDisplayMode
                  const primaryRollLabel = (() => {
                    const saveLabel = () => {
                      if (dcSpell !== null && saveTypeName) return `CD ${dcSpell} ${saveTypeName}`
                      if (dcSpell !== null) return `CD ${dcSpell}`
                      if (saveTypeName) return `TR ${saveTypeName}`
                      return 'TR'
                    }
                    const attackLabel = () => (atkSpell !== null ? `ATQ ${formatSigned(atkSpell)}` : 'ATQ')

                    if (primaryRollMode === 'custom') {
                      const t = entry.primaryRollCustom?.trim()
                      if (t) return t
                    }
                    if (primaryRollMode === 'save') return saveLabel()
                    if (primaryRollMode === 'attack') return attackLabel()
                    if (primaryRollMode === 'damage') return damageEstimate
                    return autoPrimaryRollLabel
                  })()

                  const detailsSubtitle =
                    primaryRollMode === 'save'
                      ? 'Teste / detalhes'
                      : primaryRollMode === 'attack'
                        ? 'Ataque / detalhes'
                        : primaryRollMode === 'damage'
                          ? 'Dano / detalhes'
                          : damageEstimate === '—' && usesSave
                            ? 'Teste / detalhes'
                            : 'Dano / detalhes'

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
                  if (!hideAutoNumericBadges) {
                    meta.numericMods.forEach((m) => combatBadgeNodes.push(badge(m, { kind: 'grid', title: m })))
                  }

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
                              const materialText =
                                (entry.materialOverride?.trim() ||
                                  spellTranslations[entry.spellIndex]?.materialPt?.trim() ||
                                  (typeof detail.material === 'string' ? detail.material.trim() : ''))
                              return (
                                <div className="relative inline-block">
                                  {hasMaterial ? (
                                    <button
                                      type="button"
                                      className="inline-flex items-center rounded-md border border-accentBorder bg-accentBg px-1.5 py-0.5 text-[11px] leading-4 text-textH whitespace-nowrap hover:opacity-90"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditMaterialSpellIndex(null)
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
                                      className="absolute left-0 top-full z-20 mt-1 w-[min(520px,90vw)] overflow-hidden rounded-md border border-border bg-bg bg-[color:color-mix(in_srgb,var(--bg)_85%,transparent)] text-xs text-text shadow-theme backdrop-blur-md"
                                    >
                                      <div className="max-h-[240px] overflow-auto p-2 whitespace-normal break-words">
                                        {materialText}
                                      </div>

                                      <div className="border-t border-border bg-bg bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] p-2">
                                        {editMaterialSpellIndex === entry.spellIndex ? (
                                          <div className="space-y-2">
                                            <Textarea
                                              value={editMaterialValue}
                                              onChange={(e) => setEditMaterialValue(e.target.value)}
                                              placeholder="Edite o texto do componente material…"
                                            />
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => {
                                                  setEditMaterialSpellIndex(null)
                                                  setEditMaterialValue('')
                                                }}
                                              >
                                                Cancelar
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => {
                                                  updateCharacter(activeCharacter.id, (c) => ({
                                                    ...c,
                                                    spells: c.spells.map((s) =>
                                                      s.spellIndex === entry.spellIndex
                                                        ? { ...s, materialOverride: undefined }
                                                        : s,
                                                    ),
                                                  }))
                                                  setEditMaterialSpellIndex(null)
                                                  setEditMaterialValue('')
                                                }}
                                                title="Voltar ao texto padrão (tradução/API)"
                                              >
                                                Usar padrão
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="primary"
                                                onClick={() => {
                                                  const next = editMaterialValue.trim()
                                                  updateCharacter(activeCharacter.id, (c) => ({
                                                    ...c,
                                                    spells: c.spells.map((s) =>
                                                      s.spellIndex === entry.spellIndex
                                                        ? { ...s, materialOverride: next ? next : undefined }
                                                        : s,
                                                    ),
                                                  }))
                                                  setEditMaterialSpellIndex(null)
                                                  setEditMaterialValue('')
                                                }}
                                              >
                                                Salvar
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-end">
                                            <Button
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => {
                                                setEditMaterialSpellIndex(entry.spellIndex)
                                                setEditMaterialValue(materialText)
                                              }}
                                              title="Editar este texto neste personagem"
                                            >
                                              Editar
                                            </Button>
                                          </div>
                                        )}
                                      </div>
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

                      <SpellQuickDetailsModalRow
                        isOpen={openDetailsSpellIndex === entry.spellIndex}
                        entry={entry}
                        displayName={displayName}
                        detailsSubtitle={detailsSubtitle}
                        primaryRollLabel={primaryRollLabel}
                        primaryRollMode={primaryRollMode}
                        spellBaseLevel={spellBaseLevel}
                        effectiveSlot={effectiveSlot}
                        slotOptions={slotOptions}
                        combatBadgeNodes={combatBadgeNodes}
                        infoBadgeNodes={infoBadgeNodes}
                        upcastLabel={upcastLabel}
                        hideAutoSaveBadges={hideAutoSaveBadges}
                        hideAutoAttackBadges={hideAutoAttackBadges}
                        hideAutoNumericBadges={hideAutoNumericBadges}
                        activeCharacter={activeCharacter}
                        updateCharacter={updateCharacter}
                        setOpenDetailsSpellIndex={setOpenDetailsSpellIndex}
                      />

                      <SpellEditorModal
                        isOpen={isOpen}
                        entry={entry}
                        detail={detail}
                        displayName={displayName}
                        activeCharacter={activeCharacter}
                        openSpellTab={openSpellTab}
                        setOpenSpellTab={setOpenSpellTab}
                        openHomebrewEditSpellIndex={openHomebrewEditSpellIndex}
                        setOpenHomebrewEditSpellIndex={setOpenHomebrewEditSpellIndex}
                        translateStatus={translateStatus}
                        translateOfficialToPt={translateOfficialToPt}
                        spellTranslations={spellTranslations}
                        setOpenSpellIndex={setOpenSpellIndex}
                        updateCharacter={updateCharacter}
                      />
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
