import { Check } from "lucide-react"
import { useState } from "react"

import { Input } from "../../../components/ui/Input"
import { attributeShort } from "../../../lib/attributeShorts"
import { cn } from "../../../lib/cn"
import { formatSigned } from "../../../lib/formatSigned"
import { clampInt } from "../../../lib/numberFormat"
import type { CharacterTemplate } from "../../../models/characters/CharacterTemplate"
import {
  formatUnarmedDamage,
  getUnarmedAttackProfile,
} from "../../../models/characters/unarmedAttack"
import {
  getWeaponAttackAttribute,
  getWeaponDamageDie,
  isWeaponImprovisedGrip,
  type Weapon,
} from "../../../models/items/equipment/Weapon"
import {
  getCalculatedInitiative,
  getCalculatedMobility,
  getCalculatedPassivePerception,
  getStatAdjustmentKey,
  type CalculatedStatKey,
} from "../../../models/characters/characterStats"
import {
  getCalculatedArmorClassWithShield,
  getEffectiveArmorClassWithShield,
} from "../../../models/items/equipment/Shield"
import {
  ATTRIBUTE_KEYS,
  type Attribute,
} from "../../../models/sheet/Attribute"
import { CharacterHpControls } from "./characterHpControls"
import { SpellcastingHandsWarning } from "./spellcastingHandsWarning"
import {
  HandItemActionsDialog,
  type HandItemActionsDialogState,
} from "./weaponAttackCardActionsDialog"
import { WeaponAmmunitionQuickControl } from "./weaponAmmunitionQuickControl"
import type { Skill } from "../../../models/sheet/Skills"
import { SelectSkillModule } from "./skills/selectCharacterSkills"
import { MinimalCharacterActions } from "./minimalCharacterActions"
import { useCharacterWorkspace } from "../workspace/CharacterWorkspaceContext"

type Props = {
  character: CharacterTemplate
  updateCharacter: (
    characterId: string,
    updater: (character: CharacterTemplate) => CharacterTemplate,
  ) => void
}

const SAVING_THROWS: Array<{ attribute: Attribute; label: string }> = [
  { attribute: "str", label: "Força" },
  { attribute: "dex", label: "Destreza" },
  { attribute: "con", label: "Constituição" },
  { attribute: "int", label: "Inteligência" },
  { attribute: "wis", label: "Sabedoria" },
  { attribute: "cha", label: "Carisma" },
]

const SKILLS: Array<{ key: Skill; label: string; ability: Attribute }> = [
  { key: "acrobatics", label: "Acrobacia", ability: "dex" },
  { key: "arcana", label: "Arcanismo", ability: "int" },
  { key: "athletics", label: "Atletismo", ability: "str" },
  { key: "performance", label: "Atuação", ability: "cha" },
  { key: "deception", label: "Blefe", ability: "cha" },
  { key: "stealth", label: "Furtividade", ability: "dex" },
  { key: "history", label: "História", ability: "int" },
  { key: "intimidation", label: "Intimidação", ability: "cha" },
  { key: "insight", label: "Intuição", ability: "wis" },
  { key: "investigation", label: "Investigação", ability: "int" },
  { key: "animalHandling", label: "Lidar com Animais", ability: "wis" },
  { key: "medicine", label: "Medicina", ability: "wis" },
  { key: "nature", label: "Natureza", ability: "int" },
  { key: "perception", label: "Percepção", ability: "wis" },
  { key: "persuasion", label: "Persuasão", ability: "cha" },
  { key: "sleightOfHand", label: "Prestidigitação", ability: "dex" },
  { key: "religion", label: "Religião", ability: "int" },
  { key: "survival", label: "Sobrevivência", ability: "wis" },
]

