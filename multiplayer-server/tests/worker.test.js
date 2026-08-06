import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/worker.js", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  plugins: [{
    name: "mock-cloudflare-workers",
    setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "cloudflare-workers", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
        loader: "js",
      }));
    },
  }],
});
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const { MatchRoom } = workerModule;

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

class MockStorage {
  constructor() {
    this.values = new Map();
    this.puts = 0;
    this.alarms = 0;
  }

  get(key) { return this.values.get(key); }
  put(key, value) { this.puts += 1; this.values.set(key, structuredClone(value)); }
  setAlarm(value) { this.alarms += 1; this.alarm = value; }
  deleteAll() { this.values.clear(); }
}

class MockContext {
  constructor() {
    this.storage = new MockStorage();
    this.sockets = [];
  }

  blockConcurrencyWhile(promise) { return promise; }
  getWebSockets(tag = null) { return tag ? this.sockets.filter((socket) => socket.seat === tag) : [...this.sockets]; }
}

async function initializedRoom() {
  const context = new MockContext();
  const room = new MatchRoom(context, {});
  await room.initialize({
    roomId: "ROOM12345678",
    hostName: "Host",
    hostTokenHash: await hash("host-token"),
    guestTokenHash: await hash("guest-token"),
    spectatorTokenHash: await hash("spectator-token"),
    seed: 42,
    now: Date.now(),
  });
  return { context, room };
}

test("room creation writes its alarm once and later HTTP actions write only room state", async () => {
  const { context, room } = await initializedRoom();
  assert.equal(context.storage.puts, 1);
  assert.equal(context.storage.alarms, 1);
  const response = await room.fetch(new Request("https://worker.example/api/rooms/ROOM12345678/action", {
    method: "POST",
    headers: { authorization: "Bearer guest-token", "content-type": "application/json" },
    body: JSON.stringify({ type: "join", payload: { name: "Guest" } }),
  }));
  assert.equal(response.status, 200);
  assert.equal(context.storage.puts, 2);
  assert.equal(context.storage.alarms, 1);
});

test("a duplicated WebSocket action identifier is acknowledged without applying or storing twice", async () => {
  const { context, room } = await initializedRoom();
  const sent = [];
  const socket = {
    seat: "guest",
    deserializeAttachment: () => ({ seat: "guest" }),
    send: (message) => sent.push(JSON.parse(message)),
    close: () => {},
  };
  const action = JSON.stringify({
    type: "action",
    requestId: "action-12345678",
    action: "join",
    payload: { name: "Guest" },
  });
  await room.webSocketMessage(socket, action);
  const putsAfterFirst = context.storage.puts;
  await room.webSocketMessage(socket, action);
  assert.equal(context.storage.puts, putsAfterFirst);
  assert.equal(sent.at(-1).type, "ack");
  assert.equal(sent.at(-1).duplicate, true);
  assert.equal(sent.at(-1).state.players.you.name, "Guest");
});

test("spectator credentials can synchronize but every mutation is rejected", async () => {
  const { context, room } = await initializedRoom();
  const stateResponse = await room.fetch(new Request("https://worker.example/api/rooms/ROOM12345678/state", {
    headers: { authorization: "Bearer spectator-token" },
  }));
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).state.seat, "spectator");

  const response = await room.fetch(new Request("https://worker.example/api/rooms/ROOM12345678/action", {
    method: "POST",
    headers: { authorization: "Bearer spectator-token", "content-type": "application/json" },
    body: JSON.stringify({ type: "join", payload: { name: "Intruder" } }),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "spectator_read_only");
  assert.equal(context.storage.puts, 1);
});
