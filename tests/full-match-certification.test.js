import test from "node:test";
import assert from "node:assert/strict";

import { runCertificationMatch } from "./helpers/match-simulator.js";

const enabled = process.env.RUN_FULL_AI_CERTIFICATION === "1";
const cases = [
  ["corporal", "skirmish", 1101],
  ["corporal", "battle", 1102],
  ["captain", "skirmish", 2201],
  ["captain", "battle", 2202],
  ["general", "skirmish", 3301],
  ["general", "battle", 3302],
  ["codex", "skirmish", 4401],
  ["codex", "battle", 4402],
];

for (const [difficulty, scenarioId, seed] of cases) {
  test(`${difficulty} completes a ${scenarioId === "battle" ? "16 × 16" : "8 × 8"} battle`, { skip: !enabled }, async () => {
    const { game, result, metrics } = await runCertificationMatch({ difficulty, scenarioId, seed });
    assert.ok(["human", "computer", "draw"].includes(result.winner));
    assert.equal(game.phase, "orders");
    assert.ok(metrics.rounds > 0);
    assert.ok(metrics.computerPlans > 0);
    assert.ok(metrics.orderedCount >= Math.min(3, metrics.mobileComputerCount));
    assert.ok(metrics.movedCount > 0, `${difficulty} never moved a unit`);
    assert.ok(metrics.advancedCount > 0, `${difficulty} never advanced toward the player`);
    assert.ok(metrics.averageThinkingMs <= (scenarioId === "battle" && difficulty === "codex" ? 14500 : 6000));
    assert.ok(game.log.some((entry) => entry.text.includes("Friendly destroyed:")));
    assert.ok(game.log.some((entry) => entry.text.includes("Enemy destroyed:")));
  });
}
