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
  let supportedUnits = 0;
  let screenedRanged = 0;
  const forward = player === "computer" ? 1 : -1;
  for (const unit of units) {
    projectedSupport += contributors[unit.y][unit.x][player]
      .filter((source) => source.unitId !== unit.id)
      .reduce((total, source) => total + source.value, 0);
    const adjacent = units.filter(
      (ally) => ally.id !== unit.id && Math.max(Math.abs(ally.x - unit.x), Math.abs(ally.y - unit.y)) <= 1,
    ).length;
    adjacentSupport += adjacent;
    const projected = contributors[unit.y][unit.x][player].some((source) => source.unitId !== unit.id);
    if (!adjacent && !projected) isolated += 1;
    else supportedUnits += 1;
    if (["musket", "artillery"].includes(unit.type) && units.some((ally) => (
      !["musket", "artillery"].includes(ally.type)
      && Math.abs(ally.x - unit.x) <= 1
      && (ally.y - unit.y) * forward > 0
      && Math.abs(ally.y - unit.y) <= 3
    ))) screenedRanged += 1;
  }
  const unseen = new Set(units.map((unit) => unit.id));
  let components = 0;
  while (unseen.size) {
    components += 1;
    const first = unseen.values().next().value;
    unseen.delete(first);
    const queue = [units.find((unit) => unit.id === first)];
    while (queue.length) {
      const current = queue.pop();
      for (const ally of units) {
        if (!unseen.has(ally.id)) continue;
        if (Math.max(Math.abs(current.x - ally.x), Math.abs(current.y - ally.y)) > 2) continue;
        unseen.delete(ally.id);
        queue.push(ally);
      }
    }
  }
  return { projectedSupport, adjacentSupport, isolated, supportedUnits, screenedRanged, components };
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

function advanceFeatures(game, player, units, control) {
  const mobile = units.filter((unit) => UNIT_DEFS[unit.type].movement > 0);
  const progress = mobile.reduce(
    (total, unit) => total + (player === "computer" ? unit.y : game.size - 1 - unit.y),
    0,
  );
  const beyondHome = mobile.filter((unit) => (
    player === "computer"
      ? unit.y >= game.deploymentRows
      : unit.y < game.size - game.deploymentRows
  )).length;
  const homebound = mobile.length - beyondHome;
  const enemyHalfStart = Math.floor(game.size / 2);
  let pressureCells = 0;
  let enemyHomeControl = 0;
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      if (controlOwner(control[y][x]) !== player) continue;
      const inEnemyHalf = player === "computer" ? y >= enemyHalfStart : y < enemyHalfStart;
      const inEnemyHome = player === "computer"
        ? y >= game.size - game.deploymentRows
        : y < game.deploymentRows;
      if (inEnemyHalf) pressureCells += 1;
      if (inEnemyHome) enemyHomeControl += 1;
    }
  }
  return { progress, beyondHome, homebound, pressureCells, enemyHomeControl };
}

