import { createSeededRandom } from "../../js/ai/random.js";
import { armyValidationError, normalizeArmy } from "../../js/data/armies.js";
import { getScenario } from "../../js/data/scenarios.js";
import { facingsForUnit, oppositePlayer, PLAYERS, TERRAIN, UNIT_DEFS } from "../../js/engine/constants.js";
import { activeUnits, createGame, isDeploymentSquare, isInside, placeUnit, unitAt } from "../../js/engine/model.js";
import { legalMovesForUnit, rotationOrder, validateOrders } from "../../js/engine/movement.js";
import { resolveRound } from "../../js/engine/resolution.js";
import { isStartingRow, randomizeTerrain } from "../../js/engine/terrain.js";
import { evaluateVictory } from "../../js/engine/victory.js";

export const ROOM_VERSION = 3;
export const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_NAME_LENGTH = 32;
export const MAX_DECLINE_LENGTH = 240;
export const MAX_RECENT_ACTION_IDS = 32;

const SCENARIO_IDS = new Set(["skirmish", "battle"]);
const TERRAIN_TYPES = new Set(Object.keys(TERRAIN));

export class RoomError extends Error {
  constructor(message, status = 400, code = "invalid_action") {
    super(message);
    this.name = "RoomError";
    this.status = status;
    this.code = code;
  }
}

export function cleanPlayerName(value) {
  if (typeof value !== "string") throw new RoomError("Enter a display name.");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (!name) throw new RoomError("Enter a display name.");
  if (name.length > MAX_NAME_LENGTH) throw new RoomError(`Display names may contain at most ${MAX_NAME_LENGTH} characters.`);
  return name;
}

function cleanDeclineReason(value) {
  if (value === undefined || value === null) return "Please choose a different battlefield.";
  if (typeof value !== "string") throw new RoomError("The requested change must be text.");
  const reason = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (reason.length > MAX_DECLINE_LENGTH) throw new RoomError(`The requested change may contain at most ${MAX_DECLINE_LENGTH} characters.`);
  return reason || "Please choose a different battlefield.";
}

export function canonicalPlayerForSeat(seat) {
  if (seat === "host") return PLAYERS.HUMAN;
  if (seat === "guest") return PLAYERS.COMPUTER;
  throw new RoomError("That room seat is not recognized.", 403, "invalid_seat");
}

export function seatForCanonicalPlayer(player) {
  return player === PLAYERS.HUMAN ? "host" : "guest";
}

export function createInitialRoom({
  roomId,
  hostName,
  hostTokenHash,
  guestTokenHash,
  spectatorTokenHash = null,
  armySelectionEnabled = true,
  seed = 1,
  now = Date.now(),
}) {
  return {
    version: ROOM_VERSION,
    roomId,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ROOM_TTL_MS,
    seed: Number(seed) >>> 0 || 1,
    phase: "lobby",
    players: {
      host: { name: cleanPlayerName(hostName), joinedAt: now },
      guest: { name: null, joinedAt: null },
    },
    auth: { host: hostTokenHash, guest: guestTokenHash, spectator: spectatorTokenHash },
    armySelectionEnabled: Boolean(armySelectionEnabled),
    armies: { human: null, computer: null },
    proposal: null,
    game: null,
    deploymentTurn: null,
    ready: { human: false, computer: false },
    privateOrders: { human: null, computer: null },
    processedActionIds: { host: [], guest: [] },
    reports: [],
    result: null,
  };
}

export function migrateRoom(room) {
  if (!room || typeof room !== "object") return { room: null, changed: false };
  if (room.version === ROOM_VERSION) {
    let changed = false;
    if (!room.processedActionIds) {
      room.processedActionIds = { host: [], guest: [] };
      changed = true;
    }
    if (!room.armies) {
      room.armies = { human: null, computer: null };
      changed = true;
    }
    if (room.armySelectionEnabled === undefined) {
      room.armySelectionEnabled = false;
      changed = true;
    }
    if (!Object.hasOwn(room.auth ?? {}, "spectator")) {
      room.auth ??= {};
      room.auth.spectator = null;
      changed = true;
    }
    return { room, changed };
  }
  if ([1, 2].includes(room.version)) {
    room.version = ROOM_VERSION;
    room.processedActionIds = { host: [], guest: [] };
    room.armySelectionEnabled = false;
    room.armies = { human: null, computer: null };
    room.auth ??= {};
    room.auth.spectator = null;
    return { room, changed: true };
  }
  return { room, changed: false };
}

