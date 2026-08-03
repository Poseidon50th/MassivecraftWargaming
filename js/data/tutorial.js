export const TUTORIAL_UNITS = Object.freeze([
  { id: "human-cavalry-1", player: "human", type: "cavalry", x: 0, y: 7, facing: "north", alive: true },
  { id: "human-musket-1", player: "human", type: "musket", x: 2, y: 7, facing: "south", alive: true },
  { id: "human-axe-1", player: "human", type: "axe", x: 3, y: 5, facing: "south", alive: true },
  { id: "human-sword-1", player: "human", type: "sword", x: 5, y: 6, facing: "north", alive: true },
  { id: "human-spear-1", player: "human", type: "spear", x: 6, y: 6, facing: "north", alive: true },
  { id: "human-artillery-1", player: "human", type: "artillery", x: 7, y: 7, facing: "south", alive: true },
  { id: "computer-sword-1", player: "computer", type: "sword", x: 0, y: 4, facing: "east", alive: true },
  { id: "computer-spear-1", player: "computer", type: "spear", x: 3, y: 3, facing: "east", alive: true },
  { id: "computer-cavalry-1", player: "computer", type: "cavalry", x: 6, y: 2, facing: "south", alive: true },
]);

export const TUTORIAL_PLANS = Object.freeze({
  1: [
    {
      unitId: "human-cavalry-1",
      kind: "move",
      to: { x: 0, y: 5 },
      facing: "north",
      summary: "Move Cavalry from A1 to A3 and face north.",
      lesson: "Cavalry reaches the isolated Swords quickly. Its 4-control isolation bonus defeats the Swords, while its survival rule protects it from the Swords’ simultaneous counter-control.",
    },
    {
      unitId: "human-sword-1",
      kind: "move",
      to: { x: 5, y: 4 },
      facing: "north",
      summary: "Move Swords from F2 to F4 and face north.",
      lesson: "Swords establish a four-way control anchor and prepare to support the Spear advance.",
    },
    {
      unitId: "human-spear-1",
      kind: "move",
      to: { x: 6, y: 5 },
      facing: "north",
      summary: "Move Spears from G2 to G3 and face north.",
      lesson: "Spears advance behind the Swords. Their forward fan now reinforces the formation instead of exposing them alone.",
    },
  ],
  2: [
    {
      unitId: "human-axe-1",
      kind: "move",
      to: { x: 3, y: 4 },
      facing: "north",
      summary: "Move Axes from D3 to D4 and face north.",
      lesson: "Axes put 5 control directly into D5, overwhelming the enemy Spears’ self-control of 3.",
    },
    {
      unitId: "human-spear-1",
      kind: "move",
      to: { x: 6, y: 4 },
      facing: "north",
      summary: "Move Spears from G3 to G4 and face north.",
      lesson: "The Spears continue toward the last target while remaining beside friendly support.",
    },
    {
      unitId: "human-artillery-1",
      kind: "rotate",
      to: { x: 7, y: 7 },
      facing: "east",
      summary: "Rotate Artillery on H1 to face east.",
      lesson: "Artillery cannot move, but changing its facing is a complete order. Here it demonstrates rotation without prematurely striking the final target.",
    },
  ],
  3: [
    {
      unitId: "human-spear-1",
      kind: "move",
      to: { x: 6, y: 3 },
      facing: "north",
      summary: "Move Spears from G4 to G5 and face north.",
      lesson: "The Spear’s 3 control defeats the Cavalry’s self-control of 2. Nearby Swords prevent the Cavalry from treating the Spears as isolated.",
    },
    {
      unitId: "human-musket-1",
      kind: "move",
      to: { x: 2, y: 6 },
      facing: "north",
      summary: "Move Muskets from C1 to C2 and face north.",
      lesson: "Muskets create a long 3–2–1 control lane. This supporting order also demonstrates choosing a moved unit’s final facing.",
    },
    {
      unitId: "human-cavalry-1",
      kind: "move",
      to: { x: 1, y: 5 },
      facing: "east",
      summary: "Move Cavalry from A3 to B3 and face east.",
      lesson: "Cavalry repositions toward the center so it has useful future mobility instead of remaining stranded on the edge.",
    },
  ],
});

