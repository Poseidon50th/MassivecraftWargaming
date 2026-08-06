import { deployComputerUnit, planComputerTurn } from "../../js/ai/computer.js";
import { generateCandidateOrderSets } from "../../js/ai/candidate-orders.js";
import { evaluatePosition } from "../../js/ai/evaluation.js";
import { chooseComputerArmy } from "../../js/ai/roster.js";
import { sanitizePublicBoard } from "../../js/ai/public-board.js";
import { createSeededRandom, seedForGame } from "../../js/ai/random.js";
import { getScenario } from "../../js/data/scenarios.js";
import { PLAYERS, UNIT_DEFS } from "../../js/engine/constants.js";
import { activeUnits, createGame, placeUnit, replaceReserve, unitAt } from "../../js/engine/model.js";
import { validateOrders } from "../../js/engine/movement.js";
import { resolveRound } from "../../js/engine/resolution.js";
import { randomizeTerrain } from "../../js/engine/terrain.js";
import { evaluateVictory } from "../../js/engine/victory.js";

const HUMAN_STYLE = Object.freeze({
  optionLimit8: 9,
  optionLimit16: 7,
  beam8: 132,
  beam16: 88,
  setLimit8: 72,
  setLimit16: 48,
  responseLimit8: 9,
  responseLimit16: 6,
});

function placementScore(game, reserve, x, y) {
  const center = (game.size - 1) / 2;
  const centerDistance = Math.abs(x - center);
  const frontRow = game.size - game.deploymentRows;
  const isRanged = reserve.type === "artillery" || reserve.type === "musket";
  const desiredRow = reserve.type === "artillery" ? game.size - 1 : isRanged ? game.size - 2 : frontRow;
  const adjacent = activeUnits(game, PLAYERS.HUMAN).filter(
    (unit) => Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  ).length;
  return -Math.abs(y - desiredRow) * 18 - centerDistance * 2 + adjacent * 1.5;
}

function placeQaHumanUnit(game, reserve) {
  const choices = [];
  for (let y = game.size - game.deploymentRows; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      if (unitAt(game, x, y)) continue;
      choices.push({ x, y, score: placementScore(game, reserve, x, y) });
    }
  }
  choices.sort((left, right) => right.score - left.score || left.y - right.y || left.x - right.x);
  const choice = choices[0];
  if (!choice) throw new Error(`No deployment square remained for ${reserve.id}.`);
  return placeUnit(game, reserve, choice.x, choice.y, "north");
}

export function createCertificationGame({ scenarioId, difficulty, seed }) {
  const game = createGame(getScenario(scenarioId));
  game.aiDifficulty = difficulty;
  game.aiSeed = seed;
  randomizeTerrain(game, createSeededRandom(seed ^ 0x51f15e));
  replaceReserve(game, PLAYERS.COMPUTER, chooseComputerArmy({
    size: game.size,
    terrain: game.terrain,
    opponentArmy: getScenario(scenarioId).army,
    difficultyId: difficulty,
  }));
  const typePriority = ["artillery", "musket", "spear", "axe", "sword", "cavalry"];
  while (game.reserves[PLAYERS.HUMAN].length) {
    const reserve = typePriority
      .map((type) => game.reserves[PLAYERS.HUMAN].find((candidate) => candidate.type === type))
      .find(Boolean);
    placeQaHumanUnit(game, reserve);
    const deployed = deployComputerUnit(game, difficulty);
    if (!deployed) throw new Error(`${difficulty} failed to deploy ${game.reserves[PLAYERS.COMPUTER].length} remaining unit(s).`);
  }
  if (game.reserves[PLAYERS.COMPUTER].length) throw new Error(`${difficulty} did not complete deployment.`);
  game.phase = "orders";
  game.round = 1;
  game.log.unshift({ round: 1, text: "Certification deployment complete." });
  return game;
}

function qaHumanSettings(board, random) {
  const large = board.size === 16;
  return {
    style: "general",
    optionLimit: large ? HUMAN_STYLE.optionLimit16 : HUMAN_STYLE.optionLimit8,
    beamWidth: large ? HUMAN_STYLE.beam16 : HUMAN_STYLE.beam8,
    setLimit: large ? HUMAN_STYLE.setLimit16 : HUMAN_STYLE.setLimit8,
    random,
    noise: 1.5,
  };
}

function qaResponseSettings(board) {
  const large = board.size === 16;
  return {
    style: board.aiDifficulty,
    optionLimit: large ? 5 : 6,
    beamWidth: large ? 58 : 76,
    setLimit: large ? HUMAN_STYLE.responseLimit16 : HUMAN_STYLE.responseLimit8,
    random: createSeededRandom(seedForGame(board, "qa-computer-responses")),
    noise: 0,
  };
}

