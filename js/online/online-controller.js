import { MultiplayerApi } from "./api-client.js?v=0.7.2";
import { multiplayerServerUrl } from "./config.js";
import {
  canonicalWinnerForSeat,
  gameForSeat,
  orderToCanonical,
  placementToCanonical,
  proposalForSeat,
  reportForSeat,
} from "./perspective.js";
import { getScenario } from "../data/scenarios.js";
import { FACING_DIRECTIONS, PLAYERS, TERRAIN, UNIT_DEFS, facingsForUnit } from "../engine/constants.js";
import { activeUnits, createGame, getUnit, isDeploymentSquare, unitAt } from "../engine/model.js";
import { legalMovesForUnit, requiredOrderCount, rotationOrder, validateOrders } from "../engine/movement.js";
import { clearTerrain, isStartingRow, PLACEABLE_TERRAIN, setTerrain, terrainSummary } from "../engine/terrain.js";
import { computeControl, controlOwner } from "../engine/control.js";

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
  serverWarning: $("#server-warning"),
  entry: $("#entry-screen"),
  createForm: $("#create-room-form"),
  joinForm: $("#join-room-form"),
  joinRoomCode: $("#join-room-code"),
  room: $("#room-screen"),
  roomCode: $("#room-code"),
  roomTitle: $("#room-title"),
  connectionBadge: $("#connection-badge"),
  battleConnectionBadge: $("#battle-connection-badge"),
  youName: $("#you-name"),
  opponentName: $("#opponent-name"),
  youConnection: $("#you-connection"),
  opponentConnection: $("#opponent-connection"),
  invitePanel: $("#invite-panel"),
  inviteLink: $("#invite-link"),
  copyInvite: $("#copy-invite-button"),
  fieldForm: $("#field-form"),
  proposalStatus: $("#proposal-status"),
  proposalTitle: $("#proposal-title"),
  proposalCopy: $("#proposal-copy"),
  proposalActions: $("#proposal-actions"),
  approveField: $("#approve-field-button"),
  declineField: $("#decline-field-button"),
  fieldPreview: $("#field-preview"),
  previewBoard: $("#preview-board"),
  previewReadout: $("#preview-terrain-readout"),
  terrainEditor: $("#terrain-editor"),
  terrainBoard: $("#terrain-board"),
  terrainPalette: $("#online-terrain-palette"),
  editorReadout: $("#editor-terrain-readout"),
  cancelTerrain: $("#cancel-terrain-button"),
  submitManualField: $("#submit-manual-field-button"),
  clearTerrain: $("#clear-online-terrain-button"),
  battle: $("#battle-screen"),
  scenarioName: $("#online-scenario-name"),
  opponentBattleName: $("#online-opponent-name"),
  phaseHeading: $("#online-phase-heading"),
  round: $("#online-round-number"),
  status: $("#online-status-banner"),
  board: $("#online-game-board"),
  controlToggle: $("#online-control-toggle"),
  resign: $("#resign-button"),
  terrainReadout: $("#online-terrain-readout"),
  deploymentPanel: $("#online-deployment-panel"),
  deploymentTitle: $("#deployment-turn-title"),
  deploymentNote: $("#deployment-note"),
  reserveList: $("#online-reserve-list"),
  ordersPanel: $("#online-orders-panel"),
  orderCount: $("#online-order-count"),
  selectionHelp: $("#online-selection-help"),
  selectedCard: $("#online-selected-unit-card"),
  selectedName: $("#online-selected-unit-name"),
  selectedDetail: $("#online-selected-unit-detail"),
  ordersList: $("#online-orders-list"),
  submitOrders: $("#submit-orders-button"),
  clearOrders: $("#clear-online-orders-button"),
  withdrawOrders: $("#withdraw-orders-button"),
  youReady: $("#you-ready"),
  opponentReadyName: $("#opponent-ready-name"),
  opponentReady: $("#opponent-ready"),
  humanStrength: $("#online-human-strength"),
  computerStrength: $("#online-computer-strength"),
  battleLog: $("#online-battle-log"),
  reconnectButtons: [...document.querySelectorAll("[data-reconnect]")],
  messageDialog: $("#online-message-dialog"),
  messageTitle: $("#online-message-title"),
  messageCopy: $("#online-message-copy"),
};

