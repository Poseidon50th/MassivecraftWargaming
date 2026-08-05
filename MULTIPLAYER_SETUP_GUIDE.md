# Massivecraft’s Wars Multiplayer Setup Guide

This guide assumes you are using Windows and that the game will stay at:

`https://poseidon50th.github.io/MassivecraftWargaming/`

You only need to deploy the multiplayer server once. Ordinary players do **not** install anything, make accounts, or run commands. They continue opening the GitHub Pages link in a browser.

**Order matters:** deploy and check the Cloudflare server first. Paste its address into the website second. Upload the website to GitHub last. Do not publish the v0.7.1 website while an older server is still running.

## What you are setting up

The files have two halves:

1. **GitHub Pages** shows the board and buttons.
2. **Cloudflare Worker** connects the two players, keeps their orders secret, and resolves the round.

GitHub Pages cannot perform the second job by itself. Do not put passwords, Cloudflare tokens, or account credentials into the repository.

Cloudflare documents that Durable Objects are available on the Workers Free plan when using SQLite storage, which this project does. If a Free-plan daily limit is exceeded, that kind of operation fails until the limit resets rather than silently becoming unlimited. See [Cloudflare’s current Durable Objects pricing and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/).

v0.7.1 is deliberately conservative with that free allowance:

- game actions travel through hibernatable WebSockets instead of separate HTTP requests;
- there is no three-second polling loop;
- an accepted action stores the room once instead of storing the room and rewriting its alarm;
- one connection may create at most eight rooms in ten minutes;
- the server pauses new-room creation after 400 rooms in one UTC day, leaving capacity for matches already underway; and
- ordinary human play remains far below the per-room action-speed limit.

Do not increase those limits before observing real use. The 400-room safety cap still permits as many as 800 different players to begin matches in one day. It resets at midnight UTC.

---

## Part 1 — Put the release on your computer

1. Download `massivecraft-wars-v0.7.1.zip`.
2. Open your **Downloads** folder.
3. Right-click the ZIP.
4. Choose **Extract All…**.
5. Leave the suggested destination alone.
6. Click **Extract**.
7. Open the new `massivecraft-wars-v0.7.1` folder.
8. Confirm that you can see these items:

   - `index.html`
   - `multiplayer.html`
   - `js`
   - `multiplayer-server`
   - `LICENSE`

Do not work from inside the ZIP preview. Work from the extracted folder.

---

## Part 2 — Install Node.js if Windows does not have it