export function planQaHumanTurn(game) {
  const board = sanitizePublicBoard(game);
  const candidates = generateCandidateOrderSets(
    board,
    PLAYERS.HUMAN,
    qaHumanSettings(board, createSeededRandom(seedForGame(board, "qa-human-orders"))),
  );
  const responses = generateCandidateOrderSets(board, PLAYERS.COMPUTER, qaResponseSettings(board));
  const baseline = {
    own: activeUnits(board, PLAYERS.HUMAN).length,
    enemy: activeUnits(board, PLAYERS.COMPUTER).length,
    round: board.round,
  };
  let best = null;
  let simulations = 0;
  for (const candidate of candidates) {
    const scores = [];
    for (const response of responses) {
      const result = resolveRound(board, candidate.orders, response.orders).game;
      scores.push(evaluatePosition(result, PLAYERS.HUMAN, baseline, "general").score);
      simulations += 1;
    }
    if (!scores.length) {
      const result = resolveRound(board, candidate.orders, []).game;
      scores.push(evaluatePosition(result, PLAYERS.HUMAN, baseline, "general").score);
      simulations += 1;
    }
    const average = scores.reduce((total, score) => total + score, 0) / scores.length;
    const score = average * 0.68 + Math.min(...scores) * 0.32 + candidate.heuristic * 0.12;
    if (!best || score > best.score) best = { score, orders: candidate.orders };
  }
  return { orders: best?.orders ?? [], diagnostics: { candidates: candidates.length, responses: responses.length, simulations } };
}

function incrementTypeCount(target, units) {
  for (const unit of units) target[unit.type] = (target[unit.type] ?? 0) + 1;
}

function terrainOccupancy(game, player, target) {
  for (const unit of activeUnits(game, player)) {
    const terrain = game.terrain[unit.y][unit.x];
    target[terrain] = (target[terrain] ?? 0) + 1;
  }
}

export async function runCertificationMatch({
  scenarioId,
  difficulty,
  seed,
  maxRounds = scenarioId === "battle" ? 140 : 60,
  onStart = null,
  onRound = null,
  allowIncomplete = false,
} = {}) {
  let game = createCertificationGame({ scenarioId, difficulty, seed });
  if (onStart) await onStart({ game });
  const initialComputer = activeUnits(game, PLAYERS.COMPUTER).map((unit) => ({ ...unit }));
  const metrics = {
    difficulty,
    scenarioId,
    size: game.size,
    seed,
    rounds: 0,
    winner: null,
    reason: null,
    computerOrdered: new Set(),
    computerMoved: new Set(),
    computerAdvanced: new Set(),
    computerTerrainOccupancy: {},
    humanCasualties: {},
    computerCasualties: {},
    computerThinkingMs: 0,
    computerPlans: 0,
    budgetExhaustions: 0,
    initialComputer,
  };

  let result = evaluateVictory(game);
  while (!result && game.round <= maxRounds) {
    const humanPlan = planQaHumanTurn(game);
    const computerPlan = planComputerTurn(game, difficulty);
    const humanError = validateOrders(game, PLAYERS.HUMAN, humanPlan.orders);
    const computerError = validateOrders(game, PLAYERS.COMPUTER, computerPlan.orders);
    if (humanError) throw new Error(`QA player formed invalid Round ${game.round} orders: ${humanError}`);
    if (computerError) throw new Error(`${difficulty} formed invalid Round ${game.round} orders: ${computerError}`);

    const starts = new Map(activeUnits(game, PLAYERS.COMPUTER).map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
    for (const order of computerPlan.orders) metrics.computerOrdered.add(order.unitId);
    metrics.computerThinkingMs += computerPlan.diagnostics.elapsedMs;
    metrics.computerPlans += 1;
    if (computerPlan.diagnostics.budgetExhausted) metrics.budgetExhaustions += 1;

    const resolvedRound = game.round;
    const resolution = resolveRound(game, humanPlan.orders, computerPlan.orders);
    game = resolution.game;
    for (const order of computerPlan.orders) {
      const start = starts.get(order.unitId);
      const unit = game.units.find((candidate) => candidate.id === order.unitId);
      if (!start || !unit || (start.x === unit.x && start.y === unit.y)) continue;
      metrics.computerMoved.add(order.unitId);
      if (unit.y > start.y) metrics.computerAdvanced.add(order.unitId);
    }
    incrementTypeCount(metrics.humanCasualties, resolution.casualties.filter((unit) => unit.player === PLAYERS.HUMAN));
    incrementTypeCount(metrics.computerCasualties, resolution.casualties.filter((unit) => unit.player === PLAYERS.COMPUTER));
    terrainOccupancy(game, PLAYERS.COMPUTER, metrics.computerTerrainOccupancy);
    metrics.rounds = resolvedRound;
    result = evaluateVictory(game);
    if (onRound) await onRound({ game, resolution, humanPlan, computerPlan, result, metrics });
  }

  if (!result && !allowIncomplete) throw new Error(`${difficulty} ${game.size}×${game.size} match did not conclude within ${maxRounds} rounds.`);
  metrics.winner = result?.winner ?? null;
  metrics.reason = result?.reason ?? `No result within ${maxRounds} rounds.`;
  metrics.finalFriendly = activeUnits(game, PLAYERS.HUMAN).length;
  metrics.finalEnemy = activeUnits(game, PLAYERS.COMPUTER).length;
  metrics.mobileComputerCount = metrics.initialComputer.filter((unit) => UNIT_DEFS[unit.type].movement > 0).length;
  metrics.orderedCount = metrics.computerOrdered.size;
  metrics.movedCount = metrics.computerMoved.size;
  metrics.advancedCount = metrics.computerAdvanced.size;
  metrics.averageThinkingMs = metrics.computerPlans ? metrics.computerThinkingMs / metrics.computerPlans : 0;
  return { game, result, metrics };
}

export function serializeMetrics(metrics) {
  return {
    ...metrics,
    computerOrdered: [...metrics.computerOrdered],
    computerMoved: [...metrics.computerMoved],
    computerAdvanced: [...metrics.computerAdvanced],
  };
}
