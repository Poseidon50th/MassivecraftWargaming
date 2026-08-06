import { randomBytes } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  actionWasProcessed,
  applyRoomAction,
  createInitialRoom,
  publicRoomSnapshot,
  rememberProcessedAction,
  RoomError,
} from "../multiplayer-server/src/room-state.js";

function randomText(size = 18) {
  return randomBytes(size).toString("base64url");
}

async function readBody(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text ? JSON.parse(text) : {};
}

function authenticateToken(token, record) {
  if (token === record.hostToken) return "host";
  if (token === record.guestToken) return "guest";
  if (token === record.spectatorToken) return "spectator";
  throw new RoomError("This room invitation is missing or invalid.", 401, "unauthorized");
}

function authenticate(request, record) {
  return authenticateToken((request.headers.authorization ?? "").replace(/^Bearer /, ""), record);
}

function send(response, status, data) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(data));
}

function connectedSeats(record) {
  const spectators = [...record.sockets].filter((socket) => socket.seat === "spectator" && socket.readyState === WebSocket.OPEN).length;
  return {
    host: [...record.sockets].some((socket) => socket.seat === "host" && socket.readyState === WebSocket.OPEN),
    guest: [...record.sockets].some((socket) => socket.seat === "guest" && socket.readyState === WebSocket.OPEN),
    spectator: spectators > 0,
    spectators,
  };
}

function broadcast(record) {
  const connected = connectedSeats(record);
  for (const socket of record.sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    socket.send(JSON.stringify({ type: "state", state: publicRoomSnapshot(record.state, socket.seat, connected) }));
  }
}

export function multiplayerTestPlugin() {
  const rooms = new Map();
  return {
    name: "massivecraft-local-multiplayer-test-server",
    apply: "serve",
    configureServer(server) {
      const webSockets = new WebSocketServer({
        noServer: true,
        handleProtocols(protocols) { return protocols.has("massivecraft-v1") ? "massivecraft-v1" : false; },
      });
      const upgrade = (request, socket, head) => {
        try {
          const url = new URL(request.url, "http://test.local");
          const match = url.pathname.match(/^\/test-multiplayer\/api\/rooms\/([A-Z0-9]{12})\/socket$/);
          if (!match) return;
          const record = rooms.get(match[1]);
          if (!record) throw new RoomError("That private room does not exist.", 404);
          const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim());
          if (protocols[0] !== "massivecraft-v1" || !protocols[1]) throw new RoomError("This room invitation is missing or invalid.", 401);
          const seat = authenticateToken(protocols[1], record);
          webSockets.handleUpgrade(request, socket, head, (client) => {
            client.seat = seat;
            record.sockets.add(client);
            client.send(JSON.stringify({ type: "state", state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) }));
            broadcast(record);
            client.on("message", (raw) => {
              let message = null;
              try {
                message = JSON.parse(raw.toString());
                if (message.type === "sync") {
                  client.send(JSON.stringify({ type: "ack", requestId: message.requestId, state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) }));
                  return;
                }
                if (message.type !== "action") throw new RoomError("That live-room message is not recognized.", 400);
                if (seat === "spectator") throw new RoomError("Spectator mode is read-only.", 403, "spectator_read_only");
                if (actionWasProcessed(record.state, seat, message.requestId)) {
                  client.send(JSON.stringify({ type: "ack", requestId: message.requestId, duplicate: true, state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) }));
                  return;
                }
                applyRoomAction(record.state, seat, message.action, message.payload, Date.now());
                rememberProcessedAction(record.state, seat, message.requestId);
                client.send(JSON.stringify({ type: "ack", requestId: message.requestId, state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) }));
                broadcast(record);
              } catch (error) {
                client.send(JSON.stringify({ type: "error", requestId: message?.requestId ?? null, error: error.message, code: error.code ?? "server_error", status: error.status ?? 500 }));
              }
            });
            client.on("close", () => {
              record.sockets.delete(client);
              broadcast(record);
            });
          });
        } catch {
          socket.destroy();
        }
      };
      server.httpServer?.on("upgrade", upgrade);
      server.httpServer?.once("close", () => {
        server.httpServer?.off("upgrade", upgrade);
        webSockets.close();
      });

      server.middlewares.use("/test-multiplayer", async (request, response) => {
        try {
          const url = new URL(request.url, "http://test.local");
          if (request.method === "GET" && url.pathname === "/api/health") {
            send(response, 200, { ok: true, service: "Local Massivecraft test server", protocolVersion: 3, quotaHardened: true, spectators: true, customArmies: true });
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/rooms") {
            const data = await readBody(request);
            const roomId = randomText(9).replace(/[^A-Z0-9]/gi, "0").slice(0, 12).toUpperCase().padEnd(12, "0");
            const hostToken = randomText();
            const guestToken = randomText();
            const spectatorToken = randomText();
            const state = createInitialRoom({
              roomId,
              hostName: data.hostName,
              hostTokenHash: "test-host",
              guestTokenHash: "test-guest",
              spectatorTokenHash: "test-spectator",
              armySelectionEnabled: Number(data.clientProtocol ?? 0) >= 3,
              seed: 42,
              now: Date.now(),
            });
            const record = { state, hostToken, guestToken, spectatorToken, sockets: new Set() };
            rooms.set(roomId, record);
            send(response, 201, { roomId, hostToken, guestToken, spectatorToken, state: publicRoomSnapshot(state, "host", connectedSeats(record)) });
            return;
          }
          const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{12})\/(state|action)$/);
          if (!match) throw new RoomError("That route does not exist.", 404);
          const record = rooms.get(match[1]);
          if (!record) throw new RoomError("That private room does not exist.", 404);
          const seat = authenticate(request, record);
          if (request.method === "GET" && match[2] === "state") {
            send(response, 200, { state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) });
            return;
          }
          if (request.method === "POST" && match[2] === "action") {
            if (seat === "spectator") throw new RoomError("Spectator mode is read-only.", 403, "spectator_read_only");
            const data = await readBody(request);
            applyRoomAction(record.state, seat, data.type, data.payload, Date.now());
            broadcast(record);
            send(response, 200, { state: publicRoomSnapshot(record.state, seat, connectedSeats(record)) });
            return;
          }
          throw new RoomError("That route does not exist.", 404);
        } catch (error) {
          send(response, error.status || 500, { error: error.message, code: error.code || "server_error" });
        }
      });
    },
  };
}
