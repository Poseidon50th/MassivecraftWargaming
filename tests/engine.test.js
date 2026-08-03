import test from "node:test";
import assert from "node:assert/strict";

import { chooseComputerOrders, deployComputerUnit } from "../js/ai/computer.js";
import { getScenario } from "../js/data/scenarios.js";
import { computeControl, controlOwner, controlStatus } from "../js/engine/control.js";
import { buildTutorialGame, TUTORIAL_PLANS, tutorialEnemyOrders } from "../js/data/tutorial.js";
import { createGame, placeUnit, unitAt } from "../js/engine/model.js";
import { legalMovesForUnit, rotationOrder, validateOrders } from "../js/engine/movement.js";
import { resolveRound } from "../js/engine/resolution.js";
import { evaluateVictory, forcedDefeatStatus, immediateDefeat } from "../js/engine/victory.js";

function gameWith(units, size = 8) {
  return {
    version: 1,
    size,
    round: 1,
    phase: "orders",
    terrain: Array.from({ length: size }, () => Array(size).fill("plain")),
    units: units.map((unit) => ({ alive: true, facing: "north", ...unit })),
    orders: { human: [], computer: [] },
    log: [],
  };
}

test("Swords project self-control and four orthogonal fields", () => {
  const game = gameWith([{ id: "h-sword", player: "human", type: "sword", x: 3, y: 3 }]);
  const control = computeControl(game);
  assert.equal(control[3][3].human, 3);
  assert.equal(control[2][3].human, 3);
  assert.equal(control[3][4].human, 3);
  assert.equal(control[4][3].human, 3);
  assert.equal(control[3][2].human, 3);
  assert.equal(control[2][2].human, 0);
});

test("every directional unit projects the documented north-facing pattern", () => {
  const spear = computeControl(gameWith([{ id: "spear", player: "human", type: "spear", x: 3, y: 3 }]));
  assert.deepEqual([spear[2][2].human, spear[2][3].human, spear[2][4].human], [3, 3, 3]);
  assert.equal(spear[3][2].human, 0);

  const axe = computeControl(gameWith([{ id: "axe", player: "human", type: "axe", x: 3, y: 3 }]));
  assert.equal(axe[2][3].human, 5);
  assert.equal(axe[3][2].human, 0);

  const musket = computeControl(gameWith([{ id: "musket", player: "human", type: "musket", x: 3, y: 5 }]));
  assert.deepEqual([musket[4][3].human, musket[3][3].human, musket[2][3].human], [3, 2, 1]);

  const artillery = computeControl(gameWith([{ id: "artillery", player: "human", type: "artillery", x: 3, y: 7 }]));
  assert.deepEqual([artillery[3][2].human, artillery[3][3].human, artillery[3][4].human], [3, 3, 3]);
  assert.deepEqual([artillery[2][2].human, artillery[2][3].human, artillery[2][4].human], [3, 3, 3]);
});

test("self-control stays at printed strength on Hill and in Fog", () => {
  const game = gameWith([
    { id: "hill-sword", player: "human", type: "sword", x: 2, y: 3 },
    { id: "fog-axe", player: "human", type: "axe", x: 5, y: 5 },
  ]);
  game.terrain[3][2] = "hill";
  game.terrain[5][5] = "fog";
  const control = computeControl(game);
  assert.equal(control[3][2].human, 3, "Hill must not raise self-control");
  assert.equal(control[2][2].human, 4, "Hill raises projected control");
  assert.equal(control[5][5].human, 5, "Fog must not lower self-control");
  assert.equal(control[4][5].human, 4, "Fog lowers projected control");
});

test("friendly, contested, and enemy classification compares total control", () => {
  assert.equal(controlOwner({ human: 5, computer: 3 }), "human");
  assert.equal(controlOwner({ human: 3, computer: 3 }), "contested");
  assert.equal(controlOwner({ human: 2, computer: 4 }), "computer");
  assert.equal(controlStatus({ human: 5, computer: 3 }, "human"), "friendly");
  assert.equal(controlStatus({ human: 3, computer: 3 }, "human"), "contested");
  assert.equal(controlStatus({ human: 2, computer: 4 }, "human"), "enemy");
});

