import { useEffect, useMemo, useState } from 'react'
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
  SpellCastTimeKind,
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

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === activeCharacterId) ?? characters[0],
    [activeCharacterId, characters],
  )

  useEffect(() => {
    if (characters.length === 0) {
      const c = newCharacter('Meu personagem')
      setAppState({ version: 1, characters: [c], activeCharacterId: c.id })
      return
    }
    if (!activeCharacter && characters[0]) {
      setAppState((s) => ({ ...s, activeCharacterId: characters[0].id }))
    }
  }, [activeCharacter, characters, setAppState])

  const [spellList, setSpellList] = useState<DndApiRef[] | null>(null)
  const [spellListError, setSpellListError] = useState<string | null>(null)
  const [spellDetails, setSpellDetails] = useState<Record<string, DndSpell | undefined>>({})
  const [spellDetailsError, setSpellDetailsError] = useState<Record<string, string | undefined>>({})

  const [addedNameFilter, setAddedNameFilter] = useState('')
  const [addedLevelFilter, setAddedLevelFilter] = useState<MagicCircleLevel | 'any'>('any')
  const [addedSchoolFilter, setAddedSchoolFilter] = useState<string>('any')
  const [addedClassFilter, setAddedClassFilter] = useState<string>('any')
  const [addedPreparedFilter, setAddedPreparedFilter] = useState<'any' | 'prepared' | 'notPrepared'>('any')

  const [unaddedSearch, setUnaddedSearch] = useState('')

  const [calcClassId, setCalcClassId] = useState<string>('')

  const [hbName, setHbName] = useState('')
  const [hbLevel, setHbLevel] = useState<MagicCircleLevel>(1)
  const [hbSchool, setHbSchool] = useState<string>('Evocation')
  const [hbDamageDice, setHbDamageDice] = useState('')
  const [hbMechanic, setHbMechanic] = useState<HomebrewSpellMechanic>('none')
  const [hbSaveAbility, setHbSaveAbility] = useState<Ability>('dex')
  const [hbDesc, setHbDesc] = useState('')
  const [hbHigher, setHbHigher] = useState('')

  const [hbRange, setHbRange] = useState('')
  const [hbArea, setHbArea] = useState('')
  const [hbDuration, setHbDuration] = useState('')
  const [hbCastTimeKind, setHbCastTimeKind] = useState<SpellCastTimeKind>('action')
  const [hbConcentration, setHbConcentration] = useState(false)

  const [hbSourceType, setHbSourceType] = useState<'class' | 'feat'>('class')
  const [hbSourceClassId, setHbSourceClassId] = useState<string>('')
  const [hbFeatName, setHbFeatName] = useState('')
  const [hbFeatAbility, setHbFeatAbility] = useState<Ability>('cha')

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

      updateCharacter(activeCharacter.id, (c) => ({
        ...c,
        spells: c.spells.map((s) =>
          s.spellIndex === args.spellIndex
            ? { ...s, officialDescPt, officialHigherLevelPt }
            : s,
        ),
      }))

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

    setTranslateStatus({ kind: 'loading', spellIndex: spellRef.index })
    try {
      const detail = await getSpell(spellRef.index)
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
        officialDescPt,
        officialHigherLevelPt: officialHigherLevelPt.length ? officialHigherLevelPt : undefined,
      }

      updateCharacter(activeCharacter.id, (c) => ({
        ...c,
        spells: [...c.spells, newSpell].sort((a, b) => {
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
        }),
      }))

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
      if (spellDetails[index] || spellDetailsError[index]) continue
      getSpell(index, controller.signal)
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
  }, [activeCharacter, spellDetails, spellDetailsError])

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

  const unaddedResults = useMemo(() => {
    if (!spellList) return [] as DndApiRef[]
    const q = unaddedSearch.trim().toLowerCase()
    if (!q) return [] as DndApiRef[]
    const results = spellList
      .filter((s) => !activeCharacterSpellsSet.has(s.index))
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 30)
    return results
  }, [activeCharacterSpellsSet, spellList, unaddedSearch])

  function updateCharacter(characterId: string, updater: (c: Character) => Character) {
    setAppState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === characterId ? updater(c) : c)),
    }))
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

    const detail = await getSpell(spellRef.index)
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
    }

    updateCharacter(activeCharacter.id, (c) => ({
      ...c,
      spells: [
        ...c.spells,
        newSpell,
      ].sort((a, b) => {
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
      }),
    }))
  }

  function addHomebrewToActive() {
    if (!activeCharacter) return
    const name = hbName.trim()
    if (!name) return

    const hb: HomebrewSpell = {
      name,
      level: hbLevel,
      school: hbSchool,
      range: hbRange.trim() || undefined,
      area: hbArea.trim() || undefined,
      duration: hbDuration.trim() || undefined,
      concentration: hbConcentration || undefined,
      damageDice: hbDamageDice.trim() || undefined,
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
    setHbDamageDice('')
    setHbDesc('')
    setHbHigher('')
    setHbRange('')
    setHbArea('')
    setHbDuration('')
    setHbCastTimeKind('action')
    setHbConcentration(false)
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
                      <Input
                        className="mt-1"
                        value={hbRange}
                        onChange={(e) => setHbRange(e.target.value)}
                        placeholder="ex: 18 m / Toque / Pessoal"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text">Área</label>
                      <Input
                        className="mt-1"
                        value={hbArea}
                        onChange={(e) => setHbArea(e.target.value)}
                        placeholder="ex: cone 15ft / esfera 6m"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-text">Duração</label>
                      <Input
                        className="mt-1"
                        value={hbDuration}
                        onChange={(e) => setHbDuration(e.target.value)}
                        placeholder="ex: 1 minuto / 10 minutos / 1 hora"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text">Conjuração</label>
                      <Select
                        className="mt-1"
                        value={hbCastTimeKind}
                        onChange={(e) => setHbCastTimeKind(e.target.value as SpellCastTimeKind)}
                      >
                        <option value="action">Ação</option>
                        <option value="bonus">Bônus</option>
                        <option value="reaction">Reação</option>
                      </Select>
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
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-text">Dano (base)</label>
                      <Input
                        className="mt-1"
                        value={hbDamageDice}
                        onChange={(e) => setHbDamageDice(e.target.value)}
                        placeholder="ex: 2d6"
                        title="Opcional. Usado só para o cálculo de dano estimado."
                      />
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
            spellList={spellList}
            spellListError={spellListError}
            unaddedSearch={unaddedSearch}
            setUnaddedSearch={setUnaddedSearch}
            unaddedResults={unaddedResults}
            activeCharacter={activeCharacter}
            activeCharacterSpellsSet={activeCharacterSpellsSet}
            addSpellToActive={addSpellToActive}
            addSpellToActiveTranslated={addSpellToActiveTranslated}
            translateStatus={translateStatus}
          />
        </section>
      </main>
    </div>
  )
}

export default App
