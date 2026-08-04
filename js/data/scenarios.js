const SMALL_ARMY = {
  sword: 4,
  spear: 3,
  axe: 3,
  cavalry: 3,
  musket: 2,
  artillery: 1,
};

const LARGE_ARMY = Object.fromEntries(
  Object.entries(SMALL_ARMY).map(([type, count]) => [type, count * 2]),
);

export const SCENARIOS = {
  tutorial: {
    id: "tutorial",
    name: "The Guided Field",
    description: "An 8 × 8 all-unit exercise with a two-round recommended line and a 20-round limit.",
    size: 8,
    deploymentRows: 0,
    army: {},
    terrain: [],
  },
  skirmish: {
    id: "skirmish",
    name: "The Narrow Field",
    description: "An 8 × 8 standard battle with fully occupied deployment lines.",
    size: 8,
    deploymentRows: 2,
    army: SMALL_ARMY,
    terrain: [],
  },
  battle: {
    id: "battle",
    name: "The Open Campaign",
    description: "A 16 × 16 standard battle with room to shape deeper formations.",
    size: 16,
    deploymentRows: 4,
    army: LARGE_ARMY,
    terrain: [],
  },
};

export function getScenario(id) {
  return SCENARIOS[id] ?? SCENARIOS.skirmish;
}

export function rosterFromArmy(army) {
  return Object.entries(army).flatMap(([type, count]) =>
    Array.from({ length: count }, (_, index) => ({ type, index })),
  );
}
