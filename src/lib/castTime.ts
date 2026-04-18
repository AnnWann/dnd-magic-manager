import type { SpellCastTimeKind } from '../types'

export function castTimeKindFromText(castingTime?: string | null): SpellCastTimeKind | undefined {
  const raw = (castingTime ?? '').trim().toLowerCase()
  if (!raw) return undefined

  // Be careful: "bonus action" includes "action".
  if (raw.includes('bonus action')) return 'bonus'
  if (raw.includes('reaction')) return 'reaction'
  if (raw.includes('action')) return 'action'

  return undefined
}

export function castTimeKindLabelPt(kind: SpellCastTimeKind): string {
  if (kind === 'action') return 'Ação'
  if (kind === 'bonus') return 'Bônus'
  return 'Reação'
}
