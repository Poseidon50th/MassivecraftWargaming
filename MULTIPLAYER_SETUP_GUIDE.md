# Massivecraft’s Wars v0.8.0 Multiplayer Setup

This guide connects the static GitHub Pages game to its Cloudflare multiplayer server. It is deliberately literal. Complete each numbered step in order.

## The two pieces

The game has two separate parts:

1. **GitHub Pages website:** the pages, rules, computer opponents, and images people open.
2. **Cloudflare Worker:** the private rooms, player seats, spectator access, secret army choices, secret orders, reconnect state, and authoritative round resolution.

The website cannot provide private multiplayer by itself. The Worker must be deployed first.

## If v0.7.2 is already online

Use the `massivecraft-wars-v0.8.0-upgrade.zip` package. It deliberately omits `js/online/config.js`, so uploading it cannot erase the Worker address already stored in your GitHub repository.

The safe order is:

1. Deploy the v0.8.0 Worker over the existing Worker.
2. Verify that its health page reports protocol 3.
3. Upload the v0.8.0 website files.
4. Test one host, one guest, and one spectator.

The upgraded Worker recognizes cached v0.7.2 pages. During the short deployment gap, rooms created by an old cached page use the older standard-roster flow. Rooms created by v0.8.0 use private army selection.

## Part 1 — Make safe working copies

1. Download the v0.8.0 ZIP.
2. Right-click it in Windows File Explorer.
3. Choose **Extract All**.
4. Open the extracted folder.
5. Make two copies of that folder.
6. Name one copy `v0.8.0 SERVER COPY`.
7. Name the other copy `v0.8.0 WEBSITE COPY`.

Run Cloudflare commands only inside **SERVER COPY**. Upload only **WEBSITE COPY** to GitHub. This prevents installed server dependencies from being uploaded accidentally.

## Part 2 — Install Node.js once

Skip this part if `node --version` and `npm --version` already print version numbers.

1. Open `https://nodejs.org/en/download`.
2. Download the Windows **LTS** installer.
3. Run the installer.
4. Keep the ordinary recommended selections.
5. Finish the installation.
6. Restart Windows if the installer asks.
7. Open PowerShell.
8. Type `node --version` and press Enter.
9. Type `npm --version` and press Enter.

Both commands must print a version number. If Windows says a command is not recognized, close PowerShell, reopen it, and try again.

## Part 3 — Sign in to Cloudflare

1. Open `https://dash.cloudflare.com/`.
2. Sign in to the same Cloudflare account used for v0.7.2.
3. If this is your first deployment, create a free Cloudflare account.
4. Do not buy a domain.
5. Do not move the GitHub Pages site to Cloudflare.
6. Do not manually create a database or Durable Object.

Wrangler reads `multiplayer-server/wrangler.jsonc` and manages the included Durable Object classes during deployment.

## Part 4 — Open PowerShell in the correct folder

1. Open `v0.8.0 SERVER COPY` in File Explorer.
2. Open the `multiplayer-server` folder inside it.
3. Confirm that this folder contains:
   - `package.json`
   - `wrangler.jsonc`
   - a `src` folder
   - a `tests` folder
4. Click the File Explorer address bar at the top.
5. Type `powershell`.
6. Press Enter.

A blue or black PowerShell window should open in the `multiplayer-server` folder.

## Part 5 — Install and test the Worker

In that PowerShell window, type:

```powershell
npm install
```

Wait until the command finishes. Then type:

```powershell
npm test
```

Do not deploy if any test is red or says `fail`. Save the full error instead.

## Part 6 — Log Wrangler into Cloudflare

Type:

```powershell
npx wrangler login
```

Your browser should open a Cloudflare authorization page.

1. Choose the correct Cloudflare account.
2. Approve Wrangler.
3. Return to PowerShell.

If PowerShell says you are already logged in, continue.

## Part 7 — Deploy the v0.8.0 Worker

Type:

```powershell
npm run deploy
```

Wait until deployment finishes.

- If v0.7.2 was already deployed, Wrangler should update the same Worker and keep the same `workers.dev` address.
- If this is the first deployment, Cloudflare may ask you to create a `workers.dev` subdomain. Accept and choose a simple name.

Copy the final address. It resembles:

```text
https://massivecraft-wars-multiplayer.your-name.workers.dev
```

Do not copy `/api/health` as part of the saved Worker address.

## Part 8 — Verify the server before touching GitHub

Add `/api/health` to the address and open it in a browser. Example:

```text
https://massivecraft-wars-multiplayer.your-name.workers.dev/api/health
```

Continue only if the page contains all of these values:

```text
"ok":true
"protocolVersion":3
"quotaHardened":true
"spectators":true
"customArmies":true
```

If it still says protocol 2, the old Worker is still deployed. Return to the correct `multiplayer-server` folder and run `npm run deploy` again. Do not upload the new website until protocol 3 is visible.

## Part 9 — Connect a fresh installation to the Worker

Skip this part when using `massivecraft-wars-v0.8.0-upgrade.zip`; that package omits the config file so your existing GitHub value remains untouched.

For a fresh installation:

1. Open `v0.8.0 WEBSITE COPY`.
2. Open `js`.
3. Open `online`.
4. Right-click `config.js`.
5. Choose **Open with → Notepad**.
6. Find:

```js
export const MULTIPLAYER_SERVER_URL = "";
```

7. Put the Worker address between the quotation marks:

```js
export const MULTIPLAYER_SERVER_URL = "https://massivecraft-wars-multiplayer.your-name.workers.dev";
```

8. Do not include `/api/health`.
9. Do not add a slash after `.dev`.
10. Save the file.

The Worker address is public routing information, not a password.

## Part 10 — Upload the website to GitHub

