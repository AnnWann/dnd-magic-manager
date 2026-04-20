export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export type ProficiencyMode = 'totalLevel' | 'classLevel'

export type RestResetKind = 'longRest' | 'shortRest'

export type PrimaryRollDisplayMode = 'auto' | 'custom' | 'save' | 'attack' | 'damage'

export type MagicCircleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type SpellCastTimeKind = 'action' | 'bonus' | 'reaction'

export type HomebrewSpellMechanic = 'none' | 'attack' | 'save' | 'both'

export type SpellEffectTarget =
  | 'ac'
  | 'speed'
  | 'initiative'
  | 'attack'
  | 'save'
  | 'ability'
  | 'condition'
  | 'economy'
  | 'forcedMove'
  | 'conditionalDamage'
  | 'saveOutcomeDamage'
  | 'rollDice'

export type SpellEffectMode = 'add' | 'sub' | 'set' | 'adv' | 'dis' | 'apply' | 'remove'

export type RollEffectApplyTo = 'attack' | 'save' | 'skill'

export type ActionEconomyKey =
  | 'action'
  | 'bonusAction'
  | 'reaction'
  | 'movement'
  | 'turn'

export type ConditionKey =
  | 'blinded'
  | 'deafened'
  | 'frightened'
  | 'poisoned'
  | 'prone'
  | 'restrained'
  | 'stunned'
  | 'paralyzed'
  | 'charmed'

export interface SpellEffect {
  target: SpellEffectTarget
  mode: SpellEffectMode
  rollDice?: string
  rollAppliesTo?: RollEffectApplyTo[]
  /** Numeric value for add/set modes. */
  value?: number
  /** Optional: used when target is attack/save/ability. */
  ability?: Ability
  /** Optional: for speed; defaults to 'ft' when omitted. */
  unit?: 'ft' | 'm'
  /** Optional: when target is condition. */
  condition?: ConditionKey
  /** Optional: when target is economy (remove action economy options). */
  economy?: ActionEconomyKey

  /** Optional: when target is conditionalDamage (free-text trigger). */
  damageWhen?: string
  /** Optional: when target is conditionalDamage (dice text like "2d6"). */
  damageDice?: string

  /** Optional: when target is saveOutcomeDamage (pass/fail saving throw adjustment). */
  saveOutcome?: 'success' | 'failure'
  /** Optional: when target is saveOutcomeDamage (free text shown for the outcome). */
  saveOutcomeText?: string
  /** Operation for saveOutcomeDamage (how the damage is adjusted). */
  saveDamageOp?: 'mul' | 'div' | 'add' | 'sub'
  /** Value for saveOutcomeDamage operation (e.g. 2 for ÷2, 0.5 for ×0.5, 3 for +3). */
  saveDamageValue?: number

  /** Optional: when target is forcedMove. */
  forcedMoveDirection?: 'any' | 'towards' | 'away' | 'direction'
  /** Reference point for towards/away (free-text: e.g. "você", "o conjurador", "X"). */
  forcedMoveReference?: string
  /** Free-text direction (e.g. "norte", "em linha reta", "para o centro da área"). */
  forcedMoveDirectionText?: string
}

export interface HomebrewSpell {
  name: string
  level: MagicCircleLevel
  /** Use DnD school canonical names (e.g. "Evocation") */
  school: string

  /** Optional: default casting time for this homebrew spell. */
  castingTimeKind?: SpellCastTimeKind
  /** Optional: when castingTimeKind === 'reaction', describes when the reaction can be taken. */
  reactionWhen?: string

  /** Optional: whether this spell can be cast as a ritual. */
  ritual?: boolean

  /** Optional: base classes that have access to this spell (API class indexes, e.g. 'wizard'). */
  classes?: string[]

  /** Optional: spell components (V/S/M). */
  components?: Array<'V' | 'S' | 'M'>
  /** Optional: material component text (when components includes 'M'). */
  material?: string

  /** Optional: display/meta */
  range?: string
  /** Free-text area (e.g. "cone 15 ft", "esfera 6m", "self (15-foot cone)") */
  area?: string
  duration?: string
  concentration?: boolean

  /** Optional: used for the damage estimator (e.g. "2d6") */
  damageDice?: string

  /** Optional: mark if this spell uses spell attack and/or saving throws */
  mechanic?: HomebrewSpellMechanic
  /** When mechanic is "save" or "both" */
  saveAbility?: Ability

  /** Description text (free-form, typically PT-BR) */
  desc?: string
  /** "At Higher Levels" text (free-form, typically PT-BR) */
  higherLevel?: string
}