1. Open [the official Node.js download page](https://nodejs.org/en/download).
2. Download the current **LTS** Windows installer.
3. Open the installer.
4. Keep the normal choices selected.
5. Finish the installation.
6. Close any PowerShell or Command Prompt windows that were already open.

To check it:

1. Press the Windows key.
2. Type `PowerShell`.
3. Open **Windows PowerShell**.
4. Type this and press Enter:

   ```powershell
   node --version
   ```

5. Type this and press Enter:

   ```powershell
   npm --version
   ```

Both commands should print a version number. If Windows says a command is not recognized, restart the computer once and try again.

---

## Part 3 — Create a free Cloudflare account

1. Open [Cloudflare’s account page](https://dash.cloudflare.com/sign-up).
2. Create an account or sign into your existing account.
3. You do **not** need to move the GitHub Pages site to Cloudflare.
4. You do **not** need to buy a domain.
5. You do **not** need to enter Cloudflare credentials into any game file.

Cloudflare’s own Durable Objects guide lists a Cloudflare account and Node.js as the prerequisites. See [Cloudflare’s Durable Objects getting-started guide](https://developers.cloudflare.com/durable-objects/get-started/).

---

## Part 4 — Open PowerShell in the correct server folder

1. Return to the extracted `massivecraft-wars-v0.7.1` folder.
2. Open the `multiplayer-server` folder.
3. Click the File Explorer address bar at the top. The folder path should become highlighted.
4. Type exactly:

   ```text
   powershell
   ```

5. Press Enter.

A PowerShell window should open already pointed at the `multiplayer-server` folder.

To verify that it is the correct folder, type:

```powershell
dir
```

You should see `package.json`, `wrangler.jsonc`, `src`, and `tests`.

---

## Part 5 — Install the server’s deployment program

In that same PowerShell window, type:

```powershell
npm install
```

Press Enter and wait for it to finish. This installs Wrangler inside this server folder, following [Cloudflare’s recommendation to install Wrangler locally in each project](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

Warnings about packages or funding are not automatically failures. A failure normally ends with red text containing `npm ERR!`.

---

## Part 6 — Sign Wrangler into Cloudflare

In the same PowerShell window, type:

```powershell
npx wrangler login
```

Then:

1. Your normal browser should open a Cloudflare page.
2. Sign into Cloudflare there if asked.
3. Approve Wrangler’s access to your own Cloudflare account.
4. Return to PowerShell.

Do not copy a Cloudflare password, API token, or login code into the project. Wrangler keeps its own login outside the game folder.

---

## Part 7 — Deploy the multiplayer server

In the same PowerShell window, type:

```powershell
npm run deploy
```

Press Enter.

During the first deployment, Cloudflare may ask you to select your account or create a `workers.dev` subdomain. Choose your own account and accept a reasonable free subdomain.

The first v0.7.1 deployment creates two SQLite-backed Durable Object classes:

- `MatchRoom`, which holds one battle; and
- `RoomAdmission`, which protects new-room capacity.

That is expected. Do not delete either class and do not remove either migration from `wrangler.jsonc`.

When deployment succeeds, PowerShell prints a public address resembling:

```text
https://massivecraft-wars-multiplayer.your-subdomain.workers.dev
```

Copy that complete `https://…workers.dev` address. Do not add `/api/health` to the copy you will place in the game.

### Check the server before continuing

1. Paste the Worker address into a browser address bar.
2. Add `/api/health` to the end.

It should resemble:

```text
https://massivecraft-wars-multiplayer.your-subdomain.workers.dev/api/health
```

3. Press Enter.
4. A small JSON response should include all three of these pieces:

   ```text
   "ok":true
   "protocolVersion":2
   "quotaHardened":true
   ```

If you see all three, the correct v0.7.1 server is alive. If it says protocol version 1, stop: the old v0.7.0 Worker is still deployed.

---

## Part 8 — Connect the GitHub Pages game to that server

1. Return to the extracted `massivecraft-wars-v0.7.1` folder.
2. Open the `js` folder.
3. Open the `online` folder.
4. Right-click `config.js`.
5. Choose **Open with → Notepad**.
6. Find this line:

   ```js
   export const MULTIPLAYER_SERVER_URL = "";
   ```

7. Paste the Worker address between the quotation marks. For example:

   ```js
   export const MULTIPLAYER_SERVER_URL = "https://massivecraft-wars-multiplayer.your-subdomain.workers.dev";
   ```

8. Do not add a slash after `.dev`.
9. Save the file.
10. Close Notepad.

This address is public and is not a password. It is safe to place in the repository.

---

## Part 9 — Upload v0.7.1 to GitHub

Do this part only after Part 7 showed `"protocolVersion":2` and Part 8 saved the Worker address.

Upload the **contents** of the extracted `massivecraft-wars-v0.7.1` folder into the root of `Poseidon50th/MassivecraftWargaming`, replacing matching files as you did for the earlier releases.

Important items that must reach GitHub:

- `index.html`
- `multiplayer.html`
- `multiplayer.css`
- `js/online/`
- `multiplayer-server/`
- `MULTIPLAYER_SETUP_GUIDE.md`
- `MULTIPLAYER_ARCHITECTURE.md`
- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `README.md`
- `LICENSE`

Do **not** upload:

- the release ZIP itself;
- any `node_modules` folder;
- the `dist` folder;
- `.wrangler-dry-run`; or
- Cloudflare login files from somewhere else on the computer.

The provided `.gitignore` keeps those generated folders out when Git is used normally.

---

## Part 10 — Wait for both GitHub checks

1. Open the repository on GitHub.
2. Open the **Actions** tab.
3. Wait for **Test and build** to show a green check.
4. Wait for the Pages deployment to show a green check.
5. If either one is red, open it and copy the failure text before changing files.

The automated check installs and tests both the static game and the multiplayer Worker bundle.

---

## Part 11 — Perform the first real two-browser test

1. Open:

   `https://poseidon50th.github.io/MassivecraftWargaming/?v=0.7.1`

2. Confirm that the page says `v0.7.1`.
3. Click **Create or join an online battle**.
4. Enter a host display name.
5. Click **Create private room**.
6. Copy the private invitation link.
7. Open a private/incognito browser window.
8. Paste the invitation link there.
9. Enter a different guest display name.
10. Click **Accept invitation**.
11. On the host window, choose **The Narrow Field** and **Randomize**.
12. Click **Prepare proposal**.
13. On the guest window, inspect the board and click **Approve battlefield**.
14. Confirm that only the host can place the first unit.
15. Place one host unit.
16. Confirm that only the guest can place the next unit.
17. Place one guest unit.
18. Confirm that both connection badges say **Connected**.
19. Refresh both windows once.
20. Confirm that both return to the same room and the placed units remain.
21. Confirm that both connection badges return to **Connected** without repeatedly refreshing.
22. Finish alternating deployment.
23. On the host window, prepare three orders and click **Commit secret orders**.
24. Confirm that the guest sees only that the host is committed—not the host’s destinations or facing.
25. Commit the guest’s orders.
26. Confirm that both windows advance to the next round.
27. Confirm that both dispatches list:

   - friendly movements or rotations;
   - enemy movements or rotations;
   - friendly units destroyed and their squares;
   - enemy units destroyed and their squares; and
   - both remaining army totals.

28. Leave one window untouched for at least one minute. Confirm the page does not flash, reload, or repeatedly show connection messages.
29. Switch to another browser tab, then return. Confirm the current room state remains correct.
30. If a red **Reconnect** button appears, click it once and confirm the badge returns to **Connected**.

If all 30 checks work, the public multiplayer path is ready for players.

---

## Part 12 — Know where to look after release

You do not need to stare at a dashboard while people play. Check it after the first busy day and whenever players report a server problem.

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages**.
3. Open **massivecraft-wars-multiplayer**.
4. Open its metrics or observability view.
5. Look for request errors, Durable Object errors, and sudden spikes.
6. Do not copy player invitation links into a bug report.
7. If Cloudflare reports a daily-limit error, leave the Worker deployed. The limit resets at midnight UTC.
8. Ask affected players whether they were creating a new room or continuing an existing room; that difference identifies whether the admission safety cap or a Cloudflare account limit was reached.

The server intentionally returns a readable message when its own new-room safety cap is reached. It does not charge money or silently upgrade the account.

---

## How players use it

The host:

1. opens the normal GitHub Pages game;
2. opens Online Battle;
3. enters a display name;
4. creates a private room;
5. sends the invitation to exactly one opponent;
6. proposes the battlefield; and
7. deploys first after the guest approves it.

The guest:

1. opens the invitation link;
2. enters a display name;
3. reviews the host’s exact battlefield;
4. approves it or requests a different one; and
5. deploys second after approval.

Every Orders Phase is untimed. A player who commits first may withdraw those orders only while the opponent has not yet committed. Refreshing the page reconnects the same browser to its seat. Rooms expire after 30 days without a player action.

---

## Common problems

### “The multiplayer server is not connected yet”

`js/online/config.js` is still blank or the updated file did not reach GitHub. Paste the Worker address between the quotes, save, upload that file, wait for Pages, and hard-refresh.

### “This website is not allowed to use the multiplayer server”

The Worker checks the website origin. The supplied server already allows `https://poseidon50th.github.io`. If the game later moves to a different GitHub account or custom domain:

1. open `multiplayer-server/wrangler.jsonc`;
2. add the new origin to `ALLOWED_ORIGINS`, separated by a comma;
3. do not include a page path after the domain;
4. save; and
5. run `npm run deploy` again from `multiplayer-server`.

### `npm` or `npx` is not recognized

Install the Node.js LTS version, close PowerShell, reopen PowerShell in `multiplayer-server`, and try again.

### Cloudflare login did not finish

Run:

```powershell
npx wrangler login
```

again. Complete the Cloudflare browser approval, then rerun `npm run deploy`.

### The invitation says the seat was already claimed

That guest token has already named its guest. Create a new private room and send only the new invitation.

### The room expired

Create a new room. Expired room state is deliberately deleted after 30 days without a player action.

### “New rooms are paused for today”

The v0.7.1 safety budget reached 400 room creations since midnight UTC. Battles already in progress keep priority. Wait until after midnight UTC and create the room again. Do not delete the Worker or either Durable Object namespace.

### “Too many rooms were created from this connection”

The same internet connection attempted to create more than eight rooms in ten minutes. Wait ten full minutes, then try once. Existing invitations and matches are unaffected.

### The badge says “Reconnecting…”

1. Wait ten seconds.
2. If the red **Reconnect** button is visible, click it once.
3. If it still does not connect, refresh the page once.
4. If the invitation worked before, use the same browser and the same link; the seat token is stored there.
5. Do not create several replacement rooms while diagnosing one connection.

### GitHub Pages still shows the old version

Confirm the repository contains v0.7.1, wait for the Pages Action, open the `?v=0.7.1` link, and press `Ctrl+F5`.

### Server deployment works but GitHub Actions fails its Worker check

Open the failed Action and copy its exact red error text. Do not delete the Durable Object migration or rename `MatchRoom` while guessing at a fix.

---

## Updating later

For a future server update:

1. replace the old release files with the newer ones;
2. open PowerShell in `multiplayer-server`;
3. run `npm install`;
4. run `npm run deploy`;
5. open `/api/health` and confirm the new protocol/version information;
6. keep the same Worker address in `js/online/config.js` unless Cloudflare explicitly gives a different one; and
7. only then upload the matching website release to GitHub.

Do not delete the Worker between releases merely to update its code. Deletion also destroys the Durable Object namespace and existing rooms.

When upgrading from v0.7.0 specifically, deploy the v0.7.1 Worker first. Stored v0.7.0 rooms migrate when reopened, and the old website can continue using the retained HTTP route during the short deployment gap. After the v0.7.1 health check passes, upload the v0.7.1 website.
