import {
  ARMY_UNIT_TYPES,
  MAX_ARTILLERY,
  armyLimitForSize,
  armyTotal,
  normalizeArmy,
} from "../data/armies.js";

export const AI_ARMY_DOCTRINES = Object.freeze({
  corporal: Object.freeze({
    name: "Raiding column",
    summary: "Cavalry and Axes drive a fast, dangerous attack while Swords keep the column connected.",
    small: Object.freeze({ sword: 4, spear: 1, axe: 4, cavalry: 5, musket: 2, artillery: 0 }),
    preferredReplacements: Object.freeze(["cavalry", "axe", "sword", "musket", "spear", "artillery"]),
  }),
  captain: Object.freeze({
    name: "Balanced battle line",
    summary: "A direct mixed line with enough Cavalry and Muskets to exploit simple openings.",
    small: Object.freeze({ sword: 4, spear: 3, axe: 3, cavalry: 3, musket: 2, artillery: 1 }),
    preferredReplacements: Object.freeze(["sword", "cavalry", "axe", "spear", "musket", "artillery"]),
  }),
  general: Object.freeze({
    name: "Layered combined arms",
    summary: "Spears and Swords screen a supported striking line backed by Muskets and Artillery.",
    small: Object.freeze({ sword: 3, spear: 4, axe: 3, cavalry: 2, musket: 2, artillery: 2 }),
    preferredReplacements: Object.freeze(["spear", "sword", "musket", "axe", "cavalry", "artillery"]),
  }),
  codex: Object.freeze({
    name: "Adaptive Codex formation",
    summary: "A dense mutual-support core with mobile pressure, ranged reach, and a roster adapted to the field.",
    small: Object.freeze({ sword: 4, spear: 4, axe: 2, cavalry: 2, musket: 3, artillery: 1 }),
    preferredReplacements: Object.freeze(["spear", "sword", "musket", "cavalry", "axe", "artillery"]),
  }),
});

function terrainCounts(terrain = []) {
  const counts = {};
  for (const type of terrain.flat()) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

function scaleDoctrine(doctrine, size) {
  const multiplier = Number(size) === 16 ? 2 : 1;
  const army = Object.fromEntries(ARMY_UNIT_TYPES.map((type) => [type, doctrine.small[type] * multiplier]));
  const overflow = Math.max(0, army.artillery - MAX_ARTILLERY);
  army.artillery = Math.min(MAX_ARTILLERY, army.artillery);
  for (let index = 0; index < overflow; index += 1) {
    const type = doctrine.preferredReplacements[index % doctrine.preferredReplacements.length];
    army[type] += 1;
  }
  return army;
}

function transfer(army, fromTypes, toType, amount = 1) {
  for (let index = 0; index < amount; index += 1) {
    const source = fromTypes
      .filter((type) => type !== toType && army[type] > (type === "artillery" ? 0 : 1))
      .sort((left, right) => army[right] - army[left] || left.localeCompare(right))[0];
    if (!source) return;
    if (toType === "artillery" && army.artillery >= MAX_ARTILLERY) return;
    army[source] -= 1;
    army[toType] += 1;
  }
}

function adaptToField(army, difficultyId, terrain, opponentArmy) {
  const tiles = terrainCounts(terrain);
  const totalTiles = Math.max(1, terrain?.length ** 2);
  const deliberate = difficultyId === "codex" ? 2 : difficultyId === "general" ? 1 : 0;
  if (deliberate) {
    if (((tiles.hill ?? 0) + (tiles.river ?? 0) + (tiles.mud ?? 0)) / totalTiles > 0.09) {
      transfer(army, ["axe", "cavalry", "sword"], "musket", deliberate);
    }
    if (((tiles.wall ?? 0) + (tiles.fog ?? 0)) / totalTiles > 0.08) {
      transfer(army, ["artillery", "musket"], difficultyId === "codex" ? "sword" : "axe", 1);
    }
    if (((tiles.road ?? 0) + (tiles.bridge ?? 0)) / totalTiles > 0.07) {
      transfer(army, ["artillery", "spear"], "cavalry", 1);
    }
  }

  const enemy = normalizeArmy(opponentArmy);
  const enemyTotal = Math.max(1, armyTotal(enemy));
  const reactions = difficultyId === "codex" ? 2 : difficultyId === "general" ? 1 : difficultyId === "captain" ? 1 : 0;
  if (!reactions) return;
  if ((enemy.musket + enemy.artillery) / enemyTotal >= 0.3) {
    transfer(army, ["axe", "artillery", "musket"], "cavalry", reactions);
  } else if (enemy.cavalry / enemyTotal >= 0.28) {
    transfer(army, ["axe", "artillery"], "spear", reactions);
  } else if ((enemy.sword + enemy.spear + enemy.axe) / enemyTotal >= 0.62) {
    const target = army.artillery < MAX_ARTILLERY ? "artillery" : "musket";
    transfer(army, ["sword", "axe", "cavalry"], target, reactions);
  }
}

function fillToLimit(army, doctrine, size) {
  const limit = armyLimitForSize(size);
  while (armyTotal(army) < limit) {
    const type = doctrine.preferredReplacements.find((candidate) => candidate !== "artillery" || army.artillery < MAX_ARTILLERY);
    army[type] += 1;
  }
  while (armyTotal(army) > limit) {
    const type = [...doctrine.preferredReplacements].reverse().find((candidate) => army[candidate] > 0);
    army[type] -= 1;
  }
}

export function chooseComputerArmy({ size, terrain = [], opponentArmy = {}, difficultyId = "captain" }) {
  const doctrine = AI_ARMY_DOCTRINES[difficultyId] ?? AI_ARMY_DOCTRINES.captain;
  const army = scaleDoctrine(doctrine, size);
  adaptToField(army, difficultyId, terrain, opponentArmy);
  fillToLimit(army, doctrine, size);
  army.artillery = Math.min(MAX_ARTILLERY, army.artillery);
  fillToLimit(army, doctrine, size);
  return normalizeArmy(army);
}

export function doctrineForDifficulty(difficultyId) {
  return AI_ARMY_DOCTRINES[difficultyId] ?? AI_ARMY_DOCTRINES.captain;
}
