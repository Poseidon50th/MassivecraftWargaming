export const UNIT_TUTORIALS = Object.freeze({
  sword: {
    prompt: "Which order uses the Swords as a stable control anchor?",
    unit: [2, 3], target: [2, 1], targetType: "cavalry",
    control: [[2, 2, 3], [1, 3, 3], [3, 3, 3], [2, 4, 3]],
    choices: [
      ["Advance one square so the target is adjacent", true, "Correct. Swords project 3 in all four orthogonal directions, so the advance places the target inside the pattern while retaining broad support."],
      ["Stay two squares away and face north", false, "That leaves the target outside the Swords’ one-square control pattern. Facing does not extend an omnidirectional Swords unit."],
      ["Move diagonally onto the target", false, "Units move orthogonally, and an enemy-occupied starting square cannot be entered."],
    ],
  },
  spear: {
    prompt: "The target is ahead. Which final facing covers it and both forward diagonals?",
    unit: [2, 3], target: [2, 2], targetType: "cavalry",
    control: [[1, 2, 3], [2, 2, 3], [3, 2, 3]],
    choices: [
      ["Face north after the move", true, "Correct. The Spear projects a three-square fan ahead: forward-left, forward, and forward-right."],
      ["Face east after the move", false, "That turns the entire fan to the right and leaves the northern target outside the Spear’s control."],
      ["Rotate south and rely on self-control", false, "Self-control protects the Spear’s own square, but it does not defeat a target outside the forward fan."],
    ],
  },
  axe: {
    prompt: "Where should the Axe aim its concentrated control?",
    unit: [2, 3], target: [2, 2], targetType: "sword",
    control: [[2, 2, 5]],
    choices: [
      ["Face directly toward the target", true, "Correct. Axes place all 5 control into the single square ahead—narrow, but powerful enough to overwhelm the target’s self-control."],
      ["Face sideways to cover more squares", false, "Axes never spread control. Turning sideways moves the entire 5-control projection away from the target."],
      ["Remain behind the target and depend on Initiative", false, "Initiative settles shared destinations, not the Control Check. The Axe must aim its projection correctly."],
    ],
  },
  cavalry: {
    prompt: "Which target best activates the Cavalry’s isolation rule?",
    unit: [2, 3], target: [2, 2], targetType: "sword",
    control: [[2, 2, 4], [1, 3, 2], [3, 3, 2], [2, 4, 2]],
    choices: [
      ["Attack the enemy with no adjacent ally", true, "Correct. Cavalry projects 4 instead of 2 onto an enemy without an adjacent ally. Its special survival rule can also preserve it during a simultaneous exchange."],
      ["Attack two enemy units standing together", false, "Adjacent enemy support prevents the isolation bonus, leaving the Cavalry’s projection at 2."],
      ["Rotate in place to increase control", false, "Cavalry is omnidirectional. Rotation does not change its control pattern or strength."],
    ],
  },
  musket: {
    prompt: "Which target is under the strongest part of the Musket line?",
    unit: [2, 4], target: [2, 3], targetType: "cavalry",
    control: [[2, 3, 3], [2, 2, 2], [2, 1, 1]],
    choices: [
      ["The closest target in the firing line", true, "Correct. Muskets project 3, then 2, then 1. The nearest square receives the strongest control."],
      ["A target three squares away", false, "The far end receives only 1 control. That is useful support, but rarely enough to defeat a unit by itself."],
      ["A target beside the Musket", false, "The Musket controls only its straight forward line, not adjacent side squares."],
    ],
  },
  artillery: {
    prompt: "How does the Artillery bring the distant target into its control area?",
    unit: [2, 4], target: [2, 0], targetType: "sword",
    control: [[1, 0, 3], [2, 0, 3], [3, 0, 3]],
    choices: [
      ["Rotate north and hold position", true, "Correct. Artillery cannot move, but rotation is a complete order. Its distant 3×2 control area turns with it."],
      ["Move closer before firing", false, "Artillery is immobile. Its only order is rotation, so placement and facing are especially important."],
      ["Aim at a friendly occupied square for support", false, "Artillery cannot support a friendly unit’s occupied square, and it stops projecting entirely while its own square is disputed."],
    ],
  },
});