export function actionWasProcessed(room, seat, requestId) {
  return Boolean(requestId && room?.processedActionIds?.[seat]?.includes(requestId));
}

export function rememberProcessedAction(room, seat, requestId) {
  if (!requestId) return;
  room.processedActionIds ??= { host: [], guest: [] };
  const ids = room.processedActionIds[seat] ?? [];
  if (!ids.includes(requestId)) ids.push(requestId);
  room.processedActionIds[seat] = ids.slice(-MAX_RECENT_ACTION_IDS);
}

function touch(room, now) {
  room.updatedAt = now;
  room.expiresAt = now + ROOM_TTL_MS;
}

function requireGuest(room) {
  if (!room.players.guest.name) throw new RoomError("The invited player has not joined yet.", 409, "guest_missing");
}

function requirePhase(room, ...phases) {
  if (!phases.includes(room.phase)) {
    throw new RoomError("That action is not available during the current room phase.", 409, "wrong_phase");
  }
}

function requireSeat(actual, expected) {
  if (actual !== expected) throw new RoomError(`Only the ${expected} may do that.`, 403, "wrong_seat");
}

function validateTerrainGrid(terrain, scenario) {
  if (!Array.isArray(terrain) || terrain.length !== scenario.size) {
    throw new RoomError(`The battlefield must contain exactly ${scenario.size} rows.`);
  }
  return terrain.map((row, y) => {
    if (!Array.isArray(row) || row.length !== scenario.size) {
      throw new RoomError(`Every battlefield row must contain exactly ${scenario.size} squares.`);
    }
    return row.map((type) => {
      if (typeof type !== "string" || !TERRAIN_TYPES.has(type)) throw new RoomError("The battlefield contains an unknown terrain type.");
      if (isStartingRow({ size: scenario.size, deploymentRows: scenario.deploymentRows }, y) && type !== "plain") {
        throw new RoomError("Starting rows must remain clear of special terrain.");
      }
      return type;
    });
  });
}

function buildProposedTerrain(room, scenario, terrainMode, suppliedTerrain, revision) {
  if (terrainMode === "manual") return validateTerrainGrid(suppliedTerrain, scenario);
  if (terrainMode !== "random") throw new RoomError("Choose random or manual terrain placement.");
  const draft = createGame(scenario);
  const random = createSeededRandom((room.seed + revision * 2654435761) >>> 0);
  randomizeTerrain(draft, random);
  return draft.terrain;
}

function artilleryAdjacent(game, x, y) {
  return game.units.some(
    (unit) => unit.alive !== false && unit.type === "artillery" && Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  );
}

function trustedOrders(game, player, rawOrders) {
  if (!Array.isArray(rawOrders)) throw new RoomError("Orders must be submitted as a list.");
  const orders = rawOrders.map((raw) => {
    if (!raw || typeof raw !== "object" || typeof raw.unitId !== "string") throw new RoomError("An order is incomplete.");
    const unit = game.units.find((candidate) => candidate.id === raw.unitId && candidate.alive !== false && candidate.player === player);
    if (!unit) throw new RoomError("An order refers to an unavailable unit.");
    if (typeof raw.facing !== "string" || !facingsForUnit(unit).includes(raw.facing)) {
      throw new RoomError("That unit cannot use the chosen final facing.");
    }
    if (raw.kind === "rotate") return rotationOrder(unit, raw.facing);
    if (raw.kind !== "move" || !raw.to || !Number.isInteger(raw.to.x) || !Number.isInteger(raw.to.y)) {
      throw new RoomError("An order has an unknown movement type.");
    }
    const legal = legalMovesForUnit(game, unit).find((move) => move.to.x === raw.to.x && move.to.y === raw.to.y);
    if (!legal) throw new RoomError("At least one movement order is no longer available.");
    return { ...legal, facing: raw.facing };
  });
  const error = validateOrders(game, player, orders);
  if (error) throw new RoomError(error);
  return orders;
}

