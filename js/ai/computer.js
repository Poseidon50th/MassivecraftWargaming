import { PLAYERS, UNIT_DEFS, facingsForUnit } from "../engine/constants.js";
import { computeControl, controlOwner, controlStatus } from "../engine/control.js";
import { activeUnits, isDeploymentSquare, placeUnit, unitAt } from "../engine/model.js";
import { validateOrders } from "../engine/movement.js";
import { resolveRound } from "../engine/resolution.js";
import {
  computerSearchSettings,
  generateCandidateOrderSets,
  responseSearchSettings,
  canonicalOrderSet,
} from "./candidate-orders.js";
import { getDifficulty } from "./difficulties.js";
import { evaluatePosition } from "./evaluation.js";
import { sanitizePublicBoard } from "./public-board.js";
import { createSeededRandom, jitter, seedForGame } from "./random.js";

function aggregateReplyScores(scores, difficultyId) {
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  const worst = Math.min(...scores);
  const best = Math.max(...scores);
  if (difficultyId === "corporal") return average * 0.65 + best * 0.35;
  if (difficultyId === "captain") return average;
  if (difficultyId === "general") return average * 0.62 + worst * 0.38;
  return worst * 0.92 + average * 0.08;
}

export function planComputerTurn(game, requestedDifficulty = game.aiDifficulty) {
  const difficulty = getDifficulty(requestedDifficulty);
  const board = sanitizePublicBoard(game);
  const random = createSeededRandom(seedForGame(board, `orders:${difficulty.id}`));
  const candidates = generateCandidateOrderSets(
    board,
    PLAYERS.COMPUTER,
    computerSearchSettings(board, difficulty, random),
  );
  const responses = generateCandidateOrderSets(
    board,
    PLAYERS.HUMAN,
    { ...responseSearchSettings(board, difficulty), random: createSeededRandom(seedForGame(board, "human-responses")) },
  );
  const baseline = {
    own: activeUnits(board, PLAYERS.COMPUTER).length,
    enemy: activeUnits(board, PLAYERS.HUMAN).length,
    round: board.round,
  };
  let best = null;
  let simulations = 0;
  const startedAt = performance.now();
  const timeBudgetMs = board.size === 16 ? difficulty.timeLimit16Ms : difficulty.timeLimit8Ms;
  let budgetExhausted = false;

  for (const candidate of candidates) {
    if (simulations > 0 && performance.now() - startedAt >= timeBudgetMs) {
      budgetExhausted = true;
      break;
    }
    const replyScores = [];
    for (const response of responses) {
      const result = resolveRound(board, response.orders, candidate.orders).game;
      replyScores.push(evaluatePosition(result, PLAYERS.COMPUTER, baseline, difficulty.id).score);
      simulations += 1;
    }
    if (!replyScores.length) {
      const result = resolveRound(board, [], candidate.orders).game;
      replyScores.push(evaluatePosition(result, PLAYERS.COMPUTER, baseline, difficulty.id).score);
      simulations += 1;
    }
    const lateGeneralNoise = difficulty.id === "general" && board.round > 15 ? 38 : difficulty.noise;
    const score = aggregateReplyScores(replyScores, difficulty.id)
      + candidate.heuristic * ({ corporal: 0.18, captain: 0.15, general: 0.11, codex: 0.09 }[difficulty.id] ?? 0.1)
      + jitter(random, lateGeneralNoise);
    const key = canonicalOrderSet(candidate.orders);
    if (!best || score > best.score || (score === best.score && key < best.key)) {
      best = { orders: candidate.orders, score, key };
    }
  }

  const orders = best?.orders ?? [];
  return {
    orders,
    diagnostics: {
      difficulty: difficulty.id,
      candidateOrderSets: candidates.length,
      playerResponseSets: responses.length,
      simulations,
      searchMethod: board.size === 16 ? "beam-search" : "bounded-order-set-search",
      timeBudgetMs,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
      budgetExhausted,
      publicBoardOnly: true,
      valid: validateOrders(board, PLAYERS.COMPUTER, orders) === null,
    },
  };
}

export function chooseComputerOrders(game, requestedDifficulty = game.aiDifficulty) {
  return planComputerTurn(game, requestedDifficulty).orders;
}

function artilleryAdjacent(game, x, y) {
  return activeUnits(game, PLAYERS.COMPUTER).some(
    (unit) => unit.type === "artillery" && Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  );
}

function placementFacings(type, difficultyId) {
  if (!UNIT_DEFS[type].directional) return ["south"];
  if (type === "artillery") return ["south"];
  const available = facingsForUnit(type);
  const forward = available.filter((facing) => ["southeast", "south", "southwest"].includes(facing));
  if (difficultyId === "corporal") return forward;
  if (difficultyId === "captain") return ["south"];
  if (difficultyId === "general") return [...forward, "east", "west"];
  return available;
}

