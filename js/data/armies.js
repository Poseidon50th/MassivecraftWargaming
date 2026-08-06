import { UNIT_DEFS } from "../engine/constants.js";

export const ARMY_UNIT_TYPES = Object.freeze(Object.keys(UNIT_DEFS));
export const MAX_ARTILLERY = 2;

const SMALL_DEFAULT_ARMY = Object.freeze({
  sword: 4,
  spear: 3,
  axe: 3,
  cavalry: 3,
  musket: 2,
  artillery: 1,
});

export function armyLimitForSize(size) {
  return Number(size) === 16 ? 32 : 16;
}

export function defaultArmyForSize(size) {
  const multiplier = Number(size) === 16 ? 2 : 1;
  return Object.fromEntries(
    Object.entries(SMALL_DEFAULT_ARMY).map(([type, count]) => [type, count * multiplier]),
  );
}

export function normalizeArmy(army = {}) {
  return Object.fromEntries(
    ARMY_UNIT_TYPES.map((type) => [type, Number(army?.[type] ?? 0)]),
  );
}

export function armyTotal(army) {
  return ARMY_UNIT_TYPES.reduce((total, type) => total + Number(army?.[type] ?? 0), 0);
}

export function armyValidationError(army, size) {
  if (!army || typeof army !== "object" || Array.isArray(army)) return "Choose an army distribution.";
  const unknown = Object.keys(army).find((type) => !ARMY_UNIT_TYPES.includes(type));
  if (unknown) return "That army contains an unknown unit type.";
  for (const type of ARMY_UNIT_TYPES) {
    const count = army[type] ?? 0;
    if (!Number.isInteger(count) || count < 0) return "Every unit count must be a whole number of zero or more.";
  }
  const total = armyTotal(army);
  const limit = armyLimitForSize(size);
  if (total < 1) return "Choose at least one unit.";
  if (total > limit) return `An ${size} × ${size} army may contain at most ${limit} units.`;
  if ((army.artillery ?? 0) > MAX_ARTILLERY) return `An army may contain at most ${MAX_ARTILLERY} Artillery units.`;
  return null;
}

export function validatedArmy(army, size) {
  const normalized = normalizeArmy(army);
  const error = armyValidationError(normalized, size);
  if (error) throw new Error(error);
  return normalized;
}

export const DEFAULT_SMALL_ARMY = SMALL_DEFAULT_ARMY;
