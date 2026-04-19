import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Ability,
  AddedSpell,
  Character,
  CharacterClass,
  DndApiRef,
  DndSpell,
  MagicCircleLevel,
  HomebrewSpell,
  HomebrewSpellMechanic,
  SpellEffect,
  SpellCastTimeKind,
  SpellTranslation,
} from './types'
import { getSpell, listSpells } from './lib/dnd5eApi'
import {
  ABILITIES,
  abilityModifier,
  cantripDiceMultiplier,
  formatSigned,
  magicCircleOptions,
  spellAttackBonus,
  spellSaveDc,
  totalLevel,
} from './lib/rules'
import { newCharacter } from './lib/character'
import { preparedLimitForClass } from './lib/prepared'
import { spellListClassIndex } from './lib/spellAccess'
import { homebrewToDndSpell, isHomebrewIndex } from './lib/homebrew'
import { castTimeKindFromText } from './lib/castTime'
import {
  CLASS_OPTIONS,
  SCHOOL_NAME_PT,
  classDisplayName,
  classLabel,
  apiClassLabel,
  schoolLabel,
} from './lib/spellLabels'
import { useRemoteAppState } from './lib/remoteState'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Select } from './components/ui/Select'
import { Card, CardContent, CardHeader } from './components/ui/Card'
import { Textarea } from './components/ui/Textarea'
import { AddedSpellsCard } from './components/AddedSpellsCard'
import { AddSpellsCard } from './components/AddSpellsCard'
import { useI18n } from './i18n/I18nContext'

function badge(text: string) {
  return (
    <span className="inline-flex items-center rounded-md border border-accentBorder bg-accentBg px-2 py-0.5 text-xs text-textH">
      {text}
    </span>
  )
}
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function clampStep(value: number, min: number, max: number, step: number): number {
  const v = Number.isFinite(value) ? value : min
  const clamped = Math.max(min, Math.min(max, v))
  const snapped = Math.round(clamped / step) * step
  // Keep one decimal for 1.5m increments (e.g. 4.5), avoid float artifacts.
  return Math.round(snapped * 10) / 10
}

function formatPtNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9
  const s = isInt ? String(Math.round(rounded)) : String(rounded)
  return s.replace('.', ',')
}

