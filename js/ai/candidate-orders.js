import { FACINGS, PLAYERS, UNIT_DEFS, oppositePlayer } from "../engine/constants.js";
import { computeControl, controlOwner, controlStatus } from "../engine/control.js";
import { activeUnits, unitAt } from "../engine/model.js";
import { legalMovesForUnit, requiredOrderCount, rotationOrder, validateOrders } from "../engine/movement.js";
import { jitter } from "./random.js";

function nearestEnemyDistance(game, x, y, player) {
  const enemies = activeUnits(game, oppositePlayer(player));
  if (!enemies.length) return 0;
  return Math.min(...enemies.map((unit) => Math.abs(unit.x - x) + Math.abs(unit.y - y)));
}

function terrainQuality(type) {
  return {
    plain: 0,
    hill: 3,
    road: 2,
    bridge: 2,
    river: -1,
    mud: -2,
    fog: -3,
  }[type] ?? 0;
}

function canonicalOrder(order) {
  return `${order.unitId}:${order.kind}:${order.to.x},${order.to.y}:${order.facing}`;
}

export function canonicalOrderSet(orders) {
  return orders.map(canonicalOrder).sort().join("|");
}

function previewOrder(game, unit, order) {
  const units = game.units.map((candidate) => (
    candidate.id === unit.id
      ? { ...candidate, x: order.to.x, y: order.to.y, facing: order.facing }
      : candidate
  ));
  const preview = { ...game, units };
  const control = computeControl(preview);
  const enemies = activeUnits(preview, oppositePlayer(unit.player));
  const threatenedEnemies = enemies.filter(
    (enemy) => controlStatus(control[enemy.y][enemy.x], enemy.player) === "enemy",
  ).length;
  const ownStatus = controlStatus(control[order.to.y][order.to.x], unit.player);
  const controlledCells = control.flat().filter((cell) => controlOwner(cell) === unit.player).length;
  const support = activeUnits(preview, unit.player).filter(
    (ally) => ally.id !== unit.id && Math.max(Math.abs(ally.x - order.to.x), Math.abs(ally.y - order.to.y)) <= 1,
  ).length;
  return { ownStatus, threatenedEnemies, controlledCells, support };
}

function scoreOption(game, unit, order, style, baseControlledCells) {
  const beforeDistance = nearestEnemyDistance(game, unit.x, unit.y, unit.player);
  const afterDistance = nearestEnemyDistance(game, order.to.x, order.to.y, unit.player);
  const advance = beforeDistance - afterDistance;
  const terrain = game.terrain[order.to.y]?.[order.to.x] ?? "plain";
  const quality = terrainQuality(terrain);
  const preview = previewOrder(game, unit, order);
  const safety = preview.ownStatus === "friendly" ? 1 : preview.ownStatus === "contested" ? 0 : -1;
  const territory = preview.controlledCells - baseControlledCells;
  const movement = order.kind === "move" ? Math.max(1, order.path.length) : 0;

  if (style === "corporal") {
    return advance * 9 + movement * 3 - quality * 12 - safety * 24 - preview.threatenedEnemies * 18 - preview.support * 7;
  }
  if (style === "captain") {
    return advance * 5 + movement + preview.threatenedEnemies * 15 - Math.abs(safety) * 2 + (safety < 0 ? 10 : 0) + quality;
  }
  if (style === "general") {
    const greedy = game.round > 15;
    return advance * (greedy ? 7 : 3) + preview.threatenedEnemies * (greedy ? 27 : 19) + safety * (greedy ? 7 : 19)
      + territory * 2 + preview.support * 5 + quality * (greedy ? 2 : 5) + movement;
  }
  return advance * 2 + preview.threatenedEnemies * 25 + safety * 34 + territory * 3
    + preview.support * 10 + quality * 7 - (safety < 0 ? 70 : 0);
}

