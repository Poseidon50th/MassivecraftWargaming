import { PLAYERS } from "../engine/constants.js";

// The opponent receives only information visible on the battlefield. In
// particular, human orders, selections, logs, tutorial hints, and delayed UI
// state are never copied into the search position.
export function sanitizePublicBoard(game) {
  return {
    version: game.version,
    scenarioId: game.scenarioId,
    size: game.size,
    deploymentRows: game.deploymentRows,
    mode: game.mode,
    phase: game.phase,
    round: game.round,
    terrainMode: game.terrainMode,
    terrain: structuredClone(game.terrain),
    units: structuredClone(game.units),
    reserves: {
      [PLAYERS.HUMAN]: structuredClone(game.reserves?.[PLAYERS.HUMAN] ?? []),
      [PLAYERS.COMPUTER]: structuredClone(game.reserves?.[PLAYERS.COMPUTER] ?? []),
    },
    orders: { [PLAYERS.HUMAN]: [], [PLAYERS.COMPUTER]: [] },
    selectedUnitId: null,
    winner: null,
    defeatReason: null,
    log: [],
    aiDifficulty: game.aiDifficulty,
    aiSeed: game.aiSeed,
    aiState: structuredClone(game.aiState ?? {
      orderCounts: {},
      moveCounts: {},
      lastOrderedRound: {},
      lastMovedRound: {},
      lastAdvancedRound: 0,
    }),
  };
}
