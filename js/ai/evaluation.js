import { DIRECTIONS, UNIT_DEFS, oppositePlayer } from "../engine/constants.js";
import { computeControlDetails, controlOwner, controlStatus } from "../engine/control.js";
import { activeUnits, isInside, unitAt } from "../engine/model.js";
import { immediateDefeat } from "../engine/victory.js";

function terrainValue(type) {
  return {
    hill: 3,
    road: 2,
    bridge: 2,
    plain: 0,
    river: -1,
    mud: -2,
    fog: -3,
  }[type] ?? 0;
}

function localMobility(game, player, control) {
  const units = activeUnits(game, player).filter((unit) => UNIT_DEFS[unit.type].movement > 0);
  let destinations = 0;
  let safeUnits = 0;
  for (const unit of units) {
    let hasSafe = false;
    for (const direction of Object.values(DIRECTIONS)) {
      const x = unit.x + direction.dx;
      const y = unit.y + direction.dy;
      if (!isInside(game, x, y) || game.terrain[y][x] === "wall") continue;
      const occupant = unitAt(game, x, y);
      if (occupant?.player !== undefined && occupant.player !== player) continue;
      destinations += 1;
      if (controlStatus(control[y][x], player) !== "enemy") hasSafe = true;
    }
    if (hasSafe) safeUnits += 1;
  }
  return { mobileUnits: units.length, destinations, safeUnits };
}

function formationSupport(game, player, contributors) {
  const units = activeUnits(game, player);
  let projectedSupport = 0;
  let adjacentSupport = 0;
  let isolated = 0;
  for (const unit of units) {
    projectedSupport += contributors[unit.y][unit.x][player]
      .filter((source) => source.unitId !== unit.id)
      .reduce((total, source) => total + source.value, 0);
    const adjacent = units.filter(
      (ally) => ally.id !== unit.id && Math.max(Math.abs(ally.x - unit.x), Math.abs(ally.y - unit.y)) <= 1,
    ).length;
    adjacentSupport += adjacent;
    if (!adjacent) isolated += 1;
  }
  return { projectedSupport, adjacentSupport, isolated };
}

function approximateDefeatRisk(game, player, mobility) {
  const units = activeUnits(game, player);
  if (!units.length) return { defeated: true, risk: 1 };
  if (units.length <= 8) {
    const exact = immediateDefeat(game, player);
    return { defeated: exact.defeated, risk: exact.defeated ? 1 : 0 };
  }
  const required = Math.min(3, mobility.mobileUnits);
  if (!required) return { defeated: true, risk: 1 };
  return {
    defeated: false,
    risk: Math.max(0, required - mobility.safeUnits) / required,
  };
}

