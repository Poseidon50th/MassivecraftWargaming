import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
]);

test("the battlefield locks both grid axes and clips tile contents", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(var\(--board-size\),\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(var\(--board-size\),\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.square\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
});

test("the interface exposes coordinates, permanent control totals, and directional rotation", () => {
  assert.match(app, /coordinate\.textContent/);
  assert.match(app, /control-score/);
  assert.match(html, /data-facing="north"/);
  assert.match(html, /data-facing="east"/);
  assert.match(html, /data-facing="south"/);
  assert.match(html, /data-facing="west"/);
});

test("the requested title, guides, rules source, and unit emblems are present", () => {
  assert.match(html, /Massivecraft's Wars/);
  assert.doesNotMatch(html, /Every formation casts a shadow|Shape the field until nowhere safe remains|A game of position and consequence/);
  assert.match(html, /docs\.google\.com\/document\/d\/1wD8w1f0rVj6PPYgRTapnKx00AF5OtEVXM7rRA3fcYAg/);
  for (const unit of ["swords", "spears", "axes", "cavalry", "muskets", "artillery"]) {
    assert.match(html + app, new RegExp(`assets/units/${unit}\\.png`));
  }
});
