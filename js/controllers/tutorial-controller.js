import {
  buildTutorialGame,
  TUTORIAL_LESSONS,
  TUTORIAL_PLANS,
  TUTORIAL_ROUND_COPY,
  UNIT_TUTORIALS,
} from "../data/tutorial.js";
import { PLAYERS, UNIT_DEFS } from "../engine/constants.js";

export function orderMatchesTutorialPlan(order, plan) {
  return order.unitId === plan.unitId &&
    order.kind === plan.kind &&
    order.to.x === plan.to.x &&
    order.to.y === plan.to.y &&
    order.facing === plan.facing;
}

export function tutorialPlansForRound(game) {
  return game?.mode === "tutorial" ? TUTORIAL_PLANS[game.round] ?? [] : [];
}

export function tutorialCoachForRound(game) {
  const copy = TUTORIAL_ROUND_COPY[game?.round];
  const roundsRemaining = Math.max(0, (game?.tutorial?.roundCap ?? 20) - (game?.round ?? 1) + 1);
  return copy?.coach ?? `The prepared line has changed. Continue freely and compare the control totals; ${roundsRemaining} round${roundsRemaining === 1 ? " remains" : "s remain"}.`;
}

export function tutorialHintText(game) {
  if (!game || game.mode !== "tutorial") return "Start the guided battle to see round hints.";
  const plans = tutorialPlansForRound(game);
  const orders = game.orders?.[PLAYERS.HUMAN] ?? [];
  const remaining = plans.filter(
    (plan) => !orders.some((order) => orderMatchesTutorialPlan(order, plan)),
  );
  if (!plans.length) {
    const complete = new Set(game.tutorial?.contributors ?? []);
    const missing = game.units.filter(
      (unit) => unit.alive !== false && unit.player === PLAYERS.HUMAN && !complete.has(unit.id),
    );
    return missing.length
      ? `You left the prepared two-round line. Aim these pieces at surviving enemies: ${missing.map((unit) => UNIT_DEFS[unit.type].name).join(", ")}. Use the Unit Guide patterns and compare the control totals before locking.`
      : "Every surviving unit has contributed to a capture. Finish constricting the remaining enemy positions.";
  }
  return remaining.length
    ? remaining.map((plan, index) => `${index + 1}. ${plan.summary}`).join(" ")
    : "All three recommended orders are ready. Lock orders to resolve the round.";
}

