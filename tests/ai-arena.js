import { runCertificationMatch } from "./helpers/match-simulator.js";
import { computeControl } from "../js/engine/control.js";
import { activeUnits } from "../js/engine/model.js";
import { FACING_DIRECTIONS, PLAYERS, TERRAIN } from "../js/engine/constants.js";

const CASES = [
  ["corporal", "skirmish", 1101], ["corporal", "battle", 1102],
  ["captain", "skirmish", 2201], ["captain", "battle", 2202],
  ["general", "skirmish", 3301], ["general", "battle", 3302],
  ["codex", "skirmish", 4401], ["codex", "battle", 4402],
];
const NAMES = { corporal: "Corporal · Easy", captain: "Captain · Medium", general: "General · Hard", codex: "Aristides’ Codex · Expert" };
const UNIT_ASSETS = { sword: "swords", spear: "spears", axe: "axes", cavalry: "cavalry", musket: "muskets", artillery: "artillery" };
const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function renderBoard(game) {
  const board = $("#board");
  const control = computeControl(game);
  board.style.setProperty("--size", game.size);
  board.replaceChildren();
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const square = document.createElement("div");
      square.className = "square";
      const terrain = game.terrain[y][x];
      if (TERRAIN[terrain]?.asset) {
        const image = document.createElement("img");
        image.className = "terrain";
        image.src = `../${TERRAIN[terrain].asset}`;
        image.alt = TERRAIN[terrain].name;
        square.append(image);
      }
      square.insertAdjacentHTML("beforeend", `<span class="coord">${String.fromCharCode(65 + x)}${game.size - y}</span>`);
      const unit = game.units.find((candidate) => candidate.alive !== false && candidate.x === x && candidate.y === y);
      if (unit) {
        const token = document.createElement("span");
        token.className = `unit ${unit.player}`;
        token.title = `${unit.player} ${unit.type}, facing ${unit.facing}, on ${TERRAIN[terrain].name}`;
        token.innerHTML = `<span class="facing">${FACING_DIRECTIONS[unit.facing].glyph}</span><img src="../assets/units/${UNIT_ASSETS[unit.type]}.png" alt="${unit.type}" />`;
        square.append(token);
      }
      square.insertAdjacentHTML("beforeend", `<span class="control"><b>${control[y][x].human}</b>/<b>${control[y][x].computer}</b></span>`);
      board.append(square);
    }
  }
}

function renderState(game, computerPlan = null) {
  renderBoard(game);
  $("#round").textContent = game.round;
  $("#friendly").textContent = activeUnits(game, PLAYERS.HUMAN).length;
  $("#enemy").textContent = activeUnits(game, PLAYERS.COMPUTER).length;
  $("#thinking").textContent = computerPlan ? Math.round(computerPlan.diagnostics.elapsedMs) : "—";
  const reports = game.log.filter((entry) => entry.round === game.round - 1).slice(0, 3);
  $("#dispatch").innerHTML = reports.length
    ? reports.map((entry) => `<p>${entry.text}</p>`).join("")
    : "<p>Armies deployed. The first secret orders are being prepared.</p>";
}

function appendResult(metrics, passed, error = null) {
  const item = document.createElement("div");
  item.className = `result ${passed ? "pass" : "fail"}`;
  item.innerHTML = passed
    ? `<div><strong>${NAMES[metrics.difficulty]} · ${metrics.size}×${metrics.size}</strong><br><span>${metrics.winner} victory · ${metrics.rounds} rounds · moved ${metrics.movedCount}/${metrics.mobileComputerCount} mobile units</span></div><b>PASS</b>`
    : `<div><strong>${metrics?.difficulty ?? "Match"}</strong><br><span>${error.message}</span></div><b>FAIL</b>`;
  $("#results").append(item);
}

async function runAll() {
  const button = $("#start");
  button.disabled = true;
  button.textContent = "Certification running…";
  let passed = 0;
  for (let index = 0; index < CASES.length; index += 1) {
    const [difficulty, scenarioId, seed] = CASES[index];
    const size = scenarioId === "battle" ? 16 : 8;
    $("#match-title").textContent = `${NAMES[difficulty]} · ${size}×${size}`;
    $("#match-state").textContent = `${index + 1} / ${CASES.length}`;
    try {
      const { metrics } = await runCertificationMatch({
        difficulty,
        scenarioId,
        seed,
        onStart: async ({ game }) => { renderState(game); await wait(260); },
        onRound: async ({ game, computerPlan, result }) => {
          renderState(game, computerPlan);
          $("#match-state").textContent = result ? "Battle concluded" : `Round ${game.round} planning`;
          await wait(size === 8 ? 140 : 85);
        },
      });
      const complete = Boolean(metrics.winner) && metrics.movedCount > 0 && metrics.advancedCount > 0;
      appendResult(metrics, complete);
      if (complete) passed += 1;
    } catch (error) {
      appendResult({ difficulty }, false, error);
    }
    await wait(400);
  }
  $("#match-title").textContent = passed === CASES.length ? "Certification complete" : "Certification found failures";
  $("#match-state").textContent = `${passed} / ${CASES.length} passed`;
  button.textContent = passed === CASES.length ? "All games passed" : "Run again";
  button.disabled = passed === CASES.length;
}

$("#start").addEventListener("click", runAll);
