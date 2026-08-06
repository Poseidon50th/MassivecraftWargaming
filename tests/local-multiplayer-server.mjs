import http from "node:http";
import { randomBytes } from "node:crypto";
import { applyRoomAction, createInitialRoom, publicRoomSnapshot, RoomError } from "../multiplayer-server/src/room-state.js";

const rooms = new Map();
const port = Number(process.env.MW_TEST_SERVER_PORT || 8787);

function randomText(size = 18) {
  return randomBytes(size).toString("base64url");
}

function headers(origin = "*") {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  };
}

function send(response, status, body, origin) {
  response.writeHead(status, headers(origin));
  response.end(JSON.stringify(body));
}

async function body(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text ? JSON.parse(text) : {};
}

function authenticate(request, record) {
  const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  if (token === record.hostToken) return "host";
  if (token === record.guestToken) return "guest";
  if (token === record.spectatorToken) return "spectator";
  throw new RoomError("This room invitation is missing or invalid.", 401, "unauthorized");
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "*";
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers(origin));
      response.end();
      return;
    }
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      send(response, 200, { ok: true, service: "Local Massivecraft test server", protocolVersion: 3, quotaHardened: true, spectators: true, customArmies: true }, origin);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const data = await body(request);
      const roomId = randomText(9).replace(/[^A-Z0-9]/gi, "0").slice(0, 12).toUpperCase().padEnd(12, "0");
      const hostToken = randomText();
      const guestToken = randomText();
      const spectatorToken = randomText();
      const state = createInitialRoom({ roomId, hostName: data.hostName, hostTokenHash: "test-host", guestTokenHash: "test-guest", spectatorTokenHash: "test-spectator", armySelectionEnabled: Number(data.clientProtocol ?? 0) >= 3, seed: 42, now: Date.now() });
      rooms.set(roomId, { state, hostToken, guestToken, spectatorToken });
      send(response, 201, { roomId, hostToken, guestToken, spectatorToken, state: publicRoomSnapshot(state, "host") }, origin);
      return;
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{12})\/(state|action)$/);
    if (!match) throw new RoomError("That route does not exist.", 404);
    const record = rooms.get(match[1]);
    if (!record) throw new RoomError("That private room does not exist.", 404);
    const seat = authenticate(request, record);
    if (request.method === "GET" && match[2] === "state") {
      send(response, 200, { state: publicRoomSnapshot(record.state, seat, { host: true, guest: Boolean(record.state.players.guest.name) }) }, origin);
      return;
    }
    if (request.method === "POST" && match[2] === "action") {
      if (seat === "spectator") throw new RoomError("Spectator mode is read-only.", 403, "spectator_read_only");
      const data = await body(request);
      applyRoomAction(record.state, seat, data.type, data.payload, Date.now());
      send(response, 200, { state: publicRoomSnapshot(record.state, seat, { host: true, guest: Boolean(record.state.players.guest.name) }) }, origin);
      return;
    }
    throw new RoomError("That route does not exist.", 404);
  } catch (error) {
    send(response, error.status || 500, { error: error.message, code: error.code || "server_error" }, origin);
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Local multiplayer test server listening on ${port}\n`);
});