let api = null;
let credentials = null;
let roomState = null;
let connectionStatus = "connecting";
let busy = false;
let manualEditorGame = null;
let selectedTerrainType = "wall";
let selectedReserveType = "sword";
let selectedUnitId = null;
let pendingMove = null;
let draftOrders = [];
let draftRound = null;
let showControl = true;
let shownResultKey = null;

function roomStorageKey(roomId, seat) {
  return `massivecraft-wars-online:${roomId}:${seat}`;
}

function draftStorageKey() {
  return credentials ? `${roomStorageKey(credentials.roomId, credentials.seat)}:draft` : null;
}

function credentialsFromLocation() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const roomId = query.get("room")?.toUpperCase();
  const seat = query.get("seat");
  if (!roomId || !["host", "guest"].includes(seat)) return null;
  const stored = localStorage.getItem(roomStorageKey(roomId, seat));
  let value = null;
  try { value = stored ? JSON.parse(stored) : null; } catch { /* ignore corrupt local credentials */ }
  const token = hash.get("token") || value?.token;
  if (!token) return null;
  return { roomId, seat, token, guestToken: value?.guestToken ?? null };
}

function saveCredentials(value) {
  credentials = { ...value };
  localStorage.setItem(roomStorageKey(value.roomId, value.seat), JSON.stringify(credentials));
  const url = new URL(location.href);
  const localServer = url.searchParams.get("server");
  url.search = "";
  url.searchParams.set("room", value.roomId);
  url.searchParams.set("seat", value.seat);
  if (localServer) url.searchParams.set("server", localServer);
  url.hash = `token=${encodeURIComponent(value.token)}`;
  history.replaceState(null, "", url);
}

function saveDraft() {
  const key = draftStorageKey();
  if (!key || draftRound === null) return;
  localStorage.setItem(key, JSON.stringify({ round: draftRound, orders: draftOrders }));
}

function loadDraft(round) {
  const key = draftStorageKey();
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value?.round === round && Array.isArray(value.orders) ? value.orders : [];
  } catch {
    return [];
  }
}

function clearDraftStorage() {
  const key = draftStorageKey();
  if (key) localStorage.removeItem(key);
}

function message(title, copy) {
  elements.messageTitle.textContent = title;
  elements.messageCopy.textContent = copy;
  if (!elements.messageDialog.open) elements.messageDialog.showModal();
}

function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
}

function setConnection(status) {
  connectionStatus = status;
  const copy = status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting…" : status === "error" ? "Connection problem" : "Connecting…";
  for (const badge of [elements.connectionBadge, elements.battleConnectionBadge]) {
    badge.dataset.status = status;
    badge.textContent = copy;
  }
  for (const button of elements.reconnectButtons) button.hidden = status === "connected" || status === "connecting";
}

function inviteUrl() {
  if (!credentials?.guestToken) return "";
  const url = new URL("multiplayer.html", location.href);
  const localServer = new URLSearchParams(location.search).get("server");
  url.search = "";
  url.searchParams.set("room", credentials.roomId);
  url.searchParams.set("seat", "guest");
  if (localServer) url.searchParams.set("server", localServer);
  url.hash = `token=${encodeURIComponent(credentials.guestToken)}`;
  return url.toString();
}

function boardCoordinate(x, y, size) {
  return `${String.fromCharCode(65 + x)}${size - y}`;
}

function terrainLayer(type) {
  const definition = TERRAIN[type] ?? TERRAIN.plain;
  if (!definition.asset) return null;
  const layer = document.createElement("span");
  layer.className = "terrain-layer";
  layer.dataset.terrain = type;
  layer.innerHTML = definition.underlay
    ? `<img src="${definition.underlay}" alt="" /><img src="${definition.asset}" alt="" />`
    : `<img src="${definition.asset}" alt="" />`;
  return layer;
}

function showTerrainReadout(element, type, coordinate = "") {
  const definition = TERRAIN[type] ?? TERRAIN.plain;
  element.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = `${definition.name}${coordinate ? ` · ${coordinate}` : ""}`;
  const span = document.createElement("span");
  span.textContent = definition.rule;
  element.append(strong, span);
}

