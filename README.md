# Massivecraft's Wars

This repository is a static, browser-based implementation of **War System (Osc’ird), Version 1.3**. It is designed for GitHub Pages and contains no server-side code, credentials, or secrets.

It began as a fun project to create a gamified version of Massivecraft’s wargame system.

## Current playable milestone

Version 0.5.0 is the computer-opponent release.

- Standard solo play with four required computer difficulty choices
- Corporal (Easy): deliberately costly aggression, bad-terrain preference, and strong protection of the player's ability to continue
- Captain (Medium): direct, shallow play that favors mutually destructive exchanges
- General (Hard): strategic deployment and formation play, with greedier and less reliable decisions after Round 15
- Aristides’ Codex: deterministic preservation-first search that attempts the strongest available game
- Sanitized public-board input: the opponent never receives the player's prepared orders
- Candidate three-unit order-set generation and post-resolution simulation
- Casualty, control, support, mobility, isolation, terrain, and defeat-risk evaluation
- Bounded beam search on the 16 × 16 battlefield
- Per-battle seeded variation for Corporal, Captain, and General
- 8 × 8 battle with 16 units per side
- 16 × 16 battle with 32 units per side
- Alternating player/computer deployment
- Three distinct secret orders per round, or all remaining units when fewer than three survive
- Orthogonal movement with turns, rotation orders, Initiative collisions, and allied bounce cascades
- Directional control patterns, self-control, simultaneous Control Checks, and both Cavalry special rules
- Local browser saving and continuation
- Responsive, keyboard-accessible battlefield and optional control overlay
- Fixed-size grid tracks, visible A–P coordinates, and permanent blue/red control totals
- Blue player and red enemy unit medallions using the supplied unit emblems
- Four-direction rotation controls and a separate battle screen after field selection
- Facing controls rendered directly around selected and destination-preview pieces
- Visual control-pattern and movement-range diagrams for every unit
- Six one-unit practice lessons with immediate explanations for correct and incorrect choices
- A mistake-tolerant final tutorial battle with a 20-round cap, stronger highlights, hints, and a two-round recommended solution in which every unit contributes to a capture
- Random terrain generation or unlimited manual terrain painting before deployment
- Walls, Hills, Mud, Rivers, Roads/Bridges, and Fog with board overlays and hover/focus rules
- Field and unit guides, including the original rules link and implementation clarifications
- Scenario, rules-engine, AI-controller, and interface modules kept separate for eventual online play

## Run locally

The site uses native JavaScript modules, so serve it over HTTP rather than opening `index.html` directly:

```sh
npm run serve
```

Then open `http://localhost:4173`.

Run the engine tests with:

```sh
npm install
npm test
```

Run the complete test, production-build, and packaged-asset check with:

```sh
npm run check
```

No build step is required for the current source-root GitHub Pages deployment.

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

The computer chooses from a freshly sanitized public board position only. Human orders, selections, interface state, hints, and private log text are not copied into the AI search position. Eventual online multiplayer must use an authoritative backend to receive both sides’ orders privately and reveal only the resolved result.

Aristides’ Codex is intentionally deterministic and searches the strongest predicted player replies available within the browser's bounded search. “Attempts a perfect game” describes its design objective; simultaneous hidden orders and finite browser search mean it does not receive foreknowledge of the player's current orders.

## Rule status

The immediate “no safe orders” defeat test is implemented. The stronger rule—proving that every possible order set loses against every relevant response—is invoked every round at every army size. Order sets are generated lazily so a surviving exact outcome can end the proof immediately; a genuine forced defeat still examines the complete relevant order-and-response space.

Self-control is always exactly the unit’s printed strength. Hill and Fog alter control projected to other squares, not the value a unit contributes to its own occupied square.

Both Version 1.3 Cavalry rules are implemented. Cavalry projects 4 control onto an enemy unit without adjacent allies. During a simultaneous Control Check, Cavalry survives when every point of opposing control needed to destroy it comes from units that are themselves marked for destruction; those opposing casualties remain destroyed.

## Project map

```text
index.html                 Page structure and dialogs
styles.css                 Responsive battlefield and fixed-grid presentation
assets/units/              Supplied Swords, Spears, Axes, Cavalry, Musket, and Artillery emblems
js/app.js                  One-line application entry point
js/controllers/interface-controller.js   Rendering and browser interaction
js/controllers/tutorial-controller.js    Lessons, coaching, and hints
js/controllers/deployment-controller.js  Terrain and army placement
js/controllers/persistence-controller.js Save migration and validation
js/controllers/battle-controller.js      Orders and cancellable round resolution
js/data/scenarios.js       Board and fixed-army definitions
js/data/tutorial.js        Unit practices, final tutorial setup, hints, and recommended solution
js/engine/terrain.js       Random/manual terrain placement and starting-row protection
js/engine/                 Deterministic game rules
js/ai/computer.js          Difficulty-aware deployment and turn-search coordinator
js/ai/public-board.js      Sanitized public-information input
js/ai/candidate-orders.js  Order options, complete order sets, and 16 × 16 beam search
js/ai/evaluation.js        Casualty, control, support, mobility, isolation, terrain, and risk scoring
js/ai/difficulties.js      Four opponent profiles and search budgets
js/ai/random.js            Reproducible per-battle seeded variation
tests/engine.test.js       Rules-engine regression tests
tests/interface.test.js    DOM interaction tests using the real page controls
tests/persistence.test.js  Save migration and corruption tests
tests/verify-build.mjs     GitHub Pages link and image-package verification
.github/workflows/ci.yml   Automated test and production-build checks
```

The rules engine does not depend on the DOM. A future Cloudflare Worker or other authoritative match service can import the same concepts and resolve online rounds without trusting either player’s browser.
