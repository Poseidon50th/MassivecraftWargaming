import { UNIT_DEFS } from "./constants.js";
import { computeControl, controlStatus } from "./control.js";
import { activeUnits } from "./model.js";
import { FACINGS } from "./constants.js";
import { legalMovesForUnit, requiredOrderCount, rotationOrder, validateOrders } from "./movement.js";
import { resolveRound } from "./resolution.js";

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

function enumerateOrderSets(game, player, limit = 5000) {
  const units = activeUnits(game, player);
  const required = requiredOrderCount(game, player);
  const results = [];
  let overflow = false;
  const options = new Map(
    units.map((unit) => [
      unit.id,
      [
        ...legalMovesForUnit(game, unit),
        ...FACINGS.filter((facing) => facing !== unit.facing).map((facing) => rotationOrder(unit, facing)),
      ],
    ]),
  );

  const chooseUnits = (start, chosen) => {
    if (overflow) return;
    if (chosen.length === required) {
      const chooseOptions = (index, orders) => {
        if (overflow) return;
        if (index === chosen.length) {
          if (!validateOrders(game, player, orders)) {
            results.push(structuredClone(orders));
            if (results.length > limit) overflow = true;
          }
          return;
        }
        for (const order of options.get(chosen[index].id)) chooseOptions(index + 1, [...orders, order]);
      };
      chooseOptions(0, []);
      return;
    }
    for (let index = start; index <= units.length - (required - chosen.length); index += 1) {
      chooseUnits(index + 1, [...chosen, units[index]]);
    }
  };
  chooseUnits(0, []);
  return overflow ? null : results;
}

// Exact universal-response proof is attempted only when the complete order
// space remains bounded. Unknown positions continue rather than inventing a loss.
export function forcedDefeatStatus(game, player) {
  const enemy = player === "human" ? "computer" : "human";
  if (activeUnits(game, player).length > 5 || activeUnits(game, enemy).length > 5) {
    return { status: "unknown", reason: "Position too broad for exact proof." };
  }
  const ownSets = enumerateOrderSets(game, player);
  if (!ownSets) return { status: "unknown", reason: "Position too broad for exact proof." };
  const enemySets = enumerateOrderSets(game, enemy);
  if (!enemySets) return { status: "unknown", reason: "Opponent response space is too broad for exact proof." };
  if (!ownSets.length) return { status: "proven", reason: "No complete permitted order set exists." };

  for (const ownOrders of ownSets) {
    for (const response of enemySets) {
      const result = player === "human"
        ? resolveRound(game, ownOrders, response).game
        : resolveRound(game, response, ownOrders).game;
      if (!immediateDefeat(result, player).defeated) {
        return { status: "not-proven", reason: "At least one exact order-and-response outcome survives." };
      }
    }
  }
  return {
    status: "proven",
    reason: "Every permitted order set is defeated by every relevant opposing response.",
  };
}

export function evaluateVictory(game) {
  const human = immediateDefeat(game, "human");
  const computer = immediateDefeat(game, "computer");
  if (human.defeated && computer.defeated) return { winner: "draw", reason: "Neither army has a safe order set." };
  if (human.defeated) return { winner: "computer", reason: human.reason };
  if (computer.defeated) return { winner: "human", reason: computer.reason };
  const humanForced = forcedDefeatStatus(game, "human");
  const computerForced = forcedDefeatStatus(game, "computer");
  if (humanForced.status === "proven" && computerForced.status === "proven") {
    return { winner: "draw", reason: "Both armies are in proven forced-defeat positions." };
  }
  if (humanForced.status === "proven") return { winner: "computer", reason: humanForced.reason };
  if (computerForced.status === "proven") return { winner: "human", reason: computerForced.reason };
  return null;
}
