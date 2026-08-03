import { chooseComputerOrders, deployComputerUnit } from "./ai/computer.js";
import { getScenario } from "./data/scenarios.js";
import {
  buildTutorialGame,
  TUTORIAL_LESSONS,
  TUTORIAL_PLANS,
  TUTORIAL_ROUND_COPY,
  tutorialEnemyOrders,
} from "./data/tutorial.js";
import { DIRECTIONS, FACINGS, PLAYERS, UNIT_DEFS } from "./engine/constants.js";
import { computeControl, controlOwner } from "./engine/control.js";
import {
  activeUnits,
  createGame,
  getUnit,
  isDeploymentSquare,
  placeUnit,
  unitAt,
} from "./engine/model.js";
import {
  legalMovesForUnit,
  requiredOrderCount,
  rotationOrder,
  validateOrders,
} from "./engine/movement.js";
import { resolveRound } from "./engine/resolution.js";
import { evaluateVictory, immediateDefeat } from "./engine/victory.js";

const SAVE_KEY = "massivecraft-wars-standard-battle-v1";
const LEGACY_SAVE_KEY = "oscird-standard-battle-v1";
const UNIT_ASSETS = Object.freeze({
  sword: "assets/units/swords.png",
  spear: "assets/units/spears.png",
  axe: "assets/units/axes.png",
  cavalry: "assets/units/cavalry.png",
  musket: "assets/units/muskets.png",
  artillery: "assets/units/artillery.png",
});
const $ = (selector) => document.querySelector(selector);

const elements = {
  welcome: $("#welcome"),
  game: $("#game"),
  form: $("#new-game-form"),
  continueButton: $("#continue-button"),
  board: $("#game-board"),
  status: $("#status-banner"),
  scenarioName: $("#scenario-name"),
  phaseHeading: $("#phase-heading"),
  round: $("#round-number"),
  deploymentPanel: $("#deployment-panel"),
  ordersPanel: $("#orders-panel"),
  reserveList: $("#reserve-list"),
  orderCount: $("#order-count"),
  ordersList: $("#orders-list"),
  selectedCard: $("#selected-unit-card"),
  selectedName: $("#selected-unit-name"),
  selectedDetail: $("#selected-unit-detail"),
  lockButton: $("#lock-orders-button"),
  clearButton: $("#clear-orders-button"),
  humanStrength: $("#human-strength"),
  computerStrength: $("#computer-strength"),
  battleLog: $("#battle-log"),
  controlToggle: $("#control-toggle"),
  rulesButton: $("#rules-button"),
  welcomeRulesButton: $("#welcome-rules-button"),
  rulesDialog: $("#rules-dialog"),
  unitsButton: $("#units-button"),
  welcomeUnitsButton: $("#welcome-units-button"),
  unitsDialog: $("#units-dialog"),
  unitGuideGrid: $("#unit-guide-grid"),
  tutorialButton: $("#tutorial-button"),
  battleTutorialButton: $("#battle-tutorial-button"),
  tutorialPanel: $("#tutorial-panel"),
  tutorialRoundTitle: $("#tutorial-round-title"),
  tutorialCoachText: $("#tutorial-coach-text"),
  tutorialHintButton: $("#tutorial-hint-button"),
  tutorialRestartButton: $("#tutorial-restart-button"),
  tutorialDialog: $("#tutorial-dialog"),
  tutorialStepKicker: $("#tutorial-step-kicker"),
  tutorialStepTitle: $("#tutorial-step-title"),
  tutorialStepContent: $("#tutorial-step-content"),
  tutorialBackButton: $("#tutorial-back-button"),
  tutorialNextButton: $("#tutorial-next-button"),
  tutorialCloseButton: $("#tutorial-close-button"),
  tutorialFeedbackDialog: $("#tutorial-feedback-dialog"),
  tutorialFeedbackTitle: $("#tutorial-feedback-title"),
  tutorialFeedbackText: $("#tutorial-feedback-text"),
  newBattle: $("#new-battle-button"),
  resultDialog: $("#result-dialog"),
  resultTitle: $("#result-title"),
  resultReason: $("#result-reason"),
};

