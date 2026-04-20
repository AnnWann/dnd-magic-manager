import type { AddedSpell, DndSpell, SpellTranslation } from '../../../types'
import { Button } from '../../ui/Button'
import { InlineMarkdown } from '../../InlineMarkdown'

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

export function SpellOfficialApiPanel(props: {
  entry: AddedSpell
  detail: DndSpell | undefined
  translateStatus: TranslateStatus
  translateOfficialToPt: (args: { spellIndex: string; desc: string[]; higher: string[]; material?: string }) => Promise<void>
  spellTranslations: Record<string, SpellTranslation>
}) {
  const { entry, detail, translateStatus, translateOfficialToPt, spellTranslations } = props

  return (
    <div>
      <div>
        <div className="text-xs font-semibold text-textH">Descrição (API)</div>
        <div className="mt-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 text-xs text-text">
              {entry.officialDescPt?.length ? 'Traduzido (PT-BR)' : 'Original (EN)'}
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {translateStatus.kind === 'error' && translateStatus.spellIndex === entry.spellIndex ? (
                <div className="text-[11px] text-text">{translateStatus.message}</div>
              ) : null}

              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !detail ||
                  translateStatus.kind === 'loading' ||
                  (Boolean(entry.officialDescPt?.length) &&
                    !(
                      (Array.isArray(detail.components) ? detail.components : []).includes('M') &&
                      typeof detail.material === 'string' &&
                      detail.material.trim() &&
                      !spellTranslations[entry.spellIndex]?.materialPt?.trim()
                    ))
                }
                onClick={() => {
                  if (!detail) return
                  const comps = Array.isArray(detail.components) ? detail.components : []
                  const hasMaterial = comps.includes('M') && typeof detail.material === 'string' && detail.material.trim()
                  void translateOfficialToPt({
                    spellIndex: entry.spellIndex,
                    desc: detail.desc ?? [],
                    higher: detail.higher_level ?? [],
                    material: hasMaterial ? detail.material : undefined,
                  })
                }}
                title={
                  entry.officialDescPt?.length
                    ? ((Array.isArray(detail?.components) ? detail.components : []).includes('M') &&
                        typeof detail?.material === 'string' &&
                        detail.material.trim() &&
                        !spellTranslations[entry.spellIndex]?.materialPt?.trim()
                        ? 'Traduzir componente material para PT-BR'
                        : 'Já traduzido')
                    : 'Traduzir descrição para PT-BR'
                }
              >
                {translateStatus.kind === 'loading' && translateStatus.spellIndex === entry.spellIndex
                  ? 'Traduzindo…'
                  : 'Traduzir PT-BR'}
              </Button>
            </div>
          </div>

          <div className="mt-2 space-y-2 text-sm text-text break-words">
            {!detail ? (
              <div>Carregando…</div>
            ) : (
              <>
                {(entry.officialDescPt?.length ? entry.officialDescPt : detail.desc ?? []).map((p, i) => (
                  <p key={i}>
                    <InlineMarkdown text={p} />
                  </p>
                ))}

                {(detail.higher_level ?? []).length ? (
                  <div className="mt-2 rounded-lg border border-border bg-bg p-3">
                    <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
                    <div className="mt-2 space-y-2 text-sm text-text break-words">
                      {(entry.officialHigherLevelPt?.length ? entry.officialHigherLevelPt : detail.higher_level!).map(
                        (p, i) => (
                          <p key={i}>
                            <InlineMarkdown text={p} />
                          </p>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