function renderTerrainBoard({ container, terrain, size, deploymentRows, readout, editable = false, onClick = null }) {
  container.replaceChildren();
  container.style.setProperty("--board-size", size);
  container.dataset.size = String(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const type = terrain[y][x] ?? "plain";
      const square = document.createElement("div");
      square.className = "square";
      square.tabIndex = 0;
      square.setAttribute("role", "gridcell");
      square.title = `${boardCoordinate(x, y, size)} — ${terrainSummary(type)}`;
      if (editable) square.classList.add(isStartingRow({ size, deploymentRows }, y) ? "terrain-starting-row" : "terrain-editable");
      const layer = terrainLayer(type);
      if (layer) square.append(layer);
      if (type !== "plain") {
        const terrainName = document.createElement("span");
        terrainName.className = "terrain-name";
        terrainName.textContent = TERRAIN[type].name;
        square.append(terrainName);
      }
      const coordinate = document.createElement("span");
      coordinate.className = "coordinate";
      coordinate.textContent = boardCoordinate(x, y, size);
      square.append(coordinate);
      const inspect = () => showTerrainReadout(readout, type, boardCoordinate(x, y, size));
      square.addEventListener("pointerenter", inspect);
      square.addEventListener("focus", inspect);
      if (editable && onClick) {
        square.addEventListener("click", () => onClick(x, y));
        square.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          onClick(x, y);
        });
      }
      container.append(square);
    }
  }
}

function renderTerrainPalette() {
  elements.terrainPalette.replaceChildren();
  for (const type of ["plain", ...PLACEABLE_TERRAIN]) {
    const definition = TERRAIN[type];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `terrain-button${selectedTerrainType === type ? " selected" : ""}`;
    const icon = definition.asset ? `<img src="${definition.asset}" alt="" />` : `<span aria-hidden="true">×</span>`;
    button.innerHTML = `${icon}<strong>${type === "plain" ? "Plain / Erase" : definition.name}</strong>`;
    button.title = terrainSummary(type);
    button.addEventListener("click", () => {
      selectedTerrainType = type;
      renderTerrainPalette();
    });
    elements.terrainPalette.append(button);
  }
}

function openManualEditor(scenarioId) {
  manualEditorGame = createGame(getScenario(scenarioId));
  manualEditorGame.phase = "terrain";
  selectedTerrainType = "wall";
  render();
}

function paintManualTerrain(x, y) {
  if (!manualEditorGame || isStartingRow(manualEditorGame, y)) return;
  setTerrain(manualEditorGame, x, y, selectedTerrainType);
  renderManualEditor();
  const paintedType = manualEditorGame.terrain[y][x] ?? "plain";
  showTerrainReadout(elements.editorReadout, paintedType, boardCoordinate(x, y, manualEditorGame.size));
}

function renderManualEditor() {
  if (!manualEditorGame) return;
  renderTerrainPalette();
  renderTerrainBoard({
    container: elements.terrainBoard,
    terrain: manualEditorGame.terrain,
    size: manualEditorGame.size,
    deploymentRows: manualEditorGame.deploymentRows,
    readout: elements.editorReadout,
    editable: true,
    onClick: paintManualTerrain,
  });
}

async function runAction(type, payload = {}) {
  if (busy) return null;
  setBusy(true);
  try {
    const result = await api.action(type, payload);
    setRoomState(result.state);
    return result.state;
  } catch (error) {
    message("The order could not be completed", error.message);
    await api.syncOnFocus();
    return null;
  } finally {
    setBusy(false);
  }
}

function setRoomState(next) {
  const previousRound = roomState?.game?.round;
  roomState = next;
  if (next.game?.round !== previousRound || draftRound !== next.game?.round) {
    selectedUnitId = null;
    pendingMove = null;
    draftRound = next.game?.round ?? null;
    draftOrders = next.phase === "orders" && !next.youReady ? loadDraft(draftRound) : [];
  }
  if (next.youReady) {
    draftOrders = [];
    clearDraftStorage();
  }
  render();
}