export function createTutorialController({
  elements,
  getGame,
  setGame,
  getTutorialStep,
  setTutorialStep,
  setPendingMove,
  setStatus,
  save,
  openGame,
  render,
  cancelDelayedWork,
  showFeedback,
  makeUnitVisual,
  unitAssets,
}) {
  function expectedOrders() {
    return tutorialPlansForRound(getGame());
  }

  function checkOrder(order) {
    const game = getGame();
    if (game?.mode !== "tutorial") return { allowed: true };
    const plan = expectedOrders().find((candidate) => candidate.unitId === order.unitId);
    if (!plan) {
      return {
        allowed: true,
        advisory: true,
        title: "Order accepted — watch the objective",
        text: "That order has been recorded. It does not follow the recommended capture line, so inspect the control totals before locking or press Show hint. You may keep it, change it, or continue experimenting.",
      };
    }
    if (!orderMatchesTutorialPlan(order, plan)) {
      return {
        allowed: true,
        advisory: true,
        title: "Order accepted — compare the stronger line",
        text: `Your choice has been recorded and will not be stopped. The recommended order is: ${plan.summary} ${plan.lesson}`,
      };
    }
    return { allowed: true, plan };
  }

  function hintText() {
    return tutorialHintText(getGame());
  }

  function makeUnitPractice(type) {
    const practice = UNIT_TUTORIALS[type];
    const wrapper = document.createElement("section");
    wrapper.className = "unit-practice";
    const board = document.createElement("div");
    board.className = "unit-practice-board";
    board.setAttribute("aria-label", `${UNIT_DEFS[type].name} practice battlefield`);
    const control = new Map(practice.control.map(([x, y, value]) => [`${x},${y}`, value]));
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const cell = document.createElement("span");
        cell.className = "practice-cell";
        const value = control.get(`${x},${y}`);
        if (value !== undefined) {
          cell.classList.add("practice-control");
          cell.textContent = value;
        }
        if (x === practice.unit[0] && y === practice.unit[1]) {
          cell.innerHTML = `<span class="practice-token"><img src="${unitAssets[type]}" alt="Your ${UNIT_DEFS[type].name}" /></span>`;
        }
        if (x === practice.target[0] && y === practice.target[1]) {
          cell.classList.add("practice-target");
          cell.innerHTML = `<span class="practice-token enemy"><img src="${unitAssets[practice.targetType]}" alt="Enemy ${UNIT_DEFS[practice.targetType].name}" /></span>`;
        }
        board.append(cell);
      }
    }
    const choices = document.createElement("div");
    choices.className = "practice-choices";
    choices.innerHTML = `<h3>Try this piece</h3><p>${practice.prompt}</p>`;
    const feedback = document.createElement("p");
    feedback.className = "practice-feedback";
    feedback.textContent = "Choose an answer. Every wrong choice explains what the piece would do instead.";
    for (const [label, correct, explanation] of practice.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "practice-choice";
      button.textContent = label;
      button.addEventListener("click", () => {
        choices.querySelectorAll(".practice-choice").forEach((candidate) => candidate.classList.remove("correct", "wrong"));
        button.classList.add(correct ? "correct" : "wrong");
        feedback.innerHTML = `<strong>${correct ? "Right move." : "Try again."}</strong> ${explanation}`;
      });
      choices.append(button);
    }
    choices.append(feedback);
    wrapper.append(board, choices);
    return wrapper;
  }

  function renderLesson() {
    const step = getTutorialStep();
    const lesson = TUTORIAL_LESSONS[step];
    elements.tutorialStepKicker.textContent = lesson.kicker;
    elements.tutorialStepTitle.textContent = lesson.title;
    elements.tutorialStepContent.replaceChildren();
    if (lesson.unitType) {
      const definition = UNIT_DEFS[lesson.unitType];
      const intro = document.createElement("p");
      intro.textContent = definition.description;
      elements.tutorialStepContent.append(intro, makeUnitVisual(lesson.unitType, true));
      if (lesson.unitType === "cavalry") {
        elements.tutorialStepContent.insertAdjacentHTML("beforeend", "<p><b>Special:</b> Cavalry rises from 2 to 4 control against an enemy with no adjacent ally. If the enemy control needed to destroy it comes from units also destroyed in the same check, the Cavalry survives.</p>");
      }
      if (lesson.unitType === "artillery") {
        elements.tutorialStepContent.insertAdjacentHTML("beforeend", "<p><b>Special:</b> Artillery cannot move, cannot support a friendly occupied square, and stops projecting while its own square is disputed. Rotation is its only order.</p>");
      }
      elements.tutorialStepContent.append(makeUnitPractice(lesson.unitType));
    } else {
      elements.tutorialStepContent.innerHTML = lesson.html;
    }
    elements.tutorialBackButton.disabled = step === 0;
    elements.tutorialNextButton.textContent = lesson.startsBattle ? "Begin the Battle" : "Next";
  }

  function open(step = 0) {
    setTutorialStep(Math.max(0, Math.min(step, TUTORIAL_LESSONS.length - 1)));
    renderLesson();
    elements.tutorialDialog.showModal();
  }

  function startBattle() {
    cancelDelayedWork();
    setGame(buildTutorialGame());
    setPendingMove(null);
    setStatus(tutorialCoachForRound(getGame()));
    save();
    openGame();
    window.setTimeout(() => {
      if (getGame()?.mode === "tutorial" && getGame()?.round === 1) {
        showFeedback("Round 1: isolate and support", tutorialCoachForRound(getGame()));
      }
    }, 150);
  }

  function toggleHint() {
    const game = getGame();
    if (!game?.tutorial) return;
    game.tutorial.hintVisible = !game.tutorial.hintVisible;
    setStatus(game.tutorial.hintVisible ? hintText() : tutorialCoachForRound(game));
    save();
    render();
  }

  function back() {
    setTutorialStep(Math.max(0, getTutorialStep() - 1));
    renderLesson();
  }

  function next() {
    const lesson = TUTORIAL_LESSONS[getTutorialStep()];
    if (lesson.startsBattle) {
      const game = getGame();
      if (game && game.mode !== "tutorial" && !window.confirm("Starting the tutorial will replace the current saved battle. Continue?")) return;
      elements.tutorialDialog.close();
      startBattle();
      return;
    }
    setTutorialStep(Math.min(TUTORIAL_LESSONS.length - 1, getTutorialStep() + 1));
    renderLesson();
  }

  return {
    expectedOrders,
    checkOrder,
    hintText,
    coachText: () => tutorialCoachForRound(getGame()),
    open,
    startBattle,
    toggleHint,
    back,
    next,
    renderLesson,
  };
}