export function MinimalCharacterSheet({
  character,
  updateCharacter,
}: Props) {
  const {
    dispatchStatOperation,
    dispatchAttributeOperation,
    dispatchSavingThrowOperation,
  } = useCharacterWorkspace()
  const [skillQuery, setSkillQuery] = useState("")
  const [handDialog, setHandDialog] =
    useState<HandItemActionsDialogState | null>(null)
  const sheet = character.get("sheet")
  const characterId = character.get("id")
  const proficiency = character.getProficiencyBonus()
  const normalizedSkillQuery = normalizeSearchText(skillQuery)
  const matchingSkills = normalizedSkillQuery
    ? SKILLS.filter((skill) =>
        normalizeSearchText(skill.label).includes(normalizedSkillQuery),
      )
    : []

  function updateDerivedStat(
    statKey: CalculatedStatKey,
    desiredValue: number,
    calculate: (current: CharacterTemplate) => number,
  ) {
    if (!Number.isFinite(desiredValue)) return

    const calculatedValue = calculate(character)
    let dispatched = false
    switch (statKey) {
      case "armorClass":
        dispatched = dispatchStatOperation({ type: "character.stat.armorClass.set", characterId, value: desiredValue, calculatedValue })
        break
      case "initiative":
        dispatched = dispatchStatOperation({ type: "character.stat.initiative.set", characterId, value: desiredValue, calculatedValue })
        break
      case "mobility":
        dispatched = dispatchStatOperation({ type: "character.stat.mobility.set", characterId, value: desiredValue, calculatedValue })
        break
      case "passive_perception":
        dispatched = dispatchStatOperation({ type: "character.stat.passivePerception.set", characterId, value: desiredValue, calculatedValue })
        break
    }
    if (dispatched) return

    updateCharacter(characterId, (current) => {
      const adjustmentKey = getStatAdjustmentKey(statKey)
      const automaticValue = calculate(current)
      const adjustment = Number((desiredValue - automaticValue).toFixed(4))
      return current.withStat(adjustmentKey, adjustment)
    })
  }

  function setExhaustion(value: number) {
    const next = Math.max(0, Math.min(6, Math.trunc(value) || 0))
    if (dispatchStatOperation({ type: "character.stat.exhaustion.set", characterId, value: next })) return
    updateCharacter(characterId, (current) => current.withStat("exhaustion", next))
  }

  function setInspiration(value: boolean) {
    if (dispatchStatOperation({ type: "character.stat.inspiration.set", characterId, value })) return
    updateCharacter(characterId, (current) => current.withStat("inspiration", value))
  }

  function updateAttribute(attribute: Attribute, desiredScore: number) {
    const requestedScore = clampInt(desiredScore, 1, 30)
    const attributes = character.get("sheet").attributes
    const baseScore = attributes[attribute]
    const nextBase = clampInt(
      baseScore + requestedScore - character.getEffectiveAttribute(attribute),
      1,
      30,
    )

    if (dispatchAttributeOperation({
      type: "character.attribute.set",
      characterId,
      attribute,
      value: nextBase,
    })) return

    updateCharacter(characterId, (current) =>
      current.withSheet("attributes", {
        ...current.get("sheet").attributes,
        [attribute]: nextBase,
      }),
    )
  }

  function toggleSavingThrow(attribute: Attribute) {
    const proficient = character.isSavingThrowProficient(attribute)
    if (dispatchSavingThrowOperation({
      type: "character.savingThrow.set",
      characterId,
      attribute,
      proficient: !proficient,
    })) return

    updateCharacter(characterId, (current) =>
      current.setSavingThrowProficiency(attribute, !proficient),
    )
  }

  return (
    <div className="grid gap-3">
      <CompactSection title="HP">
        <CharacterHpControls character={character} updateCharacter={updateCharacter} compact />
      </CompactSection>

      <CompactSection title="Stats">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <CompactNumberField label="CA" value={getEffectiveArmorClassWithShield(character)} onChange={(value) => updateDerivedStat("armorClass", value, getCalculatedArmorClassWithShield)} />
          <CompactNumberField label="Iniciativa" value={character.getEffectiveInitiative()} signed onChange={(value) => updateDerivedStat("initiative", value, getCalculatedInitiative)} />
          <CompactNumberField label="Desloc." value={character.getEffectiveMobility()} onChange={(value) => updateDerivedStat("mobility", value, getCalculatedMobility)} />
          <CompactNumberField label="Passiva" value={character.getEffectivePassivePerception()} onChange={(value) => updateDerivedStat("passive_perception", value, getCalculatedPassivePerception)} />
          <CompactNumberField label="Exaustão" value={sheet.stats.exhaustion ?? 0} min={0} max={6} onChange={setExhaustion} />
          <ReadOnlyStat label="Proficiência" value={formatSigned(proficiency)} />
          <button
            type="button"
            aria-pressed={sheet.stats.inspiration ?? false}
            onClick={() => setInspiration(!(sheet.stats.inspiration ?? false))}
            className={cn(
              "min-h-16 rounded-lg border px-2 py-2 text-center transition-colors",
              sheet.stats.inspiration ? "border-accentBorder bg-accentBg text-textH" : "border-border bg-bg-subtle text-textMuted hover:border-borderStrong",
            )}
          >
            <div className="text-[10px] uppercase tracking-wide">Inspiração</div>
            <div className="mt-1 text-sm font-bold text-textH">{sheet.stats.inspiration ? "Disponível" : "Gasta"}</div>
          </button>
        </div>
      </CompactSection>

      <CompactSection title="Atributos">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ATTRIBUTE_KEYS.map((attribute) => (
            <label key={attribute} className="grid min-w-0 gap-1 rounded-lg border border-border bg-bg-subtle p-2 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">{attributeShort(attribute)}</span>
              <Input
                type="number"
                min={1}
                max={30}
                inputMode="numeric"
                className="h-8 min-w-0 px-1 text-center text-sm font-bold"
                value={character.getEffectiveAttribute(attribute)}
                onChange={(event) => updateAttribute(attribute, Number(event.target.value))}
              />
              <span className="text-xs font-bold text-textH">{formatSigned(character.getEffectiveAttributeModifier(attribute))}</span>
            </label>
          ))}
        </div>
      </CompactSection>

      <CompactSection title="Testes de Resistência">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {SAVING_THROWS.map(({ attribute, label }) => {
            const proficient = character.isSavingThrowProficient(attribute)
            return (
              <button
                key={attribute}
                type="button"
                aria-pressed={proficient}
                title={`${label}: ${proficient ? "proficiente" : "não proficiente"}`}
                onClick={() => toggleSavingThrow(attribute)}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
                  proficient ? "border-accentBorder bg-accentBg" : "border-border bg-bg-subtle hover:border-borderStrong",
                )}
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  proficient ? "border-accent bg-accent text-white" : "border-textMuted",
                )}>
                  {proficient ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-textH">{attributeShort(attribute)}</span>
                <span className="shrink-0 text-sm font-bold text-textH">{formatSigned(character.getSavingThrowBonus(attribute))}</span>
              </button>
            )
          })}
        </div>
      </CompactSection>

      <CompactSection title="Ataques e CDs">
        <div className="grid gap-3">
          <SpellcastingHandsWarning character={character} />

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-textMuted">Armas equipadas</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {character.get("equipment").weapons.length ? (
                character.get("equipment").weapons.map((weapon, index) => {
                  const attribute = getWeaponAttackAttribute(weapon)
                  const baseAttack = character.getEffectiveAttributeModifier(attribute) + (weapon.proficient && !isWeaponImprovisedGrip(weapon) ? proficiency : 0)
                  const attack = character.getEffectiveWeaponAttackBonus(weapon, baseAttack)
                  const damageBonus = character.getEffectiveWeaponDamageBonus(weapon, character.getEffectiveAttributeModifier(attribute))
                  return (
                    <CompactWeaponTile
                      key={`${weapon.id}-${index}`}
                      character={character}
                      weapon={weapon}
                      attack={attack}
                      damageBonus={damageBonus}
                      updateCharacter={updateCharacter}
                      onClick={() => setHandDialog({ itemId: weapon.id })}
                    />
                  )
                })
              ) : (
                <CompactUnarmedTile character={character} />
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-textMuted">Magias</div>
            <div className="grid grid-cols-3 gap-2">
              {(["int", "wis", "cha"] as Attribute[]).map((attribute) => {
                const modifier = character.getEffectiveAttributeModifier(attribute)
                return (
                  <div key={attribute} className="rounded-lg border border-border bg-bg-subtle px-2 py-2 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">{attributeShort(attribute)}</div>
                    <div className="mt-1 flex items-baseline justify-center gap-2">
                      <span className="text-sm font-bold text-textH">{formatSigned(character.getEffectiveSpellAttackBonus(attribute, modifier + proficiency))}</span>
                      <span className="text-[10px] text-textMuted">CD</span>
                      <span className="text-sm font-bold text-textH">{character.getEffectiveSpellSaveDc(attribute, 8 + modifier + proficiency)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {ATTRIBUTE_KEYS.map((attribute) => (
            <span key={attribute} className="rounded-full border border-border bg-bg px-2 py-1 text-[10px] text-text">
              CD {attributeShort(attribute)}{" "}
              {character.getEffectiveAbilitySaveDc(attribute, 8 + character.getEffectiveAttributeModifier(attribute) + proficiency)}
            </span>
          ))}
        </div>
      </CompactSection>

      <CompactSection title="Perícias">
        <Input value={skillQuery} placeholder="Buscar perícia pelo nome" aria-label="Buscar perícia pelo nome" onChange={(event) => setSkillQuery(event.target.value)} />
        {normalizedSkillQuery ? (
          matchingSkills.length ? (
            <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {matchingSkills.map((skill) => (
                <SelectSkillModule key={skill.key} character={character} updateCharacter={updateCharacter} skillKey={skill.key} label={skill.label} ability={skill.ability} profBonus={proficiency} />
              ))}
            </div>
          ) : <p className="mt-2 text-xs text-textMuted">Nenhuma perícia corresponde à busca.</p>
        ) : <p className="mt-2 text-xs text-textMuted">Digite para localizar uma perícia.</p>}
      </CompactSection>

      <MinimalCharacterActions character={character} updateCharacter={updateCharacter} />
      <HandItemActionsDialog character={character} state={handDialog} onClose={() => setHandDialog(null)} />
    </div>
  )
}

function CompactSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-bg p-3 shadow-theme-sm"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textH">{title}</h2>{children}</section>
}

function CompactNumberField({ label, value, onChange, min, max, signed = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; signed?: boolean }) {
  return (
    <label className="grid min-w-0 gap-1 rounded-lg border border-border bg-bg-subtle p-2 text-center">
      <span className="truncate text-[10px] uppercase tracking-wide text-textMuted">{label}</span>
      <Input type="number" inputMode="decimal" min={min} max={max} className="h-8 min-w-0 px-1 text-center text-sm font-bold" value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
      {signed ? <span className="sr-only">Valor atual {formatSigned(value)}</span> : null}
    </label>
  )
}

function ReadOnlyStat({ label, value }: { label: string; value: string }) {
  return <div className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-accentBorder bg-accentBg px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-textMuted">{label}</div><div className="mt-1 text-lg font-bold text-textH">{value}</div></div>
}

function CompactWeaponTile({
  character,
  weapon,
  attack,
  damageBonus,
  updateCharacter,
  onClick,
}: {
  character: CharacterTemplate
  weapon: Weapon
  attack: number
  damageBonus: number
  updateCharacter: Props["updateCharacter"]
  onClick: () => void
}) {
  const die = getWeaponDamageDie(weapon) ?? weapon.damage
  const damage = `${die.quantity}${die.sides}${damageBonus !== 0 ? ` ${formatSigned(damageBonus)}` : ""}`
  const hands = weapon.wieldedTwoHanded ? 2 : 1
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg-subtle px-2 py-2 text-center transition-colors hover:border-accentBorder">
      <button
        type="button"
        title="Abrir opções de empunhadura, guardar ou largar"
        onClick={onClick}
        className="w-full min-w-0 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex min-w-0 items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-textMuted"><span className="truncate">{weapon.name || "Arma"}{isWeaponImprovisedGrip(weapon) ? " · imp." : ""}</span><span className="shrink-0 rounded-full border border-accentBorder bg-accentBg px-1 py-0.5 text-[9px] font-semibold text-accent">{hands}M</span></div>
        <div className="mt-1 text-lg font-bold text-textH">{formatSigned(attack)}</div>
        <div className="text-[10px] font-medium text-textMuted">{damage}</div>
      </button>
      <WeaponAmmunitionQuickControl
        character={character}
        weapon={weapon}
        updateCharacter={updateCharacter}
      />
    </div>
  )
}

function CompactUnarmedTile({ character }: { character: CharacterTemplate }) {
  const profile = getUnarmedAttackProfile(character)
  return <div className="min-w-0 rounded-lg border border-border bg-bg-subtle px-2 py-2 text-center"><div className="truncate text-[10px] uppercase tracking-wide text-textMuted">Ataque desarmado{profile.monkLevel > 0 ? ` · M${profile.monkLevel}` : ""}</div><div className="mt-1 text-lg font-bold text-textH">{formatSigned(profile.attack)}</div><div className="text-[10px] font-medium text-textMuted">{formatUnarmedDamage(profile)}</div></div>
}

function DerivedTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-bg-subtle px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-textMuted">{label}</div><div className="mt-1 text-lg font-bold text-textH">{value}</div></div>
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()
}