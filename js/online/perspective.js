import { PLAYERS, TERRAIN, UNIT_DEFS } from "../engine/constants.js";

const OPPOSITE_FACING = Object.freeze({
  north: "south",
  northeast: "southwest",
  east: "west",
  southeast: "northwest",
  south: "north",
  southwest: "northeast",
  west: "east",
  northwest: "southeast",
});

function flipPlayer(player) {
  if (player === PLAYERS.HUMAN) return PLAYERS.COMPUTER;
  if (player === PLAYERS.COMPUTER) return PLAYERS.HUMAN;
  return player;
}

export function rotatePoint(point, size) {
  return { x: size - 1 - point.x, y: size - 1 - point.y };
}

export function rotateTerrain(terrain) {
  return terrain.map((row) => [...row].reverse()).reverse();
}

export function gameForSeat(canonicalGame, seat) {
  if (!canonicalGame) return null;
  const game = structuredClone(canonicalGame);
  if (seat !== "guest") return game;
  game.terrain = rotateTerrain(game.terrain);
  game.units = game.units.map((unit) => ({
    ...unit,
    ...rotatePoint(unit, game.size),
    player: flipPlayer(unit.player),
    facing: OPPOSITE_FACING[unit.facing],
  }));
  game.reserves = {
    human: game.reserves.computer.map((unit) => ({ ...unit, player: PLAYERS.HUMAN })),
    computer: game.reserves.human.map((unit) => ({ ...unit, player: PLAYERS.COMPUTER })),
  };
  if (game.winner) game.winner = flipPlayer(game.winner);
  return game;
}

export function proposalForSeat(proposal, seat) {
  if (!proposal || seat !== "guest") return proposal ? structuredClone(proposal) : null;
  return { ...structuredClone(proposal), terrain: rotateTerrain(proposal.terrain) };
}

export function placementToCanonical({ unitId, x, y }, seat, size) {
  if (seat !== "guest") return { unitId, x, y };
  const point = rotatePoint({ x, y }, size);
  return { unitId, ...point };
}

export function orderToCanonical(order, seat, size) {
  if (seat !== "guest") return {
    kind: order.kind,
    unitId: order.unitId,
    to: { ...order.to },
    facing: order.facing,
  };
  return {
    kind: order.kind,
    unitId: order.unitId,
    to: rotatePoint(order.to, size),
    facing: OPPOSITE_FACING[order.facing],
  };
}

export function canonicalWinnerForSeat(winner, seat) {
  if (winner === "draw") return "draw";
  const you = seat === "host" ? PLAYERS.HUMAN : PLAYERS.COMPUTER;
  return winner === you ? "you" : "opponent";
}

function viewPlayer(player, seat) {
  return seat === "guest" ? flipPlayer(player) : player;
}

function viewPoint(point, seat, size) {
  return seat === "guest" ? rotatePoint(point, size) : point;
}

function coordinate(point, size) {
  return `${String.fromCharCode(65 + point.x)}${size - point.y}`;
}

function describeOrders(orders, seat, size) {
  if (!orders.length) return "none";
  return orders.map((order) => {
    const from = viewPoint(order.from, seat, size);
    const to = viewPoint(order.to, seat, size);
    const name = UNIT_DEFS[order.type]?.name ?? order.type;
    const facing = seat === "guest" ? OPPOSITE_FACING[order.facing] : order.facing;
    if (order.kind === "rotate") return `${name} at ${coordinate(from, size)} rotated ${facing}`;
    if (from.x === to.x && from.y === to.y) return `${name} at ${coordinate(from, size)} held after contested movement, facing ${facing}`;
    return `${name} ${coordinate(from, size)}→${coordinate(to, size)}, facing ${facing}`;
  }).join("; ");
}

function describeCasualties(casualties, player, seat, size) {
  const losses = casualties.filter((unit) => viewPlayer(unit.player, seat) === player);
  if (!losses.length) return "0 — none";
  const groups = new Map();
  for (const unit of losses) {
    const name = UNIT_DEFS[unit.type]?.name ?? unit.type;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(coordinate(viewPoint(unit.at, seat, size), size));
  }
  return `${losses.length} — ${[...groups.entries()].map(([name, squares]) => `${name} (${squares.join(", ")})`).join("; ")}`;
}

export function reportForSeat(report, seat, size) {
  if (seat === "spectator") {
    const eventText = report.events.length ? `${report.events.join(" ")} ` : "";
    return {
      round: report.round,
      movement: `Orders resolved — Host: ${describeOrders(report.orders.human, seat, size)}. Guest: ${describeOrders(report.orders.computer, seat, size)}.`,
      casualties: `Control Check — Host destroyed: ${describeCasualties(report.casualties, PLAYERS.HUMAN, seat, size)}. Guest destroyed: ${describeCasualties(report.casualties, PLAYERS.COMPUTER, seat, size)}. Remaining: ${report.remaining.human} host / ${report.remaining.computer} guest.`,
      events: eventText.trim(),
    };
  }
  const friendlyOrders = seat === "host" ? report.orders.human : report.orders.computer;
  const enemyOrders = seat === "host" ? report.orders.computer : report.orders.human;
  const remainingFriendly = seat === "host" ? report.remaining.human : report.remaining.computer;
  const remainingEnemy = seat === "host" ? report.remaining.computer : report.remaining.human;
  const eventText = report.events.length ? `${report.events.join(" ")} ` : "";
  return {
    round: report.round,
    movement: `Orders resolved — Friendly: ${describeOrders(friendlyOrders, seat, size)}. Enemy: ${describeOrders(enemyOrders, seat, size)}.`,
    casualties: `Control Check — Friendly destroyed: ${describeCasualties(report.casualties, PLAYERS.HUMAN, seat, size)}. Enemy destroyed: ${describeCasualties(report.casualties, PLAYERS.COMPUTER, seat, size)}. Remaining: ${remainingFriendly} friendly / ${remainingEnemy} enemy.`,
    events: eventText.trim(),
  };
}

export const perspectiveInternals = Object.freeze({ OPPOSITE_FACING, flipPlayer, viewPoint });
export const KNOWN_TERRAIN = Object.freeze(Object.keys(TERRAIN));
