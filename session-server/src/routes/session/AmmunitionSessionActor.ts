import { CharacterTemplate, type CharacterTemplateProps } from "../../../../src/models/characters/CharacterTemplate";
import { getAmmunitionKey } from "../../../../src/models/items/Ammunition";
import { hasWeaponProperty, type Weapon } from "../../../../src/models/items/equipment/Weapon";
import type { Itemmable } from "../../../../src/models/items/item";
import type { SessionAbilityState } from "../characters/abilities/abilityProtocol";
import { MAX_CHARACTER_STATE_LOG_RECORDS } from "../characters/sheet/characterState";
import { parseInventoryClientMessage } from "../characters/inventory/inventoryProtocol";
import { SessionActor as CreatureDropSessionActor } from "./CreatureDropSessionActor";
import type { SessionConditionsState, SessionConnection, SessionHpState } from "./protocol";
import {
  SHARED_INVENTORY_SCOPE,
  characterScope,
  commitSessionMutation,
  createSessionLogRecord,
  readSessionLog,
} from "./sessionLog";
import { broadcastVisibilityFiltered } from "./visibilityDelivery";

const ABILITIES_STATE_KEY = "abilities-state";
const HP_STATE_KEY = "hp-state";
const CONDITIONS_STATE_KEY = "conditions-state";
const INVENTORY_STATE_KEY = "inventory-state";

type SharedInventoryState = {
  initialized: boolean;
  revision: number;
  partyInventory: Itemmable[];
  groundInventory: Itemmable[];
  carryCapacity?: number;
  additionalSupplyConsumption?: number;
  supplyConsumers?: Array<{ characterId: string; name: string }>;
  supplyPerLongRest?: number;
};

type CapabilityAwareConnection = SessionConnection & {
  canWriteAnyCharacter?: boolean;
};

