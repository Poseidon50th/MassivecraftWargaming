import { UNIT_DEFS } from "./constants.js";
import { computeControl, controlStatus } from "./control.js";
import { activeUnits } from "./model.js";
import { legalMovesForUnit } from "./movement.js";

export function immediateDefeat(game, player) {
  const units = activeUnits(game, player);
  if (!units.length) return { defeated: true, reason: "No surviving units remain." };
  const mobile = units.filter((unit) => UNIT_DEFS[unit.type].movement > 0);
  const requiredSafeMoves = Math.min(3, mobile.length);
  if (requiredSafeMoves === 0) {
    return { defeated: true, reason: "No mobile units remain to make a safe move." };
  }
  const control = computeControl(game);
  const safeUnits = mobile.filter((unit) =>
    legalMovesForUnit(game, unit).some(
      (move) => controlStatus(control[move.to.y][move.to.x], player) !== "enemy",
    ),
  );
  if (safeUnits.length < requiredSafeMoves) {
    return {
      defeated: true,
      reason: `Only ${safeUnits.length} of ${requiredSafeMoves} required units can reach safe ground.`,
    };
  }
  return { defeated: false, requiredSafeMoves, safeUnits: safeUnits.map((unit) => unit.id) };
}

// Exact universal-response proof is practical only late in a match. Until then,
// returning unknown is intentionally conservative: the game must not invent a loss.
export function forcedDefeatStatus(game, player) {
  const mobile = activeUnits(game, player).filter((unit) => UNIT_DEFS[unit.type].movement > 0);
  if (mobile.length > 5) return { status: "unknown", reason: "Position too broad for exact proof." };
  return { status: "not-proven", reason: "At least one survivable candidate remains to be tested." };
}

export function evaluateVictory(game) {
  const human = immediateDefeat(game, "human");
  const computer = immediateDefeat(game, "computer");
  if (human.defeated && computer.defeated) return { winner: "draw", reason: "Neither army has a safe order set." };
  if (human.defeated) return { winner: "computer", reason: human.reason };
  if (computer.defeated) return { winner: "human", reason: computer.reason };
  return null;
}
