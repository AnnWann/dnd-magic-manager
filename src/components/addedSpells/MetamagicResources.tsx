import { useEffect, useMemo, useState } from 'react'
import type { Character } from '../../types'
import { loadMetamagicDb, metamagicDisplayName, type MetamagicOption } from '../../lib/metamagicDb'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

export function MetamagicResources(props: {
  activeCharacter: Character
  hideUa: boolean
  sorceryPointsMax: number
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
}) {
  const { activeCharacter, hideUa, sorceryPointsMax, updateCharacter } = props

  function isUaName(name: string) {
    return name.toLowerCase().includes('(ua)')
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
          metamagicDisplayName(a)
            .toLocaleLowerCase('pt-BR')
            .localeCompare(metamagicDisplayName(b).toLocaleLowerCase('pt-BR'), 'pt-BR'),
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

  if (sorceryPointsMax <= 0) return null

  return (
    <div className="mt-3 w-full rounded-lg border border-border bg-bg p-3">
      <div className="text-xs font-semibold text-textH">Metamagias</div>
      <div className="mt-1 text-xs text-text">Seleção por personagem (Feiticeiro).</div>

      {metamagicError ? <div className="mt-2 text-xs text-text">Erro ao carregar: {metamagicError}</div> : null}

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
            const desc = (m?.descPt ?? [])
              .filter((x) => typeof x === 'string' && x.trim())
              .map((x) => x.trim())
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
  )
}