export const TUTORIAL_ROUND_COPY = Object.freeze({
  1: {
    title: "Round 1 · Isolate and support",
    coach: "Select the highlighted Cavalry, Swords, and Spears. Choose each destination, then click a facing arrow on the destination preview to confirm the order.",
    result: "Excellent. The isolated enemy Swords were destroyed. Your Cavalry survived because the Swords that supplied the defeating control were also destroyed in the same Control Check.",
  },
  2: {
    title: "Round 2 · Aim narrow control",
    coach: "Use the Axe’s concentrated 5 control, continue the Spear advance, and practice rotating stationary Artillery.",
    result: "The Axes overwhelmed the enemy Spears on D5. Notice that a narrow pattern can be stronger than broad control when it is aimed correctly.",
  },
  3: {
    title: "Round 3 · Close the field",
    coach: "Finish the supported Spear advance, turn the Muskets north, and move the Cavalry toward the center. This removes the final safe enemy position.",
    result: "The final Cavalry was destroyed on enemy-controlled ground. You shaped the map until the opposing army had nowhere safe left to stand.",
  },
});

export const TUTORIAL_LESSONS = Object.freeze([
  {
    kicker: "Tutorial · 1 of 11",
    title: "Welcome to the field",
    html: "<p>This guided lesson explains the board, every unit, orders, control, special rules, and victory. It ends with a three-round battle that uses the real rules engine.</p><p>The <b>Field Guide</b> holds the rules and implementation clarifications. The <b>Unit Guide</b> holds visual control and movement diagrams. During battle, the command panel records orders, army strength, and dispatches.</p>",
  },
  {
    kicker: "Tutorial · 2 of 11",
    title: "Read every square",
    html: "<p>Coordinates identify squares: letters run left to right and numbers run from your side upward. The bottom-right badge on every tile reads <b>blue control / red control</b>.</p><p>Blue shading means your total is greater, silver means tied, and red means the enemy total is greater. The numbers remain visible even when control shading is hidden.</p>",
  },
  {
    kicker: "Tutorial · 3 of 11",
    title: "How to win",
    html: "<p>At the end of movement, the Control Check totals every surviving unit’s projection. A unit on enemy-controlled ground is destroyed; a tie is contested and safe.</p><p>You win by leaving the opponent unable to issue the required safe moves. Rotating or holding position does not count as a safe move.</p>",
  },
  { kicker: "Tutorial · 4 of 11", title: "Swords · the anchor", unitType: "sword" },
  { kicker: "Tutorial · 5 of 11", title: "Spears · the forward fan", unitType: "spear" },
  { kicker: "Tutorial · 6 of 11", title: "Axes · concentrated force", unitType: "axe" },
  { kicker: "Tutorial · 7 of 11", title: "Cavalry · isolation and speed", unitType: "cavalry" },
  { kicker: "Tutorial · 8 of 11", title: "Muskets · a declining line", unitType: "musket" },
  { kicker: "Tutorial · 9 of 11", title: "Artillery · distant pressure", unitType: "artillery" },
  {
    kicker: "Tutorial · 10 of 11",
    title: "Give and resolve orders",
    html: "<p>Select a blue unit to reveal legal destinations. The unit cannot remain on its starting square as a movement order. After choosing a destination, click one of the four arrows around the preview piece to set its final facing and confirm the order.</p><p>You normally order three distinct units. Both armies reveal together. Higher Initiative wins a shared destination; a tie bounces both units home.</p>",
  },
  {
    kicker: "Tutorial · 11 of 11",
    title: "Your three-round exercise",
    html: "<p>You command all six unit types against three exposed enemies. Each round teaches one tactical idea. Legal but poor choices trigger an explanation, while the <b>Show hint</b> button gives exact orders whenever you are stuck.</p><p>Complete the prescribed three orders in each round to win on Round 3.</p>",
    startsBattle: true,
  },
]);

export function buildTutorialGame() {
  return {
    version: 1,
    scenarioId: "tutorial",
    size: 8,
    deploymentRows: 0,
    mode: "tutorial",
    phase: "orders",
    round: 1,
    terrain: Array.from({ length: 8 }, () => Array(8).fill("plain")),
    units: structuredClone(TUTORIAL_UNITS),
    reserves: { human: [], computer: [] },
    orders: { human: [], computer: [] },
    selectedUnitId: null,
    winner: null,
    defeatReason: null,
    tutorial: { hintVisible: false },
    log: [{ round: 1, text: "The guided three-round battle began." }],
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
