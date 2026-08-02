import { chooseComputerOrders, deployComputerUnit } from "./ai/computer.js";
import { getScenario } from "./data/scenarios.js";
import { DIRECTIONS, PLAYERS, UNIT_DEFS } from "./engine/constants.js";
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
  newBattle: $("#new-battle-button"),
  resultDialog: $("#result-dialog"),
  resultTitle: $("#result-title"),
  resultReason: $("#result-reason"),
};

let game = null;
let selectedReserveType = "sword";
let showControl = true;
let transientStatus = "";

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
  transientStatus = `${orders.length} of ${requiredOrderCount(game, PLAYERS.HUMAN)} orders prepared.`;
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
      setOrder(move);
      return;
    }
  }
  const unit = unitAt(game, x, y);
  if (unit?.player === PLAYERS.HUMAN) {
    game.selectedUnitId = unit.id;
    transientStatus = `${UNIT_DEFS[unit.type].name} selected. Choose a highlighted destination or rotate in place.`;
    render();
  } else {
    game.selectedUnitId = null;
    render();
  }
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
      const square = document.createElement("button");
      square.type = "button";
      square.className = "square";
      square.setAttribute("role", "gridcell");
      const owner = controlOwner(control[y][x]);
      square.classList.add(`control-${owner}`);
      if (game.phase === "deployment" && isDeploymentSquare(game, PLAYERS.HUMAN, y) && !unitAt(game, x, y)) {
        square.classList.add("deployment-valid");
      }
      if (legalKeys.has(`${x},${y}`)) square.classList.add("legal-move");
      const unit = unitAt(game, x, y);
      if (unit?.id === game.selectedUnitId) square.classList.add("selected");
      if (unit && orderedIds.has(unit.id)) square.classList.add("ordered");

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
        square.append(token);
        square.setAttribute(
          "aria-label",
          `${String.fromCharCode(65 + x)}${game.size - y}, ${unit.player === PLAYERS.HUMAN ? "your" : "enemy"} ${UNIT_DEFS[unit.type].name}, facing ${unit.facing}. Control ${status.human} to ${status.computer}.`,
        );
      } else {
        square.setAttribute("aria-label", `${String.fromCharCode(65 + x)}${game.size - y}, empty ${game.terrain[y][x]}. Control ${status.human} to ${status.computer}.`);
      }
      square.append(controlScore);
      square.addEventListener("click", () => handleBoardClick(x, y));
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
    elements.selectedDetail.textContent = `${UNIT_DEFS[unit.type].description} Facing ${unit.facing}.`;
    document.querySelectorAll(".facing-choice").forEach((button) => {
      button.classList.toggle("current", button.dataset.facing === unit.facing);
    });
  }
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
  elements.status.textContent = transientStatus || (game.phase === "orders" ? "Prepare your secret orders." : "Place your army.");
}

function finishGame(result) {
  game.winner = result.winner;
  game.defeatReason = result.reason;
  game.phase = "ended";
  game.log.unshift({ round: game.round, text: `Battle concluded: ${result.reason}` });
  saveGame();
  render();
  elements.resultTitle.textContent = result.winner === PLAYERS.HUMAN ? "The field is yours." : result.winner === "draw" ? "Neither army prevails." : "Your formation has broken.";
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
  const computerOrders = chooseComputerOrders(game);
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
    if (result) finishGame(result);
    else {
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
document.querySelectorAll(".facing-choice").forEach((button) => {
  button.addEventListener("click", () => {
    const unit = selectedUnit();
    if (!unit) return;
    setOrder(rotationOrder(unit, button.dataset.facing));
  });
});
elements.lockButton.addEventListener("click", lockOrders);
elements.clearButton.addEventListener("click", () => {
  game.orders.human = [];
  game.selectedUnitId = null;
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
  document.body.dataset.screen = "welcome";
  elements.game.hidden = true;
  elements.welcome.hidden = false;
  elements.continueButton.hidden = true;
  window.scrollTo({ top: 0, behavior: "instant" });
});

elements.continueButton.hidden = !(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY));