export interface CharacterClass {
  id: string
  classIndex: string
  className: string
  level: number
  castingAbility: Ability

  /** Optional: override for multiclass spell slot progression (used for special cases like EK/AT). */
  spellcastingProgression?: 'auto' | 'third'
}

export interface SpellSlotUsage {
  /** Used slots by spell level. Index 1..9 are used; index 0 is ignored. */
  usedByLevel?: number[]
  /** Used Pact Magic slots (Warlock). */
  pactUsed?: number
}

export interface AddedSpell {
  spellIndex: string
  spellName: string
  /** Where this spell comes from in the character sheet */
  sourceType?: 'class' | 'feat'

  /** When sourceType === 'class' */
  sourceClassId?: string

  /** When sourceType === 'feat' */
  featName?: string
  featAbility?: Ability
  addedAt: number

  /** Optional: user-provided Portuguese display name override */
  displayNamePt?: string

  /** Optional: user-provided description / notes ("headcanon") */
  headcanon?: string

  /** Optional: manual, structured effects (badges) for this spell on this character. */
  effects?: SpellEffect[]

  /** Optional: slot/circle level used for damage estimation / upcasting */
  castSlotLevel?: MagicCircleLevel

  /** Optional: how this spell is cast in combat (action economy) */
  castTimeKind?: SpellCastTimeKind

  /** Optional: when castTimeKind resolves to 'reaction', describes when the reaction can be taken. */
  reactionWhen?: string

  /** Optional: whether this spell is currently prepared (when applicable) */
  prepared?: boolean

  /** Optional: number of free uses for this spell (does not spend a slot). */
  freeUses?: {
    max: number
    used?: number
    reset?: RestResetKind
  }

  /** Optional: override how the main "roll" label is displayed in the UI. */
  primaryRollMode?: PrimaryRollDisplayMode
  /** Optional: custom label when primaryRollMode === 'custom'. */
  primaryRollCustom?: string

  /** Optional: per-spell UI overrides to hide auto-generated badges/labels. */
  hideAutoSaveBadges?: boolean
  hideAutoAttackBadges?: boolean
  hideAutoNumericBadges?: boolean

  /** Optional: per-character override for the material components text shown in the V/S/M tooltip. */
  materialOverride?: string

  /** Optional: cached translation of the official API description (PT-BR) */
  officialDescPt?: string[]
  officialHigherLevelPt?: string[]

  /** Optional: homebrew spell definition (when spellIndex starts with "hb:") */
  homebrew?: HomebrewSpell
}

export interface Character {
  id: string
  name: string
  abilities: Record<Ability, number>
  classes: CharacterClass[]
  spells: AddedSpell[]
  proficiencyMode: ProficiencyMode

  /** Optional: per-character tracker for spell slot usage. */
  slotUsage?: SpellSlotUsage

  /** Optional: per-character tracker for Sorcerer sorcery points usage. */
  sorceryPointsUsed?: number

  /** Optional: selected metamagic option IDs for Sorcerer characters. */
  metamagics?: string[]
}

export interface DndApiRef {
  index: string
  name: string
  url: string
}

export interface DndSpell extends DndApiRef {
  level: number
  /** 5e API field (examples: "1 action", "1 bonus action", "1 reaction, which you take when ...") */
  casting_time?: string
  ritual?: boolean
  school: DndApiRef
  classes: DndApiRef[]
  /** Spell components from 5e API, e.g. ["V","S","M"] */
  components?: string[]
  /** Material components text from 5e API when components include "M" */
  material?: string
  range?: string
  duration?: string
  /** 5e API uses strings like "yes"/"no"; accept boolean too. */
  concentration?: boolean | string
  area_of_effect?: {
    type?: string
    size?: number
  }
  desc?: string[]
  higher_level?: string[]
  // Present for spells that require a saving throw in the 5e API
  dc?: {
    dc_type?: DndApiRef
    dc_success?: string
    desc?: string
  }
  // Present for spells that use spell attacks in the 5e API
  attack_type?: string
  damage?: unknown
}

export interface SpellTranslation {
  /** Optional Portuguese display name (e.g. user-entered or translated). */
  namePt?: string
  /** Optional Portuguese description for official spells. */
  descPt?: string[]
  /** Optional Portuguese "At Higher Levels" for official spells. */
  higherPt?: string[]
  /** Optional Portuguese translation for the material components text (5e API "material"). */
  materialPt?: string
}

export interface SpellListResponse {
  count: number
  results: DndApiRef[]
}
