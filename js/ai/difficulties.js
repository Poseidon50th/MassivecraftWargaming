export const AI_DIFFICULTIES = Object.freeze({
  corporal: Object.freeze({
    id: "corporal",
    name: "Corporal",
    level: "Easy",
    summary: "Recklessly aggressive, fond of bad terrain, and willing to lose most of its army.",
    optionLimit: 4,
    orderBeam8: 42,
    orderBeam16: 34,
    orderSetLimit8: 28,
    orderSetLimit16: 22,
    responseLimit8: 5,
    responseLimit16: 4,
    noise: 34,
  }),
  captain: Object.freeze({
    id: "captain",
    name: "Captain",
    level: "Medium",
    summary: "A fair opponent that favors direct attacks and mutually destructive exchanges.",
    optionLimit: 5,
    orderBeam8: 58,
    orderBeam16: 44,
    orderSetLimit8: 38,
    orderSetLimit16: 28,
    responseLimit8: 2,
    responseLimit16: 2,
    noise: 13,
  }),
  general: Object.freeze({
    id: "general",
    name: "General",
    level: "Hard",
    summary: "Deploys and fights strategically, but becomes greedier and less precise after Round 15.",
    optionLimit: 7,
    orderBeam8: 104,
    orderBeam16: 72,
    orderSetLimit8: 58,
    orderSetLimit16: 42,
    responseLimit8: 6,
    responseLimit16: 5,
    noise: 2.5,
  }),
  codex: Object.freeze({
    id: "codex",
    name: "Aristides’ Codex",
    level: null,
    summary: "A deterministic, preservation-first search opponent that attempts the strongest available game.",
    optionLimit: 9,
    orderBeam8: 170,
    orderBeam16: 116,
    orderSetLimit8: 86,
    orderSetLimit16: 58,
    responseLimit8: 12,
    responseLimit16: 8,
    noise: 0,
  }),
});

export const DEFAULT_AI_DIFFICULTY = "captain";

export function isDifficulty(value) {
  return typeof value === "string" && Object.hasOwn(AI_DIFFICULTIES, value);
}

export function getDifficulty(value) {
  return AI_DIFFICULTIES[isDifficulty(value) ? value : DEFAULT_AI_DIFFICULTY];
}

export function difficultyDisplay(value) {
  const difficulty = getDifficulty(value);
  return difficulty.level ? `${difficulty.name} · ${difficulty.level}` : difficulty.name;
}
