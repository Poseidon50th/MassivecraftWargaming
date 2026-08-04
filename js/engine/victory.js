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

export function* enumerateOrderSets(game, player) {
  const units = activeUnits(game, player);
  const required = requiredOrderCount(game, player);
  const options = new Map(
    units.map((unit) => [
      unit.id,
      [
        ...legalMovesForUnit(game, unit),
        ...FACINGS.filter((facing) => facing !== unit.facing).map((facing) => rotationOrder(unit, facing)),
      ],
    ]),
  );

  function* chooseUnits(start, chosen) {
    if (chosen.length === required) {
      function* chooseOptions(index, orders) {
        if (index === chosen.length) {
          if (!validateOrders(game, player, orders)) yield structuredClone(orders);
          return;
        }
        for (const order of options.get(chosen[index].id)) yield* chooseOptions(index + 1, [...orders, order]);
      }
      yield* chooseOptions(0, []);
      return;
    }
    for (let index = start; index <= units.length - (required - chosen.length); index += 1) {
      yield* chooseUnits(index + 1, [...chosen, units[index]]);
    }
  }
  yield* chooseUnits(0, []);
}

// Order sets are generated lazily. Most healthy positions produce a surviving
// order/response witness immediately; proven defeat still examines the complete
// relevant space, regardless of the number of pieces remaining.
export function forcedDefeatStatus(game, player) {
  const enemy = player === "human" ? "computer" : "human";
  let ownSetCount = 0;
  let responseCount = 0;
  for (const ownOrders of enumerateOrderSets(game, player)) {
    ownSetCount += 1;
    for (const response of enumerateOrderSets(game, enemy)) {
      responseCount += 1;
      const result = player === "human"
        ? resolveRound(game, ownOrders, response).game
        : resolveRound(game, response, ownOrders).game;
      if (!immediateDefeat(result, player).defeated) {
        return {
          status: "not-proven",
          reason: "At least one exact order-and-response outcome survives.",
          examined: { ownSetCount, responseCount },
        };
      }
    }
  }
  if (ownSetCount === 0) return { status: "proven", reason: "No complete permitted order set exists." };
  return {
    status: "proven",
    reason: "Every permitted order set is defeated by every relevant opposing response.",
    examined: { ownSetCount, responseCount },
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
