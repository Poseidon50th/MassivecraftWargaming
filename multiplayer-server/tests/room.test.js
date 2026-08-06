import test from "node:test";
import assert from "node:assert/strict";

import { getScenario } from "../../js/data/scenarios.js";
import { defaultArmyForSize } from "../../js/data/armies.js";
import { facingsForUnit, PLAYERS } from "../../js/engine/constants.js";
import { createGame, placeUnit, unitAt } from "../../js/engine/model.js";
import { legalMovesForUnit } from "../../js/engine/movement.js";
import {
  applyRoomAction,
  actionWasProcessed,
  createInitialRoom,
  migrateRoom,
  publicRoomSnapshot,
  rememberProcessedAction,
  roomInternals,
  RoomError,
} from "../src/room-state.js";
import {
  gameForSeat,
  orderToCanonical,
  perspectiveInternals,
  placementToCanonical,
  reportForSeat,
} from "../../js/online/perspective.js";

function room(now = 1_000) {
  return createInitialRoom({
    roomId: "ROOM12345678",
    hostName: "Host",
    hostTokenHash: "host-hash",
    guestTokenHash: "guest-hash",
    seed: 12345,
    now,
  });
}

function joinAndApprove(value, scenarioId = "skirmish") {
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_001);
  applyRoomAction(value, "host", "propose_field", { scenarioId, terrainMode: "random" }, 1_002);
  applyRoomAction(value, "guest", "approve_field", {}, 1_003);
  const size = getScenario(scenarioId).size;
  applyRoomAction(value, "host", "select_army", { army: defaultArmyForSize(size) }, 1_004);
  applyRoomAction(value, "guest", "select_army", { army: defaultArmyForSize(size) }, 1_005);
  return value;
}

function nextPlacement(game, player) {
  const reserve = game.reserves[player][0];
  const rows = player === PLAYERS.HUMAN
    ? Array.from({ length: game.deploymentRows }, (_, index) => game.size - game.deploymentRows + index)
    : Array.from({ length: game.deploymentRows }, (_, index) => index);
  for (const y of rows) {
    for (let x = 0; x < game.size; x += 1) {
      if (unitAt(game, x, y)) continue;
      if (reserve.type === "artillery" && game.units.some((unit) => unit.type === "artillery" && Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1)) continue;
      return { unitId: reserve.id, x, y };
    }
  }
  throw new Error(`No deployment square for ${reserve.id}`);
}

function deployAll(value) {
  let now = 2_000;
  while (value.phase === "deployment") {
    const player = value.deploymentTurn;
    const seat = player === PLAYERS.HUMAN ? "host" : "guest";
    applyRoomAction(value, seat, "place_unit", nextPlacement(value.game, player), now++);
  }
  return value;
}

function rotationOrders(game, player) {
  return game.units.filter((unit) => unit.player === player && unit.alive !== false).slice(0, 3).map((unit) => {
    const facings = facingsForUnit(unit);
    return { kind: "rotate", unitId: unit.id, to: { x: unit.x, y: unit.y }, facing: facings[(facings.indexOf(unit.facing) + 1) % facings.length] };
  });
}

test("guest approval is required and declined proposals return to the host", () => {
  const value = room();
  assert.throws(() => applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "random" }, 1_001), /has not joined/);
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_002);
  applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "random" }, 1_003);
  assert.equal(value.phase, "proposal");
  assert.equal(value.game, null);
  applyRoomAction(value, "guest", "decline_field", { reason: "More hills, please." }, 1_004);
  assert.equal(value.proposal.status, "declined");
  assert.equal(value.proposal.declineReason, "More hills, please.");
  applyRoomAction(value, "host", "propose_field", { scenarioId: "battle", terrainMode: "random" }, 1_005);
  assert.equal(value.proposal.revision, 2);
  applyRoomAction(value, "guest", "approve_field", {}, 1_006);
  assert.equal(value.phase, "armies");
  assert.equal(value.game, null);
  assert.equal(publicRoomSnapshot(value, "guest").armySelection.opponentReady, false);
  applyRoomAction(value, "host", "select_army", { army: defaultArmyForSize(16) }, 1_007);
  assert.equal(publicRoomSnapshot(value, "guest").armySelection.opponentReady, true);
  applyRoomAction(value, "guest", "select_army", { army: defaultArmyForSize(16) }, 1_008);
  assert.equal(value.phase, "deployment");
  assert.equal(value.game.size, 16);
});

