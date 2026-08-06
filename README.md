# Massivecraft's Wars

This repository is a browser-based implementation of **War System (Osc’ird), Version 1.3**, or at least as faithful as I can get it to. The main site remains a static GitHub Pages game. Online head-to-head rooms use the separately deployed Cloudflare Worker included in `multiplayer-server/`.

## Current playable milestone

Version 0.8.0 adds spectator invitations, private custom-army selection, doctrine-specific computer rosters, and a formation-aware tactical overhaul without removing the certified rules, tutorial, terrain, saving, or quota-hardened multiplayer work from earlier releases.

- Standard solo play with Corporal, Captain, General, and Aristides’ Codex
- Guided one-unit lessons and final tutorial battle
- 8 × 8 and 16 × 16 battlefields
- Random or unlimited manual terrain placement
- Walls, Hills, Mud, Rivers, Roads/Bridges, and Fog
- Eight-direction facing for Spears, Axes, and Muskets
- Symmetrical Artillery projection and simultaneous Control Checks
- Detailed movement, rotation, casualty, and remaining-strength dispatches
- Local single-player saving and migration
- Private head-to-head rooms with unlisted invitation links
- A separate reusable spectator link that cannot claim either player seat
- Read-only live spectator views throughout an online match
- Guest display names without accounts
- Host battlefield choice followed by mandatory guest approval
- Private pre-deployment army selection for both online players
- Any distribution up to 16 units on 8 × 8 or 32 units on 16 × 16, with at most two Artillery
- Alternating online deployment
- Untimed online Orders Phases
- Server-held secret orders and authoritative simultaneous resolution
- Host and guest each see their own army at the bottom
- Refresh/reconnect support and 30-day inactivity expiry
- Order withdrawal before the opponent submits
- Resignation and clear victory reporting
- Gameplay actions and synchronization over hibernatable WebSockets
- Exponential reconnection, focus synchronization, and a manual Reconnect button without continuous polling
- One persistent room write per accepted action and one expiration alarm per room lifecycle
- Room-creation admission limits, per-room action throttling, invalid-invitation throttling, and small message limits
- New-room capacity protection so existing matches retain priority
- Formation-aware computer planning: screens, mutual support, threat response, cohesion, focus pressure, and protected advances
- Doctrine-specific AI roster selection adapted to terrain and the player’s force
- A deeper, more aggressive Aristides’ Codex search that still rejects unsupported sacrifices

## Online architecture

GitHub Pages serves only public HTML, CSS, JavaScript, and images. It cannot keep two players’ orders secret. The Cloudflare Worker therefore routes each room to one SQLite-backed Durable Object. That single room object:

1. recognizes the host, guest, and read-only spectators through separate high-entropy invitation tokens;
2. stores only token hashes;
3. validates battlefield proposals, terrain, deployments, facing, movement, and complete order sets;
4. keeps submitted armies private until both are locked and submitted orders private until resolution;
5. reconstructs trusted movement paths and River penalties instead of trusting the browser;
6. resolves both sides through the same deterministic engine used by single-player;
7. stores the resolved public board and structured round dispatches for reconnection; and
8. accepts idempotent action identifiers so a duplicated live message cannot repeat a move;
9. protects the free daily allowance by pausing new-room creation before active matches lose capacity; and
10. deletes the room after 30 days without a player action.

Start with [MULTIPLAYER_SETUP_GUIDE.md](MULTIPLAYER_SETUP_GUIDE.md). The shorter existing-site path is in [V0.8.0_UPGRADE_GUIDE.md](V0.8.0_UPGRADE_GUIDE.md), the complete change list is in [RELEASE_NOTES_v0.8.0.md](RELEASE_NOTES_v0.8.0.md), and implementation details are in [MULTIPLAYER_ARCHITECTURE.md](MULTIPLAYER_ARCHITECTURE.md).

## Run the static game locally

The site uses native JavaScript modules, so serve it over HTTP rather than opening `index.html` directly:

```sh
npm install
npm run serve
```

Then open `http://localhost:4173`.

Run the ordinary rules, AI, persistence, interface, and multiplayer protocol tests with:

```sh
npm test
```

Run the eight complete AI certification battles with:

```sh
npm run test:certification
```

