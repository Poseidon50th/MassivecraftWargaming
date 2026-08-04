import { DIRECTIONS, FACINGS, UNIT_DEFS, facingFromStep } from "./constants.js";
import { isInside, unitAt } from "./model.js";

function key(x, y) {
  return `${x},${y}`;
}

function moveRange(game, unit) {
  const base = UNIT_DEFS[unit.type].movement;
  return base + (["road", "bridge"].includes(game.terrain[unit.y][unit.x]) ? 1 : 0);
}

function canStep(game, unit, x, y) {
  if (!isInside(game, x, y) || game.terrain[y][x] === "wall") return false;
  const occupant = unitAt(game, x, y);
  return !occupant || occupant.player === unit.player;
}

export function legalMovesForUnit(game, unit) {
  const range = moveRange(game, unit);
  if (range <= 0) return [];

  const startOnMud = game.terrain[unit.y][unit.x] === "mud";
  const queue = [{ x: unit.x, y: unit.y, path: [], stopped: false }];
  const best = new Map([[key(unit.x, unit.y), 0]]);
  const destinations = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (current.path.length >= range || current.stopped) continue;
    for (const direction of Object.values(DIRECTIONS)) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      if (!canStep(game, unit, x, y)) continue;
      const nextPath = [...current.path, { x, y }];
      const steps = nextPath.length;
      const destinationKey = key(x, y);
      const previous = best.get(destinationKey);
      const enteringMud = game.terrain[y][x] === "mud";
      const stopped = startOnMud || enteringMud;
      const returnsToOrigin = x === unit.x && y === unit.y;
      if (!returnsToOrigin && (!destinations.has(destinationKey) || destinations.get(destinationKey).path.length > steps)) {
        const last = nextPath.at(-1);
        const before = steps === 1 ? { x: unit.x, y: unit.y } : nextPath.at(-2);
        destinations.set(destinationKey, {
          kind: "move",
          unitId: unit.id,
          to: { x, y },
          path: nextPath,
          facing: facingFromStep(last.x - before.x, last.y - before.y),
          riverPenalty:
            game.terrain[before.y][before.x] === "river" || game.terrain[y][x] === "river",
        });
      }
      if (stopped || steps >= range) continue;
      if (previous === undefined || steps < previous) {
        best.set(destinationKey, steps);
        queue.push({ x, y, path: nextPath, stopped });
      }
    }
  }
  return [...destinations.values()];
}

export function rotationOrder(unit, facing) {
  return { kind: "rotate", unitId: unit.id, to: { x: unit.x, y: unit.y }, path: [], facing, riverPenalty: false };
}

export function requiredOrderCount(game, player) {
  const units = game.units.filter((unit) => unit.alive !== false && unit.player === player);
  return Math.min(3, units.length);
}

export function validateOrders(game, player, orders) {
  const required = requiredOrderCount(game, player);
  if (orders.length !== required) return `Choose exactly ${required} distinct unit${required === 1 ? "" : "s"}.`;
  const ids = new Set(orders.map((order) => order.unitId));
  if (ids.size !== orders.length) return "Each unit may receive only one order.";
  const destinations = new Set();
  for (const order of orders) {
    const unit = game.units.find((candidate) => candidate.id === order.unitId && candidate.alive !== false);
    if (!unit || unit.player !== player) return "An order refers to an unavailable unit.";
    if (!FACINGS.includes(order.facing)) return "Every order must choose a valid final facing.";
    if (order.kind === "move") {
      const destinationKey = key(order.to.x, order.to.y);
      if (destinations.has(destinationKey)) return "Allied units cannot share a destination.";
      destinations.add(destinationKey);
      const legal = legalMovesForUnit(game, unit).some(
        (move) => move.to.x === order.to.x && move.to.y === order.to.y,
      );
      if (!legal) return "At least one movement order is no longer available.";
      const occupant = unitAt(game, order.to.x, order.to.y);
      if (occupant?.player === player && occupant.id !== unit.id) {
        const occupantOrder = orders.find((candidate) => candidate.unitId === occupant.id);
        if (
          !occupantOrder ||
          (occupantOrder.to.x === occupant.x && occupantOrder.to.y === occupant.y)
        ) {
          return "A unit may finish on an allied starting square only when that ally is ordered away.";
        }
      }
    } else if (order.kind === "rotate") {
      if (order.to.x !== unit.x || order.to.y !== unit.y || order.path.length) {
        return "A rotation order must remain on the unit's current square.";
      }
      if (order.facing === unit.facing) return "Rotation must change the unit's facing.";
    } else {
      return "An order has an unknown type.";
    }
  }
  return null;
}
