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
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
assert.match(html, /(?:src|href)="\.\/assets\//, "built links must be relative for a GitHub project page");
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "built links must not be root-relative");
console.log(`Verified ${imagePaths.length} packaged images and project-relative build links.`);
