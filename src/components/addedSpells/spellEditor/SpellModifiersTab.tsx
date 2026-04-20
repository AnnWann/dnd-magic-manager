import type {
  Ability,
  ActionEconomyKey,
  AddedSpell,
  Character,
  ConditionKey,
  SpellEffect,
  SpellEffectMode,
  SpellEffectTarget,
} from '../../../types'
import { useI18n } from '../../../i18n/I18nContext'
import { ABILITY_KEYS } from '../abilityKeys'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'

export function SpellModifiersTab(props: {
  activeCharacter: Character
  entry: AddedSpell
  updateCharacter: (id: string, updater: (c: Character) => Character) => void
}) {
  const { t, abilityShort } = useI18n()
  const { activeCharacter, entry, updateCharacter } = props

  const effectTargetOptions: Array<{ value: SpellEffectTarget; label: string }> = [
    { value: 'ac', label: 'CA' },
    { value: 'speed', label: 'Deslocamento' },
    { value: 'initiative', label: 'Iniciativa' },
    { value: 'attack', label: 'Ataque (ATQ)' },
    { value: 'save', label: 'Teste de resistência' },
    { value: 'ability', label: 'Atributo' },
    { value: 'condition', label: 'Condição' },
    { value: 'economy', label: 'Remover (ações)' },
    { value: 'forcedMove', label: t('effects.forcedMove') },
    { value: 'conditionalDamage', label: 'Dano condicional' },
    { value: 'saveOutcomeDamage', label: 'Resultado do TR' },
    { value: 'rollDice', label: 'Dado em rolagens' },
  ]

  const conditionOptions: Array<{ value: ConditionKey; label: string }> = [
    { value: 'blinded', label: 'Cegueira' },
    { value: 'deafened', label: 'Surdez' },
    { value: 'frightened', label: 'Amedrontado' },
    { value: 'poisoned', label: 'Envenenado' },
    { value: 'prone', label: 'Caído' },
    { value: 'restrained', label: 'Contido' },
    { value: 'stunned', label: 'Atordoado' },
    { value: 'paralyzed', label: 'Paralisado' },
    { value: 'charmed', label: 'Enfeitiçado' },
  ]

  const modeLabel = (m: SpellEffectMode) =>
    m === 'add'
      ? '+'
      : m === 'sub'
        ? '− (reduz)'
        : m === 'set'
          ? 'Definir'
          : m === 'adv'
            ? 'Vantagem'
            : m === 'dis'
              ? 'Desvantagem'
              : m === 'remove'
                ? 'Remover'
                : 'Aplicar'

  const modeOptionsForTarget = (t: SpellEffectTarget): SpellEffectMode[] => {
    if (t === 'forcedMove') return ['apply']
    if (t === 'condition') return ['apply']
    if (t === 'conditionalDamage') return ['apply']
    if (t === 'saveOutcomeDamage') return ['apply']
    if (t === 'rollDice') return ['apply']
    if (t === 'economy') return ['remove']
    if (t === 'ability') return ['add', 'sub', 'set']
    if (t === 'ac' || t === 'speed' || t === 'initiative') return ['add', 'sub', 'set']
    return ['add', 'sub', 'set', 'adv', 'dis']
  }

  return (
    <div>
      <div className="rounded-lg border border-border bg-bg p-3">
        <div className="text-xs font-semibold text-textH">Modificadores</div>
        <div className="mt-1 text-xs text-text">
          Defina efeitos estruturados para esta magia neste personagem (ex: CA +2, Condição: Cegueira).
        </div>

        <div className="mt-2 space-y-2">
          {(entry.effects ?? []).length ? (
            (entry.effects ?? []).map((eff, idx) => {
              const target = eff.target
              const modeChoices = modeOptionsForTarget(target)
              const needsValue =
                (eff.mode === 'add' || eff.mode === 'sub' || eff.mode === 'set') &&
                target !== 'conditionalDamage' &&
                target !== 'saveOutcomeDamage'
              const needsAbility = target === 'attack' || target === 'save' || target === 'ability'
              const needsCondition = target === 'condition'
              const needsEconomy = target === 'economy'
              const needsConditionalDamage = target === 'conditionalDamage'
              const needsSaveOutcomeDamage = target === 'saveOutcomeDamage'
              const needsRollDice = target === 'rollDice'
              const needsForcedMove = target === 'forcedMove'

              return (
                <div key={idx} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <div>
                    <label className="text-[11px] text-text">Afeta</label>
                    <Select
                      className="mt-1 h-9"
                      value={eff.target}
                      onChange={(e) => {
                        const nextTarget = e.target.value as SpellEffectTarget
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) => {
                            if (s.spellIndex !== entry.spellIndex) return s
                            const effects = [...(s.effects ?? [])]
                            const prev = effects[idx] ?? { target: 'ac', mode: 'add' }
                            const nextMode = modeOptionsForTarget(nextTarget).includes(prev.mode)
                              ? prev.mode
                              : modeOptionsForTarget(nextTarget)[0]
                            const prevSpeedUnit = prev.target === 'speed' ? (prev.unit ?? 'ft') : undefined
                            const prevSpeedValueMeters =
                              prev.target === 'speed' && typeof prev.value === 'number'
                                ? prevSpeedUnit === 'm'
                                  ? prev.value
                                  : prev.value * 0.3
                                : undefined
                            effects[idx] = {
                              ...prev,
                              target: nextTarget,
                              mode: nextMode,
                              ability:
                                nextTarget === 'attack' || nextTarget === 'save' || nextTarget === 'ability'
                                  ? (prev.ability ?? 'cha')
                                  : undefined,
                              unit: nextTarget === 'speed' || nextTarget === 'forcedMove' ? 'm' : undefined,
                              condition: nextTarget === 'condition' ? (prev.condition ?? 'blinded') : undefined,
                              economy: nextTarget === 'economy' ? (prev.economy ?? 'action') : undefined,
                              damageWhen: nextTarget === 'conditionalDamage' ? (prev.damageWhen ?? 'ao se mover') : undefined,
                              damageDice: nextTarget === 'conditionalDamage' ? (prev.damageDice ?? '1d6') : undefined,
                              saveOutcome: nextTarget === 'saveOutcomeDamage' ? (prev.saveOutcome ?? 'success') : undefined,
                              saveOutcomeText: nextTarget === 'saveOutcomeDamage' ? (prev.saveOutcomeText ?? '') : undefined,
                              saveDamageOp: nextTarget === 'saveOutcomeDamage' ? (prev.saveDamageOp ?? 'div') : undefined,
                              saveDamageValue:
                                nextTarget === 'saveOutcomeDamage'
                                  ? (typeof prev.saveDamageValue === 'number' ? prev.saveDamageValue : 2)
                                  : undefined,
                              rollDice: nextTarget === 'rollDice' ? (prev.rollDice ?? '1d4') : undefined,
                              rollAppliesTo: nextTarget === 'rollDice' ? (prev.rollAppliesTo ?? ['attack']) : undefined,
                              forcedMoveDirection:
                                nextTarget === 'forcedMove' ? (prev.forcedMoveDirection ?? 'any') : undefined,
                              forcedMoveReference:
                                nextTarget === 'forcedMove' ? (prev.forcedMoveReference ?? '') : undefined,
                              forcedMoveDirectionText:
                                nextTarget === 'forcedMove' ? (prev.forcedMoveDirectionText ?? '') : undefined,
                              value:
                                nextTarget === 'condition' ||
                                nextTarget === 'economy' ||
                                nextMode === 'adv' ||
                                nextMode === 'dis' ||
                                nextMode === 'apply' ||
                                nextMode === 'remove'
                                  ? nextTarget === 'forcedMove'
                                    ? typeof prev.value === 'number'
                                      ? prev.value
                                      : 3
                                    : undefined
                                  : nextTarget === 'speed'
                                    ? prevSpeedValueMeters ?? prev.value
                                    : prev.value,
                            }
                            return { ...s, effects }
                          }),
                        }))
                      }}
                    >
                      {effectTargetOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="text-[11px] text-text">Como</label>
                    <Select
                      className="mt-1 h-9"
                      value={eff.mode}
                      onChange={(e) => {
                        const mode = e.target.value as SpellEffectMode
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) => {
                            if (s.spellIndex !== entry.spellIndex) return s
                            const effects = [...(s.effects ?? [])]
                            const next = { ...effects[idx], mode }
                            if (mode === 'adv' || mode === 'dis' || mode === 'remove') {
                              next.value = undefined
                            }
                            if (mode === 'apply' && next.target !== 'forcedMove') {
                              next.value = undefined
                            }
                            effects[idx] = next
                            return { ...s, effects }
                          }),
                        }))
                      }}
                    >
                      {modeChoices.map((m) => (
                        <option key={m} value={m}>
                          {modeLabel(m)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {needsForcedMove ? (
                    <>
                      <div>
                        <div className="flex flex-col gap-2">
                          <div>
                            <label className="text-[11px] text-text">{t('effects.forcedMove.direction')}</label>
                            <Select
                              className="mt-1 h-9"
                              value={eff.forcedMoveDirection ?? 'any'}
                              onChange={(e) => {
                                const forcedMoveDirection =
                                  e.target.value as NonNullable<SpellEffect['forcedMoveDirection']>
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== entry.spellIndex) return s
                                    const effects = [...(s.effects ?? [])]
                                    effects[idx] = { ...effects[idx], forcedMoveDirection }
                                    return { ...s, effects }
                                  }),
                                }))
                              }}
                            >
                              <option value="any">{t('effects.forcedMove.direction.any')}</option>
                              <option value="towards">{t('effects.forcedMove.direction.towards')}</option>
                              <option value="away">{t('effects.forcedMove.direction.away')}</option>
                              <option value="direction">{t('effects.forcedMove.direction.direction')}</option>
                            </Select>
                          </div>

                          <div>
                            <label className="text-[11px] text-text">{t('effects.forcedMove.distance')}</label>
                            <div className="mt-1 flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-9 w-9 px-0"
                                title="Diminuir"
                                onClick={() => {
                                  const current =
                                    typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                  const next = Math.max(0, Math.round((current - 0.5) * 10) / 10)
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== entry.spellIndex) return s
                                      const effects = [...(s.effects ?? [])]
                                      effects[idx] = { ...effects[idx], value: next, unit: 'm' }
                                      return { ...s, effects }
                                    }),
                                  }))
                                }}
                              >
                                −
                              </Button>

                              <Input
                                className="h-9 !w-auto flex-1 min-w-0"
                                type="number"
                                inputMode="decimal"
                                value={typeof eff.value === 'number' ? String(eff.value) : ''}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const value = raw === '' ? undefined : Number(raw)
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== entry.spellIndex) return s
                                      const effects = [...(s.effects ?? [])]
                                      effects[idx] = { ...effects[idx], value, unit: 'm' }
                                      return { ...s, effects }
                                    }),
                                  }))
                                }}
                                min={0}
                                step={0.5}
                                placeholder="ex: 3"
                              />

                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-9 w-9 px-0"
                                title="Aumentar"
                                onClick={() => {
                                  const current =
                                    typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                                  const next = Math.max(0, Math.round((current + 0.5) * 10) / 10)
                                  updateCharacter(activeCharacter.id, (c) => ({
                                    ...c,
                                    spells: c.spells.map((s) => {
                                      if (s.spellIndex !== entry.spellIndex) return s
                                      const effects = [...(s.effects ?? [])]
                                      effects[idx] = { ...effects[idx], value: next, unit: 'm' }
                                      return { ...s, effects }
                                    }),
                                  }))
                                }}
                              >
                                +
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-text">
                          {(eff.forcedMoveDirection ?? 'any') === 'direction'
                            ? t('effects.forcedMove.directionText')
                            : t('effects.forcedMove.reference')}
                        </label>
                        <Input
                          className="mt-1 h-9"
                          disabled={(eff.forcedMoveDirection ?? 'any') === 'any'}
                          value={
                            (eff.forcedMoveDirection ?? 'any') === 'direction'
                              ? eff.forcedMoveDirectionText ?? ''
                              : eff.forcedMoveReference ?? ''
                          }
                          onChange={(e) => {
                            const v = e.target.value
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] =
                                  (eff.forcedMoveDirection ?? 'any') === 'direction'
                                    ? { ...effects[idx], forcedMoveDirectionText: v }
                                    : { ...effects[idx], forcedMoveReference: v }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder={
                            (eff.forcedMoveDirection ?? 'any') === 'direction'
                              ? t('effects.forcedMove.directionText.placeholder')
                              : t('effects.forcedMove.reference.placeholder')
                          }
                        />
                      </div>
                    </>
                  ) : null}

                  {needsAbility || needsCondition || needsEconomy ? (
                    <div>
                      <label className="text-[11px] text-text">
                        {needsEconomy ? 'Remover' : needsCondition ? 'Condição' : 'Atributo'}
                      </label>
                      <Select
                        className="mt-1 h-9"
                        value={
                          needsEconomy
                            ? eff.economy ?? 'action'
                            : needsCondition
                              ? eff.condition ?? 'blinded'
                              : eff.ability ?? 'cha'
                        }
                        onChange={(e) => {
                          const raw = e.target.value
                          updateCharacter(activeCharacter.id, (c) => ({
                            ...c,
                            spells: c.spells.map((s) => {
                              if (s.spellIndex !== entry.spellIndex) return s
                              const effects = [...(s.effects ?? [])]
                              effects[idx] = needsEconomy
                                ? { ...effects[idx], economy: raw as ActionEconomyKey }
                                : needsCondition
                                  ? { ...effects[idx], condition: raw as ConditionKey }
                                  : { ...effects[idx], ability: raw as Ability }
                              return { ...s, effects }
                            }),
                          }))
                        }}
                      >
                        {needsEconomy ? (
                          <>
                            <option value="action">Ação</option>
                            <option value="bonusAction">Ação bônus</option>
                            <option value="reaction">Reação</option>
                            <option value="movement">Movimento</option>
                            <option value="turn">Turno</option>
                          </>
                        ) : needsCondition ? (
                          conditionOptions.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))
                        ) : (
                          ABILITY_KEYS.map((a) => (
                            <option key={a} value={a}>
                              {abilityShort(a)}
                            </option>
                          ))
                        )}
                      </Select>
                    </div>
                  ) : null}

                  {needsSaveOutcomeDamage ? (
                    <>
                      <div>
                        <label className="text-[11px] text-text">Quando</label>
                        <Select
                          className="mt-1 h-9"
                          value={eff.saveOutcome ?? 'success'}
                          onChange={(e) => {
                            const saveOutcome =
                              e.target.value as NonNullable<SpellEffect['saveOutcome']>
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], saveOutcome }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                        >
                          <option value="success">TR passou</option>
                          <option value="failure">TR falhou</option>
                        </Select>
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Texto (opcional)</label>
                        <Input
                          className="mt-1 h-9"
                          value={eff.saveOutcomeText ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            const saveOutcomeText = raw
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], saveOutcomeText }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder="ex: metade do dano"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Ajuste</label>
                        <Select
                          className="mt-1 h-9"
                          value={eff.saveDamageOp ?? 'div'}
                          onChange={(e) => {
                            const saveDamageOp =
                              e.target.value as NonNullable<SpellEffect['saveDamageOp']>
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], saveDamageOp }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                        >
                          <option value="mul">× (multiplicar)</option>
                          <option value="div">÷ (dividir)</option>
                          <option value="add">+ (somar)</option>
                          <option value="sub">− (subtrair)</option>
                        </Select>
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Valor</label>
                        <Input
                          className="mt-1 h-9"
                          type="number"
                          inputMode="decimal"
                          value={typeof eff.saveDamageValue === 'number' ? String(eff.saveDamageValue) : ''}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const raw = e.target.value
                            const saveDamageValue = raw === '' ? undefined : Number(raw)
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], saveDamageValue }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          min={0}
                          step={0.5}
                          placeholder="ex: 2"
                        />
                      </div>
                    </>
                  ) : needsConditionalDamage ? (
                    <>
                      <div>
                        <label className="text-[11px] text-text">Quando</label>
                        <Input
                          className="mt-1 h-9"
                          value={eff.damageWhen ?? ''}
                          onChange={(e) => {
                            const damageWhen = e.target.value || undefined
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], damageWhen }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder="ex: ao se mover"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Dados (NdN)</label>
                        <Input
                          className="mt-1 h-9"
                          value={eff.damageDice ?? ''}
                          onChange={(e) => {
                            const damageDice = e.target.value || undefined
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], damageDice }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder="ex: 2d6"
                        />
                      </div>
                    </>
                  ) : needsRollDice ? (
                    <>
                      <div>
                        <label className="text-[11px] text-text">Aplica em</label>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-text">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={(eff.rollAppliesTo ?? []).includes('attack')}
                              onChange={(e) => {
                                const set = new Set(eff.rollAppliesTo ?? [])
                                if (e.target.checked) set.add('attack')
                                else set.delete('attack')
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== entry.spellIndex) return s
                                    const effects = [...(s.effects ?? [])]
                                    effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                    return { ...s, effects }
                                  }),
                                }))
                              }}
                            />
                            ATQ
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={(eff.rollAppliesTo ?? []).includes('save')}
                              onChange={(e) => {
                                const set = new Set(eff.rollAppliesTo ?? [])
                                if (e.target.checked) set.add('save')
                                else set.delete('save')
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== entry.spellIndex) return s
                                    const effects = [...(s.effects ?? [])]
                                    effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                    return { ...s, effects }
                                  }),
                                }))
                              }}
                            />
                            TR
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={(eff.rollAppliesTo ?? []).includes('skill')}
                              onChange={(e) => {
                                const set = new Set(eff.rollAppliesTo ?? [])
                                if (e.target.checked) set.add('skill')
                                else set.delete('skill')
                                updateCharacter(activeCharacter.id, (c) => ({
                                  ...c,
                                  spells: c.spells.map((s) => {
                                    if (s.spellIndex !== entry.spellIndex) return s
                                    const effects = [...(s.effects ?? [])]
                                    effects[idx] = { ...effects[idx], rollAppliesTo: Array.from(set) }
                                    return { ...s, effects }
                                  }),
                                }))
                              }}
                            />
                            Perícia
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-text">Dado (NdN)</label>
                        <Input
                          className="mt-1 h-9"
                          value={eff.rollDice ?? ''}
                          onChange={(e) => {
                            const rollDice = e.target.value || undefined
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = { ...effects[idx], rollDice }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder="ex: 1d4"
                        />
                      </div>
                    </>
                  ) : needsForcedMove ? null : (
                    <div>
                      <label className="text-[11px] text-text">
                        {target === 'speed' ? 'Valor (m)' : 'Valor'}
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-9 w-9 px-0"
                          title="Diminuir"
                          disabled={!needsValue}
                          onClick={() => {
                            if (!needsValue) return

                            const current = (() => {
                              if (target !== 'speed') {
                                return typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                              }
                              if (typeof eff.value !== 'number' || !Number.isFinite(eff.value)) return 0
                              const unit = eff.unit ?? 'ft'
                              const meters = unit === 'm' ? eff.value : eff.value * 0.3
                              return Math.round(meters * 10) / 10
                            })()

                            const next = Math.round((current - 1) * 10) / 10
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = {
                                  ...effects[idx],
                                  value: next,
                                  unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                        >
                          −
                        </Button>

                        <Input
                          className="h-9 !w-auto flex-1 min-w-0"
                          type="number"
                          inputMode="decimal"
                          disabled={!needsValue}
                          value={(() => {
                            if (!needsValue) return ''
                            if (target !== 'speed') return String(eff.value ?? '')
                            if (typeof eff.value !== 'number') return ''
                            const unit = eff.unit ?? 'ft'
                            const meters = unit === 'm' ? eff.value : eff.value * 0.3
                            const rounded = Math.round(meters * 10) / 10
                            return String(rounded)
                          })()}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const raw = e.target.value
                            const value = raw === '' ? undefined : Number(raw)
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = {
                                  ...effects[idx],
                                  value,
                                  unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                          placeholder={needsValue ? 'ex: 2' : '—'}
                        />

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-9 w-9 px-0"
                          title="Aumentar"
                          disabled={!needsValue}
                          onClick={() => {
                            if (!needsValue) return

                            const current = (() => {
                              if (target !== 'speed') {
                                return typeof eff.value === 'number' && Number.isFinite(eff.value) ? eff.value : 0
                              }
                              if (typeof eff.value !== 'number' || !Number.isFinite(eff.value)) return 0
                              const unit = eff.unit ?? 'ft'
                              const meters = unit === 'm' ? eff.value : eff.value * 0.3
                              return Math.round(meters * 10) / 10
                            })()

                            const next = Math.round((current + 1) * 10) / 10
                            updateCharacter(activeCharacter.id, (c) => ({
                              ...c,
                              spells: c.spells.map((s) => {
                                if (s.spellIndex !== entry.spellIndex) return s
                                const effects = [...(s.effects ?? [])]
                                effects[idx] = {
                                  ...effects[idx],
                                  value: next,
                                  unit: target === 'speed' ? 'm' : effects[idx]?.unit,
                                }
                                return { ...s, effects }
                              }),
                            }))
                          }}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        updateCharacter(activeCharacter.id, (c) => ({
                          ...c,
                          spells: c.spells.map((s) => {
                            if (s.spellIndex !== entry.spellIndex) return s
                            const effects = [...(s.effects ?? [])]
                            effects.splice(idx, 1)
                            return { ...s, effects: effects.length ? effects : undefined }
                          }),
                        }))
                      }}
                      title="Remover efeito"
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-xs text-text">Nenhum modificador definido.</div>
          )}
        </div>

        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              updateCharacter(activeCharacter.id, (c) => ({
                ...c,
                spells: c.spells.map((s) => {
                  if (s.spellIndex !== entry.spellIndex) return s
                  const next: SpellEffect = { target: 'ac', mode: 'add', value: 1 }
                  const effects = [...(s.effects ?? []), next]
                  return { ...s, effects }
                }),
              }))
            }}
          >
            Adicionar modificador
          </Button>
        </div>
      </div>
    </div>
  )
}
