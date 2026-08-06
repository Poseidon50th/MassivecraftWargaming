import { getScenario } from "../data/scenarios.js";
import { DIRECTIONS, FACING_DIRECTIONS, PLAYERS, TERRAIN, UNIT_DEFS, facingsForUnit } from "../engine/constants.js";
import { computeControl, controlOwner } from "../engine/control.js";
import {
  activeUnits,
  getUnit,
  isDeploymentSquare,
  unitAt,
} from "../engine/model.js";
import {
  legalMovesForUnit,
  requiredOrderCount,
  rotationOrder,
} from "../engine/movement.js";
import { isStartingRow, PLACEABLE_TERRAIN, terrainSummary } from "../engine/terrain.js";
import { createBattleController } from "./battle-controller.js";
import { createDeploymentController } from "./deployment-controller.js";
import { createPersistenceController } from "./persistence-controller.js";
import { createTutorialController } from "./tutorial-controller.js";
import { difficultyDisplay } from "../ai/difficulties.js";
import { armyValidationError, defaultArmyForSize } from "../data/armies.js";
import { createArmyBuilder } from "../ui/army-builder.js";
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
  beginDeploymentButton: $("#begin-deployment-button"),
  difficultyRequiredNote: $("#difficulty-required-note"),
  difficultyName: $("#difficulty-name"),
  armyBuilder: $("#single-player-army-builder"),
  codexWarningDialog: $("#codex-warning-dialog"),
  codexAcceptButton: $("#codex-accept-button"),
  codexCancelButton: $("#codex-cancel-button"),
  continueButton: $("#continue-button"),
  board: $("#game-board"),
  status: $("#status-banner"),
  scenarioName: $("#scenario-name"),
  phaseHeading: $("#phase-heading"),
  round: $("#round-number"),
  deploymentPanel: $("#deployment-panel"),
  terrainPanel: $("#terrain-panel"),
  terrainPalette: $("#terrain-palette"),
  finishTerrainButton: $("#finish-terrain-button"),
  clearTerrainButton: $("#clear-terrain-button"),
  terrainReadout: $("#terrain-readout"),
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
  tutorialProgress: $("#tutorial-progress"),
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
let selectedTerrainType = "wall";
let persistenceController = null;
let tutorialController = null;
let battleController = null;
let deploymentController = null;
let confirmedCodex = false;
let selectedArmy = defaultArmyForSize(8);
let selectedArmyError = null;
let armyBuilder = null;

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
      special.textContent = ["spear", "axe", "musket"].includes(type)
        ? "Eight-direction facing: the diagram faces north, but this unit may also face northeast, southeast, southwest, or northwest. Its entire control pattern turns with it."
        : "Directional: the north arrow in the diagram marks the unit’s facing. A moved unit may choose any cardinal final facing.";
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

function openTutorial(step = 0) {
  tutorialController.open(step);
}

function startTutorialBattle() {
  tutorialController.startBattle();
}

function tutorialExpectedOrders() {
  return tutorialController.expectedOrders();
}

function tutorialHintText() {
  return tutorialController.hintText();
}

function saveGame() {
  persistenceController.save();
}