export class SessionActor extends CreatureDropSessionActor {
  override async webSocketMessage(
    webSocket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const raw = typeof message === "string"
      ? message
      : new TextDecoder().decode(message);
    const parsed = parseInventoryClientMessage(raw);

    if (
      !parsed ||
      parsed.type !== "session.inventory.operation" ||
      parsed.operation.type !== "character.ammunition.spend"
    ) {
      await super.webSocketMessage(webSocket, message);
      return;
    }

    const connection = readConnection(webSocket);
    if (!connection) {
      webSocket.close(1011, "Missing connection attachment");
      return;
    }

    const operation = parsed.operation;
    const [abilities, hp, conditions, inventory, log] = await Promise.all([
      this.ctx.storage.get<Record<string, SessionAbilityState>>(ABILITIES_STATE_KEY).then((value) => value ?? {}),
      this.ctx.storage.get<Record<string, SessionHpState>>(HP_STATE_KEY).then((value) => value ?? {}),
      this.ctx.storage.get<Record<string, SessionConditionsState>>(CONDITIONS_STATE_KEY).then((value) => value ?? {}),
      this.ctx.storage.get<SharedInventoryState>(INVENTORY_STATE_KEY).then((value) => value ?? {
        initialized: false,
        revision: 0,
        partyInventory: [],
        groundInventory: [],
      }),
      readSessionLog(this.ctx.storage),
    ]);

    if (!inventory.initialized) {
      return sendError(webSocket, "INVENTORY_STATE_NOT_INITIALIZED", "Inventory state has not been initialized by the MASTER.");
    }

    const abilityState = abilities[operation.characterId];
    const hpState = hp[operation.characterId];
    const conditionsState = conditions[operation.characterId];
    if (!abilityState?.initialized || !hpState || !conditionsState?.initialized) {
      return sendError(webSocket, "INVENTORY_CHARACTER_NOT_INITIALIZED", "The character is not initialized for inventory operations.");
    }

    if (!canWriteCharacter(connection, hpState)) {
      return sendError(webSocket, "CHARACTER_ACCESS_DENIED", "You cannot spend ammunition for this character.");
    }

    const character = CharacterTemplate.fromJSON(
      abilityState.character as Partial<CharacterTemplateProps>,
    );
    const weapon = character.get("equipment").weapons.find(
      (candidate) => candidate.id === operation.weaponId,
    ) as Weapon | undefined;
    if (!weapon || !hasWeaponProperty(weapon, "ammunition")) {
      return sendError(webSocket, "AMMUNITION_WEAPON_INVALID", "The selected weapon does not use ammunition.");
    }

    const compatible = new Set(weapon.compatibleAmmunitionKeys ?? []);
    if (
      !compatible.has(operation.ammunitionKey) ||
      weapon.selectedAmmunitionKey !== operation.ammunitionKey
    ) {
      return sendError(webSocket, "AMMUNITION_SELECTION_INVALID", "The ammunition is not the active compatible ammunition for this weapon.");
    }

    const currentInventory = character.get("inventory") ?? [];
    const available = currentInventory.reduce((total, item) =>
      getAmmunitionKey(item) === operation.ammunitionKey
        ? total + Math.max(0, Math.trunc(Number(item.quantity) || 0))
        : total,
    0);
    if (available < operation.quantity) {
      return sendError(webSocket, "AMMUNITION_INSUFFICIENT", "There is not enough selected ammunition in the character inventory.");
    }

    const beforeAbility = structuredClone(abilityState);
    const beforeHp = structuredClone(hpState);
    const beforeConditions = structuredClone(conditionsState);
    const beforeInventory = structuredClone(inventory);

    let remaining = operation.quantity;
    let actualName = operation.ammunitionName;
    const nextCharacterInventory: Itemmable[] = [];
    const spent: Itemmable[] = [];

    for (const item of currentInventory) {
      if (remaining <= 0 || getAmmunitionKey(item) !== operation.ammunitionKey) {
        nextCharacterInventory.push(item);
        continue;
      }

      const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
      const taken = Math.min(quantity, remaining);
      if (taken <= 0) {
        nextCharacterInventory.push(item);
        continue;
      }

      actualName = item.name || actualName;
      remaining -= taken;
      if (taken < quantity) {
        nextCharacterInventory.push({ ...item, quantity: quantity - taken });
      }
      spent.push({
        ...item,
        id: crypto.randomUUID(),
        quantity: taken,
        heldHands: undefined,
        insideBagOfHolding: false,
      });
    }

    const nextCharacter = character.with("inventory", nextCharacterInventory);
    abilities[operation.characterId] = {
      ...abilityState,
      character: nextCharacter.toJSON() as unknown as Record<string, unknown>,
      revision: abilityState.revision + 1,
    };
    inventory.groundInventory.push(...spent);
    inventory.revision += 1;

    const affectedScopes = [
      characterScope(operation.characterId),
      SHARED_INVENTORY_SCOPE,
    ];
    const record = createSessionLogRecord({
      actorId: connection.userId,
      operation: {
        ...operation,
        ammunitionName: actualName,
      },
      affectedScopes,
      reverseOperation: {
        type: "session.inventory.restore",
        characterId: operation.characterId,
        affectedScopes,
        snapshot: {
          abilities: { [operation.characterId]: beforeAbility },
          hp: { [operation.characterId]: beforeHp },
          conditions: { [operation.characterId]: beforeConditions },
          inventory: beforeInventory,
        },
      },
    });

    await commitSessionMutation(this.ctx.storage, this.ctx.getWebSockets(), {
      writes: {
        [ABILITIES_STATE_KEY]: abilities,
        [INVENTORY_STATE_KEY]: inventory,
      },
      record,
      currentLog: log,
      maxRecords: MAX_CHARACTER_STATE_LOG_RECORDS,
    });

    broadcastVisibilityFiltered(this.ctx.getWebSockets(), {
      type: "session.abilities.updated",
      character: abilities[operation.characterId],
    });
    broadcast(this.ctx.getWebSockets(), {
      type: "session.inventory.updated",
      state: inventory,
    });
  }
}

function canWriteCharacter(
  connection: CapabilityAwareConnection,
  hp: SessionHpState,
): boolean {
  return connection.role === "MASTER" ||
    connection.canWriteAnyCharacter === true ||
    hp.ownerUserId === connection.userId;
}

function readConnection(webSocket: WebSocket): CapabilityAwareConnection | null {
  try {
    return webSocket.deserializeAttachment() as CapabilityAwareConnection;
  } catch {
    return null;
  }
}

function sendError(webSocket: WebSocket, code: string, message: string): void {
  try {
    webSocket.send(JSON.stringify({ type: "session.error", code, message }));
  } catch {}
}

function broadcast(sockets: WebSocket[], payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const socket of sockets) {
    try { socket.send(encoded); } catch {}
  }
}
