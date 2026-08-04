import { FACINGS, PLAYERS, TERRAIN, UNIT_DEFS } from "../engine/constants.js";
import { DEFAULT_AI_DIFFICULTY, isDifficulty } from "../ai/difficulties.js";

export const SAVE_VERSION = 3;
export const SAVE_KEY = "massivecraft-wars-standard-battle-v3";
export const PREVIOUS_SAVE_KEYS = Object.freeze([
  "massivecraft-wars-standard-battle-v2",
  "massivecraft-wars-standard-battle-v1",
  "oscird-standard-battle-v1",
]);

const PHASES = new Set(["terrain", "deployment", "orders", "ended"]);
const MODES = new Set(["standard", "tutorial"]);
const PLAYERS_SET = new Set(Object.values(PLAYERS));
const UNIT_TYPES = new Set(Object.keys(UNIT_DEFS));
const TERRAIN_TYPES = new Set(Object.keys(TERRAIN));

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateUnit(unit, size, ids, occupied) {
  assert(isRecord(unit), "A unit entry is malformed.");
  assert(typeof unit.id === "string" && unit.id.length > 0 && !ids.has(unit.id), "Unit identifiers must be unique.");
  ids.add(unit.id);
  assert(PLAYERS_SET.has(unit.player), "A unit has an unknown player.");
  assert(UNIT_TYPES.has(unit.type), "A unit has an unknown type.");
  assert(FACINGS.includes(unit.facing), "A unit has an invalid facing.");
  assert(typeof unit.alive === "boolean", "A unit has an invalid survival state.");
  assert(isIntegerInRange(unit.x, 0, size - 1) && isIntegerInRange(unit.y, 0, size - 1), "A unit is outside the battlefield.");
  if (unit.alive) {
    const square = `${unit.x},${unit.y}`;
    assert(!occupied.has(square), "Two surviving units occupy the same square.");
    occupied.add(square);
  }
}

function validateReserveUnit(unit, player, ids) {
  assert(isRecord(unit), "A reserve entry is malformed.");
  assert(typeof unit.id === "string" && unit.id.length > 0 && !ids.has(unit.id), "Reserve identifiers must be unique.");
  ids.add(unit.id);
  assert(unit.player === player, "A reserve entry belongs to the wrong player.");
  assert(UNIT_TYPES.has(unit.type), "A reserve entry has an unknown unit type.");
}

function validateTerrain(terrain, size) {
  assert(Array.isArray(terrain) && terrain.length === size, "The terrain grid has the wrong height.");
  for (const row of terrain) {
    assert(Array.isArray(row) && row.length === size, "The terrain grid has the wrong width.");
    assert(row.every((type) => TERRAIN_TYPES.has(type)), "The terrain grid contains an unknown terrain type.");
  }
}

function normalizeLog(log) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((entry) => isRecord(entry) && Number.isInteger(entry.round) && typeof entry.text === "string")
    .slice(0, 100)
    .map((entry) => ({ round: entry.round, text: entry.text.slice(0, 500) }));
}

export function migrateSave(candidate) {
  assert(isRecord(candidate), "The save file is not an object.");
  const migrated = structuredClone(candidate);
  const sourceVersion = migrated.version ?? 1;
  assert([1, 2, SAVE_VERSION].includes(sourceVersion), "The save file uses an unsupported version.");

  if (sourceVersion === 1) {
    migrated.version = 2;
    migrated.mode = MODES.has(migrated.mode) ? migrated.mode : "standard";
    migrated.terrainMode = migrated.terrainMode ?? "random";
    migrated.orders = isRecord(migrated.orders) ? migrated.orders : {};
    migrated.orders[PLAYERS.HUMAN] = Array.isArray(migrated.orders[PLAYERS.HUMAN]) ? migrated.orders[PLAYERS.HUMAN] : [];
    migrated.orders[PLAYERS.COMPUTER] = [];
    migrated.selectedUnitId = null;
    if (migrated.mode === "tutorial") {
      migrated.tutorial = {
        hintVisible: false,
        contributors: [],
        roundCap: 20,
        ...(isRecord(migrated.tutorial) ? migrated.tutorial : {}),
      };
    }
  }

  if (sourceVersion < SAVE_VERSION) {
    migrated.version = SAVE_VERSION;
    migrated.aiDifficulty = isDifficulty(migrated.aiDifficulty) ? migrated.aiDifficulty : DEFAULT_AI_DIFFICULTY;
    migrated.aiSeed = Number.isInteger(migrated.aiSeed) && migrated.aiSeed > 0 ? migrated.aiSeed : 1;
  }

  // A timer cannot survive a page close. Resume safely at Orders rather than
  // replaying a stale resolution callback from the previous page session.
  if (migrated.phase === "resolving") {
    migrated.phase = "orders";
    migrated.orders = { [PLAYERS.HUMAN]: [], [PLAYERS.COMPUTER]: [] };
    migrated.selectedUnitId = null;
    migrated.log = [
      { round: Number.isInteger(migrated.round) ? migrated.round : 1, text: "An interrupted round was cancelled. Prepare fresh orders." },
      ...normalizeLog(migrated.log),
    ];
  }
  return migrated;
}