export const TUTORIAL_UNITS = Object.freeze([
  { id: "human-sword-1", player: "human", type: "sword", x: 0, y: 7, facing: "north", alive: true },
  { id: "human-cavalry-1", player: "human", type: "cavalry", x: 1, y: 7, facing: "north", alive: true },
  { id: "human-spear-1", player: "human", type: "spear", x: 2, y: 7, facing: "north", alive: true },
  { id: "human-axe-1", player: "human", type: "axe", x: 4, y: 7, facing: "north", alive: true },
  { id: "human-musket-1", player: "human", type: "musket", x: 5, y: 7, facing: "south", alive: true },
  { id: "human-artillery-1", player: "human", type: "artillery", x: 7, y: 7, facing: "south", alive: true },
  { id: "computer-cavalry-1", player: "computer", type: "cavalry", x: 0, y: 5, facing: "south", alive: true },
  { id: "computer-cavalry-2", player: "computer", type: "cavalry", x: 2, y: 5, facing: "south", alive: true },
  { id: "computer-cavalry-3", player: "computer", type: "cavalry", x: 4, y: 5, facing: "south", alive: true },
  { id: "computer-sword-1", player: "computer", type: "sword", x: 1, y: 3, facing: "south", alive: true },
  { id: "computer-cavalry-4", player: "computer", type: "cavalry", x: 5, y: 5, facing: "south", alive: true },
  { id: "computer-sword-2", player: "computer", type: "sword", x: 7, y: 3, facing: "south", alive: true },
]);

export const TUTORIAL_PLANS = Object.freeze({
  1: [
    { unitId: "human-sword-1", kind: "move", to: { x: 0, y: 6 }, facing: "north", summary: "Move Swords from A1 to A2 and face north.", lesson: "The Swords’ 3 control defeats the Cavalry on A3." },
    { unitId: "human-spear-1", kind: "move", to: { x: 2, y: 6 }, facing: "north", summary: "Move Spears from C1 to C2 and face north.", lesson: "The Spear’s forward fan defeats the Cavalry on C3." },
    { unitId: "human-axe-1", kind: "move", to: { x: 4, y: 6 }, facing: "north", summary: "Move Axes from E1 to E2 and face north.", lesson: "The Axe concentrates 5 control onto E3." },
  ],
  2: [
    { unitId: "human-cavalry-1", kind: "move", to: { x: 1, y: 4 }, facing: "north", summary: "Move Cavalry from B1 to B4 and face north.", lesson: "The isolated Swords on B5 receive the Cavalry’s 4-control bonus." },
    { unitId: "human-musket-1", kind: "move", to: { x: 5, y: 6 }, facing: "north", summary: "Move Muskets from F1 to F2 and face north.", lesson: "The closest square of the firing line places 3 control onto F3." },
    { unitId: "human-artillery-1", kind: "rotate", to: { x: 7, y: 7 }, facing: "north", summary: "Rotate Artillery on H1 to face north.", lesson: "The Hill raises its distant projection to 4, defeating the Swords on H5." },
  ],
});

export const TUTORIAL_ROUND_COPY = Object.freeze({
  1: {
    title: "Round 1 · The close line",
    coach: "The gold-highlighted Swords, Spears, and Axes each have a target. Choose a destination and final facing for all three.",
    result: "The first line demonstrated broad, fan-shaped, and concentrated control. Three different pieces each contributed to a capture.",
  },
  2: {
    title: "Round 2 · Speed, range, and rotation",
    coach: "Now use Cavalry speed, the Musket’s strongest range, and an Artillery rotation from the Hill. Every remaining piece has a target.",
    result: "All six unit types contributed to at least one capture. You combined movement, facing, terrain, isolation, ranged control, and simultaneous survival.",
  },
});