function pursuitFeatures(player, units, enemies) {
  if (!units.length || !enemies.length) return { enemyDistance: 0, contactUnits: 0, passedUnengaged: 0 };
  const distances = units.map((unit) => Math.min(
    ...enemies.map((enemy) => Math.abs(unit.x - enemy.x) + Math.abs(unit.y - enemy.y)),
  ));
  const enemyEdge = player === "computer"
    ? Math.max(...enemies.map((unit) => unit.y))
    : Math.min(...enemies.map((unit) => unit.y));
  const passedUnengaged = units.filter((unit, index) => {
    const passed = player === "computer" ? unit.y > enemyEdge : unit.y < enemyEdge;
    return passed && distances[index] > 3;
  }).length;
  return {
    enemyDistance: distances.reduce((total, distance) => total + distance, 0),
    contactUnits: distances.filter((distance) => distance <= 3).length,
    passedUnengaged,
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
  const ownAdvance = advanceFeatures(game, perspective, ownUnits, control);
  const enemyAdvance = advanceFeatures(game, enemy, enemyUnits, control);
  const ownPursuit = pursuitFeatures(perspective, ownUnits, enemyUnits);
  const enemyPursuit = pursuitFeatures(enemy, enemyUnits, ownUnits);
  const ownPressureOnEnemyUnits = enemyUnits.reduce(
    (total, unit) => total + control[unit.y][unit.x][perspective],
    0,
  );
  const enemyPressureOnOwnUnits = ownUnits.reduce(
    (total, unit) => total + control[unit.y][unit.x][enemy],
    0,
  );
  const enemyUnitsContested = enemyUnits.filter((unit) => {
    const cell = control[unit.y][unit.x];
    return cell[perspective] > 0 && cell[perspective] === cell[enemy];
  }).length;
  const ownUnitsContested = ownUnits.filter((unit) => {
    const cell = control[unit.y][unit.x];
    return cell[enemy] > 0 && cell[perspective] === cell[enemy];
  }).length;
  const enemyPressureConcentration = enemyUnits.reduce((total, unit) => {
    const value = control[unit.y][unit.x][perspective];
    return total + value * value;
  }, 0);
  const ownExposureConcentration = ownUnits.reduce((total, unit) => {
    const value = control[unit.y][unit.x][enemy];
    return total + value * value;
  }, 0);
  const bestEnemyBreachMargin = enemyUnits.length
    ? Math.max(...enemyUnits.map((unit) => {
      const cell = control[unit.y][unit.x];
      return cell[perspective] - cell[enemy];
    }))
    : game.size * game.size;
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
    ownSupportedUnits: ownFormation.supportedUnits,
    enemySupportedUnits: enemyFormation.supportedUnits,
    ownScreenedRanged: ownFormation.screenedRanged,
    enemyScreenedRanged: enemyFormation.screenedRanged,
    ownFormationBreaks: Math.max(0, ownFormation.components - 1),
    enemyFormationBreaks: Math.max(0, enemyFormation.components - 1),
    ownTerrain,
    enemyTerrain,
    ownDefeatRisk: ownDefeat.risk,
    enemyDefeatRisk: enemyDefeat.risk,
    ownDefeated: ownDefeat.defeated,
    enemyDefeated: enemyDefeat.defeated,
    ownProgress: ownAdvance.progress,
    enemyProgress: enemyAdvance.progress,
    ownBeyondHome: ownAdvance.beyondHome,
    enemyBeyondHome: enemyAdvance.beyondHome,
    ownHomebound: ownAdvance.homebound,
    enemyHomebound: enemyAdvance.homebound,
    ownPressureCells: ownAdvance.pressureCells,
    enemyPressureCells: enemyAdvance.pressureCells,
    ownEnemyHomeControl: ownAdvance.enemyHomeControl,
    enemyEnemyHomeControl: enemyAdvance.enemyHomeControl,
    ownEnemyDistance: ownPursuit.enemyDistance,
    enemyEnemyDistance: enemyPursuit.enemyDistance,
    ownContactUnits: ownPursuit.contactUnits,
    enemyContactUnits: enemyPursuit.contactUnits,
    ownPassedUnengaged: ownPursuit.passedUnengaged,
    enemyPassedUnengaged: enemyPursuit.passedUnengaged,
    ownPressureOnEnemyUnits,
    enemyPressureOnOwnUnits,
    enemyUnitsContested,
    ownUnitsContested,
    enemyPressureConcentration,
    ownExposureConcentration,
    bestEnemyBreachMargin,
  };
}

