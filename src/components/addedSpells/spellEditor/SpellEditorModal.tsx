import type { AddedSpell, Character, DndSpell, SpellTranslation } from '../../../types'
import { castTimeKindFromText, castTimeReactionWhenFromApi } from '../../../lib/castTime'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { SpellOfficialTab } from './SpellOfficialTab'
import { SpellModifiersTab } from './SpellModifiersTab'
import { SpellHeadcanonTab } from './SpellHeadcanonTab'

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

export function SpellEditorModal(props: {
  isOpen: boolean
  entry: AddedSpell
  detail: DndSpell | undefined
  displayName: string
  activeCharacter: Character

  openSpellTab: 'official' | 'modifiers' | 'headcanon'
  setOpenSpellTab: React.Dispatch<React.SetStateAction<'official' | 'modifiers' | 'headcanon'>>

  openHomebrewEditSpellIndex: string | null
  setOpenHomebrewEditSpellIndex: React.Dispatch<React.SetStateAction<string | null>>

  translateStatus: TranslateStatus
  translateOfficialToPt: (args: { spellIndex: string; desc: string[]; higher: string[]; material?: string }) => Promise<void>
  spellTranslations: Record<string, SpellTranslation>

  setOpenSpellIndex: React.Dispatch<React.SetStateAction<string | null>>
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
}) {
  const {
    isOpen,
    entry,
    detail,
    displayName,
    activeCharacter,
    openSpellTab,
    setOpenSpellTab,
    openHomebrewEditSpellIndex,
    setOpenHomebrewEditSpellIndex,
    translateStatus,
    translateOfficialToPt,
    spellTranslations,
    setOpenSpellIndex,
    updateCharacter,
  } = props

  if (!isOpen) return null

  const castTimeKind = entry.castTimeKind ?? castTimeKindFromText((detail as DndSpell | undefined)?.casting_time)

  const reactionWhenAuto = castTimeReactionWhenFromApi({
    castingTime: (detail as DndSpell | undefined)?.casting_time,
    desc: (detail as DndSpell | undefined)?.desc ?? null,
  })

  return (
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
                    <div className="mt-1 text-xs text-text">Define se a magia usa Ação, Bônus ou Reação.</div>
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
                                      ? reactionWhenAuto ?? s.reactionWhen
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
                    <SpellOfficialTab
                      activeCharacter={activeCharacter}
                      entry={entry}
                      detail={detail}
                      openHomebrewEditSpellIndex={openHomebrewEditSpellIndex}
                      setOpenHomebrewEditSpellIndex={setOpenHomebrewEditSpellIndex}
                      updateCharacter={updateCharacter}
                      translateStatus={translateStatus}
                      translateOfficialToPt={translateOfficialToPt}
                      spellTranslations={spellTranslations}
                    />
                  ) : openSpellTab === 'modifiers' ? (
                    <div>
                      <SpellModifiersTab
                        activeCharacter={activeCharacter}
                        entry={entry}
                        updateCharacter={updateCharacter}
                      />
                    </div>
                  ) : (
                    <SpellHeadcanonTab
                      activeCharacter={activeCharacter}
                      entry={entry}
                      updateCharacter={updateCharacter}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}
