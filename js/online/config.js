// After deploying multiplayer-server, paste the Worker URL between the quotes.
// Example: "https://massivecraft-wars-multiplayer.your-name.workers.dev"
export const MULTIPLAYER_SERVER_URL = "";

export function multiplayerServerUrl(locationObject = globalThis.location) {
  const localHostnames = new Set(["localhost", "127.0.0.1", "terminal.local"]);
  const localOverride = localHostnames.has(locationObject?.hostname)
    ? new URLSearchParams(locationObject.search).get("server")
    : null;
  return String(localOverride || MULTIPLAYER_SERVER_URL).trim().replace(/\/+$/, "");
}