test("manual terrain validation rejects starting-row terrain and unknown tiles", () => {
  const value = room();
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_001);
  const game = createGame(getScenario("skirmish"));
  game.terrain[0][0] = "hill";
  assert.throws(
    () => applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "manual", terrain: game.terrain }, 1_002),
    /Starting rows/,
  );
  game.terrain[0][0] = "plain";
  game.terrain[3][3] = "lava";
  assert.throws(
    () => applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "manual", terrain: game.terrain }, 1_003),
    /unknown terrain/,
  );
});

test("alternating deployment, secret orders, resolution, and dispatches complete end to end", () => {
  const value = deployAll(joinAndApprove(room()));
  assert.equal(value.phase, "orders");
  assert.equal(value.game.round, 1);
  assert.equal(value.game.units.length, 32);
  assert.equal(value.game.reserves.human.length, 0);
  assert.equal(value.game.reserves.computer.length, 0);

  const hostOrders = rotationOrders(value.game, PLAYERS.HUMAN);
  const guestOrders = rotationOrders(value.game, PLAYERS.COMPUTER);
  applyRoomAction(value, "host", "submit_orders", { orders: hostOrders }, 3_000);
  const guestView = publicRoomSnapshot(value, "guest");
  assert.equal(guestView.opponentReady, true);
  assert.equal(guestView.youReady, false);
  assert.deepEqual(guestView.game.orders, { human: [], computer: [] });
  assert.equal(JSON.stringify(guestView).includes(hostOrders[0].unitId), true, "public unit ids remain visible");
  assert.equal(JSON.stringify(guestView).includes('"privateOrders"'), false, "private order storage must never be serialized");

  applyRoomAction(value, "guest", "submit_orders", { orders: guestOrders }, 3_001);
  assert.equal(value.game.round, 2);
  assert.equal(value.reports.length, 1);
  assert.equal(value.reports[0].orders.human.length, 3);
  assert.equal(value.reports[0].orders.computer.length, 3);
  const dispatch = reportForSeat(value.reports[0], "guest", value.game.size);
  assert.match(dispatch.movement, /Friendly:/);
  assert.match(dispatch.casualties, /Friendly destroyed: \d+/);
  assert.match(dispatch.casualties, /Enemy destroyed: \d+/);
  assert.match(dispatch.casualties, /Remaining:/);
});

test("the complete 16 × 16 roster alternates into deployment and opens online orders", () => {
  const value = deployAll(joinAndApprove(room(), "battle"));
  assert.equal(value.phase, "orders");
  assert.equal(value.game.size, 16);
  assert.equal(value.game.units.length, 64);
  assert.equal(value.game.units.filter((unit) => unit.player === PLAYERS.HUMAN).length, 32);
  assert.equal(value.game.units.filter((unit) => unit.player === PLAYERS.COMPUTER).length, 32);
  const guest = gameForSeat(publicRoomSnapshot(value, "guest").game, "guest");
  assert.equal(guest.units.filter((unit) => unit.player === PLAYERS.HUMAN && unit.y >= 12).length, 32);
});

test("players may lock different legal rosters while invalid and oversized armies are rejected", () => {
  const value = room();
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_001);
  applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "random" }, 1_002);
  applyRoomAction(value, "guest", "approve_field", {}, 1_003);
  assert.throws(
    () => applyRoomAction(value, "host", "select_army", { army: { sword: 14, artillery: 3 } }, 1_004),
    /at most 16|at most 2 Artillery/,
  );
  applyRoomAction(value, "host", "select_army", { army: { cavalry: 8, axe: 6, artillery: 2 } }, 1_005);
  applyRoomAction(value, "guest", "select_army", { army: { sword: 5, spear: 5, musket: 2 } }, 1_006);
  assert.equal(value.phase, "deployment");
  assert.equal(value.game.reserves.human.length, 16);
  assert.equal(value.game.reserves.computer.length, 12);
  assert.equal(value.game.reserves.human.filter((unit) => unit.type === "artillery").length, 2);
});

test("deployment continues correctly when one player chooses a smaller army", () => {
  const value = room();
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_001);
  applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "random" }, 1_002);
  applyRoomAction(value, "guest", "approve_field", {}, 1_003);
  applyRoomAction(value, "host", "select_army", { army: { sword: 3 } }, 1_004);
  applyRoomAction(value, "guest", "select_army", { army: { sword: 8, spear: 8 } }, 1_005);
  deployAll(value);
  assert.ok(["orders", "ended"].includes(value.phase));
  assert.equal(value.game.units.filter((unit) => unit.player === PLAYERS.HUMAN).length, 3);
  assert.equal(value.game.units.filter((unit) => unit.player === PLAYERS.COMPUTER).length, 16);
});

