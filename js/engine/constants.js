export const PLAYERS = Object.freeze({ HUMAN: "human", COMPUTER: "computer" });

export const FACINGS = Object.freeze(["north", "east", "south", "west"]);

export const DIRECTIONS = Object.freeze({
  north: { dx: 0, dy: -1, glyph: "↑" },
  east: { dx: 1, dy: 0, glyph: "→" },
  south: { dx: 0, dy: 1, glyph: "↓" },
  west: { dx: -1, dy: 0, glyph: "←" },
});

export const UNIT_DEFS = Object.freeze({
  sword: {
    name: "Swords",
    short: "SW",
    strength: 3,
    movement: 2,
    initiative: 3,
    directional: false,
    description: "Projects 3 control into the four orthogonal squares.",
  },
  spear: {
    name: "Spears",
    short: "SP",
    strength: 3,
    movement: 1,
    initiative: 2,
    directional: true,
    description: "Projects 3 control straight ahead and to both forward diagonals.",
  },
  axe: {
    name: "Axes",
    short: "AX",
    strength: 5,
    movement: 1,
    initiative: 2,
    directional: true,
    description: "Projects 5 control into the square directly ahead.",
  },
  cavalry: {
    name: "Cavalry",
    short: "CV",
    strength: 2,
    movement: 3,
    initiative: 4,
    directional: false,
    description: "Fast; projects 2 around itself and 4 onto isolated enemy units.",
  },
  musket: {
    name: "Muskets",
    short: "MK",
    strength: 3,
    movement: 1,
    initiative: 1,
    directional: true,
    description: "Projects 3, 2, then 1 control along a three-square firing line.",
  },
  artillery: {
    name: "Artillery",
    short: "AR",
    strength: 3,
    movement: 0,
    initiative: 0,
    directional: true,
    description: "Immobile; projects 3 into a 3 × 2 area four squares ahead.",
  },
});

export const TERRAIN = Object.freeze({
  plain: { name: "Plain" },
  wall: { name: "Wall" },
  hill: { name: "Hill" },
  mud: { name: "Mud" },
  river: { name: "River" },
  fog: { name: "Fog" },
  road: { name: "Road" },
});

export function oppositePlayer(player) {
  return player === PLAYERS.HUMAN ? PLAYERS.COMPUTER : PLAYERS.HUMAN;
}

export function facingFromStep(dx, dy) {
  if (dy < 0) return "north";
  if (dx > 0) return "east";
  if (dy > 0) return "south";
  return "west";
}

export function rotateFacing(facing, amount = 1) {
  const index = FACINGS.indexOf(facing);
  return FACINGS[(index + amount + FACINGS.length) % FACINGS.length];
}