export function evaluatePosition(game, perspective, baseline, difficultyId) {
  const feature = positionFeatures(game, perspective, baseline);
  if (difficultyId === "corporal") {
    let score = feature.enemyLost * 150 + feature.ownLost * 38 + feature.mutualLosses * 70
      + feature.ownProgress * 8 + feature.ownBeyondHome * 34 + feature.ownPressureCells * 3
      + feature.ownPressureOnEnemyUnits * 8 + feature.enemyUnitsContested * 45
      - feature.ownEnemyDistance * 6 + feature.ownContactUnits * 25 - feature.ownPassedUnengaged * 35
      + feature.enemyPressureConcentration * 1.5 + feature.bestEnemyBreachMargin * 10
      - feature.ownHomebound * 18 + feature.enemyMobility * 1.5
      + feature.ownSupport * 1.5 + feature.ownSupportedUnits * 7 - feature.ownIsolation * 8
      + feature.ownScreenedRanged * 5 - feature.ownFormationBreaks * 8 - feature.ownTerrain * 10
      + feature.enemyDefeatRisk * 900 - feature.ownDefeatRisk * 500;
    if (feature.ownAlive <= 3 && !feature.ownDefeated) score += 180;
    if (feature.ownDefeated) score -= 70000;
    if (feature.enemyDefeated) score += 90000;
    return { score, feature };
  }

  if (difficultyId === "captain") {
    let score = feature.enemyLost * 145 - feature.ownLost * 82 + feature.mutualLosses * 135
      + feature.controlMargin * 0.55 + feature.ownMobility - feature.enemyMobility * 0.55
      + feature.ownProgress * 7 + feature.ownBeyondHome * 42 - feature.ownHomebound * 22
      + feature.ownPressureCells * 4 + feature.ownEnemyHomeControl * 8
      + feature.ownPressureOnEnemyUnits * 13 + feature.enemyUnitsContested * 85
      - feature.ownEnemyDistance * 8 + feature.ownContactUnits * 35 - feature.ownPassedUnengaged * 60
      + feature.enemyPressureConcentration * 3 + feature.bestEnemyBreachMargin * 28
      - feature.enemyPressureOnOwnUnits * 4 - feature.ownExposureConcentration;
    score += feature.ownSupportedUnits * 14 + feature.ownScreenedRanged * 10
      - feature.ownIsolation * 16 - feature.ownFormationBreaks * 20;
    if (feature.ownDefeated) score -= 100000;
    if (feature.enemyDefeated) score += 100000;
    return { score, feature };
  }

  if (difficultyId === "general") {
    const greedy = (baseline.round ?? game.round) > 15;
    let score = feature.enemyLost * (greedy ? 235 : 205) - feature.ownLost * (greedy ? 185 : 225)
      + (feature.ownControlCells - feature.enemyControlCells) * (greedy ? 2.4 : 3.2)
      + feature.controlMargin * 0.8 + feature.ownSupport * 8 - feature.ownIsolation * 10
      + feature.ownSupportedUnits * 28 + feature.ownScreenedRanged * 24
      - feature.ownFormationBreaks * 42 + feature.enemyFormationBreaks * 12
      + feature.ownMobility * 1.4 - feature.enemyMobility * 0.8
      + feature.ownTerrain * 9 - feature.enemyTerrain * 4
      + feature.ownProgress * (greedy ? 11 : 8) + feature.ownBeyondHome * (greedy ? 38 : 58)
      - feature.ownHomebound * (greedy ? 18 : 35) + feature.ownPressureCells * (greedy ? 6 : 8)
      + feature.ownEnemyHomeControl * 14
      + feature.ownPressureOnEnemyUnits * (greedy ? 24 : 19)
      + feature.enemyUnitsContested * (greedy ? 145 : 110)
      - feature.ownEnemyDistance * (greedy ? 9 : 11)
      + feature.ownContactUnits * (greedy ? 48 : 40)
      - feature.ownPassedUnengaged * (greedy ? 70 : 90)
      + feature.enemyPressureConcentration * (greedy ? 6 : 5)
      + feature.bestEnemyBreachMargin * (greedy ? 60 : 48)
      - feature.enemyPressureOnOwnUnits * (greedy ? 7 : 9)
      - feature.ownExposureConcentration * (greedy ? 1.7 : 2) - feature.ownUnitsContested * 45
      + feature.enemyDefeatRisk * 1800 - feature.ownDefeatRisk * 2600;
    if (feature.ownDefeated) score -= 500000;
    if (feature.enemyDefeated) score += 500000;
    return { score, feature };
  }

  let score = feature.enemyLost * 1120 - feature.ownLost * 1320
    + (feature.ownControlCells - feature.enemyControlCells) * 5
    + feature.controlMargin * 1.25 + feature.ownSupport * 19 - feature.enemySupport * 3
    + feature.ownSupportedUnits * 52 + feature.ownScreenedRanged * 45
    - feature.ownIsolation * 72 + feature.enemyIsolation * 16
    - feature.ownFormationBreaks * 95 + feature.enemyFormationBreaks * 30
    + feature.ownMobility * 2.4 - feature.enemyMobility * 1.3
    + feature.ownTerrain * 14 - feature.enemyTerrain * 7
    + feature.ownProgress * 19 + feature.ownBeyondHome * 104 - feature.ownHomebound * 62
    + feature.ownPressureCells * 15 + feature.ownEnemyHomeControl * 34
    + feature.ownPressureOnEnemyUnits * 42 + feature.enemyUnitsContested * 245
    - feature.ownEnemyDistance * 13 + feature.ownContactUnits * 55 - feature.ownPassedUnengaged * 130
    + feature.enemyPressureConcentration * 12 + feature.bestEnemyBreachMargin * 110
    - feature.enemyPressureOnOwnUnits * 18 - feature.ownExposureConcentration * 4
    - feature.ownUnitsContested * 120
    + feature.enemyDefeatRisk * 9000 - feature.ownDefeatRisk * 16000;
  if (feature.ownDefeated) score -= 2000000;
  if (feature.enemyDefeated) score += 2000000;
  return { score, feature };
}
