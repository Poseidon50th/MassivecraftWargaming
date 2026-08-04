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
  plain: { name: "Plain", rule: "No special effect.", asset: null },
  wall: {
    name: "Wall",
    rule: "Units cannot enter. Control cannot be projected onto or through this square.",
    asset: "assets/terrain/wall.png",
  },
  hill: {
    name: "Hill",
    rule: "A unit standing here gains +1 control on every square it projects into. Its self-control is unchanged.",
    asset: "assets/terrain/hill.png",
  },
  mud: {
    name: "Mud",
    rule: "Entering or leaving this square spends all movement.",
    asset: "assets/terrain/mud.png",
  },
  river: {
    name: "River",
    rule: "Entering or leaving this square applies −1 Initiative for that movement.",
    asset: "assets/terrain/river.png",
  },
  road: {
    name: "Road",
    rule: "A unit beginning its turn here gains +1 Movement.",
    asset: "assets/terrain/road.png",
  },
  bridge: {
    name: "Bridge",
    rule: "A road crossing a River. A unit beginning here gains +1 Movement and does not take the River Initiative penalty.",
    asset: "assets/terrain/road.png",
    underlay: "assets/terrain/river.png",
  },
  fog: {
    name: "Fog",
    rule: "A unit standing here loses 1 control on every square it projects into. Its self-control is unchanged.",
    asset: "assets/terrain/fog.png",
  },
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