test("Artillery neither supports an allied occupant nor fires while its own tile is disputed", () => {
  const supportGame = gameWith([
    { id: "artillery", player: "human", type: "artillery", x: 3, y: 7 },
    { id: "ally", player: "human", type: "sword", x: 3, y: 3 },
  ]);
  assert.equal(computeControl(supportGame)[3][3].human, 3, "only the ally's self-control should remain");

  const disputedGame = gameWith([
    { id: "artillery", player: "human", type: "artillery", x: 3, y: 7 },
    { id: "enemy", player: "computer", type: "sword", x: 3, y: 6 },
  ]);
  const disputed = computeControl(disputedGame);
  assert.deepEqual(disputed[7][3], { human: 3, computer: 3 });
  assert.equal(disputed[3][3].human, 0, "disputed Artillery must stop projecting");
});

test("a wall blocks ranged control on and beyond it", () => {
  const game = gameWith([{ id: "h-musket", player: "human", type: "musket", x: 3, y: 6 }]);
  game.terrain[5][3] = "wall";
  const control = computeControl(game);
  assert.equal(control[5][3].human, 0);
  assert.equal(control[4][3].human, 0);
  assert.equal(control[3][3].human, 0);
});

test("movement can turn but cannot enter or pass through an enemy starting square", () => {
  const game = gameWith([
    { id: "h-sword", player: "human", type: "sword", x: 1, y: 6 },
    { id: "c-sword", player: "computer", type: "sword", x: 1, y: 5 },
  ]);
  const moves = legalMovesForUnit(game, game.units[0]);
  assert.ok(moves.some((move) => move.to.x === 2 && move.to.y === 5), "orthogonal turn should be reachable");
  assert.ok(!moves.some((move) => move.to.x === 1 && move.to.y === 5), "enemy square must be blocked");
  assert.ok(!moves.some((move) => move.to.x === 1 && move.to.y === 4), "cannot pass through enemy");
});

test("movement never offers the unit's current square as a destination", () => {
  const game = gameWith([
    { id: "h-sword", player: "human", type: "sword", x: 3, y: 6 },
  ]);
  const moves = legalMovesForUnit(game, game.units[0]);
  assert.ok(!moves.some((move) => move.to.x === 3 && move.to.y === 6));
});

test("a moved unit may choose any final facing, while stationary rotation must change facing", () => {
  const game = gameWith([{ id: "h-spear", player: "human", type: "spear", x: 3, y: 6 }]);
  const move = legalMovesForUnit(game, game.units[0])[0];
  assert.equal(validateOrders(game, "human", [{ ...move, facing: "east" }]), null);
  assert.match(validateOrders(game, "human", [rotationOrder(game.units[0], "north")]), /must change/);
});

test("higher Initiative takes a shared destination", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 0, y: 3, facing: "east" },
    { id: "c-sword", player: "computer", type: "sword", x: 2, y: 3, facing: "west" },
  ]);
  const human = [{ kind: "move", unitId: "h-cavalry", to: { x: 1, y: 3 }, path: [{ x: 1, y: 3 }], facing: "east", riverPenalty: false }];
  const computer = [{ kind: "move", unitId: "c-sword", to: { x: 1, y: 3 }, path: [{ x: 1, y: 3 }], facing: "west", riverPenalty: false }];
  const { game: result } = resolveRound(game, human, computer);
  const cavalry = result.units.find((unit) => unit.id === "h-cavalry");
  const sword = result.units.find((unit) => unit.id === "c-sword");
  assert.deepEqual({ x: cavalry.x, y: cavalry.y }, { x: 1, y: 3 });
  assert.deepEqual({ x: sword.x, y: sword.y }, { x: 2, y: 3 });
});

test("Cavalry projects 4 control onto an isolated enemy unit", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 3, y: 3 },
    { id: "c-sword", player: "computer", type: "sword", x: 3, y: 2 },
  ]);
  const control = computeControl(game);
  assert.equal(control[2][3].human, 4);
});

test("an adjacent ally prevents Cavalry's isolated-enemy control bonus", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 3, y: 3 },
    { id: "c-sword", player: "computer", type: "sword", x: 3, y: 2 },
    { id: "c-spear", player: "computer", type: "spear", x: 4, y: 2 },
  ]);
  const control = computeControl(game);
  assert.equal(control[2][3].human, 2);
});

test("Cavalry survives when the enemy control needed to destroy it comes from a doomed unit", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 3, y: 3 },
    { id: "c-sword", player: "computer", type: "sword", x: 3, y: 2 },
  ]);
  const { game: result, casualties } = resolveRound(game, [], []);
  assert.equal(result.units.find((unit) => unit.id === "h-cavalry").alive, true);
  assert.equal(result.units.find((unit) => unit.id === "c-sword").alive, false);
  assert.deepEqual(casualties.map((unit) => unit.id), ["c-sword"]);
});

