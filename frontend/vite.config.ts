import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API paths, sent to the backend while developing (npm run dev here and
// npm run dev in the repository root), so the login cookie stays same-origin
const apiPaths = ["/auth", "/movies", "/cinemas", "/screens", "/showTimes", "/bookings", "/payments", "/agent", "/health"];

// The deployment this build belongs to (Vercel sets the commit), compared
// with the server's X-App-Version to spot a tab running old code
const appVersion = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 12);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // The built app goes to the repository's public/ folder, which Vercel serves
  // as static files and Express serves when running elsewhere
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: Object.fromEntries(apiPaths.map((path) => [path, "http://localhost:5050"])),
  },
});
