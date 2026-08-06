export const AI_DIFFICULTIES = Object.freeze({
  corporal: Object.freeze({
    id: "corporal",
    name: "Corporal",
    level: "Easy",
    summary: "Uses a loose raiding formation and reckless supported attacks, but still accepts dangerous ground and costly exchanges.",
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
    summary: "Advances in a simple battle line, protects its ranged units, and favors direct attacks and mutually destructive exchanges.",
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
    summary: "Uses layered combined arms, protected advances, threat response, and deliberate counterattacks without abandoning formation.",
    optionLimit: 9,
    orderBeam8: 156,
    orderBeam16: 116,
    orderSetLimit8: 86,
    orderSetLimit16: 64,
    responseLimit8: 10,
    responseLimit16: 8,
    timeLimit8Ms: 3000,
    timeLimit16Ms: 5000,
    noise: 1.5,
  }),
  codex: Object.freeze({
    id: "codex",
    name: "Aristides’ Codex",
    level: null,
    summary: "A deterministic, aggressively calculating opponent that searches for the strongest protected attack and the safest winning formation.",
    optionLimit: 13,
    orderBeam8: 320,
    orderBeam16: 240,
    orderSetLimit8: 180,
    orderSetLimit16: 132,
    responseLimit8: 28,
    responseLimit16: 20,
    timeLimit8Ms: 8000,
    timeLimit16Ms: 14000,
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
