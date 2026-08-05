import { defineConfig } from "vite";
import { cp, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { multiplayerTestPlugin } from "./tests/vite-multiplayer-plugin.mjs";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve("index.html"),
        multiplayer: resolve("multiplayer.html"),
      },
    },
  },
  plugins: [
    multiplayerTestPlugin(),
    {
      name: "copy-game-images",
      async closeBundle() {
        await cp(resolve("assets"), resolve("dist/assets"), { recursive: true });
        await Promise.all([
          "README.md",
          "MULTIPLAYER_SETUP_GUIDE.md",
          "MULTIPLAYER_ARCHITECTURE.md",
          "HOTFIX_INSTALL_INSTRUCTIONS.md",
          "LICENSE",
        ].map((filename) => copyFile(resolve(filename), resolve("dist", filename))));
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
