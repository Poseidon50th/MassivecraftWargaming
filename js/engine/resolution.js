import { UNIT_DEFS, oppositePlayer } from "./constants.js";
import { computeControlDetails, controlStatus } from "./control.js";
import { cloneGame } from "./model.js";

function destinationKey(order) {
  return `${order.to.x},${order.to.y}`;
}

function effectiveInitiative(unit, order) {
  return UNIT_DEFS[unit.type].initiative - (order.riverPenalty ? 1 : 0);
}

export function resolveRound(game, humanOrders, computerOrders) {
  const next = cloneGame(game);
  const allOrders = [...humanOrders, ...computerOrders];
  const unitsById = new Map(next.units.map((unit) => [unit.id, unit]));
  const starts = new Map(next.units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
  const ordersById = new Map(allOrders.map((order) => [order.unitId, order]));
  const destinations = new Map();

  for (const order of allOrders) {
    const unit = unitsById.get(order.unitId);
    if (!unit?.alive) continue;
    unit.x = order.to.x;
    unit.y = order.to.y;
    unit.facing = order.facing;
    const key = destinationKey(order);
    if (!destinations.has(key)) destinations.set(key, []);
    destinations.get(key).push(unit);
  }

  const events = [];
  for (const contenders of destinations.values()) {
    const players = new Set(contenders.map((unit) => unit.player));
    if (contenders.length < 2 || players.size < 2) continue;
    const ranked = contenders
      .map((unit) => ({ unit, score: effectiveInitiative(unit, ordersById.get(unit.id)) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0].score;
    const winners = ranked.filter((entry) => entry.score === top);
    if (winners.length > 1) {
      for (const { unit } of ranked) Object.assign(unit, starts.get(unit.id));
      events.push("An Initiative tie forced both sides back.");
    } else {
      for (const { unit } of ranked.slice(1)) Object.assign(unit, starts.get(unit.id));
      events.push(`${UNIT_DEFS[winners[0].unit.type].name} won a destination by Initiative.`);
    }
  }

  // A returning unit owns its starting square. Incoming allies bounce in a stable cascade.
  let changed = true;
  let guard = 0;
  while (changed && guard < next.units.length + 2) {
    changed = false;
    guard += 1;
    const occupants = new Map();
    for (const unit of next.units.filter((candidate) => candidate.alive !== false)) {
      const key = `${unit.x},${unit.y}`;
      if (!occupants.has(key)) occupants.set(key, []);
      occupants.get(key).push(unit);
    }
    for (const stack of occupants.values()) {
      if (stack.length < 2) continue;
      const returning = stack.find((unit) => {
        const start = starts.get(unit.id);
        return unit.x === start.x && unit.y === start.y;
      });
      const keeper = returning ?? stack[0];
      for (const unit of stack) {
        if (unit.id === keeper.id) continue;
        Object.assign(unit, starts.get(unit.id));
        changed = true;
      }
    }
  }

  const { grid: control, contributors } = computeControlDetails(next);
  const provisionalCasualties = new Set(
    next.units
      .filter(
        (unit) =>
          unit.alive !== false &&
          controlStatus(control[unit.y][unit.x], unit.player) === "enemy",
      )
      .map((unit) => unit.id),
  );
  const casualties = [];
  const cavalrySaved = [];
  for (const unit of next.units.filter((candidate) => candidate.alive !== false)) {
    if (!provisionalCasualties.has(unit.id)) continue;

    if (unit.type === "cavalry") {
      const enemy = oppositePlayer(unit.player);
      const doomedEnemyControl = contributors[unit.y][unit.x][enemy]
        .filter((source) => provisionalCasualties.has(source.unitId))
        .reduce((total, source) => total + source.value, 0);
      const survivingEnemyControl = control[unit.y][unit.x][enemy] - doomedEnemyControl;
      if (survivingEnemyControl <= control[unit.y][unit.x][unit.player]) {
        cavalrySaved.push(unit);
        continue;
      }
    }

    unit.alive = false;
    casualties.push(unit);
  }

  next.round += 1;
  next.phase = "orders";
  next.orders = { human: [], computer: [] };
  next.selectedUnitId = null;
  next.log.unshift({
    round: next.round,
    text: casualties.length
      ? `${casualties.length} unit${casualties.length === 1 ? " was" : "s were"} destroyed during the Control Check.`
      : "No units were destroyed during the Control Check.",
  });
  if (cavalrySaved.length) {
    next.log.unshift({
      round: next.round,
      text: `${cavalrySaved.length} Cavalry unit${cavalrySaved.length === 1 ? " survived" : "s survived"} because the opposing unit${cavalrySaved.length === 1 ? " was" : "s were"} also marked for destruction.`,
    });
  }
  for (const text of events.reverse()) next.log.unshift({ round: next.round, text });
  return { game: next, casualties, control, contributors };
}
