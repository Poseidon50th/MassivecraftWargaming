import { chooseComputerOrders } from "../ai/computer.js";
import { TUTORIAL_ROUND_COPY, tutorialEnemyOrders } from "../data/tutorial.js";
import { PLAYERS, UNIT_DEFS } from "../engine/constants.js";
import { getUnit } from "../engine/model.js";
import { requiredOrderCount, validateOrders } from "../engine/movement.js";
import { resolveRound } from "../engine/resolution.js";
import { evaluateVictory } from "../engine/victory.js";
import { getDifficulty } from "../ai/difficulties.js";

export function createBattleController({
  getGame,
  setGame,
  setPendingMove,
  setStatus,
  save,
  clearSave,
  render,
  showFeedback,
  tutorial,
  resultView,
  returnToWelcome,
  announce,
}) {
  let resolutionTimer = null;
  let resolutionGeneration = 0;

  function cancelDelayedWork() {
    resolutionGeneration += 1;
    if (resolutionTimer !== null) window.clearTimeout(resolutionTimer);
    resolutionTimer = null;
  }

  function selectedUnit() {
    const game = getGame();
    return game?.selectedUnitId ? getUnit(game, game.selectedUnitId) : null;
  }

  function currentHumanOrders() {
    return getGame()?.orders?.[PLAYERS.HUMAN] ?? [];
  }

  function finishGame(result) {
    cancelDelayedWork();
    const game = getGame();
    if (!game) return;
    game.winner = result.winner;
    game.defeatReason = result.reason;
    game.phase = "ended";
    game.log.unshift({ round: game.round, text: `Battle concluded: ${result.reason}` });
    save();
    render();
    resultView(result);
  }

  function checkOpeningVictory() {
    const game = getGame();
    if (!game || game.phase !== "orders" || game.winner) return false;
    const result = evaluateVictory(game);
    if (!result) return false;
    finishGame(result);
    return true;
  }

  function setOrder(order) {
    const game = getGame();
    if (!game || game.phase !== "orders") return;
    const tutorialCheck = tutorial.checkOrder(order);
    const orders = currentHumanOrders();
    const existingIndex = orders.findIndex((candidate) => candidate.unitId === order.unitId);
    if (existingIndex < 0 && orders.length >= requiredOrderCount(game, PLAYERS.HUMAN)) {
      announce("All available order slots are filled. Remove or change an existing order first.");
      return;
    }
    const duplicate = orders.find(
      (candidate) => candidate.unitId !== order.unitId && candidate.kind === "move" && order.kind === "move" && candidate.to.x === order.to.x && candidate.to.y === order.to.y,
    );
    if (duplicate) {
      announce("Two allied units cannot be ordered to the same destination.");
      return;
    }
    if (existingIndex >= 0) orders.splice(existingIndex, 1, order);
    else orders.push(order);
    game.selectedUnitId = null;
    setPendingMove(null);
    setStatus(`${orders.length} of ${requiredOrderCount(game, PLAYERS.HUMAN)} orders prepared.`);
    if (tutorialCheck.plan) {
      setStatus(`Good move. ${tutorialCheck.plan.lesson}`);
      if (game.tutorial) game.tutorial.hintVisible = false;
    }
    save();
    render();
    if (tutorialCheck.advisory) {
      window.setTimeout(() => {
        if (getGame() === game && game.phase === "orders") showFeedback(tutorialCheck.title, tutorialCheck.text);
      }, 30);
    }
  }

  function applyTutorialContributors(game, resolution) {
    const contributors = new Set(game.tutorial?.contributors ?? []);
    for (const casualty of resolution.casualties.filter((unit) => unit.player === PLAYERS.COMPUTER)) {
      for (const source of resolution.contributors[casualty.y][casualty.x][PLAYERS.HUMAN]) contributors.add(source.unitId);
    }
    game.tutorial = { ...game.tutorial, hintVisible: false, contributors: [...contributors] };
  }

  function completeRound(expectedGame, generation, humanOrders, computerOrders, tutorialRound) {
    if (generation !== resolutionGeneration || getGame() !== expectedGame || expectedGame.phase !== "resolving") return;
    resolutionTimer = null;
    const resolution = resolveRound(expectedGame, humanOrders, computerOrders);
    setGame(resolution.game);
    const game = getGame();
    if (tutorialRound) applyTutorialContributors(game, resolution);
    let result = evaluateVictory(game);
    if (!result && tutorialRound && game.round > (game.tutorial?.roundCap ?? 20)) {
      result = { winner: PLAYERS.COMPUTER, reason: "The 20-round tutorial limit expired. Restart the exercise or review the unit lessons and try a different formation." };
    }
    setStatus(result ? result.reason : "Control recalculated. Prepare the next three orders.");
    if (result) {
      const tutorialResult = TUTORIAL_ROUND_COPY[tutorialRound]?.result ?? "The battle ended after you departed from the recommended line.";
      finishGame(tutorialRound ? { ...result, reason: `${tutorialResult} ${result.reason}` } : result);
      return;
    }
    if (tutorialRound) {
      setStatus(tutorial.coachText());
      showFeedback(
        `Round ${tutorialRound} complete`,
        TUTORIAL_ROUND_COPY[tutorialRound]?.result ?? "Your order was resolved. Review the capture badges and adjust the formation for the next round.",
      );
    }
    save();
    render();
  }

  function lockOrders() {
    const game = getGame();
    if (!game || game.phase !== "orders") return;
    const error = validateOrders(game, PLAYERS.HUMAN, currentHumanOrders());
    if (error) {
      announce(error);
      return;
    }
    const humanOrders = structuredClone(currentHumanOrders());
    const tutorialRound = game.mode === "tutorial" ? game.round : null;
    cancelDelayedWork();
    const generation = resolutionGeneration;
    game.phase = "resolving";
    const opponentName = game.mode === "tutorial" ? "battlefield instructor" : getDifficulty(game.aiDifficulty).name;
    setStatus(`${opponentName} is considering the public battlefield…`);
    save();
    render();
    resolutionTimer = window.setTimeout(
      () => {
        if (generation !== resolutionGeneration || getGame() !== game || game.phase !== "resolving") return;
        const computerOrders = game.mode === "tutorial" ? tutorialEnemyOrders(game) : chooseComputerOrders(game, game.aiDifficulty);
        const aiError = validateOrders(game, PLAYERS.COMPUTER, computerOrders);
        if (aiError) {
          game.phase = "orders";
          resolutionTimer = null;
          announce(`The opposing general could not form valid orders: ${aiError}`);
          render();
          return;
        }
        setStatus("Both generals have committed. Resolving simultaneous movement…");
        render();
        resolutionTimer = window.setTimeout(
          () => completeRound(game, generation, humanOrders, computerOrders, tutorialRound),
          320,
        );
      },
      30,
    );
  }

  function abandonBattle() {
    const game = getGame();
    if (!game) return;
    if (!window.confirm("Abandon this battle and return to field selection?")) return;
    cancelDelayedWork();
    clearSave();
    setGame(null);
    setPendingMove(null);
    returnToWelcome();
  }

  function clearOrders() {
    const game = getGame();
    if (!game || game.phase !== "orders") return;
    game.orders.human = [];
    game.selectedUnitId = null;
    setPendingMove(null);
    setStatus("Orders cleared.");
    save();
    render();
  }

  function removeOrder(unitId) {
    const game = getGame();
    game.orders.human = currentHumanOrders().filter((candidate) => candidate.unitId !== unitId);
    save();
    render();
  }

  return {
    cancelDelayedWork,
    selectedUnit,
    currentHumanOrders,
    setOrder,
    lockOrders,
    clearOrders,
    removeOrder,
    finishGame,
    checkOpeningVictory,
    abandonBattle,
    isResolving: () => resolutionTimer !== null,
  };
}
