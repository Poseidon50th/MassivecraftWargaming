import { deployComputerUnit } from "../ai/computer.js";
import { getScenario } from "../data/scenarios.js";
import { PLAYERS, TERRAIN } from "../engine/constants.js";
import { createGame, isDeploymentSquare, placeUnit, unitAt } from "../engine/model.js";
import { clearTerrain, isStartingRow, randomizeTerrain, setTerrain } from "../engine/terrain.js";
import { createGameSeed } from "../ai/random.js";

export function createDeploymentController({
  getGame,
  setGame,
  getSelectedReserveType,
  setSelectedReserveType,
  getSelectedTerrainType,
  setSelectedTerrainType,
  setPendingMove,
  setStatus,
  save,
  openGame,
  render,
  renderBoard,
  renderTerrainPalette,
  announce,
  cancelDelayedWork,
  checkOpeningVictory,
  boardCoordinate,
}) {
  function startGame(scenarioId, terrainMode = "random", aiDifficulty = "captain") {
    cancelDelayedWork();
    const game = createGame(getScenario(scenarioId));
    game.terrainMode = terrainMode;
    game.aiDifficulty = aiDifficulty;
    game.aiSeed = createGameSeed();
    if (terrainMode === "random") randomizeTerrain(game);
    if (terrainMode === "manual") game.phase = "terrain";
    setGame(game);
    setSelectedReserveType("sword");
    setSelectedTerrainType("wall");
    setPendingMove(null);
    setStatus(terrainMode === "manual"
      ? "Choose a terrain type and paint any square outside both armies’ starting rows."
      : "Terrain randomized. Select a reserve unit, then place it in either of your back rows.");
    save();
    openGame();
  }

  function paintTerrain(x, y) {
    const game = getGame();
    if (isStartingRow(game, y)) {
      announce("Starting rows must remain clear of special terrain.");
      return;
    }
    setTerrain(game, x, y, getSelectedTerrainType());
    setStatus(`${TERRAIN[game.terrain[y][x]].name} placed on ${boardCoordinate(x, y)}. Continue painting or save the field.`);
    save();
    renderBoard();
    renderTerrainPalette();
  }

  function finishTerrainPlacement() {
    const game = getGame();
    game.phase = "deployment";
    game.log.unshift({ round: 0, text: "Manual terrain placement completed. Deployment began." });
    setStatus("Terrain saved. Select a reserve unit, then place it in either of your back rows.");
    save();
    render();
  }

  function clearTerrainPlacement() {
    clearTerrain(getGame());
    setStatus("All special terrain cleared. Continue painting or save the empty field.");
    save();
    render();
  }

  function reserveGroups() {
    const counts = {};
    for (const unit of getGame().reserves[PLAYERS.HUMAN]) counts[unit.type] = (counts[unit.type] ?? 0) + 1;
    return counts;
  }

  function artilleryAdjacent(x, y) {
    return getGame().units.some(
      (unit) => unit.alive !== false && unit.type === "artillery" && Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y)) <= 1,
    );
  }

  function placeHumanUnit(x, y) {
    const game = getGame();
    if (!isDeploymentSquare(game, PLAYERS.HUMAN, y) || unitAt(game, x, y)) return;
    const reserve = game.reserves[PLAYERS.HUMAN].find((unit) => unit.type === getSelectedReserveType());
    if (!reserve) return;
    if (reserve.type === "artillery" && artilleryAdjacent(x, y)) {
      announce("Artillery cannot be placed adjacent to another Artillery unit.");
      return;
    }
    placeUnit(game, reserve, x, y, "north");
    deployComputerUnit(game, game.aiDifficulty);
    const groups = reserveGroups();
    if (!groups[getSelectedReserveType()]) setSelectedReserveType(Object.keys(groups)[0] ?? null);
    if (!game.reserves.human.length && !game.reserves.computer.length) {
      game.phase = "orders";
      game.round = 1;
      game.log.unshift({ round: 1, text: "Both armies completed deployment. The first Orders Phase began." });
      setStatus("Choose three distinct units. The opposing general cannot see your orders.");
      if (checkOpeningVictory()) return;
    } else {
      setStatus(`${game.reserves.human.length} of your units remain in reserve.`);
    }
    save();
    render();
  }

  return {
    startGame,
    paintTerrain,
    finishTerrainPlacement,
    clearTerrainPlacement,
    reserveGroups,
    placeHumanUnit,
  };
}
