import type { Character } from '../../types'
import { Button } from '../ui/Button'
import { multiclassSpellSlots } from '../../lib/spellSlots'
import type { RestResetKind } from '../../types'

export type SlotMeta = ReturnType<typeof multiclassSpellSlots>

export function SlotsResources(props: {
  activeCharacter: Character
  slotMeta: SlotMeta
  usedByLevel: number[]
  pactUsed: number
  sorceryPointsMax: number
  sorceryPointsRemaining: number
  sorceryPointsUsedClamped: number
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
}) {
  const {
    activeCharacter,
    slotMeta,
    usedByLevel,
    pactUsed,
    sorceryPointsMax,
    sorceryPointsRemaining,
    sorceryPointsUsedClamped,
    updateCharacter,
  } = props

  const resetFreeUsesForRest = (spells: Character['spells'], kind: RestResetKind): Character['spells'] => {
    return spells.map((s) => {
      const fu = s.freeUses
      if (!fu) return s

      const reset = (fu.reset ?? 'longRest') as RestResetKind
      const shouldReset = kind === 'longRest' ? reset === 'longRest' || reset === 'shortRest' : reset === 'shortRest'
      if (!shouldReset) return s

      const used = typeof fu.used === 'number' && Number.isFinite(fu.used) ? Math.max(0, Math.trunc(fu.used)) : 0
      if (used === 0) return s
      return { ...s, freeUses: { ...fu, used: 0 } }
    })
  }

  return (
    <>
      <div className="text-xs font-semibold text-textH">
        Slots
        {slotMeta.spellcastingLevel > 0 ? (
          <span className="font-normal text-text"> - Nível conjurador: {slotMeta.spellcastingLevel}</span>
        ) : null}
      </div>
      <div className="mt-2">
        <div className={slotMeta.spellcastingLevel > 0 ? 'mt-1 flex min-w-0 flex-wrap items-end gap-2' : 'flex min-w-0 flex-wrap items-end gap-2'}>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => {
            const total = slotMeta.slotsByLevel[lvl] ?? 0
            if (!total) return null
            const used = Math.max(0, Math.trunc(usedByLevel[lvl] ?? 0))
            const remaining = Math.max(0, total - used)
            return (
              <div key={lvl} className="min-w-[160px] flex-1 rounded-md border border-border bg-bg px-2 py-1">
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
                <div className="min-w-[160px] flex-1 rounded-md border border-border bg-bg px-2 py-1">
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
            <div className="min-w-[160px] flex-1 rounded-md border border-border bg-bg px-2 py-1">
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
                        (acc, cls) =>
                          acc +
                          (cls.classIndex === 'sorcerer'
                            ? typeof cls.level === 'number'
                              ? cls.level
                              : 0
                            : 0),
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
                        (acc, cls) =>
                          acc +
                          (cls.classIndex === 'sorcerer'
                            ? typeof cls.level === 'number'
                              ? cls.level
                              : 0
                            : 0),
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
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-9 flex-1"
          title="Reset (descanso curto)"
          onClick={() => {
            updateCharacter(activeCharacter.id, (c) => {
              const prev = c.slotUsage ?? {}
              const nextSpells = resetFreeUsesForRest(c.spells, 'shortRest')
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
          className="h-9 flex-1"
          title="Reset (descanso longo)"
          onClick={() => {
            updateCharacter(activeCharacter.id, (c) => {
              const prev = c.slotUsage ?? {}
              const sorcLevel = c.classes.reduce(
                (acc, cls) =>
                  acc + (cls.classIndex === 'sorcerer' ? (typeof cls.level === 'number' ? cls.level : 0) : 0),
                0,
              )
              const nextSpells = resetFreeUsesForRest(c.spells, 'longRest')
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
    </>
  )
}