let game = null;
let selectedReserveType = "sword";
let showControl = true;
let transientStatus = "";
let pendingMove = null;
let tutorialStep = 0;

const CONTROL_DIAGRAMS = Object.freeze({
  sword: { columns: 3, rows: 3, center: [1, 1], cells: [[1, 0, 3], [0, 1, 3], [2, 1, 3], [1, 2, 3]] },
  spear: { columns: 3, rows: 2, center: [1, 1], cells: [[0, 0, 3], [1, 0, 3], [2, 0, 3]] },
  axe: { columns: 1, rows: 2, center: [0, 1], cells: [[0, 0, 5]] },
  cavalry: { columns: 3, rows: 3, center: [1, 1], cells: [[1, 0, 2], [0, 1, 2], [2, 1, 2], [1, 2, 2]] },
  musket: { columns: 1, rows: 4, center: [0, 3], cells: [[0, 0, 1], [0, 1, 2], [0, 2, 3]] },
  artillery: {
    columns: 3,
    rows: 6,
    center: [1, 5],
    cells: [[0, 0, 3], [1, 0, 3], [2, 0, 3], [0, 1, 3], [1, 1, 3], [2, 1, 3]],
  },
});

function boardCoordinate(x, y, size = game?.size ?? 8) {
  return `${String.fromCharCode(65 + x)}${size - y}`;
}

function makeControlDiagram(type) {
  const spec = CONTROL_DIAGRAMS[type];
  const diagram = document.createElement("div");
  diagram.className = `pattern-diagram control-pattern ${type}`;
  diagram.style.setProperty("--diagram-columns", spec.columns);
  diagram.style.setProperty("--diagram-rows", spec.rows);
  const values = new Map(spec.cells.map(([x, y, value]) => [`${x},${y}`, value]));
  for (let y = 0; y < spec.rows; y += 1) {
    for (let x = 0; x < spec.columns; x += 1) {
      const cell = document.createElement("span");
      cell.className = "diagram-cell";
      const value = values.get(`${x},${y}`);
      if (value !== undefined) {
        cell.classList.add("projected-control");
        cell.textContent = value;
      }
      if (x === spec.center[0] && y === spec.center[1]) {
        cell.className = "diagram-cell diagram-unit";
        cell.innerHTML = `<i aria-hidden="true">↑</i><img src="${UNIT_ASSETS[type]}" alt="" /><b>${UNIT_DEFS[type].strength}</b>`;
      }
      diagram.append(cell);
    }
  }
  diagram.setAttribute("aria-label", `${UNIT_DEFS[type].name} control pattern while facing north`);
  return diagram;
}

function makeMovementDiagram(type) {
  const range = UNIT_DEFS[type].movement;
  const radius = Math.max(1, range);
  const size = radius * 2 + 1;
  const diagram = document.createElement("div");
  diagram.className = `pattern-diagram movement-pattern range-${range} ${type}`;
  diagram.style.setProperty("--diagram-columns", size);
  diagram.style.setProperty("--diagram-rows", size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = document.createElement("span");
      const distance = Math.abs(x - radius) + Math.abs(y - radius);
      cell.className = "diagram-cell";
      if (range > 0 && distance > 0 && distance <= range) cell.classList.add("movement-reach");
      if (x === radius && y === radius) {
        cell.className = "diagram-cell diagram-unit";
        cell.innerHTML = `<img src="${UNIT_ASSETS[type]}" alt="" />`;
      }
      diagram.append(cell);
    }
  }
  diagram.setAttribute("aria-label", range ? `${UNIT_DEFS[type].name} movement range ${range}` : `${UNIT_DEFS[type].name} cannot move`);
  return diagram;
}

