import type { Ability, AddedSpell, Character, HomebrewSpellMechanic, MagicCircleLevel } from '../../../types'
import { magicCircleOptions } from '../../../lib/rules'
import { apiClassLabel, SCHOOL_NAME_PT, schoolLabel } from '../../../lib/spellLabels'
import { useI18n } from '../../../i18n/I18nContext'
import { InlineMarkdown } from '../../InlineMarkdown'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { Textarea } from '../../ui/Textarea'
import { ABILITY_KEYS } from '../abilityKeys'

export function SpellOfficialHomebrewPanel(props: {
  activeCharacter: Character
  entry: AddedSpell
  openHomebrewEditSpellIndex: string | null
  setOpenHomebrewEditSpellIndex: React.Dispatch<React.SetStateAction<string | null>>
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void
}) {
  const { t, abilityShort } = useI18n()
  const { activeCharacter, entry, openHomebrewEditSpellIndex, setOpenHomebrewEditSpellIndex, updateCharacter } = props

  if (!entry.homebrew) return null

  const hb = entry.homebrew
  const isEditing = openHomebrewEditSpellIndex === entry.spellIndex
  const mechanic = (hb.mechanic ?? 'none') as HomebrewSpellMechanic
  const needsSaveAbility = mechanic === 'save' || mechanic === 'both'
  const baseClasses = Array.isArray(hb.classes) ? hb.classes : []
  const comps = Array.isArray(hb.components) ? hb.components : ([] as Array<'V' | 'S' | 'M'>)
  const compSet = new Set(comps)

  const setHb = (next: typeof hb, opts?: { syncName?: boolean; syncLevel?: boolean }) => {
    updateCharacter(activeCharacter.id, (c) => ({
      ...c,
      spells: c.spells.map((s) => {
        if (s.spellIndex !== entry.spellIndex) return s
        return {
          ...s,
          spellName: opts?.syncName ? next.name : s.spellName,
          castSlotLevel: opts?.syncLevel ? next.level : s.castSlotLevel,
          homebrew: next,
        }
      }),
    }))
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-textH">Homebrew</div>
          <div className="mt-1 text-xs text-text">
            {isEditing ? 'Editando este homebrew.' : 'Você pode editar este homebrew aqui.'}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setOpenHomebrewEditSpellIndex((prev) => (prev === entry.spellIndex ? null : entry.spellIndex))
          }
        >
          {isEditing ? 'Fechar edição' : 'Editar'}
        </Button>
      </div>

      {!isEditing ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-bg p-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] text-text">Nome</div>
              <div className="mt-1 text-sm font-medium text-textH break-words">{hb.name}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Nível</div>
              <div className="mt-1 text-sm text-textH">{hb.level}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Escola</div>
              <div className="mt-1 text-sm text-textH">{schoolLabel(hb.school)}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">{t('spell.ritual')}</div>
              <div className="mt-1 text-sm text-textH">{hb.ritual ? t('spell.ritual') : '—'}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Componentes</div>
              <div className="mt-1 text-sm text-textH">
                {(() => {
                  const base = (['V', 'S', 'M'] as const).filter((c) => compSet.has(c))
                  if (!base.length && !hb.material?.trim()) return '—'
                  const parts: string[] = [...base]
                  const mat = hb.material?.trim()
                  if (mat) parts.push(`M (${mat})`)
                  return parts.join(', ')
                })()}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-text">Alcance</div>
              <div className="mt-1 text-sm text-textH">{hb.range?.trim() || '—'}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Área</div>
              <div className="mt-1 text-sm text-textH">{hb.area?.trim() || '—'}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Duração</div>
              <div className="mt-1 text-sm text-textH">
                {hb.duration?.trim() || '—'}
                {hb.concentration ? ' (Concentração)' : ''}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-text">Dano (base)</div>
              <div className="mt-1 text-sm text-textH">{hb.damageDice?.trim() || '—'}</div>
            </div>

            <div>
              <div className="text-[11px] text-text">Mecânica</div>
              <div className="mt-1 text-sm text-textH">
                {mechanic === 'attack'
                  ? 'Ataque'
                  : mechanic === 'save'
                    ? 'Teste de resistência'
                    : mechanic === 'both'
                      ? 'Ataque + Teste'
                      : 'Nenhuma'}
                {needsSaveAbility ? ` (${abilityShort(hb.saveAbility ?? 'dex')})` : ''}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold text-textH">Descrição</div>
            <div className="mt-2 space-y-2 text-sm text-text break-words">
              {(hb.desc?.trim() ? [hb.desc.trim()] : []).map((p, i) => (
                <p key={i}>
                  <InlineMarkdown text={p} />
                </p>
              ))}
              {!hb.desc?.trim() ? <div className="text-xs text-text">—</div> : null}
            </div>
          </div>

          {hb.higherLevel?.trim() ? (
            <div className="mt-3 rounded-lg border border-border bg-bg p-3">
              <div className="text-xs font-semibold text-textH">Em níveis superiores</div>
              <div className="mt-2 space-y-2 text-sm text-text break-words">
                <p>
                  <InlineMarkdown text={hb.higherLevel.trim()} />
                </p>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-bg p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs text-text">Nome</label>
              <Input
                className="mt-1"
                value={hb.name}
                onChange={(e) => {
                  const name = e.target.value
                  setHb({ ...hb, name }, { syncName: true })
                }}
              />
            </div>

            <div>
              <label className="text-xs text-text">Nível</label>
              <Select
                className="mt-1"
                value={hb.level}
                onChange={(e) => {
                  const level = Number(e.target.value) as MagicCircleLevel
                  setHb({ ...hb, level }, { syncLevel: true })
                }}
              >
                {magicCircleOptions().map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs text-text">Escola</label>
              <Select className="mt-1" value={hb.school} onChange={(e) => setHb({ ...hb, school: e.target.value })}>
                {Object.keys(SCHOOL_NAME_PT)
                  .sort((a, b) => schoolLabel(a).localeCompare(schoolLabel(b), 'pt-BR'))
                  .map((k) => (
                    <option key={k} value={k}>
                      {schoolLabel(k)}
                    </option>
                  ))}
              </Select>
            </div>

            <div>
              <label className="text-xs text-text">{t('spell.ritual')}</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(hb.ritual)}
                  onChange={(e) => setHb({ ...hb, ritual: e.target.checked || undefined })}
                />
                <span className="text-xs text-text">Pode ser conjurada como ritual</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <label className="text-xs text-text">Alcance</label>
              <Input
                className="mt-1"
                value={hb.range ?? ''}
                onChange={(e) => setHb({ ...hb, range: e.target.value || undefined })}
                placeholder="ex: 18 m / Toque / Pessoal"
              />
            </div>
            <div>
              <label className="text-xs text-text">Área</label>
              <Input
                className="mt-1"
                value={hb.area ?? ''}
                onChange={(e) => setHb({ ...hb, area: e.target.value || undefined })}
                placeholder="ex: Cone 4,5 m"
              />
            </div>
            <div>
              <label className="text-xs text-text">Duração</label>
              <Input
                className="mt-1"
                value={hb.duration ?? ''}
                onChange={(e) => setHb({ ...hb, duration: e.target.value || undefined })}
                placeholder="ex: 1 minuto"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(hb.concentration)}
                  onChange={(e) => setHb({ ...hb, concentration: e.target.checked || undefined })}
                />
                <span className="text-xs text-text">Concentração</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-text">Componentes</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {(['V', 'S', 'M'] as const).map((comp) => {
                const checked = compSet.has(comp)
                return (
                  <label key={comp} className="flex items-center gap-2 text-xs text-text">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextChecked = e.target.checked
                        const nextSet = new Set(compSet)
                        if (nextChecked) nextSet.add(comp)
                        else nextSet.delete(comp)
                        const components = Array.from(nextSet) as Array<'V' | 'S' | 'M'>
                        const material = components.includes('M') ? hb.material : undefined
                        setHb({ ...hb, components: components.length ? components : undefined, material })
                      }}
                    />
                    <span>{comp}</span>
                  </label>
                )
              })}
            </div>

            {(hb.components ?? []).includes('M') ? (
              <div className="mt-2">
                <Input
                  className="mt-1"
                  value={hb.material ?? ''}
                  onChange={(e) => setHb({ ...hb, material: e.target.value || undefined })}
                  placeholder="Material (opcional)"
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs text-text">Dano (base)</label>
              <Input
                className="mt-1"
                value={hb.damageDice ?? ''}
                onChange={(e) => setHb({ ...hb, damageDice: e.target.value || undefined })}
                placeholder="ex: 2d6+3"
              />
            </div>
            <div>
              <label className="text-xs text-text">Mecânica</label>
              <Select
                className="mt-1"
                value={mechanic}
                onChange={(e) => {
                  const nextMechanic = e.target.value as HomebrewSpellMechanic
                  setHb({
                    ...hb,
                    mechanic: nextMechanic,
                    saveAbility:
                      nextMechanic === 'save' || nextMechanic === 'both' ? hb.saveAbility ?? 'dex' : undefined,
                  })
                }}
              >
                <option value="none">Nenhuma</option>
                <option value="attack">Ataque</option>
                <option value="save">Teste de resistência</option>
                <option value="both">Ataque + Teste</option>
              </Select>

              {needsSaveAbility ? (
                <div className="mt-2">
                  <label className="text-xs text-text">Resistência (atributo)</label>
                  <Select
                    className="mt-1"
                    value={hb.saveAbility ?? 'dex'}
                    onChange={(e) => setHb({ ...hb, saveAbility: e.target.value as Ability })}
                  >
                    {ABILITY_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {abilityShort(key)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <label className="text-xs text-text">Classes base</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {(
                [
                  'artificer',
                  'barbarian',
                  'bard',
                  'cleric',
                  'druid',
                  'fighter',
                  'monk',
                  'paladin',
                  'ranger',
                  'rogue',
                  'sorcerer',
                  'warlock',
                  'wizard',
                ] as const
              ).map((idx) => {
                const checked = baseClasses.includes(idx)
                const label = apiClassLabel({ index: idx, name: idx, url: '' })
                return (
                  <label key={idx} className="flex items-center gap-2 text-xs text-text">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const set = new Set(baseClasses)
                        if (e.target.checked) set.add(idx)
                        else set.delete(idx)
                        const classes = Array.from(set).sort()
                        setHb({ ...hb, classes: classes.length ? classes : undefined })
                      }}
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-text">Descrição</label>
            <Textarea
              className="mt-1"
              value={hb.desc ?? ''}
              onChange={(e) => setHb({ ...hb, desc: e.target.value || undefined })}
              placeholder="Opcional. Texto livre."
            />
          </div>

          <div>
            <label className="text-xs text-text">Em níveis superiores</label>
            <Textarea
              className="mt-1"
              value={hb.higherLevel ?? ''}
              onChange={(e) => setHb({ ...hb, higherLevel: e.target.value || undefined })}
              placeholder="Opcional."
            />
          </div>
        </div>
      )}
    </div>
  )
}
