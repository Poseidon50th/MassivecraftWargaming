import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const imagePaths = [
  "units/artillery.png",
  "units/axes.png",
  "units/cavalry.png",
  "units/muskets.png",
  "units/spears.png",
  "units/swords.png",
  "terrain/fog.png",
  "terrain/hill.png",
  "terrain/mud.png",
  "terrain/river.png",
  "terrain/road.png",
  "terrain/wall.png",
];

await Promise.all(imagePaths.map((path) => access(new URL(`../dist/assets/${path}`, import.meta.url))));
await Promise.all([
  "README.md",
  "MULTIPLAYER_SETUP_GUIDE.md",
  "MULTIPLAYER_ARCHITECTURE.md",
  "V0.8.0_UPGRADE_GUIDE.md",
  "RELEASE_NOTES_v0.8.0.md",
  "LICENSE",
].map((path) => access(new URL(`../dist/${path}`, import.meta.url))));
const [singlePlayerHtml, multiplayerHtml] = await Promise.all([
  readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  readFile(new URL("../dist/multiplayer.html", import.meta.url), "utf8"),
]);
for (const html of [singlePlayerHtml, multiplayerHtml]) {
  assert.match(html, /(?:src|href)="\.\/assets\//, "built links must be relative for a GitHub project page");
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "built links must not be root-relative");
}
assert.match(multiplayerHtml, /Private head-to-head battle/, "the multiplayer entry page must be included in dist");
assert.match(singlePlayerHtml, /v0\.8\.0/, "the built single-player page must identify v0.8.0");
assert.match(multiplayerHtml, /v0\.8\.0/, "the built multiplayer page must identify v0.8.0");
assert.match(multiplayerHtml, /Activate spectator mode/, "the built multiplayer page must include spectator entry");
assert.match(multiplayerHtml, /online-army-builder/, "the built multiplayer page must include custom army selection");
assert.match(multiplayerHtml, /data-reconnect/, "the built multiplayer page must include manual reconnection controls");
console.log(`Verified ${imagePaths.length} packaged images, both game pages, documentation, license, and project-relative build links.`);
