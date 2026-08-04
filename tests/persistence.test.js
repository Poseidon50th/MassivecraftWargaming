import test from "node:test";
import assert from "node:assert/strict";

import { buildTutorialGame } from "../js/data/tutorial.js";
import { getScenario } from "../js/data/scenarios.js";
import { createGame } from "../js/engine/model.js";
import { SAVE_VERSION, migrateSave, validateSave } from "../js/controllers/persistence-controller.js";

test("version-one saves migrate and interrupted resolution resumes safely", () => {
  const legacy = createGame(getScenario("skirmish"));
  legacy.version = 1;
  legacy.phase = "resolving";
  legacy.round = 4;
  legacy.orders.human = [{ unitId: "stale" }];
  const migrated = validateSave(legacy);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.phase, "orders");
  assert.deepEqual(migrated.orders, { human: [], computer: [] });
  assert.match(migrated.log[0].text, /interrupted round was cancelled/i);
});

test("version-two saves receive a stable default opponent and seed", () => {
  const legacy = createGame(getScenario("skirmish"));
  legacy.version = 2;
  delete legacy.aiDifficulty;
  delete legacy.aiSeed;
  const migrated = validateSave(legacy);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.aiDifficulty, "captain");
  assert.equal(migrated.aiSeed, 1);
});

test("save validation rejects corrupt terrain, duplicate units, and unknown versions", () => {
  const corruptTerrain = buildTutorialGame();
  corruptTerrain.terrain[0][0] = "lava";
  assert.throws(() => validateSave(corruptTerrain), /unknown terrain/i);

  const duplicate = buildTutorialGame();
  duplicate.units[1].x = duplicate.units[0].x;
  duplicate.units[1].y = duplicate.units[0].y;
  assert.throws(() => validateSave(duplicate), /same square/i);

  assert.throws(() => migrateSave({ version: 999 }), /unsupported version/i);
});
