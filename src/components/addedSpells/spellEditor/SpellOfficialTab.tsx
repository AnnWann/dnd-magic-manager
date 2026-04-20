import type { AddedSpell, Character, DndSpell, SpellTranslation } from '../../../types'
import { SpellOfficialHomebrewPanel } from './SpellOfficialHomebrewPanel'
import { SpellOfficialApiPanel } from './SpellOfficialApiPanel'

type TranslateStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; spellIndex: string }
  | { kind: 'error'; spellIndex: string; message: string }

export function SpellOfficialTab(props: {
  activeCharacter: Character
  entry: AddedSpell
  detail: DndSpell | undefined
  openHomebrewEditSpellIndex: string | null
  setOpenHomebrewEditSpellIndex: React.Dispatch<React.SetStateAction<string | null>>
  updateCharacter: (characterId: string, updater: (c: Character) => Character) => void

  translateStatus: TranslateStatus
  translateOfficialToPt: (args: { spellIndex: string; desc: string[]; higher: string[]; material?: string }) => Promise<void>
  spellTranslations: Record<string, SpellTranslation>
}) {
  const {
    activeCharacter,
    entry,
    detail,
    openHomebrewEditSpellIndex,
    setOpenHomebrewEditSpellIndex,
    updateCharacter,
    translateStatus,
    translateOfficialToPt,
    spellTranslations,
  } = props

  if (entry.homebrew) {
    return (
      <SpellOfficialHomebrewPanel
        activeCharacter={activeCharacter}
        entry={entry}
        openHomebrewEditSpellIndex={openHomebrewEditSpellIndex}
        setOpenHomebrewEditSpellIndex={setOpenHomebrewEditSpellIndex}
        updateCharacter={updateCharacter}
      />
    )
  }

  return (
    <SpellOfficialApiPanel
      entry={entry}
      detail={detail}
      translateStatus={translateStatus}
      translateOfficialToPt={translateOfficialToPt}
      spellTranslations={spellTranslations}
    />
  )
}