1. Open `https://github.com/Poseidon50th/MassivecraftWargaming`.
2. Confirm you are at the repository root, where `index.html` is visible.
3. Click **Add file**.
4. Click **Upload files**.
5. Open `v0.8.0 WEBSITE COPY` in File Explorer.
6. Press `Ctrl+A` inside that folder.
7. Drag the selected **contents** onto GitHub.

Do not drag the outer `v0.8.0 WEBSITE COPY` folder. The new `index.html` must remain at the repository root.

Confirm the upload contains at least:

- `.github/workflows/ci.yml`
- `index.html`
- `multiplayer.html`
- `styles.css`
- `multiplayer.css`
- `js/data/armies.js`
- `js/ui/army-builder.js`
- `js/ai/roster.js`
- `js/online`
- `multiplayer-server`
- `assets`
- `package.json`
- `package-lock.json`
- `LICENSE`

Do not upload:

- the release ZIP
- `node_modules`
- `dist`
- `.wrangler`
- `.wrangler-dry-run`

For an upgrade, confirm GitHub is **not** replacing `js/online/config.js` with a blank file. The safe upgrade ZIP omits it.

Use this commit message:

```text
Release v0.8.0 spectators, custom armies, and tactical AI
```

Commit to `main`.

## Part 11 — Wait for GitHub

1. Open the repository’s **Actions** tab.
2. Wait for the test-and-build workflow to turn green.
3. Wait for the GitHub Pages deployment to turn green.
4. If either becomes red, open it and copy the complete red error before changing files.

Under **Settings → Pages**, the expected settings are:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

## Part 12 — Clear the old browser copy

Open:

```text
https://poseidon50th.github.io/MassivecraftWargaming/?v=0.8.0
```

Press `Ctrl+F5`. Confirm the page header says `v0.8.0`.

## Part 13 — Test single-player army selection

1. Stay on the main page.
2. Confirm the army builder lists all six unit types.
3. Confirm the 8 × 8 total says `16 / 16` by default.
4. Confirm Artillery cannot be increased above two.
5. Choose the 16 × 16 field.
6. Confirm the default changes to `32 / 32` and two Artillery.
7. Change several counts.
8. Choose a computer opponent.
9. Begin deployment.
10. Confirm your chosen reserve counts appear.

## Part 14 — Test host, guest, and spectator together

Use three independent browser windows:

1. In the normal window, open the multiplayer page.
2. Enter a host name.
3. Click **Create private room**.
4. Copy the **opponent link**.
5. Open a private/incognito window.
6. Paste the opponent link there.
7. Enter a different guest name.
8. Click **Accept invitation**.
9. Return to the host window.
10. Copy the separate **spectator link**.
11. Open another private window or a different browser profile.
12. Paste the spectator link.
13. Click **Activate spectator mode**.
14. Confirm the spectator can see the room but has no approval, placement, order, or resign controls.
15. As host, propose an 8 × 8 random battlefield.
16. Confirm the spectator can inspect it but cannot approve it.
17. As guest, approve the battlefield.
18. Confirm both players enter private army selection.
19. Give the host a mixed 16-unit army.
20. Give the guest a different legal army with two Artillery.
21. Lock only the host army.
22. Confirm the guest and spectator see that the host is ready but do not see the host distribution.
23. Lock the guest army.
24. Confirm alternating deployment begins.
25. Confirm the spectator sees both armies in the host orientation but cannot click to place anything.
26. Complete deployment.
27. Prepare and commit three host orders.
28. Confirm neither the guest nor spectator can see those orders.
29. Commit the guest orders.
30. Confirm the round resolves in all three windows.
31. Confirm the spectator dispatch says Host and Guest rather than Friendly and Enemy.
32. Refresh all three windows.
33. Confirm every window reconnects to the same room and state.

Repeat once on 16 × 16 before a large public announcement.

## What the two links mean

- **Opponent link:** private capability that can claim the guest seat. Send it only to the intended opponent.
- **Spectator link:** read-only capability that may be shared with multiple viewers. It cannot place units or send room actions.
- **Host address bar:** contains the host seat token. Never share the host browser’s address bar.

## Common problems

### “The multiplayer server is not connected yet”

The public repository’s `js/online/config.js` is blank or was overwritten. Restore the existing `workers.dev` address, commit the file, wait for Pages, and press `Ctrl+F5`.

### Health still says protocol 2

The new Worker did not deploy. Run `npm run deploy` from the v0.8.0 `multiplayer-server` folder and verify the account/name shown by Wrangler.

### Room creation works, but army selection fails

The website is newer than the Worker. Verify `/api/health` reports protocol 3 and `customArmies:true`.

### Spectator link opens as an opponent

The opponent link was copied by mistake. Return to the host room and use the field specifically labeled **Spectator invitation**.

### GitHub still shows v0.7.2

Wait for Pages to finish, open the `?v=0.8.0` address, and press `Ctrl+F5`. Also confirm `index.html` was uploaded to the repository root.

### New rooms are temporarily paused

The conservative daily safety limit was reached. Existing rooms continue. Wait until the counter resets at midnight UTC; do not delete the Worker or Durable Objects.

## Free-tier safeguards retained in v0.8.0

- Gameplay actions use hibernatable WebSockets.
- There is no continuous polling loop.
- Accepted actions write one room record.
- The expiration alarm is not rewritten after every action.
- Duplicate live action identifiers cannot execute twice.
- New-room creation defaults to 400 rooms per UTC day.
- One connection may create eight rooms per ten minutes.
- Invalid invitation attempts, action bursts, and oversized messages are limited.
- Existing rooms retain priority when new-room capacity is paused.

Spectators add live connections and synchronization messages but cannot create room actions. Outgoing broadcasts remain separated from incoming action accounting in the quota-conscious design.