export function validateSave(candidate) {
  const save = migrateSave(candidate);
  assert(save.version === SAVE_VERSION, "The save file did not migrate to the current version.");
  assert(save.scenarioId === "tutorial" || save.scenarioId === "skirmish" || save.scenarioId === "battle", "The save file names an unknown scenario.");
  assert(save.size === 8 || save.size === 16, "The save file has an unsupported battlefield size.");
  assert(isIntegerInRange(save.deploymentRows, 0, save.size), "The deployment-row count is invalid.");
  assert(MODES.has(save.mode), "The save file has an unknown game mode.");
  assert(PHASES.has(save.phase), "The save file has an unknown phase.");
  assert(Number.isInteger(save.round) && save.round >= 0, "The round number is invalid.");
  assert(isDifficulty(save.aiDifficulty), "The save file has an unknown computer difficulty.");
  assert(Number.isInteger(save.aiSeed) && save.aiSeed > 0 && save.aiSeed <= 0xffffffff, "The save file has an invalid computer seed.");
  validateTerrain(save.terrain, save.size);
  assert(Array.isArray(save.units), "The unit roster is missing.");
  assert(isRecord(save.reserves), "The reserve roster is missing.");

  const ids = new Set();
  const occupied = new Set();
  for (const unit of save.units) validateUnit(unit, save.size, ids, occupied);
  for (const player of Object.values(PLAYERS)) {
    assert(Array.isArray(save.reserves[player]), "A reserve roster is missing.");
    for (const unit of save.reserves[player]) validateReserveUnit(unit, player, ids);
  }

  save.orders = { [PLAYERS.HUMAN]: [], [PLAYERS.COMPUTER]: [] };
  save.selectedUnitId = null;
  save.log = normalizeLog(save.log);
  save.winner = save.winner ?? null;
  save.defeatReason = typeof save.defeatReason === "string" ? save.defeatReason : null;
  if (save.mode === "tutorial") {
    const validContributorIds = new Set(save.units.filter((unit) => unit.player === PLAYERS.HUMAN).map((unit) => unit.id));
    const tutorial = isRecord(save.tutorial) ? save.tutorial : {};
    save.tutorial = {
      hintVisible: Boolean(tutorial.hintVisible),
      contributors: Array.isArray(tutorial.contributors)
        ? [...new Set(tutorial.contributors.filter((id) => validContributorIds.has(id)))]
        : [],
      roundCap: isIntegerInRange(tutorial.roundCap, 1, 100) ? tutorial.roundCap : 20,
    };
  }
  return save;
}

export function createPersistenceController({ storage = localStorage, getGame, setGame, onAvailabilityChange }) {
  function storedKey() {
    return [SAVE_KEY, ...PREVIOUS_SAVE_KEYS].find((key) => storage.getItem(key));
  }

  function updateAvailability() {
    onAvailabilityChange?.(Boolean(storedKey()));
  }

  function save() {
    const game = getGame();
    if (game) storage.setItem(SAVE_KEY, JSON.stringify({ ...game, version: SAVE_VERSION }));
    for (const key of PREVIOUS_SAVE_KEYS) storage.removeItem(key);
    updateAvailability();
  }

  function load() {
    const key = storedKey();
    if (!key) return { ok: false, error: "No saved battle was found." };
    try {
      const game = validateSave(JSON.parse(storage.getItem(key)));
      setGame(game);
      storage.setItem(SAVE_KEY, JSON.stringify(game));
      for (const oldKey of PREVIOUS_SAVE_KEYS) storage.removeItem(oldKey);
      updateAvailability();
      return { ok: true, game };
    } catch (error) {
      clear();
      return { ok: false, error: error instanceof Error ? error.message : "The save file is invalid." };
    }
  }

  function clear() {
    storage.removeItem(SAVE_KEY);
    for (const key of PREVIOUS_SAVE_KEYS) storage.removeItem(key);
    updateAvailability();
  }

  updateAvailability();
  return { save, load, clear, hasSave: () => Boolean(storedKey()) };
}
