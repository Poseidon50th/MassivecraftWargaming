# Osc’ird — browser wargame

This repository is a static, browser-based implementation of **War System (Osc’ird), Version 1.3**. It is designed for GitHub Pages and contains no server-side code, credentials, or secrets.

It began as a fun project to create a gamified version of Massivecraft’s wargame system.

## Current playable milestone

- Standard solo play against a browser-based tactical opponent
- 8 × 8 battle with 16 units per side
- 16 × 16 battle with 32 units per side
- Alternating player/computer deployment
- Three distinct secret orders per round, or all remaining units when fewer than three survive
- Orthogonal movement with turns, rotation orders, Initiative collisions, and allied bounce cascades
- Directional control patterns, self-control, simultaneous Control Checks, and both Cavalry special rules
- Local browser saving and continuation
- Responsive, keyboard-accessible battlefield and optional control overlay
- Scenario, rules-engine, AI-controller, and interface modules kept separate for eventual online play

## Run locally

The site uses native JavaScript modules, so serve it over HTTP rather than opening `index.html` directly:

```sh
npm run serve
```

Then open `http://localhost:4173`.

Run the engine tests with:

```sh
npm test
```

No package installation or build step is required.

## Publish with GitHub Pages

1. Put the contents of this folder at the root of a GitHub repository.
2. Push the repository’s default branch.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the default branch and `/ (root)`, then save.

Because the app uses only relative URLs, it works for both `username.github.io` repositories and project sites at `username.github.io/repository-name/`.

## Security model

Everything in a GitHub Pages repository and everything delivered to a visitor’s browser must be treated as public. This project deliberately contains:

- no passwords, API keys, access tokens, or private signing keys;
- no PHP or other server-side code;
- no claim that browser code can keep state secret from the person running that browser.

The computer chooses from the public board position only. Human orders are not passed into the AI. Eventual online multiplayer must use an authoritative backend to receive both sides’ orders privately and reveal only the resolved result.

## Rule status

The immediate “no safe orders” defeat test is implemented. The stronger rule—proving that every possible order set loses against every relevant response—is intentionally conservative in this milestone. It will never declare that form of defeat unless the engine can prove it; broad positions continue rather than producing a false loss.

Both Version 1.3 Cavalry rules are implemented. Cavalry projects 4 control onto an enemy unit without adjacent allies. During a simultaneous Control Check, Cavalry survives when every point of opposing control needed to destroy it comes from units that are themselves marked for destruction; those opposing casualties remain destroyed.

## Project map

```text
index.html                 Page structure and dialogs
styles.css                 Responsive battlefield presentation
js/app.js                  UI controller, save/resume, and phase flow
js/data/scenarios.js       Board and fixed-army definitions
js/engine/                 Deterministic game rules
js/ai/computer.js          Public-information tactical opponent
tests/engine.test.js       Rules-engine regression tests
```

The rules engine does not depend on the DOM. A future Cloudflare Worker or other authoritative match service can import the same concepts and resolve online rounds without trusting either player’s browser.
