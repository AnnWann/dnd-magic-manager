import type { Dispatch, SetStateAction } from 'react'
import type { Character, DndApiRef } from '../types'
import { classDisplayName } from '../lib/spellLabels'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader } from './ui/Card'
import { Input } from './ui/Input'

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

export function AddSpellsCard(props: {
  spellList: DndApiRef[] | null
  spellListError: string | null
  unaddedSearch: string
  setUnaddedSearch: Dispatch<SetStateAction<string>>
  unaddedResults: DndApiRef[]
  activeCharacter: Character
  activeCharacterSpellsSet: Set<string>
  addSpellToActive: (spell: DndApiRef) => Promise<void>
  addSpellToActiveTranslated: (spell: DndApiRef) => Promise<void>
  translateStatus: TranslateStatus
}) {
  const {
    spellList,
    spellListError,
    unaddedSearch,
    setUnaddedSearch,
    unaddedResults,
    activeCharacter,
    activeCharacterSpellsSet,
    addSpellToActive,
    addSpellToActiveTranslated,
    translateStatus,
  } = props

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

        <div className="mt-3">
          <Input
            value={unaddedSearch}
            onChange={(e) => setUnaddedSearch(e.target.value)}
            placeholder="Digite o nome de uma magia…"
          />
        </div>

        {unaddedSearch.trim() ? (
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
                    return (
                      <tr
                        key={s.index}
                        className="border-t border-border text-sm odd:bg-[color:var(--social-bg)] hover:bg-accentBg"
                      >
                        <td className="p-2 text-textH">{s.name}</td>
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
