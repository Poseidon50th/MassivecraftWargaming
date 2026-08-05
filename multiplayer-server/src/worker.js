import { DurableObject } from "cloudflare:workers";
import {
  actionWasProcessed,
  applyRoomAction,
  cleanPlayerName,
  createInitialRoom,
  migrateRoom,
  publicRoomSnapshot,
  rememberProcessedAction,
  RoomError,
} from "./room-state.js";
import {
  admitRoomCreation,
  DEFAULT_CLIENT_ROOM_LIMIT,
  DEFAULT_CLIENT_WINDOW_MS,
  DEFAULT_DAILY_ROOM_LIMIT,
} from "./quota-policy.js";

const ROOM_ID_PATTERN = /^[A-Z0-9]{12}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_BODY_BYTES = 24_000;
const ACTION_WINDOW_MS = 10_000;
const ACTIONS_PER_WINDOW = 12;
const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1_000;
const AUTH_FAILURE_LIMIT = 8;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function token() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function roomId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("").slice(0, 12).toUpperCase();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new RoomError("That request is too large.", 413, "body_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new RoomError("That request is too large.", 413, "body_too_large");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new RoomError("The server received unreadable room data.", 400, "invalid_json");
  }
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function websocketToken(request) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim());
  if (protocols[0] !== "massivecraft-v1" || !protocols[1]) return null;
  return protocols[1];
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins(env).has(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    "x-content-type-options": "nosniff",
    vary: "Origin",
  };
  if (origin && allowedOrigins(env).has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(response, request, env) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request, env))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorResponse(error) {
  if (error instanceof RoomError) return json({ error: error.message, code: error.code }, error.status);
  console.error(error);
  return json({ error: "The multiplayer server encountered an unexpected problem.", code: "server_error" }, 500);
}

function requestClientKey(request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
}

function websocketText(message) {
  if (typeof message === "string") return message;
  if (message instanceof ArrayBuffer) return new TextDecoder().decode(message);
  if (ArrayBuffer.isView(message)) return new TextDecoder().decode(message);
  throw new RoomError("The live room received an unsupported message.", 400, "invalid_socket_message");
}

function socketMessage(socket, data) {
  socket.send(JSON.stringify(data));
}

