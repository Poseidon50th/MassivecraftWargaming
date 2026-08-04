import { rosterFromArmy } from "../data/scenarios.js";
import { PLAYERS } from "./constants.js";
import { blankTerrain } from "./terrain.js";

function terrainFromEntries(size, terrainEntries = []) {
  const terrain = blankTerrain(size);
  for (const entry of terrainEntries) {
    if (terrain[entry.y]?.[entry.x]) terrain[entry.y][entry.x] = entry.type;
  }
  return terrain;
}

function createReserve(player, army) {
  return rosterFromArmy(army).map(({ type, index }) => ({
    id: `${player}-${type}-${index + 1}`,
    player,
    type,
  }));
}

export function createGame(scenario) {
  return {
    version: 1,
    scenarioId: scenario.id,
    size: scenario.size,
    deploymentRows: scenario.deploymentRows,
    mode: "standard",
    phase: "deployment",
    round: 0,
    terrain: terrainFromEntries(scenario.size, scenario.terrain),
    units: [],
    reserves: {
      [PLAYERS.HUMAN]: createReserve(PLAYERS.HUMAN, scenario.army),
      [PLAYERS.COMPUTER]: createReserve(PLAYERS.COMPUTER, scenario.army),
    },
    orders: { [PLAYERS.HUMAN]: [], [PLAYERS.COMPUTER]: [] },
    selectedUnitId: null,
    winner: null,
    defeatReason: null,
    log: [{ round: 0, text: `Deployment began on ${scenario.name}.` }],
  };
}

export function cloneGame(game) {
  return structuredClone(game);
}

export function unitAt(game, x, y, units = game.units) {
  return units.find((unit) => unit.alive !== false && unit.x === x && unit.y === y) ?? null;
}

export function getUnit(game, unitId) {
  return game.units.find((unit) => unit.id === unitId && unit.alive !== false) ?? null;
}

export function isInside(game, x, y) {
  return x >= 0 && y >= 0 && x < game.size && y < game.size;
}

export function isDeploymentSquare(game, player, y) {
  return player === PLAYERS.COMPUTER
    ? y < game.deploymentRows
    : y >= game.size - game.deploymentRows;
}

export function placeUnit(game, reserveUnit, x, y, facing) {
  const unit = { ...reserveUnit, x, y, facing, alive: true };
  game.units.push(unit);
  game.reserves[reserveUnit.player] = game.reserves[reserveUnit.player].filter(
    (candidate) => candidate.id !== reserveUnit.id,
  );
  return unit;
}

export function activeUnits(game, player) {
  return game.units.filter((unit) => unit.alive !== false && unit.player === player);
}
