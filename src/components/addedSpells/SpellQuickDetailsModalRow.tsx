import type { Dispatch, SetStateAction } from 'react'
import type { AddedSpell, Character, MagicCircleLevel, PrimaryRollDisplayMode } from '../../types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

export function SpellQuickDetailsModalRow(props: {
  isOpen: boolean
  entry: AddedSpell
  displayName: string
  detailsSubtitle: string
  primaryRollLabel: string
  primaryRollMode: PrimaryRollDisplayMode
  spellBaseLevel: MagicCircleLevel
  effectiveSlot: MagicCircleLevel
  slotOptions: MagicCircleLevel[]
  combatBadgeNodes: React.ReactNode[]
  infoBadgeNodes: React.ReactNode[]
  upcastLabel: string | null
  hideAutoSaveBadges: boolean
  hideAutoAttackBadges: boolean
  hideAutoNumericBadges: boolean
  activeCharacter: Character
  updateCharacter: (id: string, updater: (c: Character) => Character) => void
  setOpenDetailsSpellIndex: Dispatch<SetStateAction<string | null>>
}) {
  const {
    isOpen,
    entry,
    displayName,
    detailsSubtitle,
    primaryRollLabel,
    primaryRollMode,
    spellBaseLevel,
    effectiveSlot,
    slotOptions,
    combatBadgeNodes,
    infoBadgeNodes,
    upcastLabel,
    hideAutoSaveBadges,
    hideAutoAttackBadges,
    hideAutoNumericBadges,
    activeCharacter,
    updateCharacter,
    setOpenDetailsSpellIndex,
  } = props

  if (!isOpen) return null

  return (
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
                        spells: c.spells.map((s) => (s.spellIndex === entry.spellIndex ? { ...s, castSlotLevel } : s)),
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

              <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                <div className="text-[11px] font-semibold text-textH">Badges automáticos</div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-text">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hideAutoSaveBadges}
                      onChange={(e) => {
                        const checked = e.target.checked
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) =>
                            s.spellIndex === entry.spellIndex
                              ? { ...s, hideAutoSaveBadges: checked ? undefined : true }
                              : s,
                          ),
                        }))
                      }}
                    />
                    CD/TR
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hideAutoAttackBadges}
                      onChange={(e) => {
                        const checked = e.target.checked
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) =>
                            s.spellIndex === entry.spellIndex
                              ? { ...s, hideAutoAttackBadges: checked ? undefined : true }
                              : s,
                          ),
                        }))
                      }}
                    />
                    ATQ
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hideAutoNumericBadges}
                      onChange={(e) => {
                        const checked = e.target.checked
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) =>
                            s.spellIndex === entry.spellIndex
                              ? { ...s, hideAutoNumericBadges: checked ? undefined : true }
                              : s,
                          ),
                        }))
                      }}
                    />
                    Mods
                  </label>
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <div className="text-[11px] font-semibold text-textH">Dano / detalhes (coluna)</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-[11px] text-text">Mostrar</label>
                      <Select
                        className="mt-1 h-9"
                        value={primaryRollMode}
                        onChange={(e) => {
                          const mode = e.target.value as PrimaryRollDisplayMode
                          updateCharacter(activeCharacter.id, (c) => ({
                            ...c,
                            spells: c.spells.map((s) => {
                              if (s.spellIndex !== entry.spellIndex) return s
                              if (mode === 'auto') {
                                return { ...s, primaryRollMode: undefined, primaryRollCustom: undefined }
                              }
                              return { ...s, primaryRollMode: mode }
                            }),
                          }))
                        }}
                      >
                        <option value="auto">Auto</option>
                        <option value="save">CD/TR</option>
                        <option value="attack">ATQ</option>
                        <option value="damage">Dano</option>
                        <option value="custom">Texto</option>
                      </Select>
                    </div>

                    {primaryRollMode === 'custom' ? (
                      <div>
                        <label className="text-[11px] text-text">Texto</label>
                        <Input
                          className="mt-1 h-9"
                          value={entry.primaryRollCustom ?? ''}
                          onChange={(e) => {
                            const txt = e.target.value
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) =>
                                s.spellIndex === entry.spellIndex
                                  ? { ...s, primaryRollMode: 'custom', primaryRollCustom: txt || undefined }
                                  : s,
                              ),
                            }))
                          }}
                          placeholder="ex: CD 15 FOR"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

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
  )
}
