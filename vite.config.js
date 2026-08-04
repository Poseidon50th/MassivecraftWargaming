import { defineConfig } from "vite";
import { cp } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "copy-game-images",
      async closeBundle() {
        await cp(resolve("assets"), resolve("dist/assets"), { recursive: true });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
