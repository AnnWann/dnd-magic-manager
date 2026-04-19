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

export function castTimeReactionWhenFromText(castingTime?: string | null): string | undefined {
  const raw = (castingTime ?? '').trim()
  if (!raw) return undefined
  if (!/reaction/i.test(raw)) return undefined

  // Common 5e API format: "1 reaction, which you take when ..."
  const commaIdx = raw.indexOf(',')
  if (commaIdx >= 0) {
    const after = raw.slice(commaIdx + 1).trim()
    return after || undefined
  }

  // Fallback: strip leading "1 reaction" (or similar) if there's no comma.
  const stripped = raw
    .replace(/^\s*\d+\s*reaction\b\s*/i, '')
    .replace(/^\s*reaction\b\s*/i, '')
    .trim()

  return stripped || undefined
}

export function castTimeReactionWhenFromApi(args: {
  castingTime?: string | null
  desc?: string[] | null
}): string | undefined {
  const fromCastingTime = castTimeReactionWhenFromText(args.castingTime)
  if (fromCastingTime) return fromCastingTime

  const first = (args.desc?.[0] ?? '').trim()
  if (!first) return undefined
  const t = first.toLowerCase()

  // Heuristics for SRD reaction spells when API omits the explicit trigger.
  // Keep these conservative and PT-BR oriented; user can edit.
  if (t.includes('triggering attack')) return 'quando você for atingido por um ataque'
  if (t.includes('the creature that damaged you')) return 'quando uma criatura te causar dano'
  if (t.includes('in the process of casting a spell')) return 'quando uma criatura estiver conjurando uma magia'

  return undefined
}