function loadGame() {
  const result = persistenceController.load();
  if (result.ok) {
    pendingMove = null;
    openGame();
  } else {
    transientStatus = `The saved battle could not be opened: ${result.error}`;
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

function startGame(scenarioId, terrainMode = "random", difficulty = "captain", army = selectedArmy) {
  deploymentController.startGame(scenarioId, terrainMode, difficulty, army);
}

function selectedDifficultyInput() {
  return elements.form.querySelector('input[name="difficulty"]:checked');
}

function updateDifficultySelection() {
  const selected = selectedDifficultyInput();
  const scenarioId = elements.form.querySelector('input[name="scenario"]:checked')?.value ?? "skirmish";
  const size = getScenario(scenarioId).size;
  selectedArmyError = armyValidationError(selectedArmy, size);
  const ready = Boolean(selected && (selected.value !== "codex" || confirmedCodex) && !selectedArmyError);
  elements.beginDeploymentButton.disabled = !ready;
  elements.difficultyRequiredNote.classList.toggle("ready", ready);
  elements.difficultyRequiredNote.textContent = selectedArmyError
    ? selectedArmyError
    : ready
      ? `${difficultyDisplay(selected.value)} selected. Your army is ready.`
      : "Choose an opposing commander to unlock deployment.";
}

function cancelCodexSelection() {
  confirmedCodex = false;
  const codex = elements.form.querySelector('input[name="difficulty"][value="codex"]');
  if (codex) codex.checked = false;
  if (elements.codexWarningDialog.open) elements.codexWarningDialog.close("cancelled");
  updateDifficultySelection();
}

function renderTerrainPalette() {
  elements.terrainPalette.replaceChildren();
  for (const type of ["plain", ...PLACEABLE_TERRAIN]) {
    const definition = TERRAIN[type];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `terrain-button${selectedTerrainType === type ? " selected" : ""}`;
    const icon = definition.asset
      ? `<img src="${definition.asset}" alt="" />`
      : `<span aria-hidden="true">×</span>`;
    button.innerHTML = `${icon}<strong>${type === "plain" ? "Plain / Erase" : definition.name}</strong>`;
    button.title = terrainSummary(type);
    button.addEventListener("click", () => {
      selectedTerrainType = type;
      renderTerrainPalette();
    });
    elements.terrainPalette.append(button);
  }
}

function paintTerrain(x, y) {
  deploymentController.paintTerrain(x, y);
}

function finishTerrainPlacement() {
  deploymentController.finishTerrainPlacement();
}

function reserveGroups() {
  return deploymentController.reserveGroups();
}

function placeHumanUnit(x, y) {
  deploymentController.placeHumanUnit(x, y);
}

function selectedUnit() {
  return battleController.selectedUnit();
}

function currentHumanOrders() {
  return battleController.currentHumanOrders();
}

function setOrder(order) {
  battleController.setOrder(order);
}

function handleBoardClick(x, y) {
  if (!game || game.winner || game.phase === "resolving") return;
  if (game.phase === "terrain") {
    paintTerrain(x, y);
    return;
  }
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
  const availableFacings = facingsForUnit(unit);
  const pad = document.createElement("span");
  pad.className = `board-facing-pad${availableFacings.length === 8 ? " eight-directions" : ""}${move ? " move-facing-pad" : ""}`;
  pad.setAttribute("aria-label", move ? "Choose final facing and confirm move" : "Rotate this unit in place");
  for (const facing of availableFacings) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `board-facing-choice ${facing}`;
    button.dataset.facing = facing;
    button.textContent = FACING_DIRECTIONS[facing].glyph;
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

function showTerrainReadout(type, coordinate) {
  const definition = TERRAIN[type] ?? TERRAIN.plain;
  elements.terrainReadout.innerHTML = `<strong>${definition.name}${coordinate ? ` · ${coordinate}` : ""}</strong><span>${definition.rule}</span>`;
}

function makeTerrainLayer(type) {
  const definition = TERRAIN[type] ?? TERRAIN.plain;
  if (!definition.asset) return null;
  const layer = document.createElement("span");
  layer.className = "terrain-layer";
  layer.dataset.terrain = type;
  if (definition.underlay) layer.innerHTML = `<img src="${definition.underlay}" alt="" /><img src="${definition.asset}" alt="" />`;
  else layer.innerHTML = `<img src="${definition.asset}" alt="" />`;
  return layer;
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
      const terrainType = game.terrain[y][x] ?? "plain";
      const terrainDefinition = TERRAIN[terrainType] ?? TERRAIN.plain;
      square.dataset.terrain = terrainType;
      square.title = `${boardCoordinate(x, y)} — ${terrainSummary(terrainType)}`;
      if (game.phase === "terrain") {
        square.classList.add(isStartingRow(game, y) ? "terrain-starting-row" : "terrain-editable");
      }
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

      const terrainLayer = makeTerrainLayer(terrainType);
      if (terrainLayer) square.append(terrainLayer);
      if (terrainType !== "plain") {
        const terrainName = document.createElement("span");
        terrainName.className = "terrain-name";
        terrainName.textContent = terrainDefinition.name;
        square.append(terrainName);
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
        token.innerHTML = `<span class="facing" aria-hidden="true">${FACING_DIRECTIONS[unit.facing].glyph}</span><img src="${UNIT_ASSETS[unit.type]}" alt="" draggable="false" />`;
        if (unit.id === selected?.id && !pendingMove) token.append(makeFacingPad(unit));
        square.append(token);
        square.setAttribute(
          "aria-label",
          `${String.fromCharCode(65 + x)}${game.size - y}, ${unit.player === PLAYERS.HUMAN ? "your" : "enemy"} ${UNIT_DEFS[unit.type].name}, facing ${unit.facing}, standing on ${terrainDefinition.name}. ${terrainDefinition.rule} Control ${status.human} to ${status.computer}.`,
        );
      } else {
        square.setAttribute("aria-label", `${String.fromCharCode(65 + x)}${game.size - y}, empty ${terrainDefinition.name}. ${terrainDefinition.rule} Control ${status.human} to ${status.computer}.`);
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
      square.addEventListener("pointerenter", () => showTerrainReadout(terrainType, boardCoordinate(x, y)));
      square.addEventListener("focus", () => showTerrainReadout(terrainType, boardCoordinate(x, y)));
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
    const facingCount = facingsForUnit(unit).length;
    elements.selectedDetail.textContent = pendingMove
      ? `Destination ${boardCoordinate(pendingMove.to.x, pendingMove.to.y)} selected. Click one of the ${facingCount} arrows around the preview piece to choose its final facing and confirm.`
      : `${UNIT_DEFS[unit.type].description} Currently facing ${unit.facing}.`;
  }
}

function renderTutorialPanel() {
  const active = game?.mode === "tutorial" && !game.winner;
  elements.tutorialPanel.hidden = !active;
  if (!active) return;
  elements.tutorialRoundTitle.textContent = game.round <= 2
    ? `Round ${game.round} · ${game.round === 1 ? "The close line" : "Speed, range, and rotation"}`
    : `Round ${game.round} · Adapt the formation`;
  elements.tutorialCoachText.textContent = game.tutorial?.hintVisible
    ? tutorialHintText()
    : tutorialController.coachText();
  const contributors = new Set(game.tutorial?.contributors ?? []);
  elements.tutorialProgress.replaceChildren();
  for (const unit of game.units.filter((candidate) => candidate.player === PLAYERS.HUMAN)) {
    const badge = document.createElement("span");
    badge.className = `tutorial-badge${contributors.has(unit.id) ? " complete" : ""}`;
    badge.textContent = `${contributors.has(unit.id) ? "✓" : "○"} ${UNIT_DEFS[unit.type].name}`;
    elements.tutorialProgress.append(badge);
  }
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
  elements.difficultyName.textContent = game.mode === "tutorial"
    ? "Guided tutorial opponent"
    : `Opponent · ${difficultyDisplay(game.aiDifficulty)}`;
  elements.phaseHeading.textContent = game.phase === "terrain" ? "Terrain placement" : game.phase === "deployment" ? "Deployment" : game.phase === "resolving" ? "Orders revealed" : game.winner ? "Battle concluded" : "Orders phase";
  elements.round.textContent = game.round || "—";
  elements.terrainPanel.hidden = game.phase !== "terrain";
  elements.deploymentPanel.hidden = game.phase !== "deployment";
  elements.ordersPanel.hidden = game.phase === "deployment" || game.phase === "terrain";
  elements.humanStrength.textContent = activeUnits(game, PLAYERS.HUMAN).length;
  elements.computerStrength.textContent = activeUnits(game, PLAYERS.COMPUTER).length;
  elements.controlToggle.setAttribute("aria-pressed", String(showControl));
  elements.controlToggle.textContent = showControl ? "Control shading visible" : "Control shading hidden";
  if (game.phase === "terrain") renderTerrainPalette();
  else if (game.phase === "deployment") renderReserve();
  else renderOrders();
  renderBoard();
  renderLog();
  renderTutorialPanel();
  elements.status.textContent = transientStatus || (game.phase === "orders" ? "Prepare your secret orders." : "Place your army.");
}

function lockOrders() {
  battleController.lockOrders();
}

function displayResult(result) {
  elements.resultTitle.textContent = game.mode === "tutorial" && result.winner === PLAYERS.HUMAN
    ? ((game.tutorial?.contributors ?? []).length === 6
      ? `Tutorial complete in ${game.round - 1} round${game.round - 1 === 1 ? "" : "s"}.`
      : "Battle won — some unit objectives remain incomplete.")
    : result.winner === PLAYERS.HUMAN
      ? "The field is yours."
      : result.winner === "draw"
        ? "Neither army prevails."
        : "Your formation has broken.";
  elements.resultReason.textContent = result.reason;
  elements.resultDialog.showModal();
}

function returnToWelcome() {
  document.body.dataset.screen = "welcome";
  elements.game.hidden = true;
  elements.welcome.hidden = false;
  elements.form.querySelectorAll('input[name="difficulty"]').forEach((input) => { input.checked = false; });
  confirmedCodex = false;
  updateDifficultySelection();
  window.scrollTo({ top: 0, behavior: "instant" });
}

persistenceController = createPersistenceController({
  getGame: () => game,
  setGame: (value) => { game = value; },
  onAvailabilityChange: (available) => { elements.continueButton.hidden = !available; },
});

tutorialController = createTutorialController({
  elements,
  getGame: () => game,
  setGame: (value) => { game = value; },
  getTutorialStep: () => tutorialStep,
  setTutorialStep: (value) => { tutorialStep = value; },
  setPendingMove: (value) => { pendingMove = value; },
  setStatus: (value) => { transientStatus = value; },
  save: () => persistenceController.save(),
  openGame,
  render,
  cancelDelayedWork: () => battleController?.cancelDelayedWork(),
  showFeedback: showTutorialFeedback,
  makeUnitVisual,
  unitAssets: UNIT_ASSETS,
});

battleController = createBattleController({
  getGame: () => game,
  setGame: (value) => { game = value; },
  setPendingMove: (value) => { pendingMove = value; },
  setStatus: (value) => { transientStatus = value; },
  save: () => persistenceController.save(),
  clearSave: () => persistenceController.clear(),
  render,
  showFeedback: showTutorialFeedback,
  tutorial: tutorialController,
  resultView: displayResult,
  returnToWelcome,
  announce,
});

deploymentController = createDeploymentController({
  getGame: () => game,
  setGame: (value) => { game = value; },
  getSelectedReserveType: () => selectedReserveType,
  setSelectedReserveType: (value) => { selectedReserveType = value; },
  getSelectedTerrainType: () => selectedTerrainType,
  setSelectedTerrainType: (value) => { selectedTerrainType = value; },
  setPendingMove: (value) => { pendingMove = value; },
  setStatus: (value) => { transientStatus = value; },
  save: () => persistenceController.save(),
  openGame,
  render,
  renderBoard,
  renderTerrainPalette,
  announce,
  cancelDelayedWork: () => battleController.cancelDelayedWork(),
  checkOpeningVictory: () => battleController.checkOpeningVictory(),
  boardCoordinate,
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(elements.form);
  const difficulty = data.get("difficulty");
  if (!difficulty || (difficulty === "codex" && !confirmedCodex)) {
    updateDifficultySelection();
    return;
  }
  const scenario = getScenario(data.get("scenario"));
  const armyError = armyValidationError(selectedArmy, scenario.size);
  if (armyError) {
    selectedArmyError = armyError;
    updateDifficultySelection();
    return;
  }
  startGame(data.get("scenario"), data.get("terrainMode"), difficulty, selectedArmy);
});
elements.form.querySelectorAll('input[name="scenario"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    armyBuilder.setSize(getScenario(input.value).size);
  });
});
elements.form.querySelectorAll('input[name="difficulty"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.value === "codex" && input.checked) {
      confirmedCodex = false;
      updateDifficultySelection();
      elements.codexWarningDialog.showModal();
      return;
    }
    confirmedCodex = false;
    updateDifficultySelection();
  });
});
elements.codexAcceptButton.addEventListener("click", () => {
  confirmedCodex = true;
  elements.codexWarningDialog.close("accepted");
  updateDifficultySelection();
});
elements.codexCancelButton.addEventListener("click", cancelCodexSelection);
elements.codexWarningDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelCodexSelection();
});
elements.finishTerrainButton.addEventListener("click", finishTerrainPlacement);
elements.clearTerrainButton.addEventListener("click", () => deploymentController.clearTerrainPlacement());
elements.continueButton.addEventListener("click", loadGame);
elements.tutorialButton.addEventListener("click", () => openTutorial(0));
elements.battleTutorialButton.addEventListener("click", () => openTutorial(0));
elements.tutorialBackButton.addEventListener("click", () => tutorialController.back());
elements.tutorialNextButton.addEventListener("click", () => tutorialController.next());
elements.tutorialCloseButton.addEventListener("click", () => elements.tutorialDialog.close());
elements.tutorialHintButton.addEventListener("click", () => tutorialController.toggleHint());
elements.tutorialRestartButton.addEventListener("click", () => {
  if (!window.confirm("Restart the guided battle from Round 1?")) return;
  startTutorialBattle();
});
elements.lockButton.addEventListener("click", lockOrders);
elements.clearButton.addEventListener("click", () => battleController.clearOrders());
elements.controlToggle.addEventListener("click", () => {
  showControl = !showControl;
  render();
});
elements.rulesButton.addEventListener("click", () => elements.rulesDialog.showModal());
elements.welcomeRulesButton.addEventListener("click", () => elements.rulesDialog.showModal());
elements.unitsButton.addEventListener("click", () => elements.unitsDialog.showModal());
elements.welcomeUnitsButton.addEventListener("click", () => elements.unitsDialog.showModal());
elements.newBattle.addEventListener("click", () => battleController.abandonBattle());

armyBuilder = createArmyBuilder(elements.armyBuilder, {
  size: 8,
  army: selectedArmy,
  onChange: (army, state) => {
    selectedArmy = army;
    selectedArmyError = state.error;
    updateDifficultySelection();
  },
});
renderUnitGuide();
updateDifficultySelection();
