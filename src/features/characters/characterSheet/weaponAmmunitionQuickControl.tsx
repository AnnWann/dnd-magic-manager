import { ChevronDown, Minus, Settings2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "../../../components/ui/Button"
import { Input } from "../../../components/ui/Input"
import { Modal } from "../../../components/ui/Modal"
import type { CharacterTemplate } from "../../../models/characters/CharacterTemplate"
import {
  getAmmunitionQuantity,
  getAmmunitionRepresentative,
  groupAmmunitionInventory,
} from "../../../models/items/Ammunition"
import {
  hasWeaponProperty,
  type Weapon,
} from "../../../models/items/equipment/Weapon"
import { useOptionalSessionRuntime } from "../../session-runtime/useSessionRuntime"

export function WeaponAmmunitionQuickControl({
  character,
  weapon,
  updateCharacter,
}: {
  character: CharacterTemplate
  weapon: Weapon
  updateCharacter: (
    characterId: string,
    updater: (character: CharacterTemplate) => CharacterTemplate,
  ) => void
}) {
  const runtime = useOptionalSessionRuntime()
  const inventory = character.get("inventory") ?? []
  const ammunitionGroups = useMemo(
    () => groupAmmunitionInventory(inventory),
    [inventory],
  )
  const [open, setOpen] = useState(false)
  const [draftCompatible, setDraftCompatible] = useState<string[]>([])
  const [draftSelected, setDraftSelected] = useState<string>("")
  const [spendQuantity, setSpendQuantity] = useState(1)

  const compatibleKeys = weapon.compatibleAmmunitionKeys ?? []
  const selectedKey = weapon.selectedAmmunitionKey
  const activeItem = getAmmunitionRepresentative(inventory, selectedKey)
  const activeQuantity = getAmmunitionQuantity(inventory, selectedKey)

  useEffect(() => {
    if (!open) return
    setDraftCompatible([...compatibleKeys])
    setDraftSelected(
      selectedKey && compatibleKeys.includes(selectedKey)
        ? selectedKey
        : compatibleKeys.find((key) => getAmmunitionQuantity(inventory, key) > 0) ?? "",
    )
    setSpendQuantity(1)
  }, [open])

  if (!hasWeaponProperty(weapon, "ammunition")) return null

  function saveConfiguration() {
    const compatible = Array.from(new Set(draftCompatible))
    const selected = draftSelected && compatible.includes(draftSelected)
      ? draftSelected
      : compatible.find((key) => getAmmunitionQuantity(inventory, key) > 0)

    updateCharacter(character.get("id"), (current) => {
      const equipment = current.get("equipment")
      return current.with("equipment", {
        ...equipment,
        weapons: equipment.weapons.map((currentWeapon) =>
          currentWeapon.id === weapon.id
            ? {
                ...currentWeapon,
                compatibleAmmunitionKeys: compatible,
                selectedAmmunitionKey: selected,
              }
            : currentWeapon,
        ),
      })
    })
    setOpen(false)
  }

  function spend(quantity: number) {
    if (!runtime || !activeItem || !selectedKey || activeQuantity <= 0) return
    const requested = Math.max(1, Math.min(activeQuantity, Math.trunc(quantity) || 1))
    runtime.dispatchInventoryOperation({
      type: "character.ammunition.spend",
      characterId: character.get("id"),
      weaponId: weapon.id,
      ammunitionKey: selectedKey,
      ammunitionName: activeItem.name || "Munição",
      quantity: requested,
    })
  }

  function toggleCompatible(key: string, checked: boolean) {
    setDraftCompatible((current) => {
      const next = checked
        ? Array.from(new Set([...current, key]))
        : current.filter((entry) => entry !== key)
      if (!checked && draftSelected === key) {
        setDraftSelected(next[0] ?? "")
      } else if (checked && !draftSelected) {
        setDraftSelected(key)
      }
      return next
    })
  }

  return (
    <>
      <div className="mt-2 border-t border-border pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-[10px] font-medium text-text hover:bg-bg"
            title="Selecionar e configurar munições desta arma"
          >
            <span className="min-w-0 flex-1 truncate">
              {activeItem?.name || (compatibleKeys.length ? "Selecionar munição" : "Configurar munição")}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>

          <span
            className={activeQuantity > 0 ? "shrink-0 text-[10px] font-bold text-textH" : "shrink-0 text-[10px] font-bold text-danger"}
            title="Quantidade disponível"
          >
            {activeQuantity}
          </span>

          <button
            type="button"
            aria-label={`Gastar 1 ${activeItem?.name ?? "munição"}`}
            title={runtime ? "Gastar uma munição e enviá-la ao chão" : "Disponível durante uma sessão"}
            disabled={!runtime || !activeItem || activeQuantity <= 0}
            onClick={() => spend(1)}
            className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-accentBorder bg-accentBg text-accent transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
            <span className="sr-only">1</span>
          </button>

          <button
            type="button"
            aria-label="Configurar ou gastar várias munições"
            title="Configurar munições"
            onClick={() => setOpen(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-textMuted hover:border-borderStrong hover:text-textH"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeItem?.desc?.trim() ? (
          <div
            className="mt-1 truncate px-1.5 text-[9px] text-textMuted"
            title={activeItem.desc}
          >
            {activeItem.desc}
          </div>
        ) : null}
      </div>

      {open ? (
        <Modal
          title={`Munição — ${weapon.name || "Arma"}`}
          onClose={() => setOpen(false)}
          className="max-w-xl"
        >
          <div className="grid gap-4">
            <div>
              <div className="text-sm font-semibold text-textH">Munições compatíveis</div>
              <p className="mt-1 text-xs leading-5 text-textMuted">
                Marque os tipos que esta arma pode usar e escolha qual está ativa. A seleção fica salva nesta arma.
              </p>
            </div>

            {ammunitionGroups.length ? (
              <div className="grid gap-2">
                {ammunitionGroups.map((group) => {
                  const compatible = draftCompatible.includes(group.key)
                  const selected = draftSelected === group.key
                  return (
                    <article
                      key={group.key}
                      className="rounded-xl border border-border bg-bg-subtle p-3"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={compatible}
                          onChange={(event) => toggleCompatible(group.key, event.target.checked)}
                          aria-label={`${group.item.name}: compatível`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-sm font-semibold text-textH">
                              {group.item.name || "Munição"}
                            </div>
                            <div className="shrink-0 text-xs font-bold text-textH">
                              {group.quantity}
                            </div>
                          </div>
                          {group.item.desc?.trim() ? (
                            <p className="mt-1 text-xs leading-5 text-textMuted">
                              {group.item.desc}
                            </p>
                          ) : null}
                          <label className="mt-2 flex items-center gap-2 text-xs text-text">
                            <input
                              type="radio"
                              name={`active-ammunition-${weapon.id}`}
                              checked={selected}
                              disabled={!compatible}
                              onChange={() => setDraftSelected(group.key)}
                            />
                            Usar como munição ativa
                          </label>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-textMuted">
                Nenhum item do tipo Munição está no inventário deste personagem.
              </div>
            )}

            {runtime && activeItem && activeQuantity > 0 ? (
              <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1 text-xs text-text">
                  Gastar quantidade da munição ativa atual
                  <Input
                    type="number"
                    min={1}
                    max={activeQuantity}
                    inputMode="numeric"
                    value={spendQuantity}
                    onChange={(event) =>
                      setSpendQuantity(
                        Math.max(1, Math.min(activeQuantity, Math.trunc(Number(event.target.value) || 1))),
                      )
                    }
                  />
                </label>
                <Button
                  variant="secondary"
                  onClick={() => {
                    spend(spendQuantity)
                    setOpen(false)
                  }}
                >
                  Gastar {spendQuantity}
                </Button>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={saveConfiguration}>
                Salvar munições
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