function expandedOptions(game, unit, style, optionLimit, random, noise) {
  const baseControl = computeControl(game);
  const baseControlledCells = baseControl.flat().filter((cell) => controlOwner(cell) === unit.player).length;
  const options = [];
  for (const move of legalMovesForUnit(game, unit)) {
    // The engine permits finishing on an allied starting square only when that
    // ally is also ordered away. Excluding that dependency here keeps the
    // bounded beam focused on independently valid moves; allied pass-through
    // remains fully available.
    const occupant = unitAt(game, move.to.x, move.to.y);
    if (occupant?.player === unit.player && occupant.id !== unit.id) continue;
    const facings = UNIT_DEFS[unit.type].directional ? FACINGS : [move.facing];
    for (const facing of facings) {
      const order = { ...move, facing };
      options.push({ order, score: scoreOption(game, unit, order, style, baseControlledCells) + jitter(random, noise * 0.22) });
    }
  }
  const rotationFacings = UNIT_DEFS[unit.type].directional
    ? FACINGS.filter((facing) => facing !== unit.facing)
    : [FACINGS[(FACINGS.indexOf(unit.facing) + 1) % FACINGS.length]];
  for (const facing of rotationFacings) {
    const order = rotationOrder(unit, facing);
    options.push({ order, score: scoreOption(game, unit, order, style, baseControlledCells) + jitter(random, noise * 0.22) });
  }
  const unique = new Map();
  for (const option of options) {
    const key = canonicalOrder(option.order);
    if (!unique.has(key) || unique.get(key).score < option.score) unique.set(key, option);
  }
  return [...unique.values()]
    .sort((left, right) => right.score - left.score || canonicalOrder(left.order).localeCompare(canonicalOrder(right.order)))
    .slice(0, optionLimit);
}

function fallbackOrders(game, player) {
  const required = requiredOrderCount(game, player);
  return activeUnits(game, player).slice(0, required).map((unit) => (
    rotationOrder(unit, FACINGS.find((facing) => facing !== unit.facing))
  ));
}

export function generateCandidateOrderSets(game, player, {
  style = "codex",
  optionLimit = 7,
  beamWidth = 80,
  setLimit = 48,
  random = () => 0.5,
  noise = 0,
} = {}) {
  const units = activeUnits(game, player);
  const required = requiredOrderCount(game, player);
  if (!required) return [];
  const optionsByUnit = units.map((unit) => expandedOptions(game, unit, style, optionLimit, random, noise));
  let beam = [{ orders: [], score: 0, lastUnitIndex: -1, destinations: [] }];

  for (let depth = 0; depth < required; depth += 1) {
    const next = [];
    const remainingAfter = required - depth - 1;
    for (const state of beam) {
      const finalUnitIndex = units.length - remainingAfter;
      for (let unitIndex = state.lastUnitIndex + 1; unitIndex < finalUnitIndex; unitIndex += 1) {
        for (const option of optionsByUnit[unitIndex]) {
          const destination = `${option.order.to.x},${option.order.to.y}`;
          if (state.destinations.includes(destination)) continue;
          next.push({
            orders: [...state.orders, option.order],
            score: state.score + option.score,
            lastUnitIndex: unitIndex,
            destinations: [...state.destinations, destination],
          });
        }
      }
    }
    next.sort((left, right) => right.score - left.score || canonicalOrderSet(left.orders).localeCompare(canonicalOrderSet(right.orders)));
    beam = next.slice(0, beamWidth);
    if (!beam.length) break;
  }

  const valid = [];
  const seen = new Set();
  for (const state of beam) {
    if (validateOrders(game, player, state.orders)) continue;
    const key = canonicalOrderSet(state.orders);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ orders: state.orders, heuristic: state.score });
    if (valid.length >= setLimit) break;
  }

  const fallback = fallbackOrders(game, player);
  if (!validateOrders(game, player, fallback)) {
    const key = canonicalOrderSet(fallback);
    if (!seen.has(key)) valid.push({ orders: fallback, heuristic: -Infinity });
  }
  return valid;
}

export function responseSearchSettings(game, difficulty) {
  return {
    style: "codex",
    optionLimit: game.size === 16 ? 6 : 7,
    beamWidth: game.size === 16 ? 64 : 86,
    setLimit: game.size === 16 ? difficulty.responseLimit16 : difficulty.responseLimit8,
    noise: 0,
  };
}

export function computerSearchSettings(game, difficulty, random) {
  return {
    style: difficulty.id,
    optionLimit: difficulty.optionLimit,
    beamWidth: game.size === 16 ? difficulty.orderBeam16 : difficulty.orderBeam8,
    setLimit: game.size === 16 ? difficulty.orderSetLimit16 : difficulty.orderSetLimit8,
    random,
    noise: difficulty.id === "general" && game.round > 15 ? 15 : difficulty.noise,
  };
}

export const SEARCH_PLAYERS = PLAYERS;