function coordinate(position, size) {
  return `${String.fromCharCode(65 + position.x)}${size - position.y}`;
}

function structuredOrder(gameBefore, gameAfter, order) {
  const before = gameBefore.units.find((unit) => unit.id === order.unitId);
  const after = gameAfter.units.find((unit) => unit.id === order.unitId);
  return {
    unitId: order.unitId,
    player: before.player,
    type: before.type,
    kind: order.kind,
    from: { x: before.x, y: before.y },
    to: { x: after.x, y: after.y },
    facing: after.facing,
  };
}

function buildRoundReport(before, after, humanOrders, computerOrders, resolution) {
  return {
    round: before.round,
    orders: {
      human: humanOrders.map((order) => structuredOrder(before, after, order)),
      computer: computerOrders.map((order) => structuredOrder(before, after, order)),
    },
    casualties: resolution.casualties.map((unit) => ({
      unitId: unit.id,
      player: unit.player,
      type: unit.type,
      at: { x: unit.x, y: unit.y },
      coordinate: coordinate(unit, before.size),
    })),
    remaining: {
      human: activeUnits(after, PLAYERS.HUMAN).length,
      computer: activeUnits(after, PLAYERS.COMPUTER).length,
    },
    events: [...(resolution.events ?? [])],
  };
}

function startApprovedGame(room) {
  const scenario = getScenario(room.proposal.scenarioId);
  const game = createGame(scenario, {
    human: room.armies.human ?? scenario.army,
    computer: room.armies.computer ?? scenario.army,
  });
  game.mode = "online";
  game.terrainMode = room.proposal.terrainMode;
  game.terrain = structuredClone(room.proposal.terrain);
  game.phase = "deployment";
  game.log = [{ round: 0, text: "The guest approved the battlefield. Alternating deployment began." }];
  room.game = game;
  room.phase = "deployment";
  room.deploymentTurn = PLAYERS.HUMAN;
  room.ready = { human: false, computer: false };
  room.privateOrders = { human: null, computer: null };
  room.result = null;
}

function beginArmySelection(room) {
  room.phase = "armies";
  room.armies = { human: null, computer: null };
  room.game = null;
  room.deploymentTurn = null;
  room.ready = { human: false, computer: false };
  room.privateOrders = { human: null, computer: null };
}

function finishDeployment(room) {
  room.phase = "orders";
  room.deploymentTurn = null;
  room.game.phase = "orders";
  room.game.round = 1;
  room.game.log.unshift({ round: 1, text: "Both armies completed deployment. The first Orders Phase began." });
  const openingResult = evaluateVictory(room.game);
  if (openingResult) finishRoom(room, openingResult, null);
}

function finishRoom(room, result, resignedSeat) {
  room.phase = "ended";
  room.result = { ...result, resignedSeat, finishedAt: room.updatedAt };
  if (room.game) {
    room.game.phase = "ended";
    room.game.winner = result.winner;
    room.game.defeatReason = result.reason;
  }
  room.ready = { human: false, computer: false };
  room.privateOrders = { human: null, computer: null };
}

function applyJoin(room, seat, payload, now) {
  requireSeat(seat, "guest");
  requirePhase(room, "lobby", "proposal");
  const name = cleanPlayerName(payload?.name);
  if (room.players.guest.name && room.players.guest.name !== name) {
    throw new RoomError("That invited seat has already been claimed.", 409, "seat_claimed");
  }
  room.players.guest = { name, joinedAt: room.players.guest.joinedAt ?? now };
}

function applyProposal(room, seat, payload) {
  requireSeat(seat, "host");
  requireGuest(room);
  requirePhase(room, "lobby", "proposal");
  if (!SCENARIO_IDS.has(payload?.scenarioId)) throw new RoomError("Choose the 8 × 8 or 16 × 16 battlefield.");
  const scenario = getScenario(payload.scenarioId);
  const revision = (room.proposal?.revision ?? 0) + 1;
  const terrainMode = payload?.terrainMode;
  room.proposal = {
    revision,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    size: scenario.size,
    terrainMode,
    terrain: buildProposedTerrain(room, scenario, terrainMode, payload?.terrain, revision),
    status: "pending",
    declineReason: null,
  };
  room.phase = "proposal";
}

