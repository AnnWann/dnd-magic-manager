import type { AddedSpell, Character } from '../../../types'
import { Textarea } from '../../ui/Textarea'

export function SpellHeadcanonTab(props: {
  activeCharacter: Character
  entry: AddedSpell
  updateCharacter: (id: string, updater: (c: Character) => Character) => void
}) {
  const { activeCharacter, entry, updateCharacter } = props

  return (
    <div>
      <div className="text-xs font-semibold text-textH">Descrição (Headcanon)</div>
      <div className="mt-1 text-xs text-text">Salva junto do personagem/sincronização.</div>
      <Textarea
        className="mt-2"
        value={entry.headcanon ?? ''}
        onChange={(e) => {
          const headcanon = e.target.value || undefined
          updateCharacter(activeCharacter.id, (c) => ({
            ...c,
            spells: c.spells.map((s) => (s.spellIndex === entry.spellIndex ? { ...s, headcanon } : s)),
          }))
        }}
        placeholder="Escreva aqui sua versão/descrição personalizada da magia…"
      />
    </div>
  )
}