test("spectators receive a neutral read-only snapshot without private rosters or orders", () => {
  const value = room();
  applyRoomAction(value, "guest", "join", { name: "Guest" }, 1_001);
  applyRoomAction(value, "host", "propose_field", { scenarioId: "skirmish", terrainMode: "random" }, 1_002);
  applyRoomAction(value, "guest", "approve_field", {}, 1_003);
  applyRoomAction(value, "host", "select_army", { army: { cavalry: 16 } }, 1_004);
  const choosing = publicRoomSnapshot(value, "spectator", { host: true, guest: true, spectator: true, spectators: 3 });
  assert.equal(choosing.seat, "spectator");
  assert.deepEqual(choosing.armySelection, { hostReady: true, guestReady: false });
  assert.equal(JSON.stringify(choosing).includes('"cavalry":16'), false);
  assert.equal(choosing.spectatorCount, 3);
  assert.throws(() => applyRoomAction(value, "spectator", "select_army", { army: { sword: 1 } }, 1_005), /seat is not recognized|Spectator/);
});

test("server rebuilds trusted paths and River penalties instead of trusting client fields", () => {
  const game = createGame(getScenario("skirmish"));
  game.phase = "orders";
  game.round = 1;
  game.terrain[5][0] = "river";
  for (let index = 0; index < 3; index += 1) {
    const reserve = game.reserves.human.find((unit) => unit.type === "sword");
    placeUnit(game, reserve, index, 6, "north");
  }
  const units = game.units.filter((unit) => unit.player === PLAYERS.HUMAN);
  const raw = units.map((unit, index) => {
    const move = legalMovesForUnit(game, unit).find((candidate) => index === 0
      ? candidate.to.x === 0 && candidate.to.y === 5
      : candidate.to.y === 5);
    return { kind: "move", unitId: unit.id, to: move.to, facing: "north", riverPenalty: false, path: [] };
  });
  const trusted = roomInternals.trustedOrders(game, PLAYERS.HUMAN, raw);
  assert.equal(trusted[0].riverPenalty, true);
  assert.ok(trusted[0].path.length > 0);
});

test("guest perspective rotates the board, swaps armies, and round-trips orders", () => {
  const game = createGame(getScenario("skirmish"));
  const reserve = game.reserves.computer[0];
  placeUnit(game, reserve, 1, 0, "south");
  const view = gameForSeat(game, "guest");
  const unit = view.units[0];
  assert.equal(unit.player, PLAYERS.HUMAN);
  assert.deepEqual({ x: unit.x, y: unit.y, facing: unit.facing }, { x: 6, y: 7, facing: "north" });
  const canonicalPlacement = placementToCanonical({ unitId: "x", x: 4, y: 7 }, "guest", 8);
  assert.deepEqual(canonicalPlacement, { unitId: "x", x: 3, y: 0 });
  const canonicalOrder = orderToCanonical({ kind: "move", unitId: unit.id, to: { x: 6, y: 6 }, facing: "northeast" }, "guest", 8);
  assert.deepEqual(canonicalOrder.to, { x: 1, y: 1 });
  assert.equal(canonicalOrder.facing, "southwest");
  assert.equal(perspectiveInternals.flipPlayer(PLAYERS.COMPUTER), PLAYERS.HUMAN);
});

test("resigning ends the room and awards victory to the other player", () => {
  const value = joinAndApprove(room());
  applyRoomAction(value, "guest", "resign", {}, 2_000);
  assert.equal(value.phase, "ended");
  assert.equal(value.result.winner, PLAYERS.HUMAN);
  assert.equal(value.result.resignedSeat, "guest");
});

test("room names and seats are validated", () => {
  assert.throws(() => roomInternals.validateTerrainGrid([], getScenario("skirmish")), RoomError);
  const value = room();
  assert.throws(() => applyRoomAction(value, "host", "join", { name: "Wrong seat" }, 1_001), /Only the guest/);
  assert.throws(() => applyRoomAction(value, "guest", "join", { name: " ".repeat(5) }, 1_002), /display name/);
});

test("version-one rooms migrate without exposing or replaying action identifiers", () => {
  const value = room();
  value.version = 1;
  delete value.processedActionIds;
  const migration = migrateRoom(value);
  assert.equal(migration.changed, true);
  assert.equal(migration.room.version, 3);
  rememberProcessedAction(migration.room, "host", "action-12345678");
  assert.equal(actionWasProcessed(migration.room, "host", "action-12345678"), true);
  assert.equal(actionWasProcessed(migration.room, "guest", "action-12345678"), false);
  assert.equal(JSON.stringify(publicRoomSnapshot(migration.room, "host")).includes("processedActionIds"), false);
});
