# Massivecraft’s Wars v0.8.0

## New play options

- Hosts receive two different private capability links: one opponent invitation and one read-only spectator invitation.
- A spectator must press **Activate spectator mode** before connecting.
- Multiple spectators may watch the same room in the host’s board orientation.
- Spectators cannot approve fields, choose or place units, prepare or submit orders, withdraw orders, resign, or call any other room action.
- Player army distributions and uncommitted orders remain private. Spectators see armies only after deployment begins and orders only through the resolved round.

## Custom armies

- The 8 × 8 battlefield permits any distribution containing 1–16 units.
- The 16 × 16 battlefield permits any distribution containing 1–32 units.
- Every army is limited to two Artillery.
- The same rules are enforced by the single-player interface and the authoritative multiplayer server.
- Multiplayer opponents may choose different army sizes; alternating deployment continues until both reserves are empty.
- Every computer opponent chooses a full legal army suited to its doctrine, terrain, and known opposing distribution.

## Computer tactics

- All difficulties now evaluate mutual support, exposed advances, isolated vanguards, ranged-unit screens, formation fragmentation, concentrated pressure, threatened-unit responses, and forward progress.
- Deployment favors complementary neighboring unit types, protected ranged units, useful facings, and coherent lines.
- Corporal uses a fast raiding column; Captain uses a balanced battle line; General uses layered combined arms; Aristides’ Codex uses an adaptive formation.
- Aristides’ Codex is more aggressive, searches more candidate moves and replies, strongly rejects unsupported sacrifices, and combines worst-response and average-response scoring for its deepest practical turn search.
- Computer deployments always complete even when a chosen army contains two Artillery; separating those pieces remains a preference rather than an illegal restriction.

## Multiplayer protocol

- New v0.8.0 rooms use protocol 3 and insert a private army-muster phase after battlefield approval.
- The Worker creates a separate hashed spectator capability.
- Spectator snapshots are neutral and omit private rosters and pending orders.
- The quota-hardened WebSocket transport, reconnect behavior, room-creation protection, duplicate-action protection, and 30-day room expiry remain in place.
- Cached v0.7.2 clients may continue creating legacy standard-roster rooms during the Worker-first upgrade window.

## Deployment order

1. Deploy the v0.8.0 Worker first.
2. Confirm `/api/health` reports protocol 3, spectators, and custom armies.
3. Upload the v0.8.0 website.
4. Test with a host, guest, and spectator in three independent browser windows.

Use `V0.8.0_UPGRADE_GUIDE.md` for an existing v0.7.2 installation or `MULTIPLAYER_SETUP_GUIDE.md` for the complete fresh-install walkthrough.

## Release certification

- 71 ordinary rules, interface, persistence, AI, browser-regression, and protocol checks passed.
- 18 dedicated multiplayer-server checks passed.
- All eight complete AI battles passed: every difficulty on both board sizes.
- Live host, guest, and spectator sessions passed on 8 × 8 and 16 × 16, including 96 total placements, private armies, secret orders, and simultaneous Round 1 resolution.
- The production build contains both game pages, all twelve supplied images, documentation, and project-relative GitHub Pages links.
- A browser pass verified the single-player builder, the separate invitation choices, explicit spectator activation, private muster screen, and neutral spectator labels without application errors.
- The Worker source bundled successfully as a single 70.0 KB ES module. GitHub Actions performs the final Wrangler deployment-shaped dry run after upload.
