import type { EquipmentDestination } from "../../models/characters/characterEquipmentInteractions"
import type { EquippedItemReference } from "../../models/characters/characterEquippedItemMovement"
import type { TransferItemOperationRequest } from "../../models/game/GameOperation"
import type { Itemmable } from "../../models/items/item"

/**
 * Privacy-safe projection of a character that contributes to the shared
 * supply budget. Individual race/consumption details remain in the character
 * snapshot and are therefore visible only to clients that may read that
 * character. The aggregate consumption is authoritative for every client.
 */
export type SessionSupplyConsumerSummary = {
  characterId: string
  name: string
}

export type SessionSharedInventoryState = {
  initialized: boolean
  revision: number
  partyInventory: Itemmable[]
  groundInventory: Itemmable[]
  carryCapacity?: number
  additionalSupplyConsumption?: number
  /** Active session consumers, calculated from unfiltered authoritative state. */
  supplyConsumers?: SessionSupplyConsumerSummary[]
  /** Sum of character consumption only; additionalSupplyConsumption is separate. */
  supplyPerLongRest?: number
}

export type SessionInventoryOperation =
  | { type: "character.inventory.item.add"; characterId: string; item: Itemmable }
  | { type: "character.inventory.item.update"; characterId: string; itemId: string; item: Itemmable }
  | { type: "character.inventory.item.remove"; characterId: string; itemId: string }
  | { type: "character.inventory.item.consume"; characterId: string; itemId: string }
  | { type: "character.inventory.item.equip"; characterId: string; itemId: string; destination: EquipmentDestination }
  | { type: "character.inventory.bag.toggle"; characterId: string; itemId: string }
  | { type: "character.inventory.currenciesBag.set"; characterId: string; insideBagOfHolding: boolean }
  | { type: "character.inventory.attunement.toggle"; characterId: string; itemId: string }
  | { type: "character.ammunition.spend"; characterId: string; weaponId: string; ammunitionKey: string; ammunitionName: string; quantity: number }
  | { type: "inventory.item.transfer"; characterId: string; request: TransferItemOperationRequest }
  | { type: "party.item.add"; characterId: string; item: Itemmable }
  | { type: "party.item.update"; characterId: string; itemId: string; item: Itemmable }
  | { type: "party.item.remove"; characterId: string; itemId: string }
  | { type: "party.settings.carryCapacity.set"; characterId: "session"; value: number }
  | { type: "party.settings.additionalSupplyConsumption.set"; characterId: "session"; value: number }
  | { type: "ground.item.add"; characterId: string; item: Itemmable }
  | { type: "ground.item.update"; characterId: string; itemId: string; item: Itemmable }
  | { type: "ground.item.remove"; characterId: string; itemId: string }
  | { type: "character.equipment.move.ground"; characterId: string; reference: EquippedItemReference }

export type SessionInventoryClientMessage =
  | {
      type: "session.inventory.initialize"
      partyInventory: Itemmable[]
      groundInventory: Itemmable[]
      carryCapacity?: number
      additionalSupplyConsumption?: number
    }
  | { type: "session.inventory.operation"; operation: SessionInventoryOperation }

export type SessionInventoryServerMessage =
  | { type: "session.inventory.snapshot"; state: SessionSharedInventoryState }
  | { type: "session.inventory.updated"; state: SessionSharedInventoryState }