function makeUnitVisual(type, compact = false) {
  const definition = UNIT_DEFS[type];
  const wrapper = document.createElement("div");
  wrapper.className = `unit-visual${compact ? " compact" : ""}`;
  const stats = document.createElement("div");
  stats.className = "unit-stat-row";
  stats.innerHTML = `<span>Strength <b>${definition.strength}</b></span><span>Movement <b>${definition.movement}</b></span><span>Initiative <b>${definition.initiative}</b></span>`;
  const diagrams = document.createElement("div");
  diagrams.className = "unit-diagrams";
  const controlFigure = document.createElement("figure");
  controlFigure.append(makeControlDiagram(type));
  controlFigure.insertAdjacentHTML("beforeend", "<figcaption>Projects control</figcaption>");
  const movementFigure = document.createElement("figure");
  movementFigure.append(makeMovementDiagram(type));
  movementFigure.insertAdjacentHTML("beforeend", "<figcaption>May move</figcaption>");
  diagrams.append(controlFigure, movementFigure);
  wrapper.append(stats, diagrams);
  return wrapper;
}

function renderUnitGuide() {
  elements.unitGuideGrid.replaceChildren();
  for (const type of Object.keys(UNIT_DEFS)) {
    const definition = UNIT_DEFS[type];
    const article = document.createElement("article");
    const heading = document.createElement("div");
    heading.className = "unit-guide-heading";
    heading.innerHTML = `<span class="guide-token" data-unit-type="${type}"><img src="${UNIT_ASSETS[type]}" alt="" /></span><div><h3>${definition.name}</h3><p>${definition.description}</p></div>`;
    const special = document.createElement("p");
    special.className = "unit-special";
    if (type === "cavalry") {
      special.textContent = "Special: projects 4 onto an enemy without adjacent allies; it survives when the control needed to destroy it comes from units also destroyed in that Control Check.";
    } else if (type === "artillery") {
      special.textContent = "Special: cannot move; may rotate as an order; stops projecting when its tile is disputed; cannot support friendly units; cannot deploy adjacent to another Artillery.";
    } else if (definition.directional) {
      special.textContent = "Directional: the north arrow in the diagram marks the unit’s facing. A moved unit may choose any final facing.";
    } else {
      special.textContent = "Omnidirectional: the control pattern does not change when the piece is rotated.";
    }
    article.append(heading, makeUnitVisual(type), special);
    elements.unitGuideGrid.append(article);
  }
}

function showTutorialFeedback(title, text) {
  elements.tutorialFeedbackTitle.textContent = title;
  elements.tutorialFeedbackText.textContent = text;
  elements.tutorialFeedbackDialog.showModal();
}

function renderTutorialLesson() {
  const lesson = TUTORIAL_LESSONS[tutorialStep];
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
      elements.tutorialStepContent.insertAdjacentHTML("beforeend", "<p><b>Special:</b> Artillery cannot move, cannot support a friendly occupied square, and stops projecting while its own tile is disputed. Rotation is its only order.</p>");
    }
  } else {
    elements.tutorialStepContent.innerHTML = lesson.html;
  }
  elements.tutorialBackButton.disabled = tutorialStep === 0;
  elements.tutorialNextButton.textContent = lesson.startsBattle ? "Begin the Battle" : "Next";
}

function openTutorial(step = 0) {
  tutorialStep = Math.max(0, Math.min(step, TUTORIAL_LESSONS.length - 1));
  renderTutorialLesson();
  elements.tutorialDialog.showModal();
}

function startTutorialBattle() {
  game = buildTutorialGame();
  pendingMove = null;
  transientStatus = TUTORIAL_ROUND_COPY[1].coach;
  saveGame();
  openGame();
  window.setTimeout(() => showTutorialFeedback("Round 1: isolate and support", TUTORIAL_ROUND_COPY[1].coach), 150);
}

function tutorialExpectedOrders() {
  return game?.mode === "tutorial" ? TUTORIAL_PLANS[game.round] ?? [] : [];
}

function orderMatchesPlan(order, plan) {
  return order.unitId === plan.unitId &&
    order.kind === plan.kind &&
    order.to.x === plan.to.x &&
    order.to.y === plan.to.y &&
    order.facing === plan.facing;
}