function applyProposalDecision(room, seat, payload, accepted) {
  requireSeat(seat, "guest");
  requireGuest(room);
  requirePhase(room, "proposal");
  if (!room.proposal || room.proposal.status !== "pending") throw new RoomError("There is no battlefield awaiting approval.", 409);
  if (accepted) {
    room.proposal.status = "approved";
    if (room.armySelectionEnabled) beginArmySelection(room);
    else startApprovedGame(room);
  } else {
    room.proposal.status = "declined";
    room.proposal.declineReason = cleanDeclineReason(payload?.reason);
  }
}

function applyArmySelection(room, seat, payload) {
  requirePhase(room, "armies");
  const player = canonicalPlayerForSeat(seat);
  if (room.armies[player]) throw new RoomError("Your army is already locked.", 409, "army_already_ready");
  const scenario = getScenario(room.proposal.scenarioId);
  const error = armyValidationError(payload?.army, scenario.size);
  if (error) throw new RoomError(error, 400, "invalid_army");
  const army = normalizeArmy(payload.army);
  room.armies[player] = army;
  const enemy = oppositePlayer(player);
  if (room.armies[enemy]) startApprovedGame(room);
}

function applyArmyWithdrawal(room, seat) {
  requirePhase(room, "armies");
  const player = canonicalPlayerForSeat(seat);
  if (!room.armies[player]) throw new RoomError("You have not locked an army.", 409, "army_not_ready");
  room.armies[player] = null;
}

function applyPlacement(room, seat, payload) {
  requirePhase(room, "deployment");
  const player = canonicalPlayerForSeat(seat);
  if (room.deploymentTurn !== player) throw new RoomError("Wait for the other player to place a unit.", 409, "not_your_turn");
  const x = payload?.x;
  const y = payload?.y;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isInside(room.game, x, y) || !isDeploymentSquare(room.game, player, y)) {
    throw new RoomError("Choose an empty square in your deployment rows.");
  }
  if (unitAt(room.game, x, y)) throw new RoomError("That deployment square is occupied.");
  const reserve = room.game.reserves[player].find((unit) => unit.id === payload?.unitId);
  if (!reserve) throw new RoomError("That reserve unit is unavailable.");
  if (reserve.type === "artillery" && artilleryAdjacent(room.game, x, y)) {
    throw new RoomError("Artillery cannot be placed adjacent to another Artillery unit.");
  }
  placeUnit(room.game, reserve, x, y, player === PLAYERS.HUMAN ? "north" : "south");
  const enemy = oppositePlayer(player);
  if (!room.game.reserves.human.length && !room.game.reserves.computer.length) {
    finishDeployment(room);
    return;
  }
  room.deploymentTurn = room.game.reserves[enemy].length ? enemy : player;
}

function applyOrders(room, seat, payload) {
  requirePhase(room, "orders");
  const player = canonicalPlayerForSeat(seat);
  if (room.ready[player]) throw new RoomError("Your orders are already committed.", 409, "already_ready");
  room.privateOrders[player] = trustedOrders(room.game, player, payload?.orders);
  room.ready[player] = true;
  const enemy = oppositePlayer(player);
  if (!room.ready[enemy]) return;

  const before = structuredClone(room.game);
  const humanOrders = room.privateOrders.human;
  const computerOrders = room.privateOrders.computer;
  const resolution = resolveRound(room.game, humanOrders, computerOrders);
  room.game = resolution.game;
  room.reports.unshift(buildRoundReport(before, room.game, humanOrders, computerOrders, resolution));
  room.reports = room.reports.slice(0, 50);
  room.ready = { human: false, computer: false };
  room.privateOrders = { human: null, computer: null };
  const result = evaluateVictory(room.game);
  if (result) finishRoom(room, result, null);
}

function applyWithdraw(room, seat) {
  requirePhase(room, "orders");
  const player = canonicalPlayerForSeat(seat);
  if (!room.ready[player]) throw new RoomError("You have not committed any orders.", 409);
  room.ready[player] = false;
  room.privateOrders[player] = null;
}

