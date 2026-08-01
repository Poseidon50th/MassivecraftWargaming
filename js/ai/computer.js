import { FACINGS, PLAYERS, UNIT_DEFS } from "../engine/constants.js";
import { computeControl, controlStatus } from "../engine/control.js";
import { isDeploymentSquare, placeUnit, unitAt } from "../engine/model.js";
import { legalMovesForUnit, requiredOrderCount, rotationOrder } from "../engine/movement.js";

function distanceToNearestEnemy(game, x, y, player) {
  const enemies = game.units.filter((unit) => unit.alive !== false && unit.player !== player);
  if (!enemies.length) return 0;
  return Math.min(...enemies.map((unit) => Math.abs(unit.x - x) + Math.abs(unit.y - y)));
}

function projectedValue(game, unit, move, control) {
  const status = controlStatus(control[move.to.y][move.to.x], unit.player);
  const safety = status === "friendly" ? 80 : status === "contested" ? 45 : -70;
  const advance = -distanceToNearestEnemy(game, move.to.x, move.to.y, unit.player) * 2;
  const center = -Math.abs(move.to.x - (game.size - 1) / 2) * 0.3;
  const mobility = move.path.length * (unit.type === "cavalry" ? 2 : 0.6);
  return safety + advance + center + mobility + Math.random() * 5;
}

export function chooseComputerOrders(game) {
  const control = computeControl(game);
  const units = game.units.filter((unit) => unit.alive !== false && unit.player === PLAYERS.COMPUTER);
  const required = requiredOrderCount(game, PLAYERS.COMPUTER);
  const candidates = units.map((unit) => {
    const moves = legalMovesForUnit(game, unit)
      .map((move) => ({ ...move, score: projectedValue(game, unit, move, control) }))
      .sort((a, b) => b.score - a.score);
    const rotations = FACINGS.filter((facing) => facing !== unit.facing).map((facing) => ({
      ...rotationOrder(unit, facing),
      score: unit.type === "artillery" ? 12 + Math.random() * 5 : -25,
    }));
    return { unit, options: [...moves.slice(0, 8), ...rotations].sort((a, b) => b.score - a.score) };
  });

  const chosen = [];
  const usedDestinations = new Set();
  const rankedUnits = candidates.sort(
    (a, b) => (b.options[0]?.score ?? -Infinity) - (a.options[0]?.score ?? -Infinity),
  );
  for (const { options } of rankedUnits) {
    const option = options.find((candidate) => {
      if (candidate.kind !== "move") return true;
      const key = `${candidate.to.x},${candidate.to.y}`;
      if (usedDestinations.has(key)) return false;
      const occupant = unitAt(game, candidate.to.x, candidate.to.y);
      return !occupant || occupant.player !== PLAYERS.COMPUTER || chosen.some(
        (order) => order.unitId === occupant.id && (order.to.x !== occupant.x || order.to.y !== occupant.y),
      );
    });
    if (!option) continue;
    chosen.push(option);
    if (option.kind === "move") usedDestinations.add(`${option.to.x},${option.to.y}`);
    if (chosen.length === required) break;
  }

  // The first pass may reject a dependency where an allied occupant has not been chosen yet.
  for (const { unit, options } of rankedUnits) {
    if (chosen.length === required) break;
    if (chosen.some((order) => order.unitId === unit.id)) continue;
    const rotation = options.find((option) => option.kind === "rotate") ?? rotationOrder(unit, unit.facing);
    chosen.push(rotation);
  }
  return chosen.slice(0, required).map(({ score, ...order }) => order);
}

function artilleryAdjacent(game, x, y) {
  return game.units.some(
    (unit) =>
      unit.alive !== false &&
      unit.type === "artillery" &&
      Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  );
}

export function deployComputerUnit(game) {
  const reserve = game.reserves[PLAYERS.COMPUTER][0];
  if (!reserve) return null;
  const squares = [];
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      if (!isDeploymentSquare(game, PLAYERS.COMPUTER, y) || unitAt(game, x, y)) continue;
      if (reserve.type === "artillery" && artilleryAdjacent(game, x, y)) continue;
      const depth = y;
      const center = Math.abs(x - (game.size - 1) / 2);
      const typeBias = reserve.type === "artillery" || reserve.type === "musket" ? -depth * 4 : depth * 3;
      squares.push({ x, y, score: typeBias - center + Math.random() * 2 });
    }
  }
  squares.sort((a, b) => b.score - a.score);
  const square = squares[0];
  return square ? placeUnit(game, reserve, square.x, square.y, "south") : null;
}