Run a live three-client host/guest/spectator WebSocket deployment and resolved round on both board sizes with:

```sh
npm run test:multiplayer-live
```

Run the complete static-site test, production build, and packaged-asset check with:

```sh
npm run check
```

## Run the multiplayer server locally

```sh
cd multiplayer-server
npm install
npm run dev
```

The local Worker normally starts at `http://localhost:8787`. For ordinary development, temporarily use that address in `js/online/config.js`, then restore the deployed Worker address before publishing.

Validate the multiplayer room core with:

```sh
npm test
```

Validate a deployable Worker bundle with:

```sh
npm run check
```

## Publish with GitHub Pages

1. Deploy `multiplayer-server/` by following `MULTIPLAYER_SETUP_GUIDE.md`.
2. Paste the resulting `https://…workers.dev` address into `js/online/config.js`.
3. Put the contents of this folder at the root of the GitHub repository.
4. Preserve `LICENSE`.
5. Push the default branch.
6. In **Settings → Pages**, choose **Deploy from a branch**.
7. Select the default branch and `/ (root)`, then save.

Because the web app uses relative asset links, it works at the existing GitHub project-page address. `multiplayer.html` calls the separately configured Worker address.

## Security model

Everything in GitHub Pages and the public repository is public. The repository contains no Cloudflare password, API token, secret key, or player authentication secret. Wrangler’s login stays on the deployer’s computer and is not written into this project.

Room invitations are capability links. Anyone possessing the opponent invitation can claim that one guest seat, so players should send it privately. The separate spectator invitation grants read-only access and may be shared with viewers. Tokens are placed after the URL’s `#`, preventing the browser from sending them to GitHub Pages in the page request. Each browser retains its own token locally for reconnection; the server stores only SHA-256 hashes.

The server never accepts client-supplied path or terrain effects at face value. It re-finds the unit, rebuilds movement from the current board, recalculates River penalties, validates facing and destinations, and rejects incomplete or stale order sets. During army selection, opponents and spectators see only whether a force is locked. During Orders, public snapshots contain readiness only—not submitted orders.

The computer opponent also receives a detached public board without the player’s prepared orders. Each difficulty selects a legal doctrine-specific roster and evaluates formation cohesion, mutual support, screened ranged units, exposed advances, focused pressure, threat response, terrain, and predicted replies. Aristides’ Codex is deterministic and searches the strongest predicted replies available within its bounded browser budget; it does not receive foreknowledge of current player orders.

## Rule status

The immediate “no safe orders” defeat test and the stronger exact forced-defeat check run every round. Self-control remains equal to printed Strength; Hill and Fog alter only projected control. Both Cavalry rules, all terrain interactions, diagonal facing, collision Initiative, allied bounce cascades, and Artillery restrictions remain shared by solo, tutorial, server tests, and online resolution.

## Project map

```text
index.html                              Single-player and tutorial entry
multiplayer.html                        Private-room entry, lobby, editor, and online battle
styles.css                              Shared battlefield presentation
multiplayer.css                         Multiplayer lobby and room presentation
assets/                                 Supplied unit and terrain images
js/controllers/                         Single-player interface, battle, deployment, saves, tutorial
js/data/                                Scenarios, army validation, and tutorial data
js/ui/                                  Reusable custom-army interface
js/engine/                              Shared deterministic rules engine
js/ai/                                  Four computer-opponent personalities and search
js/online/config.js                     Deployed multiplayer Worker address
js/online/api-client.js                 Room creation, live WebSocket actions, and reconnection
js/online/perspective.js                Host/guest/spectator board and dispatch perspectives
js/online/online-controller.js          Lobby, field editor, army muster, spectator, deployment, and orders UI
multiplayer-server/src/room-state.js    Authoritative room state machine and validation
multiplayer-server/src/quota-policy.js  Conservative new-room admission policy
multiplayer-server/src/worker.js        Cloudflare Worker and Durable Object transport/storage
multiplayer-server/wrangler.jsonc       Worker binding, SQLite migration, and allowed origins
multiplayer-server/tests/               Room, secrecy, perspective, and resolution tests
tests/                                  Existing engine, interface, AI, saves, and build checks
.github/workflows/ci.yml                Automated static-site and multiplayer-server verification
```