function renderEntry() {
  const invited = credentials?.seat === "guest" && credentials.roomId;
  elements.createForm.hidden = Boolean(invited);
  elements.joinForm.hidden = !invited;
  if (invited) elements.joinRoomCode.textContent = credentials.roomId;
}

function renderRoom() {
  elements.roomCode.textContent = roomState.roomId;
  elements.youName.textContent = roomState.players.you.name ?? "Joining…";
  elements.opponentName.textContent = roomState.players.opponent.name ?? "Waiting for invitation…";
  elements.youConnection.classList.toggle("connected", roomState.players.you.connected || connectionStatus === "connected");
  elements.opponentConnection.classList.toggle("connected", roomState.players.opponent.connected);
  elements.invitePanel.hidden = roomState.seat !== "host";
  if (roomState.seat === "host") elements.inviteLink.value = inviteUrl();
  const canChoose = roomState.seat === "host" && Boolean(roomState.players.opponent.name) && (!roomState.proposal || roomState.proposal.status === "declined");
  elements.fieldForm.hidden = !canChoose;
  elements.proposalStatus.hidden = !roomState.proposal;
  elements.fieldPreview.hidden = !roomState.proposal;
  elements.proposalActions.hidden = true;

  const proposal = roomState.proposal;
  if (!proposal) {
    elements.roomTitle.textContent = roomState.seat === "host"
      ? (roomState.players.opponent.name ? "Choose the battlefield" : "Waiting for the invited player")
      : "Waiting for the host to choose the battlefield";
    return;
  }
  const viewProposal = proposalForSeat(proposal, roomState.seat);
  elements.proposalTitle.textContent = `${proposal.scenarioName} · ${proposal.terrainMode === "random" ? "Random terrain" : "Host-built terrain"}`;
  if (proposal.status === "pending") {
    elements.roomTitle.textContent = roomState.seat === "host" ? "Waiting for battlefield approval" : "Approve the host’s battlefield";
    elements.proposalCopy.textContent = roomState.seat === "host"
      ? "Your opponent is reviewing this exact battlefield. Deployment begins only after approval."
      : "Review the complete field below. Approve it to begin alternating deployment, or ask the host to choose again.";
    elements.proposalActions.hidden = roomState.seat !== "guest";
  } else if (proposal.status === "declined") {
    elements.roomTitle.textContent = roomState.seat === "host" ? "Choose a different battlefield" : "Waiting for a new proposal";
    elements.proposalCopy.textContent = `Requested change: ${proposal.declineReason}`;
  }
  renderTerrainBoard({
    container: elements.previewBoard,
    terrain: viewProposal.terrain,
    size: viewProposal.size,
    deploymentRows: getScenario(viewProposal.scenarioId).deploymentRows,
    readout: elements.previewReadout,
  });
}

function reserveGroups(game) {
  const groups = {};
  for (const unit of game.reserves.human) counts(groups, unit.type);
  return groups;
}

function counts(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function renderReserve(game) {
  const groups = reserveGroups(game);
  if (!groups[selectedReserveType]) selectedReserveType = Object.keys(groups)[0] ?? null;
  elements.reserveList.replaceChildren();
  for (const [type, count] of Object.entries(groups)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `reserve-button${selectedReserveType === type ? " selected" : ""}`;
    button.dataset.unitType = type;
    button.disabled = roomState.deploymentTurn !== "you" || busy;
    button.innerHTML = `<span class="reserve-icon" aria-hidden="true"><img src="${UNIT_ASSETS[type]}" alt="" /></span><strong>${UNIT_DEFS[type].name}</strong><span>×${count}</span>`;
    button.addEventListener("click", () => {
      selectedReserveType = type;
      renderReserve(game);
    });
    elements.reserveList.append(button);
  }
}

function selectedUnit(game) {
  return selectedUnitId ? getUnit(game, selectedUnitId) : null;
}

function setDraftOrder(game, order) {
  const required = requiredOrderCount(game, PLAYERS.HUMAN);
  const existing = draftOrders.findIndex((candidate) => candidate.unitId === order.unitId);
  if (existing < 0 && draftOrders.length >= required) {
    message("All order slots are filled", "Remove or replace an existing order before choosing another unit.");
    return;
  }
  if (order.kind === "move" && draftOrders.some((candidate) => candidate.unitId !== order.unitId && candidate.kind === "move" && candidate.to.x === order.to.x && candidate.to.y === order.to.y)) {
    message("Choose another destination", "Two allied units cannot be ordered to the same square.");
    return;
  }
  if (existing >= 0) draftOrders.splice(existing, 1, order);
  else draftOrders.push(order);
  selectedUnitId = null;
  pendingMove = null;
  saveDraft();
  renderBattle();
}

function makeFacingPad(game, unit, move = null) {
  const available = facingsForUnit(unit);
  const pad = document.createElement("span");
  pad.className = `board-facing-pad${available.length === 8 ? " eight-directions" : ""}${move ? " move-facing-pad" : ""}`;
  for (const facing of available) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `board-facing-choice ${facing}`;
    button.textContent = FACING_DIRECTIONS[facing].glyph;
    button.title = move ? `Move here facing ${facing}` : `Rotate in place to face ${facing}`;
    if (!move && facing === unit.facing) button.disabled = true;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setDraftOrder(game, move ? { ...move, facing } : rotationOrder(unit, facing));
    });
    pad.append(button);
  }
  return pad;
}

