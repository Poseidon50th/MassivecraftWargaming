import assert from "node:assert/strict";

import { MultiplayerApi } from "../js/online/api-client.js";
import { PLAYERS, facingsForUnit } from "../js/engine/constants.js";
import { rotationOrder } from "../js/engine/movement.js";
import { createServer } from "vite";

let localServer = null;
let serverUrl = process.env.MW_LIVE_SERVER_URL;
if (!serverUrl) {
  localServer = await createServer({
    root: new URL("..", import.meta.url).pathname,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await localServer.listen();
  const address = localServer.httpServer.address();
  serverUrl = `http://127.0.0.1:${address.port}/test-multiplayer`;
}
let httpRequests = 0;
const countedFetch = (...args) => {
  httpRequests += 1;
  return fetch(...args);
};

function connected(api) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket connection timed out")), 5_000);
    const listener = (event) => {
      if (event.detail.status !== "connected") return;
      clearTimeout(timeout);
      api.removeEventListener("connection", listener);
      resolve();
    };
    api.addEventListener("connection", listener);
  });
}

function artilleryAdjacent(game, x, y) {
  return game.units.some((unit) => unit.alive !== false && unit.type === "artillery" && Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1);
}

function nextPlacement(state, player) {
  const game = state.game;
  const reserve = game.reserves[player][0];
  const rows = player === PLAYERS.HUMAN
    ? Array.from({ length: game.deploymentRows }, (_, index) => game.size - game.deploymentRows + index)
    : Array.from({ length: game.deploymentRows }, (_, index) => index);
  for (const y of rows) {
    for (let x = 0; x < game.size; x += 1) {
      if (game.units.some((unit) => unit.alive !== false && unit.x === x && unit.y === y)) continue;
      if (reserve.type === "artillery" && artilleryAdjacent(game, x, y)) continue;
      return { unitId: reserve.id, x, y };
    }
  }
  throw new Error(`No deployment square remains for ${reserve.id}`);
}

function rotationOrders(game, player) {
  return game.units.filter((unit) => unit.player === player && unit.alive !== false).slice(0, 3).map((unit) => {
    const facings = facingsForUnit(unit);
    return rotationOrder(unit, facings[(facings.indexOf(unit.facing) + 1) % facings.length]);
  });
}

async function certify(scenarioId, expectedUnits) {
  const host = new MultiplayerApi(serverUrl, { fetchImpl: countedFetch });
  const guest = new MultiplayerApi(serverUrl, { fetchImpl: countedFetch });
  const created = await host.createRoom(`Host ${scenarioId}`);
  host.setCredentials({ roomId: created.roomId, token: created.hostToken });
  guest.setCredentials({ roomId: created.roomId, token: created.guestToken });
  let state = (await guest.state()).state;
  const hostConnected = connected(host);
  const guestConnected = connected(guest);
  host.connect();
  guest.connect();
  await Promise.all([hostConnected, guestConnected]);

  state = (await guest.action("join", { name: `Guest ${scenarioId}` })).state;
  state = (await host.action("propose_field", { scenarioId, terrainMode: "random" })).state;
  state = (await guest.action("approve_field", {})).state;
  const requestsBeforeGameplay = httpRequests;

  const placementsPerSide = expectedUnits;
  for (let index = 0; index < placementsPerSide; index += 1) {
    state = (await host.action("place_unit", nextPlacement(state, PLAYERS.HUMAN))).state;
    state = (await guest.action("place_unit", nextPlacement(state, PLAYERS.COMPUTER))).state;
  }
  assert.equal(state.phase, "orders");
  assert.equal(state.game.units.length, expectedUnits * 2);

  const hostOrders = rotationOrders(state.game, PLAYERS.HUMAN);
  const guestOrders = rotationOrders(state.game, PLAYERS.COMPUTER);
  const committed = (await host.action("submit_orders", { orders: hostOrders })).state;
  assert.equal(committed.youReady, true);
  assert.deepEqual(committed.game.orders, { human: [], computer: [] });
  state = (await guest.action("submit_orders", { orders: guestOrders })).state;
  assert.equal(state.game.round, 2);
  assert.equal(state.reports.length, 1);
  assert.equal(state.reports[0].orders.human.length, 3);
  assert.equal(state.reports[0].orders.computer.length, 3);
  assert.equal(httpRequests, requestsBeforeGameplay, "no gameplay action may fall back to HTTP while connected");

  host.close();
  guest.close();
  return { scenarioId, roomId: created.roomId, units: state.game.units.length, round: state.game.round };
}

const results = [];
try {
  results.push(await certify("skirmish", 16));
  results.push(await certify("battle", 32));
  console.log(JSON.stringify({ serverUrl, httpRequests, results }, null, 2));
} finally {
  await localServer?.close();
}
