export const AI_DIFFICULTIES = Object.freeze({
  corporal: Object.freeze({
    id: "corporal",
    name: "Corporal",
    level: "Easy",
    summary: "Pursues victory through reckless advances, bad terrain, and costly sacrifices.",
    optionLimit: 5,
    orderBeam8: 64,
    orderBeam16: 52,
    orderSetLimit8: 40,
    orderSetLimit16: 34,
    responseLimit8: 6,
    responseLimit16: 5,
    timeLimit8Ms: 1200,
    timeLimit16Ms: 1800,
    noise: 26,
  }),
  captain: Object.freeze({
    id: "captain",
    name: "Captain",
    level: "Medium",
    summary: "A fair advancing opponent that favors direct attacks and mutually destructive exchanges.",
    optionLimit: 7,
    orderBeam8: 92,
    orderBeam16: 68,
    orderSetLimit8: 56,
    orderSetLimit16: 44,
    responseLimit8: 5,
    responseLimit16: 4,
    timeLimit8Ms: 1800,
    timeLimit16Ms: 2800,
    noise: 9,
  }),
  general: Object.freeze({
    id: "general",
    name: "General",
    level: "Hard",
    summary: "Deploys and fights strategically, but becomes greedier and less precise after Round 15.",
    optionLimit: 9,
    orderBeam8: 156,
    orderBeam16: 116,
    orderSetLimit8: 86,
    orderSetLimit16: 64,
    responseLimit8: 10,
    responseLimit16: 8,
    timeLimit8Ms: 3000,
    timeLimit16Ms: 5000,
    noise: 2.5,
  }),
  codex: Object.freeze({
    id: "codex",
    name: "Aristides’ Codex",
    level: null,
    summary: "A deterministic, preservation-first search opponent that mobilizes the full army and attempts the strongest available game.",
    optionLimit: 11,
    orderBeam8: 250,
    orderBeam16: 190,
    orderSetLimit8: 132,
    orderSetLimit16: 96,
    responseLimit8: 20,
    responseLimit16: 14,
    timeLimit8Ms: 6000,
    timeLimit16Ms: 10000,
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
