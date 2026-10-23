import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const headers = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' ws://localhost:5173; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'",
};
export default defineConfig({
  plugins: [react()],
  server: { headers },
  preview: { headers },
  test: { include: ["tests/**/*.test.js"] },
});