function handleBattleSquare(game, x, y) {
  if (busy || roomState.phase === "ended") return;
  if (roomState.phase === "deployment") {
    if (roomState.deploymentTurn !== "you" || !isDeploymentSquare(game, PLAYERS.HUMAN, y) || unitAt(game, x, y)) return;
    const reserve = game.reserves.human.find((unit) => unit.type === selectedReserveType);
    if (!reserve) return;
    runAction("place_unit", placementToCanonical({ unitId: reserve.id, x, y }, roomState.seat, game.size));
    return;
  }
  if (roomState.phase !== "orders" || roomState.youReady) return;
  const chosen = selectedUnit(game);
  if (chosen) {
    const move = legalMovesForUnit(game, chosen).find((candidate) => candidate.to.x === x && candidate.to.y === y);
    if (move) {
      pendingMove = move;
      renderBattle();
      return;
    }
  }
  const unit = unitAt(game, x, y);
  if (unit?.player === PLAYERS.HUMAN) {
    selectedUnitId = unit.id;
    pendingMove = null;
  } else {
    selectedUnitId = null;
    pendingMove = null;
  }
  renderBattle();
}

function renderBattleBoard(game) {
  const control = computeControl(game);
  const chosen = selectedUnit(game);
  const moves = chosen && roomState.phase === "orders" && !roomState.youReady ? legalMovesForUnit(game, chosen) : [];
  const moveKeys = new Set(moves.map((move) => `${move.to.x},${move.to.y}`));
  const ordered = new Set(draftOrders.map((order) => order.unitId));
  elements.board.replaceChildren();
  elements.board.style.setProperty("--board-size", game.size);
  elements.board.dataset.size = String(game.size);
  elements.board.classList.toggle("show-control", showControl && roomState.phase !== "deployment");
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const square = document.createElement("div");
      square.className = `square control-${controlOwner(control[y][x])}`;
      square.tabIndex = 0;
      square.setAttribute("role", "gridcell");
      const terrainType = game.terrain[y][x] ?? "plain";
      square.title = `${boardCoordinate(x, y, game.size)} — ${terrainSummary(terrainType)}`;
      if (roomState.phase === "deployment" && roomState.deploymentTurn === "you" && isDeploymentSquare(game, PLAYERS.HUMAN, y) && !unitAt(game, x, y)) square.classList.add("deployment-valid");
      if (moveKeys.has(`${x},${y}`)) square.classList.add("legal-move");
      const unit = unitAt(game, x, y);
      if (unit?.id === selectedUnitId) square.classList.add("selected");
      if (unit && ordered.has(unit.id)) square.classList.add("ordered");
      const layer = terrainLayer(terrainType);
      if (layer) square.append(layer);
      if (terrainType !== "plain") {
        const label = document.createElement("span");
        label.className = "terrain-name";
        label.textContent = TERRAIN[terrainType].name;
        square.append(label);
      }
      const coordinate = document.createElement("span");
      coordinate.className = "coordinate";
      coordinate.textContent = boardCoordinate(x, y, game.size);
      square.append(coordinate);
      const score = document.createElement("span");
      score.className = "control-score";
      score.innerHTML = `<b class="human-score">${control[y][x].human}</b><i>/</i><b class="computer-score">${control[y][x].computer}</b>`;
      if (unit) {
        const token = document.createElement("span");
        token.className = `unit ${unit.player}`;
        token.dataset.unitType = unit.type;
        token.innerHTML = `<span class="facing" aria-hidden="true">${FACING_DIRECTIONS[unit.facing].glyph}</span><img src="${UNIT_ASSETS[unit.type]}" alt="" draggable="false" />`;
        if (unit.id === chosen?.id && !pendingMove && roomState.phase === "orders" && !roomState.youReady) token.append(makeFacingPad(game, unit));
        square.append(token);
      }
      if (pendingMove?.to.x === x && pendingMove?.to.y === y && chosen) {
        const preview = document.createElement("span");
        preview.className = `unit ${chosen.player} move-preview`;
        preview.dataset.unitType = chosen.type;
        preview.innerHTML = `<img src="${UNIT_ASSETS[chosen.type]}" alt="" draggable="false" />`;
        preview.append(makeFacingPad(game, chosen, pendingMove));
        square.append(preview);
        square.classList.add("pending-destination");
      }
      square.append(score);
      const inspect = () => showTerrainReadout(elements.terrainReadout, terrainType, boardCoordinate(x, y, game.size));
      square.addEventListener("pointerenter", inspect);
      square.addEventListener("focus", inspect);
      square.addEventListener("click", () => handleBattleSquare(game, x, y));
      square.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        handleBattleSquare(game, x, y);
      });
      elements.board.append(square);
    }
  }
}