export const TUTORIAL_LESSONS = Object.freeze([
  { kicker: "Tutorial · 1 of 11", title: "Welcome to the field", html: "<p>This tutorial teaches the interface, control, victory, and every unit one at a time. Each unit lesson includes a miniature battlefield decision; wrong answers are explained and can be retried.</p><p>The final battle accepts mistakes instead of blocking them. Strong highlights and the Hint button keep the recommended line visible whenever you want it.</p>" },
  { kicker: "Tutorial · 2 of 11", title: "Read every square", html: "<p>Coordinates identify squares. The bottom-right badge reads <b>blue control / red control</b>. Hover or focus any battlefield square to read its terrain.</p><p>Blue shading means your total is greater, silver means tied, and red means the enemy total is greater. Units sit above terrain; the terrain still applies.</p>" },
  { kicker: "Tutorial · 3 of 11", title: "How to win", html: "<p>At the end of movement, the Control Check totals every surviving unit’s projection. A unit on enemy-controlled ground is destroyed; a tie is contested and safe.</p><p>You win by leaving the opponent unable to issue the required safe moves. Rotating or holding position does not count as a safe move.</p>" },
  { kicker: "Tutorial · 4 of 11", title: "Swords · the anchor", unitType: "sword" },
  { kicker: "Tutorial · 5 of 11", title: "Spears · the forward fan", unitType: "spear" },
  { kicker: "Tutorial · 6 of 11", title: "Axes · concentrated force", unitType: "axe" },
  { kicker: "Tutorial · 7 of 11", title: "Cavalry · isolation and speed", unitType: "cavalry" },
  { kicker: "Tutorial · 8 of 11", title: "Muskets · a declining line", unitType: "musket" },
  { kicker: "Tutorial · 9 of 11", title: "Artillery · distant pressure", unitType: "artillery" },
  { kicker: "Tutorial · 10 of 11", title: "Give and resolve orders", html: "<p>Select a blue unit to reveal its possible destinations. After choosing a destination, click a facing arrow around the preview piece to confirm the order. Spears, Axes, and Muskets have diagonal arrows as well as the four cardinal directions.</p><p>You normally order three distinct units. Both armies reveal together. Higher Initiative wins a shared destination; a tie bounces both units home.</p>" },
  { kicker: "Tutorial · 11 of 11", title: "Put the army together", html: "<p>The final exercise contains all six unit types and six training targets. The recommended solution wins in two rounds, but you have up to <b>20 rounds</b> and may make any permitted move.</p><p>Poor choices are accepted and explained. To complete every training objective, make sure each of your six pieces contributes control to at least one captured enemy. The progress badges and Hint button track this for you.</p>", startsBattle: true },
]);

export function buildTutorialGame() {
  const terrain = Array.from({ length: 8 }, () => Array(8).fill("plain"));
  terrain[7][7] = "hill";
  return {
    version: 4,
    scenarioId: "tutorial",
    size: 8,
    deploymentRows: 0,
    mode: "tutorial",
    aiDifficulty: "captain",
    aiSeed: 1,
    aiState: { orderCounts: {}, moveCounts: {}, lastOrderedRound: {}, lastMovedRound: {}, lastAdvancedRound: 0 },
    phase: "orders",
    round: 1,
    terrain,
    units: structuredClone(TUTORIAL_UNITS),
    reserves: { human: [], computer: [] },
    orders: { human: [], computer: [] },
    selectedUnitId: null,
    winner: null,
    defeatReason: null,
    tutorial: { hintVisible: false, contributors: [], roundCap: 20 },
    log: [{ round: 1, text: "The final tutorial battle began. Every piece has a capture objective." }],
  };
}

export function tutorialEnemyOrders(game) {
  const facings = ["north", "east", "south", "west"];
  return game.units
    .filter((unit) => unit.alive !== false && unit.player === "computer")
    .slice(0, 3)
    .map((unit, index) => {
      const preferred = facings[(game.round + index) % facings.length];
      return {
        kind: "rotate",
        unitId: unit.id,
        to: { x: unit.x, y: unit.y },
        path: [],
        facing: preferred === unit.facing ? facings[(facings.indexOf(preferred) + 1) % facings.length] : preferred,
        riverPenalty: false,
      };
    });
}