function basicPlacementScore(game, reserve, x, y, difficultyId) {
  const centerDistance = Math.abs(x - (game.size - 1) / 2);
  const frontDepth = y;
  const ranged = reserve.type === "artillery" || reserve.type === "musket";
  const desiredDepth = ranged ? -frontDepth * 4 : frontDepth * 4;
  const allies = activeUnits(game, PLAYERS.COMPUTER);
  const adjacent = allies.filter(
    (unit) => Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  ).length;
  const sameColumn = allies.filter((unit) => unit.x === x).length;
  if (difficultyId === "corporal") {
    return centerDistance * 7 - desiredDepth - adjacent * 12 + sameColumn * 5;
  }
  if (difficultyId === "captain") return desiredDepth - centerDistance * 2 + adjacent * 2 - sameColumn;
  return desiredDepth - centerDistance * 3 + adjacent * (difficultyId === "codex" ? 9 : 6) - sameColumn * 2;
}

function strategicPlacementScore(game, reserve, x, y, facing, difficultyId) {
  const previewUnit = { ...reserve, x, y, facing, alive: true };
  const preview = { ...game, units: [...game.units, previewUnit] };
  const control = computeControl(preview);
  const controlledCells = control.flat().filter((cell) => controlOwner(cell) === PLAYERS.COMPUTER).length;
  const threatenedHuman = activeUnits(preview, PLAYERS.HUMAN).filter(
    (unit) => controlStatus(control[unit.y][unit.x], PLAYERS.HUMAN) === "enemy",
  ).length;
  const base = basicPlacementScore(game, reserve, x, y, difficultyId);
  if (difficultyId === "corporal") return base - controlledCells * 2 - threatenedHuman * 18;
  if (difficultyId === "captain") return base + controlledCells + threatenedHuman * 8;
  if (difficultyId === "general") return base + controlledCells * 2 + threatenedHuman * 17;
  return base + controlledCells * 3 + threatenedHuman * 25;
}

export function planComputerDeployment(game, requestedDifficulty = game.aiDifficulty) {
  const difficulty = getDifficulty(requestedDifficulty);
  const board = sanitizePublicBoard(game);
  const random = createSeededRandom(seedForGame(board, `deployment:${difficulty.id}`));
  const reserves = difficulty.id === "corporal" || difficulty.id === "captain"
    ? board.reserves[PLAYERS.COMPUTER].slice(0, 1)
    : [...new Map(board.reserves[PLAYERS.COMPUTER].map((reserve) => [reserve.type, reserve])).values()];
  const rough = [];
  for (const reserve of reserves) {
    for (let y = 0; y < board.size; y += 1) {
      for (let x = 0; x < board.size; x += 1) {
        if (!isDeploymentSquare(board, PLAYERS.COMPUTER, y) || unitAt(board, x, y)) continue;
        if (reserve.type === "artillery" && artilleryAdjacent(board, x, y)) continue;
        rough.push({
          reserve,
          x,
          y,
          score: basicPlacementScore(board, reserve, x, y, difficulty.id) + jitter(random, difficulty.noise),
        });
      }
    }
  }
  rough.sort((left, right) => right.score - left.score || left.reserve.id.localeCompare(right.reserve.id));
  const finalists = rough.slice(0, difficulty.id === "codex" ? 28 : difficulty.id === "general" ? 20 : 12);
  const scored = finalists.flatMap((candidate) => placementFacings(candidate.reserve.type, difficulty.id).map((facing) => ({
    ...candidate,
    facing,
    score: strategicPlacementScore(board, candidate.reserve, candidate.x, candidate.y, facing, difficulty.id)
      + jitter(random, difficulty.id === "general" ? 1.5 : difficulty.noise * 0.25),
  })));
  scored.sort((left, right) => right.score - left.score || `${left.reserve.id}:${left.x},${left.y}:${left.facing}`.localeCompare(`${right.reserve.id}:${right.x},${right.y}:${right.facing}`));
  const best = scored[0] ?? null;
  return {
    placement: best ? { reserveId: best.reserve.id, x: best.x, y: best.y, facing: best.facing } : null,
    diagnostics: {
      difficulty: difficulty.id,
      placementsConsidered: scored.length,
      publicBoardOnly: true,
    },
  };
}

export function deployComputerUnit(game, requestedDifficulty = game.aiDifficulty) {
  const { placement } = planComputerDeployment(game, requestedDifficulty);
  if (!placement) return null;
  const reserve = game.reserves[PLAYERS.COMPUTER].find((unit) => unit.id === placement.reserveId);
  return reserve ? placeUnit(game, reserve, placement.x, placement.y, placement.facing) : null;
}