function App() {
  const { abilityShort } = useI18n()

  const {
    syncKey,
    setSyncKey,
    canSync,
    state: appState,
    setState: setAppState,
    status: syncStatus,
    pullFromServer,
  } = useRemoteAppState()

  const characters = appState.characters
  const activeCharacterId = appState.activeCharacterId
  const spellCache = appState.spellCache ?? {}
  const effectPresets = appState.effectPresets ?? {}
  const homebrewLibrary = appState.homebrewLibrary ?? {}
  const spellTranslations = appState.spellTranslations ?? {}

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === activeCharacterId) ?? characters[0],
    [activeCharacterId, characters],
  )

  useEffect(() => {
    if (characters.length === 0) {
      const c = newCharacter('Meu personagem')
      setAppState({
        version: 1,
        characters: [c],
        activeCharacterId: c.id,
        spellCache: {},
        effectPresets: {},
        homebrewLibrary: {},
        spellTranslations: {},
      })
      return
    }
    if (!activeCharacter && characters[0]) {
      setAppState((s) => ({ ...s, activeCharacterId: characters[0].id }))
    }
  }, [activeCharacter, characters, setAppState])

  function effectsEqual(a: SpellEffect[] | undefined, b: SpellEffect[] | undefined): boolean {
    const aa = a ?? []
    const bb = b ?? []
    if (aa.length !== bb.length) return false
    for (let i = 0; i < aa.length; i++) {
      if (JSON.stringify(aa[i]) !== JSON.stringify(bb[i])) return false
    }
    return true
  }

  const writeSpellToBaseCache = useCallback(
    (spell: DndSpell) => {
      setAppState((prev) => {
        const prevCache = prev.spellCache ?? {}
        if (prevCache[spell.index]) return prev
        return { ...prev, spellCache: { ...prevCache, [spell.index]: spell } }
      })
    },
    [setAppState],
  )

  const getSpellFromBaseOrApi = useCallback(
    async (index: string, signal?: AbortSignal): Promise<DndSpell> => {
      const cached = spellCache[index]
      if (cached) return cached
      const spell = await getSpell(index, signal)
      writeSpellToBaseCache(spell)
      return spell
    },
    [spellCache, writeSpellToBaseCache],
  )

  const [spellList, setSpellList] = useState<DndApiRef[] | null>(null)
  const [spellListError, setSpellListError] = useState<string | null>(null)
  const [spellDetails, setSpellDetails] = useState<Record<string, DndSpell | undefined>>({})
  const [spellDetailsError, setSpellDetailsError] = useState<Record<string, string | undefined>>({})

  useEffect(() => {
    // Bootstrap: if characters already contain homebrew spells, ensure they are also
    // present in the shared homebrew library for reuse across characters/devices.
    // Also backfill effect presets from existing character spells.
    setAppState((prev) => {
      const prevLib = prev.homebrewLibrary ?? {}
      let nextLib = prevLib
      let changedLib = false

      const prevPresets = prev.effectPresets ?? {}
      let nextPresets = prevPresets
      let changedPresets = false

      const prevTranslations = prev.spellTranslations ?? {}
      let nextTranslations = prevTranslations
      let changedTranslations = false

      for (const c of prev.characters) {
        for (const s of c.spells) {
          if (!s.homebrew) continue
          const idx = s.spellIndex
          const hb = s.homebrew
          const hbFinal = {
            ...hb,
            castingTimeKind: hb.castingTimeKind ?? s.castTimeKind,
            reactionWhen: (hb.reactionWhen ?? s.reactionWhen)?.trim() || undefined,
          }
          if (!prevLib[idx]) {
            if (nextLib === prevLib) nextLib = { ...prevLib }
            nextLib[idx] = hbFinal
            changedLib = true
          }
        }
      }

      for (const c of prev.characters) {
        for (const s of c.spells) {
          const eff = s.effects
          if (!eff || eff.length === 0) continue
          if (prevPresets[s.spellIndex]) continue
          if (nextPresets === prevPresets) nextPresets = { ...prevPresets }
          nextPresets[s.spellIndex] = eff
          changedPresets = true
        }
      }

      for (const c of prev.characters) {
        for (const s of c.spells) {
          if (s.homebrew || isHomebrewIndex(s.spellIndex)) continue
          const namePt = s.displayNamePt?.trim()
          const descPt = s.officialDescPt
          const higherPt = s.officialHigherLevelPt
          if (!namePt && !descPt?.length && !higherPt?.length) continue

          const prevT = prevTranslations[s.spellIndex]
          const merged: SpellTranslation = {
            namePt: namePt || prevT?.namePt,
            descPt: (descPt?.length ? descPt : prevT?.descPt) ?? undefined,
            higherPt: (higherPt?.length ? higherPt : prevT?.higherPt) ?? undefined,
          }
          if (JSON.stringify(prevT ?? {}) !== JSON.stringify(merged)) {
            if (nextTranslations === prevTranslations) nextTranslations = { ...prevTranslations }
            nextTranslations[s.spellIndex] = merged
            changedTranslations = true
          }
        }
      }

      if (!changedLib && !changedPresets && !changedTranslations) return prev
      return {
        ...prev,
        homebrewLibrary: changedLib ? nextLib : prev.homebrewLibrary,
        effectPresets: changedPresets ? nextPresets : prev.effectPresets,
        spellTranslations: changedTranslations ? nextTranslations : prev.spellTranslations,
      }
    })
  }, [setAppState])

  const [addedNameFilter, setAddedNameFilter] = useState('')
  const [addedLevelFilter, setAddedLevelFilter] = useState<MagicCircleLevel | 'any'>('any')
  const [addedSchoolFilter, setAddedSchoolFilter] = useState<string>('any')
  const [addedClassFilter, setAddedClassFilter] = useState<string>('any')
  const [addedPreparedFilter, setAddedPreparedFilter] = useState<'any' | 'prepared' | 'notPrepared'>('any')

  const [unaddedSearch, setUnaddedSearch] = useState('')

  const [unaddedLevelFilter, setUnaddedLevelFilter] = useState<MagicCircleLevel | 'any'>('any')
  const [unaddedSchoolFilter, setUnaddedSchoolFilter] = useState<string>('any')
  const [unaddedClassFilter, setUnaddedClassFilter] = useState<string>('any')

  const [calcClassId, setCalcClassId] = useState<string>('')

  const [hbName, setHbName] = useState('')
  const [hbLevel, setHbLevel] = useState<MagicCircleLevel>(1)
  const [hbSchool, setHbSchool] = useState<string>('Evocation')
  const [hbMechanic, setHbMechanic] = useState<HomebrewSpellMechanic>('none')
  const [hbSaveAbility, setHbSaveAbility] = useState<Ability>('dex')
  const [hbDesc, setHbDesc] = useState('')
  const [hbHigher, setHbHigher] = useState('')

  const [hbRangeKind, setHbRangeKind] = useState<'self' | 'touch' | 'meters' | 'feet' | 'sight' | 'special' | 'unlimited'>('meters')
  const [hbRangeValue, setHbRangeValue] = useState<number>(18)

  const [hbAreaShape, setHbAreaShape] = useState<'none' | 'cone' | 'sphere' | 'cylinder' | 'line' | 'cube'>('none')
  const [hbAreaSize, setHbAreaSize] = useState<number>(6)
  const [hbAreaUnit, setHbAreaUnit] = useState<'m' | 'ft'>('m')

  const [hbDurationKind, setHbDurationKind] = useState<'instant' | 'rounds' | 'minutes' | 'hours' | 'special'>('instant')
  const [hbDurationValue, setHbDurationValue] = useState<number>(1)

  const [hbDamageKind, setHbDamageKind] = useState<'none' | 'dice'>('none')
  const [hbDamageCount, setHbDamageCount] = useState<number>(2)
  const [hbDamageDie, setHbDamageDie] = useState<4 | 6 | 8 | 10 | 12>(6)
  const [hbDamageBonus, setHbDamageBonus] = useState<number>(0)

  const [hbCastTimeKind, setHbCastTimeKind] = useState<SpellCastTimeKind>('action')
  const [hbReactionWhen, setHbReactionWhen] = useState('')
  const [hbConcentration, setHbConcentration] = useState(false)
  const [hbRitual, setHbRitual] = useState(false)

  const [hbComponents, setHbComponents] = useState<Array<'V' | 'S' | 'M'>>([])
  const [hbMaterial, setHbMaterial] = useState('')

  const [hbSourceType, setHbSourceType] = useState<'class' | 'feat'>('class')
  const [hbSourceClassId, setHbSourceClassId] = useState<string>('')
  const [hbFeatName, setHbFeatName] = useState('')
  const [hbFeatAbility, setHbFeatAbility] = useState<Ability>('cha')

  const [hbBaseClasses, setHbBaseClasses] = useState<string[]>([])

  const [openSpellIndex, setOpenSpellIndex] = useState<string | null>(null)
  const [openSpellTab, setOpenSpellTab] = useState<'official' | 'modifiers' | 'headcanon'>('official')

  type TranslateStatus =
    { kind: 'idle' }
    | { kind: 'loading'; spellIndex: string }
    | { kind: 'error'; spellIndex: string; message: string }

  const [translateStatus, setTranslateStatus] = useState((): TranslateStatus => ({ kind: 'idle' }))

  async function translateTexts(args: {
    texts: string[]
    source?: string
    target?: string
  }): Promise<string[]> {
    const payload = {
      texts: args.texts,
      source: args.source ?? 'en',
      target: args.target ?? 'pt',
    }

    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(
          'API /api/translate não encontrada (HTTP 404). Em desenvolvimento local, rode com "vercel dev" (Vite não executa a pasta /api). Em produção, confirme que a função /api/translate foi deployada na Vercel.',
        )
      }
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }

    const data = (await res.json()) as { translations?: unknown; error?: unknown }
    if (!Array.isArray(data.translations) || data.translations.some((t) => typeof t !== 'string')) {
      throw new Error('Resposta inválida da API de tradução.')
    }
    return data.translations as string[]
  }

  async function translateOfficialToPt(args: {
    spellIndex: string
    desc: string[]
    higher: string[]
  }): Promise<void> {
    if (!activeCharacter) return
    setTranslateStatus({ kind: 'loading', spellIndex: args.spellIndex })
    try {
      const translated = await translateTexts({ texts: [...args.desc, ...args.higher] })
      const descCount = args.desc.length
      const officialDescPt = translated.slice(0, descCount)
      const officialHigherLevelPt = translated.slice(descCount)

      setAppState((prev) => {
        const activeId = prev.activeCharacterId
        const prevTranslations = prev.spellTranslations ?? {}
        const prevT = prevTranslations[args.spellIndex]
        const merged: SpellTranslation = {
          namePt: prevT?.namePt,
          descPt: officialDescPt.length ? officialDescPt : undefined,
          higherPt: officialHigherLevelPt.length ? officialHigherLevelPt : undefined,
        }
        const translationsChanged = JSON.stringify(prevT ?? {}) !== JSON.stringify(merged)
        const nextTranslations = translationsChanged
          ? { ...prevTranslations, [args.spellIndex]: merged }
          : prevTranslations

        const nextCharacters = prev.characters.map((c) => {
          if (c.id !== activeId) return c
          return {
            ...c,
            spells: c.spells.map((s) =>
              s.spellIndex === args.spellIndex
                ? {
                    ...s,
                    officialDescPt,
                    officialHigherLevelPt: officialHigherLevelPt.length ? officialHigherLevelPt : undefined,
                  }
                : s,
            ),
          }
        })

        return {
          ...prev,
          characters: nextCharacters,
          spellTranslations: translationsChanged ? nextTranslations : prev.spellTranslations,
        }
      })

      setTranslateStatus({ kind: 'idle' })
    } catch (err: unknown) {
      setTranslateStatus({
        kind: 'error',
        spellIndex: args.spellIndex,
        message: err instanceof Error ? err.message : 'Falha ao traduzir.',
      })
    }
  }

  async function addSpellToActiveTranslated(spellRef: DndApiRef) {
    if (!activeCharacter) return
    if (activeCharacterSpellsSet.has(spellRef.index)) return

    if (isHomebrewIndex(spellRef.index)) {
      await addSpellToActive(spellRef)
      return
    }

    const cachedT = spellTranslations[spellRef.index]
    if (cachedT?.descPt?.length || cachedT?.higherPt?.length || cachedT?.namePt?.trim()) {
      await addSpellToActive(spellRef)
      return
    }

    setTranslateStatus({ kind: 'loading', spellIndex: spellRef.index })
    try {
      const detail = await getSpellFromBaseOrApi(spellRef.index)
      setSpellDetails((prev) => ({ ...prev, [detail.index]: detail }))

      const characterClasses = activeCharacter.classes
      const eligible = characterClasses.length
        ? characterClasses.filter((c) =>
            detail.classes.some((x) => x.index === spellListClassIndex(c.classIndex)),
          )
        : []
      const sourceClassId = eligible[0]?.id ?? characterClasses[0]?.id

      const desc = detail.desc ?? []
      const higher = detail.higher_level ?? []
      const translated = await translateTexts({ texts: [...desc, ...higher] })
      const descCount = desc.length
      const officialDescPt = translated.slice(0, descCount)
      const officialHigherLevelPt = translated.slice(descCount)

      const newSpell: AddedSpell = {
        spellIndex: detail.index,
        spellName: detail.name,
        sourceType: 'class',
        sourceClassId,
        addedAt: Date.now(),
        castSlotLevel: (detail.level as MagicCircleLevel) ?? 1,
        castTimeKind: castTimeKindFromText(detail.casting_time),
        effects: undefined,
        officialDescPt,
        officialHigherLevelPt: officialHigherLevelPt.length ? officialHigherLevelPt : undefined,
      }

      setAppState((prev) => {
        const activeId = prev.activeCharacterId
        const active = prev.characters.find((c) => c.id === activeId)
        if (!active) return prev
        if (active.spells.some((s) => s.spellIndex === detail.index)) return prev

        const preset = (prev.effectPresets ?? {})[detail.index]
        const newSpellWithPreset: AddedSpell = { ...newSpell, effects: cloneEffects(preset) }

        const prevTranslations = prev.spellTranslations ?? {}
        const prevT = prevTranslations[detail.index]
        const merged: SpellTranslation = {
          namePt: prevT?.namePt,
          descPt: officialDescPt.length ? officialDescPt : undefined,
          higherPt: officialHigherLevelPt.length ? officialHigherLevelPt : undefined,
        }
        const translationsChanged = JSON.stringify(prevT ?? {}) !== JSON.stringify(merged)
        const nextTranslations = translationsChanged
          ? { ...prevTranslations, [detail.index]: merged }
          : prevTranslations

        const nextCharacters = prev.characters.map((c) => {
          if (c.id !== activeId) return c
          const nextSpells = [...c.spells, newSpellWithPreset].sort((a, b) => {
            const aLevel =
              a.spellIndex === detail.index
                ? detail.level
                : (a.homebrew ? a.homebrew.level : spellDetails[a.spellIndex]?.level)
            const bLevel =
              b.spellIndex === detail.index
                ? detail.level
                : (b.homebrew ? b.homebrew.level : spellDetails[b.spellIndex]?.level)
            const aL = aLevel ?? 99
            const bL = bLevel ?? 99
            if (aL !== bL) return aL - bL

            const aName = (a.displayNamePt?.trim() || a.spellName).toLocaleLowerCase('pt-BR')
            const bName = (b.displayNamePt?.trim() || b.spellName).toLocaleLowerCase('pt-BR')
            const byName = aName.localeCompare(bName, 'pt-BR')
            if (byName !== 0) return byName

            return a.spellIndex.localeCompare(b.spellIndex)
          })
          return { ...c, spells: nextSpells }
        })

        return {
          ...prev,
          characters: nextCharacters,
          spellTranslations: translationsChanged ? nextTranslations : prev.spellTranslations,
        }
      })

      setTranslateStatus({ kind: 'idle' })
    } catch (err: unknown) {
      setTranslateStatus({
        kind: 'error',
        spellIndex: spellRef.index,
        message: err instanceof Error ? err.message : 'Falha ao traduzir.',
      })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    listSpells(controller.signal)
      .then((results) => {
        setSpellList(results)
        setSpellListError(null)
      })
      .catch((err: unknown) => {
        setSpellListError(err instanceof Error ? err.message : 'Failed to load spell list')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activeCharacter) return
    const controller = new AbortController()
    const indices = activeCharacter.spells
      .filter((s) => !(s.homebrew || isHomebrewIndex(s.spellIndex)))
      .map((s) => s.spellIndex)
    for (const index of indices) {
      const fromBase = spellCache[index]
      if (fromBase && !spellDetails[index]) {
        setSpellDetails((prev) => ({ ...prev, [index]: fromBase }))
        setSpellDetailsError((prev) => ({ ...prev, [index]: undefined }))
        continue
      }
      if (spellDetails[index] || spellDetailsError[index]) continue
      getSpellFromBaseOrApi(index, controller.signal)
        .then((spell) => {
          setSpellDetails((prev) => ({ ...prev, [index]: spell }))
          setSpellDetailsError((prev) => ({ ...prev, [index]: undefined }))
        })
        .catch((err: unknown) => {
          setSpellDetailsError((prev) => ({
            ...prev,
            [index]: err instanceof Error ? err.message : 'Failed to load spell details',
          }))
        })
    }
    return () => controller.abort()
  }, [activeCharacter, getSpellFromBaseOrApi, spellCache, spellDetails, spellDetailsError])

  const activeCharacterTotalLevel = useMemo(() => {
    if (!activeCharacter) return 1
    const levels = activeCharacter.classes.map((c) => c.level)
    return Math.max(1, totalLevel(levels))
  }, [activeCharacter])

  const activeCharacterSpellsSet = useMemo(() => {
    const set = new Set<string>()
    if (!activeCharacter) return set
    for (const s of activeCharacter.spells) set.add(s.spellIndex)
    return set
  }, [activeCharacter])

  const activeCharacterSchools = useMemo(() => {
    if (!activeCharacter) return [] as string[]
    const values = activeCharacter.spells
      .map((s) =>
        s.homebrew
          ? s.homebrew.school
          : spellDetails[s.spellIndex]?.school?.name,
      )
      .filter((v): v is string => Boolean(v))
    return Array.from(new Set(values)).sort((a, b) =>
      schoolLabel(a).localeCompare(schoolLabel(b), 'pt-BR'),
    )
  }, [activeCharacter, spellDetails])

  const preparedMeta = useMemo(() => {
    if (!activeCharacter) {
      return {
        limitsByClassId: {} as Record<string, number>,
        preparedCountByClassId: {} as Record<string, number>,
      }
    }

    const limitsByClassId: Record<string, number> = {}
    for (const cls of activeCharacter.classes) {
      const abilityScore = activeCharacter.abilities[cls.castingAbility]
      const limit = preparedLimitForClass({
        classIndex: cls.classIndex,
        classLevel: cls.level,
        abilityScore,
      })
      if (limit !== null) limitsByClassId[cls.id] = limit
    }

    const preparedCountByClassId: Record<string, number> = {}
    for (const entry of activeCharacter.spells) {
      if (entry.sourceType === 'feat') continue
      const classId = entry.sourceClassId
      if (!classId) continue
      if (!(classId in limitsByClassId)) continue
      if (!entry.prepared) continue
      preparedCountByClassId[classId] = (preparedCountByClassId[classId] ?? 0) + 1
    }

    return { limitsByClassId, preparedCountByClassId }
  }, [activeCharacter])

  const filteredAddedSpells = useMemo(() => {
    if (!activeCharacter) return []
    const nameQ = addedNameFilter.trim().toLowerCase()
    const filtered = activeCharacter.spells.filter((entry) => {
      if (nameQ) {
        const hay = `${entry.displayNamePt?.trim() || ''} ${entry.spellName}`.toLowerCase()
        if (!hay.includes(nameQ)) return false
      }

      const detail = entry.homebrew
        ? homebrewToDndSpell({ entry, hb: entry.homebrew })
        : spellDetails[entry.spellIndex]
      if (addedLevelFilter !== 'any' && detail?.level !== undefined && detail.level !== addedLevelFilter)
        return false
      if (addedSchoolFilter !== 'any' && detail?.school?.name && detail.school.name !== addedSchoolFilter)
        return false
      if (addedClassFilter !== 'any') {
        if (addedClassFilter === 'feat') {
          if (entry.sourceType !== 'feat') return false
        } else {
          if (entry.sourceType === 'feat') return false
          const source = entry.sourceClassId
          if (source && source !== addedClassFilter) return false
          if (!source) return false
        }
      }

      const usesPreparedSystem = (() => {
        if (entry.sourceType === 'feat') return false
        const classId = entry.sourceClassId
        if (!classId) return false
        return classId in preparedMeta.limitsByClassId
      })()

      // Filtering semantics:
      // - "prepared": show both explicitly prepared spells AND spells that don't require preparation (always available)
      // - "notPrepared": show only spells that use the prepared system and are not marked prepared
      if (addedPreparedFilter === 'prepared') {
        if (usesPreparedSystem && !entry.prepared) return false
      }
      if (addedPreparedFilter === 'notPrepared') {
        if (!usesPreparedSystem) return false
        if (entry.prepared) return false
      }
      return true
    })
    return filtered.sort((a, b) => {
      const aLevel = (a.homebrew ? a.homebrew.level : spellDetails[a.spellIndex]?.level) ?? 99
      const bLevel = (b.homebrew ? b.homebrew.level : spellDetails[b.spellIndex]?.level) ?? 99
      if (aLevel !== bLevel) return aLevel - bLevel

      const aName = (a.displayNamePt?.trim() || a.spellName).toLocaleLowerCase('pt-BR')
      const bName = (b.displayNamePt?.trim() || b.spellName).toLocaleLowerCase('pt-BR')
      const byName = aName.localeCompare(bName, 'pt-BR')
      if (byName !== 0) return byName

      return a.spellIndex.localeCompare(b.spellIndex)
    })
  }, [activeCharacter, addedClassFilter, addedLevelFilter, addedNameFilter, addedPreparedFilter, addedSchoolFilter, spellDetails, preparedMeta])

  const availableSpellRefs = useMemo((): DndApiRef[] => {
    const homebrews: DndApiRef[] = Object.entries(homebrewLibrary).map(([index, hb]) => ({
      index,
      name: hb.name,
      url: `/homebrew/${encodeURIComponent(index)}`,
    }))
    return [...(spellList ?? []), ...homebrews]
  }, [homebrewLibrary, spellList])

  const spellNameAliases = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const s of availableSpellRefs) {
      map[s.index] = [s.name]
    }
    for (const [idx, t] of Object.entries(spellTranslations)) {
      if (!t) continue
      const arr = map[idx] ?? (map[idx] = [])
      if (t.namePt?.trim()) arr.push(t.namePt.trim())
    }
    for (const c of characters) {
      for (const s of c.spells) {
        const namePt = s.displayNamePt?.trim()
        if (!namePt) continue
        const arr = map[s.spellIndex] ?? (map[s.spellIndex] = [s.spellName])
        arr.push(namePt)
      }
    }
    return map
  }, [availableSpellRefs, characters, spellTranslations])

  const cloneEffects = useCallback((effects: SpellEffect[] | undefined): SpellEffect[] | undefined => {
    if (!effects) return undefined
    return effects.map((e) => ({
      ...e,
      rollAppliesTo: e.rollAppliesTo ? [...e.rollAppliesTo] : undefined,
    }))
  }, [])

  useEffect(() => {
    // Backfill: if a preset exists and a spell entry has never set effects,
    // apply the preset for reuse across characters.
    setAppState((prev) => {
      const presets = prev.effectPresets ?? {}
      const translations = prev.spellTranslations ?? {}
      const hasPresets = Object.keys(presets).length > 0
      const hasTranslations = Object.keys(translations).length > 0
      if (!hasPresets && !hasTranslations) return prev

      let changed = false
      const nextCharacters = prev.characters.map((c) => {
        let spellsChanged = false
        const nextSpells = c.spells.map((s) => {
          let next = s

          if (s.effects === undefined) {
            const preset = presets[s.spellIndex]
            if (preset && preset.length) {
              next = { ...next, effects: cloneEffects(preset) }
            }
          }

          if (!(s.homebrew || isHomebrewIndex(s.spellIndex))) {
            const t = translations[s.spellIndex]
            if (t) {
              const patch: Partial<AddedSpell> = {}
              if (!next.displayNamePt?.trim() && t.namePt?.trim()) patch.displayNamePt = t.namePt.trim()
              if (!next.officialDescPt?.length && t.descPt?.length) patch.officialDescPt = t.descPt
              if (!next.officialHigherLevelPt?.length && t.higherPt?.length) patch.officialHigherLevelPt = t.higherPt

              if (Object.keys(patch).length) {
                next = { ...next, ...patch }
              }
            }
          }

          if (next !== s) spellsChanged = true
          return next
        })
        if (!spellsChanged) return c
        changed = true
        return { ...c, spells: nextSpells }
      })

      return changed ? { ...prev, characters: nextCharacters } : prev
    })
  }, [cloneEffects, setAppState, effectPresets])

  const unaddedCandidates = useMemo(() => {
    if (!availableSpellRefs.length) return [] as DndApiRef[]
    const q = unaddedSearch.trim().toLowerCase()
    const hasFilters =
      unaddedLevelFilter !== 'any' || unaddedSchoolFilter !== 'any' || unaddedClassFilter !== 'any'
    if (!q && !hasFilters) return [] as DndApiRef[]

    const base = availableSpellRefs.filter((s) => !activeCharacterSpellsSet.has(s.index))
    if (!q) return base.slice(0, 200)

    const matches = (idx: string, nameFallback: string) => {
      const aliases = spellNameAliases[idx] ?? [nameFallback]
      return aliases.some((n) => n.toLowerCase().includes(q))
    }

    return base.filter((s) => matches(s.index, s.name)).slice(0, 200)
  }, [activeCharacterSpellsSet, availableSpellRefs, spellNameAliases, unaddedClassFilter, unaddedLevelFilter, unaddedSchoolFilter, unaddedSearch])

  const needsUnaddedDetails =
    unaddedLevelFilter !== 'any' || unaddedSchoolFilter !== 'any' || unaddedClassFilter !== 'any'

  useEffect(() => {
    if (!needsUnaddedDetails) return

    const controller = new AbortController()
    const signal = controller.signal

    void (async () => {
      for (const s of unaddedCandidates.slice(0, 60)) {
        if (signal.aborted) return
        if (isHomebrewIndex(s.index)) continue
        if (spellCache[s.index]) continue
        try {
          await getSpellFromBaseOrApi(s.index, signal)
        } catch (e) {
          if (signal.aborted) return
          // Ignore transient fetch errors here; user can still add by name.
          console.warn('Failed to fetch spell details for filters', s.index, e)
        }
      }
    })()

    return () => controller.abort()
  }, [getSpellFromBaseOrApi, needsUnaddedDetails, spellCache, unaddedCandidates])

  const unaddedResults = useMemo(() => {
    if (!unaddedCandidates.length) return [] as DndApiRef[]

    const filtered = unaddedCandidates.filter((s) => {
      const isHb = isHomebrewIndex(s.index)
      const hb = isHb ? homebrewLibrary[s.index] : undefined
      const detail = !isHb ? spellCache[s.index] : undefined

      if (unaddedLevelFilter !== 'any') {
        const lvl = (hb?.level ?? detail?.level) as number | undefined
        if (typeof lvl !== 'number') return false
        if (lvl !== unaddedLevelFilter) return false
      }

      if (unaddedSchoolFilter !== 'any') {
        const school = hb?.school ?? detail?.school?.name
        if (!school) return false
        if (school !== unaddedSchoolFilter) return false
      }

      if (unaddedClassFilter !== 'any') {
        if (hb) {
          if (!hb.classes?.includes(unaddedClassFilter)) return false
        } else {
          const classes = detail?.classes
          if (!classes || !classes.some((c) => c.index === unaddedClassFilter)) return false
        }
      }

      return true
    })

    return filtered.slice(0, 30)
  }, [homebrewLibrary, spellCache, unaddedCandidates, unaddedClassFilter, unaddedLevelFilter, unaddedSchoolFilter])

  function updateCharacter(characterId: string, updater: (c: Character) => Character) {
    setAppState((prev) => {
      const prevPresets = prev.effectPresets ?? {}
      let nextPresets = prevPresets
      let changedPresets = false

      const prevHomebrew = prev.homebrewLibrary ?? {}
      let nextHomebrew = prevHomebrew
      let changedHomebrew = false

      const prevTranslations = prev.spellTranslations ?? {}
      let nextTranslations = prevTranslations
      let changedTranslations = false

      const nextCharacters = prev.characters.map((c) => {
        if (c.id !== characterId) return c
        const nextC = updater(c)

        const prevByIndex = new Map(c.spells.map((s) => [s.spellIndex, s]))
        for (const nextSpell of nextC.spells) {
          const prevSpell = prevByIndex.get(nextSpell.spellIndex)
          const prevEffects = prevSpell?.effects
          const nextEffects = nextSpell.effects
          if (!effectsEqual(prevEffects, nextEffects)) {
            if (nextPresets === prevPresets) nextPresets = { ...prevPresets }
            nextPresets[nextSpell.spellIndex] = nextEffects ?? []
            changedPresets = true
          }

          if (!(nextSpell.homebrew || isHomebrewIndex(nextSpell.spellIndex))) {
            const prevNamePt = prevSpell?.displayNamePt?.trim() || ''
            const nextNamePt = nextSpell.displayNamePt?.trim() || ''
            const prevDescPt = prevSpell?.officialDescPt
            const nextDescPt = nextSpell.officialDescPt
            const prevHigherPt = prevSpell?.officialHigherLevelPt
            const nextHigherPt = nextSpell.officialHigherLevelPt

            const nameChanged = prevNamePt !== nextNamePt
            const descChanged = JSON.stringify(prevDescPt ?? []) !== JSON.stringify(nextDescPt ?? [])
            const higherChanged = JSON.stringify(prevHigherPt ?? []) !== JSON.stringify(nextHigherPt ?? [])

            if (nameChanged || descChanged || higherChanged) {
              const idx = nextSpell.spellIndex
              const prevT = prevTranslations[idx]
              const merged: SpellTranslation = {
                namePt: nextNamePt || prevT?.namePt,
                descPt: (nextDescPt?.length ? nextDescPt : prevT?.descPt) ?? undefined,
                higherPt: (nextHigherPt?.length ? nextHigherPt : prevT?.higherPt) ?? undefined,
              }
              if (JSON.stringify(prevT ?? {}) !== JSON.stringify(merged)) {
                if (nextTranslations === prevTranslations) nextTranslations = { ...prevTranslations }
                nextTranslations[idx] = merged
                changedTranslations = true
              }
            }
          }

          if (nextSpell.homebrew) {
            const idx = nextSpell.spellIndex
            const hb = nextSpell.homebrew
            const hbFinal = {
              ...hb,
              castingTimeKind: hb.castingTimeKind ?? nextSpell.castTimeKind,
              reactionWhen: (hb.reactionWhen ?? nextSpell.reactionWhen)?.trim() || undefined,
            }
            const prevHb = prevHomebrew[idx]
            if (!prevHb || JSON.stringify(prevHb) !== JSON.stringify(hbFinal)) {
              if (nextHomebrew === prevHomebrew) nextHomebrew = { ...prevHomebrew }
              nextHomebrew[idx] = hbFinal
              changedHomebrew = true
            }
          }
        }

        return nextC
      })

      return {
        ...prev,
        characters: nextCharacters,
        effectPresets: changedPresets ? nextPresets : prev.effectPresets,
        homebrewLibrary: changedHomebrew ? nextHomebrew : prev.homebrewLibrary,
        spellTranslations: changedTranslations ? nextTranslations : prev.spellTranslations,
      }
    })
  }

  function addCharacter() {
    const c = newCharacter(`Personagem ${characters.length + 1}`)
    setAppState((prev) => ({
      ...prev,
      characters: [...prev.characters, c],
      activeCharacterId: c.id,
    }))
  }

  function deleteCharacter(characterId: string) {
    setAppState((prev) => {
      const nextCharacters = prev.characters.filter((c) => c.id !== characterId)
      const nextActiveId =
        prev.activeCharacterId === characterId
          ? (nextCharacters[0]?.id ?? '')
          : prev.activeCharacterId
      return { ...prev, characters: nextCharacters, activeCharacterId: nextActiveId }
    })
  }

  function addClassToActive(classIndex: string) {
    if (!activeCharacter) return
    const opt = CLASS_OPTIONS.find((c) => c.index === classIndex)
    const cls: CharacterClass = {
      id: crypto.randomUUID(),
      classIndex,
      className: opt?.name ?? classIndex,
      level: 1,
      castingAbility: opt?.defaultAbility ?? 'int',
    }
    updateCharacter(activeCharacter.id, (c) => ({ ...c, classes: [...c.classes, cls] }))
  }

  async function addSpellToActive(spellRef: DndApiRef) {
    if (!activeCharacter) return
    if (activeCharacterSpellsSet.has(spellRef.index)) return

    if (isHomebrewIndex(spellRef.index)) {
      const hb = homebrewLibrary[spellRef.index]
      if (!hb) return

      setAppState((prev) => {
        const activeId = prev.activeCharacterId
        const active = prev.characters.find((c) => c.id === activeId)
        if (!active) return prev
        if (active.spells.some((s) => s.spellIndex === spellRef.index)) return prev

        const characterClasses = active.classes
        const eligible = characterClasses.length
          ? characterClasses.filter((c) => (hb.classes ?? []).includes(spellListClassIndex(c.classIndex)))
          : []
        const sourceClassId = eligible[0]?.id ?? characterClasses[0]?.id

        const preset = (prev.effectPresets ?? {})[spellRef.index]

        const newSpell: AddedSpell = {
          spellIndex: spellRef.index,
          spellName: hb.name,
          homebrew: hb,
          sourceType: 'class',
          sourceClassId,
          addedAt: Date.now(),
          castSlotLevel: hb.level,
          castTimeKind: hb.castingTimeKind ?? 'action',
          reactionWhen:
            (hb.castingTimeKind ?? 'action') === 'reaction'
              ? (hb.reactionWhen?.trim() || undefined)
              : undefined,
          effects: cloneEffects(preset),
        }

        const nextCharacters = prev.characters.map((c) => {
          if (c.id !== activeId) return c
          const nextSpells = [...c.spells, newSpell].sort((a, b) => {
            const aLevel = (a.homebrew ? a.homebrew.level : spellDetails[a.spellIndex]?.level) ?? 99
            const bLevel = (b.homebrew ? b.homebrew.level : spellDetails[b.spellIndex]?.level) ?? 99
            if (aLevel !== bLevel) return aLevel - bLevel

            const aName = (a.displayNamePt?.trim() || a.spellName).toLocaleLowerCase('pt-BR')
            const bName = (b.displayNamePt?.trim() || b.spellName).toLocaleLowerCase('pt-BR')
            const byName = aName.localeCompare(bName, 'pt-BR')
            if (byName !== 0) return byName

            return a.spellIndex.localeCompare(b.spellIndex)
          })
          return { ...c, spells: nextSpells }
        })

        return { ...prev, characters: nextCharacters }
      })
      return
    }

    const detail = await getSpellFromBaseOrApi(spellRef.index)
    setSpellDetails((prev) => ({ ...prev, [detail.index]: detail }))

    const characterClasses = activeCharacter.classes
    const eligible = characterClasses.length
      ? characterClasses.filter((c) =>
          detail.classes.some((x) => x.index === spellListClassIndex(c.classIndex)),
        )
      : []
    const sourceClassId = eligible[0]?.id ?? characterClasses[0]?.id

    const newSpell: AddedSpell = {
      spellIndex: detail.index,
      spellName: detail.name,
      sourceType: 'class',
      sourceClassId,
      addedAt: Date.now(),
      castSlotLevel: (detail.level as MagicCircleLevel) ?? 1,
      castTimeKind: castTimeKindFromText(detail.casting_time),
      effects: undefined,
    }

    setAppState((prev) => {
      const activeId = prev.activeCharacterId
      const active = prev.characters.find((c) => c.id === activeId)
      if (!active) return prev
      if (active.spells.some((s) => s.spellIndex === detail.index)) return prev

      const preset = (prev.effectPresets ?? {})[detail.index]
      const t = (prev.spellTranslations ?? {})[detail.index]
      const newSpellWithPreset: AddedSpell = {
        ...newSpell,
        effects: cloneEffects(preset),
        displayNamePt: t?.namePt?.trim() || undefined,
        officialDescPt: t?.descPt?.length ? t.descPt : undefined,
        officialHigherLevelPt: t?.higherPt?.length ? t.higherPt : undefined,
      }

      const nextCharacters = prev.characters.map((c) => {
        if (c.id !== activeId) return c
        const nextSpells = [...c.spells, newSpellWithPreset].sort((a, b) => {
          const aLevel =
            a.spellIndex === detail.index
              ? detail.level
              : (a.homebrew ? a.homebrew.level : spellDetails[a.spellIndex]?.level)
          const bLevel =
            b.spellIndex === detail.index
              ? detail.level
              : (b.homebrew ? b.homebrew.level : spellDetails[b.spellIndex]?.level)
          const aL = aLevel ?? 99
          const bL = bLevel ?? 99
          if (aL !== bL) return aL - bL

          const aName = (a.displayNamePt?.trim() || a.spellName).toLocaleLowerCase('pt-BR')
          const bName = (b.displayNamePt?.trim() || b.spellName).toLocaleLowerCase('pt-BR')
          const byName = aName.localeCompare(bName, 'pt-BR')
          if (byName !== 0) return byName

          return a.spellIndex.localeCompare(b.spellIndex)
        })
        return { ...c, spells: nextSpells }
      })

      return { ...prev, characters: nextCharacters }
    })
  }

  function addHomebrewToActive() {
    if (!activeCharacter) return
    const name = hbName.trim()
    if (!name) return

    const range = (() => {
      if (hbRangeKind === 'self') return 'Pessoal'
      if (hbRangeKind === 'touch') return 'Toque'
      if (hbRangeKind === 'special') return 'Especial'
      if (hbRangeKind === 'sight') return 'Visão'
      if (hbRangeKind === 'unlimited') return 'Ilimitado'
      if (hbRangeKind === 'feet') {
        const n = clampStep(hbRangeValue, 5, 9999, 5)
        return `${formatPtNumber(n)} ft`
      }
      const n = clampStep(hbRangeValue, 1.5, 9999, 1.5)
      return `${formatPtNumber(n)} m`
    })()

    const area = (() => {
      if (hbAreaShape === 'none') return undefined
      const unit = hbAreaUnit
      const n =
        unit === 'ft'
          ? clampStep(hbAreaSize, 5, 9999, 5)
          : clampStep(hbAreaSize, 1.5, 9999, 1.5)
      const shapePt: Record<Exclude<typeof hbAreaShape, 'none'>, string> = {
        cone: 'Cone',
        sphere: 'Esfera',
        cylinder: 'Cilindro',
        line: 'Linha',
        cube: 'Cubo',
      }
      return `${shapePt[hbAreaShape]} ${formatPtNumber(n)} ${unit}`
    })()

    const duration = (() => {
      if (hbDurationKind === 'instant') return 'Instantânea'
      if (hbDurationKind === 'special') return 'Especial'
      const n = clampInt(hbDurationValue, 1, 9999)
      if (hbDurationKind === 'rounds') return `${n} ${n === 1 ? 'rodada' : 'rodadas'}`
      if (hbDurationKind === 'minutes') return `${n} ${n === 1 ? 'minuto' : 'minutos'}`
      return `${n} ${n === 1 ? 'hora' : 'horas'}`
    })()

    const damageDice = (() => {
      if (hbDamageKind === 'none') return undefined
      const count = clampInt(hbDamageCount, 0, 99)
      const size = hbDamageDie
      const bonus = clampInt(hbDamageBonus, 0, 999)
      return `${count}d${size}${bonus ? `+${bonus}` : ''}`
    })()

    const componentsSet = new Set(hbComponents)
    const materialTrimmed = hbMaterial.trim()
    if (materialTrimmed) componentsSet.add('M')
    const components = Array.from(componentsSet) as Array<'V' | 'S' | 'M'>

    const hb: HomebrewSpell = {
      name,
      level: hbLevel,
      school: hbSchool,
      castingTimeKind: hbCastTimeKind,
      reactionWhen: hbCastTimeKind === 'reaction' ? (hbReactionWhen.trim() || undefined) : undefined,
      ritual: hbRitual || undefined,
      classes: hbBaseClasses.length ? hbBaseClasses : undefined,
      components: components.length ? components : undefined,
      material: components.includes('M') ? (materialTrimmed || undefined) : undefined,
      range: range.trim() || undefined,
      area: area?.trim() || undefined,
      duration: duration.trim() || undefined,
      concentration: hbConcentration || undefined,
      damageDice,
      mechanic: hbMechanic,
      saveAbility: hbMechanic === 'save' || hbMechanic === 'both' ? hbSaveAbility : undefined,
      desc: hbDesc.trim() || undefined,
      higherLevel: hbHigher.trim() || undefined,
    }

    const spellIndex = `hb:${crypto.randomUUID()}`

    const effectiveClassId = hbSourceClassId || effectiveCalcClassId || activeCharacter.classes[0]?.id
    const newSpell: AddedSpell = {
      spellIndex,
      spellName: name,
      homebrew: hb,
      sourceType: hbSourceType,
      sourceClassId: hbSourceType === 'class' ? (effectiveClassId || undefined) : undefined,
      featName: hbSourceType === 'feat' ? (hbFeatName.trim() || 'Feat') : undefined,
      featAbility: hbSourceType === 'feat' ? hbFeatAbility : undefined,
      addedAt: Date.now(),
      castSlotLevel: hbLevel,
      castTimeKind: hbCastTimeKind,
      reactionWhen:
        hbCastTimeKind === 'reaction' ? (hbReactionWhen.trim() || undefined) : undefined,
      effects: undefined,
    }

    updateCharacter(activeCharacter.id, (c) => ({
      ...c,
      spells: [...c.spells, newSpell].sort((a, b) => {
        const aLevel = (a.homebrew ? a.homebrew.level : spellDetails[a.spellIndex]?.level) ?? 99
        const bLevel = (b.homebrew ? b.homebrew.level : spellDetails[b.spellIndex]?.level) ?? 99
        if (aLevel !== bLevel) return aLevel - bLevel

        const aName = (a.displayNamePt?.trim() || a.spellName).toLocaleLowerCase('pt-BR')
        const bName = (b.displayNamePt?.trim() || b.spellName).toLocaleLowerCase('pt-BR')
        const byName = aName.localeCompare(bName, 'pt-BR')
        if (byName !== 0) return byName

        return a.spellIndex.localeCompare(b.spellIndex)
      }),
    }))

    setHbName('')
    setHbDesc('')
    setHbHigher('')
    setHbRangeKind('meters')
    setHbRangeValue(18)
    setHbAreaShape('none')
    setHbAreaSize(6)
    setHbAreaUnit('m')
    setHbDurationKind('instant')
    setHbDurationValue(1)
    setHbDamageKind('none')
    setHbDamageCount(2)
    setHbDamageDie(6)
    setHbDamageBonus(0)
    setHbCastTimeKind('action')
    setHbReactionWhen('')
    setHbConcentration(false)
    setHbRitual(false)

    setHbBaseClasses([])

    setHbComponents([])
    setHbMaterial('')
  }

  function removeSpellFromActive(spellIndex: string) {
    if (!activeCharacter) return
    updateCharacter(activeCharacter.id, (c) => ({
      ...c,
      spells: c.spells.filter((s) => s.spellIndex !== spellIndex),
    }))
  }

  if (!activeCharacter) {
    return (
      <div className="min-h-svh bg-bg text-text">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Card>
            <CardHeader>
              <div className="font-heading text-xl text-textH">Gerenciador de Magias (D&amp;D)</div>
              <div className="mt-1 text-sm text-text">Nenhum personagem ainda.</div>
            </CardHeader>
            <CardContent>
              <Button variant="primary" onClick={addCharacter}>
                Adicionar personagem
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const effectiveCalcClassId = calcClassId || activeCharacter.classes[0]?.id || ''
  const selectedCalcClass = activeCharacter.classes.find((c) => c.id === effectiveCalcClassId)
  const calcAbilityScore = selectedCalcClass
    ? activeCharacter.abilities[selectedCalcClass.castingAbility]
    : activeCharacter.abilities.int
  const calcClassLevel = selectedCalcClass?.level ?? activeCharacterTotalLevel
  const atk = spellAttackBonus({
    proficiencyMode: activeCharacter.proficiencyMode,
    totalCharacterLevel: activeCharacterTotalLevel,
    classLevel: calcClassLevel,
    abilityScore: calcAbilityScore,
  })
  const dc = spellSaveDc({
    proficiencyMode: activeCharacter.proficiencyMode,
    totalCharacterLevel: activeCharacterTotalLevel,
    classLevel: calcClassLevel,
    abilityScore: calcAbilityScore,
  })

  return (
    <div className="min-h-svh bg-[color:var(--social-bg)] text-text">
      <header className="border-b border-accentBorder bg-accentBg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-heading text-xl text-textH">Gerenciador de Magias (D&amp;D)</h1>
            <p className="text-xs text-text">Personagens • Magias adicionadas • Filtros • Cálculo</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              className="text-xs font-medium text-accent underline decoration-accentBorder underline-offset-2 opacity-90 hover:opacity-100"
              href="https://www.dnd5eapi.co/"
              target="_blank"
              rel="noreferrer"
            >
              DnD 5e API
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-textH">Sincronização (grupo)</div>
              <div className="mt-1 text-xs text-text">
                Use uma chave secreta compartilhada (mín. 12 caracteres).
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-xs"
                  value={syncKey}
                  onChange={(e) => setSyncKey(e.target.value)}
                  placeholder="ex: minha-chave-super-secreta"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void pullFromServer()}
                  disabled={!canSync}
                  title={!canSync ? 'A chave precisa ter pelo menos 12 caracteres' : 'Carregar do servidor'}
                >
                  Carregar
                </Button>
              </div>
              <div className="mt-2 text-xs text-text">
                Status:{' '}
                <span className="font-mono">
                  {syncStatus.kind === 'idle'
                    ? 'local'
                    : syncStatus.kind === 'loading'
                      ? 'carregando…'
                      : syncStatus.kind === 'saving'
                        ? 'salvando…'
                        : syncStatus.kind === 'synced'
                          ? 'sincronizado'
                          : `erro`}
                </span>
                {syncStatus.kind === 'error' ? (
                  <div className="mt-1 text-[11px] text-text">{syncStatus.message}</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-textH">Personagens</div>
                <Button size="sm" variant="primary" onClick={addCharacter}>
                  + Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    className={
                      c.id === activeCharacter.id
                        ? 'flex w-full items-center justify-between rounded-lg border border-accentBorder bg-accentBg px-3 py-2 text-left'
                        : 'flex w-full items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-left hover:bg-[color:var(--social-bg)]'
                    }
                    onClick={() => setAppState((s) => ({ ...s, activeCharacterId: c.id }))}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-textH">{c.name}</div>
                      <div className="text-xs text-text">
                        {c.spells.length} magias • {totalLevel(c.classes.map((x) => x.level)) || 0} nv
                      </div>
                    </div>
                    {c.id === activeCharacter.id ? badge('Ativo') : null}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => deleteCharacter(activeCharacter.id)}
                  disabled={characters.length <= 1}
                  title={
                    characters.length <= 1
                      ? 'Mantenha pelo menos 1 personagem'
                      : 'Excluir personagem'
                  }
                >
                  Excluir personagem ativo
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-textH">Ficha rápida</div>
              <div className="mt-1 text-xs text-text">Nome, atributos e regra de proficiência.</div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full">
                  <label className="text-xs text-text">Nome do personagem</label>
                  <Input
                    className="mt-1"
                    value={activeCharacter.name}
                    onChange={(e) =>
                      updateCharacter(activeCharacter.id, (c) => ({ ...c, name: e.target.value }))
                    }
                  />
                </div>
                <div className="w-full md:w-[320px]">
                  <label className="text-xs text-text">Cálculo de proficiência</label>
                  <Select
                    className="mt-1"
                    value={activeCharacter.proficiencyMode}
                    onChange={(e) =>
                      updateCharacter(activeCharacter.id, (c) => ({
                        ...c,
                        proficiencyMode:
                          e.target.value === 'classLevel' ? 'classLevel' : 'totalLevel',
                      }))
                    }
                  >
                    <option value="totalLevel">Nível total (padrão 5e)</option>
                    <option value="classLevel">Por classe (regra da casa)</option>
                  </Select>
                </div>
              </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
              {ABILITIES.map(({ key }) => (
                <div key={key}>
                  <label className="text-xs text-text">{abilityShort(key)}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type="number"
                      className="h-9 px-2"
                      value={activeCharacter.abilities[key]}
                      min={1}
                      max={30}
                      onChange={(e) => {
                        const score = clampInt(Number(e.target.value), 1, 30)
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          abilities: { ...c.abilities, [key]: score },
                        }))
                      }}
                    />
                    <div className="w-10 text-right text-xs text-text">
                      {formatSigned(abilityModifier(activeCharacter.abilities[key]))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-textH">Classes</div>
                <Select
                  className="h-9 w-auto px-2 text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    addClassToActive(v)
                    e.currentTarget.value = ''
                  }}
                >
                  <option value="">+ Adicionar classe…</option>
                  {CLASS_OPTIONS.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              {activeCharacter.classes.length === 0 ? (
                <p className="mt-2 text-xs text-text">
                  Adicione pelo menos uma classe para calcular bônus e auto-atribuir magias.
                </p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {activeCharacter.classes.map((cls) => (
                    <div
                      key={cls.id}
                      className="grid grid-cols-1 gap-2 rounded-md border border-border p-2 md:grid-cols-[1fr_100px_120px_44px]"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-text">Classe</div>
                        <div className="truncate text-sm text-textH">{classLabel(cls)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text">Nível</div>
                        <Input
                          type="number"
                          className="mt-1 h-9 px-2"
                          min={1}
                          max={20}
                          value={cls.level}
                          onChange={(e) => {
                            const level = clampInt(Number(e.target.value), 1, 20)
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              classes: c.classes.map((x) => (x.id === cls.id ? { ...x, level } : x)),
                            }))
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-text">Atributo (conjuração)</div>
                        <Select
                          className="mt-1 h-9 px-2 py-1"
                          value={cls.castingAbility}
                          onChange={(e) => {
                            const castingAbility = e.target.value as Ability
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              classes: c.classes.map((x) =>
                                x.id === cls.id ? { ...x, castingAbility } : x,
                              ),
                            }))
                          }}
                        >
                          {ABILITIES.map((a) => (
                            <option key={a.key} value={a.key}>
                              {abilityShort(a.key)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          className="w-full"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              classes: c.classes.filter((x) => x.id !== cls.id),
                              spells: c.spells.map((s) =>
                                s.sourceClassId === cls.id ? { ...s, sourceClassId: undefined } : s,
                              ),
                            }))
                          }
                          title="Remover classe"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-textH">Calculadora de conjuração</div>
                  <div className="mt-1 text-xs text-text">
                    Calcula bônus de ataque mágico e CD. Truques mostram a escala de dano.
                  </div>
                </div>
                <div className="text-xs text-text">Nível total: {activeCharacterTotalLevel}</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-text">Conjurar como</label>
                  <Select
                    className="mt-1"
                    value={effectiveCalcClassId}
                    onChange={(e) => setCalcClassId(e.target.value)}
                    disabled={activeCharacter.classes.length === 0}
                  >
                    {activeCharacter.classes.length === 0 ? (
                      <option value="">Adicione uma classe primeiro</option>
                    ) : (
                      activeCharacter.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {classDisplayName(c)}
                        </option>
                      ))
                    )}
                  </Select>
                </div>
                <div className="rounded-lg border border-border bg-[color:var(--social-bg)] p-3">
                  <div className="text-xs text-text">Resultados</div>
                  <div className="mt-1 text-sm text-textH">
                    Ataque Mágico: <span className="font-mono">{formatSigned(atk)}</span>
                  </div>
                  <div className="text-sm text-textH">
                    CD (Resistência): <span className="font-mono">{dc}</span>
                  </div>
                  <div className="mt-2 text-xs text-text">
                    {`Dado de dano do truque: x${cantripDiceMultiplier(activeCharacterTotalLevel)} (escala 5e). ATQ/CD não mudam com o círculo.`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-textH">Criar magia (Homebrew)</div>
              <div className="mt-1 text-xs text-text">
                Cria uma magia personalizada e adiciona ao personagem (sincroniza junto).
              </div>
            </CardHeader>
            <CardContent>
              <details className="group">
                <summary className="cursor-pointer list-none select-none rounded-md border border-accentBorder bg-[color:var(--social-bg)] px-3 py-2 text-sm text-textH hover:bg-accentBg">
                  Abrir criador
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div>
                    <label className="text-xs text-text">Nome</label>
                    <Input
                      className="mt-1"
                      value={hbName}
                      onChange={(e) => setHbName(e.target.value)}
                      placeholder="ex: Raio de Gelo Azul"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-text">Nível</label>
                      <Select
                        className="mt-1"
                        value={hbLevel}
                        onChange={(e) => setHbLevel(Number(e.target.value) as MagicCircleLevel)}
                      >
                        {magicCircleOptions().map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-text">Escola</label>
                      <Select
                        className="mt-1"
                        value={hbSchool}
                        onChange={(e) => setHbSchool(e.target.value)}
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
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-text">Alcance</label>
                      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px]">
                        <Select
                          value={hbRangeKind}
                          onChange={(e) => setHbRangeKind(e.target.value as typeof hbRangeKind)}
                        >
                          <option value="self">Pessoal</option>
                          <option value="touch">Toque</option>
                          <option value="meters">Distância (m)</option>
                          <option value="feet">Distância (ft)</option>
                          <option value="sight">Visão</option>
                          <option value="special">Especial</option>
                          <option value="unlimited">Ilimitado</option>
                        </Select>
                        <Input
                          type="number"
                          value={hbRangeKind === 'meters' || hbRangeKind === 'feet' ? hbRangeValue : ''}
                          disabled={!(hbRangeKind === 'meters' || hbRangeKind === 'feet')}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v)) setHbRangeValue(v)
                          }}
                          min={hbRangeKind === 'feet' ? 5 : 1.5}
                          max={9999}
                          step={hbRangeKind === 'feet' ? 5 : 1.5}
                          placeholder="ex: 18"
                          title="Valor do alcance (quando aplicável)"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text">Área</label>
                      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_84px]">
                        <Select
                          value={hbAreaShape}
                          onChange={(e) => setHbAreaShape(e.target.value as typeof hbAreaShape)}
                        >
                          <option value="none">(sem área)</option>
                          <option value="cone">Cone</option>
                          <option value="sphere">Esfera</option>
                          <option value="cylinder">Cilindro</option>
                          <option value="line">Linha</option>
                          <option value="cube">Cubo</option>
                        </Select>
                        <Input
                          type="number"
                          value={hbAreaShape === 'none' ? '' : hbAreaSize}
                          disabled={hbAreaShape === 'none'}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v)) setHbAreaSize(v)
                          }}
                          min={hbAreaUnit === 'ft' ? 5 : 1.5}
                          max={9999}
                          step={hbAreaUnit === 'ft' ? 5 : 1.5}
                          placeholder="ex: 6"
                          title="Tamanho da área (quando aplicável)"
                        />
                        <Select
                          value={hbAreaUnit}
                          onChange={(e) => setHbAreaUnit(e.target.value as typeof hbAreaUnit)}
                          disabled={hbAreaShape === 'none'}
                          title="Unidade"
                        >
                          <option value="m">m</option>
                          <option value="ft">ft</option>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-text">Duração</label>
                      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px]">
                        <Select
                          value={hbDurationKind}
                          onChange={(e) => setHbDurationKind(e.target.value as typeof hbDurationKind)}
                        >
                          <option value="instant">Instantânea</option>
                          <option value="rounds">Rodadas</option>
                          <option value="minutes">Minutos</option>
                          <option value="hours">Horas</option>
                          <option value="special">Especial</option>
                        </Select>
                        <Input
                          type="number"
                          value={hbDurationKind === 'rounds' || hbDurationKind === 'minutes' || hbDurationKind === 'hours' ? hbDurationValue : ''}
                          disabled={!(hbDurationKind === 'rounds' || hbDurationKind === 'minutes' || hbDurationKind === 'hours')}
                          onChange={(e) => setHbDurationValue(Number(e.target.value))}
                          min={1}
                          max={9999}
                          placeholder="ex: 1"
                          title="Valor da duração (quando aplicável)"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text">Conjuração</label>
                      <Select
                        className="mt-1"
                        value={hbCastTimeKind}
                        onChange={(e) => {
                          const next = e.target.value as SpellCastTimeKind
                          setHbCastTimeKind(next)
                          if (next !== 'reaction') setHbReactionWhen('')
                        }}
                      >
                        <option value="action">Ação</option>
                        <option value="bonus">Bônus</option>
                        <option value="reaction">Reação</option>
                      </Select>

                      {hbCastTimeKind === 'reaction' ? (
                        <div className="mt-2">
                          <div className="text-xs text-text">Quando (reação)</div>
                          <Input
                            className="mt-1"
                            value={hbReactionWhen}
                            onChange={(e) => setHbReactionWhen(e.target.value)}
                            placeholder="ex: quando você for atingido por um ataque…"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-xs text-text">Concentração</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hbConcentration}
                          onChange={(e) => setHbConcentration(e.target.checked)}
                        />
                        <span className="text-xs text-text">Exige concentração</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-text">Ritual</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hbRitual}
                          onChange={(e) => setHbRitual(e.target.checked)}
                        />
                        <span className="text-xs text-text">Pode ser conjurada como ritual</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-text">Componentes</label>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {(['V', 'S', 'M'] as const).map((comp) => {
                        const checked = hbComponents.includes(comp)
                        return (
                          <label key={comp} className="flex items-center gap-2 text-xs text-text">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked
                                const set = new Set(hbComponents)
                                if (nextChecked) set.add(comp)
                                else set.delete(comp)
                                const next = Array.from(set) as Array<'V' | 'S' | 'M'>
                                setHbComponents(next)
                                if (comp === 'M' && !nextChecked) setHbMaterial('')
                              }}
                            />
                            <span>{comp}</span>
                          </label>
                        )
                      })}
                    </div>

                    {hbComponents.includes('M') ? (
                      <div className="mt-2">
                        <Input
                          className="mt-1"
                          value={hbMaterial}
                          onChange={(e) => setHbMaterial(e.target.value)}
                          placeholder="Material (ex: um pedaço de fio de cobre…)"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-text">Dano (base)</label>
                      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-[1fr_88px_88px_88px]">
                        <Select
                          value={hbDamageKind}
                          onChange={(e) => setHbDamageKind(e.target.value as typeof hbDamageKind)}
                          title="Tipo de dano base"
                        >
                          <option value="none">(sem dano)</option>
                          <option value="dice">Dados</option>
                        </Select>
                        <Input
                          type="number"
                          value={hbDamageKind === 'dice' ? hbDamageCount : ''}
                          disabled={hbDamageKind !== 'dice'}
                          onChange={(e) => setHbDamageCount(Number(e.target.value))}
                          min={0}
                          max={99}
                          placeholder="Qtd"
                          title="Quantidade de dados"
                        />
                        <Select
                          value={String(hbDamageDie)}
                          disabled={hbDamageKind !== 'dice'}
                          onChange={(e) => setHbDamageDie(Number(e.target.value) as 4 | 6 | 8 | 10 | 12)}
                          title="Tamanho do dado"
                        >
                          <option value="4">d4</option>
                          <option value="6">d6</option>
                          <option value="8">d8</option>
                          <option value="10">d10</option>
                          <option value="12">d12</option>
                        </Select>
                        <Input
                          type="number"
                          value={hbDamageKind === 'dice' ? hbDamageBonus : ''}
                          disabled={hbDamageKind !== 'dice'}
                          onChange={(e) => setHbDamageBonus(Number(e.target.value))}
                          min={0}
                          max={999}
                          placeholder="+0"
                          title="Bônus fixo (opcional)"
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-text">
                        Usado só para estimativa de dano (ex.: 2d6+3). Pode ser 0 (ex.: 0d6) para cantrips que começam a dar dano no nível 5.
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text">Mecânica</label>
                      <Select
                        className="mt-1"
                        value={hbMechanic}
                        onChange={(e) => setHbMechanic(e.target.value as HomebrewSpellMechanic)}
                      >
                        <option value="none">Nenhuma</option>
                        <option value="attack">Ataque</option>
                        <option value="save">Teste de resistência</option>
                        <option value="both">Ataque + Teste</option>
                      </Select>
                    </div>
                  </div>

                  {hbMechanic === 'save' || hbMechanic === 'both' ? (
                    <div>
                      <label className="text-xs text-text">Resistência (atributo)</label>
                      <Select
                        className="mt-1"
                        value={hbSaveAbility}
                        onChange={(e) => setHbSaveAbility(e.target.value as Ability)}
                      >
                        {ABILITIES.map(({ key }) => (
                          <option key={key} value={key}>
                            {abilityShort(key)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}

                  <div>
                    <label className="text-xs text-text">Fonte</label>
                    <Select
                      className="mt-1"
                      value={hbSourceType}
                      onChange={(e) => setHbSourceType(e.target.value as 'class' | 'feat')}
                    >
                      <option value="class">Classe</option>
                      <option value="feat">Feat</option>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-text">Classes base</label>
                    <div className="mt-1 text-[11px] text-text">
                      Define quais classes têm essa magia na lista (coluna “Classes”).
                    </div>
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
                        const checked = hbBaseClasses.includes(idx)
                        const label = apiClassLabel({ index: idx, name: idx, url: '' })
                        return (
                          <label key={idx} className="flex items-center gap-2 text-xs text-text">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked
                                const set = new Set(hbBaseClasses)
                                if (nextChecked) set.add(idx)
                                else set.delete(idx)
                                setHbBaseClasses(Array.from(set).sort())
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {hbSourceType === 'class' ? (
                    <div>
                      <label className="text-xs text-text">Conjurar como (classe)</label>
                      <Select
                        className="mt-1"
                        value={hbSourceClassId || effectiveCalcClassId}
                        onChange={(e) => setHbSourceClassId(e.target.value)}
                        disabled={activeCharacter.classes.length === 0}
                      >
                        {activeCharacter.classes.length === 0 ? (
                          <option value="">Adicione uma classe primeiro</option>
                        ) : (
                          activeCharacter.classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {classDisplayName(c)}
                            </option>
                          ))
                        )}
                      </Select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-text">Nome do feat</label>
                        <Input
                          className="mt-1"
                          value={hbFeatName}
                          onChange={(e) => setHbFeatName(e.target.value)}
                          placeholder="ex: Fey Touched"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text">Atributo do feat</label>
                        <Select
                          className="mt-1"
                          value={hbFeatAbility}
                          onChange={(e) => setHbFeatAbility(e.target.value as Ability)}
                        >
                          {ABILITIES.map(({ key }) => (
                            <option key={key} value={key}>
                              {abilityShort(key)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-text">Descrição</label>
                    <Textarea
                      className="mt-1"
                      value={hbDesc}
                      onChange={(e) => setHbDesc(e.target.value)}
                      placeholder="Opcional. Texto livre."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-text">Em níveis superiores</label>
                    <Textarea
                      className="mt-1"
                      value={hbHigher}
                      onChange={(e) => setHbHigher(e.target.value)}
                      placeholder="Opcional. Se preencher, aparece badge de upcast."
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="primary"
                    onClick={addHomebrewToActive}
                    disabled={!hbName.trim()}
                    title={!hbName.trim() ? 'Preencha o nome' : 'Adicionar magia homebrew'}
                  >
                    Adicionar homebrew
                  </Button>
                </div>
              </details>
            </CardContent>
          </Card>

          <AddedSpellsCard
            activeCharacter={activeCharacter}
            activeCharacterSchools={activeCharacterSchools}
            activeCharacterTotalLevel={activeCharacterTotalLevel}
            filteredAddedSpells={filteredAddedSpells}
            spellDetails={spellDetails}
            spellDetailsError={spellDetailsError}
            preparedMeta={preparedMeta}
            addedNameFilter={addedNameFilter}
            setAddedNameFilter={setAddedNameFilter}
            addedLevelFilter={addedLevelFilter}
            setAddedLevelFilter={setAddedLevelFilter}
            addedSchoolFilter={addedSchoolFilter}
            setAddedSchoolFilter={setAddedSchoolFilter}
            addedPreparedFilter={addedPreparedFilter}
            setAddedPreparedFilter={setAddedPreparedFilter}
            addedClassFilter={addedClassFilter}
            setAddedClassFilter={setAddedClassFilter}
            openSpellIndex={openSpellIndex}
            setOpenSpellIndex={setOpenSpellIndex}
            openSpellTab={openSpellTab}
            setOpenSpellTab={setOpenSpellTab}
            translateStatus={translateStatus}
            translateOfficialToPt={translateOfficialToPt}
            updateCharacter={updateCharacter}
            removeSpellFromActive={removeSpellFromActive}
          />

          <AddSpellsCard
            spellList={availableSpellRefs.length ? availableSpellRefs : null}
            spellListError={spellListError}
            unaddedSearch={unaddedSearch}
            setUnaddedSearch={setUnaddedSearch}
            unaddedLevelFilter={unaddedLevelFilter}
            setUnaddedLevelFilter={setUnaddedLevelFilter}
            unaddedSchoolFilter={unaddedSchoolFilter}
            setUnaddedSchoolFilter={setUnaddedSchoolFilter}
            unaddedClassFilter={unaddedClassFilter}
            setUnaddedClassFilter={setUnaddedClassFilter}
            unaddedResults={unaddedResults}
            activeCharacter={activeCharacter}
            activeCharacterSpellsSet={activeCharacterSpellsSet}
            addSpellToActive={addSpellToActive}
            addSpellToActiveTranslated={addSpellToActiveTranslated}
            translateStatus={translateStatus}
            getSpellDetails={getSpellFromBaseOrApi}
            homebrewLibrary={homebrewLibrary}
            spellTranslations={spellTranslations}
          />
        </section>
      </main>
    </div>
  )
}

export default App
