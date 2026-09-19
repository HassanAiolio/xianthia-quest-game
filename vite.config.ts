/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { xianthiaApi } from "./server/api";

export default defineConfig(({ mode }) => {
  // Empty prefix = load every variable, including server-only secrets (no VITE_ prefix).
  // They are handed to the API plugin and never reach the client bundle.
  const env = loadEnv(mode, __dirname, "");
  return {
    plugins: [react(), tailwindcss(), xianthiaApi(env, __dirname)],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { port: 5173, host: true },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    },
  };
});