function tutorialOrderCheck(order) {
  if (game?.mode !== "tutorial") return { allowed: true };
  const plan = tutorialExpectedOrders().find((candidate) => candidate.unitId === order.unitId);
  if (!plan) {
    return {
      allowed: false,
      title: "Legal, but not useful in this lesson",
      text: "That unit has a legal order, but moving it now spends one of only three orders without contributing to this round’s objective. Use the highlighted units or press Show hint.",
    };
  }
  if (!orderMatchesPlan(order, plan)) {
    return {
      allowed: false,
      title: "That line gives up the lesson",
      text: `This is a legal idea in a normal battle, but it does not complete the three-round solution. ${plan.summary} ${plan.lesson}`,
    };
  }
  return { allowed: true, plan };
}

function tutorialHintText() {
  const chosen = new Set(currentHumanOrders().map((order) => order.unitId));
  const remaining = tutorialExpectedOrders().filter((plan) => !chosen.has(plan.unitId));
  return remaining.length
    ? remaining.map((plan, index) => `${index + 1}. ${plan.summary}`).join(" ")
    : "All three correct orders are ready. Lock orders to resolve the round.";
}

function saveGame() {
  if (game) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    localStorage.removeItem(LEGACY_SAVE_KEY);
  }
  elements.continueButton.hidden = !(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY));
}

function loadGame() {
  try {
    const loaded = JSON.parse(localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY));
    if (!loaded || loaded.version !== 1 || !loaded.size) throw new Error("Invalid save");
    game = loaded;
    pendingMove = null;
    openGame();
  } catch {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
    elements.continueButton.hidden = true;
  }
}

