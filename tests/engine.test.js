import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseComputerOrders,
  deployComputerUnit,
  planComputerDeployment,
  planComputerTurn,
} from "../js/ai/computer.js";
import { evaluatePosition } from "../js/ai/evaluation.js";
import { sanitizePublicBoard } from "../js/ai/public-board.js";
import { getScenario } from "../js/data/scenarios.js";
import { computeControl, controlOwner, controlStatus } from "../js/engine/control.js";
import { buildTutorialGame, TUTORIAL_PLANS, TUTORIAL_UNITS, tutorialEnemyOrders } from "../js/data/tutorial.js";
import { facingsForUnit } from "../js/engine/constants.js";
import { activeUnits, createGame, placeUnit, unitAt } from "../js/engine/model.js";
import { legalMovesForUnit, rotationOrder, validateOrders } from "../js/engine/movement.js";
import { resolveRound } from "../js/engine/resolution.js";
import { isStartingRow, PLACEABLE_TERRAIN, randomizeTerrain, setTerrain } from "../js/engine/terrain.js";
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

function fullyDeployedGame(scenarioId = "skirmish", difficulty = "captain") {
  const game = createGame(getScenario(scenarioId));
  game.aiDifficulty = difficulty;
  game.aiSeed = 12345;
  const firstHumanRow = game.size - game.deploymentRows;
  while (game.reserves.human.length) {
    const reserve = game.reserves.human[0];
    let square = null;
    for (let y = firstHumanRow; y < game.size && !square; y += 1) {
      for (let x = 0; x < game.size; x += 1) {
        if (!unitAt(game, x, y)) {
          square = { x, y };
          break;
        }
      }
    }
    placeUnit(game, reserve, square.x, square.y, "north");
    deployComputerUnit(game, difficulty);
  }
  game.phase = "orders";
  game.round = 1;
  return game;
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

test("Spears, Axes, and Muskets rotate their control into all four diagonal facings", () => {
  const northeastSpear = computeControl(gameWith([
    { id: "h-spear", player: "human", type: "spear", x: 3, y: 3, facing: "northeast" },
  ]));
  assert.deepEqual(
    [northeastSpear[2][3].human, northeastSpear[2][4].human, northeastSpear[3][4].human],
    [3, 3, 3],
    "northeast Spear should cover north, northeast, and east",
  );
  assert.equal(northeastSpear[2][2].human, 0);

  const southeastSpear = computeControl(gameWith([
    { id: "c-spear", player: "computer", type: "spear", x: 3, y: 3, facing: "southeast" },
  ]));
  assert.deepEqual(
    [southeastSpear[3][4].computer, southeastSpear[4][4].computer, southeastSpear[4][3].computer],
    [3, 3, 3],
    "southeast Spear should cover east, southeast, and south for the computer too",
  );

  const southwestAxe = computeControl(gameWith([
    { id: "h-axe", player: "human", type: "axe", x: 4, y: 2, facing: "southwest" },
  ]));
  assert.equal(southwestAxe[3][3].human, 5);
  assert.equal(southwestAxe[3][4].human, 0);

  const northwestMusket = computeControl(gameWith([
    { id: "c-musket", player: "computer", type: "musket", x: 5, y: 5, facing: "northwest" },
  ]));
  assert.deepEqual(
    [northwestMusket[4][4].computer, northwestMusket[3][3].computer, northwestMusket[2][2].computer],
    [3, 2, 1],
  );
});

test("Artillery projects the same six-square field for both armies", () => {
  const game = gameWith([
    { id: "human-artillery", player: "human", type: "artillery", x: 3, y: 7, facing: "north" },
    { id: "computer-artillery", player: "computer", type: "artillery", x: 3, y: 0, facing: "south" },
  ]);
  const control = computeControl(game);
  for (const x of [2, 3, 4]) {
    assert.equal(control[3][x].human, 3);
    assert.equal(control[2][x].human, 3);
    assert.equal(control[4][x].computer, 3);
    assert.equal(control[5][x].computer, 3);
  }
});

test("opposing Artillery resolution is simultaneous and independent of roster order", () => {
  const units = [
    { id: "human-artillery", player: "human", type: "artillery", x: 3, y: 7, facing: "north" },
    { id: "computer-artillery", player: "computer", type: "artillery", x: 3, y: 3, facing: "south" },
  ];
  const first = computeControl(gameWith(units));
  const reversed = computeControl(gameWith([...units].reverse()));
  assert.deepEqual(reversed, first, "neither army may gain Artillery priority from unit-array order");
  assert.equal(first[2][3].human, 3, "human Artillery should retain its second firing row");
  assert.equal(first[7][2].computer, 3, "computer Artillery should retain its in-bounds firing row");
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

test("Hill, Fog, and Walls affect every unit type symmetrically for both armies", () => {
  const probes = {
    sword: { x: 4, y: 4, facing: "north", target: { x: 4, y: 3 }, base: 3 },
    spear: { x: 4, y: 4, facing: "north", target: { x: 4, y: 3 }, base: 3 },
    axe: { x: 4, y: 4, facing: "north", target: { x: 4, y: 3 }, base: 5 },
    cavalry: { x: 4, y: 4, facing: "north", target: { x: 4, y: 3 }, base: 2 },
    musket: { x: 4, y: 4, facing: "north", target: { x: 4, y: 3 }, base: 3 },
    artillery: { x: 4, y: 7, facing: "north", target: { x: 4, y: 3 }, base: 3 },
  };
  for (const player of ["human", "computer"]) {
    for (const [type, probe] of Object.entries(probes)) {
      const unit = { id: `${player}-${type}`, player, type, x: probe.x, y: probe.y, facing: probe.facing };
      const hill = gameWith([unit]);
      hill.terrain[probe.y][probe.x] = "hill";
      assert.equal(computeControl(hill)[probe.target.y][probe.target.x][player], probe.base + 1, `${player} ${type} Hill projection`);

      const fog = gameWith([unit]);
      fog.terrain[probe.y][probe.x] = "fog";
      assert.equal(computeControl(fog)[probe.target.y][probe.target.x][player], probe.base - 1, `${player} ${type} Fog projection`);

      const wall = gameWith([unit]);
      const wallY = type === "artillery" ? 5 : probe.target.y;
      wall.terrain[wallY][probe.target.x] = "wall";
      assert.equal(computeControl(wall)[probe.target.y][probe.target.x][player], 0, `${player} ${type} Wall blocking`);
    }
  }
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

test("random terrain includes every special type and never enters starting rows", () => {
  const game = createGame(getScenario("skirmish"));
  let state = 17;
  randomizeTerrain(game, () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  });
  const placed = new Set(game.terrain.flat().filter((type) => type !== "plain"));
  for (const type of PLACEABLE_TERRAIN) assert.ok(placed.has(type), `missing ${type}`);
  for (let y = 0; y < game.size; y += 1) {
    if (!isStartingRow(game, y)) continue;
    assert.ok(game.terrain[y].every((type) => type === "plain"));
  }
});

test("manual Road and River placement creates a Bridge only outside starting rows", () => {
  const game = createGame(getScenario("skirmish"));
  assert.equal(setTerrain(game, 3, 3, "river"), true);
  assert.equal(setTerrain(game, 3, 3, "road"), true);
  assert.equal(game.terrain[3][3], "bridge");
  assert.equal(setTerrain(game, 3, 7, "wall"), false);
  assert.equal(game.terrain[7][3], "plain");
});

test("Road and Bridge grant +1 Movement while Mud ends movement", () => {
  const roadGame = gameWith([{ id: "road-sword", player: "human", type: "sword", x: 3, y: 6 }]);
  roadGame.terrain[6][3] = "road";
  assert.ok(legalMovesForUnit(roadGame, roadGame.units[0]).some((move) => move.to.x === 3 && move.to.y === 3));
  roadGame.terrain[6][3] = "bridge";
  assert.ok(legalMovesForUnit(roadGame, roadGame.units[0]).some((move) => move.to.x === 3 && move.to.y === 3));

  const mudGame = gameWith([{ id: "mud-cavalry", player: "human", type: "cavalry", x: 3, y: 6 }]);
  mudGame.terrain[5][3] = "mud";
  const moves = legalMovesForUnit(mudGame, mudGame.units[0]);
  assert.ok(moves.some((move) => move.to.x === 3 && move.to.y === 5));
  assert.ok(!moves.some((move) => move.path.some((step) => step.x === 3 && step.y === 5) && move.path.length > 1));
});

test("Road, Bridge, Mud, River, and Walls apply to every mobile unit", () => {
  const ranges = { sword: 2, spear: 1, axe: 1, cavalry: 3, musket: 1 };
  for (const [type, baseRange] of Object.entries(ranges)) {
    const road = gameWith([{ id: `road-${type}`, player: "human", type, x: 4, y: 6, facing: "north" }]);
    road.terrain[6][4] = "road";
    assert.ok(legalMovesForUnit(road, road.units[0]).some((move) => move.path.length === baseRange + 1), `${type} Road bonus`);

    const bridge = gameWith([{ id: `bridge-${type}`, player: "computer", type, x: 4, y: 6, facing: "north" }]);
    bridge.terrain[6][4] = "bridge";
    const bridgeMoves = legalMovesForUnit(bridge, bridge.units[0]);
    assert.ok(bridgeMoves.some((move) => move.path.length === baseRange + 1), `${type} Bridge movement bonus`);
    assert.ok(bridgeMoves.every((move) => move.riverPenalty === false), `${type} Bridge should not act as River`);

    const enteringMud = gameWith([{ id: `enter-mud-${type}`, player: "human", type, x: 4, y: 6, facing: "north" }]);
    enteringMud.terrain[5][4] = "mud";
    const enteringMoves = legalMovesForUnit(enteringMud, enteringMud.units[0]);
    assert.ok(enteringMoves.some((move) => move.to.x === 4 && move.to.y === 5), `${type} may enter Mud`);
    assert.ok(!enteringMoves.some((move) => move.path.length > 1 && move.path.some((step) => step.x === 4 && step.y === 5)), `${type} must stop on entering Mud`);

    const leavingMud = gameWith([{ id: `leave-mud-${type}`, player: "computer", type, x: 4, y: 6, facing: "north" }]);
    leavingMud.terrain[6][4] = "mud";
    assert.ok(legalMovesForUnit(leavingMud, leavingMud.units[0]).every((move) => move.path.length === 1), `${type} spends all movement leaving Mud`);

    const river = gameWith([{ id: `river-${type}`, player: "human", type, x: 4, y: 6, facing: "north" }]);
    river.terrain[5][4] = "river";
    const riverMove = legalMovesForUnit(river, river.units[0]).find((move) => move.to.x === 4 && move.to.y === 5);
    assert.equal(riverMove.riverPenalty, true, `${type} takes River Initiative penalty`);

    const wall = gameWith([{ id: `wall-${type}`, player: "computer", type, x: 4, y: 6, facing: "north" }]);
    wall.terrain[5][4] = "wall";
    assert.ok(!legalMovesForUnit(wall, wall.units[0]).some((move) => move.to.x === 4 && move.to.y === 5), `${type} cannot enter Wall`);
  }
});

test("River entry lowers collision Initiative while a Bridge does not", () => {
  const riverGame = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 0, y: 3, facing: "east" },
    { id: "c-sword", player: "computer", type: "sword", x: 2, y: 3, facing: "west" },
  ]);
  riverGame.terrain[3][0] = "river";
  const cavalryMove = legalMovesForUnit(riverGame, riverGame.units[0]).find((move) => move.to.x === 1 && move.to.y === 3);
  const swordMove = legalMovesForUnit(riverGame, riverGame.units[1]).find((move) => move.to.x === 1 && move.to.y === 3);
  const riverResult = resolveRound(riverGame, [{ ...cavalryMove, facing: "east" }], [{ ...swordMove, facing: "west" }]).game;
  assert.deepEqual({ x: riverResult.units[0].x, y: riverResult.units[0].y }, { x: 0, y: 3 });
  assert.deepEqual({ x: riverResult.units[1].x, y: riverResult.units[1].y }, { x: 2, y: 3 });

  const bridgeGame = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 0, y: 3, facing: "east" },
    { id: "c-sword", player: "computer", type: "sword", x: 2, y: 3, facing: "west" },
  ]);
  bridgeGame.terrain[3][0] = "bridge";
  const bridgeCavalry = legalMovesForUnit(bridgeGame, bridgeGame.units[0]).find((move) => move.to.x === 1 && move.to.y === 3);
  const bridgeSword = legalMovesForUnit(bridgeGame, bridgeGame.units[1]).find((move) => move.to.x === 1 && move.to.y === 3);
  const bridgeResult = resolveRound(bridgeGame, [{ ...bridgeCavalry, facing: "east" }], [{ ...bridgeSword, facing: "west" }]).game;
  assert.deepEqual({ x: bridgeResult.units[0].x, y: bridgeResult.units[0].y }, { x: 1, y: 3 });
});