test("Cavalry is destroyed when enough opposing control survives the Control Check", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 3, y: 3 },
    { id: "c-sword", player: "computer", type: "sword", x: 3, y: 2 },
    { id: "c-spear", player: "computer", type: "spear", x: 4, y: 2, facing: "east" },
  ]);
  const { game: result } = resolveRound(game, [], []);
  assert.equal(result.units.find((unit) => unit.id === "h-cavalry").alive, false);
  assert.equal(result.units.find((unit) => unit.id === "c-sword").alive, true);
});

test("an allied starting square requires its occupant to move away", () => {
  const game = gameWith([
    { id: "h-one", player: "human", type: "sword", x: 1, y: 6 },
    { id: "h-two", player: "human", type: "sword", x: 2, y: 6 },
  ]);
  const intoAlly = legalMovesForUnit(game, game.units[0]).find((move) => move.to.x === 2 && move.to.y === 6);
  assert.match(validateOrders(game, "human", [intoAlly, { kind: "rotate", unitId: "h-two", to: { x: 2, y: 6 }, path: [], facing: "east" }]), /ordered away/);
});

test("an army containing only Artillery has no safe move", () => {
  const game = gameWith([{ id: "h-artillery", player: "human", type: "artillery", x: 3, y: 7 }]);
  const result = immediateDefeat(game, "human");
  assert.equal(result.defeated, true);
  assert.match(result.reason, /No mobile units/);
});

test("the stronger defeat proof is exact when bounded and conservative when broad", () => {
  const bounded = gameWith([
    { id: "human-sword", player: "human", type: "sword", x: 1, y: 6 },
    { id: "computer-sword", player: "computer", type: "sword", x: 6, y: 1 },
  ]);
  assert.equal(forcedDefeatStatus(bounded, "human").status, "not-proven");

  const broad = gameWith([
    ...Array.from({ length: 6 }, (_, index) => ({ id: `h-${index}`, player: "human", type: "sword", x: index, y: 7 })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `c-${index}`, player: "computer", type: "sword", x: index, y: 0 })),
  ]);
  assert.equal(forcedDefeatStatus(broad, "human").status, "unknown");
});

test("computer deployment produces a complete army and three legal opening orders", () => {
  const game = createGame(getScenario("skirmish"));
  for (let placement = 0; placement < 16; placement += 1) {
    const reserve = game.reserves.human[0];
    let square = null;
    for (let y = 6; y < 8 && !square; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (!unitAt(game, x, y)) {
          square = { x, y };
          break;
        }
      }
    }
    placeUnit(game, reserve, square.x, square.y, "north");
    deployComputerUnit(game);
  }
  game.phase = "orders";
  game.round = 1;
  assert.equal(game.units.filter((unit) => unit.player === "computer").length, 16);
  const orders = chooseComputerOrders(game);
  assert.equal(orders.length, 3);
  assert.equal(validateOrders(game, "computer", orders), null);
});

test("the guided battle follows the real rules and wins exactly after Round 3", () => {
  let game = buildTutorialGame();
  const expectedCasualties = ["computer-sword-1", "computer-spear-1", "computer-cavalry-1"];
  for (let round = 1; round <= 3; round += 1) {
    const humanOrders = TUTORIAL_PLANS[round].map((plan) => {
      const unit = game.units.find((candidate) => candidate.id === plan.unitId && candidate.alive !== false);
      if (plan.kind === "rotate") return rotationOrder(unit, plan.facing);
      const move = legalMovesForUnit(game, unit).find(
        (candidate) => candidate.to.x === plan.to.x && candidate.to.y === plan.to.y,
      );
      return { ...move, facing: plan.facing };
    });
    const enemyOrders = tutorialEnemyOrders(game);
    assert.equal(validateOrders(game, "human", humanOrders), null);
    assert.equal(validateOrders(game, "computer", enemyOrders), null);
    const result = resolveRound(game, humanOrders, enemyOrders);
    assert.deepEqual(result.casualties.map((unit) => unit.id), [expectedCasualties[round - 1]]);
    game = result.game;
    assert.equal(Boolean(evaluateVictory(game)), round === 3);
  }
  assert.deepEqual(evaluateVictory(game), { winner: "human", reason: "No surviving units remain." });
});