function openGame() {
  document.body.dataset.screen = "battle";
  elements.welcome.hidden = true;
  elements.game.hidden = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

function announce(message) {
  transientStatus = message;
  elements.status.textContent = message;
}

function startGame(scenarioId) {
  game = createGame(getScenario(scenarioId));
  selectedReserveType = "sword";
  pendingMove = null;
  transientStatus = "Select a reserve unit, then place it in either of your back rows.";
  saveGame();
  openGame();
}

function reserveGroups() {
  const counts = {};
  for (const unit of game.reserves[PLAYERS.HUMAN]) counts[unit.type] = (counts[unit.type] ?? 0) + 1;
  return counts;
}

function artilleryAdjacent(x, y) {
  return game.units.some(
    (unit) =>
      unit.alive !== false &&
      unit.type === "artillery" &&
      Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
  );
}

function placeHumanUnit(x, y) {
  if (!isDeploymentSquare(game, PLAYERS.HUMAN, y) || unitAt(game, x, y)) return;
  const reserve = game.reserves[PLAYERS.HUMAN].find((unit) => unit.type === selectedReserveType);
  if (!reserve) return;
  if (reserve.type === "artillery" && artilleryAdjacent(x, y)) {
    announce("Artillery cannot be placed adjacent to another Artillery unit.");
    return;
  }
  placeUnit(game, reserve, x, y, "north");
  deployComputerUnit(game);
  const groups = reserveGroups();
  if (!groups[selectedReserveType]) selectedReserveType = Object.keys(groups)[0] ?? null;
  if (!game.reserves.human.length && !game.reserves.computer.length) {
    game.phase = "orders";
    game.round = 1;
    game.log.unshift({ round: 1, text: "Both armies completed deployment. The first Orders Phase began." });
    transientStatus = "Choose three distinct units. The opposing general cannot see your orders.";
    checkOpeningDefeat();
  } else {
    transientStatus = `${game.reserves.human.length} of your units remain in reserve.`;
  }
  saveGame();
  render();
}

function checkOpeningDefeat() {
  if (!game || game.phase !== "orders" || game.winner) return;
  const human = immediateDefeat(game, PLAYERS.HUMAN);
  if (human.defeated) finishGame({ winner: PLAYERS.COMPUTER, reason: human.reason });
}

function selectedUnit() {
  return game?.selectedUnitId ? getUnit(game, game.selectedUnitId) : null;
}

function currentHumanOrders() {
  return game.orders[PLAYERS.HUMAN];
}

function setOrder(order) {
  const tutorialCheck = tutorialOrderCheck(order);
  if (!tutorialCheck.allowed) {
    showTutorialFeedback(tutorialCheck.title, tutorialCheck.text);
    return;
  }
  const orders = currentHumanOrders();
  const existingIndex = orders.findIndex((candidate) => candidate.unitId === order.unitId);
  if (existingIndex < 0 && orders.length >= requiredOrderCount(game, PLAYERS.HUMAN)) {
    announce("All available order slots are filled. Remove or change an existing order first.");
    return;
  }
  const duplicate = orders.find(
    (candidate) =>
      candidate.unitId !== order.unitId &&
      candidate.kind === "move" &&
      order.kind === "move" &&
      candidate.to.x === order.to.x &&
      candidate.to.y === order.to.y,
  );
  if (duplicate) {
    announce("Two allied units cannot be ordered to the same destination.");
    return;
  }
  if (existingIndex >= 0) orders.splice(existingIndex, 1, order);
  else orders.push(order);
  game.selectedUnitId = null;
  pendingMove = null;
  transientStatus = `${orders.length} of ${requiredOrderCount(game, PLAYERS.HUMAN)} orders prepared.`;
  if (tutorialCheck.plan) {
    transientStatus = `Good move. ${tutorialCheck.plan.lesson}`;
    if (game.tutorial) game.tutorial.hintVisible = false;
  }
  saveGame();
  render();
}

function handleBoardClick(x, y) {
  if (!game || game.winner || game.phase === "resolving") return;
  if (game.phase === "deployment") {
    placeHumanUnit(x, y);
    return;
  }
  if (game.phase !== "orders") return;

  const selected = selectedUnit();
  if (selected) {
    const move = legalMovesForUnit(game, selected).find((candidate) => candidate.to.x === x && candidate.to.y === y);
    if (move) {
      pendingMove = move;
      transientStatus = `Choose the moved ${UNIT_DEFS[selected.type].name} unit’s final facing with an arrow around the preview piece.`;
      render();
      return;
    }
  }
  const unit = unitAt(game, x, y);
  if (unit?.player === PLAYERS.HUMAN) {
    game.selectedUnitId = unit.id;
    pendingMove = null;
    transientStatus = `${UNIT_DEFS[unit.type].name} selected. Choose a highlighted destination, or click an arrow around this piece to rotate in place.`;
    render();
  } else {
    game.selectedUnitId = null;
    pendingMove = null;
    render();
  }
}

function makeFacingPad(unit, move = null) {
  const pad = document.createElement("span");
  pad.className = `board-facing-pad${move ? " move-facing-pad" : ""}`;
  pad.setAttribute("aria-label", move ? "Choose final facing and confirm move" : "Rotate this unit in place");
  for (const facing of FACINGS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `board-facing-choice ${facing}`;
    button.dataset.facing = facing;
    button.textContent = DIRECTIONS[facing].glyph;
    button.title = move ? `Move here facing ${facing}` : `Rotate in place to face ${facing}`;
    button.setAttribute("aria-label", button.title);
    if (!move && facing === unit.facing) {
      button.disabled = true;
      button.classList.add("current");
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (move) setOrder({ ...move, facing });
      else setOrder(rotationOrder(unit, facing));
    });
    pad.append(button);
  }
  return pad;
}

