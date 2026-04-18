import type { DndSpell, HomebrewSpell } from '../types'

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function formatMetersPt(meters: number): string {
  const rounded = Math.round(meters * 10) / 10
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9
  const s = isInt ? String(Math.round(rounded)) : String(rounded).replace('.', ',')
  return `${s} m`
}

function ftToMeters(ft: number): number {
  // D&D 5e table convention: 5 ft = 1.5 m -> 1 ft = 0.3 m
  return ft * 0.3
}

function convertFeetToMetersInText(text: string): string {
  let t = text

  // 30-foot radius, 15-foot cone, etc.
  t = t.replace(/\b(\d+)\s*-\s*foot\b/gi, (_m, n) => {
    const ft = Number(n)
    if (!Number.isFinite(ft)) return _m
    return `${formatMetersPt(ftToMeters(ft))}`
  })

  // 60 feet, 10 ft, etc.
  t = t.replace(/\b(\d+)\s*(feet|foot|ft)\b/gi, (_m, n) => {
    const ft = Number(n)
    if (!Number.isFinite(ft)) return _m
    return `${formatMetersPt(ftToMeters(ft))}`
  })

  return t
}

function translateRangeText(raw: string): string {
  let t = normalizeSpace(raw)
  const lower = t.toLowerCase()
  if (lower === 'touch') t = 'Toque'
  else if (lower === 'self') t = 'Pessoal'
  else if (lower === 'special') t = 'Especial'
  else if (lower === 'sight') t = 'Visão'
  else if (lower === 'unlimited') t = 'Ilimitado'

  // Light touch-ups inside parentheses (keep conservative)
  t = t
    .replace(/\bradius\b/gi, 'raio')
    .replace(/\bcone\b/gi, 'cone')
    .replace(/\bsphere\b/gi, 'esfera')
    .replace(/\bcylinder\b/gi, 'cilindro')
    .replace(/\bcube\b/gi, 'cubo')
    .replace(/\bline\b/gi, 'linha')

  t = convertFeetToMetersInText(t)
  return t
}

function translateDurationText(raw: string): string {
  let t = normalizeSpace(raw)

  // If the API provides duration like "Concentration, up to 1 minute",
  // we show the "Concentração" badge separately.
  t = t.replace(/^concentration\s*,?\s*/i, '')

  t = t.replace(/^instantaneous$/i, 'Instantânea')
  t = t.replace(/^special$/i, 'Especial')

  // Until dispelled
  t = t.replace(/^until dispelled$/i, 'Até ser dissipada')

  // Up to X
  t = t.replace(/^up to\s+/i, 'Até ')
  t = t.replace(/\bup to\b/gi, 'até')

  // X rounds/minutes/hours
  t = t.replace(/\b(\d+)\s*rounds?\b/gi, (_m, n) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return _m
    return `${v} ${v === 1 ? 'rodada' : 'rodadas'}`
  })
  t = t.replace(/\b(\d+)\s*minutes?\b/gi, (_m, n) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return _m
    return `${v} ${v === 1 ? 'minuto' : 'minutos'}`
  })
  t = t.replace(/\b(\d+)\s*hours?\b/gi, (_m, n) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return _m
    return `${v} ${v === 1 ? 'hora' : 'horas'}`
  })

  // "Until" (keep last, to not break specific patterns)
  t = t.replace(/^until\s+/i, 'Até ')

  return t
}

export function isConcentration(spell?: DndSpell, hb?: HomebrewSpell): boolean {
  if (hb?.concentration) return true
  const c = spell?.concentration
  if (typeof c === 'boolean') return c
  if (typeof c === 'string') {
    const lower = c.toLowerCase()
    return lower === 'yes' || lower === 'true' || lower.includes('concentration')
  }
  return false
}

export function areaLabel(spell?: DndSpell, hb?: HomebrewSpell): string | null {
  if (hb?.area?.trim()) return normalizeSpace(hb.area)
  const a = spell?.area_of_effect
  if (!a?.type || !a?.size) return null

  const typeLower = String(a.type).toLowerCase()
  const typePt: Record<string, string> = {
    cone: 'Cone',
    sphere: 'Esfera',
    cylinder: 'Cilindro',
    line: 'Linha',
    cube: 'Cubo',
  }
  const type = typePt[typeLower] ?? a.type
  const ft = Number(a.size)
  if (!Number.isFinite(ft)) return `${type} ${a.size}`
  return `${type} ${formatMetersPt(ftToMeters(ft))}`
}

