import { TERRAIN } from "./constants.js";

export const PLACEABLE_TERRAIN = Object.freeze(["wall", "hill", "mud", "river", "road", "fog"]);

export function blankTerrain(size) {
  return Array.from({ length: size }, () => Array(size).fill("plain"));
}

export function isStartingRow(game, y) {
  return y < game.deploymentRows || y >= game.size - game.deploymentRows;
}

export function setTerrain(game, x, y, type) {
  if (!TERRAIN[type] || type === "bridge" || isStartingRow(game, y)) return false;
  const current = game.terrain[y][x];
  if ((current === "river" && type === "road") || (current === "road" && type === "river")) {
    game.terrain[y][x] = "bridge";
  } else {
    game.terrain[y][x] = type;
  }
  return true;
}

export function clearTerrain(game) {
  game.terrain = blankTerrain(game.size);
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

export function randomizeTerrain(game, random = Math.random) {
  clearTerrain(game);
  const squares = [];
  for (let y = game.deploymentRows; y < game.size - game.deploymentRows; y += 1) {
    for (let x = 0; x < game.size; x += 1) squares.push({ x, y });
  }
  shuffle(squares, random);
  const targetCount = Math.max(PLACEABLE_TERRAIN.length, Math.round(squares.length * (game.size === 8 ? 0.24 : 0.18)));
  const weighted = ["wall", "hill", "hill", "mud", "mud", "river", "river", "road", "road", "fog", "fog"];
  for (let index = 0; index < Math.min(targetCount, squares.length); index += 1) {
    const { x, y } = squares[index];
    const type = index < PLACEABLE_TERRAIN.length
      ? PLACEABLE_TERRAIN[index]
      : weighted[Math.floor(random() * weighted.length)];
    setTerrain(game, x, y, type);
  }
  return game.terrain;
}

export function terrainSummary(type) {
  const definition = TERRAIN[type] ?? TERRAIN.plain;
  return `${definition.name}: ${definition.rule}`;
}