export class RoomAdmission extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.daily = null;
    this.recentByClient = new Map();
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const admission = await this.ctx.storage.get("admission") ?? null;
      this.daily = admission?.daily ?? null;
      this.recentByClient = new Map(Object.entries(admission?.clients ?? {}));
    });
  }

  async fetch(request) {
    await this.ready;
    try {
      const body = await readJson(request);
      if (typeof body.clientKey !== "string" || !body.clientKey) throw new RoomError("Room admission data is incomplete.", 400);
      const result = admitRoomCreation(
        { daily: this.daily, recentByClient: this.recentByClient },
        body.clientKey,
        Date.now(),
        {
          dailyLimit: this.env.DAILY_ROOM_CREATION_LIMIT ?? DEFAULT_DAILY_ROOM_LIMIT,
          clientLimit: this.env.CLIENT_ROOM_CREATION_LIMIT ?? DEFAULT_CLIENT_ROOM_LIMIT,
          clientWindowMs: this.env.CLIENT_ROOM_CREATION_WINDOW_MS ?? DEFAULT_CLIENT_WINDOW_MS,
        },
      );
      if (!result.allowed) {
        const status = result.code === "capacity_reserved" ? 503 : 429;
        return json({ error: result.message, code: result.code }, status);
      }
      this.daily = result.daily;
      const cutoff = Date.now() - Number(this.env.CLIENT_ROOM_CREATION_WINDOW_MS ?? DEFAULT_CLIENT_WINDOW_MS);
      const clients = {};
      for (const [key, timestamps] of this.recentByClient) {
        const recent = timestamps.filter((timestamp) => timestamp > cutoff);
        if (recent.length) clients[key] = recent;
      }
      await this.ctx.storage.put("admission", { daily: this.daily, clients });
      return json({ allowed: true });
    } catch (error) {
      return errorResponse(error);
    }
  }
}

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.actionTimes = new Map();
    this.authFailures = new Map();
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get("room") ?? null;
      const migration = migrateRoom(stored);
      this.room = migration.room;
      if (migration.changed) await this.ctx.storage.put("room", this.room);
    });
  }

  async initialize(data) {
    await this.ready;
    if (this.room) throw new RoomError("That room already exists.", 409, "room_exists");
    this.room = createInitialRoom(data);
    await this.persist();
    await this.ctx.storage.setAlarm(this.room.expiresAt);
    return publicRoomSnapshot(this.room, "host", this.connectedSeats());
  }

  connectedSeats() {
    return {
      host: this.ctx.getWebSockets("host").length > 0,
      guest: this.ctx.getWebSockets("guest").length > 0,
    };
  }

  async identify(rawToken, request) {
    if (!rawToken || !this.room) throw new RoomError("This room invitation is missing or invalid.", 401, "unauthorized");
    const key = requestClientKey(request);
    const now = Date.now();
    const recent = (this.authFailures.get(key) ?? []).filter((timestamp) => timestamp > now - AUTH_FAILURE_WINDOW_MS);
    if (recent.length >= AUTH_FAILURE_LIMIT) throw new RoomError("Too many invalid invitation attempts. Wait five minutes, then try again.", 429, "authorization_limited");
    const hashed = await sha256(rawToken);
    if (constantTimeEqual(hashed, this.room.auth.host)) {
      this.authFailures.delete(key);
      return "host";
    }
    if (constantTimeEqual(hashed, this.room.auth.guest)) {
      this.authFailures.delete(key);
      return "guest";
    }
    recent.push(now);
    this.authFailures.set(key, recent);
    throw new RoomError("This room invitation is missing or invalid.", 401, "unauthorized");
  }

  async persist() {
    await this.ctx.storage.put("room", this.room);
  }

  takeActionAllowance(seat, now = Date.now()) {
    const recent = (this.actionTimes.get(seat) ?? []).filter((timestamp) => timestamp > now - ACTION_WINDOW_MS);
    if (recent.length >= ACTIONS_PER_WINDOW) {
      this.actionTimes.set(seat, recent);
      throw new RoomError("Too many room actions were sent at once. Wait a few seconds, then try again.", 429, "action_limited");
    }
    recent.push(now);
    this.actionTimes.set(seat, recent);
  }

  async broadcast() {
    const connected = this.connectedSeats();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const seat = socket.deserializeAttachment()?.seat;
        socket.send(JSON.stringify({ type: "state", state: publicRoomSnapshot(this.room, seat, connected) }));
      } catch {
        try { socket.close(1011, "State synchronization failed"); } catch { /* already closed */ }
      }
    }
  }

  async fetch(request) {
    await this.ready;
    try {
      if (!this.room) throw new RoomError("That private room does not exist.", 404, "room_missing");
      const path = new URL(request.url).pathname;
      if (path.endsWith("/socket")) {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") throw new RoomError("A WebSocket upgrade is required.", 426);
        const seat = await this.identify(websocketToken(request), request);
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        this.ctx.acceptWebSocket(server, [seat]);
        server.serializeAttachment({ seat });
        server.send(JSON.stringify({ type: "state", state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) }));
        queueMicrotask(() => this.broadcast());
        return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": "massivecraft-v1" } });
      }

      const seat = await this.identify(bearerToken(request), request);
      if (request.method === "GET" && path.endsWith("/state")) {
        return json({ state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) });
      }
      if (request.method === "POST" && path.endsWith("/action")) {
        const body = await readJson(request);
        this.takeActionAllowance(seat);
        applyRoomAction(this.room, seat, body.type, body.payload, Date.now());
        await this.persist();
        await this.broadcast();
        return json({ state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) });
      }
      throw new RoomError("That multiplayer route does not exist.", 404, "route_missing");
    } catch (error) {
      return errorResponse(error);
    }
  }

  async webSocketMessage(socket, message) {
    let body = null;
    try {
      const text = websocketText(message);
      if (text.length > MAX_BODY_BYTES) throw new RoomError("That live-room message is too large.", 413, "body_too_large");
      if (text === "ping") {
        socket.send("pong");
        return;
      }
      try {
        body = JSON.parse(text);
      } catch {
        throw new RoomError("The live room received unreadable data.", 400, "invalid_socket_message");
      }
      const seat = socket.deserializeAttachment()?.seat;
      if (!seat) throw new RoomError("The live room seat is missing.", 401, "unauthorized");
      const requestId = body?.requestId;
      if (!ACTION_ID_PATTERN.test(requestId ?? "")) throw new RoomError("The live-room request identifier is invalid.", 400, "invalid_request_id");
      if (body.type === "sync") {
        socketMessage(socket, { type: "ack", requestId, state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) });
        return;
      }
      if (body.type !== "action" || typeof body.action !== "string") throw new RoomError("That live-room message is not recognized.", 400, "invalid_socket_message");
      if (actionWasProcessed(this.room, seat, requestId)) {
        socketMessage(socket, { type: "ack", requestId, duplicate: true, state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) });
        return;
      }
      this.takeActionAllowance(seat);
      applyRoomAction(this.room, seat, body.action, body.payload, Date.now());
      rememberProcessedAction(this.room, seat, requestId);
      await this.persist();
      socketMessage(socket, { type: "ack", requestId, state: publicRoomSnapshot(this.room, seat, this.connectedSeats()) });
      await this.broadcast();
    } catch (error) {
      const response = error instanceof RoomError
        ? { type: "error", requestId: body?.requestId ?? null, error: error.message, code: error.code, status: error.status }
        : { type: "error", requestId: body?.requestId ?? null, error: "The multiplayer server encountered an unexpected problem.", code: "server_error", status: 500 };
      try { socketMessage(socket, response); } catch { /* socket already closed */ }
      if (!(error instanceof RoomError)) console.error(error);
      if (["body_too_large", "invalid_socket_message"].includes(response.code)) {
        try { socket.close(1008, response.error); } catch { /* already closed */ }
      }
    }
  }

  async webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch { /* already closed */ }
    await this.broadcast();
  }

  async webSocketError(socket) {
    try { socket.close(1011, "Connection error"); } catch { /* already closed */ }
  }

  async alarm() {
    await this.ready;
    if (!this.room) return;
    if (Date.now() < this.room.expiresAt) {
      await this.ctx.storage.setAlarm(this.room.expiresAt);
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(1001, "Room expired"); } catch { /* already closed */ }
    }
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}

