import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Character, DndApiRef, DndSpell, HomebrewSpell, MagicCircleLevel, SpellTranslation } from '../types'
import { magicCircleOptions } from '../lib/rules'
import { CLASS_NAME_BY_INDEX, CLASS_OPTIONS, classDisplayName, SCHOOL_NAME_PT, schoolLabel } from '../lib/spellLabels'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader } from './ui/Card'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { InlineMarkdown } from './InlineMarkdown'

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

export function AddSpellsCard(props: {
  spellList: DndApiRef[] | null
  spellListError: string | null
  unaddedSearch: string
  setUnaddedSearch: Dispatch<SetStateAction<string>>
  unaddedLevelFilter: MagicCircleLevel | 'any'
  setUnaddedLevelFilter: Dispatch<SetStateAction<MagicCircleLevel | 'any'>>
  unaddedSchoolFilter: string
  setUnaddedSchoolFilter: Dispatch<SetStateAction<string>>
  unaddedClassFilter: string
  setUnaddedClassFilter: Dispatch<SetStateAction<string>>
  unaddedResults: DndApiRef[]
  activeCharacter: Character
  activeCharacterSpellsSet: Set<string>
  addSpellToActive: (spell: DndApiRef) => Promise<void>
  addSpellToActiveTranslated: (spell: DndApiRef) => Promise<void>
  translateStatus: TranslateStatus
  getSpellDetails: (index: string, signal?: AbortSignal) => Promise<DndSpell>
  homebrewLibrary: Record<string, HomebrewSpell>
  spellTranslations: Record<string, SpellTranslation>
}) {
  const {
    spellList,
    spellListError,
    unaddedSearch,
    setUnaddedSearch,
    unaddedLevelFilter,
    setUnaddedLevelFilter,
    unaddedSchoolFilter,
    setUnaddedSchoolFilter,
    unaddedClassFilter,
    setUnaddedClassFilter,
    unaddedResults,
    activeCharacter,
    activeCharacterSpellsSet,
    addSpellToActive,
    addSpellToActiveTranslated,
    translateStatus,
    getSpellDetails,
    homebrewLibrary,
    spellTranslations,
  } = props

  const [showDescMode, setShowDescMode] = useState<'off' | 'on'>('off')
  const [openDescIndex, setOpenDescIndex] = useState<string | null>(null)
  const [openDescLoading, setOpenDescLoading] = useState(false)
  const [openDescError, setOpenDescError] = useState<string | null>(null)
  const [openDescSpell, setOpenDescSpell] = useState<DndSpell | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const openDescHomebrew = useMemo(() => {
    if (!openDescIndex?.startsWith('hb:')) return null
    return homebrewLibrary[openDescIndex] ?? null
  }, [homebrewLibrary, openDescIndex])

  useEffect(() => {
    if (!openDescIndex) return
    if (showDescMode !== 'on') {
      setOpenDescIndex(null)
      return
    }
    if (!unaddedResults.some((s) => s.index === openDescIndex)) {
      setOpenDescIndex(null)
    }
  }, [openDescIndex, showDescMode, unaddedResults])

  const toggleDescription = (spellIndex: string) => {
    if (showDescMode !== 'on') return
    if (openDescIndex === spellIndex) {
      requestRef.current?.abort()
      requestRef.current = null
      setOpenDescIndex(null)
      setOpenDescSpell(null)
      setOpenDescError(null)
      setOpenDescLoading(false)
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setOpenDescIndex(spellIndex)
    setOpenDescError(null)
    setOpenDescSpell(null)

    if (spellIndex.startsWith('hb:')) {
      setOpenDescLoading(false)
      return
    }

    setOpenDescLoading(true)
    void getSpellDetails(spellIndex, controller.signal)
      .then((spell) => {
        if (controller.signal.aborted) return
        setOpenDescSpell(spell)
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setOpenDescError(String((e as Error)?.message ?? e ?? 'Erro ao carregar'))
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setOpenDescLoading(false)
      })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-textH">Adicionar magias</div>
            <div className="mt-1 text-xs text-text">Pesquise magias não adicionadas pelo nome.</div>
          </div>
          <div className="text-xs text-text">
            {spellList ? `${spellList.length} magias disponíveis` : 'Carregando lista…'}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {spellListError ? (
          <div className="mt-2 rounded-md border border-border bg-accentBg p-2 text-xs text-textH">
            {spellListError}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 items-end gap-2 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="text-xs text-text">Nome</label>
            <Input
              className="mt-1 h-9 w-full px-2 text-xs"
              value={unaddedSearch}
              onChange={(e) => setUnaddedSearch(e.target.value)}
              placeholder="Digite o nome de uma magia…"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-text">Nível</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={unaddedLevelFilter}
              onChange={(e) => {
                const v = e.target.value
                setUnaddedLevelFilter(v === 'any' ? 'any' : (Number(v) as MagicCircleLevel))
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
          <div className="md:col-span-3">
            <label className="text-xs text-text">Escola</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={unaddedSchoolFilter}
              onChange={(e) => setUnaddedSchoolFilter(e.target.value)}
            >
              <option value="any">Qualquer</option>
              {Object.keys(SCHOOL_NAME_PT).map((s) => (
                <option key={s} value={s}>
                  {schoolLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-text">Classe</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={unaddedClassFilter}
              onChange={(e) => setUnaddedClassFilter(e.target.value)}
            >
              <option value="any">Qualquer</option>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.index} value={c.index}>
                  {CLASS_NAME_BY_INDEX[c.index] ?? c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-4">
            <label className="text-xs text-text">Descrição ao clicar</label>
            <Select
              className="mt-1 h-9 w-full px-2 text-xs"
              value={showDescMode}
              onChange={(e) => setShowDescMode(e.target.value as 'off' | 'on')}
            >
              <option value="off">Não mostrar</option>
              <option value="on">Mostrar</option>
            </Select>
          </div>
        </div>

        {unaddedSearch.trim() || unaddedLevelFilter !== 'any' || unaddedSchoolFilter !== 'any' || unaddedClassFilter !== 'any' ? (
          <div className="mt-3 overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="bg-accentBg">
                <tr className="text-left text-xs text-text">
                  <th className="p-2">Magia</th>
                  <th className="p-2">Auto “conjurar como”</th>
                  <th className="p-2"></th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {unaddedResults.length === 0 ? (
                  <tr>
                    <td className="p-3 text-sm text-text" colSpan={4}>
                      Sem resultados.
                    </td>
                  </tr>
                ) : (
                  unaddedResults.map((s) => {
                    const auto = activeCharacter.classes[0]
                    const isHomebrew = s.index.startsWith('hb:')
                    const hasCachedTranslation =
                      !isHomebrew &&
                      Boolean(
                        spellTranslations[s.index]?.descPt?.length ||
                          spellTranslations[s.index]?.higherPt?.length ||
                          spellTranslations[s.index]?.namePt?.trim(),
                      )
                    const isBusy =
                      !isHomebrew &&
                      translateStatus.kind === 'loading' &&
                      translateStatus.spellIndex === s.index
                    const rowError =
                      !isHomebrew &&
                      translateStatus.kind === 'error' &&
                      translateStatus.spellIndex === s.index
                        ? translateStatus.message
                        : null
                    const isOpen = showDescMode === 'on' && openDescIndex === s.index
                    return (
                      <Fragment key={s.index}>
                        <tr
                          className="border-t border-border text-sm odd:bg-[color:var(--social-bg)] hover:bg-accentBg"
                        >
                          <td className="p-2 text-textH">
                            {showDescMode === 'on' ? (
                              <button
                                type="button"
                                className="text-left text-textH hover:underline"
                                onClick={() => toggleDescription(s.index)}
                                title="Mostrar descrição"
                              >
                                {s.name}
                              </button>
                            ) : (
                              s.name
                            )}
                          </td>
                          <td className="p-2 text-text">{auto ? classDisplayName(auto) : '(nenhuma)'}</td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => void addSpellToActive(s)}
                              disabled={activeCharacterSpellsSet.has(s.index)}
                            >
                              Adicionar
                            </Button>
                          </td>

                          <td className="p-2">
                            <div className="flex flex-col items-start gap-1">
                              {isHomebrew ? (
                                <div className="text-[11px] text-text">—</div>
                              ) : hasCachedTranslation ? (
                                <div className="text-[11px] text-text">—</div>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void addSpellToActiveTranslated(s)}
                                    disabled={
                                      activeCharacterSpellsSet.has(s.index) ||
                                      translateStatus.kind === 'loading'
                                    }
                                    title="Traduz e já salva em PT-BR no personagem"
                                  >
                                    {isBusy ? 'Traduzindo…' : 'Traduzir e adicionar'}
                                  </Button>
                                  {rowError ? (
                                    <div className="text-[11px] text-text">{rowError}</div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isOpen ? (
                          <tr className="border-t border-border bg-bg">
                            <td colSpan={4} className="p-3">
                              <div className="text-xs font-semibold text-textH">Descrição</div>
                              <div className="mt-2 space-y-2 text-sm text-text">
                                {openDescLoading ? (
                                  <div className="text-xs text-text">Carregando…</div>
                                ) : openDescError ? (
                                  <div className="text-xs text-text">{openDescError}</div>
                                ) : openDescHomebrew ? (
                                  <>
                                    {(openDescHomebrew.desc?.trim() ? [openDescHomebrew.desc.trim()] : []).map((p, i) => (
                                      <p key={i}>
                                        <InlineMarkdown text={p} />
                                      </p>
                                    ))}
                                    {!openDescHomebrew.desc?.trim() ? (
                                      <div className="text-xs text-text">—</div>
                                    ) : null}

                                    {openDescHomebrew.higherLevel?.trim() ? (
                                      <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                                        <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
                                        <div className="mt-2 space-y-2 text-sm text-text">
                                          <p>
                                            <InlineMarkdown text={openDescHomebrew.higherLevel.trim()} />
                                          </p>
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                ) : openDescSpell ? (
                                  <>
                                    {(openDescSpell.desc ?? []).map((p, i) => (
                                      <p key={i}>
                                        <InlineMarkdown text={p} />
                                      </p>
                                    ))}
                                    {!(openDescSpell.desc?.length) ? (
                                      <div className="text-xs text-text">—</div>
                                    ) : null}

                                    {openDescSpell.higher_level?.length ? (
                                      <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                                        <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
                                        <div className="mt-2 space-y-2 text-sm text-text">
                                          {(openDescSpell.higher_level ?? []).map((p, i) => (
                                            <p key={i}>
                                              <InlineMarkdown text={p} />
                                            </p>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="text-xs text-text">—</div>
                                )}
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
        ) : (
          <div className="mt-3 text-xs text-text">Dica: tente “fire”, “healing”, “shield”…</div>
        )}

        <div className="mt-3 text-xs text-text">
          A classe é auto-escolhida quando possível (com base nas suas classes).
        </div>
      </CardContent>
    </Card>
  )
}