function orderDescription(game, order) {
  const unit = getUnit(game, order.unitId);
  if (!unit) return "Unavailable unit";
  if (order.kind === "rotate") return `${UNIT_DEFS[unit.type].name} rotate ${order.facing}`;
  return `${UNIT_DEFS[unit.type].name} to ${boardCoordinate(order.to.x, order.to.y, game.size)}, facing ${order.facing}`;
}

function renderOrders(game) {
  const required = requiredOrderCount(game, PLAYERS.HUMAN);
  elements.orderCount.textContent = `${draftOrders.length} / ${required}`;
  elements.ordersList.replaceChildren();
  for (const order of draftOrders) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = orderDescription(game, order);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      draftOrders = draftOrders.filter((candidate) => candidate.unitId !== order.unitId);
      saveDraft();
      renderBattle();
    });
    item.append(text, remove);
    elements.ordersList.append(item);
  }
  elements.submitOrders.disabled = roomState.youReady || draftOrders.length !== required || busy;
  elements.clearOrders.hidden = roomState.youReady;
  elements.withdrawOrders.hidden = !roomState.youReady;
  const unit = selectedUnit(game);
  elements.selectedCard.hidden = !unit || roomState.youReady;
  if (unit) {
    elements.selectedName.textContent = UNIT_DEFS[unit.type].name;
    elements.selectedDetail.textContent = pendingMove
      ? `Destination ${boardCoordinate(pendingMove.to.x, pendingMove.to.y, game.size)} selected. Choose a final facing with an arrow around the preview piece.`
      : `${UNIT_DEFS[unit.type].description} Currently facing ${unit.facing}.`;
  }
}

function renderReports(game) {
  elements.battleLog.replaceChildren();
  for (const report of roomState.reports.slice(0, 10)) {
    const view = reportForSeat(report, roomState.seat, game.size);
    for (const text of [view.events, view.movement, view.casualties].filter(Boolean)) {
      const item = document.createElement("li");
      const label = document.createElement("b");
      label.textContent = `Round ${view.round}`;
      item.append(label, document.createTextNode(` · ${text}`));
      elements.battleLog.append(item);
    }
  }
}