export function positionFeatures(game, perspective, baseline) {
  const enemy = oppositePlayer(perspective);
  const ownUnits = activeUnits(game, perspective);
  const enemyUnits = activeUnits(game, enemy);
  const { grid: control, contributors } = computeControlDetails(game);
  const ownMobility = localMobility(game, perspective, control);
  const enemyMobility = localMobility(game, enemy, control);
  const ownFormation = formationSupport(game, perspective, contributors);
  const enemyFormation = formationSupport(game, enemy, contributors);
  let ownControlCells = 0;
  let enemyControlCells = 0;
  let controlMargin = 0;
  for (const row of control) {
    for (const cell of row) {
      const owner = controlOwner(cell);
      if (owner === perspective) ownControlCells += 1;
      if (owner === enemy) enemyControlCells += 1;
      controlMargin += Math.max(-8, Math.min(8, cell[perspective] - cell[enemy]));
    }
  }
  const ownTerrain = ownUnits.reduce((total, unit) => total + terrainValue(game.terrain[unit.y][unit.x]), 0);
  const enemyTerrain = enemyUnits.reduce((total, unit) => total + terrainValue(game.terrain[unit.y][unit.x]), 0);
  const ownDefeat = approximateDefeatRisk(game, perspective, ownMobility);
  const enemyDefeat = approximateDefeatRisk(game, enemy, enemyMobility);
  return {
    ownAlive: ownUnits.length,
    enemyAlive: enemyUnits.length,
    ownLost: Math.max(0, baseline.own - ownUnits.length),
    enemyLost: Math.max(0, baseline.enemy - enemyUnits.length),
    mutualLosses: Math.min(
      Math.max(0, baseline.own - ownUnits.length),
      Math.max(0, baseline.enemy - enemyUnits.length),
    ),
    ownControlCells,
    enemyControlCells,
    controlMargin,
    ownMobility: ownMobility.destinations,
    enemyMobility: enemyMobility.destinations,
    ownSafeUnits: ownMobility.safeUnits,
    enemySafeUnits: enemyMobility.safeUnits,
    ownSupport: ownFormation.projectedSupport + ownFormation.adjacentSupport,
    enemySupport: enemyFormation.projectedSupport + enemyFormation.adjacentSupport,
    ownIsolation: ownFormation.isolated,
    enemyIsolation: enemyFormation.isolated,
    ownTerrain,
    enemyTerrain,
    ownDefeatRisk: ownDefeat.risk,
    enemyDefeatRisk: enemyDefeat.risk,
    ownDefeated: ownDefeat.defeated,
    enemyDefeated: enemyDefeat.defeated,
  };
}

export function evaluatePosition(game, perspective, baseline, difficultyId) {
  const feature = positionFeatures(game, perspective, baseline);
  if (difficultyId === "corporal") {
    let score = feature.ownLost * 240 - feature.enemyLost * 105 + feature.enemyMobility * 4
      - feature.ownSupport * 5 - feature.ownTerrain * 14 + feature.ownIsolation * 8;
    if (feature.ownAlive <= 3 && !feature.enemyDefeated) score += 900;
    if (feature.ownDefeated) score += 120000;
    if (feature.enemyDefeated || feature.enemyDefeatRisk) score -= 180000 * Math.max(0.25, feature.enemyDefeatRisk);
    return { score, feature };
  }

  if (difficultyId === "captain") {
    let score = feature.enemyLost * 145 - feature.ownLost * 82 + feature.mutualLosses * 135
      + feature.controlMargin * 0.45 + feature.ownMobility - feature.enemyMobility * 0.4;
    if (feature.ownDefeated) score -= 100000;
    if (feature.enemyDefeated) score += 100000;
    return { score, feature };
  }

  if (difficultyId === "general") {
    const greedy = (baseline.round ?? game.round) > 15;
    let score = feature.enemyLost * (greedy ? 245 : 190) - feature.ownLost * (greedy ? 120 : 205)
      + (feature.ownControlCells - feature.enemyControlCells) * (greedy ? 1.3 : 3.2)
      + feature.controlMargin * 0.8 + feature.ownSupport * 8 - feature.ownIsolation * 10
      + feature.ownMobility * 1.4 - feature.enemyMobility * 0.8
      + feature.ownTerrain * 9 - feature.enemyTerrain * 4
      + feature.enemyDefeatRisk * 1800 - feature.ownDefeatRisk * 2600;
    if (feature.ownDefeated) score -= 500000;
    if (feature.enemyDefeated) score += 500000;
    return { score, feature };
  }

  let score = feature.enemyLost * 340 - feature.ownLost * 1150
    + (feature.ownControlCells - feature.enemyControlCells) * 5
    + feature.controlMargin * 1.25 + feature.ownSupport * 17 - feature.enemySupport * 3
    - feature.ownIsolation * 24 + feature.enemyIsolation * 9
    + feature.ownMobility * 2.4 - feature.enemyMobility * 1.3
    + feature.ownTerrain * 14 - feature.enemyTerrain * 7
    + feature.enemyDefeatRisk * 9000 - feature.ownDefeatRisk * 16000;
  if (feature.ownDefeated) score -= 2000000;
  if (feature.enemyDefeated) score += 2000000;
  return { score, feature };
}