export default {
  async fetch(request, env) {
    try {
      if (!originAllowed(request, env)) return withCors(json({ error: "This website is not allowed to use the multiplayer server.", code: "origin_denied" }, 403), request, env);
      if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request, env);
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/health") {
        return withCors(json({ ok: true, service: "Massivecraft's Wars Multiplayer", protocolVersion: 2, quotaHardened: true }), request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const body = await readJson(request);
        const hostName = cleanPlayerName(body.hostName);
        const day = new Date().toISOString().slice(0, 10);
        const clientKey = await sha256(`${day}|${requestClientKey(request)}|${(request.headers.get("user-agent") ?? "").slice(0, 160)}`);
        const admission = await env.ROOM_ADMISSION.getByName("global").fetch("https://admission.internal/admit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientKey }),
        });
        if (!admission.ok) {
          const denied = await admission.json().catch(() => ({}));
          throw new RoomError(denied.error ?? "New rooms are temporarily paused. Existing matches can continue.", admission.status, denied.code ?? "capacity_reserved");
        }
        const id = roomId();
        const hostToken = token();
        const guestToken = token();
        const seedBytes = new Uint32Array(1);
        crypto.getRandomValues(seedBytes);
        const stub = env.MATCH_ROOMS.getByName(id);
        const state = await stub.initialize({
          roomId: id,
          hostName,
          hostTokenHash: await sha256(hostToken),
          guestTokenHash: await sha256(guestToken),
          seed: seedBytes[0] || 1,
          now: Date.now(),
        });
        return withCors(json({ roomId: id, hostToken, guestToken, state }, 201), request, env);
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{12})\/(state|action|socket)$/);
      if (!match || !ROOM_ID_PATTERN.test(match[1])) throw new RoomError("That multiplayer route does not exist.", 404, "route_missing");
      const response = await env.MATCH_ROOMS.getByName(match[1]).fetch(request);
      return withCors(response, request, env);
    } catch (error) {
      return withCors(errorResponse(error), request, env);
    }
  },
};