function battleStatus() {
  if (roomState.phase === "deployment") {
    return roomState.deploymentTurn === "you"
      ? "Your deployment turn. Choose a reserve unit, then place it in either highlighted back row."
      : `Waiting for ${roomState.players.opponent.name} to place one unit.`;
  }
  if (roomState.phase === "ended") return roomState.result?.reason ?? "The battle has ended.";
  if (roomState.youReady) return roomState.opponentReady ? "Both commanders committed. Resolving…" : `Your orders are committed and secret. Waiting for ${roomState.players.opponent.name}.`;
  if (roomState.opponentReady) return `${roomState.players.opponent.name} has committed secret orders. Prepare and commit yours.`;
  return "Prepare the required secret orders. Turns are untimed.";
}

function renderBattle() {
  const game = gameForSeat(roomState.game, roomState.seat);
  const scenario = getScenario(game.scenarioId);
  elements.scenarioName.textContent = `${scenario.name} · Private room ${roomState.roomId}`;
  elements.opponentBattleName.textContent = `Opponent · ${roomState.players.opponent.name}`;
  elements.phaseHeading.textContent = roomState.phase === "deployment" ? "Alternating deployment" : roomState.phase === "ended" ? "Battle concluded" : "Orders phase";
  elements.round.textContent = game.round || "—";
  elements.status.textContent = battleStatus();
  elements.deploymentPanel.hidden = roomState.phase !== "deployment";
  elements.ordersPanel.hidden = !["orders", "ended"].includes(roomState.phase);
  elements.resign.hidden = roomState.phase === "ended";
  if (roomState.phase === "deployment") {
    renderReserve(game);
    elements.deploymentTitle.textContent = roomState.deploymentTurn === "you" ? "Your placement" : "Opponent placing";
    elements.deploymentNote.textContent = battleStatus();
  } else {
    renderOrders(game);
  }
  elements.youReady.textContent = roomState.youReady ? "Committed" : "Preparing";
  elements.youReady.classList.toggle("ready", roomState.youReady);
  elements.opponentReadyName.textContent = roomState.players.opponent.name ?? "Opponent";
  elements.opponentReady.textContent = roomState.opponentReady ? "Committed" : "Preparing";
  elements.opponentReady.classList.toggle("ready", roomState.opponentReady);
  elements.humanStrength.textContent = activeUnits(game, PLAYERS.HUMAN).length;
  elements.computerStrength.textContent = activeUnits(game, PLAYERS.COMPUTER).length;
  elements.controlToggle.setAttribute("aria-pressed", String(showControl));
  elements.controlToggle.textContent = showControl ? "Control shading visible" : "Control shading hidden";
  renderBattleBoard(game);
  renderReports(game);

  if (roomState.phase === "ended" && roomState.result) {
    const resultKey = `${roomState.result.finishedAt}:${roomState.result.winner}`;
    if (resultKey !== shownResultKey) {
      shownResultKey = resultKey;
      const winner = canonicalWinnerForSeat(roomState.result.winner, roomState.seat);
      const title = winner === "you" ? "The field is yours." : winner === "draw" ? "Neither army prevails." : "Your formation has broken.";
      message(title, roomState.result.reason);
    }
  }
}

function render() {
  const guestNeedsName = credentials?.seat === "guest" && roomState && !roomState.players.you.name;
  document.body.dataset.screen = roomState?.game && ["deployment", "orders", "ended"].includes(roomState.phase) && !manualEditorGame
    ? "battle"
    : "online";
  elements.entry.hidden = Boolean(roomState && !guestNeedsName) || Boolean(manualEditorGame);
  elements.room.hidden = !roomState || guestNeedsName || !["lobby", "proposal"].includes(roomState.phase) || Boolean(manualEditorGame);
  elements.terrainEditor.hidden = !manualEditorGame;
  elements.battle.hidden = !roomState || !["deployment", "orders", "ended"].includes(roomState.phase) || Boolean(manualEditorGame);
  if (!roomState || guestNeedsName) renderEntry();
  if (manualEditorGame) renderManualEditor();
  else if (roomState && ["lobby", "proposal"].includes(roomState.phase)) renderRoom();
  else if (roomState?.game) renderBattle();
}

