import { useEffect, useMemo, useState } from 'react'
import type { Character, RestResetKind } from '../../types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

export function FreeCastsResources(props: {
  activeCharacter: Character
  spellsForLists: Character['spells']
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
}) {
  const { activeCharacter, spellsForLists, updateCharacter } = props

  const [addFreeUsesSpellIndex, setAddFreeUsesSpellIndex] = useState<string>(() => spellsForLists[0]?.spellIndex ?? '')
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

  return (
    <div className="mt-3 w-full rounded-lg border border-border bg-bg p-3">
      <div className="text-xs font-semibold text-textH">Conjurações grátis</div>
      <div className="mt-1 text-xs text-text">Usos que não gastam slot (ex: Fey Touched).</div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="text-[11px] text-text">Magia</label>
          <Select
            className="mt-1 h-9"
            value={addFreeUsesSpellIndex}
            onChange={(e) => setAddFreeUsesSpellIndex(e.target.value)}
            disabled={!spellsForLists.length}
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
          className="w-full"
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
                        const used =
                          typeof prev.used === 'number' && Number.isFinite(prev.used)
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
                        const used =
                          typeof prev.used === 'number' && Number.isFinite(prev.used)
                            ? Math.max(0, Math.trunc(prev.used))
                            : 0
                        return { ...s, freeUses: { ...prev, used: Math.max(0, used + 1) } }
                      }),
                    }))
                  }}
                >
                  −
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
