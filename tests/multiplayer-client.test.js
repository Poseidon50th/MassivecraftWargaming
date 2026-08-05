import test from "node:test";
import assert from "node:assert/strict";

import { MultiplayerApi } from "../js/online/api-client.js";

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocols) {
    super();
    this.url = url;
    this.protocols = protocols;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  send(message) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("Socket is closed");
    this.sent.push(message);
  }

  receive(message) {
    this.dispatchEvent(new MessageEvent("message", { data: typeof message === "string" ? message : JSON.stringify(message) }));
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

test("the browser fetch implementation remains bound to its global object", async () => {
  function browserStyleFetch(url, options) {
    assert.equal(this, globalThis);
    assert.equal(url, "https://worker.example/api/rooms");
    assert.equal(options.method, "POST");
    return Promise.resolve(new Response(JSON.stringify({ roomId: "ROOM12345678" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
  }
  const api = new MultiplayerApi("https://worker.example", { fetchImpl: browserStyleFetch, WebSocketImpl: null });
  const result = await api.createRoom("Host");
  assert.equal(result.roomId, "ROOM12345678");
  api.close();
});

test("room actions travel through the live socket without an HTTP request", async () => {
  FakeWebSocket.instances = [];
  let fetchCalls = 0;
  const api = new MultiplayerApi("https://worker.example", {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("HTTP should not be used for a live action");
    },
    WebSocketImpl: FakeWebSocket,
  });
  api.setCredentials({ roomId: "ROOM12345678", token: "host-token" });
  api.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  const pending = api.action("approve_field", {});
  assert.equal(socket.sent.length, 1);
  const sent = JSON.parse(socket.sent[0]);
  assert.equal(sent.type, "action");
  assert.equal(sent.action, "approve_field");
  assert.match(sent.requestId, /^[A-Za-z0-9_-]{8,80}$/);
  socket.receive({ type: "ack", requestId: sent.requestId, state: { phase: "deployment" } });
  const result = await pending;
  assert.equal(result.state.phase, "deployment");
  assert.equal(fetchCalls, 0);
  api.close();
});

test("connected focus synchronization uses the socket and never starts polling", async () => {
  FakeWebSocket.instances = [];
  let fetchCalls = 0;
  const api = new MultiplayerApi("https://worker.example", {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("HTTP should not be used while connected");
    },
    WebSocketImpl: FakeWebSocket,
  });
  api.setCredentials({ roomId: "ROOM12345678", token: "host-token" });
  api.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  const pending = api.syncOnFocus();
  const sent = JSON.parse(socket.sent[0]);
  assert.equal(sent.type, "sync");
  socket.receive({ type: "ack", requestId: sent.requestId, state: { round: 7 } });
  const result = await pending;
  assert.equal(result.state.round, 7);
  assert.equal(fetchCalls, 0);
  assert.equal("pollTimer" in api, false);
  api.close();
});