test("crossing a River on an early path step keeps the Initiative penalty", () => {
  const game = gameWith([
    { id: "h-cavalry", player: "human", type: "cavalry", x: 0, y: 3, facing: "east" },
    { id: "c-sword", player: "computer", type: "sword", x: 4, y: 3, facing: "west" },
  ]);
  game.terrain[3][1] = "river";
  const cavalryMove = legalMovesForUnit(game, game.units[0]).find((move) => move.to.x === 3 && move.to.y === 3);
  const swordMove = legalMovesForUnit(game, game.units[1]).find((move) => move.to.x === 3 && move.to.y === 3);
  assert.equal(cavalryMove.riverPenalty, true, "the complete Cavalry path should retain the River penalty");
  const result = resolveRound(
    game,
    [{ ...cavalryMove, facing: "east" }],
    [{ ...swordMove, facing: "west" }],
  ).game;
  assert.deepEqual({ x: result.units[0].x, y: result.units[0].y }, { x: 0, y: 3 });
  assert.deepEqual({ x: result.units[1].x, y: result.units[1].y }, { x: 4, y: 3 });
});

test("round dispatch reports actual orders and separate friendly and enemy casualties", () => {
  const game = gameWith([
    { id: "h-sword", player: "human", type: "sword", x: 3, y: 3, facing: "north" },
    { id: "c-sword", player: "computer", type: "sword", x: 3, y: 2, facing: "south" },
  ]);
  game.round = 4;
  const result = resolveRound(
    game,
    [rotationOrder(game.units[0], "east")],
    [rotationOrder(game.units[1], "west")],
  ).game;
  const reports = result.log.filter((entry) => entry.round === 4).map((entry) => entry.text);
  assert.ok(reports.some((text) => text.includes("Friendly: Swords at D5 rotated east")));
  assert.ok(reports.some((text) => text.includes("Enemy: Swords at D6 rotated west")));
  assert.ok(reports.some((text) => text.includes("Friendly destroyed: 0 — none")));
  assert.ok(reports.some((text) => text.includes("Enemy destroyed: 0 — none")));
  assert.ok(reports.some((text) => text.includes("Remaining: 1 friendly / 1 enemy")));
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

test("only Spears, Axes, and Muskets accept diagonal final facings", () => {
  for (const type of ["spear", "axe", "musket"]) {
    const game = gameWith([{ id: `h-${type}`, player: "human", type, x: 3, y: 6 }]);
    assert.equal(facingsForUnit(type).length, 8);
    assert.equal(validateOrders(game, "human", [rotationOrder(game.units[0], "northeast")]), null);
  }
  for (const type of ["sword", "cavalry", "artillery"]) {
    const game = gameWith([{ id: `h-${type}`, player: "human", type, x: 3, y: 6 }]);
    assert.equal(facingsForUnit(type).length, 4);
    assert.match(validateOrders(game, "human", [rotationOrder(game.units[0], "northeast")]), /cannot use/i);
  }
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

test("the stronger defeat proof runs exactly at every army size", () => {
  const bounded = gameWith([
    { id: "human-sword", player: "human", type: "sword", x: 1, y: 6 },
    { id: "computer-sword", player: "computer", type: "sword", x: 6, y: 1 },
  ]);
  assert.equal(forcedDefeatStatus(bounded, "human").status, "not-proven");

  const broad = gameWith([
    ...Array.from({ length: 6 }, (_, index) => ({ id: `h-${index}`, player: "human", type: "sword", x: index, y: 7 })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `c-${index}`, player: "computer", type: "sword", x: index, y: 0 })),
  ]);
  const broadResult = forcedDefeatStatus(broad, "human");
  assert.equal(broadResult.status, "not-proven");
  assert.ok(broadResult.examined.ownSetCount >= 1);
  assert.ok(broadResult.examined.responseCount >= 1);
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

test("the AI receives a detached public board without the player's secret orders", () => {
  const game = fullyDeployedGame();
  game.orders.human = [{ unitId: "secret-unit", to: { x: 7, y: 7 }, facing: "north" }];
  game.selectedUnitId = "human-sword-1";
  game.log.unshift({ round: 1, text: "private interface note" });
  const publicBoard = sanitizePublicBoard(game);
  assert.deepEqual(publicBoard.orders.human, []);
  assert.equal(publicBoard.selectedUnitId, null);
  assert.deepEqual(publicBoard.log, []);
  publicBoard.units[0].x = 99;
  assert.notEqual(game.units[0].x, 99, "the search board must not mutate the live game");

  const first = planComputerTurn(game, "captain").orders;
  game.orders.human = [{ unitId: "different-secret", to: { x: 0, y: 0 }, facing: "south" }];
  const second = planComputerTurn(game, "captain").orders;
  assert.deepEqual(second, first, "changing hidden orders must not change the computer plan");
});

test("all four difficulties generate complete, rules-valid, reproducible order sets", () => {
  const game = fullyDeployedGame();
  for (const difficulty of ["corporal", "captain", "general", "codex"]) {
    const first = planComputerTurn(game, difficulty);
    const second = planComputerTurn(game, difficulty);
    assert.equal(validateOrders(game, "computer", first.orders), null, `${difficulty} produced invalid orders`);
    assert.deepEqual(second.orders, first.orders, `${difficulty} must be reproducible from the same seed and public position`);
    assert.ok(first.diagnostics.candidateOrderSets > 1);
    assert.ok(first.diagnostics.playerResponseSets > 0);
    assert.ok(first.diagnostics.simulations > 0);
    assert.equal(first.diagnostics.publicBoardOnly, true);
  }
});

test("16 × 16 planning uses bounded beam search", () => {
  const game = fullyDeployedGame("battle", "codex");
  const plan = planComputerTurn(game, "codex");
  assert.equal(plan.diagnostics.searchMethod, "beam-search");
  assert.equal(plan.diagnostics.timeBudgetMs, 10000);
  assert.ok(plan.diagnostics.elapsedMs <= 10000);
  assert.equal(validateOrders(game, "computer", plan.orders), null);
  assert.ok(plan.diagnostics.candidateOrderSets > 1);
  assert.ok(plan.diagnostics.simulations > 1);
});

test("every difficulty mobilizes its whole mobile army and pushes beyond the starting rows", () => {
  for (const difficulty of ["corporal", "captain", "general", "codex"]) {
    let game = fullyDeployedGame("skirmish", difficulty);
    const mobilized = new Set();
    for (let turn = 0; turn < 10; turn += 1) {
      const humanOrders = activeUnits(game, "human").slice(0, 3).map((unit) => (
        rotationOrder(unit, unit.facing === "north" ? "east" : "north")
      ));
      const computerOrders = chooseComputerOrders(game, difficulty);
      for (const order of computerOrders) {
        if (order.kind === "move") mobilized.add(order.unitId);
      }
      game = resolveRound(game, humanOrders, computerOrders).game;
    }
    const surviving = activeUnits(game, "computer");
    const survivingMobile = surviving.filter((unit) => unit.type !== "artillery");
    const beyondHome = survivingMobile.filter((unit) => unit.y >= game.deploymentRows).length;
    assert.equal(mobilized.size, 15, `${difficulty} should activate every mobile unit; Artillery is immobile`);
    assert.ok(
      beyondHome >= Math.ceil(survivingMobile.length / 2),
      `${difficulty} should move a majority of its surviving mobile army beyond its starting rows`,
    );
    assert.ok(game.aiState.lastAdvancedRound >= 8, `${difficulty} should keep advancing instead of settling into a shuffle`);
  }
});

test("Aristides' Codex can form a coordinated breach instead of stopping at the enemy line", () => {
  const game = gameWith([
    { id: "computer-axe", player: "computer", type: "axe", x: 7, y: 5, facing: "north" },
    { id: "computer-spear", player: "computer", type: "spear", x: 6, y: 5, facing: "north" },
    { id: "computer-sword", player: "computer", type: "sword", x: 0, y: 2, facing: "south" },
    { id: "human-axe", player: "human", type: "axe", x: 7, y: 6, facing: "south" },
  ]);
  game.version = 4;
  game.scenarioId = "skirmish";
  game.deploymentRows = 2;
  game.mode = "standard";
  game.round = 10;
  game.reserves = { human: [], computer: [] };
  game.aiDifficulty = "codex";
  game.aiSeed = 9;
  game.aiState = { orderCounts: {}, moveCounts: {}, lastOrderedRound: {}, lastMovedRound: {}, lastAdvancedRound: 9 };
  const plan = planComputerTurn(game, "codex");
  assert.equal(validateOrders(game, "computer", plan.orders), null);
  const result = resolveRound(
    game,
    [rotationOrder(game.units.find((unit) => unit.id === "human-axe"), "north")],
    plan.orders,
  ).game;
  assert.equal(result.units.find((unit) => unit.id === "human-axe").alive, false);
  assert.ok(result.units.filter((unit) => unit.player === "computer" && unit.alive).length >= 2);
});

test("difficulty objectives distinguish sacrifice, exchanges, and preservation", () => {
  const baseline = { own: 2, enemy: 2 };
  const steady = gameWith([
    { id: "c-one", player: "computer", type: "sword", x: 1, y: 1 },
    { id: "c-two", player: "computer", type: "sword", x: 3, y: 1 },
    { id: "h-one", player: "human", type: "sword", x: 1, y: 6 },
    { id: "h-two", player: "human", type: "sword", x: 3, y: 6 },
  ]);
  const ownSacrifice = gameWith([
    { id: "c-one", player: "computer", type: "sword", x: 1, y: 1 },
    { id: "h-one", player: "human", type: "sword", x: 1, y: 6 },
    { id: "h-two", player: "human", type: "sword", x: 3, y: 6 },
  ]);
  ownSacrifice.terrain[1][1] = "fog";
  const oneSidedCapture = gameWith([
    { id: "c-one", player: "computer", type: "sword", x: 1, y: 1 },
    { id: "c-two", player: "computer", type: "sword", x: 3, y: 1 },
    { id: "h-one", player: "human", type: "sword", x: 1, y: 6 },
  ]);
  const mutualExchange = gameWith([
    { id: "c-one", player: "computer", type: "sword", x: 1, y: 1 },
    { id: "h-one", player: "human", type: "sword", x: 1, y: 6 },
  ]);
  const playerEliminated = gameWith([
    { id: "c-one", player: "computer", type: "sword", x: 1, y: 1 },
    { id: "c-two", player: "computer", type: "sword", x: 3, y: 1 },
  ]);

  assert.ok(
    evaluatePosition(ownSacrifice, "computer", baseline, "corporal").score
      > evaluatePosition(steady, "computer", baseline, "corporal").score,
    "Corporal should still accept costly sacrifices",
  );
  assert.ok(
    evaluatePosition(playerEliminated, "computer", baseline, "corporal").score
      > evaluatePosition(steady, "computer", baseline, "corporal").score,
    "Corporal must still attempt victory",
  );
  assert.ok(
    evaluatePosition(mutualExchange, "computer", baseline, "captain").score
      > evaluatePosition(oneSidedCapture, "computer", baseline, "captain").score,
    "Captain should value a mutual exchange",
  );
  assert.ok(
    evaluatePosition(oneSidedCapture, "computer", baseline, "codex").score
      > evaluatePosition(mutualExchange, "computer", baseline, "codex").score,
    "Aristides' Codex should preserve its unit when both lines remove the same enemy",
  );
});

test("deployment policy changes from deliberately weak to strategic", () => {
  const corporalGame = createGame(getScenario("skirmish"));
  corporalGame.aiSeed = 5;
  placeUnit(corporalGame, corporalGame.reserves.human[0], 3, 7, "north");
  const corporal = planComputerDeployment(corporalGame, "corporal").placement;

  const codexGame = createGame(getScenario("skirmish"));
  codexGame.aiSeed = 5;
  placeUnit(codexGame, codexGame.reserves.human[0], 3, 7, "north");
  const codex = planComputerDeployment(codexGame, "codex").placement;
  assert.notDeepEqual(codex, corporal);
  assert.ok([0, 7].includes(corporal.x), "Corporal should favor an exposed edge deployment in this seeded position");
  assert.equal(corporal.facing, "south", "the exposed Corporal deployment should still face onto the battlefield");
  assert.equal(codex.reserveId, "computer-artillery-1", "Codex should choose a strategically valuable reserve rather than blindly taking the first unit");
});

test("enemy Artillery deployment always faces onto the battlefield on every difficulty", () => {
  for (const difficulty of ["corporal", "captain", "general", "codex"]) {
    const game = createGame(getScenario("skirmish"));
    game.aiDifficulty = difficulty;
    game.aiSeed = 77;
    game.reserves.computer = game.reserves.computer.filter((unit) => unit.type === "artillery");
    placeUnit(game, game.reserves.human[0], 3, 7, "north");
    const placement = planComputerDeployment(game, difficulty).placement;
    assert.equal(placement.facing, "south", `${difficulty} Artillery must not aim off the upper board edge`);
    const reserve = game.reserves.computer[0];
    placeUnit(game, reserve, placement.x, placement.y, placement.facing);
    const projectedTotal = computeControl(game).flat().reduce((total, cell) => total + cell.computer, 0) - 3;
    assert.ok(projectedTotal >= 12, `${difficulty} Artillery should project onto at least four in-bounds squares`);
  }
});

test("the final tutorial uses every unit to win in two rounds", () => {
  let game = buildTutorialGame();
  const credited = new Set();
  for (let round = 1; round <= 2; round += 1) {
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
    assert.equal(result.casualties.filter((unit) => unit.player === "computer").length, 3);
    for (const casualty of result.casualties.filter((unit) => unit.player === "computer")) {
      for (const source of result.contributors[casualty.y][casualty.x].human) credited.add(source.unitId);
    }
    game = result.game;
    assert.equal(Boolean(evaluateVictory(game)), round === 2);
  }
  assert.deepEqual(evaluateVictory(game), { winner: "human", reason: "No surviving units remain." });
  assert.deepEqual(
    [...credited].sort(),
    TUTORIAL_UNITS.filter((unit) => unit.player === "human").map((unit) => unit.id).sort(),
  );
});
