import type { Itemmable } from "./item"

export function getAmmunitionKey(item: Pick<Itemmable, "id" | "kind" | "name" | "desc" | "compendiumItemId">): string | null {
  if (item.kind !== "ammunition") return null
  const compendiumId = item.compendiumItemId?.trim()
  if (compendiumId) return `compendium:${compendiumId}`
  return `custom:${normalize(item.name)}:${normalize(item.desc)}`
}

export function getAmmunitionQuantity(
  inventory: Itemmable[],
  ammunitionKey: string | undefined,
): number {
  if (!ammunitionKey) return 0
  return inventory.reduce((total, item) =>
    getAmmunitionKey(item) === ammunitionKey
      ? total + Math.max(0, Math.trunc(Number(item.quantity) || 0))
      : total,
  0)
}

export function getAmmunitionRepresentative(
  inventory: Itemmable[],
  ammunitionKey: string | undefined,
): Itemmable | undefined {
  if (!ammunitionKey) return undefined
  return inventory.find((item) =>
    getAmmunitionKey(item) === ammunitionKey && Number(item.quantity) > 0,
  )
}

export function groupAmmunitionInventory(inventory: Itemmable[]): Array<{
  key: string
  item: Itemmable
  quantity: number
}> {
  const groups = new Map<string, { item: Itemmable; quantity: number }>()
  for (const item of inventory) {
    const key = getAmmunitionKey(item)
    if (!key) continue
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0))
    if (!quantity) continue
    const current = groups.get(key)
    if (current) current.quantity += quantity
    else groups.set(key, { item, quantity })
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => left.item.name.localeCompare(right.item.name, "pt-BR"))
}

function normalize(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}
