import { DEFAULT_SMALL_ARMY } from "./armies.js";

const LARGE_ARMY = Object.fromEntries(
  Object.entries(DEFAULT_SMALL_ARMY).map(([type, count]) => [type, count * 2]),
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
    description: "An 8 × 8 standard battle supporting armies of up to 16 units.",
    size: 8,
    deploymentRows: 2,
    army: DEFAULT_SMALL_ARMY,
    terrain: [],
  },
  battle: {
    id: "battle",
    name: "The Open Campaign",
    description: "A 16 × 16 standard battle supporting armies of up to 32 units and deeper formations.",
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
