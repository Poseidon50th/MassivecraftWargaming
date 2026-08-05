# v0.7.2 “Illegal invocation” Hotfix

This repair is entirely in the GitHub Pages website. If the Cloudflare health page already shows `"ok":true`, `"protocolVersion":2`, and `"quotaHardened":true`, do **not** redeploy, rename, or delete the Worker or its Durable Objects.

## Safest update: use the small hotfix ZIP

1. Download and extract `massivecraft-wars-v0.7.2-website-hotfix.zip`.
2. Open the `Poseidon50th/MassivecraftWargaming` repository on GitHub.
3. Make sure you are at the repository root, where `index.html` is visible.
4. Click **Add file**, then **Upload files**.
5. Open the extracted hotfix folder and select **everything inside it**. Drag those contents onto GitHub. Do not drag the outer hotfix folder itself.
6. Before committing, confirm GitHub shows these important replacement paths:
   - `index.html`
   - `multiplayer.html`
   - `js/online/api-client.js`
   - `js/online/online-controller.js`
   - `package.json`
   - `tests/multiplayer-client.test.js`
   - `tests/verify-build.mjs`
7. Confirm that `js/online/config.js` is **not** among the uploaded files. The hotfix does not contain it and must leave your existing Worker address alone.
8. If `api-client.js` or `online-controller.js` appears at the repository root, cancel the upload and try again. They must remain inside `js/online`.
9. Use the commit message `Fix private-room Illegal invocation error (v0.7.2)`.
10. Commit directly to `main`.
11. Open the **Actions** tab and wait for the checks and Pages deployment to turn green.
12. Open `https://poseidon50th.github.io/MassivecraftWargaming/?v=0.7.2`.
13. Press `Ctrl+F5` once to force the repaired browser files to load.
14. Confirm the header says `v0.7.2`.
15. Open online battle and create a private room.

The small hotfix does not contain `js/online/config.js`, so it cannot erase the Cloudflare Worker address already connected to the website.

## Full release ZIP

`massivecraft-wars-v0.7.2.zip` is the clean complete release for archival use or a fresh installation. Its `js/online/config.js` is intentionally blank because a private Cloudflare deployment address cannot be built into a public generic release. Before uploading the full release, copy your existing Worker address into that file exactly as you did for v0.7.1.
