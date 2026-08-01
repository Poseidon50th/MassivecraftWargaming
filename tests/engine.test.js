import test from "node:test";
import assert from "node:assert/strict";

import { chooseComputerOrders, deployComputerUnit } from "../js/ai/computer.js";
import { getScenario } from "../js/data/scenarios.js";
import { computeControl } from "../js/engine/control.js";
import { createGame, placeUnit, unitAt } from "../js/engine/model.js";
import { legalMovesForUnit, validateOrders } from "../js/engine/movement.js";
import { resolveRound } from "../js/engine/resolution.js";
import { immediateDefeat } from "../js/engine/victory.js";

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
