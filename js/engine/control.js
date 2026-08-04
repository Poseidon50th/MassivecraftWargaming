import { DIRECTIONS, PLAYERS, UNIT_DEFS, oppositePlayer } from "./constants.js";
import { isInside, unitAt } from "./model.js";

function addProjection(targets, x, y, value) {
  targets.push({ x, y, value });
}

function forwardBasis(facing) {
  const forward = DIRECTIONS[facing];
  return { forward, right: { dx: -forward.dy, dy: forward.dx } };
}

function rawPattern(unit) {
  const { x, y } = unit;
  const targets = [];
  if (unit.type === "sword" || unit.type === "cavalry") {
    for (const { dx, dy } of Object.values(DIRECTIONS)) {
      addProjection(targets, x + dx, y + dy, UNIT_DEFS[unit.type].strength);
    }
  } else if (unit.type === "spear") {
    const { forward, right } = forwardBasis(unit.facing);
    for (const lateral of [-1, 0, 1]) {
      addProjection(
        targets,
        x + forward.dx + right.dx * lateral,
        y + forward.dy + right.dy * lateral,
        3,
      );
    }
  } else if (unit.type === "axe") {
    const { dx, dy } = DIRECTIONS[unit.facing];
    addProjection(targets, x + dx, y + dy, 5);
  } else if (unit.type === "musket") {
    const { dx, dy } = DIRECTIONS[unit.facing];
    [3, 2, 1].forEach((value, index) => {
      addProjection(targets, x + dx * (index + 1), y + dy * (index + 1), value);
    });
  } else if (unit.type === "artillery") {
    const { forward, right } = forwardBasis(unit.facing);
    for (const distance of [4, 5]) {
      for (const lateral of [-1, 0, 1]) {
        addProjection(
          targets,
          x + forward.dx * distance + right.dx * lateral,
          y + forward.dy * distance + right.dy * lateral,
          3,
        );
      }
    }
  }
  return targets;
}

function wallBlocks(game, unit, target) {
  if (game.terrain[target.y]?.[target.x] === "wall") return true;
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let step = 1; step < steps; step += 1) {
    const x = Math.round(unit.x + (dx * step) / steps);
    const y = Math.round(unit.y + (dy * step) / steps);
    if (game.terrain[y]?.[x] === "wall") return true;
  }
  return false;
}

function hasAdjacentAlly(game, targetUnit, units) {
  return units.some(
    (unit) =>
      unit.alive !== false &&
      unit.id !== targetUnit.id &&
      unit.player === targetUnit.player &&
      Math.abs(unit.x - targetUnit.x) <= 1 &&
      Math.abs(unit.y - targetUnit.y) <= 1,
  );
}

function sourceModifier(game, unit) {
  const terrain = game.terrain[unit.y][unit.x];
  if (terrain === "hill") return 1;
  if (terrain === "fog") return -1;
  return 0;
}

function artilleryDisputed(game, artillery, units, provisional) {
  const enemy = oppositePlayer(artillery.player);
  return provisional[artillery.y][artillery.x][enemy] >= provisional[artillery.y][artillery.x][artillery.player];
}

export function computeControlDetails(game, units = game.units) {
  const grid = Array.from({ length: game.size }, () =>
    Array.from({ length: game.size }, () => ({ human: 0, computer: 0 })),
  );
  const contributors = Array.from({ length: game.size }, () =>
    Array.from({ length: game.size }, () => ({ human: [], computer: [] })),
  );
  const living = units.filter((unit) => unit.alive !== false);

  const addControl = (unit, x, y, value) => {
    grid[y][x][unit.player] += value;
    contributors[y][x][unit.player].push({ unitId: unit.id, value });
  };

  // Self-control is always the printed strength. Hill and Fog modify projected
  // control only, never the strength a unit contributes to its occupied square.
  for (const unit of living) {
    addControl(unit, unit.x, unit.y, UNIT_DEFS[unit.type].strength);
  }

  const projectUnit = (unit, includeArtillery) => {
    if (unit.type === "artillery" && !includeArtillery) return;
    if (unit.type === "artillery" && artilleryDisputed(game, unit, living, grid)) return;
    const modifier = sourceModifier(game, unit);
    for (const target of rawPattern(unit)) {
      if (!isInside(game, target.x, target.y) || wallBlocks(game, unit, target)) continue;
      const occupant = unitAt(game, target.x, target.y, living);
      if (unit.type === "artillery" && occupant?.player === unit.player) continue;
      let value = Math.max(0, target.value + modifier);
      if (
        unit.type === "cavalry" &&
        occupant &&
        occupant.player !== unit.player &&
        !hasAdjacentAlly(game, occupant, living)
      ) {
        value = Math.max(0, 4 + modifier);
      }
      addControl(unit, target.x, target.y, value);
    }
  };

  living.forEach((unit) => projectUnit(unit, false));
  living.filter((unit) => unit.type === "artillery").forEach((unit) => projectUnit(unit, true));
  return { grid, contributors };
}

export function computeControl(game, units = game.units) {
  return computeControlDetails(game, units).grid;
}

export function controlStatus(cell, player) {
  const enemy = oppositePlayer(player);
  if (cell[player] > cell[enemy]) return "friendly";
  if (cell[player] < cell[enemy]) return "enemy";
  return "contested";
}

export function controlOwner(cell) {
  if (cell[PLAYERS.HUMAN] > cell[PLAYERS.COMPUTER]) return PLAYERS.HUMAN;
  if (cell[PLAYERS.COMPUTER] > cell[PLAYERS.HUMAN]) return PLAYERS.COMPUTER;
  return "contested";
}