function bindEvents() {
  elements.createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = new FormData(elements.createForm);
      const result = await api.createRoom(data.get("hostName"));
      saveCredentials({ roomId: result.roomId, seat: "host", token: result.hostToken, guestToken: result.guestToken });
      api.setCredentials(credentials);
      setRoomState(result.state);
      api.connect();
    } catch (error) {
      message("The room could not be created", error.message);
    } finally {
      setBusy(false);
    }
  });

  elements.joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(elements.joinForm);
    const next = await runAction("join", { name: data.get("guestName") });
    if (next) api.connect();
  });

  elements.copyInvite.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.inviteLink.value);
      elements.copyInvite.textContent = "Copied";
      setTimeout(() => { elements.copyInvite.textContent = "Copy link"; }, 1600);
    } catch {
      elements.inviteLink.select();
      message("Copy the invitation", "The link is selected. Press Ctrl+C to copy it.");
    }
  });

  elements.fieldForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(elements.fieldForm);
    const scenarioId = data.get("scenario");
    const terrainMode = data.get("terrainMode");
    if (terrainMode === "manual") openManualEditor(scenarioId);
    else await runAction("propose_field", { scenarioId, terrainMode });
  });

  elements.cancelTerrain.addEventListener("click", () => {
    manualEditorGame = null;
    render();
  });
  elements.clearTerrain.addEventListener("click", () => {
    clearTerrain(manualEditorGame);
    renderManualEditor();
  });
  elements.submitManualField.addEventListener("click", async () => {
    const payload = { scenarioId: manualEditorGame.scenarioId, terrainMode: "manual", terrain: manualEditorGame.terrain };
    manualEditorGame = null;
    render();
    await runAction("propose_field", payload);
  });
  elements.approveField.addEventListener("click", () => runAction("approve_field"));
  elements.declineField.addEventListener("click", () => {
    const reason = window.prompt("What should the host change?", "Please choose a different battlefield.");
    if (reason !== null) runAction("decline_field", { reason });
  });
  elements.submitOrders.addEventListener("click", async () => {
    const game = gameForSeat(roomState.game, roomState.seat);
    const error = validateOrders(game, PLAYERS.HUMAN, draftOrders);
    if (error) {
      message("The orders are not ready", error);
      return;
    }
    const orders = draftOrders.map((order) => orderToCanonical(order, roomState.seat, game.size));
    const next = await runAction("submit_orders", { orders });
    if (next) {
      draftOrders = [];
      clearDraftStorage();
    }
  });
  elements.clearOrders.addEventListener("click", () => {
    draftOrders = [];
    selectedUnitId = null;
    pendingMove = null;
    saveDraft();
    renderBattle();
  });
  elements.withdrawOrders.addEventListener("click", () => runAction("withdraw_orders"));
  elements.controlToggle.addEventListener("click", () => {
    showControl = !showControl;
    renderBattle();
  });
  elements.resign.addEventListener("click", () => {
    if (window.confirm("Resign this online battle? Your opponent will win immediately.")) runAction("resign");
  });
  for (const button of elements.reconnectButtons) {
    button.addEventListener("click", () => {
      setConnection("connecting");
      api?.reconnectNow();
    });
  }
}

async function initialize() {
  bindEvents();
  const serverUrl = multiplayerServerUrl();
  if (!serverUrl) {
    elements.serverWarning.hidden = false;
    elements.entry.hidden = true;
    return;
  }
  api = new MultiplayerApi(serverUrl);
  api.addEventListener("state", (event) => setRoomState(event.detail));
  api.addEventListener("connection", (event) => setConnection(event.detail.status));
  api.addEventListener("error", () => setConnection("error"));
  credentials = credentialsFromLocation();
  if (!credentials) {
    renderEntry();
    return;
  }
  api.setCredentials(credentials);
  setConnection("connecting");
  try {
    const result = await api.state();
    setRoomState(result.state);
    api.connect();
  } catch (error) {
    localStorage.removeItem(roomStorageKey(credentials.roomId, credentials.seat));
    credentials = null;
    history.replaceState(null, "", new URL("multiplayer.html", location.href));
    message("The invitation could not be opened", error.message);
    renderEntry();
  }
}

initialize();
window.addEventListener("focus", () => api?.syncOnFocus());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") api?.syncOnFocus();
});
window.addEventListener("beforeunload", () => api?.close());