function renderBoard() {
  const control = computeControl(game);
  const selected = selectedUnit();
  const legalMoves = selected ? legalMovesForUnit(game, selected) : [];
  const legalKeys = new Set(legalMoves.map((move) => `${move.to.x},${move.to.y}`));
  const orderedIds = new Set(currentHumanOrders().map((order) => order.unitId));
  elements.board.replaceChildren();
  elements.board.style.setProperty("--board-size", game.size);
  elements.board.dataset.size = String(game.size);
  elements.board.classList.toggle("show-control", showControl && game.phase !== "deployment");

  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const square = document.createElement("div");
      square.className = "square";
      square.setAttribute("role", "gridcell");
      square.tabIndex = 0;
      const owner = controlOwner(control[y][x]);
      square.classList.add(`control-${owner}`);
      if (game.phase === "deployment" && isDeploymentSquare(game, PLAYERS.HUMAN, y) && !unitAt(game, x, y)) {
        square.classList.add("deployment-valid");
      }
      if (legalKeys.has(`${x},${y}`)) square.classList.add("legal-move");
      const unit = unitAt(game, x, y);
      if (unit?.id === game.selectedUnitId) square.classList.add("selected");
      if (unit && orderedIds.has(unit.id)) square.classList.add("ordered");
      const tutorialPlan = tutorialExpectedOrders();
      if (
        game.mode === "tutorial" &&
        unit?.player === PLAYERS.HUMAN &&
        tutorialPlan.some((plan) => plan.unitId === unit.id) &&
        !orderedIds.has(unit.id)
      ) {
        square.classList.add("tutorial-focus");
      }
      if (
        game.mode === "tutorial" &&
        game.tutorial?.hintVisible &&
        selected &&
        tutorialPlan.some((plan) => plan.unitId === selected.id && plan.to.x === x && plan.to.y === y)
      ) {
        square.classList.add("tutorial-target");
      }

      const coordinate = document.createElement("span");
      coordinate.className = "coordinate";
      coordinate.textContent = `${String.fromCharCode(65 + x)}${game.size - y}`;
      square.append(coordinate);

      const status = control[y][x];
      const controlScore = document.createElement("span");
      controlScore.className = "control-score";
      controlScore.setAttribute("aria-hidden", "true");
      controlScore.innerHTML = `<b class="human-score">${status.human}</b><i>/</i><b class="computer-score">${status.computer}</b>`;

      if (unit) {
        const token = document.createElement("span");
        token.className = `unit ${unit.player}`;
        token.dataset.unitType = unit.type;
        token.innerHTML = `<span class="facing" aria-hidden="true">${DIRECTIONS[unit.facing].glyph}</span><img src="${UNIT_ASSETS[unit.type]}" alt="" draggable="false" />`;
        if (unit.id === selected?.id && !pendingMove) token.append(makeFacingPad(unit));
        square.append(token);
        square.setAttribute(
          "aria-label",
          `${String.fromCharCode(65 + x)}${game.size - y}, ${unit.player === PLAYERS.HUMAN ? "your" : "enemy"} ${UNIT_DEFS[unit.type].name}, facing ${unit.facing}. Control ${status.human} to ${status.computer}.`,
        );
      } else {
        square.setAttribute("aria-label", `${String.fromCharCode(65 + x)}${game.size - y}, empty ${game.terrain[y][x]}. Control ${status.human} to ${status.computer}.`);
      }
      if (pendingMove?.to.x === x && pendingMove?.to.y === y && selected) {
        const preview = document.createElement("span");
        preview.className = `unit ${selected.player} move-preview`;
        preview.dataset.unitType = selected.type;
        preview.innerHTML = `<img src="${UNIT_ASSETS[selected.type]}" alt="" draggable="false" />`;
        preview.append(makeFacingPad(selected, pendingMove));
        square.append(preview);
        square.classList.add("pending-destination");
      }
      square.append(controlScore);
      square.addEventListener("click", () => handleBoardClick(x, y));
      square.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleBoardClick(x, y);
      });
      elements.board.append(square);
    }
  }
}

function renderReserve() {
  const groups = reserveGroups();
  elements.reserveList.replaceChildren();
  for (const [type, count] of Object.entries(groups)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `reserve-button${selectedReserveType === type ? " selected" : ""}`;
    button.dataset.unitType = type;
    button.innerHTML = `<span class="reserve-icon" aria-hidden="true"><img src="${UNIT_ASSETS[type]}" alt="" /></span><strong>${UNIT_DEFS[type].name}</strong><span>×${count}</span>`;
    button.title = UNIT_DEFS[type].description;
    button.addEventListener("click", () => {
      selectedReserveType = type;
      renderReserve();
    });
    elements.reserveList.append(button);
  }
}

function orderDescription(order) {
  const unit = getUnit(game, order.unitId);
  if (!unit) return "Unavailable unit";
  if (order.kind === "rotate") return `${UNIT_DEFS[unit.type].name} rotate ${order.facing}`;
  return `${UNIT_DEFS[unit.type].name} to ${String.fromCharCode(65 + order.to.x)}${game.size - order.to.y}`;
}

