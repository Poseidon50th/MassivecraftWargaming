import test from "node:test";
import assert from "node:assert/strict";

import { admitRoomCreation, utcDay } from "../src/quota-policy.js";

test("room admission reserves capacity after the daily creation budget", () => {
  const now = Date.UTC(2026, 7, 5, 12);
  const recentByClient = new Map();
  const state = { daily: { day: utcDay(now), count: 2 }, recentByClient };
  const denied = admitRoomCreation(state, "client-a", now, { dailyLimit: 2, clientLimit: 8 });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, "capacity_reserved");
});

test("one connection cannot create rooms continuously", () => {
  const now = Date.UTC(2026, 7, 5, 12);
  const recentByClient = new Map();
  let daily = null;
  for (let index = 0; index < 3; index += 1) {
    const result = admitRoomCreation({ daily, recentByClient }, "client-a", now + index, { dailyLimit: 100, clientLimit: 3, clientWindowMs: 60_000 });
    assert.equal(result.allowed, true);
    daily = result.daily;
  }
  const denied = admitRoomCreation({ daily, recentByClient }, "client-a", now + 3, { dailyLimit: 100, clientLimit: 3, clientWindowMs: 60_000 });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, "room_creation_limited");
  const otherClient = admitRoomCreation({ daily, recentByClient }, "client-b", now + 4, { dailyLimit: 100, clientLimit: 3, clientWindowMs: 60_000 });
  assert.equal(otherClient.allowed, true);
});

test("the admission counter rolls over at midnight UTC", () => {
  const yesterday = Date.UTC(2026, 7, 4, 23, 59);
  const today = Date.UTC(2026, 7, 5, 0, 1);
  const recentByClient = new Map();
  const result = admitRoomCreation(
    { daily: { day: utcDay(yesterday), count: 2_000 }, recentByClient },
    "client-a",
    today,
    { dailyLimit: 2_000 },
  );
  assert.equal(result.allowed, true);
  assert.deepEqual(result.daily, { day: utcDay(today), count: 1 });
});