export function rangeLabel(spell?: DndSpell, hb?: HomebrewSpell): string | null {
  const r = hb?.range?.trim() ? hb.range : spell?.range
  return r?.trim() ? translateRangeText(r) : null
}

export function durationLabel(spell?: DndSpell, hb?: HomebrewSpell): string | null {
  const d = hb?.duration?.trim() ? hb.duration : spell?.duration
  return d?.trim() ? translateDurationText(d) : null
}

export function extractNumericModsFromText(text: string): string[] {
  const t = text || ''
  if (!t.trim()) return []

  const found: string[] = []

  // AC / CA
  // Examples:
  // - "you have a +5 bonus to AC"
  // - "gain a +2 bonus to your Armor Class"
  // - "sua CA aumenta em +1"
  const acPatterns: RegExp[] = [
    /\b([+-]\s*\d+)\b[^.\n]{0,40}\b(?:AC|Armor Class|CA|Classe de Armadura)\b/gi,
    /\b(?:AC|Armor Class|CA|Classe de Armadura)\b[^.\n]{0,40}\b([+-]\s*\d+)\b/gi,
  ]
  for (const re of acPatterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      const v = normalizeSpace(m[1]).replace(/\s+/g, '')
      if (v && !found.includes(`CA ${v}`)) found.push(`CA ${v}`)
      if (found.length >= 3) break
    }
  }

  // Speed / movement
  // - "speed increases by 10 feet"
  // - "aumenta seu deslocamento em 3m"
  const speedPatterns: RegExp[] = [
    /\b(?:increase|increases|increased)\b[^.\n]{0,40}\b(?:speed|movement)\b[^.\n]{0,20}\bby\s*(\d+)\s*(feet|ft|meters|metres|m)\b/gi,
    /\b(?:speed|movement|deslocamento)\b[^.\n]{0,40}\b([+-]\s*\d+)\s*(feet|ft|meters|metres|m)\b/gi,
    /\b(?:aumenta|aumentar)\b[^.\n]{0,40}\b(?:deslocamento|movimento|velocidade)\b[^.\n]{0,20}\b(?:em|de)\s*(\d+)\s*(m|metros|ft|feet|p[ée]s)\b/gi,
  ]
  for (const re of speedPatterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      const raw = m[1]
      const unit = m[2]
      const v = normalizeSpace(raw).replace(/\s+/g, '')
      if (!v) continue
      const unitNorm = unit.toLowerCase().startsWith('m') ? 'm' : 'ft'
      const numeric = Number(v.replace(/^[+]/, ''))
      let label = `Desloc. +${v.replace(/^[+]/, '')}`
      if (Number.isFinite(numeric) && unitNorm === 'ft') label = `Desloc. +${formatMetersPt(ftToMeters(numeric))}`
      else if (Number.isFinite(numeric) && unitNorm === 'm') label = `Desloc. +${formatMetersPt(numeric)}`
      if (!found.includes(label)) found.push(label)
      if (found.length >= 5) break
    }
  }

  // Generic +N bonus (fallback), but only when it mentions bonus and is not clearly damage dice.
  // Example: "you gain a +1 bonus to ..."
  const genericBonus = /\b([+-]\s*\d+)\b[^.\n]{0,60}\bbonus\b/gi
  let mg: RegExpExecArray | null
  while ((mg = genericBonus.exec(t))) {
    const v = normalizeSpace(mg[1]).replace(/\s+/g, '')
    const label = `Bônus ${v}`
    if (!found.includes(label) && found.length < 6) found.push(label)
  }

  return found
}

export function spellMeta(args: {
  spell?: DndSpell
  hb?: HomebrewSpell
  textForNumericMods?: string
}): {
  range: string | null
  area: string | null
  duration: string | null
  concentration: boolean
  numericMods: string[]
} {
  const { spell, hb, textForNumericMods } = args
  return {
    range: rangeLabel(spell, hb),
    area: areaLabel(spell, hb),
    duration: durationLabel(spell, hb),
    concentration: isConcentration(spell, hb),
    numericMods: extractNumericModsFromText(textForNumericMods ?? ''),
  }
}