function renderOrders() {
  const orders = currentHumanOrders();
  const required = requiredOrderCount(game, PLAYERS.HUMAN);
  elements.orderCount.textContent = `${orders.length} / ${required}`;
  elements.ordersList.replaceChildren();
  for (const order of orders) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = orderDescription(order);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      game.orders.human = orders.filter((candidate) => candidate.unitId !== order.unitId);
      saveGame();
      render();
    });
    item.append(text, remove);
    elements.ordersList.append(item);
  }
  elements.lockButton.disabled = orders.length !== required || game.phase !== "orders";
  const unit = selectedUnit();
  elements.selectedCard.hidden = !unit;
  if (unit) {
    elements.selectedName.textContent = UNIT_DEFS[unit.type].name;
    elements.selectedDetail.textContent = pendingMove
      ? `Destination ${boardCoordinate(pendingMove.to.x, pendingMove.to.y)} selected. Click one of the four arrows around the preview piece to choose its final facing and confirm.`
      : `${UNIT_DEFS[unit.type].description} Currently facing ${unit.facing}.`;
  }
}

function renderTutorialPanel() {
  const active = game?.mode === "tutorial" && !game.winner;
  elements.tutorialPanel.hidden = !active;
  if (!active) return;
  const copy = TUTORIAL_ROUND_COPY[game.round];
  elements.tutorialRoundTitle.textContent = copy?.title ?? "Tutorial complete";
  elements.tutorialCoachText.textContent = game.tutorial?.hintVisible ? tutorialHintText() : (copy?.coach ?? "Complete the exercise.");
  elements.tutorialHintButton.textContent = game.tutorial?.hintVisible ? "Hide hint" : "Show hint";
}

function renderLog() {
  elements.battleLog.replaceChildren();
  for (const entry of game.log.slice(0, 10)) {
    const item = document.createElement("li");
    item.innerHTML = `<b>${entry.round ? `Round ${entry.round}` : "Setup"}</b> · ${entry.text}`;
    elements.battleLog.append(item);
  }
}

function render() {
  if (!game) return;
  const scenario = getScenario(game.scenarioId);
  elements.scenarioName.textContent = scenario.name;
  elements.phaseHeading.textContent = game.phase === "deployment" ? "Deployment" : game.phase === "resolving" ? "Orders revealed" : game.winner ? "Battle concluded" : "Orders phase";
  elements.round.textContent = game.round || "—";
  elements.deploymentPanel.hidden = game.phase !== "deployment";
  elements.ordersPanel.hidden = game.phase === "deployment";
  elements.humanStrength.textContent = activeUnits(game, PLAYERS.HUMAN).length;
  elements.computerStrength.textContent = activeUnits(game, PLAYERS.COMPUTER).length;
  elements.controlToggle.setAttribute("aria-pressed", String(showControl));
  elements.controlToggle.textContent = showControl ? "Control shading visible" : "Control shading hidden";
  if (game.phase === "deployment") renderReserve();
  else renderOrders();
  renderBoard();
  renderLog();
  renderTutorialPanel();
  elements.status.textContent = transientStatus || (game.phase === "orders" ? "Prepare your secret orders." : "Place your army.");
}

function finishGame(result) {
  game.winner = result.winner;
  game.defeatReason = result.reason;
  game.phase = "ended";
  game.log.unshift({ round: game.round, text: `Battle concluded: ${result.reason}` });
  saveGame();
  render();
  elements.resultTitle.textContent = game.mode === "tutorial" && result.winner === PLAYERS.HUMAN
    ? "Tutorial complete in three rounds."
    : result.winner === PLAYERS.HUMAN
      ? "The field is yours."
      : result.winner === "draw"
        ? "Neither army prevails."
        : "Your formation has broken.";
  elements.resultReason.textContent = result.reason;
  elements.resultDialog.showModal();
}

