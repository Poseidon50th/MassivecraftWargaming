import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";

import { buildTutorialGame } from "../js/data/tutorial.js";
import { SAVE_KEY } from "../js/controllers/persistence-controller.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const window = new Window({ url: "https://example.test/MassivecraftWargaming/" });
window.document.write(html);
window.document.close();
window.scrollTo = () => {};
window.confirm = () => true;

Object.assign(globalThis, {
  window,
  document: window.document,
  localStorage: window.localStorage,
  HTMLElement: window.HTMLElement,
  HTMLDialogElement: window.HTMLDialogElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  FormData: window.FormData,
});

const roundThreeSave = buildTutorialGame();
roundThreeSave.round = 3;
roundThreeSave.tutorial.hintVisible = false;
window.localStorage.setItem(SAVE_KEY, JSON.stringify(roundThreeSave));

await import("../js/app.js");

function click(selector) {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected ${selector} to exist`);
  element.click();
  return element;
}

function boardSquare(x, y) {
  const board = document.querySelector("#game-board");
  assert.ok(board);
  return board.children[y * 8 + x];
}

function giveMove(from, to, facing) {
  boardSquare(from.x, from.y).click();
  assert.ok(boardSquare(to.x, to.y).classList.contains("legal-move"), "destination should be highlighted after selecting a unit");
  boardSquare(to.x, to.y).click();
  const facingButton = boardSquare(to.x, to.y).querySelector(`.board-facing-choice.${facing}`);
  assert.ok(facingButton, "a moved piece should display its four facing choices on the board");
  facingButton.click();
}

test("round-three hints, tutorial lessons, battlefield orders, and cancelled resolution work through real clicks", async () => {
  click("#continue-button");
  assert.equal(document.body.dataset.screen, "battle");
  const hint = document.querySelector("#tutorial-hint-button");
  assert.doesNotThrow(() => hint.click(), "showing a Round 3+ hint must not read missing Round 1/2 copy");
  assert.match(document.querySelector("#tutorial-coach-text").textContent, /prepared two-round line|Every surviving unit/);
  assert.doesNotThrow(() => hint.click(), "hiding a Round 3+ hint must use fallback coaching");
  assert.match(document.querySelector("#tutorial-coach-text").textContent, /prepared line has changed/i);

  click("#new-battle-button");
  assert.equal(document.body.dataset.screen, "welcome");
  assert.equal(document.querySelector("#game").hidden, true);

  click("#tutorial-button");
  assert.equal(document.querySelector("#tutorial-dialog").open, true);
  assert.match(document.querySelector("#tutorial-step-title").textContent, /Welcome/);

  for (let step = 0; step < 3; step += 1) click("#tutorial-next-button");
  assert.match(document.querySelector("#tutorial-step-title").textContent, /Swords/);
  const practiceChoices = document.querySelectorAll(".practice-choice");
  practiceChoices[1].click();
  assert.match(document.querySelector(".practice-feedback").textContent, /Try again/);
  practiceChoices[0].click();
  assert.match(document.querySelector(".practice-feedback").textContent, /Right move/);

  for (let step = 0; step < 7; step += 1) click("#tutorial-next-button");
  assert.match(document.querySelector("#tutorial-step-title").textContent, /Put the army together/);
  click("#tutorial-next-button");
  assert.equal(document.body.dataset.screen, "battle");
  assert.equal(document.querySelectorAll("#game-board .square").length, 64);

  giveMove({ x: 0, y: 7 }, { x: 0, y: 6 }, "north");
  giveMove({ x: 2, y: 7 }, { x: 2, y: 6 }, "north");
  giveMove({ x: 4, y: 7 }, { x: 4, y: 6 }, "north");
  assert.equal(document.querySelectorAll("#orders-list li").length, 3);
  assert.match(document.querySelector("#order-count").textContent, /3 \/ 3/);

  click("#lock-orders-button");
  assert.match(document.querySelector("#phase-heading").textContent, /Orders revealed/);
  click("#new-battle-button");
  await new Promise((resolve) => window.setTimeout(resolve, 550));
  assert.equal(document.body.dataset.screen, "welcome", "a stale round timer must not reopen or mutate the abandoned battle");
  assert.equal(document.querySelector("#game").hidden, true);
  assert.equal(window.localStorage.getItem(SAVE_KEY), null);
});

test("deployment remains locked until a difficulty is chosen and Codex requires confirmation", () => {
  const begin = document.querySelector("#begin-deployment-button");
  assert.equal(begin.disabled, true);

  click('input[name="difficulty"][value="corporal"]');
  assert.equal(begin.disabled, false);
  assert.match(document.querySelector("#difficulty-required-note").textContent, /Corporal · Easy/);

  click('input[name="difficulty"][value="codex"]');
  const warning = document.querySelector("#codex-warning-dialog");
  assert.equal(warning.open, true);
  assert.equal(begin.disabled, true, "Codex is not selected until its warning is accepted");
  assert.match(
    warning.textContent,
    /equivalent of facing a younger version of Aristides Mageia himself/,
  );
  assert.match(warning.textContent, /Prizes not included\.\.\.for now\./);

  click("#codex-cancel-button");
  assert.equal(warning.open, false);
  assert.equal(document.querySelector('input[name="difficulty"]:checked'), null);
  assert.equal(begin.disabled, true);

  click('input[name="difficulty"][value="codex"]');
  click("#codex-accept-button");
  assert.equal(warning.open, false);
  assert.equal(begin.disabled, false);
  assert.match(document.querySelector("#difficulty-required-note").textContent, /Aristides’ Codex selected/);
});
