import type { DndSpell, MagicCircleLevel } from '../types'
import { cantripDiceMultiplier } from './rules'

type Dice = { count: number; size: number }

function parseFirstDice(text: string): Dice | undefined {
  const match = /(\d+)d(\d+)/.exec(text)
  if (!match) return undefined
  const count = Number(match[1])
  const size = Number(match[2])
  if (!Number.isFinite(count) || !Number.isFinite(size)) return undefined
  return { count, size }
}

function firstDiceFromSpellText(spell: DndSpell): Dice | undefined {
  const desc = spell.desc?.join('\n') ?? ''
  const higher = spell.higher_level?.join('\n') ?? ''
  return parseFirstDice(desc) ?? parseFirstDice(higher)
}

function parsePerSlotScaling(spell: DndSpell): { baseSlot: number; increment: Dice } | undefined {
  const lines = spell.higher_level ?? []
  for (const line of lines) {
    const lower = line.toLowerCase()
    const inc = parseFirstDice(line)
    if (!inc) continue

    const m = /for each slot level above (\d+)(?:st|nd|rd|th)?/.exec(lower)
    if (m) {
      const baseSlot = Number(m[1])
      if (Number.isFinite(baseSlot)) return { baseSlot, increment: inc }
    }

    const m2 = /for each level above (\d+)(?:st|nd|rd|th)?/.exec(lower)
    if (m2) {
      const baseSlot = Number(m2[1])
      if (Number.isFinite(baseSlot)) return { baseSlot, increment: inc }
    }

    // PT-BR homebrew / translated text support
    const mPt = /para cada (?:n[íi]vel|c[íi]rculo) acima de (\d+)/.exec(lower)
    if (mPt) {
      const baseSlot = Number(mPt[1])
      if (Number.isFinite(baseSlot)) return { baseSlot, increment: inc }
    }
  }
  return undefined
}

function parseTargetsScaling(spell: DndSpell): { baseSlot: number; addTargets: number } | undefined {
  const lines = spell.higher_level ?? []
  for (const line of lines) {
    const lower = line.toLowerCase()

    // e.g. "for each slot level above 1st, you can affect one additional creature"
    const mEn = /for each slot level above (\d+)(?:st|nd|rd|th)?[^.]*?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) additional (creature|target)/i.exec(
      lower,
    )
    const mPt = /para cada (?:n[íi]vel|c[íi]rculo) acima de (\d+)[^.]*(um|dois|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|\d+) (?:alvo|criatura|creature|target) adicional/i.exec(
      lower,
    )
    const m = mEn ?? mPt
    if (!m) continue

    const baseSlot = Number(m[1])
    const raw = m[2]
    const wordToNum: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      um: 1,
      dois: 2,
      três: 3,
      tres: 3,
      quatro: 4,
      cinco: 5,
      seis: 6,
      sete: 7,
      oito: 8,
      nove: 9,
      dez: 10,
    }
    const addTargets = Number.isFinite(Number(raw)) ? Number(raw) : (wordToNum[raw] ?? 1)
    if (!Number.isFinite(baseSlot) || !Number.isFinite(addTargets)) continue
    return { baseSlot, addTargets }
  }
  return undefined
}

function formatDice(dice: Dice): string {
  return `${dice.count}d${dice.size}`
}

export function upcastRuleLabel(spell?: DndSpell): string | null {
  if (!spell || spell.level === 0) return null
  const dice = parsePerSlotScaling(spell)
  if (dice) {
    return `↑ Dado: +${formatDice(dice.increment)} por círculo acima de ${dice.baseSlot}`
  }
  const targets = parseTargetsScaling(spell)
  if (targets) {
    const n = targets.addTargets
    return `↑ Alvos: +${n} por círculo acima de ${targets.baseSlot}`
  }
  if ((spell.higher_level ?? []).length) {
    return '↑ Em níveis superiores: efeito (sem dado)'
  }
  return null
}

export function estimateSpellDamageDice(args: {
  spell?: DndSpell
  characterLevel: number
  slotLevel: MagicCircleLevel
}): string {
  const spell = args.spell
  if (!spell) return '…'
  const base = firstDiceFromSpellText(spell)
  if (!base) return '—'

  if (spell.level === 0) {
    const mult = cantripDiceMultiplier(args.characterLevel)
    // Support homebrew/notes patterns like "0d6" to mean "starts at 0 dice, then scales".
    // 5e cantrip tiers are represented by mult = 1/2/3/4, so we use (mult - 1) as the dice count.
    const count = base.count === 0 ? Math.max(0, mult - 1) : base.count * mult
    return formatDice({ count, size: base.size })
  }

  const slot = Math.max(spell.level, args.slotLevel)
  const scaling = parsePerSlotScaling(spell)
  if (!scaling || slot <= scaling.baseSlot) return formatDice(base)

  const steps = slot - scaling.baseSlot
  if (scaling.increment.size === base.size) {
    return formatDice({ count: base.count + scaling.increment.count * steps, size: base.size })
  }

  return `${formatDice(base)} + ${steps}×${formatDice(scaling.increment)}`
}