function lockOrders() {
  if (game.phase !== "orders") return;
  const error = validateOrders(game, PLAYERS.HUMAN, currentHumanOrders());
  if (error) {
    announce(error);
    return;
  }
  const humanOrders = structuredClone(currentHumanOrders());
  const tutorialRound = game.mode === "tutorial" ? game.round : null;
  const computerOrders = game.mode === "tutorial" ? tutorialEnemyOrders(game) : chooseComputerOrders(game);
  const aiError = validateOrders(game, PLAYERS.COMPUTER, computerOrders);
  if (aiError) {
    announce(`The opposing general could not form legal orders: ${aiError}`);
    return;
  }
  game.phase = "resolving";
  transientStatus = "Both generals have committed. Resolving simultaneous movement…";
  render();
  window.setTimeout(() => {
    game = resolveRound(game, humanOrders, computerOrders).game;
    const result = evaluateVictory(game);
    transientStatus = result ? result.reason : "Control recalculated. Prepare the next three orders.";
    if (result) finishGame(
      tutorialRound
        ? { ...result, reason: `${TUTORIAL_ROUND_COPY[tutorialRound].result} ${result.reason}` }
        : result,
    );
    else {
      if (tutorialRound) {
        game.tutorial = { hintVisible: false };
        transientStatus = TUTORIAL_ROUND_COPY[game.round]?.coach ?? transientStatus;
        showTutorialFeedback(`Round ${tutorialRound} complete`, TUTORIAL_ROUND_COPY[tutorialRound].result);
      }
      saveGame();
      render();
    }
  }, 450);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  startGame(new FormData(elements.form).get("scenario"));
});
elements.continueButton.addEventListener("click", loadGame);
elements.tutorialButton.addEventListener("click", () => openTutorial(0));
elements.battleTutorialButton.addEventListener("click", () => openTutorial(0));
elements.tutorialBackButton.addEventListener("click", () => {
  tutorialStep = Math.max(0, tutorialStep - 1);
  renderTutorialLesson();
});
elements.tutorialNextButton.addEventListener("click", () => {
  const lesson = TUTORIAL_LESSONS[tutorialStep];
  if (lesson.startsBattle) {
    if (game && game.mode !== "tutorial" && !window.confirm("Starting the tutorial will replace the current saved battle. Continue?")) return;
    elements.tutorialDialog.close();
    startTutorialBattle();
    return;
  }
  tutorialStep = Math.min(TUTORIAL_LESSONS.length - 1, tutorialStep + 1);
  renderTutorialLesson();
});
elements.tutorialCloseButton.addEventListener("click", () => elements.tutorialDialog.close());
elements.tutorialHintButton.addEventListener("click", () => {
  game.tutorial.hintVisible = !game.tutorial.hintVisible;
  transientStatus = game.tutorial.hintVisible ? tutorialHintText() : TUTORIAL_ROUND_COPY[game.round].coach;
  render();
});
elements.tutorialRestartButton.addEventListener("click", () => {
  if (!window.confirm("Restart the guided battle from Round 1?")) return;
  startTutorialBattle();
});
elements.lockButton.addEventListener("click", lockOrders);
elements.clearButton.addEventListener("click", () => {
  game.orders.human = [];
  game.selectedUnitId = null;
  pendingMove = null;
  transientStatus = "Orders cleared.";
  saveGame();
  render();
});
elements.controlToggle.addEventListener("click", () => {
  showControl = !showControl;
  render();
});
elements.rulesButton.addEventListener("click", () => elements.rulesDialog.showModal());
elements.welcomeRulesButton.addEventListener("click", () => elements.rulesDialog.showModal());
elements.unitsButton.addEventListener("click", () => elements.unitsDialog.showModal());
elements.welcomeUnitsButton.addEventListener("click", () => elements.unitsDialog.showModal());
elements.newBattle.addEventListener("click", () => {
  if (!window.confirm("Abandon this battle and return to field selection?")) return;
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(LEGACY_SAVE_KEY);
  game = null;
  pendingMove = null;
  document.body.dataset.screen = "welcome";
  elements.game.hidden = true;
  elements.welcome.hidden = false;
  elements.continueButton.hidden = true;
  window.scrollTo({ top: 0, behavior: "instant" });
});

renderUnitGuide();
elements.continueButton.hidden = !(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY));