function applyResign(room, seat) {
  requirePhase(room, "deployment", "orders");
  const player = canonicalPlayerForSeat(seat);
  const winner = oppositePlayer(player);
  finishRoom(room, { winner, reason: `${room.players[seat].name} resigned the battle.` }, seat);
}

export function applyRoomAction(room, seat, type, payload = {}, now = Date.now()) {
  if (!room || room.version !== ROOM_VERSION) throw new RoomError("This room cannot be opened by the current server.", 409, "room_version");
  if (room.expiresAt <= now) throw new RoomError("This room has expired after 30 days without activity.", 410, "room_expired");
  touch(room, now);
  if (type === "join") applyJoin(room, seat, payload, now);
  else if (type === "propose_field") applyProposal(room, seat, payload);
  else if (type === "approve_field") applyProposalDecision(room, seat, payload, true);
  else if (type === "decline_field") applyProposalDecision(room, seat, payload, false);
  else if (type === "select_army") applyArmySelection(room, seat, payload);
  else if (type === "withdraw_army") applyArmyWithdrawal(room, seat);
  else if (type === "place_unit") applyPlacement(room, seat, payload);
  else if (type === "submit_orders") applyOrders(room, seat, payload);
  else if (type === "withdraw_orders") applyWithdraw(room, seat);
  else if (type === "resign") applyResign(room, seat);
  else throw new RoomError("That room action is not recognized.", 400, "unknown_action");
  return room;
}

function sanitizeGame(game) {
  if (!game) return null;
  const publicGame = structuredClone(game);
  publicGame.orders = { human: [], computer: [] };
  publicGame.selectedUnitId = null;
  publicGame.log = [];
  delete publicGame.aiState;
  delete publicGame.aiSeed;
  delete publicGame.aiDifficulty;
  return publicGame;
}

export function publicRoomSnapshot(room, seat, connected = { host: false, guest: false }) {
  const spectator = seat === "spectator";
  const player = spectator ? null : canonicalPlayerForSeat(seat);
  const enemy = spectator ? null : oppositePlayer(player);
  const opponentSeat = seat === "host" ? "guest" : "host";
  return {
    protocolVersion: ROOM_VERSION,
    roomId: room.roomId,
    seat,
    phase: room.phase,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt,
    players: {
      host: { name: room.players.host.name, connected: Boolean(connected.host) },
      guest: { name: room.players.guest.name, connected: Boolean(connected.guest) },
      you: spectator
        ? { name: "Spectator", connected: Boolean(connected.spectator) }
        : { name: room.players[seat].name, connected: Boolean(connected[seat]) },
      opponent: spectator
        ? { name: null, connected: false }
        : { name: room.players[opponentSeat].name, connected: Boolean(connected[opponentSeat]) },
    },
    spectatorCount: Number(connected.spectators ?? 0),
    proposal: room.proposal ? structuredClone(room.proposal) : null,
    game: sanitizeGame(room.game),
    armySelection: spectator
      ? {
          hostReady: Boolean(room.armies.human),
          guestReady: Boolean(room.armies.computer),
        }
      : {
          youArmy: room.armies[player] ? structuredClone(room.armies[player]) : null,
          youReady: Boolean(room.armies[player]),
          opponentReady: Boolean(room.armies[enemy]),
        },
    deploymentTurn: room.deploymentTurn === null
      ? null
      : spectator
        ? seatForCanonicalPlayer(room.deploymentTurn)
        : room.deploymentTurn === player ? "you" : "opponent",
    youReady: spectator ? false : Boolean(room.ready[player]),
    opponentReady: spectator ? false : Boolean(room.ready[enemy]),
    readiness: {
      host: Boolean(room.ready.human),
      guest: Boolean(room.ready.computer),
    },
    reports: structuredClone(room.reports),
    result: room.result ? structuredClone(room.result) : null,
  };
}

export function unitLabel(type) {
  return UNIT_DEFS[type]?.name ?? type;
}

export const roomInternals = Object.freeze({ trustedOrders, validateTerrainGrid });
